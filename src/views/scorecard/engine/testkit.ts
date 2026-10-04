/** Fixtures for the scorecard engine tests: hand-built practices and contexts. Not used by the app. */
import type { Finding, Kpi } from '@/components/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { buildSampleState } from '@/data/quality/seed'
import type { DataStandard } from '@/data/quality/tier'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { starterSample } from '@/data/sample/raw'
import { DATASET_KEYS, type DatasetKey, type Datasets, emptyDatasets, type ViewKey } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { MetricsApi } from '@/metrics/types'
import type { ViewDef, ViewSummary } from '../../types'

const sources = (data: Datasets, kind: SourceMeta['kind']) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind, rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

/** An empty upload with a fixed as-of date: every number names no rows, so nothing is gated by data. */
export function fixtureContext(o: { metrics?: MetricsApi; standard?: DataStandard } = {}): AnalyticsContext {
  const data = emptyDatasets()
  return buildContext({
    data,
    sources: sources(data, 'upload'),
    filters: DEFAULT_FILTERS,
    asOfOverride: '2026-09-30',
    showPay: false,
    metrics: o.metrics,
    standard: o.standard,
  })
}

let clean: Datasets | null = null

/** The clean generated sample (every dataset bronze, as the engine tests use it). */
export function sampleContext(
  o: { metrics?: MetricsApi; filters?: Partial<Filters> } = {},
): AnalyticsContext {
  clean ??= generateSample()
  return buildContext({
    data: clean,
    sources: sources(clean, 'sample'),
    filters: { ...DEFAULT_FILTERS, ...o.filters },
    asOfOverride: null,
    showPay: false,
    metrics: o.metrics,
  })
}

let messy: ReturnType<typeof buildSampleState> | null = null

/** The sample as the app loads it (raw extracts, certified and confirmed datasets), under a standard. */
export function tieredSampleContext(standard: DataStandard): AnalyticsContext {
  if (!messy) {
    const base = generateSample()
    messy = buildSampleState(base, starterSample(base).seed, SAMPLE_AS_OF)
  }
  return buildContext({
    data: messy.data,
    sources: sources(messy.data, 'sample'),
    filters: DEFAULT_FILTERS,
    asOfOverride: null,
    showPay: false,
    versions: messy.versions,
    standard,
  })
}

export function kpi(p: Partial<Kpi> & Pick<Kpi, 'id'>): Kpi {
  return { label: p.id, value: 0.5, format: 'pct', ...p }
}

export function finding(p: Partial<Finding> & Pick<Finding, 'id'>): Finding {
  return { severity: 'warning', title: `Finding ${p.id}.`, ...p }
}

/** A view with a fixed summary, or one whose summary throws. */
export function practice(
  key: ViewKey,
  summary: ViewSummary | (() => never),
  o: { label?: string; tabs?: ViewDef['tabs']; datasets?: ViewDef['datasets'] } = {},
): ViewDef {
  return {
    key,
    label: o.label ?? key.charAt(0).toUpperCase() + key.slice(1),
    tabs: o.tabs ?? [
      { key: 'overview', label: 'Overview' },
      { key: 'detail', label: 'Detail' },
    ],
    View: () => null,
    headline: () => ({ value: '', label: '' }),
    datasets: o.datasets ?? ['employees'],
    summary: typeof summary === 'function' ? summary : () => summary,
  }
}
