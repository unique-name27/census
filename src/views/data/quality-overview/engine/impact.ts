/**
 * Metric impact: every registered metric with its tier and the field (or dataset) limiting it,
 * and the single fixes that would raise the most metrics, from the registry's lineage (`uses`)
 * crossed with the quality index's field stats.
 *
 * A fix is one thing a person can do:
 * - a field fix fills a field's blanks and corrects its values not recognized, so the field is
 *   no longer capped below its dataset ("Filling Termination reason for 141 leavers");
 * - a dataset fix passes the checks its next tier needs ("Confirming the Candidates mapping"),
 *   or certifies it again after reference mappings changed certified rows.
 *
 * Each fix is judged on its own: the tier every metric would reach if only that were done. A
 * metric with no `uses` takes the lowest tier of its home view's datasets, as on screen. Rules and
 * settings that read no data (the privacy and data quality rules, the materiality floor) are not
 * judged at all. Pure.
 */
import { subjectOf, withoutTierPrefix } from '@/components/tier/tierModel'
import { fieldShortfall } from '@/data/quality/compute'
import { datasetOfRef, type FieldRef, isFieldRef } from '@/data/quality/fieldRef'
import { capFirst, midSentence } from '@/data/quality/text'
import { lowestTier, TIER_LABEL, type Tier, tierRank } from '@/data/quality/tier'
import type { FieldStats, Limiting, QualityIndex, RuleResult } from '@/data/quality/types'
import { DATASET_KEYS, type DatasetKey, datasetDef } from '@/data/schema'
import { drillNoun } from '@/drill/records'
import { METRIC_VIEW_LABEL, readsNoData } from '@/metrics/registry'
import type { MetricDef, MetricView } from '@/metrics/types'

export type ImpactQuality = Pick<
  QualityIndex,
  'fieldStats' | 'fields' | 'datasetTier' | 'dataset' | 'limitingOf' | 'explain' | 'explainOf' | 'rules'
>

export type ImpactMetric = Pick<MetricDef, 'id' | 'name' | 'views' | 'uses'> &
  Partial<Pick<MetricDef, 'kind' | 'locked'>>

/** One registered metric and where its data stands. */
export interface MetricTierRow {
  id: string
  name: string
  /** Its home view. */
  view: MetricView
  viewLabel: string
  tier: Tier
  limiting: Limiting
  /** "Employees termination reason", or the dataset when the metric names no fields. */
  limitingLabel: string
  /** Why it sits at that tier, without the tier word. */
  why: string
  /** Fields the metric declares. */
  fields: number
  /** The first fix in the ranking that lifts it; null when none does on its own. */
  bestFix: string | null
}

export interface Lift {
  metricId: string
  name: string
  from: Tier
  to: Tier
}

export type FixKind = 'field' | 'dataset'

/** The rows a field fix touches: blanks to fill, values to correct. */
export type FixRowKind = 'blank' | 'invalid' | 'defaulted'

export interface Fix {
  /** 'field:employees.terminationReason' or 'dataset:candidates'. */
  id: string
  kind: FixKind
  dataset: DatasetKey
  ref: FieldRef | null
  /** The tier the field or dataset reaches. */
  to: Tier
  /** Rows the fix touches (blanks plus values to correct, or rows failing a check); null when not about rows. */
  rows: number | null
  /** For a field fix: which of the field's rows it touches. */
  rowKinds?: FixRowKind[]
  /** For a dataset fix: the checks it has to pass that are about rows. */
  rules?: RuleResult['id'][]
  /** What to do, as a phrase: "Filling Termination reason for 141 leavers". */
  action: string
  lifts: Lift[]
  /** "Filling Termination reason for 141 leavers would lift 6 metrics to Gold." */
  sentence: string
  /**
   * For a dataset fix: metrics that read the dataset but would stay where they are because one of
   * its fields falls short on its own; those fields' labels.
   */
  alsoNeeded?: { metrics: number; fields: string[] }
}

export interface Impact {
  /** Every metric that names data, lowest tier first, then catalog order. */
  metrics: MetricTierRow[]
  /** Every fix, most metrics lifted first. */
  fixes: Fix[]
  /**
   * Entries that read no data (privacy and data quality rules, calculation settings such as the
   * materiality floor), left out of both lists.
   */
  unjudged: number
}

/** What a fix changes, for working out tiers as if it were done. */
interface Scenario {
  field?: FieldRef
  dataset?: DatasetKey
  datasetTo?: Tier
  /** Also lift these fields of the dataset (the "also needed" estimate). */
  fields?: ReadonlySet<FieldRef>
}

