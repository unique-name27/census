/**
 * The analytics context every view reads: as-of date, reporting windows, the scoped datasets,
 * the unscoped company datasets (for "vs company" benchmarks) and the org index.
 */
import { createContext, type ReactNode, use, useMemo } from 'react'
import { todayISO } from '@/lib/dates'
import type { DatasetKey, Datasets, ISODate } from './schema'
import {
  buildOrgIndex,
  type Filters,
  hasOrgFilter,
  type OrgIndex,
  periodWindows,
  resolveAsOf,
  scopeDatasets,
  scopeLabel,
  type Window,
} from './scope'
import { SAMPLE_AS_OF, type SourceMeta, useCensus } from './store'

export interface AnalyticsContext {
  asOf: ISODate
  window: Window
  prior: Window
  filters: Filters
  scopeLabel: string
  /** No org filter is applied. */
  isCompany: boolean
  /** Org-scoped datasets. */
  data: Datasets
  /** Unscoped datasets, for company benchmarks. */
  all: Datasets
  /** Index over all employees (current and former). */
  org: OrgIndex
  sources: Record<DatasetKey, SourceMeta>
  /** Every dataset is the generated sample. */
  isSample: boolean
  /** Pay amounts may be shown and exported. */
  showPay: boolean
}

export function buildContext(args: {
  data: Datasets
  sources: Record<DatasetKey, SourceMeta>
  filters: Filters
  asOfOverride: ISODate | null
  showPay: boolean
  today?: ISODate
}): AnalyticsContext {
  const { data, sources, filters, asOfOverride, showPay } = args
  const isSample = Object.values(sources).every((s) => s.kind === 'sample')
  const asOf = isSample && !asOfOverride ? SAMPLE_AS_OF : resolveAsOf(data, args.today ?? todayISO(), asOfOverride)
  const { current, prior } = periodWindows(filters.period, asOf, { start: filters.customStart, end: filters.customEnd })
  const org = buildOrgIndex(data.employees)
  return {
    asOf,
    window: current,
    prior,
    filters,
    scopeLabel: scopeLabel(filters, org),
    isCompany: !hasOrgFilter(filters),
    data: scopeDatasets(data, filters, org),
    all: data,
    org,
    sources,
    isSample,
    showPay,
  }
}

const Ctx = createContext<AnalyticsContext | null>(null)

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const data = useCensus((s) => s.data)
  const sources = useCensus((s) => s.sources)
  const filters = useCensus((s) => s.filters)
  const asOfOverride = useCensus((s) => s.asOfOverride)
  const showPay = useCensus((s) => s.showPay)
  const value = useMemo(
    () => buildContext({ data, sources, filters, asOfOverride, showPay }),
    [data, sources, filters, asOfOverride, showPay],
  )
  return <Ctx value={value}>{children}</Ctx>
}

export function useAnalytics(): AnalyticsContext {
  const v = use(Ctx)
  if (!v) throw new Error('useAnalytics must be used inside <AnalyticsProvider>')
  return v
}
