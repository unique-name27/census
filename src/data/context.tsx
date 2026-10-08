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
 *
 * `jobs` is the job architecture (docs/TAXONOMY.md, section 7): job families with their job
 * functions, each function's family and chip development stage (docs/ANALYSES.md, 4.2 and 4.3),
 * from the official lists and the mapped Employees rows. Company-wide; it never follows the filters. `offerDeclineReasons` is the Offer
 * decline reasons list in force, each reason with its theme (docs/ANALYSES.md, 3.2).
 */
import { createContext, type ReactNode, use, useDeferredValue, useMemo } from 'react'
import { type AccessContext, type AccessInput, accessFor, HR_INPUT, picksOf } from '@/access/context'
import { PICKER_COPY } from '@/access/copy'
import { PICK_OF, SCOPE_OF } from '@/access/modes'
import { showCostIn, showImmigrationIn, showPayIn } from '@/access/pay'
import {
  applyScope,
  clampFilters,
  DEFAULT_DEDUP_DAYS,
  type RegionIndex,
  regionIndex,
  type ScopeLock,
  scopeFor,
  scopeLabelOf,
} from '@/access/scopes'
import { picksOfState, useMode } from '@/access/store'
import { timed } from '@/lib/timing'
import { defaultMetrics, metricsApi } from '@/metrics/api'
import { qualityRulesOf } from '@/metrics/quality'
import type { MetricsApi } from '@/metrics/types'
import { contextDeclineReasons } from './lists/declines'
import { EMPTY_LISTS } from './lists/edit'
import { effectiveLists, validationVocab } from './lists/effective'
import { contextJobs, type JobArchitecture } from './lists/jobs'
import { useLists } from './lists/store'
import type { ListsState, ListValue } from './lists/types'
import { contextUniversities } from './lists/universities'
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
  /**
   * Individual pay amounts may be shown and exported (`pay: true` columns): a mode with the "Show
   * pay amounts" switch (Developer, HR, CHRO, Compensation) while it is on (docs/ROLES-V2.md 3.1).
   */
  showPay: boolean
  /**
   * Cost totals over groups may be shown and exported (`cost: true` columns): `showPay`, or Finance
   * mode always (its totals stay under the cost guard: 5 or more people, whole business units).
   */
  showCost: boolean
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
  /**
   * Job families and the job functions in each, with each function's family (`familyOf`) and stage
   * order (`stageOf`), from the official lists and `all.employees` (`src/data/lists/jobs.ts`).
   */
  jobs: JobArchitecture
  /**
   * The Offer decline reasons list in force (Census's reasons plus any you added), each value's
   * `attrs.theme` its theme. Read declined offers through `readDeclineReason(raw, ctx.offerDeclineReasons)`.
   */
  offerDeclineReasons: readonly ListValue[]
  /**
   * The Universities list in force, for grouping by school: a retired spelling reads as the name
   * that replaced it. Read a row's school with `readUniversity(raw, universityNames(ctx.universities))`
   * from `@/data/lists/universities` (docs/ANALYSES.md, 2.3).
   */
  universities: readonly ListValue[]
  /**
   * The mode (docs/ROLES-V2.md 8.5; docs/ROLES.md 6.4): one of eleven, its scope (`scope`: the
   * manager's org, a business unit, a region or a recruiter's reqs), its pay view, and `decide`
   * bound to the mode. Ask it, never the mode store, so an off-screen render with its own mode gets
   * its own answers. In a scoped mode `filters` and `data` are always inside the scope and
   * `isCompany` is false; `all` is never narrowed. In Manager mode engagement surveys are off.
   */
  access: AccessContext
  /**
   * The one region index (docs/ROLES-V2.md 1.3): each location's region from the Locations list in
   * force (the provider builds it), else its known site's region ("APAC"). Company-wide; it never
   * follows the filters. Optional for hand-built test contexts: read it with `ctx.regions ??
   * regionIndex(null, ctx.all)`.
   */
  regions?: RegionIndex
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
  /** The mode and its picks; HR when not given (every existing test). */
  access?: AccessInput
  /** The saved official lists (Settings > Official lists); none saved when not given. */
  lists?: ListsState
  /**
   * The region index for HRBP for a region (`regionIndex` over the Locations list in force; the
   * provider builds it). Without it, each location takes its known site's region, else its country's.
   */
  regions?: RegionIndex | null
  /** Department → business unit on the Departments list in force, for HRBP for a business unit's clamp. */
  departmentParents?: ReadonlyMap<string, string | null> | null
}): AnalyticsContext {
  const { sources, asOfOverride } = args
  const metrics = args.metrics ?? defaultMetrics()
  const applied = args.applied ?? referenceLayer(withAllDatasets(args.data), args.mappings ?? NO_MAPPINGS)
  const all = applied.datasets
  const isSample = Object.values(sources).every((s) => s.kind === 'sample')
  const asOf = contextAsOf({ data: args.data, sources, asOfOverride, today: args.today })
  const org = buildOrgIndex(all.employees)
  // A scoped mode holds Census to its scope (docs/ROLES-V2.md part 2): the one clamp runs again here
  // (defensive: the store's filter guard already clamps), then the filters, then `applyScope`.
  // Without a usable pick the scope holds nobody.
  const accessIn = args.access ?? HR_INPUT
  const mode = accessIn.mode
  const manager = mode === 'manager'
  let scope: ScopeLock | null = null
  let unset = false
  if (SCOPE_OF[mode]) {
    const held = scopeFor(mode, picksOf(accessIn), {
      org,
      asOf,
      all,
      regions: args.regions,
      departmentParents: args.departmentParents,
      dedupDays: metrics.paramDef(DEDUP_METRIC, 'dedupDays')
        ? metrics.num(DEDUP_METRIC, 'dedupDays')
        : DEFAULT_DEDUP_DAYS,
    })
    scope = held.scope
    unset = held.unset
  }
  const filters = clampFilters(args.filters, scope, mode)
  const showPay = showPayIn(mode, args.showPay)
  const pickKind = PICK_OF[mode]
  const { current, prior } = periodWindows(filters.period, asOf, {
    start: filters.customStart,
    end: filters.customEnd,
  })
  let versions = args.versions
  if (!versions) {
    versions = versionsFallback.get(args.data) ?? {}
    versionsFallback.set(args.data, versions)
  }
  return {
    asOf,
    window: current,
    prior,
    filters,
    scopeLabel:
      unset && pickKind
        ? PICKER_COPY[pickKind].none
        : scope
          ? scopeLabelOf(scope, filters, org)
          : scopeLabel(filters, org),
    isCompany: !scope && !unset && !hasOrgFilter(filters),
    data: applyScope(scopeDatasets(all, filters, org), scope),
    all,
    org,
    sources,
    isSample,
    showPay,
    showCost: showCostIn(mode, args.showPay),
    showImmigration: showImmigrationIn(mode, args.showImmigration ?? false),
    features: manager ? NO_FEATURES : (args.features ?? NO_FEATURES),
    quality: args.quality ?? qualityFor(applied, versions, asOf, qualityRulesOf(metrics)),
    standard: args.standard ?? DEFAULT_STANDARD,
    reference: summaryOf(applied),
    metrics,
    jobs: contextJobs(args.lists ?? EMPTY_LISTS, sources, all.employees, asOf),
    offerDeclineReasons: contextDeclineReasons(args.lists ?? EMPTY_LISTS, sources),
    universities: contextUniversities(args.lists ?? EMPTY_LISTS, sources),
    regions: args.regions ?? regionIndex(null, all),
    access: accessFor(mode, scope, metrics, unset),
  }
}

