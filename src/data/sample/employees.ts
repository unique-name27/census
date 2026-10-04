/**
 * The people pipeline after the org is built: hire dates (shaped by business-unit growth),
 * leavers over the last three years (including the planted HRBP stories), contractors and interns,
 * first-year exits in the earlier hire cohorts, job history consistent with today's levels and
 * managers, and employee IDs in hire order.
 */
import type { ChangeType, Employee, JobChange, Level, TerminationType } from '../schema'
import { siteByLocation } from '../schema'
import {
  AS_OF,
  type Day,
  day,
  FOUNDED,
  iso,
  isoOrNull,
  nextMonday,
  onOrBeforeWeekday,
  T12_START,
  T24_START,
  yearOf,
  ymd,
} from './calendar'
import {
  CORP,
  costCenter,
  DEPTS,
  type DeptSpec,
  deptSpec,
  EO,
  GTM,
  type IcLevel,
  OPS,
  SE,
  SS,
} from './departments'
import { activeOn, type HistoryEvent, newPerson, type Person, type Tag, type World } from './model'
import type { NameBook } from './names'
import type { Rng } from './prng'
import { assignIcRole, drawIcLevel, titleAt } from './titles'

const YEAR = 365

/* ───────────── hire-date sampling ───────────── */

/** Relative hiring volume by year among people still in the data (growth with a 2020 dip and a 2023 freeze). */
const YEAR_WEIGHT: Record<number, number> = {
  2014: 1,
  2015: 2,
  2016: 3,
  2017: 4,
  2018: 5,
  2019: 6,
  2020: 4.5,
  2021: 8,
  2022: 7,
  2023: 3.5,
  2024: 7,
  2025: 8,
  2026: 8,
}

/** A Monday in [lo, hi] following the hiring curve; `early` > 0 favors the start of the range. */
function curveDay(rng: Rng, lo: Day, hi: Day, early = 0): Day {
  const span = Math.max(1, hi - lo)
  for (let attempt = 0; attempt < 60; attempt++) {
    const d = lo + Math.floor(rng.next() * span)
    const w = (YEAR_WEIGHT[yearOf(d)] ?? 4) / 8
    const bias = 1 + early * ((hi - d) / span)
    if (rng.next() < (w * bias) / (1 + early)) return clampMonday(d, lo, hi)
  }
  return clampMonday(lo + Math.floor(span / 2), lo, hi)
}

function clampMonday(d: Day, lo: Day, hi: Day): Day {
  const m = nextMonday(d)
  if (m <= hi) return m
  const back = m - 7
  return back >= lo ? back : hi
}

const mondayBetween = (rng: Rng, lo: Day, hi: Day): Day => clampMonday(rng.int(lo, hi), lo, hi)

/* ───────────── step 1: leaders ───────────── */

const PLANTED_MANAGER_HIRE: Partial<Record<Tag, string>> = {
  'new-manager': '2026-02-16',
  'pd-austin-manager': '2021-05-10',
}

/** Hire dates for directors, managers and the named People team (executives are fixed in the org). */
export function assignLeaderHires(w: World, rng: Rng): void {
  for (const p of w.people) {
    if (p.hire >= 0) continue
    const planted = [...p.tags].map((t) => PLANTED_MANAGER_HIRE[t]).find(Boolean)
    if (planted) p.hire = day(planted)
    else if (p.tags.has('named')) p.hire = curveDay(rng, FOUNDED + YEAR, day('2024-06-28'))
    else if (p.level === 'M2') p.hire = curveDay(rng, FOUNDED + 120, AS_OF - 2 * YEAR, 1.5)
    else if (p.level === 'M1') p.hire = curveDay(rng, FOUNDED + 180, AS_OF - 548, 0.6)
  }
}

/* ───────────── step 2: leavers ───────────── */

const VOLUNTARY_WEIGHTS: [string, number][] = [
  ['Career growth or promotion', 38],
  ['Equity, bonus or total rewards', 31],
  ['My manager', 18],
  ['Base salary', 19],
  ['Workload or burnout', 14],
  ['Confidence in company direction', 11],
  ['Flexibility or location', 9],
  ['Relocation, family or personal', 8],
  ['The work itself', 6],
  ['Team culture', 5],
  ['Recognition', 5],
  ['Job security', 3],
  ['Other', 12],
]
const BENGALURU_WEIGHTS: [string, number][] = [
  ['Base salary', 36],
  ['Career growth or promotion', 34],
  ['Equity, bonus or total rewards', 8],
  ['Workload or burnout', 6],
  ['Relocation, family or personal', 6],
  ['Recognition', 4],
  ['Other', 6],
]
const FIRST_YEAR_WEIGHTS: [string, number][] = [
  ['The work itself', 30],
  ['Career growth or promotion', 15],
  ['Workload or burnout', 20],
  ['Equity, bonus or total rewards', 15],
  ['Flexibility or location', 10],
  ['Other', 10],
]

interface YearPlan {
  start: Day
  end: Day
  /** Voluntary leavers outside Bengaluru. */
  vol: number
  volBengaluru: number
  performance: number
  conduct: number
  rif: number
  rifDay?: Day
}

/** Background exits per trailing year; planted stories and first-year exits come on top. */
const YEAR_PLANS: YearPlan[] = [
  {
    start: day('2023-10-01'),
    end: day('2024-09-30'),
    vol: 60,
    volBengaluru: 16,
    performance: 15,
    conduct: 4,
    rif: 12,
    rifDay: day('2024-01-19'),
  },
  {
    start: day('2024-10-01'),
    end: day('2025-09-30'),
    vol: 66,
    volBengaluru: 24,
    performance: 16,
    conduct: 5,
    rif: 3,
  },
  { start: T12_START, end: AS_OF, vol: 50, volBengaluru: 54, performance: 21, conduct: 6, rif: 2 },
]

