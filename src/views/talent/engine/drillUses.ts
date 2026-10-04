/**
 * Drills that know their number's fields. A drill spec without `uses` shows the tier of the
 * records' dataset; tagging it with the number's own `uses` makes the panel (and its exports)
 * show the tier of the number that was clicked. A spec that already names its fields keeps them.
 */
import type { Finding, Kpi } from '@/components/types'
import type { FieldRef } from '@/data/quality/fieldRef'
import { type DrillSource, resolveDrill } from '@/drill/Drill'

export function withUses(src: DrillSource, uses: readonly FieldRef[] | undefined): DrillSource {
  if (!src || !uses?.length) return src
  return () => {
    const spec = resolveDrill(src)
    return spec && !spec.uses?.length ? { ...spec, uses } : spec
  }
}

/** Every drill on a tile (value, change and note) carries the tile's fields. */
export function tagKpis(kpis: readonly Kpi[]): Kpi[] {
  return kpis.map((k) => ({
    ...k,
    drill: withUses(k.drill, k.uses),
    deltaDrill: withUses(k.deltaDrill, k.uses),
    noteDrill: withUses(k.noteDrill, k.uses),
  }))
}

/** Each finding's drill carries the finding's fields. */
export function tagFindings(findings: readonly Finding[]): Finding[] {
  return findings.map((f) => ({ ...f, drill: withUses(f.drill, f.uses) }))
}

/**
 * The view's drills, each tagged with one figure's fields: pass the result to that figure's
 * columns and marks so every number in it opens with the figure's tier.
 */
export function drillsWithUses<D extends object>(drills: D, uses: readonly FieldRef[] | undefined): D {
  if (!uses?.length) return drills
  const out: Record<string, unknown> = {}
  for (const [key, fn] of Object.entries(drills))
    out[key] =
      typeof fn === 'function'
        ? (...args: unknown[]) => withUses((fn as (...a: unknown[]) => DrillSource)(...args), uses)
        : fn
  return out as D
}
