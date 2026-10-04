/**
 * The quality index: the tier of every dataset and field, the rule results behind them and a
 * plain-English explanation of each.
 *
 * Rules (docs/DATA-TIERS.md), with the default thresholds; the metric dictionary can change them
 * (`QualityOptions.rules`, from `src/metrics/quality.ts` through the analytics context):
 * - none: the dataset has no rows, or the field is blank in every row;
 * - silver: mapping confirmed, no blocking issues, at most 2% of rows with an import error, and
 *   at most 2% of rows with a reference that does not resolve;
 * - gold: silver, certified for this exact version, control totals within tolerance, and fresh;
 * - a field is capped at bronze when it is filled for under 95% of the rows it applies to, or
 *   when over 2% of its values are not recognized or were defaulted.
 *
 * `computeQuality` is pure and lazy: nothing is counted until it is asked for, and each dataset
 * is evaluated once per index. Indexes are memoized per (datasets, versions, …) identity.
 */
import { todayISO } from '@/lib/dates'
import type { ImportIssue } from '../import/types'
import { DATASET_KEYS, type DatasetKey, type Datasets, datasetDef, type ISODate } from '../schema'
import { resolveAsOf } from '../scope'
import { applicabilityOf, appliesTo, isFilled } from './applicability'
import { datasetOfRef, type FieldRef, fieldDefOf, parseFieldRef } from './fieldRef'
import { ERROR_CODES, INVALID_CODES, rowKeyOf } from './importSummary'
import {
  CONTROL_METRICS,
  checkReferences,
  DEFAULT_QUALITY_RULES,
  datesOutOfOrder,
  duplicateRows,
  type Freshness,
  freshness,
  type QualityRules,
  reconciles,
  SNAPSHOT_FRESHNESS,
} from './rules'
import {
  byWho,
  capFirst,
  intText,
  limitText,
  midSentence,
  pct1,
  pctAgainst,
  rowsText,
  shortDate,
} from './text'
import { TIER_LABEL, type Tier, tierRank } from './tier'
import type {
  DatasetQuality,
  DatasetVersion,
  FieldRowKind,
  FieldStats,
  Limiting,
  QualityIndex,
  RuleResult,
} from './types'
import { isUnrecognized } from './vocab'

export type { QualityRules } from './rules'
/** The default thresholds (the quality rules in force may differ; see `QualityRules`). */
export { MAX_ISSUE_RATE, MAX_PROBLEM_SHARE, MIN_COVERAGE } from './rules'

export type VersionMap = Partial<Record<DatasetKey, DatasetVersion | null>>
export type IssueMap = Partial<Record<DatasetKey, readonly ImportIssue[]>>

/** What your reference mappings changed, for explanations and drills. */
export interface ReferenceEffect {
  /** Rows changed per field. */
  changes: Partial<Record<FieldRef, number>>
  /** Indexes of the changed rows per field. */
  rows?: Partial<Record<FieldRef, readonly number[]>>
  /** Who made the latest change to each field ('' or missing = you). */
  by?: Partial<Record<FieldRef, string | null>>
  /**
   * When the latest change to each field was made (ISO date-time). A change made after the
   * dataset was certified caps the field at silver: the certified numbers no longer stand as is.
   */
  at?: Partial<Record<FieldRef, string>>
}

export interface QualityOptions {
  /** The as-of date for freshness and control totals; defaults to the latest date in the data. */
  asOf?: ISODate
  reference?: ReferenceEffect | null
  /**
   * The thresholds in force (`qualityRulesOf(ctx.metrics)`); the defaults when not given. Pass the
   * same object for the same values so the index is reused.
   */
  rules?: QualityRules
}

type Row = Record<string, unknown>

interface DatasetEval {
  tier: Tier
  rules: RuleResult[]
  issueRate: number | null
  freshness: Freshness
}

/** The import error share in words: one decimal, "<0.1%" for a handful, exact near the limit. */
function issueShare(rate: number, limit: number): string {
  if (rate > 0 && rate < 0.0005) return '<0.1%'
  return Math.abs(rate - limit) < 0.01 ? pctAgainst(rate, limit, 'max') : pct1(rate)
}

/**
 * Why a field falls short of silver on its own, whatever its dataset's tier: filled for under 95%
 * of the rows it applies to (unless blanks are normal), or over 2% of its values not recognized or
 * defaulted. Null when it meets both. The text is the field's cap reason once its dataset is silver.
 */
