/**
 * The layout every special analysis shares (docs/ANALYSES.md, 1.3): a Section with the analysis's
 * title and the question it answers, its KPI strip, the readout beside the lead figure, then the
 * panel's own sections. Also the frame of an analysis that is not ready: the same heading over a
 * plain empty state that names the column to add.
 */
import { Button, EmptyState, goTo, KpiStrip, Readout, Section } from '@/components'
import { useRouteShown } from '@/components/RouteLink'
import type { AnalyticsContext } from '@/data/context'
import type { AnalysisDef, AnalysisFrameParts, AnalysisModel, Readiness } from '../types'

export function AnalysisFrame<M extends AnalysisModel>({
  def,
  model,
  ctx,
  actions,
  lead,
  children,
}: AnalysisFrameParts & { def: AnalysisDef<M>; model: M; ctx: AnalyticsContext }) {
  return (
    <>
      <Section title={def.title} dek={def.dek(ctx)} actions={actions} id={`analysis-${def.key}`}>
        {model.kpis.length > 0 && (
          <KpiStrip kpis={model.kpis} id={`hrbp-${def.key}-kpis`} title={`${def.label} key figures`} />
        )}
        {/* Phones: the lead figure first, then the readout (as on every Overview). */}
        <div className="col-span-full min-w-0 max-md:order-1 lg:col-span-4">
          <Readout
            id={`hrbp-${def.key}-readout`}
            exportTitle={`${def.label} readout`}
            findings={model.findings}
            span={12}
            limit={4}
            emptyText="Nothing stands out in this scope."
          />
        </div>
        <div className="col-span-full flex min-w-0 flex-col gap-4 max-md:contents lg:col-span-8">{lead}</div>
      </Section>
      {children}
    </>
  )
}

/** An analysis whose required data is missing: its heading, the reason and one way forward. */
export function AnalysisNotReady({
  def,
  ctx,
  readiness,
}: {
  def: AnalysisDef
  ctx: AnalyticsContext
  readiness: Extract<Readiness, { ready: false }>
}) {
  const dataRoom = useRouteShown('data')
  return (
    <Section title={def.title} dek={def.dek(ctx)} id={`analysis-${def.key}`}>
      <EmptyState
        title={`${def.label} needs more data`}
        body={readiness.message}
        action={
          readiness.dataRoom &&
          dataRoom && (
            <Button size="sm" onClick={() => goTo('data')}>
              Open the Data room
            </Button>
          )
        }
      />
    </Section>
  )
}