/** Share of the 12-24-month hire cohort retained per business unit (sets the first-year exit counts). */
const BAND2_SHARE: Record<string, number> = {
  [SE]: 0.11,
  [SS]: 0.11,
  [OPS]: 0.11,
  [GTM]: 0.13,
  [CORP]: 0.1,
  [EO]: 0,
}
/** Year-over-year headcount growth per business unit. */
const BU_GROWTH: Record<string, number> = {
  [SE]: 0.14,
  [SS]: 0.06,
  [OPS]: 0.04,
  [GTM]: 0.05,
  [CORP]: 0,
  [EO]: 0,
}

/** Longest plausible tenure at a junior level, in years. */
const MAX_TENURE_YEARS: Record<string, number> = { L1: 2.4, L2: 5, L3: 9 }

const regrettableFor = (perf: number, rng: Rng): boolean =>
  rng.chance(perf > 0.5 ? 0.75 : perf > -0.5 ? 0.35 : 0.05)

interface LeaverInit {
  spec: DeptSpec
  site: string
  term: Day
  hire: Day
  type: TerminationType
  reason: string
  perf: number
  level?: Level
  mgr?: number | null
  regrettable?: boolean
  tag?: Tag
}

class LeaverFactory {
  /** Managers (M1/M2, current and former) per department, for picking who a leaver reported to. */
  private managers = new Map<string, Person[]>()
  /** Regretted 'My manager' exits per manager in the last 12 months, capped outside the planted cluster. */
  private myManagerT12 = new Map<number, number>()

  constructor(
    private w: World,
    private names: NameBook,
    private rng: Rng,
  ) {
    this.reindex()
  }

  reindex(): void {
    this.managers.clear()
    for (const p of this.w.people) {
      if (p.level !== 'M1' && p.level !== 'M2') continue
      const list = this.managers.get(p.dept)
      if (list) list.push(p)
      else this.managers.set(p.dept, [p])
    }
  }

  /** A manager in the department active a month before `on`, preferring the same site and M1s. */
  pickManager(dept: string, site: string, on: Day, avoidMyManager = false): number | null {
    const all = (this.managers.get(dept) ?? []).filter(
      (m) => m.hire >= 0 && activeOn(m, on - 30) && activeOn(m, on),
    )
    const usable = avoidMyManager ? all.filter((m) => (this.myManagerT12.get(m.idx) ?? 0) < 2) : all
    const tiers = [
      usable.filter((m) => m.level === 'M1' && m.site === site),
      usable.filter((m) => m.level === 'M1'),
      usable,
    ]
    for (const t of tiers) if (t.length) return this.rng.pick(t).idx
    const boss = this.w.execs.get(deptSpec(dept).boss)
    return boss ?? null
  }

  add(o: LeaverInit): Person {
    const { rng } = this
    const p = newPerson(this.w.people.length, {
      name: this.names.name(o.site),
      bu: o.spec.bu,
      dept: o.spec.name,
      site: o.site,
      level: 'L3',
      perf: o.perf,
      hire: Math.max(FOUNDED, o.hire),
      term: o.term,
      termType: o.type,
      termReason: o.reason,
    })
    const level = o.level ?? drawIcLevel(o.spec, o.site, rng)
    if (level.startsWith('L')) {
      assignIcRole(p, o.spec, level as IcLevel, rng)
      // Nobody stays at an entry level for a decade: cap tenure for junior leavers as for actives.
      const cap = MAX_TENURE_YEARS[p.level]
      if (cap && !o.tag) p.hire = Math.max(p.hire, nextMonday(o.term - Math.round(cap * YEAR)))
    } else {
      p.level = level
      p.title = level === 'M1' ? o.spec.manager : `Director, ${o.spec.name}`
      p.role = p.title
    }
    const voluntary = o.type === 'Voluntary'
    p.regrettable = voluntary ? (o.regrettable ?? regrettableFor(o.perf, rng)) : false
    const myManager = voluntary && o.reason === 'My manager' && p.regrettable && o.term >= T12_START
    p.mgr = o.mgr !== undefined ? o.mgr : this.pickManager(o.spec.name, o.site, o.term, myManager)
    if (myManager && p.mgr != null && !o.tag)
      this.myManagerT12.set(p.mgr, (this.myManagerT12.get(p.mgr) ?? 0) + 1)
    if (o.tag) p.tags.add(o.tag)
    this.w.people.push(p)
    return p
  }
}

const sizeWeights = (specs: DeptSpec[]): number[] => specs.map((s) => s.size)
const EXIT_DEPTS = DEPTS.filter((d) => d.bu !== EO)

/** Tenure at exit for experienced leavers: hire at least ~13 months before the exit. */
function experiencedHire(rng: Rng, term: Day, bu: string): Day {
  const years = Math.min(Math.max(1.1, rng.lognormal(3, 0.6)), (term - FOUNDED) / YEAR - 0.1)
  let hire = nextMonday(term - Math.round(years * YEAR))
  if (hire > term - 380) hire = nextMonday(term - 400)
  // Keep the 12-24-month cohort clean in Go-to-Market so first-year attrition stays measurable.
  if (bu === GTM && hire >= T24_START) hire = nextMonday(T24_START - rng.int(60, 400))
  return Math.max(FOUNDED, hire)
}

const exitDay = (rng: Rng, start: Day, end: Day): Day => onOrBeforeWeekday(rng.int(start, end))

interface FirstYearBatch {
  n: number
  depts: DeptSpec[]
  weights: number[]
  /** Draws the hire day (a Monday) for the next leaver. */
  hireDay: () => Day
  /** Latest possible exit day. */
  termMax: Day
  tag: Tag
}

/** People who left 75-330 days after starting: 70% resignations, the rest dismissed for performance. */
function addFirstYearLeavers(f: LeaverFactory, rng: Rng, b: FirstYearBatch): void {
  for (let i = 0; i < b.n; i++) {
    const spec = rng.weighted(b.depts, b.weights)
    const hire = b.hireDay()
    const term = Math.min(b.termMax, onOrBeforeWeekday(hire + rng.int(75, 330)))
    const voluntary = rng.chance(0.7)
    f.add({
      spec,
      site: rng.pickPair(spec.sites),
      term,
      hire,
      type: voluntary ? 'Voluntary' : 'Involuntary',
      reason: voluntary ? rng.pickPair(FIRST_YEAR_WEIGHTS) : 'Performance',
      perf: voluntary ? rng.normal(-0.2, 0.9) : rng.normal(-1.5, 0.4),
      level: rng.pick<IcLevel>(['L2', 'L3', 'L3', 'L4']),
      regrettable: voluntary ? rng.chance(0.1) : false,
      tag: b.tag,
    })
  }
}

