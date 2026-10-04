/**
 * Health checks for one loaded dataset: is it there, are the fields the views need filled, do
 * its people and requisitions resolve, and does it reach the as-of date. Each check is one plain
 * sentence with the number in it.
 */
import type { Severity } from '@/components/types'
import { fieldShortfall } from '@/data/quality/compute'
import { FRESHNESS, type Link, LINKS as QUALITY_LINKS } from '@/data/quality/rules'
import type { QualityIndex } from '@/data/quality/types'
import { type DatasetKey, type Datasets, datasetDef, type ISODate } from '@/data/schema'
import type { SourceMeta } from '@/data/store'
import { daysBetween, formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { type DatasetCoverage, type FieldCoverage, type FieldFills, fieldRecords } from './coverage'

export type CheckKind =
  | 'empty'
  | 'empty-field'
  | 'thin-field'
  | 'metric-field'
  | 'unlinked'
  | 'stale'
  | 'import-warnings'
  /** From the quality index: import errors, blocking issues and the rules with no check here. */
  | 'quality-rule'
  /** From the quality index: a field whose fill or values cap its tier. */
  | 'field-tier'

/** Which loaded rows a check is about, so its number can open them (`checkRecords`). */
export type CheckSelect =
  /** Rows the field applies to that hold no value. */
  | { by: 'blank'; field: string }
  /** Every row: the field was not in the file, so each one holds the importer's default. */
  | { by: 'defaulted'; field: string }
  /** Rows with a reference that does not resolve in the linked dataset. */
  | { by: 'unlinked' }

export interface CheckRecords {
  select: CheckSelect
  /** How many rows `checkRecords` returns for this check. */
  count: number
  /** The number in the check's text that stands for those rows, or null when the text has none. */
  figure: string | null
}

export interface DatasetCheck {
  kind: CheckKind
  severity: Exclude<Severity, 'good'>
  text: string
  /** Rows or fields the check is about, for sorting and exports. */
  count: number
  /** The loaded rows behind the check, when it is about rows that are loaded. */
  records?: CheckRecords
}

/** Below this share a required or recommended field is called out as thinly filled. */
export const THIN_FIELD = 0.8
/** Above this share of unresolved references the check is a warning rather than a note. */
const UNLINKED_WARNING = 0.02

const SEVERITY_ORDER: Record<DatasetCheck['severity'], number> = { critical: 0, warning: 1, info: 2 }

export type { Link }

/**
 * References to other datasets: field → the dataset and key it must resolve in. The quality rule's
 * own list (`@/data/quality`), so the checks here and the tier never disagree, without the links of
 * a dataset to itself (an employee's manager): an upload's preview can't check those against the
 * roster it replaces. The quality index checks them, and `qualityChecks` reports them.
 */
export const LINKS: Partial<Record<DatasetKey, Link>> = Object.fromEntries(
  Object.entries(QUALITY_LINKS).filter(([key, link]) => link && link.target !== key),
)

export const TARGET_NOUN: Partial<Record<DatasetKey, string>> = {
  employees: 'people who are not in Employees',
  requisitions: 'requisitions that are not in Requisitions',
}

type Row = Record<string, unknown>

const listLabels = (labels: string[]): string =>
  labels.length <= 1
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`

const rowsWord = (n: number) => (n === 1 ? 'row' : 'rows')

/** "45 days" under two months, otherwise "4 months". */
export function ageText(days: number): string {
  if (days < 60) return `${fmt(days, 'int')} ${days === 1 ? 'day' : 'days'}`
  const months = Math.round(days / 30.44)
  return `${fmt(months, 'int')} months`
}

/** Rows with at least one reference that does not resolve in the target dataset. */
export function unlinkedRows(
  key: DatasetKey,
  data: Datasets,
): { rows: number; total: number; withRef: number } | null {
  return countUnlinked(key, data[key] as readonly object[], data)
}

/**
 * For rows of dataset `key`: the references in a row that do not resolve in the target dataset
 * loaded in `data` (empty when they all do). With nothing loaded to link to, nothing is called
 * missing. Null when the dataset links to nothing.
 */
export function missingRefs(key: DatasetKey, data: Datasets): ((row: object) => string[]) | null {
  const link = LINKS[key]
  if (!link) return null
  const targetRows = data[link.target] as unknown as readonly Row[]
  if (!targetRows.length) return () => []
  const ids = new Set<unknown>()
  for (const t of targetRows) ids.add(t[link.targetKey])
  return (row) => {
    const out: string[] = []
    for (const f of link.fields) {
      const v = (row as Row)[f]
      if (v != null && v !== '' && !ids.has(v)) out.push(String(v))
    }
    return out
  }
}

/**
 * Of `candidates` (rows of dataset `key`, loaded or about to be), how many hold a reference that
 * does not resolve in the target dataset loaded in `data`. Null when the dataset links to nothing.
 */
export function countUnlinked(
  key: DatasetKey,
  candidates: readonly object[],
  data: Datasets,
): { rows: number; total: number; withRef: number } | null {
  const link = LINKS[key]
  const missing = missingRefs(key, data)
  if (!link || !missing) return null
  let n = 0
  let withRef = 0
  for (const r of candidates as readonly Row[]) {
    if (link.fields.some((f) => r[f] != null && r[f] !== '')) withRef++
    if (missing(r).length) n++
  }
  return { rows: n, total: candidates.length, withRef }
}

/** The loaded rows of `key` with a reference that does not resolve (`unlinkedRows().rows` of them). */
export function unlinkedRecords<R extends object>(key: DatasetKey, rows: readonly R[], data: Datasets): R[] {
  const missing = missingRefs(key, data)
  return missing ? rows.filter((r) => missing(r).length > 0) : []
}

/** Latest event date on or before the as-of date, or null when there is none. */
export function latestDate(key: DatasetKey, rows: readonly object[], asOf: ISODate): ISODate | null {
  const fresh = FRESHNESS[key]
  if (!fresh) return null
  let latest = ''
  for (const r of rows as readonly Row[]) {
    for (const f of fresh.fields) {
      const v = r[f]
      if (typeof v !== 'string' || v.length < 10) continue
      const d = v.slice(0, 10)
      if (d <= asOf && d > latest) latest = d
    }
  }
  return latest || null
}

const pctText = (share: number) => fmt(share, share > 0 && share < 0.01 ? 'pct' : 'pct0')

/**
 * The rows a field leaves blank, for a check about that field. `shown` is the row count the
 * check's sentence prints, if any: the number is underlined in place only when it is exactly the
 * rows listed, otherwise the text gets its own link.
 */
function blankRecords(f: FieldCoverage | undefined, shown?: number): CheckRecords | undefined {
  if (!f || f.blank === 0) return undefined
  return {
    select: { by: 'blank', field: f.key },
    count: f.blank,
    figure: shown === f.blank ? fmt(shown, 'int') : null,
  }
}

function fieldChecks(coverage: DatasetCoverage): DatasetCheck[] {
  const out: DatasetCheck[] = []
  const blank = coverage.emptyCore.filter((f) => f.defaulted === 0)
  const byDefault = coverage.emptyCore.filter((f) => f.defaulted > 0)
  if (blank.length) {
    const labels = blank.map((f) => f.label)
    out.push({
      kind: 'empty-field',
      severity: 'warning',
      text: `${listLabels(labels)} ${labels.length === 1 ? 'is' : 'are'} blank in every row.`,
      count: labels.length,
    })
  }
  if (byDefault.length) {
    const labels = byDefault.map((f) => f.label)
    out.push({
      kind: 'empty-field',
      severity: 'warning',
      text: `${listLabels(labels)} ${labels.length === 1 ? 'was' : 'were'} not in the file, so every row holds a default.`,
      count: labels.length,
    })
  }
  // Fields whose blanks are normal for some rows (no interview booked yet) are never called thin.
  const thin = coverage.fields.filter(
    (f): f is FieldCoverage & { share: number } =>
      f.requirement !== 'optional' && !f.blankOk && f.share != null && f.filled > 0 && f.share < THIN_FIELD,
  )
  for (const f of thin)
    out.push({
      kind: 'thin-field',
      severity: 'info',
      text:
        f.defaulted > 0
          ? `${f.label} is filled from the file for ${pctText(f.share)} of ${f.rowsNoun}; the rest hold a default or are blank.`
          : `${f.label} is filled ${f.scope ? 'for' : 'in'} ${pctText(f.share)} of ${f.rowsNoun}.`,
      count: f.expected - f.filled,
      records: blankRecords(f),
    })
  return out
}

/**
 * Employees fields that are optional for the importer but that attrition and headcount depend
 * on: say what goes blank or wrong in the views when they are missing.
 */
function rosterChecks(
  rows: readonly Row[],
  coverage: DatasetCoverage,
  fills: FieldFills | null | undefined,
): DatasetCheck[] {
  const out: DatasetCheck[] = []
  const field = (k: string) => coverage.fields.find((f) => f.key === k)
  const leavers = rows.filter((r) => r.terminationDate != null && r.terminationDate !== '').length
  if (!leavers)
    out.push({
      kind: 'metric-field',
      severity: 'warning',
      text: `Termination date is blank in all ${fmt(rows.length, 'int')} ${rowsWord(rows.length)}, so attrition reads as zero. Include the people who left to measure it.`,
      count: rows.length,
      records: blankRecords(field('terminationDate'), rows.length),
    })
  const metric = (key: string, who: string, lost: string, partly: string) => {
    const f = field(key)
    if (!f || f.share == null || f.share >= THIN_FIELD) return
    out.push(
      f.filled === 0
        ? {
            kind: 'metric-field',
            severity: 'warning',
            text: `${f.label} is blank for all ${fmt(f.expected, 'int')} ${who}, so ${lost} can’t be shown.`,
            count: f.expected,
            records: blankRecords(f, f.expected),
          }
        : {
            kind: 'metric-field',
            severity: 'info',
            text: `${f.label} is filled for ${pctText(f.share)} of ${who}, so ${partly}.`,
            count: f.expected - f.filled,
            records: blankRecords(f),
          },
    )
  }
  metric(
    'terminationType',
    'leavers',
    'voluntary and regretted attrition',
    'voluntary and involuntary attrition are undercounted',
  )
  metric('regrettable', 'voluntary leavers', 'regretted attrition', 'regretted attrition is undercounted')
  if (fills?.notInFile.includes('employmentType') && rows.length)
    out.push({
      kind: 'metric-field',
      severity: 'warning',
      text: `Employment type was not in the file, so all ${fmt(rows.length, 'int')} people count as employees in headcount and rates.`,
      count: rows.length,
      records: {
        select: { by: 'defaulted', field: 'employmentType' },
        count: rows.length,
        figure: fmt(rows.length, 'int'),
      },
    })
  return out
}

export function datasetChecks(args: {
  key: DatasetKey
  data: Datasets
  source: SourceMeta
  coverage: DatasetCoverage
  asOf: ISODate
  /** The quality index, for what the import log and the tier rules know (`qualityChecks`). */
  quality?: Pick<QualityIndex, 'checks' | 'fields' | 'dataset'> | null
  /** Whether the dataset each link points at is still the sample. */
  targetIsSample?: (key: DatasetKey) => boolean
  /** From the last upload's log: what the importer filled itself. */
  fills?: FieldFills | null
  /** From the last upload's log: how many kinds of change its "Last upload" summary lists. */
  changeKinds?: number | null
}): DatasetCheck[] {
  const { key, data, source, coverage, asOf } = args
  const rows = data[key] as readonly object[]
  if (!rows.length)
    return [
      {
        kind: 'empty',
        severity: 'warning',
        text: 'No rows are loaded, so the views that read it show empty states.',
        count: 0,
      },
    ]
  const out: DatasetCheck[] = [...fieldChecks(coverage)]
  if (key === 'employees') out.push(...rosterChecks(rows as readonly Row[], coverage, args.fills))

  const link = LINKS[key]
  const unlinked = unlinkedRows(key, data)
  if (link && unlinked && unlinked.rows > 0) {
    const share = unlinked.rows / unlinked.total
    // When one side is the sample and the other an upload, the mismatch is expected; say which to upload.
    const targetSample = args.targetIsSample?.(link.target)
    const hint =
      source.kind === 'upload' && targetSample
        ? ` ${datasetDef(link.target).label} is still the sample; upload yours as well.`
        : source.kind !== 'upload' && targetSample === false
          ? ` ${datasetDef(key).label} is still the sample; upload yours as well.`
          : ''
    out.push({
      kind: 'unlinked',
      severity: share > UNLINKED_WARNING ? 'warning' : 'info',
      text: `${fmt(unlinked.rows, 'int')} ${rowsWord(unlinked.rows)} (${fmt(share, share < 0.01 ? 'pct' : 'pct0')}) ${unlinked.rows === 1 ? 'refers' : 'refer'} to ${TARGET_NOUN[link.target]}.${hint}`,
      count: unlinked.rows,
      records: { select: { by: 'unlinked' }, count: unlinked.rows, figure: fmt(unlinked.rows, 'int') },
    })
  }

  const fresh = FRESHNESS[key]
  if (fresh) {
    const latest = latestDate(key, rows, asOf)
    if (!latest)
      out.push({
        kind: 'stale',
        severity: 'warning',
        text: `No ${fresh.what} is dated on or before the as-of date, ${formatDate(asOf)}.`,
        count: rows.length,
      })
    else {
      const age = daysBetween(latest, asOf)
      if (age > fresh.maxDays)
        out.push({
          kind: 'stale',
          severity: 'warning',
          text: `The latest ${fresh.what} is dated ${formatDate(latest)}, ${ageText(age)} before the as-of date.`,
          count: age,
        })
    }
  }

  if (source.kind === 'upload') {
    // Counted the way the "Last upload" summary lists them, so the two always agree.
    const kinds = args.changeKinds
    if (kinds != null && kinds > 0)
      out.push({
        kind: 'import-warnings',
        severity: 'info',
        text: `The last upload logged ${fmt(kinds, 'int')} ${kinds === 1 ? 'kind' : 'kinds'} of change; see Last upload.`,
        count: kinds,
      })
    else if (kinds == null && (source.warnings ?? 0) > 0) {
      const n = source.warnings ?? 0
      out.push({
        kind: 'import-warnings',
        severity: 'info',
        text: `${fmt(n, 'int')} ${rowsWord(n)} imported with a change or warning.`,
        count: n,
      })
    }
  }
  if (args.quality) out.push(...qualityChecks(key, args.quality, out))
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

/**
 * What the quality index knows that the checks above do not say: import errors and blocking
 * issues from the import log (uploads and the messy sample alike), fields whose fill or values cap
 * their tier, and failing rules with no check of their own here (a manager who is not in the
 * roster, a pay extract too old). `covered` are the checks already made, so a field is not named
 * twice.
 */
export function qualityChecks(
  key: DatasetKey,
  quality: Pick<QualityIndex, 'checks' | 'fields' | 'dataset'>,
  covered: readonly DatasetCheck[],
): DatasetCheck[] {
  const out: DatasetCheck[] = []
  const rules = quality.checks(key)
  const rule = (id: string) => rules.find((r) => r.id === id)
  const blocking = rule('no-blocking')
  if (blocking && !blocking.pass)
    out.push({ kind: 'quality-rule', severity: 'warning', text: blocking.detail, count: blocking.count })
  const errors = rule('issue-rate')
  const errorRows = quality.dataset(key).version?.issues.rowsWithErrors ?? 0
  if (errors && errorRows > 0)
    out.push({
      kind: 'quality-rule',
      severity: errors.pass ? 'info' : 'warning',
      text: errors.detail,
      count: errorRows,
    })
  // References and freshness have checks of their own above, except where those don't look.
  for (const id of ['references', 'fresh'] as const) {
    const r = rule(id)
    const own = id === 'references' ? LINKS[key] : FRESHNESS[key]
    if (r && !r.pass && !own)
      out.push({ kind: 'quality-rule', severity: 'warning', text: r.detail, count: r.count })
  }
  const named = new Set(
    covered.flatMap((c) => (c.records && c.records.select.by !== 'unlinked' ? [c.records.select.field] : [])),
  )
  // Judged on the field itself, so a bronze dataset's weak fields show before its mapping is confirmed.
  for (const f of quality.fields(key)) {
    const field = f.ref.slice(f.ref.indexOf('.') + 1)
    const short = f.tier === 'none' || named.has(field) ? null : fieldShortfall(f)
    if (!short) continue
    out.push({
      kind: 'field-tier',
      severity: 'warning',
      text: short.text,
      count: short.kind === 'coverage' ? f.blank : f.invalid + f.defaulted,
    })
  }
  return out
}

/** The most serious check's severity, or 'good' when there is none. */
export function worstSeverity(checks: readonly DatasetCheck[]): Severity {
  if (checks.some((c) => c.severity === 'critical')) return 'critical'
  if (checks.some((c) => c.severity === 'warning')) return 'warning'
  if (checks.length) return 'info'
  return 'good'
}

/** A row of any dataset. */
export type DatasetRecord = Datasets[DatasetKey][number]

/**
 * The loaded rows a check's number stands for, in file order: `check.records.count` of them.
 * Called when someone opens the rows, not on every render.
 */
export function checkRecords(key: DatasetKey, data: Datasets, select: CheckSelect): DatasetRecord[] {
  const rows: readonly DatasetRecord[] = data[key]
  if (select.by === 'unlinked') return unlinkedRecords(key, rows, data)
  if (select.by === 'defaulted') return [...rows]
  return fieldRecords(datasetDef(key), rows, select.field).blank
}
