/**
 * Talent data: performance ratings and potential for four review cycles, succession plans for
 * critical and key roles, and learning assignments (the 2026 compliance campaign, onboarding and
 * optional development).
 */
import type { LearningRecord, Potential, Readiness, Review, SuccessionPlan } from '../schema'
import { AS_OF, type Day, day, iso, isoOrNull, T24_START } from './calendar'
import { GTM, OPS, SE } from './departments'
import { managerOn } from './employees'
import { activeOn, type Person, type World } from './model'
import type { Rng } from './prng'

interface Cycle {
  name: string
  day: Day
  annual: boolean
}
const CYCLES: Cycle[] = [
  { name: '2024 Annual', day: day('2024-12-15'), annual: true },
  { name: '2025 Mid-year', day: day('2025-06-30'), annual: false },
  { name: '2025 Annual', day: day('2025-12-15'), annual: true },
  { name: '2026 Mid-year', day: day('2026-06-30'), annual: false },
]

/** Standard-normal cut points that reproduce the 3/10/52/25/10 rating guideline. */
const CUTS = [-1.85, -1.08, 0.45, 1.36]
/** Go-to-Market managers rate generously: this shift puts about 45% of the BU at 4-5. */
const GTM_SHIFT = 0.27
/** Potential is High or Low for the top and bottom fifth of the latent score. */
const POTENTIAL_CUT = 0.877

const ratingFrom = (s: number): number =>
  s < CUTS[0] ? 1 : s < CUTS[1] ? 2 : s < CUTS[2] ? 3 : s < CUTS[3] ? 4 : 5

export const ratingIn = (p: Person, cycle: string): number | null => p.ratings.get(cycle)?.rating ?? null

/** Rated 4 or 5 in both of the last two annual cycles. */
export const isConsecutiveHigh = (p: Person): boolean =>
  (ratingIn(p, '2024 Annual') ?? 0) >= 4 && (ratingIn(p, '2025 Annual') ?? 0) >= 4

/** Ratings for every employee active and at least 90 days in role at each cycle date. */
export function rateCycles(w: World, rng: Rng): void {
  const sixMonthsAgo = day('2026-03-01')
  for (const p of w.people) {
    if (p.type !== 'Employee' || p.hire < 0) continue
    const potentialLatent = 0.6 * p.perf + 0.8 * rng.normal()
    const planted = p.tags.has('stagnant') || p.tags.has('hipo-leaver')
    for (const c of CYCLES) {
      if (p.hire > c.day - 90 || (p.term != null && p.term <= c.day)) continue
      let rating = ratingFrom(0.8 * p.perf + 0.6 * rng.normal() + (p.bu === GTM ? GTM_SHIFT : 0))
      if (planted) rating = Math.max(4, rating)
      // Managers propose high; calibration pulls Silicon Engineering down the most.
      const upward = p.bu === SE ? 0.52 : 0.16
      const r = rng.next()
      const pre = rating < 5 && r < upward ? rating + 1 : rating > 1 && r > 0.97 ? rating - 1 : rating
      let potential: Potential | null = null
      if (c.annual) {
        const v = potentialLatent + 0.3 * rng.normal()
        potential = v > POTENTIAL_CUT ? 'High' : v < -POTENTIAL_CUT ? 'Low' : 'Moderate'
        if (p.tags.has('hipo-leaver')) potential = 'High'
        // Only the planted three high-potential exits fall in the last six months.
        if (
          potential === 'High' &&
          !p.tags.has('hipo-leaver') &&
          p.term != null &&
          p.term >= sixMonthsAgo &&
          p.termType === 'Voluntary' &&
          p.regrettable
        ) {
          potential = 'Moderate'
        }
      }
      p.ratings.set(c.name, { rating, pre, potential })
    }
  }
}

export function reviewRows(w: World): Review[] {
  const rows: Review[] = []
  for (const p of w.people) {
    for (const c of CYCLES) {
      const r = p.ratings.get(c.name)
      if (!r) continue
      const m = managerOn(p, c.day)
      const reviewer = m != null && activeOn(w.people[m], c.day) ? w.people[m].id : null
      rows.push({
        employeeId: p.id,
        cycle: c.name,
        cycleDate: iso(c.day),
        rating: r.rating,
        preCalibrationRating: r.pre,
        potential: r.potential,
        reviewerId: reviewer,
      })
    }
  }
  return rows.sort((a, b) =>
    a.cycleDate < b.cycleDate ? -1 : a.cycleDate > b.cycleDate ? 1 : a.employeeId < b.employeeId ? -1 : 1,
  )
}

/* ───────────── succession ───────────── */

type Risk = 'High' | 'Medium' | 'Low'

