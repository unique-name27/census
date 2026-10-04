/**
 * The listening program (docs/ROADMAP.md, Listening): every survey the Listening tab reads, in
 * long format (one row per answer), plus the Survey items reference sheet. Respondent keys are
 * employee IDs, or application IDs for candidates; they only join org, stage or req attributes.
 * Free-text comments are not part of the data.
 *
 * Triggered surveys (candidate experience, hiring manager satisfaction, onboarding pulses, exit,
 * HR service, return to work, training evaluation) cover the last 12 months in quarterly waves.
 * Stay interviews and upward manager feedback run twice a year (November 2025, May and June
 * 2026); the engagement pulse ran in May and August 2026 and stays hidden while engagement
 * surveys are off. A respondent answers each item once per wave; a chosen reason (decline, exit,
 * top stay risk) is repeated on each of that respondent's rows, so count respondents, not rows.
 *
 * Planted (README, Listening), each tied to a story already in the data:
 *  - candidates who reached the Design Verification onsite in Q3 2026 score the process far
 *    below everyone else (the onsite bottleneck);
 *  - hiring managers rate the recruiter with the heaviest load lowest (speed, communication);
 *  - Day-30 "I had what I needed" is about 3.4 in Asia Pacific against 4.3 elsewhere: it follows
 *    the late laptops in the onboarding checklist;
 *  - career growth is the top stay risk for Design Verification L4-L5 key talent (the overdue
 *    promotions);
 *  - base salary is the top exit-survey reason in Bengaluru (the pay story), although the HRIS
 *    records career growth most often there;
 *  - upward feedback is lowest for the Austin Physical Design manager with the regretted exits,
 *    with 10+ distinct respondents over four quarters so the manager cut can show.
 */
import { addDays } from '@/lib/dates'
import type {
  Candidate,
  Employee,
  HrCase,
  HrTransaction,
  LearningRecord,
  OnboardingTask,
  Requisition,
  Review,
  SurveyItem,
  SurveyResponse,
  SurveyScale,
  SurveyType,
} from '../schema'
import { AS_OF, iso } from './calendar'
import type { Rng } from './prng'

/** Triggered surveys: answers from the last 12 months, in quarterly waves. */
export const TRIGGERED_FROM = '2025-10-01'
/** Twice-yearly programs: stay interviews and upward manager feedback. */
export const STAY_WAVES = [
  { wave: '2025 H2', from: '2025-11-03', to: '2025-11-21' },
  { wave: '2026 H1', from: '2026-05-11', to: '2026-05-29' },
] as const
export const MANAGER_WAVES = [
  { wave: '2025 H2', from: '2025-11-03', to: '2025-11-14' },
  { wave: '2026 H1', from: '2026-06-08', to: '2026-06-19' },
] as const
export const ENGAGEMENT_WAVES = [
  { wave: '2026 Q2', from: '2026-05-18', to: '2026-05-29' },
  { wave: '2026 Q3', from: '2026-08-17', to: '2026-08-28' },
] as const
export const APAC_SITES: ReadonlySet<string> = new Set([
  'Bengaluru',
  'Hsinchu',
  'Shanghai',
  'Ho Chi Minh City',
])

interface ItemDef {
  survey: SurveyType
  item: string
  driver: string
  text: string
  scale: SurveyScale
  target: number | null
}

const item = (
  survey: SurveyType,
  code: string,
  driver: string,
  text: string,
  scale: SurveyScale = '1-5',
  target: number | null = scale === '1-5' ? 4 : null,
): ItemDef => ({ survey, item: code, driver, text, scale, target })

