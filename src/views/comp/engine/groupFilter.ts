/**
 * "Filter to this" for Compensation (docs/FILTERS.md, part 4): a breakdown row by business unit,
 * department, location or level carries its dimension, so the records it opens carry the filter
 * that reproduces it. Pay rows take their org fields from the person's roster record, as the
 * filters do. Job families, ratings, positions and bins are not filters and carry none. Pure.
 */
import type { ListDimension } from '@/data/scope'
import { groupFilter } from '@/drill/filter'
import type { DrillFilter, DrillSpec } from '@/drill/types'

export interface GroupDim {
  /** The org filter whose value `group` is, when the breakdown is by one (none for job family). */
  dim?: ListDimension
}

/** The rows of a breakdown by an org filter, tagged with it. */
export const tagDim = <T extends object>(dim: ListDimension, rows: readonly T[]): (T & GroupDim)[] =>
  rows.map((r) => ({ ...r, dim }))

/** The filter for a tagged row's group; none for "Other (k)", untagged rows or the whole scope. */
export const rowFilter = (row: { group: string | null } & GroupDim): DrillFilter | undefined =>
  row.dim && row.group != null ? groupFilter(row.dim, row.group) : undefined

/** The spec with the filter set (when there is one). */
export const filtered = <S extends DrillSpec>(spec: S | null, filter: DrillFilter | undefined): S | null =>
  spec && filter ? { ...spec, filter } : spec
