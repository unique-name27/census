/**
 * The analytics context every view reads: as-of date, reporting windows, the scoped datasets,
 * the unscoped company datasets (for "vs company" benchmarks), the org index, and the quality
 * index with the data standard.
 *
 * `data` and `all` are the datasets after your reference mappings (Data room → Categories &
 * mapping). The mappings and the quality index depend only on the data, its versions, the
 * as-of date and the data quality rules, so changing a filter never recomputes them.
 *
 * `metrics` is the metric dictionary with your changes (docs/METRICS.md): engines read every
 * calculation setting through `ctx.metrics.param(id, key)`, and the quality index uses the data
 * quality rules it holds. It is rebuilt only when the dictionary changes.
 *
 * Every dataset key is always present in `data` and `all` (an empty list when nothing is
 * loaded), including datasets added after rows were saved in this browser.
 */
import { createContext, type ReactNode, use, useMemo } from 'react'
import { defaultMetrics, metricsApi } from '@/metrics/api'
import { qualityRulesOf } from '@/metrics/quality'
import type { MetricsApi } from '@/metrics/types'
import { validationVocab } from './lists/effective'
import { useLists } from './lists/store'
import { computeQuality, type ReferenceEffect } from './quality/compute'
import type { FieldRef } from './quality/fieldRef'
import { DEFAULT_QUALITY_RULES, type QualityRules } from './quality/rules'
import { type DataStandard, DEFAULT_STANDARD } from './quality/tier'
import type { DatasetVersion, QualityIndex } from './quality/types'
import type { VocabOverlay } from './quality/vocab'
import { applyReferenceMappings, targetRefs } from './reference/apply'
import type { AppliedReference, ReferenceMapping } from './reference/types'
import { type DatasetKey, type Datasets, type ISODate, withAllDatasets } from './schema'
import {
  buildOrgIndex,
  type Filters,
  hasOrgFilter,
  type OrgIndex,
  periodWindows,
  scopeDatasets,
  scopeLabel,
  type Window,
} from './scope'
import { contextAsOf, type SourceMeta, useCensus } from './store'

/** What your reference mappings changed, as applied to `data` and `all`. */
export interface ReferenceSummary {
  mappings: readonly ReferenceMapping[]
  /** Rows changed per field, e.g. { 'employees.businessUnit': 14 }. */
  changes: AppliedReference['changes']
  /** Rows changed over every field. */
  total: number
  /** Mappings that could not be applied, with the reason. */
  skipped: AppliedReference['skipped']
}

export interface AnalyticsContext {
  asOf: ISODate
  window: Window
  prior: Window
  filters: Filters
  scopeLabel: string
  /** No org filter is applied. */
  isCompany: boolean
  /** Org-scoped datasets, after reference mappings. */
  data: Datasets
  /** Unscoped datasets after reference mappings, for company benchmarks. */
  all: Datasets
  /** Index over all employees (current and former). */
  org: OrgIndex
  sources: Record<DatasetKey, SourceMeta>
  /** Every dataset is the generated sample. */
  isSample: boolean
  /** Pay amounts may be shown and exported. */
  showPay: boolean
  /** Work authorization types may be shown per person and exported (session only). */
  showImmigration: boolean
  /** Feature switches from Settings that change what a view shows. */
  features: Features
  /** Tiers of every dataset and field, with explanations. */
  quality: QualityIndex
  /** The lowest tier the dashboard shows. */
  standard: DataStandard
  reference: ReferenceSummary
  /** The metric dictionary: wording, targets and the calculation settings engines read. */
  metrics: MetricsApi
}

export interface Features {
  /** Engagement and eNPS surveys show in Listening (Settings > Privacy; off by default). */
  engagementSurveys: boolean
}
const NO_FEATURES: Features = { engagementSurveys: false }

const NO_MAPPINGS: readonly ReferenceMapping[] = []

/** Reference mappings applied to the loaded data; same object for the same inputs. */
export function referenceLayer(data: Datasets, mappings: readonly ReferenceMapping[]): AppliedReference {
  return applyReferenceMappings(data, mappings)
}

/**
 * The quality index for the mapped data under the data quality rules in force (the defaults when
 * not given). Memoized inside `computeQuality`; pass the rules from `qualityRulesOf` so the same
 * values reuse the same index.
 */
export function qualityFor(
  applied: AppliedReference,
  versions: Partial<Record<DatasetKey, DatasetVersion | null>>,
  asOf: ISODate,
  rules?: QualityRules,
  /** The official lists in force (`validationVocab`); the built-in vocabularies when not given. */
  vocab?: VocabOverlay | null,
): QualityIndex {
  return computeQuality(applied.datasets, versions, undefined, {
    asOf,
    reference: effectOf(applied),
    ...(rules && rules !== DEFAULT_QUALITY_RULES ? { rules } : {}),
    ...(vocab ? { vocab } : {}),
  })
}

const effects = new WeakMap<AppliedReference, ReferenceEffect | null>()
function effectOf(applied: AppliedReference): ReferenceEffect | null {
  if (!applied.total) return null
  let e = effects.get(applied)
  if (e === undefined) {
    e = { changes: applied.changes, rows: applied.rows, by: applied.by, at: changedAt(applied) }
    effects.set(applied, e)
  }
  return e
}

