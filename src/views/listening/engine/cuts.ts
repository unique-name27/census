/**
 * The cuts each survey area adds to the shared measures (docs/VIEWS.md, Listening, Layout):
 * candidate NPS by stage and department, source and recruiter, and why candidates declined;
 * hiring manager satisfaction by recruiter; day-30 readiness by region with the late laptops
 * behind it; stay risks for key talent; the exit reason Pareto, would return and the regretted
 * gap; upward feedback by manager (manager cuts only); HR service by category and channel;
 * return to work by processing time; training by course; eNPS by business unit.
 *
 * Every number is an aggregate over at least the minimum of distinct respondents. Reason counts
 * are counts of people and show only when the group they come from reaches the minimum.
 */
import type { AnalyticsContext } from '@/data/context'
import { type Employee, type ISODate, LEVELS, type OnboardingTask, type SurveyResponse } from '@/data/schema'
import type { DrillFilter } from '@/drill/types'
import {
  aggregate,
  type Breakdown,
  breakdown,
  type ManagerCut,
  managerCuts,
  type SurveyAggregate,
} from '@/lib/surveys'
import { PAY_REASONS } from './catalog'
import {
  candidateOf,
  cutOf,
  deptBandOf,
  deptBandOfKey,
  type Prepared,
  regionOfLocation,
  reqOfAnswer,
} from './prepare'
import type { ListeningSettings } from './settings'

/* ───────────── shared shapes ───────────── */

export interface GroupScore {
  group: string
  /** Mean on 1-5, or NPS for NPS cuts; null when hidden. */
  value: number | null
  respondents: number
  suppressed: boolean
}

const scoreOf = (a: SurveyAggregate, measure: 'mean' | 'nps'): number | null =>
  a.suppressed ? null : measure === 'nps' ? a.nps : a.mean

/** A breakdown as rows: shown groups, then "Other (k)" (hidden while still too small). */
export function scoresOf(b: Breakdown, measure: 'mean' | 'nps'): GroupScore[] {
  return [...b.groups, ...(b.other ? [b.other] : [])].map((g) => ({
    group: g.group,
    value: scoreOf(g, measure),
    respondents: g.respondents,
    suppressed: g.suppressed,
  }))
}

const sq = (n: number) => Math.sqrt(Math.max(1, n))
const nps = (rows: readonly SurveyResponse[]) => rows.filter((r) => r.scale === '0-10')
const fivePoint = (rows: readonly SurveyResponse[]) => rows.filter((r) => r.scale === '1-5')

/** One reason per respondent (or respondent and wave): the first one given. */
export function reasonsOf(
  rows: readonly SurveyResponse[],
  perWave = false,
): { key: string; respondentKey: string; reason: string }[] {
  const seen = new Map<string, { key: string; respondentKey: string; reason: string }>()
  for (const r of rows) {
    const reason = r.reason?.trim()
    if (!reason) continue
    const key = perWave ? `${r.respondentKey}\u0001${r.wave}` : r.respondentKey
    if (!seen.has(key)) seen.set(key, { key, respondentKey: r.respondentKey, reason })
  }
  return [...seen.values()]
}

export interface ReasonRow {
  reason: string
  /** People (or person-waves for stay interviews) who chose it. */
  count: number
  share: number
}

