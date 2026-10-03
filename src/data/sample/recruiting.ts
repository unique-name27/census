/**
 * Recruiting for the last 24 months. Filled requisitions are built from the people the roster
 * actually hired (and from internal transfers), plus recent accepts who start after the as-of
 * date. Applicant pipelines are simulated stage by stage; offer declines are planned per quarter so
 * the acceptance trend is controlled; open requisitions carry the live pipeline with next steps.
 */
import type { Candidate, CandidateStatus, Level, Requisition, Stage } from '../schema'
import { stageIndex } from '../schema'
import {
  AS_OF,
  type Day,
  day,
  iso,
  isoOrNull,
  nextMonday,
  onOrBeforeWeekday,
  T24_START,
  ymd,
} from './calendar'
import { CORP, DEPTS, type DeptSpec, deptSpec, EO, GTM, OPS, SE, SS } from './departments'
import { hireTitle, managerOn } from './employees'
import { activeOn, type World } from './model'
import type { NameBook } from './names'
import type { Rng } from './prng'
import { drawIcLevel, roleFor, titleAt, titleFor } from './titles'

type Kind = 'filled' | 'open' | 'hold' | 'cancelled'
type Plant = 'none' | 'ams-critical' | 'awaiting-hm'
type Priority = Requisition['priority']

interface Req {
  title: string
  bu: string
  dept: string
  site: string
  level: Level
  hm: number | null
  recruiter: number
  opened: Day
  targetStart: Day | null
  filled: Day | null
  closed: Day | null
  holdDay: Day | null
  kind: Kind
  reqType: 'New' | 'Backfill'
  priority: Priority
  openings: number
  plant: Plant
}

interface App {
  name: string
  req: Req
  source: string
  stage: Stage
  status: CandidateStatus
  applied: Day
  screen: Day | null
  hmDay: Day | null
  onsite: Day | null
  offer: Day | null
  hired: Day | null
  entered: Day
  exit: Day | null
  reason: string | null
  next: Day | null
  last: Day
}

const Q3_START = day('2026-07-01')
const JUNIOR = new Set(['L1', 'L2'])

/** Days between accepting an offer and starting, by site (India and Germany have long notice periods). */
function noticeDays(site: string, rng: Rng): number {
  switch (site) {
    case 'Bengaluru':
      return rng.int(60, 92)
    case 'Munich':
      return rng.int(45, 95)
    case 'Haifa':
    case 'Hsinchu':
    case 'Shanghai':
    case 'Ho Chi Minh City':
      return rng.int(30, 50)
    default:
      return rng.int(14, 35)
  }
}

/** Median days to fill by level; senior and analog roles take far longer. */
const TTF_MEDIAN: Record<Level, number> = {
  L1: 32,
  L2: 36,
  L3: 40,
  L4: 45,
  L5: 102,
  L6: 112,
  M1: 72,
  M2: 110,
  E1: 120,
  E2: 130,
  E3: 150,
}
const ttfFor = (level: Level, dept: string, rng: Rng): number =>
  Math.min(
    240,
    Math.round(rng.lognormal(TTF_MEDIAN[level] * (dept === 'Analog & Mixed-Signal' ? 1.35 : 1), 0.22)),
  )

/** Onsite-to-decision days; Design Verification decisions slowed down sharply this quarter. */
const onsiteDays = (dept: string, decision: Day, rng: Rng): number =>
  dept === 'Design Verification' && decision >= Q3_START ? rng.int(18, 32) : rng.int(5, 12)

/* ───────────── sources ───────────── */

const SOURCE_BASE: [string, number][] = [
  ['Referral', 6],
  ['Sourced', 17],
  ['Careers site', 30],
  ['Job board', 30],
  ['Agency', 5],
  ['University', 6],
  ['Internal', 4],
]
/** Job board volume decays steadily (about -40% year over year). */
const jobBoardDecay = (d: Day): number => Math.exp(-0.094 * ((d - T24_START) / 30.4))

