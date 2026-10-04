/**
 * `defineMetrics(view, defs)`: how a view registers its metrics, in `src/views/<key>/metrics.ts`.
 *
 * ```ts
 * import { defineMetrics } from '@/metrics/define'
 * export const metrics = defineMetrics('hrbp', [
 *   { id: 'hrbp.attrition.voluntary', name: 'Voluntary attrition', definition: '…', unit: 'pct',
 *     goodDirection: 'down', uses: ['employees.terminationDate', 'employees.terminationType'] },
 * ])
 * ```
 *
 * Import this module and `@/metrics/types` directly (not the `@/metrics` barrel), and keep a
 * view's `metrics.ts` free of React and of `@/data/context`, so the catalog can load every view's
 * entries without an import cycle.
 */
import type { MetricDef, MetricView, ParamDef } from './types'

/** A metric as a view writes it: `views` defaults to the view itself and `params` to none. */
export type MetricInput = Omit<MetricDef, 'views' | 'params'> & {
  /** Other views it also appears in; the defining view is always first. */
  views?: readonly MetricView[]
  params?: readonly ParamDef[]
}

/** The view's metrics, each with its home view first in `views` and `params` filled in. */
export function defineMetrics(view: MetricView, defs: readonly MetricInput[]): MetricDef[] {
  return defs.map((d) => ({
    ...d,
    views: [view, ...(d.views ?? []).filter((v) => v !== view)],
    params: d.params ?? [],
  }))
}