const NONE: Scenario = {}

/* ───────────── tiers as if a fix were done ───────────── */

function fieldTierIn(q: ImpactQuality, ref: FieldRef, sc: Scenario): Tier {
  const s = q.fieldStats(ref)
  const key = datasetOfRef(ref) as DatasetKey
  const touched = sc.field === ref || sc.fields?.has(ref) || sc.dataset === key
  if (!touched) return s.tier
  const actual = q.datasetTier(key)
  const ds = sc.dataset === key && sc.datasetTo ? sc.datasetTo : actual
  if (ds === 'none') return 'none'
  // Blank in every row of a loaded dataset: no single fix in the Data room gives it data.
  if (actual !== 'none' && s.tier === 'none') return 'none'
  if (sc.field === ref || sc.fields?.has(ref)) return ds
  if (tierRank(ds) < tierRank('silver')) return ds
  if (fieldShortfall(s, q.rules)) return 'bronze'
  // A new certification takes in the mapping changes; otherwise a remap after it still caps gold.
  if (s.capKind === 'remapped' && ds === 'gold' && sc.dataset !== key) return 'silver'
  return ds
}

const validUses = (m: ImpactMetric): FieldRef[] => m.uses.filter((r): r is FieldRef => isFieldRef(r))

function metricTierIn(
  q: ImpactQuality,
  m: ImpactMetric,
  fallback: readonly DatasetKey[],
  sc: Scenario,
): Tier | null {
  const uses = validUses(m)
  if (uses.length)
    return lowestTier(
      uses.map((r) => fieldTierIn(q, r, sc)),
      'none',
    )
  if (!fallback.length) return null
  return lowestTier(fallback.map((k) => (sc.dataset === k && sc.datasetTo ? sc.datasetTo : q.datasetTier(k))))
}

/* ───────────── wording ───────────── */

const int = (n: number) => n.toLocaleString('en-US')

/** Scopes that read as a noun after a count ("141 leavers"); others fall back to the dataset's noun. */
const GENERIC_SCOPE = /^(Everyone|All |Cycles |Transaction types )/

/** "141 leavers", "12 cases past the New status", "3 people". */
export function rowsOfScope(s: Pick<FieldStats, 'scope'>, key: DatasetKey, n: number): string {
  if (s.scope && !GENERIC_SCOPE.test(s.scope)) return `${int(n)} ${midSentence(s.scope)}`
  return drillNoun(key, n)
}

/** Values to correct: those not recognized and those the importer filled with a default. */
const toCorrect = (s: Pick<FieldStats, 'invalid' | 'defaulted'>) => s.invalid + s.defaulted

function valuesPhrase(s: Pick<FieldStats, 'invalid' | 'defaulted' | 'label'>, lead: boolean): string {
  const n = toCorrect(s)
  const what =
    s.defaulted === 0
      ? 'that are not recognized'
      : s.invalid === 0
        ? 'that were filled by a default'
        : 'that are not recognized or defaulted'
  return `${lead ? 'Fixing' : 'fixing'} ${int(n)} ${midSentence(s.label)} ${n === 1 ? 'value' : 'values'} ${what}`
}

/**
 * What fixing a field means, and how many distinct rows it touches: a value the importer did not
 * recognize and left blank is one row to fix, not two.
 */
export function fieldAction(
  s: Pick<
    FieldStats,
    | 'label'
    | 'scope'
    | 'blank'
    | 'invalid'
    | 'invalidBlank'
    | 'defaulted'
    | 'coverage'
    | 'problemRate'
    | 'blankOk'
  >,
  key: DatasetKey,
  rules: { minCoverage: number; maxProblemShare: number },
): { action: string; rows: number; kinds: FixRowKind[] } {
  const fill = !s.blankOk && s.coverage != null && s.coverage < rules.minCoverage && s.blank > 0
  const values = s.problemRate != null && s.problemRate > rules.maxProblemShare && toCorrect(s) > 0
  const filling = `Filling ${midSentence(s.label)} for ${rowsOfScope(s, key, s.blank)}`
  const valueKinds: FixRowKind[] = [
    ...(s.invalid ? (['invalid'] as const) : []),
    ...(s.defaulted ? (['defaulted'] as const) : []),
  ]
  if (fill && values)
    return {
      action: `${filling} and ${valuesPhrase(s, false)}`,
      rows: s.blank + toCorrect(s) - Math.min(s.blank, s.invalid, s.invalidBlank ?? 0),
      kinds: ['blank', ...valueKinds],
    }
  if (fill) return { action: filling, rows: s.blank, kinds: ['blank'] }
  return { action: valuesPhrase(s, true), rows: toCorrect(s), kinds: valueKinds }
}