export function addLeavers(w: World, names: NameBook, rng: Rng): void {
  const f = new LeaverFactory(w, names, rng)
  const exec = (k: string) => w.execs.get(k)!

  // A VP who left in April 2024; the current VP of Systems Engineering replaced them in June.
  const oldVp = newPerson(w.people.length, {
    name: names.name('San Jose'),
    bu: SS,
    dept: 'Systems Validation',
    site: 'San Jose',
    level: 'E1',
    title: 'Vice President, Systems Engineering',
    role: 'Vice President, Systems Engineering',
    family: 'Executive leadership',
    mgr: exec('svp-ss'),
    hire: day('2016-03-07'),
    term: day('2024-04-19'),
    termType: 'Voluntary',
    termReason: 'Confidence in company direction',
    regrettable: true,
    perf: 0.6,
  })
  oldVp.tags.add('leaver-manager')
  w.people.push(oldVp)
  for (const p of w.people) {
    if (p.term == null && p.level === 'M2' && p.mgr === exec('vp-sys') && p.hire < day('2024-04-01')) {
      p.forced.push(
        { day: day('2024-04-22'), from: oldVp.idx },
        { day: day('2024-06-03'), from: exec('svp-ss') },
      )
    }
  }

  // Managers who left; their former reports moved to today's managers.
  for (let i = 0; i < 11; i++) {
    const spec = rng.weighted(
      EXIT_DEPTS.filter((d) => d.directors > 0 && !d.explicit),
      sizeWeights(EXIT_DEPTS.filter((d) => d.directors > 0 && !d.explicit)),
    )
    const level: Level = i < 9 ? 'M1' : 'M2'
    const site = level === 'M1' ? rng.pickPair(spec.sites) : spec.sites[0][0]
    const term = exitDay(rng, day('2023-11-01'), AS_OF - 60)
    const voluntary = rng.chance(0.75)
    const perf = voluntary ? rng.normal(0.3, 0.8) : rng.normal(-1.2, 0.4)
    const boss =
      level === 'M1'
        ? (w.people.find(
            (d) => d.dept === spec.name && d.level === 'M2' && d.term == null && d.hire <= term - 60,
          )?.idx ?? w.execs.get(spec.boss)!)
        : w.execs.get(spec.boss)!
    const lm = f.add({
      spec,
      site,
      term,
      hire: nextMonday(experiencedHire(rng, term, spec.bu) - YEAR),
      type: voluntary ? 'Voluntary' : 'Involuntary',
      reason: voluntary ? rng.pickPair(VOLUNTARY_WEIGHTS.filter(([r]) => r !== 'My manager')) : 'Performance',
      perf,
      level,
      mgr: boss,
      tag: 'leaver-manager',
    })
    const formerLevel = level === 'M1' ? (l: Level) => l.startsWith('L') : (l: Level) => l === 'M1'
    const former = w.people.filter(
      (p) =>
        p.term == null &&
        p.type === 'Employee' &&
        p.dept === spec.name &&
        (level === 'M2' || p.site === site) &&
        formerLevel(p.level) &&
        p.tags.size === 0 &&
        (p.hire < 0 || p.hire <= term - 60) &&
        p.mgr != null &&
        w.people[p.mgr].hire >= 0 &&
        w.people[p.mgr].hire <= term + 10,
    )
    for (const p of rng.sample(former, level === 'M1' ? rng.int(3, 5) : 2)) {
      p.forced.push({ day: term + rng.int(1, 10), from: lm.idx })
    }
  }
  f.reindex()

  // HRBP story 1: one Physical Design manager in Austin lost five regretted people, all citing their manager.
  const pdManager = w.people.find((p) => p.tags.has('pd-austin-manager'))!
  const pdSpec = deptSpec('Physical Design')
  const pdExits: [string, Level, string][] = [
    ['2025-11-14', 'L3', '2021-08-09'],
    ['2026-01-23', 'L4', '2020-02-03'],
    ['2026-03-20', 'L4', '2022-05-16'],
    ['2026-05-29', 'L5', '2019-06-10'],
    ['2026-08-14', 'L3', '2023-01-09'],
  ]
  for (const [term, level, hire] of pdExits) {
    f.add({
      spec: pdSpec,
      site: 'Austin',
      term: day(term),
      hire: day(hire),
      type: 'Voluntary',
      reason: 'My manager',
      perf: rng.float(0.8, 1.5),
      level,
      mgr: pdManager.idx,
      regrettable: true,
      tag: 'pd-austin-leaver',
    })
  }

  // Talent story 3: three high-potential, highly rated people resigned in the last six months.
  const hipo: [string, string, Level, string, string, string][] = [
    ['Architecture', 'San Jose', 'L5', '2026-05-15', '2020-08-17', 'Career growth or promotion'],
    ['Digital Design', 'Haifa', 'L5', '2026-07-10', '2021-03-08', 'Equity, bonus or total rewards'],
    ['Software', 'Seattle', 'L4', '2026-09-04', '2022-01-10', 'Confidence in company direction'],
  ]
  for (const [dept, site, level, term, hire, reason] of hipo) {
    f.add({
      spec: deptSpec(dept),
      site,
      term: day(term),
      hire: day(hire),
      type: 'Voluntary',
      reason,
      perf: rng.float(1.6, 2),
      level,
      regrettable: true,
      tag: 'hipo-leaver',
    })
  }

  // Background exits per year.
  for (const plan of YEAR_PLANS) {
    for (let i = 0; i < plan.vol; i++) {
      const spec = rng.weighted(EXIT_DEPTS, sizeWeights(EXIT_DEPTS))
      const site = rng.pickPair(
        spec.sites.filter(([s]) => s !== 'Bengaluru').length
          ? spec.sites.filter(([s]) => s !== 'Bengaluru')
          : spec.sites,
      )
      const term = exitDay(rng, plan.start, plan.end)
      f.add({
        spec,
        site,
        term,
        hire: experiencedHire(rng, term, spec.bu),
        type: 'Voluntary',
        reason: rng.pickPair(VOLUNTARY_WEIGHTS),
        perf: rng.normal(0.15, 1),
      })
    }
    const blr = EXIT_DEPTS.filter((d) => d.sites.some(([s]) => s === 'Bengaluru'))
    const blrWeight = blr.map(
      (d) => d.size * (d.sites.find(([s]) => s === 'Bengaluru')![1] / d.sites.reduce((a, [, x]) => a + x, 0)),
    )
    for (let i = 0; i < plan.volBengaluru; i++) {
      const spec = rng.weighted(blr, blrWeight)
      const term = exitDay(rng, plan.start, plan.end)
      f.add({
        spec,
        site: 'Bengaluru',
        term,
        hire: experiencedHire(rng, term, spec.bu),
        type: 'Voluntary',
        reason: rng.pickPair(BENGALURU_WEIGHTS),
        perf: rng.normal(0.35, 0.9),
      })
    }
    const invol = (n: number, reason: string, perf: () => number, when: () => Day, pool: DeptSpec[]) => {
      for (let i = 0; i < n; i++) {
        const spec = rng.weighted(pool, sizeWeights(pool))
        const term = when()
        f.add({
          spec,
          site: rng.pickPair(spec.sites),
          term,
          hire: experiencedHire(rng, term, spec.bu),
          type: 'Involuntary',
          reason,
          perf: perf(),
        })
      }
    }
    const anyDay = () => exitDay(rng, plan.start, plan.end)
    invol(plan.performance, 'Performance', () => rng.normal(-1.6, 0.4), anyDay, EXIT_DEPTS)
    invol(plan.conduct, 'Conduct', () => rng.normal(-0.3, 0.8), anyDay, EXIT_DEPTS)
    const rifPool = EXIT_DEPTS.filter((d) => d.bu === CORP || d.bu === OPS || d.bu === GTM)
    invol(
      plan.rif,
      'Reduction in force',
      () => rng.normal(-0.3, 0.9),
      () => plan.rifDay ?? anyDay(),
      rifPool,
    )
  }

  // First-year exits from the 12-24-month hire cohort (Go-to-Market much higher) and a few recent hires.
  const activeByBu = new Map<string, number>()
  for (const p of w.people)
    if (p.term == null && p.type === 'Employee') activeByBu.set(p.bu, (activeByBu.get(p.bu) ?? 0) + 1)
  const cohort = (bu: string) => Math.round(BAND2_SHARE[bu] * (activeByBu.get(bu) ?? 0))
  const gtmDepts = DEPTS.filter((d) => d.bu === GTM)
  const otherDepts = EXIT_DEPTS.filter((d) => d.bu !== GTM)
  const otherCohort = [SE, SS, OPS, CORP].reduce((a, bu) => a + cohort(bu), 0)
  const firstYear = (
    n: number,
    depts: DeptSpec[],
    weights: number[],
    hireLo: Day,
    hireHi: Day,
    termMax: Day,
  ) =>
    addFirstYearLeavers(f, rng, {
      n,
      depts,
      weights,
      hireDay: () => mondayBetween(rng, hireLo, hireHi),
      termMax,
      tag: 'first-year-leaver',
    })
  const gtmWeights = [70, 20, 10]
  firstYear(Math.round((0.3 / 0.7) * cohort(GTM)), gtmDepts, gtmWeights, T24_START, T12_START - 7, AS_OF - 3)
  firstYear(
    Math.round((0.1 / 0.9) * otherCohort),
    otherDepts,
    sizeWeights(otherDepts),
    T24_START,
    T12_START - 7,
    AS_OF - 3,
  )
  firstYear(3, gtmDepts, gtmWeights, T12_START, AS_OF - 150, AS_OF - 3)
  firstYear(4, otherDepts, sizeWeights(otherDepts), T12_START, AS_OF - 150, AS_OF - 3)
}