/** Every item the sample asks, with its driver and target (the Survey items sheet). */
export const ITEMS: readonly ItemDef[] = [
  item(
    'Candidate experience',
    'CX_NPS',
    'Recommend',
    'How likely are you to recommend applying to Northgate to a friend?',
    '0-10',
  ),
  item(
    'Candidate experience',
    'CX_INFORMED',
    'Communication',
    'We kept you informed about what happens next.',
  ),
  item(
    'Candidate experience',
    'CX_INTERVIEW',
    'Interview experience',
    'Your interviewers were prepared and respectful.',
  ),
  item('Candidate experience', 'CX_TIME', 'Respect for your time', 'The process moved at a reasonable pace.'),
  item('Hiring manager satisfaction', 'HM_SPEED', 'Speed', 'The role was filled in the time we agreed.'),
  item(
    'Hiring manager satisfaction',
    'HM_SLATE',
    'Slate quality',
    'The candidates I met were a good fit for the role.',
  ),
  item(
    'Hiring manager satisfaction',
    'HM_COMMS',
    'Communication',
    'My recruiter kept me informed throughout.',
  ),
  item(
    'Hiring manager satisfaction',
    'HM_OVERALL',
    'Overall',
    'Overall, I am satisfied with how this role was filled.',
  ),
  item(
    'Onboarding pulse day 30',
    'ON30_READY',
    'Week-1 readiness',
    'In my first week I had what I needed to do my job.',
    '1-5',
    4.2,
  ),
  item('Onboarding pulse day 30', 'ON30_CLARITY', 'Role clarity', 'I understand what is expected of me.'),
  item(
    'Onboarding pulse day 30',
    'ON30_MANAGER',
    'Manager support',
    'My manager has made time to help me settle in.',
  ),
  item('Onboarding pulse day 30', 'ON30_WELCOME', 'Belonging', 'I feel welcome on my team.'),
  item('Onboarding pulse day 90', 'ON90_CLARITY', 'Role clarity', 'I understand what is expected of me.'),
  item(
    'Onboarding pulse day 90',
    'ON90_MANAGER',
    'Manager support',
    'My manager gives me the support I need.',
  ),
  item(
    'Onboarding pulse day 90',
    'ON90_MATCH',
    'Job match',
    'The job matches what I was told when I was hired.',
  ),
  item('Onboarding pulse day 90', 'ON90_GROWTH', 'Career growth', 'I can see how I will grow here.'),
  item('Onboarding pulse day 90', 'ON90_STAY', 'Intent to stay', 'I expect to be working here in two years.'),
  item(
    'Stay interview',
    'STAY_GROWTH',
    'Career growth',
    'I can see a path to my next role here.',
    '1-5',
    3.8,
  ),
  item('Stay interview', 'STAY_PAY', 'Pay', 'My pay is fair for the work I do.', '1-5', 3.8),
  item('Stay interview', 'STAY_MANAGER', 'Manager', 'My manager supports my development.', '1-5', 3.8),
  item('Stay interview', 'STAY_WORK', 'The work', 'My work is interesting and meaningful.', '1-5', 3.8),
  item('Stay interview', 'STAY_FLEX', 'Flexibility', 'I have the flexibility I need.', '1-5', 3.8),
  item('Exit survey', 'EXIT_MANAGER', 'Manager', 'My manager supported me.'),
  item('Exit survey', 'EXIT_GROWTH', 'Career growth', 'I had opportunities to grow.'),
  item('Exit survey', 'EXIT_PAY', 'Pay', 'I was paid fairly for my role.'),
  item('Exit survey', 'EXIT_WORKLOAD', 'Workload', 'My workload was manageable.'),
  item(
    'Exit survey',
    'EXIT_RETURN',
    'Would return',
    'I would consider working at Northgate again.',
    '1-5',
    3.5,
  ),
  item('Manager feedback', 'MGR_PRIORITIES', 'Clarity', 'My manager sets clear priorities.'),
  item('Manager feedback', 'MGR_FEEDBACK', 'Feedback', 'My manager gives me useful feedback.'),
  item('Manager feedback', 'MGR_GROWTH', 'Development', 'My manager supports my growth.'),
  item('Manager feedback', 'MGR_CARE', 'Care', 'My manager cares about my wellbeing.'),
  item(
    'HR service survey',
    'HRS_SAT',
    'Satisfaction',
    'How satisfied are you with how your request was handled?',
    '1-5',
    4.2,
  ),
  item('HR service survey', 'HRS_EFFORT', 'Effort', 'It was easy to get my request resolved.'),
  item(
    'Return to work',
    'RTW_SYSTEMS',
    'Systems ready',
    'My laptop, access and pay were ready when I came back.',
    '1-5',
    4.3,
  ),
  item('Return to work', 'RTW_CHECKIN', 'Manager check-in', 'My manager met with me in my first week back.'),
  item('Return to work', 'RTW_SMOOTH', 'Overall', 'Overall, my return was smooth.'),
  item('Training evaluation', 'TRN_USEFUL', 'Usefulness', 'The course was useful for my work.'),
  item('Training evaluation', 'TRN_RELEVANT', 'Relevance', 'The content was relevant to my role.'),
  item(
    'Engagement',
    'ENG_ENPS',
    'eNPS',
    'How likely are you to recommend Northgate as a place to work?',
    '0-10',
  ),
  item('Engagement', 'ENG_PRIDE', 'Pride', 'I am proud to work for Northgate.'),
]

