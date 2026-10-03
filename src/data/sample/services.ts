/**
 * Employee services for the last 24 months: help-desk cases against the Atlas service levels, and
 * HR transactions with the deadline each governing process sets (Day -3 for new hires, final pay by
 * jurisdiction, payroll cut-off for job and pay changes).
 */
import {
  CASE_CATEGORIES,
  type HrCase,
  type HrTransaction,
  siteByLocation,
  TRANSACTION_PROCESS,
  type TransactionType,
} from '../schema'
import {
  AS_OF,
  addBusinessDays,
  type Day,
  day,
  iso,
  isoMinute,
  isoOrNull,
  isWeekend,
  monthEnd,
  monthStart,
  nextFriday,
  onOrAfterWeekday,
  onOrBeforeWeekday,
  T24_START,
} from './calendar'
import { activeOn, type Person, type World } from './model'
import type { Rng } from './prng'

const APAC = new Set(['Bengaluru', 'Hsinchu', 'Shanghai', 'Ho Chi Minh City'])
const HR_DESK_SITES = new Set(['San Jose', 'Austin', 'Bengaluru', 'Hsinchu'])
const MINUTES_PER_DAY = 1440
const AS_OF_END = (AS_OF + 1) * MINUTES_PER_DAY - 1

/* ───────────── cases ───────────── */

const CATEGORY_WEIGHT: Record<string, number> = {
  Payroll: 18,
  Benefits: 14,
  'HR data & records': 14,
  'Employment verification': 12,
  'Systems access': 9,
  'Leave & accommodation': 7,
  'Policy question': 7,
  Onboarding: 6,
  Offboarding: 4,
  'Compensation & equity': 4,
  'Immigration & mobility': 3.5,
  'Employee relations': 1.5,
}

const SUBCATEGORIES: Record<string, string[]> = {
  Payroll: [
    'Missing or late pay',
    'Incorrect pay amount',
    'Tax withholding',
    'Direct deposit change',
    'Payslip question',
    'Bonus or commission payment',
  ],
  Benefits: [
    'Enrollment',
    'Life event change',
    'Dependent verification',
    'Claims question',
    'Retirement plan',
    'Wellness reimbursement',
  ],
  'Leave & accommodation': [
    'Parental leave',
    'Medical leave',
    'Workplace accommodation',
    'Return to work',
    'Bereavement leave',
  ],
  Onboarding: [
    'Start date or offer documents',
    'Equipment and access',
    'Right to work documents',
    'Orientation',
  ],
  Offboarding: ['Final pay', 'Benefits continuation', 'Equipment return', 'Exit documents'],
  'Employment verification': [
    'Verification of employment',
    'Salary verification',
    'Visa letter',
    'Experience certificate',
  ],
  'HR data & records': [
    'Address or contact change',
    'Name change',
    'Job data correction',
    'Emergency contacts',
    'Personnel file request',
  ],
  'Systems access': ['HR portal access', 'Password or MFA reset', 'Manager self-service', 'Reporting access'],
  'Compensation & equity': [
    'Equity vesting',
    'Employee stock purchase plan',
    'Merit or adjustment question',
    'Stock plan account',
  ],
  'Immigration & mobility': [
    'H-1B extension',
    'Permanent residency',
    'International transfer',
    'Work permit renewal',
    'Business travel letter',
  ],
  'Policy question': [
    'Time off policy',
    'Hybrid work',
    'Expense policy',
    'Holiday calendar',
    'Code of conduct question',
  ],
}

const CHANNELS: [string, number][] = [
  ['Portal', 45],
  ['Email', 25],
  ['Chat', 18],
  ['Phone', 9],
  ['Walk-in', 3],
]
/** Average satisfaction by channel; Email lags the self-service and live channels. */
const CSAT_MEAN: Record<string, number> = {
  Portal: 4.62,
  Chat: 4.62,
  Phone: 4.35,
  'Walk-in': 4.45,
  Email: 3.7,
}

