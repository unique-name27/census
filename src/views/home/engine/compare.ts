/**
 * Company comparisons on a home (docs/ROLES-V2.md 2.6): a "vs company" line, bar or delta is an
 * aggregate over the whole company, so in a scoped mode it opens no records (the company's are not
 * listed there); without a scope it opens them like any number. Pure.
 */
import type { AccessContext } from '@/access/context'

export const comparisonOpens = (access: Pick<AccessContext, 'scope'>): boolean => !access.scope