const itemsOf = (survey: SurveyType) => ITEMS.filter((i) => i.survey === survey)

export interface SurveyInputs {
  employees: readonly Employee[]
  candidates: readonly Candidate[]
  requisitions: readonly Requisition[]
  cases: readonly HrCase[]
  transactions: readonly HrTransaction[]
  learning: readonly LearningRecord[]
  reviews: readonly Review[]
  onboardingTasks: readonly OnboardingTask[]
  /** The person's manager on a date (from the job history). */
  managerAt: (employeeId: string, date: string) => string | null
}

/** "2026 Q3" for a date. */
export const quarterLabel = (d: string): string =>
  `${d.slice(0, 4)} Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}`

const activeOn = (e: Employee, d: string) => e.hireDate <= d && (!e.terminationDate || e.terminationDate > d)

/** The recruiter carrying the most open requisitions (hiring managers rate them lowest). */
export function busiestRecruiter(reqs: readonly Requisition[]): string | null {
  const n = new Map<string, number>()
  for (const r of reqs)
    if (r.status === 'Open' && r.recruiter) n.set(r.recruiter, (n.get(r.recruiter) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
}

/** The manager with the most regretted "My manager" exits in the last 12 months (the Austin story). */
export function lowFeedbackManager(employees: readonly Employee[]): string | null {
  const n = new Map<string, number>()
  for (const e of employees)
    if (
      e.terminationDate &&
      e.terminationDate >= TRIGGERED_FROM &&
      e.regrettable &&
      e.terminationReason === 'My manager' &&
      e.managerId
    )
      n.set(e.managerId, (n.get(e.managerId) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
}

export function surveyRows(
  input: SurveyInputs,
  rng: Rng,
): { responses: SurveyResponse[]; items: SurveyItem[] } {
  const asOf = iso(AS_OF)
  const out: SurveyResponse[] = []
  const byId = new Map(input.employees.map((e) => [e.employeeId, e]))
  const reqs = new Map(input.requisitions.map((r) => [r.reqId, r]))
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  const score = (mean: number, scale: SurveyScale) =>
    scale === '0-10'
      ? clamp(Math.round(rng.normal(mean, 1.7)), 0, 10)
      : clamp(Math.round(rng.normal(mean, 0.75)), 1, 5)
  /** One respondent's answers to every item of a survey; `mean` gives each item's expected score. */
  const answer = (
    survey: SurveyType,
    wave: string,
    date: string,
    respondentKey: string,
    mean: (it: ItemDef) => number,
    extra: Pick<SurveyResponse, 'reason' | 'subjectKey' | 'touchpoint'> = {},
  ) => {
    for (const it of itemsOf(survey))
      out.push({
        survey,
        wave,
        responseDate: date,
        respondentKey,
        item: it.item,
        driver: it.driver,
        score: score(mean(it), it.scale),
        scale: it.scale,
        reason: extra.reason ?? null,
        subjectKey: extra.subjectKey ?? null,
        touchpoint: extra.touchpoint ?? null,
      })
  }
  const inTriggered = (d: string) => d >= TRIGGERED_FROM && d <= asOf

  /* Candidate experience: sent after an interview stage and after the offer decision; each
     candidate answers once, about the furthest point they reached. */
  for (const c of input.candidates) {
    if (!c.screenDate) continue
    const r = reqs.get(c.reqId)
    if (!r) continue
    const offer = c.status === 'Hired' || c.status === 'Declined'
    const touchpoint = offer ? 'Offer' : c.onsiteDate ? 'Onsite' : c.hmDate ? 'Hiring manager' : 'Screen'
    const event = offer
      ? c.status === 'Hired'
        ? c.hiredDate
        : c.rejectedDate
      : touchpoint === 'Onsite'
        ? c.onsiteDate
        : touchpoint === 'Hiring manager'
          ? c.hmDate
          : c.screenDate
    if (!event) continue
    const date = addDays(event, rng.int(1, 4))
    if (!inTriggered(date)) continue
    const rate =
      c.status === 'Hired' ? 0.45 : c.status === 'Declined' ? 0.35 : touchpoint === 'Onsite' ? 0.36 : 0.22
    if (!rng.chance(rate)) continue
    // The Design Verification onsite bottleneck this quarter: weeks of waiting after the onsite.
    const bottleneck =
      r.department === 'Design Verification' && touchpoint === 'Onsite' && date >= '2026-07-01'
    const base =
      c.status === 'Hired' ? 4.4 : c.status === 'Declined' ? 3.9 : c.status === 'Rejected' ? 3.6 : 3.9
    const nps = bottleneck
      ? 6.2
      : c.status === 'Hired'
        ? 9
        : c.status === 'Declined'
          ? 8
          : c.status === 'Rejected'
            ? 7.6
            : 8
    answer(
      'Candidate experience',
      quarterLabel(date),
      date,
      c.applicationId,
      (it) => {
        if (it.scale === '0-10') return nps
        return bottleneck ? (it.item === 'CX_TIME' ? 2.1 : it.item === 'CX_INFORMED' ? 2.4 : 3.2) : base
      },
      {
        subjectKey: c.reqId,
        touchpoint,
        reason: c.status === 'Declined' ? (c.rejectionReason ?? null) : null,
      },
    )
  }

  /* Hiring manager satisfaction: when a req is filled. */
  const slow = busiestRecruiter(input.requisitions)
  for (const r of input.requisitions) {
    if (r.status !== 'Filled' || !r.filledDate || !r.hiringManagerId) continue
    const date = addDays(r.filledDate, rng.int(3, 14))
    if (!inTriggered(date)) continue
    const hm = byId.get(r.hiringManagerId)
    if (!hm || !activeOn(hm, date) || !rng.chance(0.72)) continue
    const low = r.recruiter === slow
    answer(
      'Hiring manager satisfaction',
      quarterLabel(date),
      date,
      r.hiringManagerId,
      (it) =>
        low
          ? it.item === 'HM_SPEED'
            ? 2.5
            : it.item === 'HM_COMMS'
              ? 2.6
              : it.item === 'HM_SLATE'
                ? 3.5
                : 2.9
          : it.item === 'HM_SPEED'
            ? 3.9
            : 4.2,
      { subjectKey: r.reqId },
    )
  }

  /* Onboarding pulses: 30 and 90 days after the start, for people still here. */
  const lateLaptop = new Set(
    input.onboardingTasks
      .filter(
        (t) =>
          t.task === 'Laptop shipped' &&
          t.employeeId &&
          t.completedDate &&
          t.dueDate &&
          t.completedDate > t.dueDate,
      )
      .map((t) => t.employeeId!),
  )
  for (const e of input.employees) {
    if (e.employmentType !== 'Employee' || e.hireDate < '2025-06-01' || e.hireDate > asOf) continue
    const apac = APAC_SITES.has(e.location)
    const gtm = e.businessUnit === 'Go-to-Market'
    for (const [survey, offset, rate] of [
      ['Onboarding pulse day 30', 30, 0.76],
      ['Onboarding pulse day 90', 90, 0.66],
    ] as const) {
      const date = addDays(e.hireDate, offset + rng.int(0, 6))
      if (!inTriggered(date) || !activeOn(e, date) || !rng.chance(rate)) continue
      const late = lateLaptop.has(e.employeeId)
      answer(survey, quarterLabel(date), date, e.employeeId, (it) => {
        if (it.item === 'ON30_READY') return late ? 2.6 : apac ? 3.9 : 4.4
        if (it.item === 'ON90_MATCH') return gtm ? 3.5 : 4.1
        if (it.item === 'ON90_GROWTH') return 3.9
        return 4.2
      })
    }
  }

  /* Stay interviews: key talent, rated 4+ in the last two cycles before the wave. */
  const ratings = new Map<string, Review[]>()
  for (const r of input.reviews) {
    const list = ratings.get(r.employeeId)
    if (list) list.push(r)
    else ratings.set(r.employeeId, [r])
  }
  for (const list of ratings.values()) list.sort((a, b) => a.cycleDate.localeCompare(b.cycleDate))
  const keyTalent = (e: Employee, on: string) => {
    const last = (ratings.get(e.employeeId) ?? []).filter((r) => r.cycleDate < on).slice(-2)
    return last.length === 2 && last.every((r) => r.rating >= 4)
  }
  const RISKS = ['Career growth', 'Pay', 'Manager', 'The work', 'Flexibility'] as const
  for (const w of STAY_WAVES) {
    for (const e of input.employees) {
      if (e.employmentType !== 'Employee' || !activeOn(e, w.from) || !keyTalent(e, w.from)) continue
      if (!rng.chance(0.86)) continue
      const date = addDays(w.from, rng.int(0, 18))
      if (date > w.to || !activeOn(e, date)) continue
      const dv = e.department === 'Design Verification' && (e.level === 'L4' || e.level === 'L5')
      const bengaluru = e.location === 'Bengaluru'
      const risk = dv
        ? rng.pickPair<(typeof RISKS)[number]>([
            ['Career growth', 70],
            ['Pay', 15],
            ['Manager', 5],
            ['The work', 5],
            ['Flexibility', 5],
          ])
        : rng.pickPair<(typeof RISKS)[number]>([
            ['Career growth', 26],
            ['Pay', bengaluru ? 40 : 24],
            ['Manager', 16],
            ['The work', 18],
            ['Flexibility', 16],
          ])
      answer(
        'Stay interview',
        w.wave,
        date,
        e.employeeId,
        (it) => {
          if (it.driver === risk) return 2.6
          if (dv && it.item === 'STAY_GROWTH') return 2.4
          if (bengaluru && it.item === 'STAY_PAY') return 3.2
          return 4.0
        },
        { reason: risk },
      )
    }
  }

  /* Exit survey: at notice of resignation. */
  const DRIVER_OF_REASON: Record<string, string> = {
    'Career growth or promotion': 'EXIT_GROWTH',
    'Base salary': 'EXIT_PAY',
    'Equity, bonus or total rewards': 'EXIT_PAY',
    'My manager': 'EXIT_MANAGER',
    'Workload or burnout': 'EXIT_WORKLOAD',
  }
  for (const e of input.employees) {
    if (e.employmentType !== 'Employee' || e.terminationType !== 'Voluntary' || !e.terminationDate) continue
    const notice =
      e.location === 'Bengaluru'
        ? rng.int(55, 85)
        : e.location === 'Munich'
          ? rng.int(30, 80)
          : rng.int(10, 25)
    const date = addDays(e.terminationDate, -notice)
    if (!inTriggered(date) || date < e.hireDate || !rng.chance(0.66)) continue
    let reason = e.terminationReason ?? 'Other'
    // Bengaluru leavers name pay in the survey more often than the exit interview code says.
    if (e.location === 'Bengaluru' && reason === 'Career growth or promotion' && rng.chance(0.3))
      reason = 'Base salary'
    const weak = DRIVER_OF_REASON[reason]
    answer(
      'Exit survey',
      quarterLabel(date),
      date,
      e.employeeId,
      (it) => {
        if (it.item === 'EXIT_RETURN') return e.regrettable ? 3.9 : 2.9
        if (it.item === weak) return 1.9
        return 3.3
      },
      { reason },
    )
  }

  /* Manager feedback: direct reports rate their manager twice a year (the manager is the subject). */
  const lowManager = lowFeedbackManager(input.employees)
  const managerQuality = new Map<string, number>()
  const quality = (id: string) => {
    let q = managerQuality.get(id)
    if (q === undefined) {
      q = id === lowManager ? -1.75 : rng.normal(0, 0.3)
      managerQuality.set(id, q)
    }
    return q
  }
  for (const w of MANAGER_WAVES) {
    for (const e of input.employees) {
      if (e.employmentType !== 'Employee' || !activeOn(e, w.from) || addDays(e.hireDate, 30) > w.from)
        continue
      const mgr = input.managerAt(e.employeeId, w.from)
      if (!mgr) continue
      if (!rng.chance(mgr === lowManager ? 1 : 0.58)) continue
      const date = addDays(w.from, rng.int(0, 11))
      if (date > w.to || !activeOn(e, date)) continue
      const q = quality(mgr)
      answer(
        'Manager feedback',
        w.wave,
        date,
        e.employeeId,
        (it) => 4.05 + q + (it.item === 'MGR_FEEDBACK' ? -0.15 : 0),
        { subjectKey: mgr },
      )
    }
  }

  /* HR service survey: the case satisfaction survey, extended with effort. Never sent for
     employee relations cases. */
  for (const c of input.cases) {
    if (c.csat == null || !c.resolvedAt || !c.requesterId || c.category === 'Employee relations') continue
    const date = addDays(c.resolvedAt.slice(0, 10), rng.int(0, 3))
    if (!inTriggered(date)) continue
    for (const it of itemsOf('HR service survey'))
      out.push({
        survey: 'HR service survey',
        wave: quarterLabel(date),
        responseDate: date,
        respondentKey: c.requesterId,
        item: it.item,
        driver: it.driver,
        score: it.item === 'HRS_SAT' ? c.csat : clamp(Math.round(c.csat - 0.2 + rng.normal(0, 0.6)), 1, 5),
        scale: '1-5',
        reason: null,
        subjectKey: c.caseId,
        touchpoint: null,
      })
  }

  /* Return to work: 30 days after coming back, for people still here. */
  const returned = new Set<string>()
  for (const t of input.transactions) {
    if (t.type !== 'Return from leave' || t.effectiveDate > asOf) continue
    const e = byId.get(t.employeeId)
    const date = addDays(t.effectiveDate, 30 + rng.int(0, 5))
    if (!e || !inTriggered(date) || !activeOn(e, date) || !rng.chance(0.62)) continue
    const once = `${t.employeeId}|${quarterLabel(date)}`
    if (returned.has(once)) continue
    returned.add(once)
    const late = !t.completedDate || t.completedDate > t.dueDate
    answer('Return to work', quarterLabel(date), date, t.employeeId, (it) =>
      it.item === 'RTW_SYSTEMS' ? (late ? 2.4 : 4.2) : it.item === 'RTW_SMOOTH' ? (late ? 3.2 : 4.1) : 4.0,
    )
  }

  /* Training evaluation: after a completed course. */
  const seen = new Set<string>()
  for (const l of input.learning) {
    if (!l.completedDate || !inTriggered(l.completedDate) || !rng.chance(0.06)) continue
    const e = byId.get(l.employeeId)
    const exportCourse = l.course.startsWith('Export control')
    const engineering =
      e?.businessUnit === 'Silicon Engineering' ||
      e?.businessUnit === 'Systems & Software' ||
      e?.businessUnit === 'Operations'
    const base = l.category === 'Compliance' ? 3.5 : l.category === 'Security' ? 3.7 : 4.3
    const later = addDays(l.completedDate, rng.int(0, 2))
    const answered = later > asOf ? l.completedDate : later
    const k = `${l.employeeId}|${l.course}|${quarterLabel(answered)}`
    if (seen.has(k)) continue
    seen.add(k)
    answer(
      'Training evaluation',
      quarterLabel(answered),
      answered,
      l.employeeId,
      (it) => (exportCourse && !engineering && it.item === 'TRN_RELEVANT' ? 2.7 : base),
      { subjectKey: l.course },
    )
  }

  /* Engagement pulse (hidden while engagement surveys are off). */
  for (const w of ENGAGEMENT_WAVES) {
    for (const e of input.employees) {
      if (e.employmentType !== 'Employee' || !activeOn(e, w.from) || addDays(e.hireDate, 30) > w.from)
        continue
      if (!rng.chance(0.45)) continue
      const date = addDays(w.from, rng.int(0, 11))
      if (date > w.to || !activeOn(e, date)) continue
      const shift = (e.location === 'Bengaluru' ? -0.35 : 0) + (e.managerId === lowManager ? -0.9 : 0)
      answer('Engagement', w.wave, date, e.employeeId, (it) =>
        it.scale === '0-10' ? 7.4 + shift * 2 : 4.0 + shift,
      )
    }
  }

  // Program order, then date, respondent and item order (as a survey tool's long export reads).
  const programOrder = new Map([...new Set(ITEMS.map((i) => i.survey))].map((s, i) => [s, i] as const))
  const itemOrder = new Map(ITEMS.map((i, k) => [`${i.survey}|${i.item}`, k] as const))
  out.sort(
    (a, b) =>
      programOrder.get(a.survey)! - programOrder.get(b.survey)! ||
      a.responseDate.localeCompare(b.responseDate) ||
      a.respondentKey.localeCompare(b.respondentKey) ||
      (a.subjectKey ?? '').localeCompare(b.subjectKey ?? '') ||
      itemOrder.get(`${a.survey}|${a.item}`)! - itemOrder.get(`${b.survey}|${b.item}`)!,
  )
  const items: SurveyItem[] = ITEMS.map((i) => ({
    item: i.item,
    driver: i.driver,
    survey: i.survey,
    text: i.text,
    scale: i.scale,
    target: i.target,
  }))
  return { responses: out, items }
}
