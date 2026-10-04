/**
 * The Certify panel's rules: which checks a certification rests on, whether the dataset can be
 * certified now, the control totals a certifier types in (parsed and checked against the data),
 * and the version history. Pure.
 */
import {
  CONTROL_METRICS,
  type ControlMetricId,
  type ControlTotal,
  type DatasetVersion,
  DEFAULT_TOLERANCE,
  isCertified,
  type RuleResult,
  reconciles,
  TIER_LABEL,
  type Tier,
} from '@/data/quality'
import { byWho, shortDate } from '@/data/quality/text'
import type { DatasetKey } from '@/data/schema'
import { fmt } from '@/lib/format'

/* ───────────── checklist ───────────── */

/** The checks a certification rests on: every silver gate, then freshness. */
export function certifyChecklist(rules: readonly RuleResult[]): RuleResult[] {
  return rules.filter((r) => (r.gate === 'silver' && r.id !== 'has-rows') || r.id === 'fresh')
}

export interface Readiness {
  /** Every silver check passes, so a certification can make the dataset gold. */
  canCertify: boolean
  /** Silver checks that fail. */
  blocking: RuleResult[]
  /** Gold checks other than the certification itself that fail (freshness, control totals). */
  goldAlsoNeeds: RuleResult[]
}

export function readiness(rules: readonly RuleResult[]): Readiness {
  const blocking = rules.filter((r) => r.gate === 'silver' && !r.pass)
  const goldAlsoNeeds = rules.filter(
    (r) => r.gate === 'gold' && !r.pass && r.id !== 'certified' && r.id !== 'control-totals',
  )
  return { canCertify: blocking.length === 0, blocking, goldAlsoNeeds }
}

/**
 * What certifying now would do, with the control totals typed so far: gold, or silver because a
 * total does not reconcile or another gold check fails. Null when certifying is not possible yet.
 * `off`: the typed totals that do not reconcile with the data. `unusable`: totals without a
 * number (or with text that is not one) or with an allowed difference out of range, which stop
 * the certification until they are fixed or removed.
 */
export function certifyOutcomeText(
  label: string,
  ready: Readiness,
  off: number,
  unusable = 0,
): string | null {
  if (!ready.canCertify) return null
  if (unusable > 0)
    return unusable === 1
      ? 'A control total is not complete. Enter its numbers, or remove it, to certify.'
      : `${unusable} control totals are not complete. Enter their numbers, or remove them, to certify.`
  const also = ready.goldAlsoNeeds.map((r) => r.label.toLowerCase())
  if (off > 0) {
    const totals = `${off} control ${off === 1 ? 'total does' : 'totals do'} not reconcile`
    return `${totals}, so certifying keeps ${label} silver${also.length ? `; gold also needs ${also.join(' and ')}` : ''}.`
  }
  if (also.length) return `You can certify now; gold also needs ${also.join(' and ')}.`
  return `Every check passes. Certifying makes ${label} gold.`
}

/** The revoke confirmation, worded from the tier the dataset has now. */
export function revokeText(label: string, tier: Tier): string {
  return tier === 'gold'
    ? `Revoke the certification? ${label} drops to silver until it is certified again.`
    : `Revoke the certification? ${label} stays ${TIER_LABEL[tier].toLowerCase()}, and needs a new certification to reach gold.`
}

/* ───────────── control totals ───────────── */

/** What a certifier would call each total, as a starting label. */
export const CONTROL_LABEL: Record<ControlMetricId, string> = {
  rows: 'Rows per the source system',
  activeHeadcount: 'Headcount per the HRIS report',
  activeWorkers: 'Active workers per the HRIS report',
  exits12m: 'Exits in the last 12 months per the HRIS report',
  totalBaseUsd: 'Total base in USD per payroll',
  openReqs: 'Open requisitions per the ATS',
  openCases: 'Open cases per the help desk',
  ratedPeople: 'People rated per the review tool',
}

/** A control total as typed: text fields, parsed on certify. */
export interface ControlDraft {
  id: string
  metric: ControlMetricId
  label: string
  expected: string
  /** Allowed difference in percent ("0.5" = 0.5%). */
  tolerance: string
}

export const tolerancePctText = (tolerance: number): string =>
  String(Math.round(tolerance * 100 * 1000) / 1000)

export function newControlDraft(metric: ControlMetricId, id: string): ControlDraft {
  return { id, metric, label: '', expected: '', tolerance: tolerancePctText(DEFAULT_TOLERANCE) }
}