interface RolePlan {
  incumbent: Person
  criticality: 'Critical' | 'Key'
  /** 'none' = no successors at all; 'notReady' = successors but none ready now; 'ready' = at least one ready now. */
  bench: 'none' | 'notReady' | 'ready' | 'any'
  risk?: Risk
}

const CRITICAL_VPS = ['vp-arch', 'vp-verif', 'vp-pd', 'vp-sw', 'vp-sys', 'vp-test']
const CRITICAL_DIRECTOR_DEPTS = [
  'Design Verification',
  'Physical Design',
  'Analog & Mixed-Signal',
  'Architecture',
  'Software',
  'Test & Product Engineering',
]
const PRINCIPAL_DEPTS = [
  'Architecture',
  'Architecture',
  'Analog & Mixed-Signal',
  'Analog & Mixed-Signal',
  'Design Verification',
  'Physical Design',
  'Software',
]

export function successionRows(w: World, rng: Rng): SuccessionPlan[] {
  const active = w.people.filter((p) => p.term == null && p.type === 'Employee')
  const exec = (k: string) => w.people[w.execs.get(k)!]
  const plans: RolePlan[] = []
  const used = new Set<number>()
  const plan = (
    incumbent: Person,
    criticality: RolePlan['criticality'],
    bench: RolePlan['bench'] = 'any',
    risk?: Risk,
  ) => {
    used.add(incumbent.idx)
    plans.push({ incumbent, criticality, bench, risk })
  }

  // Planted: four high-risk incumbents with nobody named, three of them critical.
  const amsDirector = active.find((p) => p.dept === 'Analog & Mixed-Signal' && p.level === 'M2')!
  const amsPrincipal =
    active.find((p) => p.dept === 'Analog & Mixed-Signal' && p.level === 'L6' && p.tags.size === 0) ??
    active.find((p) => p.dept === 'Analog & Mixed-Signal' && p.level === 'L5')!
  const scDirector = active.find((p) => p.dept === 'Supply Chain' && p.level === 'M2')!
  plan(exec('vp-pd'), 'Critical', 'none', 'High')
  plan(amsDirector, 'Critical', 'none', 'High')
  plan(amsPrincipal, 'Critical', 'none', 'High')
  plan(scDirector, 'Key', 'none', 'High')

  for (const k of ['ceo', 'coo', 'cro', 'cfo', 'svp-se', 'svp-ss', 'cpo', 'gc']) plan(exec(k), 'Critical')
  for (const k of CRITICAL_VPS) if (!used.has(w.execs.get(k)!)) plan(exec(k), 'Critical')
  for (const [k] of w.execs) if (!used.has(w.execs.get(k)!)) plan(exec(k), 'Key')
  for (const dept of CRITICAL_DIRECTOR_DEPTS) {
    const d = active.find((p) => p.dept === dept && p.level === 'M2' && !used.has(p.idx))
    if (d) plan(d, 'Critical')
  }
  const seenPrincipal = new Map<string, number>()
  for (const dept of PRINCIPAL_DEPTS) {
    const nth = seenPrincipal.get(dept) ?? 0
    seenPrincipal.set(dept, nth + 1)
    const l6 = active.filter((p) => p.dept === dept && p.level === 'L6' && !used.has(p.idx))[0]
    if (l6) plan(l6, nth === 0 || dept === 'Architecture' ? 'Critical' : 'Key')
  }
  const directors = rng.shuffle(
    active.filter((p) => p.level === 'M2' && !used.has(p.idx) && p.dept !== 'Executive Office'),
  )
  for (const d of directors) {
    if (plans.length >= 55) break
    plan(d, 'Key')
  }

  // About 30% of critical roles lack a ready-now successor: the three planted plus five thin benches.
  const critical = plans.filter((r) => r.criticality === 'Critical' && r.bench === 'any')
  for (const r of rng.sample(critical, 5)) r.bench = 'notReady'
  for (const r of critical) if (r.bench === 'any') r.bench = 'ready'
  const keyAny = plans.filter((r) => r.criticality === 'Key' && r.bench === 'any')
  for (const r of rng.sample(keyAny, 2)) r.bench = 'none'

  const successorUse = new Map<number, number>()
  const poolFor = (inc: Person): Person[] => {
    const canSucceed = (p: Person) =>
      p.idx !== inc.idx && (successorUse.get(p.idx) ?? 0) < 2 && p.hire <= AS_OF - 365
    if (inc.level === 'E3' || inc.level === 'E2') {
      return active.filter(
        (p) =>
          canSucceed(p) && (p.level === 'E1' || p.level === 'E2') && (p.bu === inc.bu || rng.chance(0.3)),
      )
    }
    if (inc.level === 'E1') return active.filter((p) => canSucceed(p) && p.level === 'M2' && p.bu === inc.bu)
    if (inc.level === 'M2')
      return active.filter(
        (p) => canSucceed(p) && (p.level === 'M1' || p.level === 'L6') && p.dept === inc.dept,
      )
    return active.filter((p) => canSucceed(p) && p.level === 'L5' && p.dept === inc.dept)
  }
  const bench = new Map<RolePlan, Person[]>()
  for (const r of plans) {
    const pool = r.bench === 'none' ? [] : poolFor(r.incumbent)
    const n = pool.length ? Math.min(pool.length, rng.weighted([1, 2, 3], [40, 38, 22])) : 0
    const chosen = rng.sample(pool, n)
    for (const s of chosen) successorUse.set(s.idx, (successorUse.get(s.idx) ?? 0) + 1)
    bench.set(r, chosen)
  }

  // Risk of loss: the planted four are High; a handful of others are High but do have a bench.
  const withBench = plans.filter((x) => !x.risk && bench.get(x)!.length > 0)
  for (const r of rng.sample(withBench, 6)) r.risk = 'High'
  for (const r of plans) r.risk ??= !bench.get(r)!.length ? 'Low' : rng.chance(0.38) ? 'Medium' : 'Low'

  const readinessFor = (s: Person): Readiness => {
    const r = rng.next() - 0.15 * s.perf
    return r < 0.3 ? 'Ready now' : r < 0.75 ? 'Ready in 1-2 years' : 'Ready in 3+ years'
  }
  const rows: SuccessionPlan[] = []
  plans.forEach((r, i) => {
    const base = {
      roleId: `SP-${String(i + 1).padStart(3, '0')}`,
      roleTitle: r.incumbent.title,
      incumbentId: r.incumbent.id,
      criticality: r.criticality,
      incumbentRiskOfLoss: r.risk!,
      updatedDate: iso(day('2026-03-02') + rng.int(0, 190)),
    }
    const chosen = bench.get(r)!
    if (!chosen.length) {
      rows.push({ ...base, successorId: null, readiness: null })
      return
    }
    chosen.forEach((s, k) => {
      let readiness = readinessFor(s)
      if (r.bench === 'notReady' && readiness === 'Ready now') readiness = 'Ready in 1-2 years'
      if (r.bench === 'ready' && k === 0) readiness = 'Ready now'
      rows.push({ ...base, successorId: s.id, readiness })
    })
  })
  return rows
}