/**
 * One step a dataset needs, as a gerund phrase. The first step names the dataset; later ones
 * refer back to it ("Confirming the Succession plans mapping and fixing the 13 rows that refer to
 * missing records").
 */
const STEP: Partial<Record<RuleResult['id'], (label: string | null, r: RuleResult) => string>> = {
  'has-rows': (l) => `loading ${l ?? 'it'}`,
  'mapping-confirmed': (l) => (l ? `confirming the ${l} mapping` : 'confirming its mapping'),
  'no-blocking': (l, r) =>
    `resolving ${int(r.count)} blocking ${r.count === 1 ? 'issue' : 'issues'}${l ? ` in ${l}` : ''}`,
  'issue-rate': (l, r) =>
    `fixing the ${int(r.count)} ${l ? `${l} ` : ''}${r.count === 1 ? 'row with an import error' : 'rows with import errors'}`,
  references: (l, r) =>
    `fixing the ${int(r.count)} ${l ? `${l} ` : ''}${r.count === 1 ? 'row that refers to a missing record' : 'rows that refer to missing records'}`,
  certified: (l) => `certifying this ${l ? `${l} ` : ''}version`,
  'control-totals': (l) => (l ? `reconciling the ${l} control totals` : 'reconciling its control totals'),
  fresh: (l) => `loading a more recent ${l ? `${l} ` : ''}extract`,
}