function applicantSource(rng: Rng, d: Day, level: Level): string {
  return rng.pickPair(
    SOURCE_BASE.map(([s, wt]) => {
      if (s === 'Job board') return [s, wt * jobBoardDecay(d)] as const
      if (s === 'University') return [s, JUNIOR.has(level) ? wt * 2.5 : 0] as const
      if (s === 'Agency')
        return [s, level === 'L5' || level === 'L6' || level.startsWith('M') ? wt * 2 : wt] as const
      return [s, wt] as const
    }),
  )
}

function hireSource(rng: Rng, d: Day, level: Level): string {
  const pairs: [string, number][] = [
    ['Referral', 24],
    ['Sourced', 22],
    ['Careers site', 18],
    ['Job board', 12 * jobBoardDecay(d)],
    ['Agency', 8],
    ['University', JUNIOR.has(level) ? 14 : 0],
  ]
  return rng.pickPair(pairs)
}

function declineSource(rng: Rng, level: Level): string {
  const pairs: [string, number][] = [
    ['Agency', 32],
    ['Sourced', 22],
    ['Careers site', 16],
    ['Job board', 6],
    ['Referral', 4],
    ['University', JUNIOR.has(level) ? 8 : 0],
  ]
  return rng.pickPair(pairs)
}

const SOURCE_PASS: Record<string, number> = {
  Referral: 2.4,
  Internal: 2.2,
  Sourced: 1.6,
  Agency: 1.5,
  University: 1,
  'Careers site': 0.85,
  'Job board': 0.6,
}

/* ───────────── stage simulation ───────────── */

type Step = 'Applied' | 'Screen' | 'Hiring manager' | 'Onsite'
const NEXT: Record<Step, Stage> = {
  Applied: 'Screen',
  Screen: 'Hiring manager',
  'Hiring manager': 'Onsite',
  Onsite: 'Offer',
}
const PASS: Record<Step, number> = { Applied: 0.3, Screen: 0.5, 'Hiring manager': 0.5, Onsite: 0.4 }
const STALL: Record<Step, number> = { Applied: 0.14, Screen: 0.15, 'Hiring manager': 0.15, Onsite: 0.15 }
/** Share of active candidates left with no pending next step (stalled more than 14 days in stage). */
const STALE_SHARE = 0.2
const WITHDRAW: Record<Step, number> = { Applied: 0.03, Screen: 0.06, 'Hiring manager': 0.06, Onsite: 0.06 }
const REJECT: Record<Step, string[]> = {
  Applied: ['Not enough relevant experience', 'Skills mismatch', 'Location or work authorization'],
  Screen: ['Skills mismatch', 'Compensation expectations too high', 'Not enough relevant experience'],
  'Hiring manager': [
    'Stronger candidates in pipeline',
    'Skills mismatch',
    'Did not pass technical interview',
  ],
  Onsite: [
    'Did not pass technical interview',
    'Stronger candidates in pipeline',
    'Did not meet the hiring bar',
  ],
}
const WITHDRAW_REASONS = [
  'Accepted another offer',
  'No longer interested',
  'Unresponsive',
  'Personal reasons',
  'Location or relocation',
]
const DECLINE_REASONS: [string, number][] = [
  ['Accepted competing offer', 35],
  ['Compensation below expectations', 20],
  ['Counteroffer from current employer', 15],
  ['Location or relocation', 10],
  ['Role or level', 10],
  ['Personal reasons', 10],
]
const DECLINE_REASONS_BENGALURU_Q3: [string, number][] = [
  ['Accepted competing offer', 58],
  ['Compensation below expectations', 38],
  ['Counteroffer from current employer', 4],
]

function stepDays(step: Step, req: Req, from: Day, rng: Rng): number {
  switch (step) {
    case 'Applied':
      return Math.max(1, Math.round(rng.lognormal(4, 0.5)))
    case 'Screen':
      return rng.int(4, 10)
    case 'Hiring manager':
      return rng.int(5, 12)
    case 'Onsite':
      return onsiteDays(req.dept, from + 12, rng)
  }
}