type Tier = HrCase['tier']
type Priority = HrCase['priority']

function tierFor(category: string, rng: Rng): Tier {
  switch (category) {
    case 'Employee relations':
      return 'Tier 3'
    case 'Employment verification':
      return rng.chance(0.55) ? 'Tier 0' : 'Tier 1'
    case 'Policy question':
      return rng.chance(0.3) ? 'Tier 0' : 'Tier 1'
    case 'Immigration & mobility':
      return rng.chance(0.6) ? 'Tier 2' : 'Tier 3'
    case 'Leave & accommodation':
    case 'Compensation & equity':
      return rng.chance(0.75) ? 'Tier 2' : 'Tier 1'
    case 'Systems access':
      return rng.chance(0.7) ? 'Tier 1' : 'Tier 2'
    default:
      return rng.pickPair<Tier>([
        ['Tier 1', 65],
        ['Tier 2', 30],
        ['Tier 3', 5],
      ])
  }
}

function priorityFor(category: string, rng: Rng): Priority {
  if (category === 'Payroll') {
    return rng.pickPair<Priority>([
      ['P1', 8],
      ['P2', 22],
      ['P3', 55],
      ['P4', 15],
    ])
  }
  if (category === 'Employee relations') {
    return rng.pickPair<Priority>([
      ['P1', 10],
      ['P2', 60],
      ['P3', 30],
    ])
  }
  return rng.pickPair<Priority>([
    ['P1', 2],
    ['P2', 12],
    ['P3', 60],
    ['P4', 26],
  ])
}

/**
 * Planted SLA attainment, assigned as exact shares: payroll cases opened in July 2026 (the payroll
 * system change) and leave cases (third-party paperwork). Everything else lands near 91%.
 */
const PLANTED_ON_TIME = { payrollJuly: 0.6, leave: 0.7 } as const

/** Ratio of resolution time to its target; on-time and late cases for planted groups, natural otherwise. */
function resolutionRatio(onTime: boolean | null, rng: Rng): number {
  if (onTime == null) return rng.lognormal(0.35, 0.78)
  return onTime ? Math.min(0.97, rng.lognormal(0.5, 0.45)) : 1.03 + rng.lognormal(0.45, 0.6)
}

function openStatus(category: string, rng: Rng): HrCase['status'] {
  if (category === 'Leave & accommodation' || category === 'Immigration & mobility') {
    return rng.pickPair<HrCase['status']>([
      ['Waiting on third party', 65],
      ['In progress', 20],
      ['Waiting on employee', 15],
    ])
  }
  return rng.pickPair<HrCase['status']>([
    ['In progress', 55],
    ['Waiting on employee', 35],
    ['Waiting on third party', 10],
  ])
}

/** Opening hour weights: working hours, peaking mid-morning and mid-afternoon. */
const OPENING_HOURS: [number, number][] = [
  [8, 4],
  [9, 9],
  [10, 11],
  [11, 10],
  [12, 6],
  [13, 8],
  [14, 10],
  [15, 9],
  [16, 7],
  [17, 4],
]

/** Minute of the day a case is opened. */
function openingMinute(rng: Rng): number {
  const hour = rng.pickPair(OPENING_HOURS)
  return hour * 60 + rng.int(0, 59)
}

