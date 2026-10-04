/**
 * The Data quality tab's tables, from the quality index and the version records: one row per
 * dataset (tier, version, mapping, certification, freshness, issue rate), one cell per field
 * (fill rate and problem rows), every rule result, and each version's tier and issue rate. Pure.
 */
import { withoutTierPrefix } from '@/components/tier/tierModel'
import { fieldShortfall } from '@/data/quality/compute'
import { type FieldRef, fieldDefOf } from '@/data/quality/fieldRef'
import type { QualityRules } from '@/data/quality/rules'
import { byWho, midSentence, shortDate } from '@/data/quality/text'
import { TIER_LABEL, type Tier, tierRank } from '@/data/quality/tier'
import type { DatasetVersion, FieldStats, QualityIndex, RuleId, RuleResult } from '@/data/quality/types'
import { isCertified } from '@/data/quality/versions'
import { type DatasetKey, datasetDef, type ISODate } from '@/data/schema'
import type { Requirement } from '../../engine/coverage'
import { nextTierText, qualityRows } from '../../engine/qualityTable'
import { shareText } from './share'

export type SummaryQuality = Pick<QualityIndex, 'dataset' | 'fields' | 'explain' | 'rules'>

/* ───────────── datasets ───────────── */

export interface DatasetSummaryRow {
  key: DatasetKey
  dataset: string
  tier: Tier
  tierLabel: string
  /** "Sample extract", or the file (and sheet) it came from. */
  version: string
  /** The date the version was loaded; null for the generated sample. */
  loaded: ISODate | null
  rows: number
  /** "Confirmed 30 Sep by HRIS team" or "Not confirmed". */
  mapping: string
  mappingConfirmed: boolean
  /** "Certified 30 Sep by HRIS team", "Earlier version only" or "Not certified". */
  certification: string
  certified: boolean
  /** "2 d old, limit 30 d", "No dates to judge by", or "Not judged" for datasets without a limit. */
  freshness: string
  /** Null when freshness is not judged for the dataset. */
  fresh: boolean | null
  /** Days from the latest event (or the extract date) to the as-of date. */
  ageDays: number | null
  /** Rows with an import error ÷ rows in the file; null when there is no import log. */
  issueRate: number | null
  /** Fields held below the dataset's own tier. */
  fieldsBelow: number
  /** Checks that do not pass, the informational ones included. */
  failing: number
  /** "To reach silver: mapping confirmed." Null at gold. */
  next: string | null
  /** The tier explanation without the tier word. */
  explain: string
}

/** The version's source in a few words. */
export function versionText(v: DatasetVersion | null | undefined): string {
  if (!v) return 'Nothing loaded'
  if (v.source === 'sample') return 'Sample extract'
  const sheet = v.sheetName && v.sheetName !== v.fileName ? ` › ${v.sheetName}` : ''
  return `${v.fileName ?? 'Uploaded file'}${sheet}`
}

export function datasetSummary(args: {
  key: DatasetKey
  quality: SummaryQuality
  version: DatasetVersion | null | undefined
  asOf: ISODate
}): DatasetSummaryRow {
  const { key, quality: q, version: v, asOf } = args
  const ds = q.dataset(key)
  const refYear = asOf.slice(0, 4)
  // The freshness the tier is judged by, so this column never contradicts the tier or the checks.
  const f = ds.freshness
  const judged = f.what != null
  const fresh = !judged ? null : f.fresh
  const freshText = !judged
    ? 'Not judged'
    : f.ageDays == null
      ? 'No dates to judge by'
      : `${f.ageDays.toLocaleString('en-US')} d old${f.maxDays != null ? `, limit ${f.maxDays} d` : ''}`
  const cert = v?.certification ?? null
  const certified = isCertified(v)
  return {
    key,
    dataset: ds.label,
    tier: ds.tier,
    tierLabel: TIER_LABEL[ds.tier],
    version: versionText(v),
    loaded: v?.importedAt?.slice(0, 10) ?? null,
    rows: ds.rows,
    mapping: v?.mappingConfirmedAt
      ? `Confirmed ${shortDate(v.mappingConfirmedAt, refYear)} by ${byWho(v.mappingConfirmedBy)}`
      : 'Not confirmed',
    mappingConfirmed: !!v?.mappingConfirmedAt,
    certification:
      certified && cert
        ? `Certified ${shortDate(cert.at, refYear)} by ${byWho(cert.by)}`
        : cert
          ? 'Earlier version only'
          : 'Not certified',
    certified,
    freshness: freshText,
    fresh,
    ageDays: f.ageDays,
    issueRate: ds.issueRate,
    fieldsBelow: q.fields(key).filter((s) => tierRank(s.tier) < tierRank(ds.tier) && s.tier !== 'none')
      .length,
    failing: ds.rules.filter((r) => !r.pass).length,
    next: nextTierText(ds.tier, ds.missing),
    explain: withoutTierPrefix(q.explain(key)),
  }
}