/* ───────────── learning ───────────── */

const CAMPAIGN_ASSIGNED = day('2026-07-13')
const CAMPAIGN_DUE = day('2026-08-26')
const CAMPAIGN: [string, string, number, boolean][] = [
  ['Code of conduct', 'Compliance', 1, true],
  ['Insider trading', 'Compliance', 0.5, false],
  ['Anti-harassment', 'Compliance', 1, false],
  ['Export control & trade compliance', 'Compliance', 1, false],
  ['Information security', 'Security', 1, true],
]
const LEADERSHIP = [
  'Leading high-performing teams',
  'Coaching for managers',
  'Hiring and interviewing well',
  'Giving useful feedback',
  'Managing through change',
]
const TECHNICAL: Record<string, string[]> = {
  'Design Verification': [
    'UVM advanced techniques',
    'SystemVerilog assertions',
    'Formal verification essentials',
    'Coverage closure strategies',
  ],
  'Digital Design': [
    'Low-power design with UPF',
    'RISC-V microarchitecture',
    'High-level synthesis',
    'Chiplet interconnect fundamentals',
  ],
  Architecture: [
    'RISC-V microarchitecture',
    'Chiplet interconnect fundamentals',
    'Performance modeling with SystemC',
  ],
  'Physical Design': [
    'Static timing analysis deep dive',
    'Advanced node physical design',
    'IR drop and EM signoff',
  ],
  'Analog & Mixed-Signal': [
    'Analog layout fundamentals',
    'High-speed SerDes design',
    'PLL design',
    'Mixed-signal verification',
  ],
  DFT: ['DFT and ATPG fundamentals', 'Memory BIST', 'Silicon debug with scan'],
  Firmware: ['Embedded Rust for firmware', 'Secure boot fundamentals', 'Linux driver development'],
  Software: ['Linux driver development', 'Compiler optimization', 'Embedded Rust for firmware'],
  'Systems Validation': [
    'Post-silicon debug methods',
    'Python for test automation',
    'Signal integrity for high-speed interfaces',
  ],
  'Hardware Engineering': [
    'Signal integrity for high-speed interfaces',
    'Advanced packaging and chiplets',
    'Post-silicon debug methods',
  ],
  'Test & Product Engineering': [
    'Yield analysis with statistics',
    'Python for test automation',
    'Reliability physics',
  ],
  'Quality & Reliability': ['Reliability physics', 'Yield analysis with statistics'],
  'Supply Chain': ['Semiconductor supply chain essentials', 'Negotiation essentials'],
  Sales: ['Solution selling', 'Negotiation essentials', 'Customer demo skills'],
  'Field Applications': ['Customer demo skills', 'Solution selling', 'Post-silicon debug methods'],
  'Product Marketing': ['Product roadmap storytelling', 'Customer demo skills'],
}
const GENERAL = [
  'Excel for analysts',
  'Project management essentials',
  'Data privacy essentials',
  'Financial modeling',
]