export function caseRows(w: World, rng: Rng): HrCase[] {
  const employees = w.people.filter((p) => p.type === 'Employee' && p.hire >= 0)
  const leavers = employees.filter((p) => p.term != null)
  const agentsByTeam = new Map<string, { idx: number; apac: boolean }[]>()
  for (const a of w.agents) agentsByTeam.set(a.team, [...(agentsByTeam.get(a.team) ?? []), a])
  const categories = CASE_CATEGORIES.map((c) => c.category)

  interface Draft {
    opened: number
    category: string
    requester: Person
    /** Planted open cases: stuck immigration matters and leave cases waiting on third parties. */
    stuck: 'immigration' | 'leave' | null
  }
  const drafts: Draft[] = []
  const months: Day[] = []
  for (let d = T24_START; d <= AS_OF; d = monthEnd(d) + 1) months.push(d)
  const avgActive = employees.filter((p) => activeOn(p, day('2025-09-30'))).length
  for (const m of months) {
    const mid = m + 14
    const activeNow = employees.filter((p) => activeOn(p, mid))
    const month = new Date(m * 86_400_000).getUTCMonth() + 1
    const seasonal = month === 1 ? 1.15 : month === 12 ? 0.85 : 1
    const volume = Math.round(268 * (activeNow.length / avgActive) * seasonal)
    const weights = categories.map((c) => {
      let wt = CATEGORY_WEIGHT[c]
      if (c === 'Benefits' && month === 11) wt *= 2.2 // open enrollment
      if (c === 'Payroll' && m === day('2026-07-01')) wt *= 2.2 // payroll system change
      if (c === 'Compensation & equity' && (month === 11 || month === 3)) wt *= 1.8
      return wt
    })
    // Spike categories add volume rather than displacing others.
    const extra = weights.reduce((a, b) => a + b, 0) / categories.reduce((a, c) => a + CATEGORY_WEIGHT[c], 0)
    const n = Math.round(volume * extra)
    const last = monthEnd(m)
    for (let i = 0; i < n; i++) {
      let d = rng.int(m, last)
      // Most weekend cases move to the nearest weekday inside the month.
      if (isWeekend(d) && rng.chance(0.9)) {
        const friday = onOrBeforeWeekday(d)
        d = friday >= m ? friday : onOrAfterWeekday(d)
      }
      const category = rng.weighted(categories, weights)
      let requester: Person | undefined
      if (category === 'Offboarding' && rng.chance(0.6)) {
        const near = leavers.filter((p) => p.term! >= d - 20 && p.term! <= d + 5)
        if (near.length) requester = rng.pick(near)
      } else if (category === 'Employment verification' && rng.chance(0.25)) {
        const former = leavers.filter((p) => p.term! < d)
        if (former.length) requester = rng.pick(former)
      }
      requester ??= rng.pick(activeNow)
      drafts.push({ opened: d * MINUTES_PER_DAY + openingMinute(rng), category, requester, stuck: null })
    }
  }
  // Employee services story 6: immigration cases stuck for more than 30 days.
  const backlogPeople = employees.filter((p) => p.term == null && p.hire < AS_OF - 400)
  for (let i = 0; i < 15; i++) {
    const d = onOrBeforeWeekday(AS_OF - rng.int(35, 140))
    drafts.push({
      opened: d * MINUTES_PER_DAY + openingMinute(rng),
      category: 'Immigration & mobility',
      requester: rng.pick(backlogPeople),
      stuck: 'immigration',
    })
  }
  // Employee services story 2: leave cases past their target, waiting on doctors, insurers or leave administrators.
  for (let i = 0; i < 10; i++) {
    const d = onOrBeforeWeekday(AS_OF - rng.int(9, 27))
    drafts.push({
      opened: d * MINUTES_PER_DAY + openingMinute(rng),
      category: 'Leave & accommodation',
      requester: rng.pick(backlogPeople),
      stuck: 'leave',
    })
  }
  drafts.sort((a, b) => a.opened - b.opened)

  // Exact on-time shares for the planted groups.
  const july = (dr: Draft) => {
    const d = Math.floor(dr.opened / MINUTES_PER_DAY)
    return d >= day('2026-07-01') && d <= day('2026-07-31')
  }
  const onTime = new Map<Draft, boolean>()
  const groups: [(dr: Draft) => boolean, number][] = [
    [(dr) => dr.category === 'Payroll' && july(dr), PLANTED_ON_TIME.payrollJuly],
    [(dr) => dr.category === 'Leave & accommodation' && dr.stuck == null, PLANTED_ON_TIME.leave],
  ]
  for (const [inGroup, share] of groups) {
    const members = rng.shuffle(drafts.filter(inGroup))
    const met = Math.round(members.length * share)
    for (const [k, dr] of members.entries()) onTime.set(dr, k < met)
  }

  return drafts.map((dr, i) => {
    const cat = CASE_CATEGORIES.find((c) => c.category === dr.category)!
    const p = dr.requester
    let channel = rng.pickPair(CHANNELS)
    if (channel === 'Walk-in' && !HR_DESK_SITES.has(p.site)) channel = 'Portal'
    const tier = tierFor(dr.category, rng)
    const team = cat.team
    const pool = agentsByTeam.get(team) ?? []
    const local = pool.filter((a) => a.apac === APAC.has(p.site))
    const assignee = tier === 'Tier 0' || !pool.length ? null : rng.pick(local.length ? local : pool).idx
    const responseMinutes = Math.round(
      cat.responseHours * 60 * rng.lognormal(tier === 'Tier 0' ? 0.05 : 0.25, 0.7),
    )
    const firstResponse = dr.opened + Math.max(5, responseMinutes)
    const ratio = resolutionRatio(onTime.get(dr) ?? null, rng)
    // Outside employee relations, nothing but the planted backlog stays open past 25 days.
    const cap = dr.category === 'Employee relations' ? 75 * 24 : 25 * 24
    const resolveMinutes = Math.max(
      Math.round(Math.min(ratio * cat.resolutionHours, cap) * 60),
      firstResponse - dr.opened + 10,
    )
    const resolved = dr.opened + resolveMinutes
    const isOpen = dr.stuck != null || resolved > AS_OF_END
    const responded = firstResponse <= AS_OF_END
    const status: HrCase['status'] = !isOpen
      ? resolved < (AS_OF - 7) * MINUTES_PER_DAY
        ? 'Closed'
        : 'Resolved'
      : dr.stuck === 'leave'
        ? 'Waiting on third party'
        : responded
          ? openStatus(dr.category, rng)
          : 'New'
    const slaMet = resolveMinutes <= cat.resolutionHours * 60
    let csat: number | null = null
    if (!isOpen && rng.chance(0.35)) {
      const mean = CSAT_MEAN[channel] - (slaMet ? 0 : 0.6)
      csat = Math.min(5, Math.max(1, Math.round(rng.normal(mean, 0.8))))
    }
    const reopened = !isOpen && rng.chance(dr.category === 'HR data & records' ? 0.13 : 0.03)
    const escalated =
      dr.category === 'Employee relations'
        ? rng.chance(0.25)
        : rng.chance(tier === 'Tier 2' || tier === 'Tier 3' ? 0.09 : 0.035)
    const subs = SUBCATEGORIES[dr.category]
    return {
      caseId: `HR-${String(100001 + i)}`,
      openedAt: isoMinute(dr.opened),
      firstResponseAt: responded ? isoMinute(firstResponse) : null,
      resolvedAt: isOpen ? null : isoMinute(resolved),
      status,
      category: dr.category,
      // Employee relations subcategories are never recorded in the sample (privacy posture).
      subcategory: subs ? rng.pick(subs) : null,
      processId: cat.processId,
      channel,
      priority: priorityFor(dr.category, rng),
      tier,
      team,
      assignee: assignee == null ? null : w.people[assignee].name,
      requesterId: p.id,
      location: p.site,
      responseTargetHours: cat.responseHours,
      resolutionTargetHours: cat.resolutionHours,
      csat,
      reopened,
      escalated,
    }
  })
}

