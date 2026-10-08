/**
 * The records panel's lines about what the mode leaves out (docs/ROLES-V2.md 2.7, 3.3 and 4.12):
 * rows outside the scope, a kind the mode does not list, and pay amounts or authorization types
 * the mode keeps off. The rows themselves are kept to the scope by `rowsInScope` (`@/access`).
 * Pure.
 *
 *   recordsOutsideLine(ctx.access, 12)   // "12 records outside APAC are not listed."
 *   payAmountsNote(ctx.access)           // the comp kind's note while amounts are off
 */

import type { AccessContext } from '@/access/context'
import { kindNotShown, modeName, recordsOutside } from '@/access/copy'
import { showImmigrationIn } from '@/access/pay'
import type { ScopeKind } from '@/access/scopes/types'

type Access = Pick<AccessContext, 'mode' | 'scope' | 'can'>

/** What each scope kind waits for, while its pick is missing or gone. */
const PICK_NOUN: Record<ScopeKind, string> = {
  org: 'a manager',
  unit: 'a business unit',
  region: 'a region',
  reqs: 'a recruiter',
}

const records = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'record' : 'records'}`

/**
 * The muted line under the panel's title when rows were left out: "12 records outside APAC are not
 * listed." ("…outside Priya Raman's org…", "…outside Maya Chen's reqs…"). A scope still waiting
 * for its pick has no name: "12 records are not listed until a region is picked." Null when
 * nothing was left out or there is no scope.
 */
export function recordsOutsideLine(access: Pick<AccessContext, 'scope'>, leftOut: number): string | null {
  const s = access.scope
  if (!s || leftOut <= 0) return null
  if (!s.label)
    return `${records(leftOut)} ${leftOut === 1 ? 'is' : 'are'} not listed until ${PICK_NOUN[s.kind]} is picked.`
  return recordsOutside(leftOut, s.label)
}

/** The panel's sentence for a kind the mode does not list: "These records are not shown in Finance mode." */
export const kindHiddenLine = (access: Pick<AccessContext, 'mode'>): string => kindNotShown(access.mode)

/**
 * The comp kind's note while pay amounts are off: where to switch them on, in a mode with the
 * switch; otherwise that the mode shows ratios.
 */
export function payAmountsNote(access: Access): string {
  if (access.can('pay:switch'))
    return 'Pay amounts are hidden. Switch on "Show pay amounts" in Settings or in Compensation to include them.'
  return `Pay amounts are not shown in ${modeName(access.mode)}. Ratios such as compa-ratio still show.`
}

/** The right-to-work kind's note while authorization types are off. */
export function immigrationNote(access: Pick<AccessContext, 'mode'>): string {
  if (showImmigrationIn(access.mode, true))
    return 'Authorization types are hidden. Switch on "Show immigration details" in Settings, Privacy to include them for this session.'
  return `Authorization types are not shown in ${modeName(access.mode)}. Counts by type still show.`
}