export function fieldShortfall(
  s: Pick<FieldStats, 'label' | 'coverage' | 'problemRate' | 'blankOk' | 'scope'>,
  rules: Pick<QualityRules, 'minCoverage' | 'maxProblemShare'> = DEFAULT_QUALITY_RULES,
): { kind: 'coverage' | 'values'; text: string } | null {
  const { minCoverage, maxProblemShare } = rules
  if (!s.blankOk && s.coverage != null && s.coverage < minCoverage) {
    const scope = s.scope ? ` for ${midSentence(s.scope)}` : ''
    return {
      kind: 'coverage',
      text: `${s.label} is ${pctAgainst(s.coverage, minCoverage, 'min')} filled${scope}; silver needs ${limitText(minCoverage)}.`,
    }
  }
  if (s.problemRate != null && s.problemRate > maxProblemShare)
    return {
      kind: 'values',
      text: `${pctAgainst(s.problemRate, maxProblemShare, 'max')} of ${midSentence(s.label)} values are not recognized or defaulted; silver allows ${limitText(maxProblemShare)}.`,
    }
  return null
}

const SNAPSHOT_FRESHNESS_WHATS = new Set(Object.values(SNAPSHOT_FRESHNESS).map((s) => s.what))

/**
 * Of two fields at the same tier, whether `a` explains that tier better than `b`: a field with a
 * cap reason first, then the lowest fill (blanks that are normal do not count), then the most
 * values not recognized or defaulted, then a field whose blanks are a gap over one whose blanks
 * are normal (its raw fill would read as missing data). On a full tie the field declared first
 * stays.
 */
export function explainsBetter(
  a: Pick<FieldStats, 'capReason' | 'coverage' | 'problemRate' | 'blankOk'>,
  b: Pick<FieldStats, 'capReason' | 'coverage' | 'problemRate' | 'blankOk'>,
): boolean {
  if (!!a.capReason !== !!b.capReason) return !!a.capReason
  const fill = (s: typeof a) => (s.blankOk ? 1 : (s.coverage ?? 1))
  if (fill(a) !== fill(b)) return fill(a) < fill(b)
  const problems = (s: typeof a) => s.problemRate ?? 0
  if (problems(a) !== problems(b)) return problems(a) > problems(b)
  return !a.blankOk && b.blankOk
}

const SILVER_ORDER: RuleResult['id'][] = [
  'has-rows',
  'mapping-confirmed',
  'no-blocking',
  'issue-rate',
  'references',
]
const GOLD_ORDER: RuleResult['id'][] = ['certified', 'control-totals', 'fresh']

function rule(
  id: RuleResult['id'],
  label: string,
  gate: RuleResult['gate'],
  pass: boolean,
  detail: string,
  rows: number[] = [],
  count = rows.length,
): RuleResult {
  return { id, label, gate, pass, detail, rows: pass ? [] : rows, count: pass ? 0 : count }
}

/* ───────────── memo ───────────── */

interface MemoEntry {
  versions: VersionMap
  issues: IssueMap | undefined
  asOf: ISODate | undefined
  reference: ReferenceEffect | null | undefined
  rules: QualityRules | undefined
  index: QualityIndex
}
const memo = new WeakMap<Datasets, MemoEntry[]>()
const MEMO_SIZE = 4

/**
 * Build the quality index for loaded datasets (after reference mappings) and their versions.
 * `importIssues` (the import logs, when loaded) lets drills reach rows behind import-time issues.
 */
export function computeQuality(
  datasets: Datasets,
  versions: VersionMap,
  importIssues?: IssueMap,
  opts: QualityOptions = {},
): QualityIndex {
  const list = memo.get(datasets) ?? []
  const hit = list.find(
    (e) =>
      e.versions === versions &&
      e.issues === importIssues &&
      e.asOf === opts.asOf &&
      e.reference === opts.reference &&
      e.rules === opts.rules,
  )
  if (hit) return hit.index
  const index = buildIndex(datasets, versions, importIssues, opts)
  list.unshift({
    versions,
    issues: importIssues,
    asOf: opts.asOf,
    reference: opts.reference,
    rules: opts.rules,
    index,
  })
  if (list.length > MEMO_SIZE) list.length = MEMO_SIZE
  memo.set(datasets, list)
  return index
}