/** The metric whose `dedupDays` setting matches pre-hires to accepted offers (Onboarding's). */
const DEDUP_METRIC = 'onboarding.upcoming.starts'

/** The region index over the Locations list in force (official, else proposed from the data). */
export function contextRegions(
  lists: ListsState,
  data: Datasets,
  sources: Record<DatasetKey, SourceMeta>,
): RegionIndex {
  return regionIndex(effectiveLists(lists, data, sources).location?.values, data)
}

const parentsMemo = new WeakMap<object, ReadonlyMap<string, string | null>>()

/** Department → business unit on the Departments list in force (official, else proposed from the data). */
export function contextDepartmentParents(
  lists: ListsState,
  data: Datasets,
  sources: Record<DatasetKey, SourceMeta>,
): ReadonlyMap<string, string | null> {
  const values = effectiveLists(lists, data, sources).department?.values ?? []
  let hit = parentsMemo.get(values)
  if (!hit) {
    hit = new Map(values.map((v) => [v.value, v.parent ?? null]))
    parentsMemo.set(values, hit)
  }
  return hit
}

const Ctx = createContext<AnalyticsContext | null>(null)
const PendingCtx = createContext(false)

export function AnalyticsProvider({
  children,
  access: override,
}: {
  children: ReactNode
  /** A mode for this tree only (an off-screen render: a figure scan as a role, a whole-view export). */
  access?: AccessInput
}) {
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
  const liveMode = useMode((s) => s.mode)
  const livePicks = useMode((s) => s.picks)
  const liveManager = useMode((s) => s.managerId)
  const mode = override?.mode ?? liveMode
  const p = override ? picksOf(override) : picksOfState({ picks: livePicks, managerId: liveManager })
  // Keyed on the picks' values, so a new override object with the same picks rebuilds nothing.
  const managerId = p.managerId ?? null
  const unit = p.unit ?? null
  const region = p.region ?? null
  const recruiterName = p.recruiter?.name ?? null
  const recruiterId = p.recruiter?.id ?? null
  const accessIn = useMemo<AccessInput>(
    () => ({
      mode,
      picks: {
        managerId,
        unit,
        region,
        recruiter: recruiterName ? { name: recruiterName, id: recruiterId } : null,
      },
    }),
    [mode, managerId, unit, region, recruiterName, recruiterId],
  )
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
    () => timed('census:quality', () => qualityFor(applied, versions, asOf, rules, vocab)),
    [applied, versions, asOf, rules, vocab],
  )
  // The HRBP scopes read the lists in force: regions from the Locations list, departments' units.
  const scopeKind = SCOPE_OF[mode]
  // Every reader shares this index (Onboarding's and Listening's regions too). Without a saved
  // Locations list the proposed one takes each site's own region, which `buildContext`'s fallback
  // gives without proposing every list.
  const savedLocations = !!savedLists.lists.location
  const regions = useMemo(
    () =>
      scopeKind === 'region' || savedLocations ? contextRegions(savedLists, applied.datasets, sources) : null,
    [scopeKind, savedLocations, savedLists, applied, sources],
  )
  const departmentParents = useMemo(
    () => (scopeKind === 'unit' ? contextDepartmentParents(savedLists, applied.datasets, sources) : null),
    [scopeKind, savedLists, applied, sources],
  )
  const value = useMemo(
    () =>
      timed('census:context', () =>
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
          access: accessIn,
          lists: savedLists,
          regions,
          departmentParents,
        }),
      ),
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
      accessIn,
      savedLists,
      regions,
      departmentParents,
    ],
  )
  // A filter, mode or data change recomputes every engine. The new context is built in the
  // background (useDeferredValue) while the page keeps the previous one; `useAnalyticsPending()`
  // is true meanwhile, so Figure and KpiStrip hold their old render at 60% opacity, no jump.
  const deferred = useDeferredValue(value)
  return (
    <Ctx value={deferred}>
      <PendingCtx value={deferred !== value}>{children}</PendingCtx>
    </Ctx>
  )
}

/**
 * True while a newer analytics context is being computed in the background and the page still
 * shows the previous one (docs/DESIGN-REFRESH.md 2.11). Outside a provider it is false.
 */
export function useAnalyticsPending(): boolean {
  return use(PendingCtx)
}

/** The analytics context, or null outside a provider (shared pieces that also render alone). */
export function useAnalyticsIfAny(): AnalyticsContext | null {
  return use(Ctx)
}

export function useAnalytics(): AnalyticsContext {
  const v = use(Ctx)
  if (!v) throw new Error('useAnalytics must be used inside <AnalyticsProvider>')
  return v
}
