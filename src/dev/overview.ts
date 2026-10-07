/**
 * The numbers on the Developer page's Overview (docs/DESIGN-REFRESH.md 4.3, docs/ROLES.md 2.3): the
 * data (freshness, rows, checks), the metric dictionary (tiers by view, changed definitions, no
 * target), the runtime (summary times, errors) and storage. They describe the app and its data,
 * not people, so they carry no metric dictionary entry; each opens the records, the Data room
 * entry or the inventory rows it counts. Pure.
 */

import { type DataStandard, meetsStandard, TIER_LABEL, type Tier } from '@/data/quality/tier'
import type { QualityIndex, RuleId } from '@/data/quality/types'
import { DATASET_KEYS, type DatasetKey, datasetDef } from '@/data/schema'
import type { TimingEntry } from '@/lib/timing'
import { METRIC_VIEW_LABEL, readsNoData } from '@/metrics/registry'
import type { MetricDef, MetricsApi, MetricView } from '@/metrics/types'
import type { StorageRow } from './storageKeys'

/* ───────────── data ───────────── */

export interface FreshRow {
  key: DatasetKey
  dataset: string
  /** Days from the latest event to the as-of date; null when there is none. */
  ageDays: number | null
  maxDays: number
  fresh: boolean
  /** What the age is measured on: "the latest hire or termination". */
  what: string
  latest: string | null
}

/** Each loaded dataset with a freshness rule: its age against its limit. */
export function freshnessRows(
  quality: Pick<QualityIndex, 'dataset'>,
  keys: readonly DatasetKey[] = DATASET_KEYS,
): FreshRow[] {
  const out: FreshRow[] = []
  for (const key of keys) {
    const ds = quality.dataset(key)
    const f = ds.freshness
    if (!ds.rows || f.maxDays == null) continue
    out.push({
      key,
      dataset: ds.label,
      ageDays: f.ageDays,
      maxDays: f.maxDays,
      fresh: f.fresh,
      what: f.what ?? '',
      latest: f.latest,
    })
  }
  return out
}

export interface DatasetRowCount {
  key: DatasetKey
  dataset: string
  rows: number
  tier: Tier
  tierLabel: string
}

/** Rows loaded per dataset, with each dataset's tier. */
export function rowsByDataset(
  quality: Pick<QualityIndex, 'dataset'>,
  keys: readonly DatasetKey[] = DATASET_KEYS,
): DatasetRowCount[] {
  return keys.map((key) => {
    const ds = quality.dataset(key)
    return { key, dataset: ds.label, rows: ds.rows, tier: ds.tier, tierLabel: TIER_LABEL[ds.tier] }
  })
}

/** Datasets loaded (any rows) and how many of them are gold. */
export function goldCount(
  quality: Pick<QualityIndex, 'dataset'>,
  keys: readonly DatasetKey[] = DATASET_KEYS,
) {
  const loaded = keys.filter((k) => quality.dataset(k).rows > 0)
  return { gold: loaded.filter((k) => quality.dataset(k).tier === 'gold').length, loaded: loaded.length }
}

/**
 * The checks that flag rows one by one, in the order the Quality panel lists them. "No blocking
 * issues" and "Issue rate within 2%" judge a whole dataset (pass or fail), so they are not drawn as
 * shares of rows.
 */
export const ROW_CHECKS: readonly RuleId[] = ['references', 'dates-in-order', 'no-duplicates']

export interface CheckCell {
  key: DatasetKey
  dataset: string
  check: string
  rule: RuleId
  /** Rows failing ÷ rows loaded; null when the dataset has no rows. */
  share: number | null
  count: number
  /** Indexes of the failing rows (for the drill). */
  rowIndexes: readonly number[]
  rows: number
}

/** Each loaded dataset and row check: the share of rows failing it. */
export function checkCells(
  quality: Pick<QualityIndex, 'dataset' | 'checks'>,
  keys: readonly DatasetKey[] = DATASET_KEYS,
): CheckCell[] {
  const out: CheckCell[] = []
  for (const key of keys) {
    const ds = quality.dataset(key)
    if (!ds.rows) continue
    const rules = quality.checks(key)
    for (const id of ROW_CHECKS) {
      const r = rules.find((x) => x.id === id)
      if (!r) continue
      out.push({
        key,
        dataset: ds.label,
        check: r.label,
        rule: id,
        share: ds.rows ? r.count / ds.rows : null,
        count: r.count,
        rowIndexes: r.rows,
        rows: ds.rows,
      })
    }
  }
  return out
}

