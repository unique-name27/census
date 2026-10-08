/**
 * The Home view's page title (docs/ROLES-V2.md 5.1): the name of the home on screen, "Executive
 * home" for the CHRO, the business unit or region for an HRBP, the recruiter's reqs, else the
 * practice's name. Pure.
 */
import { EVERY_RECRUITER } from '@/access/modes'
import type { AnalyticsContext } from '@/data/context'

type Ctx = Pick<AnalyticsContext, 'access'>

export const HOME = 'Home'

export function homeTitle(ctx: Ctx): string {
  const { mode, scope, unset } = ctx.access
  switch (mode) {
    case 'chro':
      return 'Executive home'
    case 'hrbp-unit':
    case 'hrbp-region':
      return scope && !unset ? scope.label : HOME
    case 'compensation':
      return 'Compensation'
    case 'talent-management':
      return 'Talent management'
    case 'hr-ops':
      return 'HR ops'
    case 'recruiter':
      if (unset) return HOME
      return scope?.kind === 'reqs' && scope.recruiter !== EVERY_RECRUITER
        ? scope.label
        : "Every recruiter's reqs"
    case 'finance':
      return 'Finance'
    default:
      return HOME
  }
}
