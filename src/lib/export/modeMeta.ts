/**
 * The mode lines every export carries outside HR and Developer (docs/ROLES-V2.md 4.11 and 3.2):
 * "Made in HRBP mode for APAC.", "Made in Recruiter mode for Maya Chen's reqs.", "Made in Finance
 * mode." plus Finance's cost line, "Cost totals cover groups of 5 or more people. Individual pay
 * is left out." Figure exports (`useExportMeta`) and view exports (`ExportMenu`) both take them
 * from here, so a sheet, a slide, a CSV and an image say the same. Pure.
 *
 *   const meta = { ...viewMeta, ...modeMeta(ctx.access) }
 */

import type { AccessContext } from '@/access/context'
import { FINANCE_EXPORT_LINE, modeExportLine } from '@/access/copy'
import type { ExportMeta } from '@/charts/types'

/** "Every recruiter" (Recruiter mode with no reqs scope) in the mode line. */
export const EVERY_RECRUITER_SCOPE = "every recruiter's reqs"

/** The scope a mode line names: the scope's label, none while the pick is missing or gone. */
function scopeOfLine(access: Pick<AccessContext, 'mode' | 'scope' | 'unset'>): string | null {
  if (access.unset) return null
  if (access.scope) return access.scope.label || null
  return access.mode === 'recruiter' ? EVERY_RECRUITER_SCOPE : null
}

/** The mode line and, in Finance, the cost line; nothing in HR and Developer. */
export function modeMeta(
  access: Pick<AccessContext, 'mode' | 'scope' | 'unset'>,
): Pick<ExportMeta, 'modeLine' | 'costLine'> {
  const line = modeExportLine(access.mode, scopeOfLine(access))
  return {
    ...(line ? { modeLine: line } : {}),
    ...(access.mode === 'finance' ? { costLine: FINANCE_EXPORT_LINE } : {}),
  }
}
