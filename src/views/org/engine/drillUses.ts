/**
 * Drills that know their number's fields. A drill spec without `uses` shows the tier of the
 * records' dataset; tagging it with the number's own `uses` makes the panel (and its exports)
 * show the tier of the number that was clicked. A spec that already names its fields keeps them.
 */
import type { Kpi } from '@/components/types'
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
