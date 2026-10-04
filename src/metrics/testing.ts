/**
 * Helpers for engine tests: a dictionary with settings changed, a recorder of which settings an
 * engine reads, and the settings a view registers. Use with
 * `buildContext({ …, metrics: metricsWith({ 'hrbp.attrition.firstYear': { days: 180 } }) })`.
 */
import { metricsApi } from './api'
import { CATALOG } from './catalog'
import { applyEdits, EMPTY_METRICS } from './overrides'
import { type MetricCatalog, paramField } from './registry'
import type { MetricEdit, MetricsApi, MetricView } from './types'

/** Apply edits to the defaults; throws when one is refused, so a typo can't pass silently. */
export function metricsWithEdits(edits: readonly MetricEdit[], catalog: MetricCatalog = CATALOG): MetricsApi {
  const r = applyEdits(EMPTY_METRICS, catalog, edits, { at: '2026-10-01T00:00:00.000Z' })
  if (r.rejected.length)
    throw new Error(r.rejected.map((x) => `${x.edit.metricId} ${x.edit.field}: ${x.error}`).join('\n'))
  return metricsApi(r.state, catalog)
}

/** The dictionary with some settings changed: `{ metricId: { key: value } }`. */
export function metricsWith(
  params: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  catalog: MetricCatalog = CATALOG,
): MetricsApi {
  const edits: MetricEdit[] = []
  for (const [metricId, values] of Object.entries(params))
    for (const [key, value] of Object.entries(values)) edits.push({ metricId, field: paramField(key), value })
  return metricsWithEdits(edits, catalog)
}

/** "metricId#key", how `recordParamReads` names a setting. */
export const paramRef = (metricId: string, key: string): string => `${metricId}#${key}`

/**
 * Wrap a dictionary so every setting read is recorded (as `paramRef`). Run an engine on a context
 * built with `metrics`, then compare `reads` with `paramsOfView(view)` to show each registered
 * setting is read through the registry.
 */
export function recordParamReads(api: MetricsApi): { metrics: MetricsApi; reads: Set<string> } {
  const reads = new Set<string>()
  const read = <T>(id: string, key: string, get: () => T): T => {
    reads.add(paramRef(id, key))
    return get()
  }
  const metrics: MetricsApi = {
    get list() {
      return api.list
    },
    def: (id) => api.def(id),
    defaultDef: (id) => api.defaultDef(id),
    paramDef: (id, key) => api.paramDef(id, key),
    param: (id, key) => read(id, key, () => api.param(id, key)),
    num: (id, key) => read(id, key, () => api.num(id, key)),
    flag: (id, key) => read(id, key, () => api.flag(id, key)),
    choice: (id, key) => read(id, key, () => api.choice(id, key)),
    ratings: (id, key) => read(id, key, () => api.ratings(id, key)),
    range: (id, key) => read(id, key, () => api.range(id, key)),
    target: (id) => api.target(id),
    isChanged: (id) => api.isChanged(id),
    changedFields: (id) => api.changedFields(id),
    sourcesOf: (id) => api.sourcesOf(id),
    changesBehind: (id) => api.changesBehind(id),
    usesOf: (id) => api.usesOf(id),
    get changedCount() {
      return api.changedCount
    },
    get changes() {
      return api.changes
    },
    state: api.state,
  }
  return { metrics, reads }
}

/** Every setting registered by metrics whose home view is `view`, as `paramRef`s. */
export function paramsOfView(view: MetricView, catalog: MetricCatalog = CATALOG): string[] {
  return catalog.list
    .filter((d) => d.views[0] === view)
    .flatMap((d) => d.params.map((p) => paramRef(d.id, p.key)))
}