/** "1,452", "1452", "$12,500,000.50" or "12 500 000" → number; anything else → null. */
export function parseAmount(s: string): number | null {
  const t = s
    .trim()
    .replace(/^(usd|\$)\s*/i, '')
    .replace(/[\s,]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Percent text → fraction; blank is the default 0.5%. Between 0% and 10%, or null. */
export function parseTolerance(s: string): number | null {
  const t = s.trim().replace(/%$/, '').trim()
  if (!t) return DEFAULT_TOLERANCE
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const pct = Number(t)
  return pct >= 0 && pct <= 10 ? pct / 100 : null
}

export interface ControlCheck {
  actual: number | null
  /** actual − expected. */
  diff: number | null
  /** |diff| ÷ |expected|; null when expected is 0 or unknown. */
  diffShare: number | null
  reconciles: boolean | null
}

export function checkControl(
  expected: number | null,
  actual: number | null,
  tolerance: number,
): ControlCheck {
  if (expected == null || actual == null || !Number.isFinite(actual))
    return { actual, diff: null, diffShare: null, reconciles: null }
  const diff = actual - expected
  return {
    actual,
    diff,
    diffShare: expected === 0 ? null : Math.abs(diff) / Math.abs(expected),
    reconciles: reconciles({ expected, tolerance }, actual),
  }
}

/** Typed control totals that parse but do not reconcile with the data (`actualOf` computes each). */
export function draftsOff(
  drafts: readonly ControlDraft[],
  actualOf: (metric: ControlMetricId) => number | null,
): number {
  let n = 0
  for (const d of drafts) {
    const expected = parseAmount(d.expected)
    const tolerance = parseTolerance(d.tolerance)
    if (expected == null || tolerance == null) continue
    if (checkControl(expected, actualOf(d.metric), tolerance).reconciles === false) n++
  }
  return n
}

/** What is wrong with an Expected entry as typed: null while it is blank or a number. */
export function expectedError(text: string): string | null {
  return text.trim() && parseAmount(text) == null ? 'Enter a number.' : null
}

/** Control totals that cannot be used yet: no number, text that is not a number, or a bad allowed difference. */
export function draftsUnusable(drafts: readonly ControlDraft[]): number {
  return drafts.filter((d) => parseAmount(d.expected) == null || parseTolerance(d.tolerance) == null).length
}

export interface ValidatedControls {
  totals: Omit<ControlTotal, 'actual'>[]
  /** Draft ID → what to fix. */
  errors: Record<string, string>
}

export function validateControls(drafts: readonly ControlDraft[]): ValidatedControls {
  const totals: Omit<ControlTotal, 'actual'>[] = []
  const errors: Record<string, string> = {}
  for (const d of drafts) {
    const expected = parseAmount(d.expected)
    const tolerance = parseTolerance(d.tolerance)
    if (expected == null)
      errors[d.id] = d.expected.trim()
        ? 'Enter a number, the total from your source report.'
        : 'Enter the expected number from your source report.'
    else if (tolerance == null) errors[d.id] = 'Enter an allowed difference between 0% and 10%.'
    else
      totals.push({ label: d.label.trim() || CONTROL_LABEL[d.metric], metric: d.metric, expected, tolerance })
  }
  return { totals, errors }
}

/** The metrics a dataset can reconcile, pay amounts only when they are shown. */
export function controlChoices(key: DatasetKey, showPay: boolean): ControlMetricId[] {
  return Object.values(CONTROL_METRICS)
    .filter((m) => m.datasets.includes(key) && (showPay || !m.pay))
    .map((m) => m.id)
}

/** A control total's value as text: money for pay totals, whole numbers otherwise. */
export function controlValueText(metric: ControlMetricId, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return CONTROL_METRICS[metric]?.pay ? fmt(v, 'moneyFull') : fmt(v, 'int')
}

/* ───────────── status and history ───────────── */

/** "Certified 2 Oct by Jamie", "Certified for an earlier version" or "Not certified". */
export function certificationText(
  v: Pick<DatasetVersion, 'versionId' | 'certification'>,
  refYear?: string,
): string {
  const c = v.certification
  if (!c) return 'Not certified'
  if (!isCertified(v as DatasetVersion)) return 'Certified for an earlier version'
  return `Certified ${shortDate(c.at, refYear)} by ${byWho(c.by)}`
}

export interface HistoryRow {
  versionId: string
  current: boolean
  source: string
  loaded: string
  rows: number
  mapping: string
  certification: string
  note: string | null
}

const sourceText = (v: DatasetVersion): string => {
  const file = [v.fileName, v.sheetName && v.sheetName !== v.fileName ? v.sheetName : null]
    .filter(Boolean)
    .join(' › ')
  if (v.source === 'sample') return file ? `Sample extract: ${file}` : 'Sample'
  return file || 'Uploaded file'
}

/** The current version, then earlier ones newest first. */
export function historyRows(
  current: DatasetVersion,
  history: readonly DatasetVersion[],
  refYear?: string,
): HistoryRow[] {
  return [current, ...history.filter((h) => h.versionId !== current.versionId)].map((v, i) => ({
    versionId: v.versionId,
    current: i === 0,
    source: sourceText(v),
    loaded: v.importedAt ? shortDate(v.importedAt, refYear) : '—',
    rows: v.rowCount,
    mapping: v.mappingConfirmedAt
      ? `Confirmed ${shortDate(v.mappingConfirmedAt, refYear)} by ${byWho(v.mappingConfirmedBy)}`
      : 'Not confirmed',
    certification: certificationText(v, refYear),
    note: isCertified(v) ? (v.certification?.note ?? null) : null,
  }))
}
