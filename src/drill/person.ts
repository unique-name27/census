/**
 * Everything Census knows about one person, for the person card at the end of every drill.
 * Pure; reads the unscoped datasets so the card is complete whatever the filters are.
 *
 * What the card holds follows the mode (docs/ROLES-V2.md 4.12, `personCardPlan`):
 *
 * - **Outside the scope** (Manager, HRBP, Recruiter): name, title, department and "Outside APAC.",
 *   no actions.
 * - **Recruiter**: a card opens only for a matched pre-hire: name, role, start date, hiring
 *   manager and day-one readiness (I-9 tasks left out).
 * - **Finance**: name, title, department, level, location, cost center, hire date and reporting
 *   line; no ratings, pay ratio, cases, courses or history.
 * - **Everyone else**: the full card, each part by its own decision: compa-ratio
 *   (`person:compa-ratio`), pay amounts (`pay:amounts`, while "Show pay amounts" is on), ratings and
 *   potential (`person:ratings`), the open HR cases count (`person:open-cases`), overdue required
 *   courses (the `learning` kind), job history (`jobChanges`), successor roles (`succession`), exit
 *   reasons (`hrbp.attrition.exitReasons`), "Focus on their org" (`person:focus`, when the mode's
 *   clamp keeps it) and "Show in org chart" (`person:org-chart`, when the Org chart shows).
 */
import { outsideScope } from '@/access/copy'
import { routeShown } from '@/access/policy'
import { personInScope } from '@/access/records'
import { clampFilters } from '@/access/scopes/clamp'
import type { AnalyticsContext } from '@/data/context'
import {
  type Candidate,
  type Employee,
  type ISODate,
  type JobChange,
  LEVEL_LABELS,
  onboardingTaskByName,
  type Review,
} from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'
import { tenureYears } from '@/lib/people'
import { isAccepted, normalizeName } from '@/lib/starts'
import { mergeFilter } from './filter'
import { taskState } from './records'
import { activeDirects, activeOrg, openCases, overdueRequired } from './related'

/** How much of a person the card shows. */
export type PersonCardShape = 'full' | 'finance' | 'prehire' | 'outside'

/** Which parts of the person card show, in the mode on screen (docs/ROLES-V2.md 4.12). */
export interface PersonCardPlan {
  shape: PersonCardShape
  /** The limited card's line: "Outside APAC.", "Outside Priya Raman's org." */
  outsideLine: string | null
  compaRatio: boolean
  /** Base salary and range midpoint: a switch mode with "Show pay amounts" on. */
  pay: boolean
  /** Latest rating and the reviews (final and proposed ratings, potential). */
  ratings: boolean
  openCases: boolean
  courses: boolean
  jobHistory: boolean
  /** "Named successor for". */
  succession: boolean
  /** Direct reports and the org below them. */
  team: boolean
  /** Exit reason and regrettable (the exit type always shows). */
  exitDetail: boolean
  costCenter: boolean
  focus: boolean
  orgChart: boolean
}

/** What the plan reads from the analytics context. */
export type PlanContext = Pick<AnalyticsContext, 'asOf'> &
  Partial<Pick<AnalyticsContext, 'access' | 'showPay' | 'filters'>>

const NONE: Omit<PersonCardPlan, 'shape' | 'outsideLine'> = {
  compaRatio: false,
  pay: false,
  ratings: false,
  openCases: false,
  courses: false,
  jobHistory: false,
  succession: false,
  team: false,
  exitDetail: false,
  costCenter: false,
  focus: false,
  orgChart: false,
}

/** "Recruiter mode opens only people about to start." (Every recruiter: no reqs to name.) */
export const PREHIRE_ONLY = 'Recruiter mode opens only people about to start.'

/** "Focus on their org" keeps to the mode: the clamp leaves the merged filters as they are. */
function focusKept(ctx: PlanContext, id: string): boolean {
  const access = ctx.access
  if (!access || !ctx.filters) return true
  if (!access.scope && access.mode !== 'finance') return true
  const merged = mergeFilter(ctx.filters, { leaderId: id }, 'include')
  return clampFilters(merged, access.scope, access.mode) === merged
}