/* ───────────── step 3: hire dates for everyone else ───────────── */

const RECENT_LEVEL_WEIGHT: Record<string, number> = { L1: 3, L2: 3, L3: 2.5, L4: 1.5, L5: 0.7, L6: 0.2 }

const recentDay = (rng: Rng): Day => {
  for (;;) {
    const d = rng.int(T12_START, AS_OF)
    if (rng.next() < 0.7 + (0.3 * (d - T12_START)) / (AS_OF - T12_START))
      return clampMonday(d, T12_START, AS_OF)
  }
}

/** Assign IC hire dates so each business unit grows at its target rate year over year. */
export function assignHires(w: World, rng: Rng): void {
  // People who reported to a departed manager must have been hired well before that manager left.
  const latestHire = (p: Person): Day =>
    p.forced.length ? Math.min(...p.forced.map((f) => f.day)) - 60 : AS_OF
  const pending = (p: Person) => p.hire < 0
  const flexible = (p: Person) => pending(p) && !p.forced.length
  const setRecent = (p: Person, d: Day = recentDay(rng)) => {
    p.hire = d
  }

  // Planted recent hires: backfills on the Austin Physical Design team and the new manager's team.
  const pdTeam = w.people.filter(
    (p) => p.term == null && p.mgr != null && w.people[p.mgr].tags.has('pd-austin-manager'),
  )
  const backfills = ['2026-02-23', '2026-05-04', '2026-08-31']
  pdTeam.slice(0, 3).forEach((p, i) => {
    setRecent(p, day(backfills[i]))
    p.tags.add('backfill')
  })
  const nm = w.people.find((p) => p.tags.has('new-manager'))!
  const nmTeam = w.people.filter((x) => x.mgr === nm.idx && flexible(x))
  for (const p of rng.sample(nmTeam, 4)) setRecent(p, mondayBetween(rng, nm.hire + 21, AS_OF))
  // Compensation story 3 needs a guaranteed group of recent Design Verification L3-L4 hires.
  const dvMid = w.people.filter(
    (p) => p.dept === 'Design Verification' && (p.level === 'L3' || p.level === 'L4') && flexible(p),
  )
  for (const p of rng.sample(dvMid, 6)) setRecent(p)

  for (const bu of [SE, SS, OPS, GTM, CORP, EO]) {
    const actives = w.people.filter((p) => p.bu === bu && p.term == null && p.type === 'Employee')
    const leftOld = w.people.filter(
      (p) =>
        p.bu === bu && p.type === 'Employee' && p.term != null && p.term >= T12_START && p.hire < T12_START,
    ).length
    const prior = Math.round(actives.length / (1 + BU_GROWTH[bu]))
    const needRecent = actives.length - (prior - leftOld)
    const already = actives.filter((p) => p.hire >= T12_START).length
    const pool = actives.filter((p) => flexible(p) && p.level.startsWith('L'))
    const weight = (p: Person) => (RECENT_LEVEL_WEIGHT[p.level] ?? 0.1) * (p.site === 'Bengaluru' ? 1.3 : 1)
    const pickN = (n: number, from: Person[]): Person[] => {
      const chosen: Person[] = []
      const left = from.slice()
      for (let i = 0; i < n && left.length; i++) {
        const p = rng.weighted(left, left.map(weight))
        chosen.push(p)
        left.splice(left.indexOf(p), 1)
      }
      return chosen
    }
    for (const p of pickN(Math.max(0, needRecent - already), pool)) setRecent(p)
    const band2 = Math.round(BAND2_SHARE[bu] * actives.length)
    const band2Pool = actives.filter((x) => flexible(x) && x.level.startsWith('L'))
    for (const p of pickN(band2, band2Pool)) p.hire = mondayBetween(rng, T24_START, T12_START - 1)
    for (const p of actives) {
      if (!pending(p)) continue
      const cap = MAX_TENURE_YEARS[p.level]
      const hi = Math.min(T24_START - 1, latestHire(p))
      const lo = cap ? Math.max(FOUNDED + 30, AS_OF - Math.round(cap * YEAR)) : FOUNDED + 30
      p.hire = curveDay(rng, Math.min(lo, hi - 60), hi)
    }
  }
}

