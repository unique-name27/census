/**
 * Open the org chart at a person from anywhere in the app (the old tool's "person rows jump to the
 * org chart"): `openInOrgChart('E10599')`. The chart expands the chain, selects the person and
 * pans to them.
 */
import { liveAccess } from '@/access/connect'
import { notInOrg, outsideScope } from '@/access/copy'
import { personInScope } from '@/access/scopes/records'
import { goTo } from '@/components/navigation'
import { toast } from '@/components/toast'

const KEY = 'census:org:jump'
export const ORG_JUMP_EVENT = 'census:org-jump'

export function openInOrgChart(employeeId: string): void {
  // Manager mode: the chart shows the manager's org only, so someone outside it does not open.
  // HRBP mode: the chart shows everyone, dimmed outside the scope, and opens inside it only.
  const { lock, scope } = liveAccess()
  if (lock && !lock.orgIds.has(employeeId)) {
    toast(notInOrg(lock.managerName || 'the manager'))
    return
  }
  if (scope && scope.kind !== 'org' && !personInScope(employeeId, { scope })) {
    toast(outsideScope(scope.label))
    return
  }
  try {
    sessionStorage.setItem(KEY, employeeId)
  } catch {
    /* storage blocked: the event below still reaches a chart that is already open */
  }
  goTo('org', 'chart')
  window.dispatchEvent(new CustomEvent(ORG_JUMP_EVENT, { detail: employeeId }))
}

/** The pending jump, if any (read once). */
export function takeOrgJump(): string | null {
  try {
    const v = sessionStorage.getItem(KEY)
    if (v) sessionStorage.removeItem(KEY)
    return v
  } catch {
    return null
  }
}