/** The parts of a person's card this mode shows. */
export function personCardPlan(ctx: PlanContext, e: Employee): PersonCardPlan {
  const access = ctx.access
  if (!access)
    return {
      shape: 'full',
      outsideLine: null,
      compaRatio: true,
      pay: !!ctx.showPay,
      ratings: true,
      openCases: true,
      courses: true,
      jobHistory: true,
      succession: true,
      team: true,
      exitDetail: true,
      costCenter: false,
      focus: true,
      orgChart: true,
    }
  const can = (s: string) => access.can(s)
  const scope = access.scope
  const outside = (line: string | null): PersonCardPlan => ({ shape: 'outside', outsideLine: line, ...NONE })
  if (!personInScope(e.employeeId, access)) return outside(scope?.label ? outsideScope(scope.label) : null)
  // Recruiter: a card for a matched pre-hire only (with "Every recruiter", anyone about to start).
  if (access.mode === 'recruiter') {
    if (e.hireDate <= ctx.asOf) return outside(scope?.label ? outsideScope(scope.label) : PREHIRE_ONLY)
    return { shape: 'prehire', outsideLine: null, ...NONE }
  }
  const finance = access.mode === 'finance'
  const full = !finance
  const org = routeShown(access.mode, 'org') && can('person:org-chart')
  return {
    shape: finance ? 'finance' : 'full',
    outsideLine: null,
    compaRatio: full && can('person:compa-ratio'),
    pay: full && !!ctx.showPay && can('pay:amounts'),
    ratings: full && can('person:ratings'),
    openCases: full && can('person:open-cases') && can('drill:cases'),
    courses: full && can('drill:learning'),
    jobHistory: full && can('drill:jobChanges'),
    succession: full && can('drill:succession'),
    team: can('drill:employees'),
    exitDetail: full && can('metric:hrbp.attrition.exitReasons'),
    costCenter: finance,
    focus: can('person:focus') && focusKept(ctx, e.employeeId),
    orgChart: org,
  }
}

/** A pre-hire on a recruiter's reqs: when they start, who hires them and how ready day one is. */
export interface PreHireFacts {
  startDate: ISODate
  reqId: string | null
  /** The req's hiring manager, else the pre-hire's manager. */
  hiringManager: string | null
  /** Day-one readiness tasks (I-9 left out): done, of how many, and how many overdue or blocked. */
  readiness: { done: number; total: number; overdue: number; blocked: number }
}

/** The pay amounts the card shows with the switch on (local currency, full-time equivalent). */
export interface PersonPay {
  currency: string
  baseSalary: number
  rangeMid: number
}

export interface PersonSummary {
  employee: Employee
  status: 'Active' | 'Left' | 'Not started'
  levelLabel: string | null
  tenureYears: number
  /** Manager chain from the direct manager up to the top. */
  chain: Employee[]
  directs: Employee[]
  /** Everyone below them who is active at asOf (not counting themselves), contractors and interns included. */
  orgSize: number
  /** The contractors and interns among them (headcount elsewhere counts employees only). */
  orgContingent: number
  reviews: Review[]
  jobChanges: JobChange[]
  compaRatio: number | null
  /** Open HR cases they raised, employee relations left out (never tied to a named person). */
  openCases: number
  overdueTraining: number
  successorFor: string[]
  /** What the card shows in this mode. */
  card: PersonCardPlan
  /** Pay amounts, only when the card shows them. */
  pay?: PersonPay | null
  /** Recruiter mode: the start on the recruiter's reqs. */
  preHire?: PreHireFacts | null
  /**
   * Someone outside the scope (a recruiter, the manager's own manager, a person in another
   * region): the card shows name, title, department and "Outside …" only, and every list here is
   * empty.
   */
  outside?: boolean
  /** Inside the scope, with a part HR shows left out (Manager: no compa-ratio, no open HR cases). */
  limited?: boolean
}

/** The accepted candidate a pre-hire is a copy of, on the scope's reqs when there is one. */
function acceptedFor(
  ctx: Pick<AnalyticsContext, 'all' | 'asOf'> & PlanContext,
  e: Employee,
): Candidate | null {
  const name = normalizeName(e.name)
  const scope = ctx.access?.scope
  const apps = scope?.kind === 'reqs' ? scope.appIds : null
  let best: Candidate | null = null
  for (const c of ctx.all.candidates) {
    if (!isAccepted(c) || normalizeName(c.candidateName) !== name) continue
    if (apps && !apps.has(c.applicationId)) continue
    if (c.startDate && c.startDate <= ctx.asOf) continue
    best = c
    if (c.startDate === e.hireDate) break
  }
  return best
}

function preHireFacts(
  ctx: Pick<AnalyticsContext, 'all' | 'asOf' | 'org'> & PlanContext,
  e: Employee,
): PreHireFacts {
  const cand = acceptedFor(ctx, e)
  const req = cand ? ctx.all.requisitions.find((r) => r.reqId === cand.reqId) : undefined
  const managerId = req?.hiringManagerId ?? e.managerId
  const tasks = ctx.all.onboardingTasks.filter(
    (t) => t.employeeId === e.employeeId || (!!cand && t.applicationId === cand.applicationId),
  )
  // Day-one readiness, as Upcoming starts counts it; an I-9 task is HR ops' and Compliance's measure.
  const ready = tasks.filter((t) => {
    const def = onboardingTaskByName.get(t.task)
    return !def?.usOnly && (def ? !!def.readiness : true)
  })
  const readiness = { done: 0, total: 0, overdue: 0, blocked: 0 }
  for (const t of ready) {
    const state = taskState(t, ctx.asOf)
    if (state === 'Not needed') continue
    readiness.total++
    if (state === 'Done' || state === 'Done late') readiness.done++
    else if (state === 'Overdue') readiness.overdue++
    else if (state === 'Blocked') readiness.blocked++
  }
  return {
    startDate: e.hireDate,
    reqId: req?.reqId ?? cand?.reqId ?? null,
    hiringManager: managerId ? (ctx.org.byId.get(managerId)?.name ?? null) : null,
    readiness,
  }
}

