/**
 * Settings that moved to one home. A value someone saved under the old place (in this browser or
 * a settings file) is carried to the new one when it is read, so nothing they set is lost:
 *
 * - The org design thresholds People stats kept its own copies of (wide and narrow span, the new
 *   manager window, single-report chains, the deep-chain layer) live on the Org chart.
 * - The rating the Org chart exit simulation lists from is Talent's high performer rating.
 * - The HR ops targets kept as a "target" setting are the metrics' own targets.
 *
 * Pure, and free of the views' registries: the ids are written out here.
 */
import type { MetricCatalog } from './registry'
import type { SettingRef } from './types'

export interface MovedSetting {
  from: SettingRef
  to: SettingRef
  /** Added to the value on the way: "more than 7 levels below the top" is "below layer 8". */
  offset?: number
}

export const MOVED_SETTINGS: readonly MovedSetting[] = [
  {
    from: { metricId: 'hrbp.findings.spanOutliers', key: 'wide' },
    to: { metricId: 'org.flags.wideSpan', key: 'minDirects' },
  },
  {
    from: { metricId: 'hrbp.org.managerFlag', key: 'overloaded' },
    to: { metricId: 'org.flags.wideSpan', key: 'minDirects' },
  },
  {
    from: { metricId: 'hrbp.findings.spanOutliers', key: 'narrow' },
    to: { metricId: 'org.flags.narrowSpan', key: 'maxDirects' },
  },
  {
    from: { metricId: 'hrbp.org.newManager', key: 'months' },
    to: { metricId: 'org.flags.newManager', key: 'months' },
  },
  {
    from: { metricId: 'hrbp.org.singleReportChains', key: 'minBelow' },
    to: { metricId: 'org.flags.singleReportChain', key: 'minBelow' },
  },
  {
    from: { metricId: 'hrbp.findings.orgDepth', key: 'levels' },
    to: { metricId: 'org.layers.count', key: 'deepChain' },
    offset: 1,
  },
  {
    from: { metricId: 'org.exit.backfills', key: 'minRating' },
    to: { metricId: 'talent.performance.highPerformers', key: 'minRating' },
  },
]

type RawOverride = { text?: unknown; target?: unknown; params?: Record<string, unknown> }

const paramsOf = (o: unknown): Record<string, unknown> | null => {
  const p = (o as RawOverride | null)?.params
  return p && typeof p === 'object' ? p : null
}

/**
 * Raw saved overrides with moved settings carried to their home. A value already saved at the
 * new place wins. A "target" setting on a metric whose target is required (HR ops) becomes its
 * target, in the registered direction. Returns the input unchanged when nothing moved.
 */
export function moveSettings(raw: unknown, catalog: MetricCatalog): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const overrides = (raw as { overrides?: unknown }).overrides
  if (!overrides || typeof overrides !== 'object') return raw
  const src = overrides as Record<string, unknown>
  const out: Record<string, RawOverride> = {}
  const copy = (id: string): RawOverride => {
    if (!out[id]) {
      const o = (src[id] && typeof src[id] === 'object' ? src[id] : {}) as RawOverride
      out[id] = { ...o, params: { ...(paramsOf(o) ?? {}) } }
    }
    return out[id]
  }
  let moved = false
  for (const m of MOVED_SETTINGS) {
    const value = paramsOf(src[m.from.metricId])?.[m.from.key]
    const owner = catalog.byId.get(m.from.metricId)
    // Only when the old place is gone from the catalog (a setting still registered stays put).
    if (value === undefined || owner?.params.some((p) => p.key === m.from.key)) continue
    const from = copy(m.from.metricId)
    delete from.params?.[m.from.key]
    const to = copy(m.to.metricId)
    if (to.params && to.params[m.to.key] === undefined)
      to.params[m.to.key] = typeof value === 'number' && m.offset ? value + m.offset : value
    moved = true
  }
  for (const [id, o] of Object.entries(src)) {
    const def = catalog.byId.get(id)
    const value = paramsOf(o)?.target
    if (!def?.targetRequired || value === undefined || def.params.some((p) => p.key === 'target')) continue
    const next = copy(id)
    delete next.params?.target
    if (next.target === undefined && typeof value === 'number' && def.target)
      next.target = { value, comparator: def.target.comparator }
    moved = true
  }
  if (!moved) return raw
  return { ...(raw as object), overrides: { ...src, ...out } }
}
