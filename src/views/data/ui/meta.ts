/**
 * The export stamp for Data room downloads: no scope or window, the as-of date and whether the
 * data is the sample company.
 */
import type { ExportMeta } from '@/charts'
import type { AnalyticsContext } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'

export function roomMeta(ctx: Pick<AnalyticsContext, 'asOf' | 'isSample'>, tab?: string): ExportMeta {
  return {
    view: 'Data room',
    ...(tab ? { tab } : {}),
    scope: 'All datasets',
    window: '',
    asOf: ctx.asOf,
    isSample: ctx.isSample,
    company: ctx.isSample ? SAMPLE_COMPANY : 'Company data',
  }
}