/* ───────────── fields ───────────── */

export interface FieldCell {
  key: DatasetKey
  dataset: string
  ref: FieldRef
  field: string
  requirement: Requirement
  /** Position in its dataset's row of the matrix (required fields first). */
  position: number
  scope: string | null
  applicable: number
  filled: number
  /** Filled ÷ rows it applies to; null when no row applies. */
  coverage: number | null
  blank: number
  invalid: number
  /** Of `invalid`, values the importer left blank: those rows are among `blank` too. */
  invalidBlank: number
  defaulted: number
  remapped: number
  /**
   * Distinct rows with a gap: blank (unless blanks are normal), not recognized or defaulted. A
   * value the importer did not recognize and left blank counts once, as the drill lists it.
   */
  problems: number
  blankOk: boolean
  tier: Tier
  /**
   * The field falls short of silver on its own (too thin, too many values not recognized), or a
   * remap after certification caps it, whatever its dataset's tier.
   */
  short: boolean
  /** Why the field falls short, or ''. */
  why: string
}

/** Every field of a dataset in matrix order: required, then recommended, then optional. */
export function fieldCells(key: DatasetKey, quality: Pick<QualityIndex, 'fields' | 'rules'>): FieldCell[] {
  const def = datasetDef(key)
  return qualityRows(def, quality.fields(key)).map((r, position) => {
    // Short of silver on its own, whatever the dataset's tier: a bronze dataset's thin field
    // holds its numbers back as soon as the dataset's mapping is confirmed.
    const short = r.tier === 'none' ? null : fieldShortfall(r, quality.rules)
    return {
      key,
      dataset: def.label,
      ref: r.ref,
      field: r.label,
      requirement: r.requirement,
      position,
      scope: r.scope,
      applicable: r.applicableRows,
      filled: r.filled,
      coverage: r.coverage,
      blank: r.blank,
      invalid: r.invalid,
      invalidBlank: Math.min(r.blank, r.invalid, r.invalidBlank ?? 0),
      defaulted: r.defaulted,
      remapped: r.remapped,
      problems: problemRows(r),
      blankOk: r.blankOk,
      tier: r.tier,
      short: !!short || r.capKind === 'remapped',
      why: r.capReason ?? short?.text ?? '',
    }
  })
}

/**
 * Distinct rows with a gap in a field: blanks (unless they are normal), values not recognized and
 * defaults, with values the importer left blank counted once.
 */
export function problemRows(
  s: Pick<FieldStats, 'blank' | 'invalid' | 'defaulted' | 'blankOk'> & { invalidBlank?: number },
): number {
  if (s.blankOk) return s.invalid + s.defaulted
  return s.blank + s.invalid + s.defaulted - Math.min(s.blank, s.invalid, s.invalidBlank ?? 0)
}

/** The kinds of problem rows behind a field cell that have rows, in drill order. */
export function cellProblems(c: Pick<FieldCell, 'blank' | 'invalid' | 'defaulted' | 'blankOk'>): {
  kind: 'blank' | 'invalid' | 'defaulted'
  count: number
}[] {
  const out: { kind: 'blank' | 'invalid' | 'defaulted'; count: number }[] = []
  if (c.blank && !c.blankOk) out.push({ kind: 'blank', count: c.blank })
  if (c.invalid) out.push({ kind: 'invalid', count: c.invalid })
  if (c.defaulted) out.push({ kind: 'defaulted', count: c.defaulted })
  return out
}

/**
 * Fill rate in words for a cell, never rounded across the silver bar: "72% filled for leavers",
 * "94.6% filled". Blanks that are normal are said so.
 */
