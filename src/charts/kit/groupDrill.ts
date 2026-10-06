/**
 * Drills for figures whose marks are groups of a filterable dimension (docs/FILTERS.md, part 4).
 * Say the dimension once for the figure and every mark's records carry the filter that
 * reproduces its group, so the records panel offers "Filter to Bengaluru" and "Leave out
 * Bengaluru":
 *
 *   const locDrill = byGroup('location', 'label', (d: CountRow) => () => countSpec(p, 'location', d))
 *   <BarList … onSelect={(d) => drill(locDrill(d))} />          // a chart mark
 *   columns={[{ key: 'headcount', …, drill: locDrill }]}       // the same records from a table cell
 *
 * `group` is the datum's property holding the dimension's value (or a function returning it, or
 * several values for one mark). A datum that is no group ("Other (k)", "Not recorded", a blank)
 * opens its records without a filter, and the panel only offers the actions when the values are
 * in the loaded data. Engines that build specs can set `filter: groupFilter(dim, value)` instead.
 * A group of several values that readers call something else (a region's sites, a level band)
 * passes `label`, so the actions read "Filter to Asia Pacific" (`DrillSpec.filterLabel`).
 */
import type { FilterDimension } from '@/data/scope'
import { type DrillSource, drill, resolveDrill } from '@/drill/Drill'
import { groupFilter } from '@/drill/filter'
import type { DrillFilter, DrillSpec } from '@/drill/types'
import type { Key } from './shared'

/** Where a datum's group value is: a property name, or a function (null for a datum that is no group). */
export type GroupOf<T> = Key<T> | ((d: T) => string | readonly string[] | null | undefined)

const groupValue = <T>(group: GroupOf<T>, d: T): string | readonly string[] | null | undefined => {
  if (typeof group === 'function') return group(d)
  const v = (d as Record<string, unknown>)[group]
  return typeof v === 'string' || Array.isArray(v) ? (v as string | string[]) : null
}

/**
 * A spec with a filter merged into whatever filter it already sets (a period, say), and the
 * group's name for the actions when it has one ("Asia Pacific").
 */
export function withFilter<S extends DrillSpec>(
  spec: S,
  filter: DrillFilter | undefined,
  label?: string | null,
): S {
  if (!filter) return spec
  const merged = { ...spec.filter, ...filter, modes: { ...spec.filter?.modes, ...filter.modes } }
  return label ? { ...spec, filter: merged, filterLabel: label } : { ...spec, filter: merged }
}

/**
 * Per-mark drills with the group's filter set once for the figure. `build` returns the mark's
 * records as usual (a spec, a thunk, or null for nothing behind it); the result is a drill source
 * for `drill()`, `<Drill spec>` or a table column's `drill`, built only when clicked.
 */
export function byGroup<T>(
  dimension: FilterDimension,
  group: GroupOf<T>,
  build: (d: T) => DrillSource,
  label?: (d: T) => string | null | undefined,
): (d: T) => DrillSource {
  return (d) => {
    const src = build(d)
    if (!src) return null
    const filter = groupFilter(dimension, groupValue(group, d))
    if (!filter) return src
    return (): DrillSpec | null => {
      const spec = resolveDrill(src)
      return spec ? withFilter(spec, filter, label?.(d)) : null
    }
  }
}

/** A chart's `onSelect` that opens the mark's records with its group's filter: `byGroup` plus `drill`. */
export function selectGroup<T>(
  dimension: FilterDimension,
  group: GroupOf<T>,
  build: (d: T) => DrillSource,
): (d: T) => void {
  const source = byGroup(dimension, group, build)
  return (d) => drill(source(d))
}