function setStage(a: App, s: Stage, d: Day): void {
  a.stage = s
  a.entered = d
  if (s === 'Screen') a.screen = d
  else if (s === 'Hiring manager') a.hmDay = d
  else if (s === 'Onsite') a.onsite = d
  else if (s === 'Offer') a.offer = d
  else if (s === 'Hired') a.hired = d
}

function close(a: App, status: CandidateStatus, d: Day, reason: string): void {
  a.status = status
  a.exit = d
  a.reason = reason
  a.last = d
}

interface SimOptions {
  /** Pass every stage before this one (guarantees someone reaches it). */
  force?: Stage
  /** Never advance beyond this stage. */
  cap?: Stage
  noStall?: boolean
  boost?: number
}

/** Walk one applicant through the funnel until they exit, the req stops, or the as-of date. */
function simulate(a: App, end: Day, endReason: string | null, rng: Rng, o: SimOptions = {}): void {
  const req = a.req
  for (;;) {
    const step = a.stage as Step
    const forced = o.force != null && stageIndex(step) < stageIndex(o.force)
    const stalled = !forced && !o.noStall && rng.chance(STALL[step])
    const at = a.entered + (stalled ? rng.int(18, 70) : stepDays(step, req, a.entered, rng))
    if (at > end) {
      // Still in progress when the req stopped (or at the as-of date for open reqs).
      if (endReason && !(endReason === 'Req on hold' && rng.chance(0.25))) {
        close(a, 'Rejected', Math.min(AS_OF, end + rng.int(0, 5)), endReason)
      }
      return
    }
    if (!forced && rng.chance(WITHDRAW[step])) {
      close(a, 'Withdrawn', at, rng.pick(WITHDRAW_REASONS))
      return
    }
    const sourceFactor = step === 'Applied' ? SOURCE_PASS[a.source] : a.source === 'Referral' ? 1.15 : 1
    const p = forced ? 1 : Math.min(0.92, PASS[step] * sourceFactor * (o.boost ?? 1))
    const next = NEXT[step]
    // Offers on closed reqs belong to the hires and planned declines, so a pass there ends the process.
    const rejection = !rng.chance(p)
      ? rng.pick(REJECT[step])
      : o.cap && stageIndex(next) > stageIndex(o.cap)
        ? 'Not enough relevant experience'
        : next === 'Offer' && (req.kind !== 'open' || at < AS_OF - 10)
          ? rng.pick(['Stronger candidates in pipeline', 'Did not meet the hiring bar'])
          : null
    if (rejection) {
      close(a, 'Rejected', at, rejection)
      return
    }
    setStage(a, next, at)
    a.last = at
    if (next === 'Offer') return
  }
}

/* ───────────── generator ───────────── */

