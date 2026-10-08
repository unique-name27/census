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

/**
 * The Recruiter home's words. One recruiter's home speaks to them ("My open reqs", "Your starts");
 * with "Every recruiter" picked (a talent acquisition lead) it names the reqs plainly, as the title
 * does. Pure.
 */
export interface RecHomeCopy {
  reqs: (n: string) => string
  queue: (n: string) => string
  reqsTitle: string
  queueTitle: string
  attentionDek: string
  listDek: string
  startsSubtitle: (horizon: string) => string
}

const STEPS =
  'applications to review, interviews to schedule, offers to send or waiting on an answer, empty funnels and reqs past their target.'

export function recHomeCopy(ctx: Ctx): RecHomeCopy {
  // "Every recruiter" holds no scope (nothing is outside it); one recruiter holds their reqs.
  const s = ctx.access.scope
  const every = !(s?.kind === 'reqs' && s.recruiter !== EVERY_RECRUITER)
  const starts = (h: string) =>
    ` in the next ${h} by start week and the team holding the open day-one task due first; I-9 tasks are HR ops'`
  return every
    ? {
        reqs: (n) => `Open reqs (${n})`,
        queue: (n) => `Candidates in the queue (${n})`,
        reqsTitle: 'Open reqs',
        queueTitle: 'Candidates in the queue',
        attentionDek: `Every recruiter's steps: ${STEPS}`,
        listDek: "Every recruiter's open reqs with their pipeline, or the candidates waiting on a step.",
        startsSubtitle: (h) => `Starts${starts(h)}`,
      }
    : {
        reqs: (n) => `My open reqs (${n})`,
        queue: (n) => `My candidates in the queue (${n})`,
        reqsTitle: 'My open reqs',
        queueTitle: 'My candidates in the queue',
        attentionDek: `Your own steps: ${STEPS}`,
        listDek: 'Your open reqs with their pipeline, or the candidates waiting on a step.',
        startsSubtitle: (h) => `Your starts${starts(h)}`,
      }
}