function buildIndex(
  data: Datasets,
  versions: VersionMap,
  importIssues: IssueMap | undefined,
  opts: QualityOptions,
): QualityIndex {
  const R = opts.rules ?? DEFAULT_QUALITY_RULES
  const limit = limitText(R.maxProblemShare)
  let asOfCache: ISODate | null = opts.asOf ?? null
  const asOf = () => {
    asOfCache ??= resolveAsOf(data, todayISO())
    return asOfCache
  }
  const refYear = () => asOf().slice(0, 4)
  /** The date the loaded data itself describes, whatever the as-of override. */
  let dataAsOfCache: ISODate | null = null
  const dataAsOf = () => {
    dataAsOfCache ??= resolveAsOf(data, todayISO())
    return dataAsOfCache
  }
  const rowsOf = (key: DatasetKey) => data[key] as unknown as readonly Row[]
  const versionOf = (key: DatasetKey): DatasetVersion | null => versions[key] ?? null
  const datasetEvals = new Map<DatasetKey, DatasetEval>()
  const infoRules = new Map<DatasetKey, RuleResult[]>()
  const fieldCache = new Map<DatasetKey, Map<string, FieldStats>>()
  const idIndex = new Map<DatasetKey, Map<string, number>>()

  /** Row index by the importer's row key, for mapping import issues onto loaded rows. */
  const indexById = (key: DatasetKey) => {
    let m = idIndex.get(key)
    if (!m) {
      m = new Map()
      rowsOf(key).forEach((r, i) => {
        const k = rowKeyOf(key, r)
        if (k != null && !m!.has(k)) m!.set(k, i)
      })
      idIndex.set(key, m)
    }
    return m
  }
  const issueRows = (key: DatasetKey, test: (i: ImportIssue) => boolean): number[] => {
    const issues = importIssues?.[key]
    if (!issues?.length) return []
    const ids = indexById(key)
    const out = new Set<number>()
    for (const i of issues) {
      if (!i.id || !test(i)) continue
      const at = ids.get(i.id)
      if (at != null) out.add(at)
    }
    return [...out].sort((a, b) => a - b)
  }

  /* ───────────── datasets ───────────── */

  const label = (key: DatasetKey) => datasetDef(key).label

  function evalDataset(key: DatasetKey): DatasetEval {
    const cached = datasetEvals.get(key)
    if (cached) return cached
    const rows = rowsOf(key)
    const v = versionOf(key)
    const rules: RuleResult[] = []
    if (!rows.length) {
      rules.push(rule('has-rows', 'Rows loaded', 'silver', false, `${label(key)} has no rows loaded.`))
      const out: DatasetEval = {
        tier: 'none',
        rules,
        issueRate: null,
        freshness: freshness(key, rows, asOf(), null, R.freshDays[key]),
      }
      datasetEvals.set(key, out)
      return out
    }
    rules.push(rule('has-rows', 'Rows loaded', 'silver', true, `${rowsText(rows.length)} loaded.`))

    const confirmedAt = v?.mappingConfirmedAt ?? null
    rules.push(
      rule(
        'mapping-confirmed',
        'Mapping confirmed',
        'silver',
        !!confirmedAt,
        confirmedAt
          ? `Mapping confirmed ${shortDate(confirmedAt, refYear())} by ${byWho(v?.mappingConfirmedBy)}.`
          : 'The column mapping has not been reviewed yet.',
      ),
    )

    const blocking = v?.issues.blocking ?? 0
    rules.push(
      rule(
        'no-blocking',
        'No blocking issues',
        'silver',
        blocking === 0,
        blocking === 0
          ? 'No blocking issues.'
          : `${intText(blocking)} blocking ${blocking === 1 ? 'issue remains' : 'issues remain'}.`,
        [],
        blocking,
      ),
    )

    const rowsIn = v?.issues.rowsIn ?? 0
    const errors = v?.issues.rowsWithErrors ?? 0
    const issueRate = v && rowsIn > 0 ? errors / rowsIn : null
    const rateOk = issueRate == null || issueRate <= R.maxProblemShare
    rules.push(
      rule(
        'issue-rate',
        `Issue rate within ${limit}`,
        'silver',
        rateOk,
        issueRate == null
          ? 'No import errors are logged.'
          : errors === 0
            ? `No rows had an import error (${intText(rowsIn)} read).`
            : `${issueShare(issueRate, R.maxProblemShare)} of rows (${intText(errors)} of ${intText(rowsIn)}) had an import error; ${limit} is allowed.`,
        rateOk ? [] : issueRows(key, (i) => i.row > 0 && ERROR_CODES.has(i.code)),
        errors,
      ),
    )

    const refs = checkReferences(key, data)
    if (!refs)
      rules.push(
        rule('references', 'References resolve', 'silver', true, 'No references to other data to check.'),
      )
    else {
      const target = label(refs.link.target)
      const share = refs.withRef ? refs.rows.length / refs.withRef : 0
      const pass = refs.withRef === 0 || (!refs.targetEmpty && share <= R.maxProblemShare)
      rules.push(
        rule(
          'references',
          'References resolve',
          'silver',
          pass,
          refs.targetEmpty && refs.withRef > 0
            ? `${target} has no rows, so references to it can't be checked.`
            : refs.rows.length === 0
              ? `Every reference to ${target} resolves.`
              : `${pctAgainst(share, R.maxProblemShare, 'max')} of rows (${intText(refs.rows.length)}) refer to records that are not in ${target}${pass ? `, within the ${limit} allowed` : ''}.`,
          refs.rows,
        ),
      )
    }

    const cert = v?.certification ?? null
    const certified = !!cert && !!v && cert.versionId === v.versionId
    rules.push(
      rule(
        'certified',
        'Certified for this version',
        'gold',
        certified,
        certified
          ? `Certified ${shortDate(cert.at, refYear())} by ${byWho(cert.by)}.`
          : cert
            ? 'Certified for an earlier version; this version is not certified.'
            : 'Not certified.',
      ),
    )

    const totals = certified ? (cert.controlTotals ?? []) : []
    const failing = totals.filter((t) => {
      const actual = CONTROL_METRICS[t.metric]?.compute(data, key, cert?.asOf ?? asOf()) ?? null
      return !reconciles(t, actual, R.tolerance)
    })
    rules.push(
      rule(
        'control-totals',
        'Control totals reconcile',
        'gold',
        failing.length === 0,
        !totals.length
          ? 'No control totals were given.'
          : failing.length === 0
            ? `${intText(totals.length)} control ${totals.length === 1 ? 'total reconciles' : 'totals reconcile'}.`
            : `${failing.map((t) => t.label).join(', ')} ${failing.length === 1 ? 'does' : 'do'} not reconcile.`,
        [],
        failing.length,
      ),
    )

    // A snapshot (a pay extract) is as current as the day it was taken: its load date, or for
    // the generated sample the date the sample describes.
    const snapshot = SNAPSHOT_FRESHNESS[key]
      ? (v?.importedAt?.slice(0, 10) ?? (v?.source === 'sample' ? dataAsOf() : null))
      : null
    const fresh = freshness(key, rows, asOf(), snapshot, R.freshDays[key])
    rules.push(rule('fresh', 'Fresh', 'gold', fresh.fresh, freshDetail(fresh)))

    const silver = rules.filter((r) => r.gate === 'silver').every((r) => r.pass)
    const gold = silver && rules.filter((r) => r.gate === 'gold').every((r) => r.pass)
    const out: DatasetEval = {
      tier: gold ? 'gold' : silver ? 'silver' : 'bronze',
      rules,
      issueRate,
      freshness: fresh,
    }
    datasetEvals.set(key, out)
    return out
  }

  /** The freshness rule in words. */
  function freshDetail(fresh: Freshness): string {
    if (fresh.what == null) return 'No event dates to judge freshness by.'
    if (fresh.latest == null)
      return SNAPSHOT_FRESHNESS_WHATS.has(fresh.what)
        ? `Nothing says when the ${fresh.what} was taken.`
        : `No ${fresh.what} is dated on or before ${shortDate(asOf())}.`
    const limit = fresh.fresh ? '' : `; ${intText(fresh.maxDays ?? 0)} d is the limit`
    if (fresh.latest > asOf())
      return `The ${fresh.what} is dated ${shortDate(fresh.latest, refYear())}, after the as-of date.`
    return `The latest ${fresh.what} is dated ${shortDate(fresh.latest, refYear())}, ${intText(fresh.ageDays ?? 0)} d before the as-of date${limit}.`
  }

  function info(key: DatasetKey): RuleResult[] {
    const cached = infoRules.get(key)
    if (cached) return cached
    const rows = rowsOf(key)
    const out: RuleResult[] = []
    if (rows.length) {
      const order = datesOutOfOrder(key, rows)
      out.push(
        rule(
          'dates-in-order',
          'Dates in order',
          null,
          order.length === 0,
          order.length === 0
            ? 'Dates are in order.'
            : `${rowsText(order.length)} ${order.length === 1 ? 'has' : 'have'} a later step dated before an earlier one.`,
          order,
        ),
      )
      const dups = duplicateRows(key, rows)
      const keyLabel = datasetDef(key)
        .rowKey.map((k) => datasetDef(key).fields.find((f) => f.key === k)?.label ?? k)
        .join(' + ')
      out.push(
        rule(
          'no-duplicates',
          'No duplicates',
          null,
          dups.length === 0,
          dups.length === 0
            ? `Every ${midSentence(keyLabel)} is unique.`
            : `${rowsText(dups.length)} repeat ${dups.length === 1 ? 'an' : 'the'} ${midSentence(keyLabel)} of an earlier row.`,
          dups,
        ),
      )
    }
    infoRules.set(key, out)
    return out
  }

  /* ───────────── fields ───────────── */

  function datasetFields(key: DatasetKey): Map<string, FieldStats> {
    const cached = fieldCache.get(key)
    if (cached) return cached
    const rows = rowsOf(key)
    const def = datasetDef(key)
    const v = versionOf(key)
    const dsTier = evalDataset(key).tier
    const out = new Map<string, FieldStats>()
    for (const f of def.fields) {
      const ref = `${key}.${f.key}` as FieldRef
      const rule = applicabilityOf(key, f.key)
      const applies = appliesTo(key, f.key, rows)
      let applicable = 0
      let filled = 0
      let filledAnywhere = 0
      let unrecognized = 0
      for (const r of rows) {
        const val = r[f.key]
        const ok = isFilled(val)
        if (ok) filledAnywhere++
        if (applies && !applies(r)) continue
        applicable++
        if (!ok) continue
        filled++
        if (isUnrecognized(ref, val)) unrecognized++
      }
      const logged = v?.issues.invalidByField[f.key] ?? 0
      const invalid = unrecognized + logged
      // The importer left those values blank, so their rows count as blank too: exactly, from the
      // import log when it is loaded, otherwise as many as there are blanks.
      const invalidBlank = !logged
        ? 0
        : importIssues?.[key]?.length
          ? blankLogged(key, f.key, rows, applies)
          : Math.min(applicable - filled, logged)
      const defaulted = Math.min(filled, v?.issues.defaultedByField[f.key] ?? 0)
      const coverage = applicable ? filled / applicable : null
      const problemRate = applicable ? Math.min(1, (invalid + defaulted) / applicable) : null
      const blankOk = !!rule?.blankOk
      let tier: Tier = dsTier
      let capReason: string | null = null
      let capKind: FieldStats['capKind'] = null
      const remapped = opts.reference?.changes[ref] ?? 0
      if (dsTier === 'none' || filledAnywhere === 0) tier = 'none'
      else if (tierRank(dsTier) >= tierRank('silver')) {
        const short = fieldShortfall(
          { label: f.label, coverage, problemRate, blankOk, scope: rule?.scope ?? null },
          R,
        )
        if (short) {
          capReason = short.text
          capKind = short.kind
          tier = 'bronze'
        } else if (dsTier === 'gold' && remapped > 0) {
          // The certification stands for the numbers as they were; a later local remap does not.
          const cert = v?.certification
          const at = opts.reference?.at?.[ref]
          if (cert && at && at > cert.at) {
            tier = 'silver'
            capKind = 'remapped'
            capReason = `${f.label} remapped by ${byWho(opts.reference?.by?.[ref])} for ${rowsText(remapped)} after certification; gold needs a new certification.`
          }
        }
      }
      out.set(f.key, {
        ref,
        label: f.label,
        rows: rows.length,
        applicableRows: applicable,
        filled,
        blank: applicable - filled,
        coverage,
        invalid,
        invalidBlank,
        defaulted,
        problemRate,
        scope: rule?.scope ?? null,
        blankOk,
        remapped,
        tier,
        capReason,
        capKind,
      })
    }
    fieldCache.set(key, out)
    return out
  }

  /** Blank rows the field applies to that the import log names as holding a value not recognized. */
  function blankLogged(
    key: DatasetKey,
    field: string,
    rows: readonly Row[],
    applies: ((row: object) => boolean) | null,
  ): number {
    let n = 0
    for (const i of issueRows(key, (x) => x.field === field && INVALID_CODES.has(x.code) && x.row > 0)) {
      const r = rows[i]
      if (r && (!applies || applies(r)) && !isFilled(r[field])) n++
    }
    return n
  }

  function unknownField(ref: string): FieldStats {
    const key = datasetOfRef(ref)
    return {
      ref: ref as FieldRef,
      label: ref,
      rows: key ? rowsOf(key).length : 0,
      applicableRows: 0,
      filled: 0,
      blank: 0,
      coverage: null,
      invalid: 0,
      defaulted: 0,
      problemRate: null,
      scope: null,
      blankOk: false,
      remapped: 0,
      tier: 'none',
      capReason: null,
    }
  }

  const fieldStats = (ref: FieldRef): FieldStats => {
    const p = parseFieldRef(ref)
    if (!p) return unknownField(ref)
    return datasetFields(p.dataset).get(p.field) ?? unknownField(ref)
  }

  /* ───────────── explanations ───────────── */

  function datasetPhrase(key: DatasetKey): string {
    const ev = evalDataset(key)
    const v = versionOf(key)
    const L = label(key)
    if (ev.tier === 'none') return `${L} has no rows loaded`
    const cert = v?.certification
    if (ev.tier === 'gold' && cert)
      return `${L} certified ${shortDate(cert.at, refYear())} by ${byWho(cert.by)}`
    const confirmed = v?.mappingConfirmedAt
      ? `${L} mapping confirmed ${shortDate(v.mappingConfirmedAt, refYear())} by ${byWho(v.mappingConfirmedBy)}`
      : null
    if (ev.tier === 'silver') {
      const gold = ev.rules.filter((r) => r.gate === 'gold' && !r.pass)
      const why = gold.find((r) => r.id === 'certified')
        ? cert
          ? 'certified for an earlier version only'
          : 'not certified'
        : gold.find((r) => r.id === 'control-totals')
          ? 'certified, but control totals do not reconcile'
          : 'certified, but the data is not fresh'
      return `${confirmed}; ${why}`
    }
    if (!confirmed) return `${L} mapping not yet confirmed`
    const failing = ev.rules.find((r) => r.gate === 'silver' && !r.pass)
    return failing
      ? `${confirmed}, but ${failing.detail.charAt(0).toLowerCase()}${failing.detail.slice(1).replace(/\.$/, '')}`
      : confirmed
  }

  function explainDataset(key: DatasetKey): string {
    const ev = evalDataset(key)
    return `${TIER_LABEL[ev.tier]}: ${datasetPhrase(key)}.`
  }

  function explainField(ref: FieldRef): string {
    const p = parseFieldRef(ref)
    if (!p) return `No data: ${ref} is not a field Census knows.`
    const s = fieldStats(ref)
    const key = p.dataset
    const def = fieldDefOf(ref)
    const fieldLabel = def?.label ?? p.field
    const ev = evalDataset(key)
    if (ev.tier === 'none') return `No data: ${label(key)} has no rows loaded.`
    const v = versionOf(key)
    if (s.tier === 'none') {
      const notInFile = !!v && Object.hasOwn(v.mapping, p.field) && v.mapping[p.field].header == null
      return notInFile
        ? `No data: ${label(key)} had no column for ${midSentence(fieldLabel)}.`
        : `No data: ${fieldLabel} is blank in every row of ${label(key)}.`
    }
    const parts = [`${TIER_LABEL[s.tier]}: ${datasetPhrase(key)}.`]
    if (s.capReason) parts.push(s.capReason)
    else if (s.coverage != null) {
      const scope = s.scope ? ` for ${midSentence(s.scope)}` : ''
      parts.push(`${fieldLabel} is ${pctAgainst(s.coverage, R.minCoverage, 'min')} filled${scope}.`)
      if (s.problemRate != null && s.invalid + s.defaulted > 0)
        parts.push(
          `${pctAgainst(s.problemRate, R.maxProblemShare, 'max')} of values are not recognized or defaulted.`,
        )
    }
    // A remap after certification is already the cap reason, with who made it.
    if (s.remapped > 0 && s.capKind !== 'remapped')
      parts.push(
        `${capFirst(midSentence(fieldLabel))} remapped by ${byWho(opts.reference?.by?.[ref])} for ${rowsText(s.remapped)}.`,
      )
    return parts.join(' ')
  }

  /* ───────────── lineage ───────────── */

  function limitingOf(uses: readonly FieldRef[] | undefined, fallback: readonly DatasetKey[]): Limiting {
    let best: Limiting | null = null
    if (uses?.length) {
      let bestStats: FieldStats | null = null
      for (const ref of uses) {
        const s = fieldStats(ref)
        const lower = !best || tierRank(s.tier) < tierRank(best.tier)
        const tie = !!best && !!bestStats && s.tier === best.tier && explainsBetter(s, bestStats)
        if (lower || tie) {
          best = { tier: s.tier, dataset: datasetOfRef(ref), ref }
          bestStats = s
        }
      }
      return best as Limiting
    }
    for (const key of fallback) {
      const t = evalDataset(key).tier
      if (!best || tierRank(t) < tierRank(best.tier)) best = { tier: t, dataset: key, ref: null }
    }
    return best ?? { tier: 'bronze', dataset: null, ref: null }
  }

  function fieldRows(ref: FieldRef, kind: FieldRowKind): number[] {
    const p = parseFieldRef(ref)
    if (!p) return []
    const key = p.dataset
    const rows = rowsOf(key)
    if (kind === 'remapped') return [...(opts.reference?.rows?.[ref] ?? [])]
    const applies = appliesTo(key, p.field, rows)
    const out: number[] = []
    if (kind === 'applicable' || kind === 'filled' || kind === 'blank') {
      rows.forEach((r, i) => {
        if (applies && !applies(r)) return
        const ok = isFilled(r[p.field])
        if (kind === 'applicable' || (kind === 'filled' && ok) || (kind === 'blank' && !ok)) out.push(i)
      })
      return out
    }
    if (kind === 'invalid') {
      const fromImport = new Set(
        issueRows(key, (i) => i.field === p.field && INVALID_CODES.has(i.code) && i.row > 0),
      )
      rows.forEach((r, i) => {
        if (fromImport.has(i) || (isFilled(r[p.field]) && isUnrecognized(ref, r[p.field]))) out.push(i)
      })
      return out
    }
    // Defaulted: rows the import log names, or every filled row when the file had no column.
    const logged = issueRows(key, (i) => i.field === p.field && i.code === 'defaulted' && i.row > 0)
    if (logged.length) return logged.filter((i) => isFilled(rows[i][p.field]))
    const v = versionOf(key)
    const defaulted = v?.issues.defaultedByField[p.field] ?? 0
    if (defaulted > 0 && v && Object.hasOwn(v.mapping, p.field) && v.mapping[p.field].header == null)
      rows.forEach((r, i) => {
        if (isFilled(r[p.field])) out.push(i)
      })
    return out
  }

  const index: QualityIndex = {
    rules: R,
    datasetTier: (key) => evalDataset(key).tier,
    fieldTier: (ref) => fieldStats(ref).tier,
    fieldStats,
    explain: (ref) =>
      (DATASET_KEYS as readonly string[]).includes(ref)
        ? explainDataset(ref as DatasetKey)
        : explainField(ref as FieldRef),
    tierOf: (uses, fallback) => limitingOf(uses, fallback).tier,
    limitingOf,
    explainOf(uses, fallback) {
      const l = limitingOf(uses, fallback)
      if (l.ref) return explainField(l.ref)
      if (l.dataset) return explainDataset(l.dataset)
      return 'Bronze: this number names no data, so it is treated as raw.'
    },
    checks: (key) => {
      const ev = evalDataset(key)
      const byId = (ids: RuleResult['id'][]) => ids.flatMap((id) => ev.rules.filter((r) => r.id === id))
      return [...byId(SILVER_ORDER), ...byId(GOLD_ORDER), ...info(key)]
    },
    dataset(key): DatasetQuality {
      const ev = evalDataset(key)
      const next = ev.tier === 'bronze' ? 'silver' : ev.tier === 'silver' ? 'gold' : null
      return {
        key,
        label: label(key),
        tier: ev.tier,
        rows: rowsOf(key).length,
        version: versionOf(key),
        issueRate: ev.issueRate,
        freshness: ev.freshness,
        rules: index.checks(key),
        missing: next ? ev.rules.filter((r) => r.gate === next && !r.pass).map((r) => r.label) : [],
      }
    },
    fields: (key) => [...datasetFields(key).values()],
    fieldRows,
  }
  return index
}