export function cellFillText(
  c: Pick<FieldCell, 'coverage' | 'scope' | 'blankOk'>,
  minCoverage: number,
): string {
  if (c.coverage == null) return 'Applies to no row yet'
  const share = shareText(c.coverage, c.blankOk ? null : { threshold: minCoverage, side: 'min' })
  const scope = c.scope ? ` for ${midSentence(c.scope)}` : ''
  return `${share} filled${scope}${c.blankOk ? '; blanks are normal' : ''}`
}

/* ───────────── checks ───────────── */

const NEEDED: Record<'silver' | 'gold', string> = { silver: 'Silver', gold: 'Gold' }

export interface CheckRow {
  key: DatasetKey
  dataset: string
  id: RuleId
  check: string
  /** "Silver", "Gold" or "Information". */
  needed: string
  pass: boolean
  result: 'Pass' | 'Fail'
  detail: string
  /** Rows that fail (0 when it passes or is not about rows). */
  count: number
  /** Indexes of the rows behind a failure. */
  rows: readonly number[]
}

export function checkRows(key: DatasetKey, rules: readonly RuleResult[]): CheckRow[] {
  const dataset = datasetDef(key).label
  return rules.map((r) => ({
    key,
    dataset,
    id: r.id,
    check: r.label,
    needed: r.gate ? NEEDED[r.gate] : 'Information',
    pass: r.pass,
    result: r.pass ? 'Pass' : 'Fail',
    detail: r.detail,
    count: r.count,
    rows: r.rows,
  }))
}

/* ───────────── trend ───────────── */

export interface TrendRow {
  key: DatasetKey
  dataset: string
  versionId: string
  /** "Sample extract", or the file it came from. */
  version: string
  current: boolean
  /** The date it was loaded; null for the generated sample. */
  loaded: ISODate | null
  rows: number
  issueRate: number | null
  mappingConfirmed: boolean
  certified: boolean
  tier: Tier
  tierLabel: string
  /** How the tier was judged: the current checks, or what an earlier version's record keeps. */
  basis: string
}

export const RECORD_BASIS = 'From the version record'
export const CURRENT_BASIS = 'Current checks'

/** A version's issue rate: rows with an import error ÷ rows in the file. */
export function versionIssueRate(v: Pick<DatasetVersion, 'issues'>): number | null {
  return v.issues.rowsIn > 0 ? v.issues.rowsWithErrors / v.issues.rowsIn : null
}

/**
 * The tier an earlier version's record supports: rows, a confirmed mapping, no blocking issues and
 * an issue rate within the limit make silver; a certification of that version makes gold. Its
 * references and freshness can't be judged any more, since only the record is kept.
 */
export function recordTier(v: DatasetVersion, rules: Pick<QualityRules, 'maxProblemShare'>): Tier {
  if (v.rowCount === 0) return 'none'
  const rate = versionIssueRate(v)
  const silver =
    !!v.mappingConfirmedAt && v.issues.blocking === 0 && (rate == null || rate <= rules.maxProblemShare)
  if (!silver) return 'bronze'
  return isCertified(v) ? 'gold' : 'silver'
}

/** The current version (judged by the live checks) and the earlier ones kept, oldest first. */
export function trendRows(args: {
  key: DatasetKey
  current: DatasetVersion | null | undefined
  history: readonly DatasetVersion[]
  currentTier: Tier
  currentIssueRate: number | null
  rules: Pick<QualityRules, 'maxProblemShare'>
}): TrendRow[] {
  const { key, current, history, rules } = args
  const dataset = datasetDef(key).label
  const row = (v: DatasetVersion, isCurrent: boolean): TrendRow => {
    const tier = isCurrent ? args.currentTier : recordTier(v, rules)
    return {
      key,
      dataset,
      versionId: v.versionId,
      version: versionText(v),
      current: isCurrent,
      loaded: v.importedAt?.slice(0, 10) ?? null,
      rows: v.rowCount,
      issueRate: isCurrent ? args.currentIssueRate : versionIssueRate(v),
      mappingConfirmed: !!v.mappingConfirmedAt,
      certified: isCertified(v),
      tier,
      tierLabel: TIER_LABEL[tier],
      basis: isCurrent ? CURRENT_BASIS : RECORD_BASIS,
    }
  }
  const earlier = history.filter((h) => h.versionId !== current?.versionId).map((h) => row(h, false))
  earlier.reverse()
  return current ? [...earlier, row(current, true)] : earlier
}

/** The label of a field reference for tables: "Termination reason". */
export const fieldLabelOf = (ref: FieldRef): string => fieldDefOf(ref)?.label ?? ref