/* ───────────── step 4: contractors and interns ───────────── */

const CONTRACTORS: [string, string, number][] = [
  ['Design Verification', 'Bengaluru', 15],
  ['Design Verification', 'Ho Chi Minh City', 6],
  ['Physical Design', 'Bengaluru', 8],
  ['Systems Validation', 'Hsinchu', 6],
  ['Systems Validation', 'Shanghai', 6],
  ['Test & Product Engineering', 'Shanghai', 6],
  ['Test & Product Engineering', 'Ho Chi Minh City', 5],
  ['Test & Product Engineering', 'San Jose', 4],
  ['IT', 'San Jose', 4],
  ['IT', 'Raleigh', 4],
  ['Software', 'Bengaluru', 6],
  ['Software', 'Toronto', 3],
  ['Facilities', 'San Jose', 4],
  ['Supply Chain', 'Shanghai', 3],
  ['Firmware', 'Raleigh', 3],
]
const INTERNS: [string, string, number][] = [
  ['Design Verification', 'San Jose', 3],
  ['Digital Design', 'Austin', 2],
  ['Software', 'Seattle', 3],
  ['Software', 'Toronto', 2],
  ['Firmware', 'Raleigh', 2],
  ['Analog & Mixed-Signal', 'Boulder', 2],
  ['Hardware Engineering', 'San Jose', 2],
  ['Test & Product Engineering', 'Hsinchu', 3],
  ['Design Verification', 'Bengaluru', 3],
  ['Physical Design', 'Bengaluru', 3],
]
const NO_CONTINGENT: Tag[] = ['span-wide', 'span-single', 'new-manager']

export function addContingent(w: World, names: NameBook, rng: Rng): void {
  const directs = new Map<number, number>()
  for (const p of w.people)
    if (p.term == null && p.mgr != null) directs.set(p.mgr, (directs.get(p.mgr) ?? 0) + 1)
  const hostFor = (dept: string, site: string, on: Day, cap: number): number => {
    const ok = (m: Person, siteMatch: boolean) =>
      m.dept === dept &&
      m.level === 'M1' &&
      activeOn(m, on) &&
      (!siteMatch || m.site === site) &&
      !NO_CONTINGENT.some((t) => m.tags.has(t)) &&
      (directs.get(m.idx) ?? 0) < cap
    const local = w.people.filter((m) => ok(m, true))
    const fallback = () =>
      w.people.filter(
        (m) =>
          m.dept === dept &&
          (m.level === 'M1' || m.level === 'M2') &&
          activeOn(m, on) &&
          !NO_CONTINGENT.some((t) => m.tags.has(t)),
      )
    const any = local.length ? local : w.people.filter((m) => ok(m, false))
    const pool = any.length ? any : fallback()
    if (!pool.length) return w.execs.get(deptSpec(dept).boss)!
    const m = rng.pick(pool)
    if (m.term == null) directs.set(m.idx, (directs.get(m.idx) ?? 0) + 1)
    return m.idx
  }
  const add = (dept: string, site: string, type: 'Contractor' | 'Intern', hire: Day, term: Day | null) => {
    const spec = deptSpec(dept)
    const p = newPerson(w.people.length, {
      name: names.name(site),
      bu: spec.bu,
      dept,
      site,
      level: 'L1',
      type,
      hire,
      term,
      perf: rng.normal(0, 0.8),
    })
    if (type === 'Intern') {
      p.title = `${dept} Intern`
      p.role = p.title
      p.family = dept
    } else {
      assignIcRole(p, spec, rng.pick<IcLevel>(['L2', 'L3', 'L3', 'L4']), rng)
      p.title = `${p.title} (Contract)`
    }
    if (term != null) {
      p.termType = 'Involuntary'
      p.termReason = 'End of contract'
      p.regrettable = false
    }
    p.mgr = hostFor(dept, site, term ?? AS_OF, term == null ? 8 : 99)
    w.people.push(p)
  }
  for (const [dept, site, n] of CONTRACTORS) {
    for (let i = 0; i < n; i++)
      add(dept, site, 'Contractor', mondayBetween(rng, AS_OF - 700, AS_OF - 20), null)
  }
  for (const [dept, site, n] of INTERNS) {
    for (let i = 0; i < n; i++)
      add(dept, site, 'Intern', rng.chance(0.5) ? day('2026-08-31') : day('2026-09-08'), null)
  }
  for (let i = 0; i < 12; i++) {
    const [dept, site] = rng.pick(CONTRACTORS)
    const term = onOrBeforeWeekday(rng.int(T24_START, AS_OF - 10))
    add(dept, site, 'Contractor', mondayBetween(rng, term - 540, term - 180), term)
  }
  const summer = (hire: string, ends: string[], n: number) => {
    for (let i = 0; i < n; i++) {
      const [dept, site] = rng.pick(INTERNS)
      add(dept, site, 'Intern', day(hire), day(rng.pick(ends)))
    }
  }
  summer('2025-06-02', ['2025-08-15', '2025-08-22'], 12)
  summer('2026-06-01', ['2026-08-14', '2026-08-21'], 16)
}