/* ───────────── transactions ───────────── */

/** Payroll cut-off for the pay period containing d: five business days before month end. */
function payrollCutoff(d: Day): Day {
  const cut = addBusinessDays(monthEnd(d), -5)
  return d <= cut ? cut : addBusinessDays(monthEnd(monthEnd(d) + 1), -5)
}

/** Final pay deadline from the jurisdiction's rule and the exit type. */
function finalPayDue(p: Person): Day {
  const term = p.term!
  const involuntary = p.termType === 'Involuntary'
  const nextPayday = nextFriday(term + 7)
  switch (siteByLocation.get(p.site)!.jurisdiction) {
    case 'us-ca':
      return term
    case 'us-tx':
      return involuntary ? term + 6 : nextPayday
    case 'us-co':
      return involuntary ? term : nextPayday
    case 'in':
      return addBusinessDays(term, 2)
    case 'vn':
      return addBusinessDays(term, 14)
    default:
      return nextPayday
  }
}

interface TxDraft {
  type: TransactionType
  person: Person
  submitted: Day
  effective: Day
  due: Day
  completed: Day | null
}

/** Completion inside the deadline window, or late by a few days. */
function completion(rng: Rng, submitted: Day, due: Day, late: boolean, maxLate = 6): Day {
  if (due <= submitted) return submitted + (late ? rng.int(1, 3) : 0)
  if (late) return due + rng.int(1, maxLate)
  return Math.min(due, submitted + rng.int(1, Math.min(5, due - submitted)))
}

