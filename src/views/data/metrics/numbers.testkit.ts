/**
 * Every KPI tile and readout finding the six data views compute, for tests that check the metric
 * dictionary against what the screens show: that each number's fields are registered on its
 * metric, and that a changed setting marks every number it changes. Test-only (it runs every
 * engine); not imported by the app.
 */
import type { Finding, Kpi } from '@/components/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type Datasets, type ViewKey } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { MetricsApi } from '@/metrics/types'
import { computeComp } from '@/views/comp/engine/model'
import { computeHrbp } from '@/views/hrbp/engine'
import { orgKeyFigures } from '@/views/org/engine/figures'
import { orgKpis } from '@/views/org/engine/kpis'
import { buildOrgModel, orgLineage } from '@/views/org/engine/model'
import { computeRecruitingUncached } from '@/views/recruiting/engine'
import { compute as computeServices } from '@/views/services/engine'
import { computeTalent } from '@/views/talent/engine'

export interface ShownNumber {
  view: ViewKey
  kind: 'kpi' | 'finding'
  id: string
  metricId: string | undefined
  uses: readonly FieldRef[] | undefined
  /** What a reader sees: the value and note of a tile, the title and detail of a finding. */
  shown: string
}

let sample: Datasets | null = null

/** The sample company in a context with these filters and this dictionary. */
export function sampleContext(metrics?: MetricsApi, filters: Partial<Filters> = {}): AnalyticsContext {
  sample ??= generateSample()
  const data = sample
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
  ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>
  return buildContext({
    data,
    sources,
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
    showPay: false,
    metrics,
  })
}

/** A tile; `strip` tells apart tiles with the same id on two strips of one view. */
const kpi =
  (view: ViewKey, strip?: string) =>
  (k: Kpi): ShownNumber => ({
    view,
    kind: 'kpi',
    id: strip ? `${strip}/${k.id}` : k.id,
    metricId: k.metricId,
    uses: k.uses,
    shown: `${k.value ?? '—'}${k.suppressed ? ' hidden' : ''} | ${k.delta ?? ''} | ${k.note ?? ''}`,
  })

const finding =
  (view: ViewKey) =>
  (f: Finding): ShownNumber => ({
    view,
    kind: 'finding',
    id: f.id,
    metricId: f.metricId,
    uses: f.uses,
    shown: `${f.severity} | ${f.title} | ${f.detail ?? ''}`,
  })

function orgNumbers(ctx: AnalyticsContext): ShownNumber[] {
  const m = buildOrgModel(ctx)
  const key = orgKeyFigures(m, m.rootId, m.dims ? m.matches : null)
  return orgKpis({
    tree: m.tree,
    rootId: m.rootId,
    key,
    scope: { label: 'Whole company', asOf: ctx.asOf, filtered: m.dims },
    flags: m.flags,
    reqRecords: m.reqRecords,
    lineage: orgLineage(m, m.rootId, ctx.filters),
    dims: m.dims,
    openRoles: true,
    metrics: ctx.metrics,
  }).map(kpi('org'))
}

/** Every KPI and finding of every data view, for one context. */
export function allNumbers(ctx: AnalyticsContext): ShownNumber[] {
  const rec = computeRecruitingUncached(ctx)
  const hrbp = computeHrbp(ctx)
  const services = computeServices(ctx)
  const talent = computeTalent(ctx)
  const comp = computeComp(ctx)
  return [
    ...rec.kpis.map(kpi('recruiting')),
    ...rec.findings.map(finding('recruiting')),
    ...hrbp.kpi.kpis.map(kpi('hrbp')),
    ...hrbp.movementKpis.map(kpi('hrbp', 'movement')),
    ...hrbp.orgKpis.map(kpi('hrbp', 'org')),
    ...hrbp.findings.map(finding('hrbp')),
    ...orgNumbers(ctx),
    ...services.kpis.map(kpi('services')),
    ...services.findings.map(finding('services')),
    ...talent.kpis.map(kpi('talent')),
    ...talent.findings.map(finding('talent')),
    ...comp.kpis.map(kpi('comp')),
    ...comp.cycle.kpis.map(kpi('comp', 'cycle')),
    ...comp.findings.map(finding('comp')),
  ]
}