/** Reason counts, largest first. */
export function reasonRows(list: readonly { reason: string }[]): ReasonRow[] {
  const n = new Map<string, number>()
  for (const r of list) n.set(r.reason, (n.get(r.reason) ?? 0) + 1)
  const total = list.length
  return [...n]
    .map(([reason, count]) => ({ reason, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
}

/* ───────────── candidates ───────────── */

export interface StageCell {
  department: string
  stage: string
  nps: number | null
  respondents: number
  suppressed: boolean
}

export interface StageFlag {
  stage: string
  department: string
  nps: number
  respondents: number
  restNps: number
  restRespondents: number
  gap: number
  /** The flagged group's lowest 1-5 driver. */
  lowDriver: { driver: string; mean: number } | null
  /** Active candidates in the department past this stage with no offer yet. */
  waiting: number
}

export interface StageCut {
  departments: string[]
  stages: string[]
  cells: StageCell[]
  flag: StageFlag | null
}

const STAGE_ORDER = ['Screen', 'Hiring manager', 'Onsite', 'Offer']
const stageRank = (s: string) => {
  const i = STAGE_ORDER.indexOf(s)
  return i < 0 ? STAGE_ORDER.length : i
}

/** Candidate NPS by department and furthest stage, in the given answers (the latest wave). */
export function stageCut(
  ctx: AnalyticsContext,
  p: Prepared,
  rows: readonly SurveyResponse[],
  min: number,
  gapMin: number,
): StageCut {
  const ten = nps(rows)
  const deptOf = cutOf(p, 'department')
  const overall = breakdown(ten, deptOf, { min })
  const big = new Set(overall.groups.map((g) => g.group))
  const other = overall.other?.group ?? null
  const dept = (r: SurveyResponse) => {
    const d = deptOf(r)
    return d == null ? null : big.has(d) ? d : other
  }
  const stages = [...new Set(ten.map((r) => r.touchpoint?.trim()).filter((s): s is string => !!s))].sort(
    (a, b) => stageRank(a) - stageRank(b) || a.localeCompare(b),
  )
  const departments = [...big, ...(other ? [other] : [])]
  const cells: StageCell[] = []
  let flag: StageFlag | null = null
  let best = 0
  for (const stage of stages) {
    const atStage = ten.filter((r) => r.touchpoint?.trim() === stage)
    for (const department of departments) {
      const mine = atStage.filter((r) => dept(r) === department)
      const a = aggregate(mine, { min })
      cells.push({
        department,
        stage,
        nps: scoreOf(a, 'nps'),
        respondents: a.respondents,
        suppressed: a.suppressed,
      })
      if (a.suppressed || a.nps == null || department === other) continue
      const rest = aggregate(
        atStage.filter((r) => dept(r) !== department),
        { min },
      )
      if (rest.suppressed || rest.nps == null) continue
      const gap = rest.nps - a.nps
      const score = gap * sq(a.respondents)
      if (gap >= gapMin && score > best) {
        best = score
        flag = {
          stage,
          department,
          nps: a.nps,
          respondents: a.respondents,
          restNps: rest.nps,
          restRespondents: rest.respondents,
          gap,
          lowDriver: null,
          waiting: 0,
        }
      }
    }
  }
  if (flag) {
    const f = flag
    const keys = new Set(
      ten
        .filter((r) => r.touchpoint?.trim() === f.stage && dept(r) === f.department)
        .map((r) => r.respondentKey),
    )
    const theirs = fivePoint(rows).filter((r) => keys.has(r.respondentKey))
    const drivers = breakdown(theirs, (r) => r.driver ?? r.item, { min }).groups.filter((g) => g.mean != null)
    const low = drivers.sort((a, b) => (a.mean ?? 0) - (b.mean ?? 0))[0]
    f.lowDriver = low ? { driver: low.group, mean: low.mean as number } : null
    f.waiting = waitingAfter(ctx, f.stage, f.department)
  }
  return { departments, stages, cells, flag }
}

/** Active candidates in a department whose furthest stage is `stage`, with no offer yet. */
export function waitingAfter(ctx: AnalyticsContext, stage: string, department: string): number {
  const reqs = new Map(ctx.data.requisitions.map((r) => [r.reqId, r]))
  return ctx.data.candidates.filter((c) => {
    if (c.status !== 'Active' || c.offerDate) return false
    if (reqs.get(c.reqId)?.department !== department) return false
    return c.currentStage === stage
  }).length
}

/** Candidate NPS by the candidate's source or recruiter, over the given answers. */
export function candidateNpsBy(
  p: Prepared,
  rows: readonly SurveyResponse[],
  by: 'source' | 'recruiter',
  min: number,
): Breakdown {
  return breakdown(
    nps(rows),
    (r) => {
      const c = candidateOf(p, r)
      if (!c) return null
      if (by === 'source') return c.source || null
      return c.recruiter || p.req.get(c.reqId)?.recruiter || null
    },
    { min },
  )
}

export interface DeclineCut {
  /** Candidates who declined and chose a reason. */
  total: number
  rows: ReasonRow[]
  /** Fewer decliners than the minimum: the reasons are hidden. */
  suppressed: boolean
}

export function declineCut(rows: readonly SurveyResponse[], min: number): DeclineCut {
  const list = reasonsOf(rows)
  const suppressed = list.length < min
  return { total: list.length, rows: suppressed ? [] : reasonRows(list), suppressed }
}

/* ───────────── hiring managers ───────────── */

export interface RecruiterFlag {
  recruiter: string
  mean: number
  respondents: number
  /** Range of the other recruiters shown. */
  othersLow: number | null
  othersHigh: number | null
  restMean: number
  /** Filled reqs behind the answers. */
  reqs: number
  lowDrivers: { driver: string; mean: number }[]
  openReqs: number
  activeCandidates: number
  /** Carries the most open reqs of any recruiter. */
  heaviest: boolean
}

export interface RecruiterCut {
  breakdown: Breakdown
  flag: RecruiterFlag | null
}

export function recruiterCut(
  ctx: AnalyticsContext,
  p: Prepared,
  rows: readonly SurveyResponse[],
  min: number,
  gapMin: number,
): RecruiterCut {
  const five = fivePoint(rows)
  const recruiterOf = (r: SurveyResponse) => reqOfAnswer(p, r)?.recruiter || null
  const b = breakdown(five, recruiterOf, { min })
  let flag: RecruiterFlag | null = null
  const shown = b.groups.filter((g) => g.mean != null)
  if (shown.length >= 2) {
    const low = [...shown].sort((a, c) => (a.mean ?? 0) - (c.mean ?? 0))[0]
    const restRows = five.filter((r) => recruiterOf(r) !== low.group && recruiterOf(r) != null)
    const rest = aggregate(restRows, { min })
    if (low.mean != null && rest.mean != null && rest.mean - low.mean >= gapMin) {
      const mine = five.filter((r) => recruiterOf(r) === low.group)
      const others = shown.filter((g) => g.group !== low.group).map((g) => g.mean as number)
      const drivers = breakdown(mine, (r) => r.driver ?? r.item, { min })
        .groups.filter((g) => g.mean != null)
        .sort((a, c) => (a.mean ?? 0) - (c.mean ?? 0))
        .slice(0, 2)
        .map((g) => ({ driver: g.group, mean: g.mean as number }))
      const open = new Map<string, number>()
      for (const q of ctx.data.requisitions)
        if (q.status === 'Open' && q.recruiter) open.set(q.recruiter, (open.get(q.recruiter) ?? 0) + 1)
      const theirReqs = new Set(
        ctx.data.requisitions.filter((q) => q.recruiter === low.group).map((q) => q.reqId),
      )
      const openReqs = open.get(low.group) ?? 0
      flag = {
        recruiter: low.group,
        mean: low.mean,
        respondents: low.respondents,
        othersLow: others.length ? Math.min(...others) : null,
        othersHigh: others.length ? Math.max(...others) : null,
        restMean: rest.mean,
        reqs: new Set(mine.map((r) => r.subjectKey).filter(Boolean)).size,
        lowDrivers: drivers,
        openReqs,
        activeCandidates: ctx.data.candidates.filter((c) => c.status === 'Active' && theirReqs.has(c.reqId))
          .length,
        heaviest: openReqs > 0 && [...open.values()].every((n) => n <= openReqs),
      }
    }
  }
  return { breakdown: b, flag }
}

/* ───────────── onboarding ───────────── */

const READINESS = /readiness|had what (i|you) needed|ready/i

/** The day-30 readiness answers: the driver or item that asks whether people had what they needed. */
export function readinessRows(p: Prepared, rows: readonly SurveyResponse[]): SurveyResponse[] {
  return fivePoint(rows).filter((r) => {
    if (READINESS.test(r.driver ?? '') || READINESS.test(r.item)) return true
    const text = p.items.get(r.survey, r.item)?.text ?? ''
    return READINESS.test(text)
  })
}

export interface LaptopTie {
  region: string
  /** Starts in the period at the region's sites with a laptop task. */
  starts: number
  late: number
  share: number
}

export interface ReadinessFlag {
  region: string
  mean: number
  respondents: number
  restMean: number
  restRespondents: number
  laptop: LaptopTie | null
  /** Readiness of respondents whose laptop shipped late, when that group reaches the minimum. */
  lateMean: number | null
  lateRespondents: number
}

export interface ReadinessCut {
  overall: SurveyAggregate
  byRegion: Breakdown
  /** Each region shown, with its late laptops (people operations' numbers beside the survey's). */
  regions: RegionReadiness[]
  flag: ReadinessFlag | null
}

/** Laptop tasks of the people who started in the window, late when shipped after due (or not yet, past due). */
export function laptopLate(
  ctx: AnalyticsContext,
  w: { start: ISODate; end: ISODate },
  inRegion: (location: string) => boolean,
): {
  starts: number
  late: number
  lateIds: Set<string>
  tasks: OnboardingTask[]
  lateTasks: OnboardingTask[]
} {
  const emp = ctx.org.byId
  const end = w.end < ctx.asOf ? w.end : ctx.asOf
  const seen = new Map<string, boolean>()
  const tasks: OnboardingTask[] = []
  const lateTasks: OnboardingTask[] = []
  for (const t of ctx.data.onboardingTasks) {
    if (t.task !== 'Laptop shipped' || !t.employeeId) continue
    const e = emp.get(t.employeeId)
    if (!e || e.hireDate < w.start || e.hireDate > end || !inRegion(e.location)) continue
    const late = t.completedDate
      ? !!t.dueDate && t.completedDate > t.dueDate
      : !!t.dueDate && t.dueDate < ctx.asOf
    seen.set(e.employeeId, (seen.get(e.employeeId) ?? false) || late)
    tasks.push(t)
    if (late) lateTasks.push(t)
  }
  const lateIds = new Set([...seen].filter(([, l]) => l).map(([id]) => id))
  return { starts: seen.size, late: lateIds.size, lateIds, tasks, lateTasks }
}

export interface RegionReadiness {
  region: string
  mean: number | null
  respondents: number
  suppressed: boolean
  /** Starts in the period with a laptop task, and how many shipped late; null without tasks. */
  starts: number | null
  late: number | null
  lateShare: number | null
}

export function readinessCut(
  ctx: AnalyticsContext,
  p: Prepared,
  rows: readonly SurveyResponse[],
  min: number,
  gapMin: number,
): ReadinessCut {
  const ready = readinessRows(p, rows)
  const regionOf = cutOf(p, 'region')
  const byRegion = breakdown(ready, regionOf, { min })
  const overall = aggregate(ready, { min })
  let flag: ReadinessFlag | null = null
  let worst = 0
  for (const g of byRegion.groups) {
    if (g.mean == null) continue
    const rest = aggregate(
      ready.filter((r) => regionOf(r) !== g.group),
      { min },
    )
    if (rest.mean == null) continue
    const gap = rest.mean - g.mean
    if (gap >= gapMin && gap > worst) {
      worst = gap
      flag = {
        region: g.group,
        mean: g.mean,
        respondents: g.respondents,
        restMean: rest.mean,
        restRespondents: rest.respondents,
        laptop: null,
        lateMean: null,
        lateRespondents: 0,
      }
    }
  }
  if (flag && ctx.data.onboardingTasks.length) {
    const f = flag
    const tie = laptopLate(ctx, ctx.window, (loc) => regionOfLocation(p, loc) === f.region)
    if (tie.starts >= min)
      f.laptop = { region: f.region, starts: tie.starts, late: tie.late, share: tie.late / tie.starts }
    const all = laptopLate(ctx, { start: '0000-01-01', end: ctx.asOf }, () => true)
    const late = aggregate(
      ready.filter((r) => all.lateIds.has(r.respondentKey)),
      { min },
    )
    f.lateMean = late.mean
    f.lateRespondents = late.respondents
  }
  const hasTasks = ctx.data.onboardingTasks.length > 0
  const regions: RegionReadiness[] = [...byRegion.groups, ...(byRegion.other ? [byRegion.other] : [])].map(
    (g) => {
      const tie =
        hasTasks && !g.folded
          ? laptopLate(ctx, ctx.window, (loc) => regionOfLocation(p, loc) === g.group)
          : null
      return {
        region: g.group,
        mean: g.mean,
        respondents: g.respondents,
        suppressed: g.suppressed,
        starts: tie ? tie.starts : null,
        late: tie ? tie.late : null,
        lateShare: tie?.starts ? tie.late / tie.starts : null,
      }
    },
  )
  return { overall, byRegion, regions, flag }
}

/* ───────────── stay and exit ───────────── */

export interface StayGroup {
  group: string
  respondents: number
  interviews: number
  reason: string
  count: number
  share: number
}

export interface StayFlag extends StayGroup {
  companyShare: number
  /** The driver named like the reason: the group's mean against other key talent's. */
  driver: { driver: string; mean: number; restMean: number } | null
}

export interface StayCut {
  /** Stay interviews (person and wave) that named a reason. */
  interviews: number
  respondents: number
  reasons: ReasonRow[]
  /** Department and career band groups at the minimum, with their top reason. */
  groups: StayGroup[]
  flag: StayFlag | null
  suppressed: boolean
}

export function stayCut(
  p: Prepared,
  rows: readonly SurveyResponse[],
  min: number,
  shareMin: number,
): StayCut {
  const list = reasonsOf(rows, true)
  const respondents = new Set(list.map((x) => x.respondentKey)).size
  if (respondents < min)
    return { interviews: list.length, respondents, reasons: [], groups: [], flag: null, suppressed: true }
  const reasons = reasonRows(list)
  const companyShare = new Map(reasons.map((r) => [r.reason, r.share]))
  const groupOf = deptBandOf(p)
  const groupOfKey = deptBandOfKey(p)
  const by = new Map<string, typeof list>()
  for (const x of list) {
    const g = groupOfKey(x.respondentKey)
    if (!g) continue
    const l = by.get(g)
    if (l) l.push(x)
    else by.set(g, [x])
  }
  const groups: StayGroup[] = []
  let flag: StayFlag | null = null
  let best = 0
  for (const [group, items] of by) {
    const people = new Set(items.map((x) => x.respondentKey)).size
    if (people < min) continue
    const top = reasonRows(items)[0]
    const g: StayGroup = {
      group,
      respondents: people,
      interviews: items.length,
      reason: top.reason,
      count: top.count,
      share: top.share,
    }
    groups.push(g)
    const lift = top.share - (companyShare.get(top.reason) ?? 0)
    const score = lift * sq(items.length)
    if (top.share >= shareMin && lift > 0 && score > best) {
      best = score
      flag = { ...g, companyShare: companyShare.get(top.reason) ?? 0, driver: null }
    }
  }
  groups.sort((a, b) => b.share - a.share || b.interviews - a.interviews)
  if (flag) {
    const f = flag
    const inGroup = (r: SurveyResponse) => groupOf(r) === f.group
    const named = fivePoint(rows).filter((r) => (r.driver ?? '').toLowerCase() === f.reason.toLowerCase())
    const mine = aggregate(named.filter(inGroup), { min })
    const rest = aggregate(
      named.filter((r) => !inGroup(r)),
      { min },
    )
    if (mine.mean != null && rest.mean != null)
      f.driver = { driver: named[0].driver ?? f.reason, mean: mine.mean, restMean: rest.mean }
  }
  return { interviews: list.length, respondents, reasons, groups, flag, suppressed: false }
}

/** "Design Verification L4-L5" splits into its department and band for filters and copy. */
export function splitDeptBand(group: string): { department: string; band: string } {
  const i = group.lastIndexOf(' ')
  return { department: group.slice(0, i), band: group.slice(i + 1) }
}

/**
 * The scope that reproduces a department and career band group: its department and the levels
 * its respondents hold (all within the band), so "Filter to" keeps exactly the group.
 */
export function deptBandFilter(
  p: Prepared,
  group: string,
  respondentKeys: Iterable<string>,
): DrillFilter | undefined {
  const { department } = splitDeptBand(group)
  const held = new Set<string>()
  for (const key of respondentKeys) {
    const e = p.emp.get(key)
    if (e?.level && e.department === department) held.add(e.level)
  }
  const level = LEVELS.filter((l) => held.has(l))
  return department && level.length ? { department: [department], level } : undefined
}

export interface ExitLocation {
  location: string
  respondents: number
  reason: string
  count: number
  share: number
  /** The next most named reason and its count. */
  next: { reason: string; count: number } | null
}

export interface ExitFlag extends ExitLocation {
  /** Share of leavers elsewhere who name the same reason. */
  restShare: number
  /** Voluntary leavers at the location in the period, by the HRIS termination reason. */
  hris: { leavers: number; surveyReason: number; topReason: string | null; topCount: number } | null
  pay: boolean
}

export interface ExitCut {
  respondents: number
  reasons: ReasonRow[]
  locations: ExitLocation[]
  flag: ExitFlag | null
  suppressed: boolean
}

/** Reasons too vague to act on are never flagged. */
const VAGUE = /^(other|unknown|not given|none)$/i

/**
 * The exit reason Pareto, the top reason per location (locations at the minimum), and the
 * location whose top reason stands out most against leavers elsewhere.
 */
export function exitCut(
  ctx: AnalyticsContext,
  p: Prepared,
  rows: readonly SurveyResponse[],
  min: number,
  shareMin: number,
): ExitCut {
  const list = reasonsOf(rows)
  if (list.length < min)
    return { respondents: list.length, reasons: [], locations: [], flag: null, suppressed: true }
  const reasons = reasonRows(list)
  const companyCount = new Map(reasons.map((r) => [r.reason, r.count]))
  const by = new Map<string, typeof list>()
  for (const x of list) {
    const loc = p.emp.get(x.respondentKey)?.location
    if (!loc) continue
    const l = by.get(loc)
    if (l) l.push(x)
    else by.set(loc, [x])
  }
  const locations: ExitLocation[] = []
  let flag: ExitFlag | null = null
  let best = 0
  for (const [location, items] of by) {
    if (items.length < min) continue
    const rr = reasonRows(items)
    const top = rr[0]
    const loc: ExitLocation = {
      location,
      respondents: items.length,
      reason: top.reason,
      count: top.count,
      share: top.share,
      next: rr[1] ? { reason: rr[1].reason, count: rr[1].count } : null,
    }
    locations.push(loc)
    if (VAGUE.test(top.reason) || top.share < shareMin || (rr[1] && rr[1].count === top.count)) continue
    const elsewhere = list.length - items.length
    if (elsewhere < min) continue
    const restShare = ((companyCount.get(top.reason) ?? 0) - top.count) / elsewhere
    const score = top.count * (top.share - restShare)
    if (top.share > restShare && score > best) {
      best = score
      flag = { ...loc, restShare, hris: null, pay: PAY_REASONS.has(top.reason) }
    }
  }
  locations.sort((a, b) => b.respondents - a.respondents)
  if (flag) {
    const f = flag
    const leavers = ctx.data.employees.filter(
      (e) =>
        e.employmentType === 'Employee' &&
        e.terminationType === 'Voluntary' &&
        e.location === f.location &&
        !!e.terminationDate &&
        e.terminationDate >= ctx.window.start &&
        e.terminationDate <= ctx.window.end,
    )
    if (leavers.length >= min) {
      const hr = reasonRows(
        leavers.filter((e) => e.terminationReason).map((e) => ({ reason: e.terminationReason as string })),
      )
      f.hris = {
        leavers: leavers.length,
        surveyReason: leavers.filter((e) => e.terminationReason === f.reason).length,
        topReason: hr[0]?.reason ?? null,
        topCount: hr[0]?.count ?? 0,
      }
    }
  }
  return { respondents: list.length, reasons, locations, flag, suppressed: false }
}

const WOULD_RETURN = /would return|work(ing)? (here|at .+) again|consider .*again|return/i

/** The exit survey's "would return" answers. */
export function wouldReturnRows(p: Prepared, rows: readonly SurveyResponse[]): SurveyResponse[] {
  return fivePoint(rows).filter((r) => {
    if (WOULD_RETURN.test(r.driver ?? '')) return true
    return WOULD_RETURN.test(p.items.get(r.survey, r.item)?.text ?? '')
  })
}

export interface WouldReturn {
  /** Share answering 4 or 5. */
  share: number | null
  mean: number | null
  respondents: number
  suppressed: boolean
  found: boolean
}

export function wouldReturnOf(p: Prepared, rows: readonly SurveyResponse[], min: number): WouldReturn {
  const r = wouldReturnRows(p, rows)
  const a = aggregate(r, { min })
  return {
    share: a.topBox,
    mean: a.mean,
    respondents: a.respondents,
    suppressed: a.suppressed,
    found: r.length > 0,
  }
}

export interface GapRow {
  driver: string
  regretted: number | null
  regrettedN: number
  other: number | null
  otherN: number
  gap: number | null
}

/** Exit driver means for regretted leavers and other leavers who left by choice. */
export function regrettedGap(p: Prepared, rows: readonly SurveyResponse[], min: number): GapRow[] {
  const five = fivePoint(rows)
  const flagOf = (r: SurveyResponse) => {
    const e = p.emp.get(r.respondentKey)
    if (!e || e.regrettable == null) return null
    return e.regrettable ? 'regretted' : 'other'
  }
  const drivers = [...new Set(five.map((r) => r.driver ?? r.item))]
  return drivers.map((driver) => {
    const mine = five.filter((r) => (r.driver ?? r.item) === driver)
    const a = aggregate(
      mine.filter((r) => flagOf(r) === 'regretted'),
      { min },
    )
    const b = aggregate(
      mine.filter((r) => flagOf(r) === 'other'),
      { min },
    )
    return {
      driver,
      regretted: a.mean,
      regrettedN: a.respondents,
      other: b.mean,
      otherN: b.respondents,
      gap: a.mean != null && b.mean != null ? a.mean - b.mean : null,
    }
  })
}

/* ───────────── managers ───────────── */

export interface ManagerRow {
  managerId: string
  name: string
  department: string | null
  location: string | null
  hrbp: string | null
  mean: number | null
  respondents: number
  low: boolean
}

export interface ManagerFlag extends ManagerRow {
  mean: number
  /** Managers shown (10+ respondents). */
  shown: number
  average: number | null
  /** Regretted leavers who reported to the manager, in the period. */
  regrettedExits: number
}

export interface ManagerCutResult {
  rows: ManagerRow[]
  /** Managers with answers but fewer respondents than the manager-cut minimum. */
  hidden: number
  window: { start: ISODate; end: ISODate }
  flags: ManagerFlag[]
  cuts: ManagerCut[]
}

export function managerCut(
  ctx: AnalyticsContext,
  rows: readonly SurveyResponse[],
  s: Pick<ListeningSettings, 'minManager' | 'quarters' | 'lowManager'>,
): ManagerCutResult {
  const employees: readonly Employee[] = ctx.all.employees
  const res = managerCuts(rows, employees, { asOf: ctx.asOf, minManager: s.minManager, quarters: s.quarters })
  const byId = ctx.org.byId
  const shownCuts = res.cuts.filter((c) => !c.suppressed && c.mean != null)
  const out: ManagerRow[] = shownCuts.map((c) => {
    const e = byId.get(c.managerId)
    return {
      managerId: c.managerId,
      name: e?.name ?? c.managerId,
      department: e?.department ?? null,
      location: e?.location ?? null,
      hrbp: e?.hrbp ?? null,
      mean: c.mean,
      respondents: c.respondents,
      low: (c.mean ?? 5) < s.lowManager,
    }
  })
  out.sort((a, b) => (a.mean ?? 0) - (b.mean ?? 0) || a.name.localeCompare(b.name))
  const total = shownCuts.reduce((acc, c) => acc + (c.mean ?? 0) * c.responses, 0)
  const n = shownCuts.reduce((acc, c) => acc + c.responses, 0)
  const average = n ? total / n : null
  const flags: ManagerFlag[] = out
    .filter((r) => r.low && r.mean != null)
    .map((r) => ({
      ...r,
      mean: r.mean as number,
      shown: out.length,
      average,
      regrettedExits: employees.filter(
        (e) =>
          e.managerId === r.managerId &&
          e.terminationType === 'Voluntary' &&
          e.regrettable === true &&
          !!e.terminationDate &&
          e.terminationDate >= ctx.window.start &&
          e.terminationDate <= ctx.window.end,
      ).length,
    }))
  return { rows: out, hidden: res.hidden, window: res.window, flags, cuts: res.cuts }
}

/* ───────────── services and learning ───────────── */

export function serviceBy(
  p: Prepared,
  rows: readonly SurveyResponse[],
  by: 'category' | 'channel',
  min: number,
) {
  return breakdown(
    fivePoint(rows),
    (r) => {
      const c = r.subjectKey ? p.cases.get(r.subjectKey) : undefined
      return (by === 'category' ? c?.category : c?.channel) || null
    },
    { min },
  )
}

export interface ReturnRow {
  driver: string
  late: number | null
  lateN: number
  onTime: number | null
  onTimeN: number
  gap: number | null
}

export interface ReturnCut {
  rows: ReturnRow[]
  flag: ReturnRow | null
  /** Whether an answer's return was processed late (true), on time (false) or can't be joined (null). */
  lateOf: (r: SurveyResponse) => boolean | null
  /** Returns from leave in the period processed after their due date (or still open past it). */
  lateReturns: number
  returns: number
}

/** Return to work scores split by whether the return was processed by its due date. */
export function returnCut(
  ctx: AnalyticsContext,
  rows: readonly SurveyResponse[],
  min: number,
  gapMin: number,
): ReturnCut {
  const byEmp = new Map<string, { effectiveDate: string; late: boolean }[]>()
  let lateReturns = 0
  let returns = 0
  for (const t of ctx.data.transactions) {
    if (t.type !== 'Return from leave' || t.effectiveDate > ctx.asOf) continue
    const late = t.completedDate ? t.completedDate > t.dueDate : t.dueDate < ctx.asOf
    const l = byEmp.get(t.employeeId)
    const rec = { effectiveDate: t.effectiveDate, late }
    if (l) l.push(rec)
    else byEmp.set(t.employeeId, [rec])
    if (t.effectiveDate >= ctx.window.start && t.effectiveDate <= ctx.window.end) {
      returns++
      if (late) lateReturns++
    }
  }
  const lateOf = (r: SurveyResponse): boolean | null => {
    const list = byEmp.get(r.respondentKey)
    if (!list) return null
    const before = list
      .filter((t) => t.effectiveDate <= r.responseDate)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
    return before[0]?.late ?? null
  }
  const five = fivePoint(rows)
  const drivers = [...new Set(five.map((r) => r.driver ?? r.item))]
  const out: ReturnRow[] = drivers.map((driver) => {
    const mine = five.filter((r) => (r.driver ?? r.item) === driver)
    const a = aggregate(
      mine.filter((r) => lateOf(r) === true),
      { min },
    )
    const b = aggregate(
      mine.filter((r) => lateOf(r) === false),
      { min },
    )
    return {
      driver,
      late: a.mean,
      lateN: a.respondents,
      onTime: b.mean,
      onTimeN: b.respondents,
      gap: a.mean != null && b.mean != null ? b.mean - a.mean : null,
    }
  })
  const flag =
    out.filter((r) => r.gap != null && r.gap >= gapMin).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))[0] ?? null
  return { rows: out, flag, lateOf, lateReturns, returns }
}

export function courseBy(rows: readonly SurveyResponse[], min: number): Breakdown {
  return breakdown(fivePoint(rows), (r) => r.subjectKey?.trim() || null, { min })
}

/** eNPS by business unit over the given answers. */
export function engagementBy(p: Prepared, rows: readonly SurveyResponse[], min: number): Breakdown {
  return breakdown(nps(rows), cutOf(p, 'businessUnit'), { min })
}