export function recruitingRows(
  w: World,
  names: NameBook,
  rng: Rng,
): { requisitions: Requisition[]; candidates: Candidate[] } {
  const { people } = w
  const reqs: Req[] = []
  const apps: App[] = []
  const actives = people.filter((p) => p.term == null && p.type === 'Employee')
  const managersIn = (dept: string, site?: string) =>
    actives.filter((p) => p.dept === dept && p.level === 'M1' && (!site || p.site === site))
  const recruiterFor = (bu: string, dept: string, site: string) =>
    (w.recruiters.find((r) => r.covers(bu, dept, site)) ?? w.recruiters[w.recruiters.length - 1]).idx
  const leaversByDeptSite = new Map<string, Day[]>()
  for (const p of people) {
    if (p.term == null || p.type !== 'Employee') continue
    const k = `${p.dept}|${p.site}`
    leaversByDeptSite.set(k, [...(leaversByDeptSite.get(k) ?? []), p.term])
  }
  const reqTypeFor = (dept: string, site: string, opened: Day): 'New' | 'Backfill' => {
    const recentExit = (leaversByDeptSite.get(`${dept}|${site}`) ?? []).some(
      (t) => t <= opened && t >= opened - 120,
    )
    return rng.chance(recentExit ? 0.75 : 0.15) ? 'Backfill' : 'New'
  }
  const priority = (): Priority =>
    rng.pickPair<Priority>([
      ['Critical', 8],
      ['High', 32],
      ['Standard', 60],
    ])
  const hmAt = (idx: number | null, on: Day): number | null => {
    for (let m = idx, guard = 0; m != null && guard < 4; m = people[m].mgr, guard++) {
      if (activeOn(people[m], on)) return m
    }
    return null
  }
  const newApp = (req: Req, name: string, source: string, applied: Day): App => ({
    name,
    req,
    source,
    stage: 'Applied',
    status: 'Active',
    applied,
    screen: null,
    hmDay: null,
    onsite: null,
    offer: null,
    hired: null,
    entered: applied,
    exit: null,
    reason: null,
    next: null,
    last: applied,
  })

  /** Stage dates for someone who received an offer on `offer`, worked backwards. */
  const pathTo = (a: App, offer: Day) => {
    a.offer = offer
    a.onsite = offer - onsiteDays(a.req.dept, offer, rng)
    a.hmDay = a.onsite - rng.int(5, 12)
    a.screen = a.hmDay - rng.int(4, 10)
    a.applied = a.screen - rng.int(2, 10)
  }

  /* Filled requisitions from roster hires: group same-role hires that accepted close together. */
  interface Accept {
    name: string
    accepted: Day
    start: Day | null
    dept: string
    site: string
    level: Level
    title: string
    hm: number | null
    source: string
  }
  const accepts: Accept[] = []
  for (const p of people) {
    if (p.type !== 'Employee' || p.hire < T24_START || p.hire > AS_OF) continue
    const accepted = Math.min(AS_OF - 1, p.hire - noticeDays(p.site, rng))
    accepts.push({
      name: p.name,
      accepted,
      start: p.hire,
      dept: p.hireDept,
      site: p.site,
      level: p.hireLevel,
      title: hireTitle(p),
      hm: managerOn(p, p.hire),
      source: hireSource(rng, accepted, p.hireLevel),
    })
  }
  // Recent accepts who start after the as-of date (long notice periods make these mostly Bengaluru).
  const growthDepts = DEPTS.filter((d) => !d.explicit)
  const growthWeight = growthDepts.map(
    (d) => d.size * ({ [SE]: 1.6, [SS]: 1.1, [OPS]: 0.8, [GTM]: 1, [CORP]: 0.6 }[d.bu] ?? 1),
  )
  for (let i = 0; i < 44; i++) {
    const spec = rng.weighted(growthDepts, growthWeight)
    const site = rng.pickPair(spec.sites)
    const accepted = onOrBeforeWeekday(rng.int(day('2026-06-01'), AS_OF - 3))
    const start = nextMonday(accepted + noticeDays(site, rng))
    if (start <= AS_OF) continue
    const { track, level } = roleFor(spec, drawIcLevel(spec, site, rng), rng)
    const hms = managersIn(spec.name, site)
    accepts.push({
      name: names.name(site),
      accepted,
      start,
      dept: spec.name,
      site,
      level,
      title: titleFor(track, level),
      hm: hms.length ? rng.pick(hms).idx : (managersIn(spec.name)[0]?.idx ?? null),
      source: hireSource(rng, accepted, level),
    })
  }
  // Internal moves: about a quarter of recent transfers came through a posted requisition.
  for (const p of people) {
    for (const e of p.events) {
      if (e.type !== 'Transfer' || e.day < T24_START + 45 || !rng.chance(0.25)) continue
      accepts.push({
        name: p.name,
        accepted: e.day - rng.int(14, 30),
        start: e.day,
        dept: e.toDept,
        site: p.site,
        level: e.toLevel,
        title: titleAt(p, e.toDept, e.toLevel),
        hm: e.toMgr,
        source: 'Internal',
      })
    }
  }

  const buckets = new Map<string, Accept[]>()
  for (const a of accepts.sort((x, y) => x.accepted - y.accepted)) {
    const k = `${a.dept}|${a.site}|${a.level}|${a.source === 'Internal'}`
    buckets.set(k, [...(buckets.get(k) ?? []), a])
  }
  const highVolume = new Set([
    'Design Verification',
    'Physical Design',
    'DFT',
    'Software',
    'Test & Product Engineering',
  ])
  for (const list of buckets.values()) {
    let group: Accept[] = []
    const flush = () => {
      if (!group.length) return
      const first = group[0]
      const spec = deptSpec(first.dept)
      const filled = group[group.length - 1].accepted
      const req: Req = {
        title: first.title,
        bu: spec.bu,
        dept: first.dept,
        site: first.site,
        level: first.level,
        hm: null,
        recruiter: recruiterFor(spec.bu, first.dept, first.site),
        opened: 0,
        targetStart: null,
        filled,
        closed: Math.min(AS_OF, filled + rng.int(0, 3)),
        holdDay: null,
        kind: 'filled',
        reqType: 'New',
        priority: priority(),
        openings: group.length,
        plant: 'none',
      }
      let earliest = Number.POSITIVE_INFINITY
      for (const acc of group) {
        const a = newApp(req, acc.name, acc.source, 0)
        pathTo(a, acc.accepted - rng.int(2, 6))
        a.hired = acc.accepted
        a.stage = 'Hired'
        a.status = 'Hired'
        a.entered = acc.accepted
        a.last = acc.accepted
        earliest = Math.min(earliest, a.applied)
        apps.push(a)
      }
      const ttf = ttfFor(first.level, first.dept, rng)
      req.opened = Math.min(filled - ttf, earliest - rng.int(2, 10))
      req.targetStart = req.opened + rng.int(75, 110)
      req.hm = hmAt(first.hm, req.opened)
      req.reqType = reqTypeFor(first.dept, first.site, req.opened)
      reqs.push(req)
      group = []
    }
    for (const a of list) {
      const max = a.source === 'Internal' ? 1 : highVolume.has(a.dept) && a.site !== 'San Jose' ? 5 : 4
      const fits =
        group.length > 0 && group.length < max && a.accepted - group[0].accepted <= 180 && rng.chance(0.92)
      if (!fits) flush()
      group.push(a)
    }
    flush()
  }

  /* Open, on-hold and cancelled requisitions. */
  const openSpec = (spec: DeptSpec, site: string, opened: Day, kind: Kind, extra: Partial<Req> = {}): Req => {
    const { track, level } = roleFor(spec, drawIcLevel(spec, site, rng), rng)
    const hms = managersIn(spec.name, site)
    const hm = hms.length ? rng.pick(hms) : managersIn(spec.name)[0]
    const req: Req = {
      title: titleFor(track, level),
      bu: spec.bu,
      dept: spec.name,
      site,
      level,
      hm: hm ? hm.idx : null,
      recruiter: recruiterFor(spec.bu, spec.name, site),
      opened,
      targetStart: opened + rng.int(75, 110),
      filled: null,
      closed: null,
      holdDay: null,
      kind,
      reqType: reqTypeFor(spec.name, site, opened),
      priority: priority(),
      openings: 1,
      plant: 'none',
      ...extra,
    }
    reqs.push(req)
    return req
  }
  const openAge = () =>
    rng.pickPair<() => number>([
      [() => rng.int(1, 30), 40],
      [() => rng.int(31, 60), 30],
      [() => rng.int(61, 90), 18],
      [() => rng.int(91, 170), 12],
    ])()

  // Recruiting story 4: critical analog roles open for months with nobody past the screen.
  const ams = deptSpec('Analog & Mixed-Signal')
  const amsPlants: [string, Level, string, number][] = [
    ['Staff Analog Design Engineer', 'L5', 'San Jose', 82],
    ['Staff Analog Design Engineer', 'L5', 'Boulder', 96],
    ['Staff Mixed-Signal Design Engineer', 'L5', 'Boulder', 111],
    ['Principal SerDes Design Engineer', 'L6', 'San Jose', 124],
  ]
  for (const [title, level, site, age] of amsPlants) {
    openSpec(ams, site, AS_OF - age, 'open', {
      title,
      level,
      priority: 'Critical',
      reqType: 'New',
      plant: 'ams-critical',
    })
  }
  // Recruiting story 3: two hiring managers sitting on interview feedback.
  for (const m of actives.filter((p) => p.tags.has('hm-awaiting'))) {
    for (let i = 0; i < 5; i++) {
      openSpec(deptSpec(m.dept), m.site, AS_OF - rng.int(15, 50), 'open', {
        hm: m.idx,
        plant: 'awaiting-hm',
        priority: rng.chance(0.5) ? 'High' : 'Standard',
      })
    }
  }
  const openPool = growthDepts.filter((d) => d.name !== 'Analog & Mixed-Signal')
  const openWeight = openPool.map(
    (d) => d.size * ({ [SE]: 1.6, [SS]: 1.1, [OPS]: 0.8, [GTM]: 1, [CORP]: 0.6, [EO]: 0 }[d.bu] ?? 1),
  )
  for (let i = 0; i < 100; i++) {
    const spec = rng.weighted(openPool, openWeight)
    const req = openSpec(spec, rng.pickPair(spec.sites), AS_OF - openAge(), 'open')
    // Bengaluru engineering reqs often cover several identical openings.
    if (req.site === 'Bengaluru' && highVolume.has(req.dept) && rng.chance(0.4)) req.openings = 2
  }
  for (let i = 0; i < 15; i++) {
    const spec = rng.weighted(openPool, openWeight)
    const opened = AS_OF - rng.int(70, 220)
    openSpec(spec, rng.pickPair(spec.sites), opened, 'hold', {
      holdDay: Math.min(AS_OF - 10, opened + rng.int(25, 80)),
    })
  }
  for (let i = 0; i < 28; i++) {
    const spec = rng.weighted(openPool, openWeight)
    const opened = rng.int(T24_START - 60, AS_OF - 45)
    openSpec(spec, rng.pickPair(spec.sites), opened, 'cancelled', {
      closed: Math.min(AS_OF - 1, opened + rng.int(20, 120)),
      targetStart: null,
    })
  }

  /* Applicant pools. */
  const baseApplicants = (level: Level) =>
    JUNIOR.has(level) ? 24 : level === 'L3' || level === 'L4' ? 17 : level.startsWith('E') ? 7 : 11
  for (const req of reqs) {
    const siteFactor = req.site === 'Bengaluru' ? 1.4 : 1
    const end =
      req.kind === 'filled'
        ? req.filled!
        : req.kind === 'cancelled'
          ? req.closed!
          : req.kind === 'hold'
            ? req.holdDay!
            : AS_OF
    const endReason =
      req.kind === 'filled'
        ? 'Position filled'
        : req.kind === 'cancelled'
          ? 'Req cancelled'
          : req.kind === 'hold'
            ? 'Req on hold'
            : null
    const span = Math.max(1, Math.min(end, AS_OF) - req.opened)
    // Open reqs accumulate applicants with age; the two feedback-heavy managers run busier pipelines.
    const openVolume = (baseApplicants(req.level) * siteFactor * Math.min(span, 90)) / 55
    const closedVolume = req.kind === 'filled' ? 0.66 * (1 + 0.4 * (req.openings - 1)) : 0.5
    const n =
      req.kind === 'open'
        ? Math.max(4, Math.round(openVolume * (req.plant === 'awaiting-hm' ? 1.5 : 1)))
        : Math.round(rng.lognormal(baseApplicants(req.level) * siteFactor, 0.3) * closedVolume)
    const opts: SimOptions =
      req.plant === 'ams-critical'
        ? { cap: 'Screen' }
        : req.plant === 'awaiting-hm'
          ? { noStall: true, boost: 2 }
          : {}
    for (let i = 0; i < n; i++) {
      // Any open role older than 45 days has at least one early candidate who reached the hiring manager.
      const lead = i === 0 && req.kind === 'open' && req.plant === 'none' && AS_OF - req.opened > 45
      const applied = lead
        ? req.opened + rng.int(1, 8)
        : req.opened + 1 + Math.floor(span * rng.next() ** 1.5)
      if (applied > AS_OF) continue
      const a = newApp(req, names.name(req.site), applicantSource(rng, applied, req.level), applied)
      simulate(a, end, endReason, rng, lead ? { force: 'Onsite', noStall: true } : opts)
      apps.push(a)
    }
  }

  /* Offer declines, planned per quarter so the acceptance trend is controlled. */
  const quarterOf = (d: Day) => {
    const s = new Date(d * 86_400_000)
    return s.getUTCFullYear() * 4 + Math.floor(s.getUTCMonth() / 3)
  }
  const quarterBounds = (q: number): [Day, Day] => {
    const y = Math.floor(q / 4)
    const m = (q % 4) * 3 + 1
    return [ymd(y, m, 1), ymd(y, m + 3, 1) - 1]
  }
  const hiresByQuarter = new Map<number, number>()
  for (const a of apps)
    if (a.status === 'Hired' && a.hired! >= T24_START - 92)
      hiresByQuarter.set(quarterOf(a.hired!), (hiresByQuarter.get(quarterOf(a.hired!)) ?? 0) + 1)
  const q3 = quarterOf(Q3_START)
  const acceptTarget = (q: number) => (q === q3 ? 0.68 : q === q3 - 1 ? 0.85 : 0.86 + 0.02 * Math.sin(q))
  const firstOffer = new Map<Req, Day>()
  for (const a of apps)
    if (a.status === 'Hired')
      firstOffer.set(a.req, Math.min(firstOffer.get(a.req) ?? Number.POSITIVE_INFINITY, a.offer!))
  for (const [q, hires] of [...hiresByQuarter].sort((x, y) => x[0] - y[0])) {
    const [qs, qe0] = quarterBounds(q)
    const qe = Math.min(qe0, AS_OF - 1)
    const target = acceptTarget(q)
    const declines = Math.round((hires * (1 - target)) / target)
    const windowFor = (req: Req): [Day, Day] => [
      Math.max(qs, req.opened + 60),
      req.kind === 'filled' ? Math.min(qe, (firstOffer.get(req) ?? qe) - 1) : qe,
    ]
    const eligible = reqs.filter((req) => {
      if ((req.kind !== 'filled' && req.kind !== 'open') || req.plant === 'ams-critical') return false
      const [lo, hi] = windowFor(req)
      return lo <= hi
    })
    const bengaluru = eligible.filter((req) => req.site === 'Bengaluru')
    for (let i = 0; i < declines && eligible.length; i++) {
      const pool = q === q3 && bengaluru.length && rng.chance(0.65) ? bengaluru : eligible
      for (let attempt = 0; attempt < 20; attempt++) {
        const req = rng.pick(pool)
        const [lo, hi] = windowFor(req)
        const declined = rng.int(lo, hi)
        const a = newApp(req, names.name(req.site), declineSource(rng, req.level), 0)
        pathTo(a, declined - rng.int(2, 7))
        if (a.applied <= req.opened) continue
        a.stage = 'Offer'
        a.entered = a.offer!
        const bengaluruQ3 = q === q3 && req.site === 'Bengaluru'
        close(
          a,
          'Declined',
          declined,
          rng.pickPair(bengaluruQ3 ? DECLINE_REASONS_BENGALURU_Q3 : DECLINE_REASONS),
        )
        apps.push(a)
        break
      }
    }
  }

  /* Next steps for the live pipeline. */
  // Recruiters archive the stalest candidates; what is left without a next step is 20% of the pipeline.
  const live = apps.filter((a) => a.status === 'Active')
  const stale = live.filter((a) => a.stage !== 'Offer' && AS_OF - a.entered > 14)
  const archive = Math.ceil((stale.length - STALE_SHARE * live.length) / (1 - STALE_SHARE))
  for (const a of rng.sample(stale, archive))
    close(a, 'Withdrawn', a.entered + rng.int(15, AS_OF - a.entered), 'Unresponsive')
  for (const a of apps) {
    if (a.status !== 'Active') continue
    if (a.stage === 'Offer') {
      a.last = a.offer!
      continue
    }
    if (a.stage === 'Applied') continue
    const age = AS_OF - a.entered
    if (age > 14) continue
    const awaitingHm = a.req.plant === 'awaiting-hm'
    if (!rng.chance(awaitingHm ? 0.95 : 0.7)) continue
    const awaiting = (awaitingHm ? rng.chance(0.9) : rng.chance(0.35)) && a.entered < AS_OF - 1
    if (awaiting) {
      a.next = Math.max(a.entered + 1, AS_OF - rng.int(1, 6))
      a.last = a.next
    } else {
      a.next = AS_OF + rng.int(1, 10)
      a.last = a.entered + rng.int(0, age)
    }
  }

  /* Emit. */
  reqs.sort((x, y) => x.opened - y.opened || (x.title < y.title ? -1 : 1))
  const reqId = new Map<Req, string>()
  for (const [i, r] of reqs.entries()) reqId.set(r, `REQ-${4001 + i}`)
  const coordinatorFor = (req: Req): number => {
    const region =
      req.site === 'Bengaluru'
        ? 'India'
        : ['Hsinchu', 'Shanghai', 'Ho Chi Minh City', 'Munich', 'Haifa'].includes(req.site)
          ? 'International'
          : 'Americas'
    const pool = w.coordinators.filter((c) => c.region === region)
    if (region !== 'Americas') return pool[0].idx
    return (req.bu === SS || req.bu === OPS ? pool[1] : pool[0]).idx
  }
  const requisitions: Requisition[] = reqs.map((r) => ({
    reqId: reqId.get(r)!,
    jobTitle: r.title,
    businessUnit: r.bu,
    department: r.dept,
    location: r.site,
    level: r.level,
    hiringManagerId: r.hm != null ? people[r.hm].id : null,
    hiringManager: r.hm != null ? people[r.hm].name : null,
    recruiter: people[r.recruiter].name,
    openedDate: iso(r.opened),
    targetStartDate: isoOrNull(r.targetStart),
    filledDate: isoOrNull(r.filled),
    closedDate: isoOrNull(r.kind === 'filled' || r.kind === 'cancelled' ? r.closed : null),
    status:
      r.kind === 'filled'
        ? 'Filled'
        : r.kind === 'cancelled'
          ? 'Cancelled'
          : r.kind === 'hold'
            ? 'On hold'
            : 'Open',
    reqType: r.reqType,
    priority: r.priority,
    openings: r.openings,
  }))
  apps.sort((x, y) => x.applied - y.applied || (x.name < y.name ? -1 : 1))
  const candidates: Candidate[] = apps.map((a, i) => {
    const reachedHm = a.hmDay != null
    return {
      applicationId: `APP-${200001 + i}`,
      candidateId: `CAN-${500001 + i}`,
      candidateName: a.name,
      reqId: reqId.get(a.req)!,
      source: a.source,
      recruiter: people[a.req.recruiter].name,
      coordinator: reachedHm ? people[coordinatorFor(a.req)].name : null,
      currentStage: a.stage,
      status: a.status,
      appliedDate: iso(a.applied),
      screenDate: isoOrNull(a.screen),
      hmDate: isoOrNull(a.hmDay),
      onsiteDate: isoOrNull(a.onsite),
      offerDate: isoOrNull(a.offer),
      hiredDate: isoOrNull(a.hired),
      stageEnteredDate: iso(a.entered),
      rejectedDate:
        a.status === 'Rejected' || a.status === 'Withdrawn' || a.status === 'Declined'
          ? isoOrNull(a.exit)
          : null,
      rejectionReason: a.reason,
      nextEventDate: isoOrNull(a.next),
      lastActivityDate: iso(Math.min(AS_OF, a.last)),
    }
  })
  return { requisitions, candidates }
}
