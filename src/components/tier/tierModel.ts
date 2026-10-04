/**
 * Gating numbers by the data standard (docs/DATA-TIERS.md). Pure: every KPI tile, figure and
 * finding asks `gateFor` whether it may show under the current standard, and these helpers word
 * what stands in its place and how to raise it.
 */
import { MIN_COVERAGE } from '@/data/quality/compute'
import { type FieldRef, fieldDefOf, parseFieldRef } from '@/data/quality/fieldRef'
import { capFirst, midSentence } from '@/data/quality/text'
import {
  BELOW_STANDARD_TEXT,
  type DataStandard,
  meetsStandard,
  TIER_LABEL,
  TIERS,
  type Tier,
  tierRank,
} from '@/data/quality/tier'
import type { Limiting, QualityIndex, RuleResult } from '@/data/quality/types'
import { DATASET_KEYS, type DatasetKey, datasetDef } from '@/data/schema'

/** What the data standard decides for one number. */
export interface TierGate {
  tier: Tier
  standard: DataStandard
  /** The field or dataset that sets the tier. */
  limiting: Limiting
  /** The number may be shown under the current standard. */
  shown: boolean
  /** Badge tooltip: "Silver: Candidates mapping confirmed 2 Oct by you; not certified." */
  explain: string
  /** The line that stands in for a hidden number; null when it is shown. */
  reason: string | null
}

type GateQuality = Pick<QualityIndex, 'limitingOf' | 'explainOf'>

/**
 * The gate for a number that declares `uses` (or, without them, reads the view's `fallback`
 * datasets). Null when it names no data at all, so there is nothing to judge.
 */
export function gateFor(
  quality: GateQuality,
  standard: DataStandard,
  uses: readonly FieldRef[] | undefined,
  fallback: readonly DatasetKey[],
): TierGate | null {
  if (!uses?.length && !fallback.length) return null
  const limiting = quality.limitingOf(uses, fallback)
  const tier = limiting.tier
  const shown = tier !== 'none' && meetsStandard(tier, standard)
  return {
    tier,
    standard,
    limiting,
    shown,
    explain: quality.explainOf(uses, fallback),
    reason: shown ? null : tier === 'none' ? noDataText(limiting) : belowStandardText(standard),
  }
}

/**
 * What stands in for a hidden number, one phrasing everywhere (docs/DATA-TIERS.md): "Not yet
 * confirmed for production" under Production, "Not yet validated" under Validated.
 */
export function belowStandardText(standard: DataStandard): string {
  return BELOW_STANDARD_TEXT[standard]
}

const datasetLabel = (key: DatasetKey) => datasetDef(key).label

/** What a limiting field or dataset is called in a sentence: "Employees termination reason". */
export function subjectOf(limiting: Pick<Limiting, 'dataset' | 'ref'>): string | null {
  if (limiting.ref) {
    const p = parseFieldRef(limiting.ref)
    const field = fieldDefOf(limiting.ref)?.label
    if (p && field) return `${datasetLabel(p.dataset)} ${midSentence(field)}`
  }
  return limiting.dataset ? datasetLabel(limiting.dataset) : null
}

/** "No data: Employees termination reason is missing". */
export function noDataText(limiting: Pick<Limiting, 'dataset' | 'ref'>): string {
  const subject = subjectOf(limiting)
  return subject ? `No data: ${subject} is missing` : 'No data: the data behind this is missing'
}

/** An explanation without its leading "Silver: " (the tier is said elsewhere). */
export function withoutTierPrefix(explain: string): string {
  for (const t of TIERS) {
    const prefix = `${TIER_LABEL[t]}: `
    if (explain.startsWith(prefix)) return capFirst(explain.slice(prefix.length))
  }
  return explain
}

/* ───────────── how to raise it ───────────── */

/** One step per failing rule, worded as something a person does. */
const RULE_STEP: Partial<Record<RuleResult['id'], (dataset: string) => string>> = {
  'has-rows': (d) => `load ${d}`,
  'mapping-confirmed': (d) => `review and confirm the ${d} mapping`,
  'no-blocking': (d) => `resolve the blocking issues in ${d}`,
  'issue-rate': (d) => `fix the ${d} rows with import errors`,
  references: (d) => `fix the ${d} rows that refer to missing records`,
  certified: (d) => `have the data owner certify this ${d} version`,
  'control-totals': (d) => `reconcile the ${d} control totals`,
  fresh: (d) => `load a more recent ${d} extract`,
}

type RaiseQuality = Pick<QualityIndex, 'dataset' | 'fieldStats'>

/** Steps that lift a number: the ones done in the Data room, and the ones done in the source data. */
export interface RaiseSteps {
  room: string[]
  source: string[]
}

/**
 * What would lift the number to `standard`: the failing dataset rules up to that tier, and the
 * field's own fill or value problems. Plain verb phrases, first one first.
 */