/** Share of each population with the 2026 export control course still open after its due date. */
function exportOverdueRate(p: Person): number {
  const ops = p.bu === OPS
  const hsinchu = p.site === 'Hsinchu'
  return ops && hsinchu ? 0.42 : ops ? 0.24 : hsinchu ? 0.18 : 0.035
}

export function learningRows(w: World, rng: Rng): LearningRecord[] {
  const rows: LearningRecord[] = []
  const push = (
    p: Person,
    course: string,
    category: string,
    required: boolean,
    assigned: Day,
    due: Day,
    hours: number,
    outcome: 'onTime' | 'late' | 'open',
  ) => {
    const end = Math.min(AS_OF, p.term ?? AS_OF)
    let completed: Day | null = null
    if (outcome === 'onTime')
      completed = Math.min(due, assigned + Math.max(1, Math.round(rng.lognormal(10, 0.6))))
    else if (outcome === 'late') completed = due + rng.int(2, 25)
    // Not finished yet, or the person left before finishing.
    if (completed != null && completed > end) completed = null
    rows.push({
      employeeId: p.id,
      course,
      category,
      required,
      assignedDate: iso(assigned),
      dueDate: iso(due),
      completedDate: isoOrNull(completed),
      hours,
    })
  }
  const outcome = (overdue: number, late = 0.04): 'onTime' | 'late' | 'open' => {
    const r = rng.next()
    return r < overdue ? 'open' : r < overdue + late ? 'late' : 'onTime'
  }

  for (const p of w.people) {
    if (p.hire < 0) continue
    const employee = p.type === 'Employee'
    // 2026 annual compliance campaign.
    if (activeOn(p, CAMPAIGN_ASSIGNED)) {
      for (const [course, category, hours, everyone] of CAMPAIGN) {
        if (!everyone && !employee) continue
        const overdue = course.startsWith('Export control') ? exportOverdueRate(p) : 0.03
        const h =
          course === 'Anti-harassment' && (p.level === 'M1' || p.level === 'M2' || p.level.startsWith('E'))
            ? 2
            : hours
        push(p, course, category, true, CAMPAIGN_ASSIGNED, CAMPAIGN_DUE, h, outcome(overdue))
      }
    }
    // Onboarding for hires in the last 24 months.
    if (p.type !== 'Contractor' && p.hire >= T24_START) {
      push(p, 'New hire orientation', 'Onboarding', true, p.hire, p.hire + 30, 4, outcome(0.02))
      push(
        p,
        'Semiconductor product fundamentals',
        'Onboarding',
        true,
        p.hire,
        p.hire + 45,
        3,
        outcome(0.04, 0.08),
      )
      // California requires harassment prevention training within six months of hire.
      if (employee && p.site === 'San Jose' && p.hire > CAMPAIGN_ASSIGNED) {
        push(p, 'Anti-harassment', 'Compliance', true, p.hire, p.hire + 182, 1, outcome(0.02))
      }
    }
    if (!employee) continue
    // Optional development in the last 24 months.
    const since = Math.max(T24_START, p.hire + 30)
    const until = Math.min(AS_OF - 3, p.term ?? AS_OF)
    if (until <= since) continue
    const optional = (course: string, category: string, hours: number) => {
      const assigned = rng.int(since, until)
      const due = assigned + rng.int(30, 45)
      push(p, course, category, false, assigned, due, hours, outcome(0.1, 0.12))
    }
    if (
      p.level === 'M1' ||
      p.level === 'M2' ||
      ((p.level === 'L5' || p.level === 'L6') && rng.chance(0.25))
    ) {
      for (const c of rng.sample(LEADERSHIP, rng.int(1, 3))) optional(c, 'Leadership', rng.pick([4, 6, 8]))
    }
    const tech = TECHNICAL[p.dept]
    if (rng.chance(tech ? 0.62 : 0.4)) {
      for (const c of rng.sample(tech ?? GENERAL, rng.int(1, tech ? 3 : 2)))
        optional(c, 'Technical', rng.pick([6, 8, 12, 16, 24]))
    }
  }
  return rows.sort((a, b) =>
    a.assignedDate < b.assignedDate
      ? -1
      : a.assignedDate > b.assignedDate
        ? 1
        : a.employeeId < b.employeeId
          ? -1
          : 1,
  )
}