/* ───────────── the metric dictionary ───────────── */

/** The datasets a metric that names no fields is judged by: its home view's. */
export type ViewDatasets = (view: string) => readonly DatasetKey[]

/** Series of "Metrics by tier and view", in tier order (gold first). */
export const METRIC_TIER_SERIES = ['Gold', 'Silver', 'Bronze', 'No data'] as const

export interface MetricTierCount {
  view: MetricView
  viewLabel: string
  tier: Tier
  tierLabel: string
  count: number
}

/** A metric's tier with the settings in force, judged as on screen; null for a rule or a setting. */
export function metricTier(
  def: MetricDef,
  metrics: Pick<MetricsApi, 'usesOf'>,
  quality: Pick<QualityIndex, 'tierOf'>,
  viewDatasets: ViewDatasets,
): Tier | null {
  if (readsNoData(def)) return null
  return quality.tierOf(metrics.usesOf(def.id), viewDatasets(def.views[0]))
}

/** Every metric that reads data, by home view and tier. */
export function metricTierCounts(
  metrics: Pick<MetricsApi, 'list' | 'usesOf'>,
  quality: Pick<QualityIndex, 'tierOf'>,
  viewDatasets: ViewDatasets,
): MetricTierCount[] {
  const counts = new Map<string, MetricTierCount>()
  for (const def of metrics.list) {
    const tier = metricTier(def, metrics, quality, viewDatasets)
    if (!tier) continue
    const view = def.views[0]
    const k = `${view}|${tier}`
    const hit = counts.get(k)
    if (hit) hit.count++
    else
      counts.set(k, {
        view,
        viewLabel: METRIC_VIEW_LABEL[view] ?? view,
        tier,
        tierLabel: TIER_LABEL[tier],
        count: 1,
      })
  }
  return [...counts.values()]
}

/** How many metrics that read data sit below the data standard (held back on screen). */
export function belowStandardCount(
  rows: readonly Pick<MetricTierCount, 'tier' | 'count'>[],
  standard: DataStandard,
): number {
  return rows.reduce((n, r) => n + (r.tier === 'none' || !meetsStandard(r.tier, standard) ? r.count : 0), 0)
}

export interface ViewCount {
  view: MetricView
  viewLabel: string
  count: number
  /** The metric ids counted. */
  ids: readonly string[]
}

function byHomeView(defs: readonly MetricDef[]): ViewCount[] {
  const out = new Map<MetricView, ViewCount>()
  for (const d of defs) {
    const view = d.views[0]
    const hit = out.get(view)
    if (hit) {
      hit.count++
      ;(hit.ids as string[]).push(d.id)
    } else out.set(view, { view, viewLabel: METRIC_VIEW_LABEL[view] ?? view, count: 1, ids: [d.id] })
  }
  return [...out.values()].sort((a, b) => b.count - a.count || a.viewLabel.localeCompare(b.viewLabel))
}

/** Metrics whose wording, target or settings differ from the defaults, by home view. */
export const changedByView = (metrics: Pick<MetricsApi, 'list' | 'isChanged'>): ViewCount[] =>
  byHomeView(metrics.list.filter((d) => metrics.isChanged(d.id)))

/** Metrics that read data and have no target in force, by home view. */
export const noTargetByView = (metrics: Pick<MetricsApi, 'list' | 'target'>): ViewCount[] =>
  byHomeView(metrics.list.filter((d) => !readsNoData(d) && metrics.target(d.id) == null))

/* ───────────── runtime ───────────── */

/** The per-view summary budget (docs/DESIGN-REFRESH.md 4.3). */
export const SUMMARY_BUDGET_MS = 400

export interface SummaryTime {
  view: string
  label: string
  /**
   * The latest run that computed the summary (one of at least `CACHE_HIT_MS`); the latest run when
   * every run was read from a cache; null for a view with no summary run yet, or none at all.
   */
  ms: number | null
  runs: number
  overBudget: boolean
  /** Every run was a cache hit, so `ms` is the time to read it, not to compute it. */
  cached: boolean
  /** The view has no summary (it adds nothing to the scorecard), or none has run yet. */
  none: boolean
}