export function transactionRows(w: World, rng: Rng): HrTransaction[] {
  const drafts: TxDraft[] = []
  const people = w.people.filter((p) => p.type !== 'Contractor' && p.hire >= 0)
  const employees = people.filter((p) => p.type === 'Employee')
  const push = (
    type: TransactionType,
    person: Person,
    submitted: Day,
    effective: Day,
    due: Day,
    completed: Day | null,
  ) => {
    drafts.push({
      type,
      person,
      submitted,
      effective,
      due,
      completed: completed != null && completed <= AS_OF ? completed : null,
    })
  }

  // Same-day California discharges and India's two-working-day rule are the final-pay deadlines most
  // often missed: an exact share of those exits is late, against about 3% elsewhere.
  const jurisdiction = (p: Person) => siteByLocation.get(p.site)!.jurisdiction
  const riskyExit = (p: Person) =>
    jurisdiction(p) === 'in' || (jurisdiction(p) === 'us-ca' && p.termType === 'Involuntary')
  const lateExits = new Set<Person>()
  for (const inGroup of [
    (p: Person) => jurisdiction(p) === 'in',
    (p: Person) => riskyExit(p) && jurisdiction(p) === 'us-ca',
  ]) {
    const exits = rng.shuffle(people.filter((p) => p.term != null && p.term >= T24_START && inGroup(p)))
    for (const p of exits.slice(0, Math.round(exits.length * 0.26))) lateExits.add(p)
  }

  for (const p of people) {
    // New hires: everything must be ready three business days before the start date.
    if (p.hire >= T24_START) {
      const due = addBusinessDays(p.hire, -3)
      const lead =
        p.type === 'Intern'
          ? rng.int(30, 60)
          : APAC.has(p.site) || p.site === 'Munich'
            ? rng.int(25, 60)
            : rng.int(10, 24)
      const submitted = Math.min(due - 1, onOrAfterWeekday(p.hire - lead))
      const late = rng.chance(APAC.has(p.site) ? 0.15 : 0.02)
      push('New hire', p, submitted, p.hire, due, completion(rng, submitted, due, late))
    }
    // Terminations: final pay by the jurisdiction's deadline.
    if (p.term != null && p.term >= T24_START) {
      const due = finalPayDue(p)
      const voluntary = p.termType === 'Voluntary'
      const notice = voluntary
        ? p.site === 'Bengaluru'
          ? rng.int(60, 90)
          : p.site === 'Munich'
            ? rng.int(30, 90)
            : rng.int(14, 28)
        : p.termReason === 'End of contract'
          ? rng.int(20, 45)
          : rng.int(0, 3)
      const submitted = Math.min(due, onOrBeforeWeekday(p.term - notice))
      const jur = jurisdiction(p)
      const late = riskyExit(p) ? lateExits.has(p) : rng.chance(0.03)
      const completed = late
        ? due + rng.int(1, jur === 'us-ca' ? 4 : 6)
        : Math.max(submitted, due - rng.int(0, Math.min(3, due - submitted)))
      push('Termination', p, submitted, p.term, due, completed)
    }
  }

  // Job changes from the history (manager-only changes are org updates, not HR transactions).
  for (const p of employees) {
    for (const e of p.events) {
      if (e.day < T24_START || e.type === 'Manager change') continue
      const due = payrollCutoff(e.day)
      const submitted = Math.min(AS_OF, onOrAfterWeekday(e.day - rng.int(-5, 20)))
      push('Job change', p, submitted, e.day, due, completion(rng, submitted, due, rng.chance(0.08), 12))
    }
  }

  const activeOnDay = (d: Day) => employees.filter((p) => activeOn(p, d) && p.hire < d - 30)
  const monthly = (count: number, fn: (d: Day) => void) => {
    for (let m = T24_START; m <= AS_OF; m = monthEnd(m) + 1) {
      const last = Math.min(monthEnd(m), AS_OF)
      for (let i = 0; i < count; i++) {
        const d = onOrBeforeWeekday(rng.int(m, last))
        fn(d >= m ? d : onOrAfterWeekday(m))
      }
    }
  }

  // Off-cycle pay changes, leaves, relocations and personal data updates.
  monthly(22, (d) => {
    const p = rng.pick(activeOnDay(d))
    // Off-cycle changes take effect on the 16th or the 1st of the next month.
    const effective = d - monthStart(d) < 15 ? monthStart(d) + 15 : monthEnd(d) + 1
    if (effective > AS_OF) return
    const due = payrollCutoff(effective)
    push('Compensation change', p, d, effective, due, completion(rng, d, due, rng.chance(0.08), 12))
  })
  monthly(11, (d) => {
    const p = rng.pick(activeOnDay(d))
    const start = onOrAfterWeekday(d + rng.int(5, 30))
    if (start > AS_OF) return
    const submitted = d
    push('Leave start', p, submitted, start, start, completion(rng, submitted, start, rng.chance(0.06)))
    const length = rng.chance(0.55) ? rng.int(84, 126) : rng.int(14, 90)
    const back = onOrAfterWeekday(start + length)
    if (back <= AS_OF && (p.term == null || p.term > back)) {
      const sub = onOrBeforeWeekday(back - rng.int(3, 14))
      push('Return from leave', p, sub, back, back, completion(rng, sub, back, rng.chance(0.05)))
    }
  })
  monthly(3, (d) => {
    const p = rng.pick(activeOnDay(d))
    const effective = onOrAfterWeekday(d + rng.int(10, 40))
    if (effective > AS_OF) return
    const due = payrollCutoff(effective)
    push('Location change', p, d, effective, due, completion(rng, d, due, rng.chance(0.06)))
  })
  monthly(46, (d) => {
    const p = rng.pick(activeOnDay(d))
    const due = addBusinessDays(d, 2)
    push('Personal data change', p, d, d, due, completion(rng, d, due, rng.chance(0.04), 4))
  })

  drafts.sort(
    (a, b) => a.submitted - b.submitted || a.effective - b.effective || (a.person.id < b.person.id ? -1 : 1),
  )
  return drafts.map((t, i) => {
    const completed = t.completed
    return {
      transactionId: `TX-${String(300001 + i)}`,
      type: t.type,
      employeeId: t.person.id,
      submittedDate: iso(t.submitted),
      effectiveDate: iso(t.effective),
      dueDate: iso(t.due),
      completedDate: isoOrNull(completed),
      processId: TRANSACTION_PROCESS[t.type],
      retro:
        t.type === 'Job change' || t.type === 'Compensation change'
          ? completed != null && completed > t.due
          : null,
    }
  })
}
