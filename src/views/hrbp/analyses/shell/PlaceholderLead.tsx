/**
 * A lead figure laid out before its analysis's engine lands: the real id, metric, lineage and
 * datasheet at the lead height, with the empty state its data would show (or that it is not built
 * yet). Each analysis's panel replaces it with its own lead figure.
 */
import { Figure } from '@/charts'
import { useChartHeight } from '@/components/useNarrow'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { definitionsOf } from '../../engine/wording'
import { missingFor } from '../fields'
import type { AnalysisDef } from '../types'

export function PlaceholderLead({
  def,
  ctx,
  title,
  subtitle,
  uses,
}: {
  def: AnalysisDef
  ctx: AnalyticsContext
  title: string
  subtitle: string
  uses: readonly FieldRef[]
}) {
  const height = useChartHeight('lead')
  const gap = missingFor(def.missing(ctx), def.leadFigure)
  return (
    <Figure
      id={def.leadFigure}
      metric={def.leadMetric}
      uses={uses}
      title={title}
      subtitle={subtitle}
      data={[]}
      columns={[]}
      definitions={definitionsOf(ctx.metrics, def.leadMetric)}
      empty={gap?.message ?? 'This figure is not built yet.'}
      emptyHeight={height}
    />
  )
}