/** "a", "a and b", "a, b and c". */
function joinAnd(parts: readonly string[]): string {
  if (parts.length < 2) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** "would lift 6 metrics to Gold", "would lift 6 metrics: 4 to Gold and 2 to Silver". */
export function liftText(lifts: readonly Pick<Lift, 'to'>[]): string {
  if (!lifts.length) return 'would not lift a metric on its own'
  const byTier = new Map<Tier, number>()
  for (const l of lifts) byTier.set(l.to, (byTier.get(l.to) ?? 0) + 1)
  const n = lifts.length
  const noun = n === 1 ? 'metric' : 'metrics'
  if (byTier.size === 1) return `would lift ${int(n)} ${noun} to ${TIER_LABEL[lifts[0].to]}`
  const parts = [...byTier.entries()]
    .sort((a, b) => tierRank(b[0]) - tierRank(a[0]))
    .map(([t, k]) => `${int(k)} to ${TIER_LABEL[t]}`)
  return `would lift ${int(n)} ${noun}: ${joinAnd(parts)}`
}

/* ───────────── the ranking ───────────── */

interface Candidate {
  id: string
  kind: FixKind
  dataset: DatasetKey
  ref: FieldRef | null
  to: Tier
  rows: number | null
  rowKinds?: FixRowKind[]
  rules?: RuleResult['id'][]
  action: string
  scenario: Scenario
  /** Short fields of the dataset, for a dataset fix's "also needed" estimate. */
  shortFields?: FieldStats[]
}

function datasetCandidates(q: ImpactQuality, key: DatasetKey): Candidate[] {
  const ds = q.dataset(key)
  const label = ds.label
  const short = q.fields(key).filter((s) => s.tier !== 'none' && !!fieldShortfall(s, q.rules))
  const out: Candidate[] = []
  const next: Tier | null =
    ds.tier === 'none' ? 'bronze' : ds.tier === 'bronze' ? 'silver' : ds.tier === 'silver' ? 'gold' : null
  if (next) {
    const gate = next === 'bronze' ? 'silver' : next
    const failing = ds.rules.filter(
      (r) => !r.pass && r.gate === gate && (next !== 'bronze' || r.id === 'has-rows'),
    )
    const steps = failing
      .filter((r) => STEP[r.id])
      .map((r, i) => STEP[r.id]?.(i === 0 ? label : null, r) ?? '')
    if (steps.length) {
      const aboutRows = failing.filter((r) => r.id === 'issue-rate' || r.id === 'references')
      const rows = distinctRows(aboutRows)
      out.push({
        id: `dataset:${key}`,
        kind: 'dataset',
        dataset: key,
        ref: null,
        to: next,
        rows: rows || null,
        ...(aboutRows.length ? { rules: aboutRows.map((r) => r.id) } : {}),
        action: capFirst(joinAnd(steps)),
        scenario: { dataset: key, datasetTo: next },
        shortFields: short,
      })
    }
  }
  // Gold, but reference mappings changed certified rows: a new certification takes them in.
  const remapped = q.fields(key).filter((s) => s.capKind === 'remapped')
  if (ds.tier === 'gold' && remapped.length)
    out.push({
      id: `dataset:${key}:recertify`,
      kind: 'dataset',
      dataset: key,
      ref: null,
      to: 'gold',
      rows: null,
      action: `Certifying ${label} again with your mapping changes`,
      scenario: { dataset: key, datasetTo: 'gold' },
    })
  for (const s of short) {
    const { action, rows, kinds } = fieldAction(s, key, q.rules)
    out.push({
      id: `field:${s.ref}`,
      kind: 'field',
      dataset: key,
      ref: s.ref,
      to: ds.tier,
      rows,
      rowKinds: kinds,
      action,
      scenario: { field: s.ref },
    })
  }
  return out
}

/**
 * Distinct rows behind failing checks: a row failing two checks counts once. A check whose rows
 * are not all known (import errors without the import log) adds the ones it can't name.
 */
export function distinctRows(rules: readonly Pick<RuleResult, 'rows' | 'count'>[]): number {
  const known = new Set<number>()
  let unnamed = 0
  for (const r of rules) {
    for (const i of r.rows) known.add(i)
    unnamed += Math.max(0, r.count - r.rows.length)
  }
  return known.size + unnamed
}

const maxTo = (lifts: readonly Lift[]) => Math.max(-1, ...lifts.map((l) => tierRank(l.to)))

/**
 * The metric impact table and the fix ranking. `fallbackOf` gives the datasets a metric with no
 * `uses` is judged by (its home view's datasets); `keys` limits the datasets considered.
 */
export function metricImpact(args: {
  metrics: readonly ImpactMetric[]
  quality: ImpactQuality
  fallbackOf: (m: ImpactMetric) => readonly DatasetKey[]
  keys?: readonly DatasetKey[]
}): Impact {
  const { quality: q, fallbackOf } = args
  const judged: { m: ImpactMetric; fallback: readonly DatasetKey[]; tier: Tier }[] = []
  let unjudged = 0
  for (const m of args.metrics) {
    // A rule or a setting reads no data: it has no tier, whatever its home view reads.
    if (readsNoData(m)) {
      unjudged++
      continue
    }
    const fallback = fallbackOf(m)
    const tier = metricTierIn(q, m, fallback, NONE)
    if (tier == null) unjudged++
    else judged.push({ m, fallback, tier })
  }

  const fixes: Fix[] = []
  /** For a metric no single fix lifts: a dataset step together with the fields it also needs. */
  const together = new Map<string, string>()
  for (const key of args.keys ?? DATASET_KEYS) {
    for (const c of datasetCandidates(q, key)) {
      const lifts: Lift[] = []
      for (const j of judged) {
        const to = metricTierIn(q, j.m, j.fallback, c.scenario)
        if (to != null && tierRank(to) > tierRank(j.tier))
          lifts.push({ metricId: j.m.id, name: j.m.name, from: j.tier, to })
      }
      const fix: Fix = {
        id: c.id,
        kind: c.kind,
        dataset: c.dataset,
        ref: c.ref,
        to: c.to,
        rows: c.rows,
        ...(c.rowKinds ? { rowKinds: c.rowKinds } : {}),
        ...(c.rules ? { rules: c.rules } : {}),
        action: c.action,
        lifts,
        sentence: `${c.action} ${liftText(lifts)}.`,
      }
      if (c.kind === 'dataset' && c.shortFields?.length) {
        const lifted = new Set(lifts.map((l) => l.metricId))
        const fields = new Set(c.shortFields.map((s) => s.ref))
        const both: Scenario = { ...c.scenario, fields }
        const usedFields = new Set<string>()
        let more = 0
        for (const j of judged) {
          if (lifted.has(j.m.id)) continue
          const to = metricTierIn(q, j.m, j.fallback, both)
          if (to == null || tierRank(to) <= tierRank(j.tier)) continue
          more++
          const reads = validUses(j.m)
          const own = c.shortFields.filter((s) => reads.includes(s.ref))
          for (const s of own) usedFields.add(s.ref)
          if (own.length && !together.has(j.m.id))
            together.set(
              j.m.id,
              joinAnd([c.action, ...own.map((s) => lowerFirst(fieldAction(s, key, q.rules).action))]),
            )
        }
        if (more) {
          const labels = c.shortFields.filter((s) => usedFields.has(s.ref)).map((s) => s.label)
          fix.alsoNeeded = { metrics: more, fields: labels }
          fix.sentence += ` ${int(more)} more would also need ${joinAnd(labels.map(midSentence))} fixed.`
        }
      }
      fixes.push(fix)
    }
  }
  fixes.sort(
    (a, b) =>
      b.lifts.length - a.lifts.length ||
      maxTo(b.lifts) - maxTo(a.lifts) ||
      (a.rows ?? Number.MAX_SAFE_INTEGER) - (b.rows ?? Number.MAX_SAFE_INTEGER) ||
      a.action.localeCompare(b.action),
  )

  const bestFix = new Map<string, string>()
  for (const f of fixes)
    for (const l of f.lifts) if (!bestFix.has(l.metricId)) bestFix.set(l.metricId, f.action)

  const rows = judged.map(({ m, fallback, tier }, order): { row: MetricTierRow; order: number } => {
    const uses = validUses(m)
    const limiting = q.limitingOf(uses.length ? uses : undefined, fallback)
    const view = m.views[0] ?? 'data'
    // The field holds the metric back when it falls short on its own (or is blank everywhere);
    // otherwise its dataset's tier does, and the dataset is named. In a dataset below silver no
    // field is capped yet, so a field it reads that falls short is named beside the dataset.
    const stats = limiting.ref ? q.fieldStats(limiting.ref) : null
    const capped = !!stats && (stats.tier === 'none' || !!stats.capReason)
    const short = capped ? null : shortFieldOf(q, uses, tier)
    const datasetLabel = limiting.dataset ? datasetDef(limiting.dataset).label : 'No data named'
    let why: string
    if (capped || !limiting.dataset)
      why = withoutTierPrefix(q.explainOf(uses.length ? uses : undefined, fallback))
    else if (short) {
      const key = datasetOfRef(short.stats.ref) as DatasetKey
      why = `${withoutTierPrefix(q.explain(key))} ${short.text}`
    } else why = withoutTierPrefix(q.explain(limiting.dataset))
    return {
      order,
      row: {
        id: m.id,
        name: m.name,
        view,
        viewLabel: METRIC_VIEW_LABEL[view] ?? view,
        tier,
        limiting: short
          ? { ...limiting, ref: short.stats.ref, dataset: datasetOfRef(short.stats.ref) }
          : limiting,
        limitingLabel: capped
          ? (subjectOf(limiting) ?? datasetLabel)
          : short
            ? (subjectOf({ ref: short.stats.ref, dataset: null }) ?? datasetLabel)
            : datasetLabel,
        why,
        fields: uses.length,
        bestFix: bestFix.get(m.id) ?? together.get(m.id) ?? null,
      },
    }
  })
  rows.sort((a, b) => tierRank(a.row.tier) - tierRank(b.row.tier) || a.order - b.order)

  return { metrics: rows.map((r) => r.row), fixes, unjudged }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * A field the metric reads, at the metric's tier, that falls short of silver on its own (in a
 * dataset below silver, where no field is capped yet): the thinnest first, then the one with the
 * most values not recognized. Null when none does.
 */
function shortFieldOf(
  q: ImpactQuality,
  uses: readonly FieldRef[],
  tier: Tier,
): { stats: FieldStats; text: string } | null {
  let best: { stats: FieldStats; text: string } | null = null
  for (const ref of uses) {
    const s = q.fieldStats(ref)
    if (s.tier !== tier || s.tier === 'none') continue
    const why = fieldShortfall(s, q.rules)
    if (!why) continue
    const fill = s.coverage ?? 1
    const bestFill = best?.stats.coverage ?? 1
    const better =
      !best || fill < bestFill || (fill === bestFill && (s.problemRate ?? 0) > (best.stats.problemRate ?? 0))
    if (better) best = { stats: s, text: why.text }
  }
  return best
}

/**
 * The summary under the Data quality tab's intro: "117 of the 207 metrics that read data are below
 * gold." Said of the metrics that read data, since rules and settings in the dictionary have no tier.
 */
export function belowGoldText(below: number, judged: number): string {
  const n = (v: number) => v.toLocaleString('en-US')
  const of = judged === 1 ? 'the 1 metric that reads data' : `the ${n(judged)} metrics that read data`
  return `${n(below)} of ${of} ${below === 1 ? 'is' : 'are'} below gold.`
}

/** How many metrics sit at each tier. */
export function metricTierCounts(rows: readonly Pick<MetricTierRow, 'tier'>[]): Record<Tier, number> {
  const out: Record<Tier, number> = { none: 0, bronze: 0, silver: 0, gold: 0 }
  for (const r of rows) out[r.tier]++
  return out
}