/** A summary run this quick was read from the per-context cache, not computed. */
export const CACHE_HIT_MS = 0.5

/**
 * Each view's summary time, slowest first: the latest run that computed it (cache hits are
 * skipped when a computed run exists, and marked when none does). With `views`, every view is
 * listed, those with no run (or no summary) last.
 */
export function summaryTimes(
  entries: readonly TimingEntry[],
  labelOf: (view: string) => string,
  views: readonly string[] = [],
): SummaryTime[] {
  const by = new Map<string, { ms: number; start: number }[]>()
  for (const e of entries) {
    const m = /^census:scorecard:(.+)$/.exec(e.name)
    if (!m) continue
    const list = by.get(m[1])
    if (list) list.push({ ms: e.ms, start: e.start })
    else by.set(m[1], [{ ms: e.ms, start: e.start }])
  }
  const newest = (list: readonly { ms: number; start: number }[]) =>
    list.reduce((a, b) => (b.start >= a.start ? b : a))
  const out: SummaryTime[] = [...by.entries()].map(([view, list]) => {
    const computed = list.filter((r) => r.ms >= CACHE_HIT_MS)
    const pick = newest(computed.length ? computed : list)
    return {
      view,
      label: labelOf(view),
      ms: pick.ms,
      runs: list.length,
      overBudget: pick.ms > SUMMARY_BUDGET_MS,
      cached: !computed.length,
      none: false,
    }
  })
  for (const view of views)
    if (!by.has(view))
      out.push({
        view,
        label: labelOf(view),
        ms: null,
        runs: 0,
        overBudget: false,
        cached: false,
        none: true,
      })
  return out.sort((a, b) => (b.ms ?? -1) - (a.ms ?? -1))
}

/** The scorecard's compute time: each view's summary time added up; null before the first run. */
export const scorecardMs = (times: readonly SummaryTime[]): number | null =>
  times.some((t) => t.ms != null) ? times.reduce((n, t) => n + (t.ms ?? 0), 0) : null

/* ───────────── timings ───────────── */

export interface TimingStat {
  name: string
  runs: number
  median: number
  max: number
  last: number
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Every measure name with its runs, median, max and last ms; slowest median first. */
export function timingStats(entries: readonly TimingEntry[]): TimingStat[] {
  const by = new Map<string, TimingEntry[]>()
  for (const e of entries) {
    const list = by.get(e.name)
    if (list) list.push(e)
    else by.set(e.name, [e])
  }
  return [...by.entries()]
    .map(([name, list]) => {
      const ms = list.map((e) => e.ms)
      const last = list.reduce((a, b) => (b.start >= a.start ? b : a))
      return { name, runs: list.length, median: median(ms), max: Math.max(...ms), last: last.ms }
    })
    .sort((a, b) => b.median - a.median || a.name.localeCompare(b.name))
}

/** The engine functions among the measures (headlines, summaries, actions), slowest median first. */
export const engineStats = (stats: readonly TimingStat[], top = 15): TimingStat[] =>
  stats.filter((s) => /^census:(headline|scorecard|actions):/.test(s.name)).slice(0, top)

/* ───────────── storage ───────────── */

export interface StorageBar {
  key: string
  bytes: number
  where: string
  /** The keys folded into "Other". */
  folded: readonly string[]
}

/** Bytes per key, the biggest 12 and the rest as "Other (n)". */
export function storageBars(rows: readonly StorageRow[], top = 12): StorageBar[] {
  const sized = rows.filter((r) => r.bytes != null).sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))
  const head: StorageBar[] = sized
    .slice(0, top)
    .map((r) => ({ key: r.key, bytes: r.bytes ?? 0, where: r.where, folded: [] }))
  const rest = sized.slice(top)
  if (rest.length)
    head.push({
      key: `Other (${rest.length})`,
      bytes: rest.reduce((n, r) => n + (r.bytes ?? 0), 0),
      where: 'Several',
      folded: rest.map((r) => r.key),
    })
  return head
}

/** "12.4 KB", "3.1 MB", "512 B". */
export function bytesText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** A dataset's label, for tables that only hold the key. */
export const datasetLabel = (key: DatasetKey): string => datasetDef(key).label