/* ───────────── step 5: first-year exits in earlier hire cohorts ───────────── */

/**
 * The two hire cohorts before the measured one (first-year attrition as of 30 Sep 2024 and
 * 30 Sep 2025) and the share of each that left within a year. The measured cohort (hired
 * 1 Oct 2024 to 30 Sep 2025) is planted in `addLeavers`, with Go-to-Market far above this rate.
 */
const PRIOR_FIRST_YEAR_COHORTS: readonly { from: Day; to: Day; rate: number }[] = [
  { from: day('2022-10-01'), to: day('2023-09-30'), rate: 0.105 },
  { from: day('2023-10-01'), to: day('2024-09-30'), rate: 0.11 },
]

/**
 * Background first-year exits in the earlier cohorts, spread over departments by size, so the
 * company's first-year attrition is about 11% in every prior year and the Go-to-Market jump is new.
 * Runs once every employee has a hire date, so each cohort's rate lands on its target (to the
 * nearest person). The exits all fall before the last 12 months; a few from the 2022-2023 cohort
 * predate the three years of background exits. These people are tagged so the services generator
 * gives them their own random stream (see `caseRows`).
 */
export function addPriorFirstYearLeavers(w: World, names: NameBook, rng: Rng): void {
  const f = new LeaverFactory(w, names, rng)
  for (const c of PRIOR_FIRST_YEAR_COHORTS) {
    const size = w.people.filter((p) => p.type === 'Employee' && p.hire >= c.from && p.hire <= c.to).length
    addFirstYearLeavers(f, rng, {
      n: Math.round((c.rate * size) / (1 - c.rate)),
      depts: EXIT_DEPTS,
      weights: sizeWeights(EXIT_DEPTS),
      hireDay: () => curveDay(rng, c.from, c.to),
      termMax: T12_START - 1,
      tag: 'prior-first-year-leaver',
    })
  }
}

/* ───────────── planted talent and pay populations ───────────── */

/** Talent story 6: long-serving high performers who have not been promoted in 3+ years. */
export function plantStagnant(w: World, rng: Rng): void {
  const cutoff = day('2022-06-30')
  const base = (p: Person) =>
    p.term == null &&
    p.type === 'Employee' &&
    p.hire >= 0 &&
    p.hire <= cutoff &&
    p.tags.size === 0 &&
    p.mgr != null
  const dv = w.people.filter(
    (p) => base(p) && p.dept === 'Design Verification' && (p.level === 'L4' || p.level === 'L5'),
  )
  const others = w.people.filter(
    (p) =>
      base(p) &&
      p.dept !== 'Design Verification' &&
      p.bu !== GTM &&
      p.dept !== 'Firmware' &&
      ['L3', 'L4', 'L5'].includes(p.level),
  )
  for (const p of [...rng.sample(dv, 15), ...rng.sample(others, 10)]) {
    p.tags.add('stagnant')
    p.perf = rng.float(1.3, 1.9)
  }
  // A few managers who stepped back to individual contributor roles.
  const demote = w.people.filter(
    (p) => base(p) && p.level === 'L5' && p.hire <= day('2020-12-31') && p.bu !== GTM,
  )
  for (const p of rng.sample(demote, 4)) p.tags.add('demoted')
}

/** Compensation story 2: long-tenured L4s paid above their range maximum (chosen after ratings exist). */
export function plantLongTenureL4(w: World, rng: Rng, isConsecutiveHigh: (p: Person) => boolean): void {
  const pool = w.people.filter(
    (p) =>
      p.term == null &&
      p.type === 'Employee' &&
      p.level === 'L4' &&
      p.hire <= day('2020-12-31') &&
      p.tags.size === 0 &&
      p.dept !== 'Design Verification' &&
      p.dept !== 'Analog & Mixed-Signal' &&
      p.site !== 'Bengaluru' &&
      !isConsecutiveHigh(p),
  )
  for (const p of rng.sample(pool, 42)) p.tags.add('long-l4')
}

/* ───────────── step 6: job history ───────────── */

/** Annual promotion rate out of each level, before the performance factor. */
const PROMO_RATE: Record<Level, number> = {
  L1: 0.5,
  L2: 0.36,
  L3: 0.22,
  L4: 0.14,
  L5: 0.09,
  L6: 0.04,
  M1: 0.08,
  M2: 0.06,
  E1: 0.04,
  E2: 0.03,
  E3: 0,
}
/** Calibrates the overall promotion rate to roughly 11% of headcount per year. */
const PROMO_SCALE = 0.46