export function raiseSteps(
  quality: RaiseQuality,
  limiting: Pick<Limiting, 'dataset' | 'ref'>,
  standard: DataStandard,
): RaiseSteps {
  const out: RaiseSteps = { room: [], source: [] }
  const key = limiting.dataset
  if (!key) return out
  const label = datasetLabel(key)
  const ds = quality.dataset(key)
  if (ds.tier === 'none') return { room: [`load ${label}`], source: [] }
  const field = limiting.ref ? quality.fieldStats(limiting.ref) : null
  if (field && field.tier === 'none')
    return { room: [`load ${label} with a ${midSentence(field.label)} column`], source: [] }
  const target = tierRank(standard)
  for (const r of ds.rules) {
    if (r.pass || !r.gate || tierRank(r.gate) > target) continue
    const step = RULE_STEP[r.id]?.(label)
    if (step) out.room.push(step)
  }
  if (field?.capKind === 'remapped') {
    // Remapped after certification: the data owner certifies the mapped numbers again.
    if (target >= tierRank('gold'))
      out.room.push(`have the data owner certify ${label} again with the mapping changes`)
  } else if (field?.capReason && target >= tierRank('silver')) {
    const fill = !field.blankOk && field.coverage != null && field.coverage < MIN_COVERAGE
    if (fill)
      out.source.push(
        `fill in ${midSentence(field.label)} for more ${field.scope ? midSentence(field.scope) : 'rows'} in the source data`,
      )
    else out.room.push(`map the unrecognized ${midSentence(field.label)} values`)
  }
  return out
}

/** "To raise it, confirm the Candidates mapping in the Data room, and fill in … in the source data." */
export function raiseText(steps: RaiseSteps): string {
  const room = steps.room.length ? `${joinAnd(steps.room)} in the Data room` : ''
  const source = joinAnd(steps.source)
  if (!room && !source) return ''
  return `To raise it, ${room && source ? `${room}, and ${source}` : room || source}.`
}

/** "a", "a and b", "a, b and c". */
export function joinAnd(parts: readonly string[]): string {
  if (parts.length < 2) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** The empty state that stands in for a figure below the standard. */
export interface HeldBack {
  /** "Not yet confirmed for production" or "No data". */
  title: string
  /** What holds it back: "Held back by Candidates current stage, which is Bronze. …" */
  body: string
  /** "To raise it, review and confirm the Candidates mapping in the Data room." Empty when unknown. */
  raise: string
  /** The dataset to open in the Data room. */
  dataset: DatasetKey | null
  /** A preview is possible (there is data, it is just below the standard). */
  canPreview: boolean
}

export function heldBack(gate: TierGate, quality: RaiseQuality & Pick<QualityIndex, 'explain'>): HeldBack {
  const none = gate.tier === 'none'
  const key = gate.limiting.dataset
  // A field holds the number back only when its own fill or values cap it; otherwise its dataset does.
  const field = gate.limiting.ref ? quality.fieldStats(gate.limiting.ref) : null
  const capped = !!field?.capReason
  const subject = capped || !key ? subjectOf(gate.limiting) : datasetLabel(key)
  const why = none
    ? withoutTierPrefix(gate.explain)
    : capped
      ? (field?.capReason ?? '')
      : key
        ? withoutTierPrefix(quality.explain(key))
        : withoutTierPrefix(gate.explain)
  return {
    title: none ? 'No data' : belowStandardText(gate.standard),
    body: none
      ? why
      : subject
        ? `Held back by ${subject}, which is ${TIER_LABEL[gate.tier]}. ${why}`
        : `This figure is ${TIER_LABEL[gate.tier]}. ${why}`,
    raise: raiseText(raiseSteps(quality, gate.limiting, gate.standard)),
    dataset: gate.limiting.dataset,
    canPreview: !none,
  }
}

/* ───────────── readout ───────────── */

/** Split items into the ones the standard shows and the ones it hides, keeping their order. */
export function splitByStandard<T>(
  items: readonly T[],
  gateOf: (item: T) => TierGate | null,
): { shown: T[]; hidden: T[] } {
  const shown: T[] = []
  const hidden: T[] = []
  for (const item of items) {
    const g = gateOf(item)
    if (g && !g.shown) hidden.push(item)
    else shown.push(item)
  }
  return { shown, hidden }
}

/** "3 findings hidden because their data is not yet confirmed for production". */
export function hiddenFindingsText(count: number, standard: DataStandard): string {
  const one = count === 1
  const what = `${count} ${one ? 'finding' : 'findings'} hidden because ${one ? 'its' : 'their'} data`
  return standard === 'bronze'
    ? `${what} is missing`
    : `${what} is ${midSentence(BELOW_STANDARD_TEXT[standard])}`
}

/* ───────────── dataset counts for the standard control ───────────── */

export type TierCounts = Record<Tier, number>

export function tierCounts(
  quality: Pick<QualityIndex, 'datasetTier'>,
  keys: readonly DatasetKey[] = DATASET_KEYS,
): TierCounts {
  const out: TierCounts = { none: 0, bronze: 0, silver: 0, gold: 0 }
  for (const k of keys) out[quality.datasetTier(k)]++
  return out
}

/** Highest tier first; tiers with no datasets are left out. */
export function tierCountParts(counts: TierCounts): { tier: Tier; count: number; text: string }[] {
  return [...TIERS]
    .reverse()
    .filter((t) => counts[t] > 0)
    .map((t) => ({
      tier: t,
      count: counts[t],
      text: t === 'none' ? `${counts[t]} with no data` : `${counts[t]} ${TIER_LABEL[t].toLowerCase()}`,
    }))
}

/** "Datasets: 3 gold, 4 silver, 3 bronze". */
export function tierCountsText(counts: TierCounts): string {
  const parts = tierCountParts(counts).map((p) => p.text)
  return parts.length ? `Datasets: ${parts.join(', ')}` : 'No datasets loaded'
}

/** What each data standard shows, for the Settings sheet and the filter row's tooltip. */
export const STANDARD_HINT: Record<DataStandard, string> = {
  gold: 'Only gold numbers: certified, reconciled and fresh. Use this in leadership meetings.',
  silver: 'Silver and gold numbers: the mapping is confirmed and the checks pass.',
  bronze: 'Every number, raw data included, each with its tier badge.',
}
