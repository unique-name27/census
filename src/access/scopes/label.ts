/**
 * Scope names for copy (docs/ROLES-V2.md, 1.6 and 2.3): `scopeName(scope)` is the scope alone
 * ("Priya Raman's org", "Silicon Engineering", "APAC", "Maya Chen's reqs"); `scopeLabelOf` is the
 * scope line, with any narrowing after it ("APAC: Bengaluru, L4", "Silicon Engineering, not
 * Munich", "Maya Chen's reqs, Hsinchu"). Manager mode's line is unchanged. Pure.
 */
import {
  type FilterDimension,
  type Filters,
  isExcluded,
  LIST_DIMENSIONS,
  type OrgIndex,
  scopeLabel,
} from '@/data/scope'
import type { ScopeLock } from './types'

export const scopeName = (scope: Pick<ScopeLock, 'label'>): string => scope.label

/** "A, B" for up to two values, else "A +2" (the filter row's own rule). */
const listText = (xs: readonly string[]) => (xs.length <= 2 ? xs.join(', ') : `${xs[0]} +${xs.length - 1}`)

/** The filters other than the ones a scope pins, in words: "Bengaluru", "not Munich", "L4". */
function narrowing(filters: Filters, org: OrgIndex, pinned: readonly FilterDimension[]): string[] {
  const parts: string[] = []
  if (filters.leaderId && !pinned.includes('leaderId')) {
    const name = org.byId.get(filters.leaderId)?.name
    const text = name ? `${name}'s org` : 'Leader org'
    parts.push(isExcluded(filters, 'leaderId') ? `not in ${text}` : text)
  }
  for (const dim of LIST_DIMENSIONS) {
    const xs = filters[dim]
    if (!xs.length || pinned.includes(dim)) continue
    parts.push(isExcluded(filters, dim) ? `not ${listText(xs)}` : listText(xs))
  }
  return parts
}

const withParts = (head: string, parts: readonly string[]): string =>
  parts.length ? `${head}, ${parts.join(', ')}` : head

/** The scope line for a scope and the filters inside it. */
export function scopeLabelOf(scope: ScopeLock, filters: Filters, org: OrgIndex): string {
  switch (scope.kind) {
    case 'org':
      return scopeLabel(filters, org)
    case 'unit':
      return withParts(scope.label, narrowing(filters, org, ['businessUnit']))
    case 'region': {
      const all = scope.sites
      const named = filters.location
      const subset =
        !isExcluded(filters, 'location') &&
        named.length > 0 &&
        !(named.length === all.length && named.every((l) => all.includes(l)))
      const head = subset ? `${scope.label}: ${listText(named)}` : scope.label
      return withParts(head, narrowing(filters, org, ['location']))
    }
    case 'reqs':
      return withParts(scope.label, narrowing(filters, org, []))
  }
}