function previousLevel(l: Level, rng: Rng): Level | null {
  switch (l) {
    case 'L1':
      return null
    case 'L2':
      return 'L1'
    case 'L3':
      return 'L2'
    case 'L4':
      return 'L3'
    case 'L5':
      return 'L4'
    case 'L6':
      return 'L5'
    case 'M1':
      return rng.chance(0.65) ? 'L5' : 'L4'
    case 'M2':
      return 'M1'
    case 'E1':
      return 'M2'
    case 'E2':
      return 'E1'
    case 'E3':
      return 'E2'
  }
}

/** Promotion windows: 1 March and 1 September each year, newest first. */
const WINDOWS: Day[] = (() => {
  const out: Day[] = []
  for (let y = 2026; y >= 2014; y--) out.push(ymd(y, 9, 1), ymd(y, 3, 1))
  return out.filter((d) => d <= AS_OF)
})()

interface Draft {
  day: Day
  type: ChangeType
  from?: Level
  to?: Level
  forcedFrom?: number
}

const NO_MOVES: Tag[] = [
  'stagnant',
  'long-l4',
  'pd-austin-manager',
  'pd-austin-leaver',
  'hipo-leaver',
  'new-manager',
  'span-wide',
  'span-single',
  'hm-awaiting',
  'backfill',
  'exec',
]

/**
 * Build each employee's history backwards from today's state so that every chain is consistent:
 * the latest promotion lands on the current level, and every manager in the timeline was employed
 * while the person reported to them.
 */
export function buildHistory(w: World, rng: Rng, isConsecutiveHigh: (p: Person) => boolean): void {
  const { people } = w
  const directs = new Map<number, number>()
  for (const p of people)
    if (p.term == null && p.mgr != null) directs.set(p.mgr, (directs.get(p.mgr) ?? 0) + 1)
  const leaders = new Map<string, Person[]>()
  for (const p of people) {
    if (p.level !== 'M1' && p.level !== 'M2') continue
    const list = leaders.get(p.dept)
    if (list) list.push(p)
    else leaders.set(p.dept, [p])
  }
  const sameBu = new Map<string, string[]>()
  for (const d of DEPTS) if (!d.explicit) sameBu.set(d.bu, [...(sameBu.get(d.bu) ?? []), d.name])

  /** A manager in `dept` employed from `since` through `at`, other than the excluded people. */
  const pickManager = (dept: string, since: Day, at: Day, exclude: (number | null)[]): number | null => {
    const ok = (leaders.get(dept) ?? []).filter(
      (m) => m.hire >= 0 && m.hire <= since && (m.term == null || m.term >= at) && !exclude.includes(m.idx),
    )
    return ok.length ? rng.pick(ok).idx : null
  }

  for (const p of people) {
    if (p.type !== 'Employee' || p.hire < 0) continue
    const end = p.term ?? AS_OF
    const drafts: Draft[] = []

    // Level path: walk promotion windows backwards from the current (or exit) level.
    const blockedAfter = p.tags.has('stagnant')
      ? AS_OF - Math.round(3.5 * YEAR)
      : p.tags.has('long-l4')
        ? day('2020-06-30')
        : p.tags.has('exec') || p.tags.has('new-manager') || p.tags.has('pd-austin-manager')
          ? FOUNDED
          : null
    const bigTeam = p.level === 'M1' && (directs.get(p.idx) ?? 0) >= 8
    const demoteDay = p.tags.has('demoted')
      ? rng.pick(WINDOWS.filter((d) => d >= day('2024-03-01') && d <= day('2026-03-01')))
      : null
    let forcedWindow: Day | null = null
    if (
      p.term == null &&
      !p.level.startsWith('E') &&
      p.hire <= AS_OF - 3 * YEAR &&
      isConsecutiveHigh(p) &&
      blockedAfter == null
    ) {
      const options = WINDOWS.filter(
        (d) => d > AS_OF - 3 * YEAR && d >= p.hire + 270 && (!bigTeam || d <= AS_OF - 548),
      )
      if (options.length) forcedWindow = rng.pick(options)
    }
    let level = p.level
    let last = Number.POSITIVE_INFINITY
    for (const win of WINDOWS) {
      if (win > end) continue
      if (win < p.hire + 270) break
      if (win === demoteDay) {
        drafts.push({ day: win, type: 'Demotion', from: 'M1', to: level })
        level = 'M1'
        last = win
        continue
      }
      if (blockedAfter != null && win > blockedAfter) continue
      if (last - win < YEAR) continue
      const prev = previousLevel(level, rng)
      if (!prev) break
      if (level === 'M1' && bigTeam && win > AS_OF - 548) continue
      const rate = (PROMO_RATE[prev] * PROMO_SCALE * Math.exp(0.9 * p.perf)) / 1.5 / 2
      if (win === forcedWindow || rng.chance(rate)) {
        drafts.push({ day: win, type: 'Promotion', from: prev, to: level })
        level = prev
        last = win
      }
    }
    p.hireLevel = level

    // Moves: transfers, lateral moves and manager changes in the last four years.
    const movable = !NO_MOVES.some((t) => p.tags.has(t))
    const start = Math.max(p.hire + YEAR, AS_OF - 4 * YEAR)
    const forcedDays = p.forced.map((x) => x.day)
    for (let t = start; t < end; t += YEAR) {
      const slot = () => Math.min(end - 1, t + rng.int(0, YEAR - 1))
      if (movable && p.level !== 'M2' && rng.chance(0.05)) drafts.push({ day: slot(), type: 'Transfer' })
      if (movable && p.level.startsWith('L') && rng.chance(0.03))
        drafts.push({ day: slot(), type: 'Lateral move' })
      if (movable && (p.level.startsWith('L') || p.level === 'M1') && rng.chance(0.1)) {
        const d = slot()
        if (!forcedDays.some((f) => Math.abs(f - d) < 120)) drafts.push({ day: d, type: 'Manager change' })
      }
    }
    for (const fz of p.forced)
      if (fz.day < end) drafts.push({ day: fz.day, type: 'Manager change', forcedFrom: fz.from })
    drafts.sort((a, b) => b.day - a.day)

    // Resolve the chain backwards from today's state.
    const state = { level: p.level, dept: p.dept, mgr: p.mgr }
    const rows: HistoryEvent[] = []
    let lastRowDay = end + 1
    const managerChange = (d: Day, from: number) => {
      lastRowDay = d
      rows.push({
        day: d,
        type: 'Manager change',
        fromLevel: state.level,
        toLevel: state.level,
        fromDept: state.dept,
        toDept: state.dept,
        fromMgr: from,
        toMgr: state.mgr,
      })
      state.mgr = from
    }
    /** Make sure the current manager was employed at `at`; otherwise insert the change that brought them in. */
    const settle = (at: Day, since: Day) => {
      for (let guard = 0; guard < 4 && state.mgr != null; guard++) {
        const m = people[state.mgr]
        if (m.hire <= at) return
        const change = Math.max(at + 1, Math.min(m.hire + rng.int(0, 14), lastRowDay - 1, end - 1))
        const from =
          (m.mgr != null && people[m.mgr].hire <= since && (people[m.mgr].term ?? AS_OF) >= change
            ? m.mgr
            : null) ?? pickManager(state.dept, since, change, [state.mgr, p.idx])
        if (from == null || from === p.idx) return
        managerChange(change, from)
      }
    }
    for (let i = 0; i < drafts.length; i++) {
      const e = drafts[i]
      const since = drafts[i + 1]?.day ?? p.hire
      settle(e.day, since)
      lastRowDay = e.day
      if (e.type === 'Promotion' || e.type === 'Demotion') {
        rows.push({
          day: e.day,
          type: e.type,
          fromLevel: e.from!,
          toLevel: e.to!,
          fromDept: state.dept,
          toDept: state.dept,
          fromMgr: null,
          toMgr: null,
        })
        state.level = e.from!
      } else if (e.type === 'Lateral move') {
        rows.push({
          day: e.day,
          type: e.type,
          fromLevel: state.level,
          toLevel: state.level,
          fromDept: state.dept,
          toDept: state.dept,
          fromMgr: null,
          toMgr: null,
        })
      } else if (e.type === 'Manager change') {
        const from = e.forcedFrom ?? pickManager(state.dept, since, e.day, [state.mgr, p.idx])
        if (from != null) managerChange(e.day, from)
      } else {
        const options = (sameBu.get(p.bu) ?? []).filter((d) => d !== state.dept)
        const fromDept =
          rng.chance(0.75) && options.length
            ? rng.pick(options)
            : rng.pick(DEPTS.filter((d) => !d.explicit && d.name !== state.dept)).name
        const from = pickManager(fromDept, since, e.day, [p.idx])
        if (from == null) continue
        rows.push({
          day: e.day,
          type: 'Transfer',
          fromLevel: state.level,
          toLevel: state.level,
          fromDept,
          toDept: state.dept,
          fromMgr: from,
          toMgr: state.mgr,
        })
        state.dept = fromDept
        state.mgr = from
      }
    }
    settle(p.hire, p.hire)
    p.hireDept = state.dept
    p.events = rows.reverse()
    p.mgrLine = [{ day: p.hire, mgr: state.mgr }]
    for (const r of p.events)
      if (r.type === 'Manager change' || r.type === 'Transfer') p.mgrLine.push({ day: r.day, mgr: r.toMgr })
  }
}