const EMPTY_LISTS = {
  chain: [],
  directs: [],
  orgSize: 0,
  orgContingent: 0,
  reviews: [],
  jobChanges: [],
  compaRatio: null,
  openCases: 0,
  overdueTraining: 0,
  successorFor: [],
} satisfies Partial<PersonSummary>

export function personSummary(
  ctx: Pick<AnalyticsContext, 'org' | 'asOf' | 'all'> &
    Partial<Pick<AnalyticsContext, 'access' | 'showPay' | 'filters'>>,
  employeeId: string,
): PersonSummary | null {
  const e = ctx.org.byId.get(employeeId)
  if (!e) return null
  const left = !!e.terminationDate && e.terminationDate <= ctx.asOf
  const status: PersonSummary['status'] = left ? 'Left' : isActiveAt(e, ctx.asOf) ? 'Active' : 'Not started'
  const levelLabel = e.level ? (LEVEL_LABELS[e.level] ?? e.level) : null
  const card = personCardPlan(ctx, e)
  const base = { employee: e, status, levelLabel, tenureYears: tenureYears(e, ctx.asOf), card }
  if (card.shape === 'outside') return { ...base, ...EMPTY_LISTS, outside: true }
  if (card.shape === 'prehire') return { ...base, ...EMPTY_LISTS, preHire: preHireFacts(ctx, e) }
  const chain: Employee[] = []
  const seen = new Set([e.employeeId])
  let m = e.managerId ? ctx.org.byId.get(e.managerId) : undefined
  while (m && !seen.has(m.employeeId) && chain.length < 20) {
    chain.push(m)
    seen.add(m.employeeId)
    m = m.managerId ? ctx.org.byId.get(m.managerId) : undefined
  }
  const directs = card.team ? activeDirects(ctx, e.employeeId) : []
  const org = card.team ? activeOrg(ctx, e.employeeId) : []
  // Manager mode: the manager's own potential, proposed ratings and succession status stay with HR
  // (docs/ROLES.md, 4.5); their final ratings show.
  const lock = ctx.access?.lock
  const self = !!lock && lock.managerId === employeeId
  const reviews = card.ratings
    ? ctx.all.reviews
        .filter((r) => r.employeeId === employeeId)
        .map((r) => (self ? { ...r, potential: null, preCalibrationRating: null } : r))
        .sort((a, b) => (a.cycleDate < b.cycleDate ? 1 : -1))
    : []
  const jobChanges = card.jobHistory
    ? ctx.all.jobChanges
        .filter((j) => j.employeeId === employeeId)
        .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))
    : []
  const comp = card.compaRatio || card.pay ? ctx.all.comp.find((c) => c.employeeId === employeeId) : undefined
  const fullCard = card.shape === 'full'
  return {
    ...base,
    chain,
    directs,
    orgSize: org.length,
    orgContingent: org.filter((p) => !isEmployee(p)).length,
    reviews,
    jobChanges,
    compaRatio: card.compaRatio && comp && comp.rangeMid > 0 ? comp.baseSalary / comp.rangeMid : null,
    pay:
      card.pay && comp
        ? { currency: comp.currency, baseSalary: comp.baseSalary, rangeMid: comp.rangeMid }
        : null,
    openCases: card.openCases ? openCases(ctx, employeeId).length : 0,
    overdueTraining: card.courses ? overdueRequired(ctx, employeeId).length : 0,
    // In Manager mode, only roles inside the org other than the manager's own: a plan for a role
    // above the manager, or for theirs, is not the manager's to see.
    successorFor:
      self || !card.succession
        ? []
        : [
            ...new Set(
              ctx.all.succession
                .filter(
                  (s) =>
                    s.successorId === employeeId &&
                    (!lock || (lock.orgIds.has(s.incumbentId) && s.incumbentId !== lock.managerId)),
                )
                .map((s) => s.roleTitle),
            ),
          ],
    ...(fullCard && (!card.compaRatio || !card.openCases) ? { limited: true } : {}),
  }
}

/**
 * The person card's job line: the job function in its family, "Design Verification, Silicon
 * Engineering family" (docs/TAXONOMY.md: a family contains functions). The word "family" keeps it
 * apart from the org line, where the same words often name the department and business unit.
 */
export function jobLine(e: { jobFunction?: string | null; jobFamily?: string | null }): string {
  const fn = e.jobFunction?.trim()
  const family = e.jobFamily?.trim()
  const fam = family ? `${family} family` : ''
  return fn && fam ? `${fn}, ${fam}` : fn || fam || ''
}