/** When the latest applied mapping that changed each field was made (a later remap than a certification caps it). */
function changedAt(applied: AppliedReference): Partial<Record<FieldRef, string>> {
  const at: Partial<Record<FieldRef, string>> = {}
  const skipped = new Set(applied.skipped.map((s) => s.id))
  for (const m of applied.mappings) {
    if (skipped.has(m.id) || !m.at) continue
    for (const ref of targetRefs(m)) {
      const prev = at[ref]
      if (applied.changes[ref] && (!prev || m.at > prev)) at[ref] = m.at
    }
  }
  return at
}

const summaries = new WeakMap<AppliedReference, ReferenceSummary>()
function summaryOf(applied: AppliedReference): ReferenceSummary {
  let s = summaries.get(applied)
  if (!s) {
    s = {
      mappings: applied.mappings,
      changes: applied.changes,
      total: applied.total,
      skipped: applied.skipped,
    }
    summaries.set(applied, s)
  }
  return s
}

const versionsFallback = new WeakMap<Datasets, Partial<Record<DatasetKey, DatasetVersion | null>>>()

export function buildContext(args: {
  data: Datasets
  sources: Record<DatasetKey, SourceMeta>
  filters: Filters
  asOfOverride: ISODate | null
  showPay: boolean
  /** Off when not given. */
  showImmigration?: boolean
  /** Every switch off when not given. */
  features?: Features
  today?: ISODate
  /** Version records per dataset; tests may leave them out (every dataset is then bronze). */
  versions?: Partial<Record<DatasetKey, DatasetVersion | null>>
  /** Reference mappings to apply, or an already applied layer (the provider memoizes it). */
  mappings?: readonly ReferenceMapping[]
  applied?: AppliedReference
  standard?: DataStandard
  quality?: QualityIndex
  /** The metric dictionary; every metric at its defaults when not given. */
  metrics?: MetricsApi
}): AnalyticsContext {
  const { sources, filters, asOfOverride, showPay } = args
  const metrics = args.metrics ?? defaultMetrics()
  const applied = args.applied ?? referenceLayer(withAllDatasets(args.data), args.mappings ?? NO_MAPPINGS)
  const all = applied.datasets
  const isSample = Object.values(sources).every((s) => s.kind === 'sample')
  const asOf = contextAsOf({ data: args.data, sources, asOfOverride, today: args.today })
  const { current, prior } = periodWindows(filters.period, asOf, {
    start: filters.customStart,
    end: filters.customEnd,
  })
  let versions = args.versions
  if (!versions) {
    versions = versionsFallback.get(args.data) ?? {}
    versionsFallback.set(args.data, versions)
  }
  const org = buildOrgIndex(all.employees)
  return {
    asOf,
    window: current,
    prior,
    filters,
    scopeLabel: scopeLabel(filters, org),
    isCompany: !hasOrgFilter(filters),
    data: scopeDatasets(all, filters, org),
    all,
    org,
    sources,
    isSample,
    showPay,
    showImmigration: args.showImmigration ?? false,
    features: args.features ?? NO_FEATURES,
    quality: args.quality ?? qualityFor(applied, versions, asOf, qualityRulesOf(metrics)),
    standard: args.standard ?? DEFAULT_STANDARD,
    reference: summaryOf(applied),
    metrics,
  }
}

const Ctx = createContext<AnalyticsContext | null>(null)

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const data = useCensus((s) => s.data)
  const sources = useCensus((s) => s.sources)
  const filters = useCensus((s) => s.filters)
  const asOfOverride = useCensus((s) => s.asOfOverride)
  const showPay = useCensus((s) => s.showPay)
  const showImmigration = useCensus((s) => s.showImmigration)
  const engagementSurveys = useCensus((s) => s.engagementSurveys)
  const versions = useCensus((s) => s.versions)
  const mappings = useCensus((s) => s.reference.mappings)
  const standard = useCensus((s) => s.dataStandard)
  const metricsState = useCensus((s) => s.metrics)
  // Layers that don't depend on filters, so a filter change only rescopes.
  const applied = useMemo(() => referenceLayer(withAllDatasets(data), mappings), [data, mappings])
  const features = useMemo<Features>(() => ({ engagementSurveys }), [engagementSurveys])
  const asOf = useMemo(() => contextAsOf({ data, sources, asOfOverride }), [data, sources, asOfOverride])
  // One dictionary object per dictionary state; the rules object only changes with a rule's value.
  const metrics = useMemo(() => metricsApi(metricsState), [metricsState])
  const rules = qualityRulesOf(metrics)
  // Official lists (Settings > Official lists) decide which values count as not recognized.
  const savedLists = useLists((s) => s.state)
  const vocab = validationVocab(savedLists, sources)
  const quality = useMemo(
    () => qualityFor(applied, versions, asOf, rules, vocab),
    [applied, versions, asOf, rules, vocab],
  )
  const value = useMemo(
    () =>
      buildContext({
        data,
        sources,
        filters,
        asOfOverride,
        showPay,
        showImmigration,
        features,
        versions,
        applied,
        standard,
        quality,
        metrics,
      }),
    [
      data,
      sources,
      filters,
      asOfOverride,
      showPay,
      showImmigration,
      features,
      versions,
      applied,
      standard,
      quality,
      metrics,
    ],
  )
  return <Ctx value={value}>{children}</Ctx>
}

export function useAnalytics(): AnalyticsContext {
  const v = use(Ctx)
  if (!v) throw new Error('useAnalytics must be used inside <AnalyticsProvider>')
  return v
}