/** Manager of a person on a given day, from their timeline. */
export function managerOn(p: Person, d: Day): number | null {
  let m = p.mgrLine.length ? p.mgrLine[0].mgr : p.mgr
  for (const seg of p.mgrLine) {
    if (seg.day <= d) m = seg.mgr
    else break
  }
  return m
}

/** Employee IDs follow hire order, as an HRIS would issue them. */
export function assignIds(w: World): void {
  const order = w.people.slice().sort((a, b) => a.hire - b.hire || a.idx - b.idx)
  order.forEach((p, i) => {
    p.id = `E${10001 + i}`
  })
}

/* ───────────── emitters ───────────── */

export function employeeRows(w: World): Employee[] {
  const hrbpName = new Map([...w.hrbp].map(([bu, idx]) => [bu, w.people[idx].name]))
  return w.people
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((p) => ({
      employeeId: p.id,
      name: p.name,
      jobTitle: p.title,
      jobFamily: p.family,
      businessUnit: p.bu,
      department: p.dept,
      location: p.site,
      country: siteByLocation.get(p.site)!.country,
      level: p.level,
      managerId: p.mgr != null ? w.people[p.mgr].id : null,
      hireDate: iso(p.hire),
      terminationDate: isoOrNull(p.term),
      terminationType: p.termType,
      terminationReason: p.termReason,
      regrettable: p.term != null ? p.regrettable : null,
      employmentType: p.type,
      hrbp: hrbpName.get(p.bu) ?? null,
      costCenter: costCenter(p.dept, p.site),
    }))
}

export function jobChangeRows(w: World): JobChange[] {
  const rows: JobChange[] = []
  const id = (i: number | null) => (i == null ? null : w.people[i].id)
  for (const p of w.people) {
    for (const e of p.events) {
      rows.push({
        employeeId: p.id,
        effectiveDate: iso(e.day),
        changeType: e.type,
        fromLevel: e.fromLevel,
        toLevel: e.toLevel,
        fromDepartment: e.fromDept,
        toDepartment: e.toDept,
        fromManagerId: id(e.fromMgr),
        toManagerId: id(e.toMgr),
      })
    }
  }
  return rows.sort((a, b) =>
    a.effectiveDate < b.effectiveDate
      ? -1
      : a.effectiveDate > b.effectiveDate
        ? 1
        : a.employeeId < b.employeeId
          ? -1
          : 1,
  )
}

/** Title held at hire, for requisitions created from hires. */
export const hireTitle = (p: Person): string => titleAt(p, p.hireDept, p.hireLevel)
