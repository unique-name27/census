/**
 * Addresses of the Metric definitions tab, carried in the Data room's route tab
 * (`#data.<tab>`). The hash splits on dots, so a metric id's dots travel as slashes:
 *
 *   #data.metrics                          every metric
 *   #data.metrics:comp                     filtered to one view (Compensation)
 *   #data.metrics/comp/merit/spend         open at metric comp.merit.spend
 *   #data.metrics:comp/comp/merit/spend    both
 *
 * Pure, so the parsing is unit-tested; `open.ts` navigates.
 */
import type { MetricView } from '@/metrics/types'

export const METRICS_ROUTE = 'metrics'

const VIEWS: readonly MetricView[] = ['recruiting', 'hrbp', 'org', 'services', 'talent', 'comp', 'ai', 'data']

const isMetricView = (s: string): s is MetricView => (VIEWS as readonly string[]).includes(s)

/** A metric id the way ids are registered: `view.group.name`, letters, digits and hyphens. */
const ID_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9-]+)+$/

export interface MetricsRoute {
  /** The view the list is filtered to; null for every view. */
  view: MetricView | null
  /** The metric to open; null when none is named. */
  metric: string | null
}

/** True when a Data room route tab belongs to the Metric definitions tab. */
export function isMetricsTab(tab: string | null | undefined): boolean {
  const t = (tab ?? '').trim()
  return t === METRICS_ROUTE || t.startsWith(`${METRICS_ROUTE}:`) || t.startsWith(`${METRICS_ROUTE}/`)
}

/** The route tab for the dictionary, optionally filtered to a view and open at a metric. */
export function metricsTab(opts: { view?: MetricView | null; metric?: string | null } = {}): string {
  let out = METRICS_ROUTE
  if (opts.view) out += `:${opts.view}`
  const id = opts.metric?.trim()
  if (id && ID_PATTERN.test(id)) out += `/${id.split('.').join('/')}`
  return out
}

/** Read the dictionary's route tab; anything it doesn't recognize is left out. */
export function parseMetricsTab(tab: string | null | undefined): MetricsRoute {
  const t = (tab ?? '').trim()
  if (!isMetricsTab(t)) return { view: null, metric: null }
  let rest = t.slice(METRICS_ROUTE.length)
  let view: MetricView | null = null
  if (rest.startsWith(':')) {
    const end = rest.indexOf('/')
    const name = end < 0 ? rest.slice(1) : rest.slice(1, end)
    view = isMetricView(name) ? name : null
    rest = end < 0 ? '' : rest.slice(end)
  }
  let metric: string | null = null
  if (rest.startsWith('/')) {
    let id = rest.slice(1).split('/').filter(Boolean).join('.')
    try {
      id = decodeURIComponent(id)
    } catch {
      /* keep it as written */
    }
    metric = ID_PATTERN.test(id) ? id : null
  }
  return { view, metric }
}

/** What the tab does on reaching a metric: bring its detail into view, then focus its name. */
export interface Arrival {
  /** Scroll the detail to the top: on one column it sits under the whole list. */
  scroll: boolean
}

/**
 * Reaching a metric: from a link elsewhere ("Edit definition", the "Definition changed" mark,
 * Settings, Back) or from a row of the list. On one column (narrow screens) the detail sits far
 * under the list, so it always scrolls up and takes focus. Side by side it is already in view: a
 * link from elsewhere moves focus to its name, while a row of the list keeps focus in the list so
 * the reader can move on to the next metric. Null when nothing opens.
 */
export function arrivalAt(
  metric: string | null,
  opts: { narrow: boolean; fromList: boolean },
): Arrival | null {
  if (!metric) return null
  if (opts.narrow) return { scroll: true }
  return opts.fromList ? null : { scroll: false }
}
