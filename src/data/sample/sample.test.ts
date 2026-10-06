import { describe, expect, it } from 'vitest'
import {
  AUTHORIZATION_TYPES,
  CANDIDATE_STATUSES,
  CASE_CATEGORIES,
  CASE_CHANNELS,
  CASE_PRIORITIES,
  CASE_STATUSES,
  CASE_TIERS,
  CHANGE_TYPES,
  type Datasets,
  EMPLOYMENT_TYPES,
  type Employee,
  INVOLUNTARY_REASONS,
  LEARNING_CATEGORIES,
  LEAVE_REASONS,
  LEVELS,
  ONBOARDING_STATUSES,
  ONBOARDING_TASKS,
  POTENTIALS,
  READINESS,
  REQ_PRIORITIES,
  REQ_STATUSES,
  REQ_TYPES,
  SITES,
  SOURCES,
  STAGES,
  SURVEY_SCALES,
  SURVEY_TYPES,
  siteByLocation,
  TERMINATION_TYPES,
  TRANSACTION_PROCESS,
  TRANSACTION_TYPES,
  VOLUNTARY_REASONS,
} from '../schema'
import { generateSample, SAMPLE_AS_OF, SAMPLE_COMPANY } from './index'

/* ───────────── helpers (independent of the generator) ───────────── */

const AS_OF = SAMPLE_AS_OF
const T12_START = '2025-10-01'
const PRIOR_END = '2025-09-30'
const DAY = 86_400_000
const t = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`)
const days = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY)
const hours = (a: string, b: string) => (Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 3_600_000
const median = (xs: number[]): number => {
  const v = xs.slice().sort((a, b) => a - b)
  const m = (v.length - 1) / 2
  return (v[Math.floor(m)] + v[Math.ceil(m)]) / 2
}
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const share = <T>(xs: T[], pred: (x: T) => boolean): number => xs.filter(pred).length / xs.length
const activeOn = (e: Employee, d: string) => e.hireDate <= d && (!e.terminationDate || e.terminationDate > d)
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const plusDays = (d: string, n: number) => isoOf(t(d) + n * DAY)
const isWeekendDay = (d: string) => [0, 6].includes(new Date(t(d)).getUTCDay())
const weekdayOnOrBefore = (d: string): string => (isWeekendDay(d) ? weekdayOnOrBefore(plusDays(d, -1)) : d)
const workingDaysAfter = (d: string, n: number): string => {
  let x = d
  for (let left = n; left > 0; ) {
    x = plusDays(x, 1)
    if (!isWeekendDay(x)) left--
  }
  return x
}
const monthEndOf = (d: string) => isoOf(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0))
/** US and Canadian paydays: the 15th and the last day of each month, the weekday before when on a weekend. */
function nextPayday(d: string): string {
  for (let m = `${d.slice(0, 7)}-01`; ; m = plusDays(monthEndOf(m), 1)) {
    for (const p of [`${m.slice(0, 7)}-15`, monthEndOf(m)].map(weekdayOnOrBefore)) if (p > d) return p
  }
}
/** Final pay deadline by jurisdiction, as the Atlas states it (FINAL_PAY_RULES in the services catalog). */
function finalPayDue(e: Employee): string {
  const d = e.terminationDate!
  const involuntary = e.terminationType === 'Involuntary'
  const jurisdiction = siteByLocation.get(e.location)!.jurisdiction
  switch (jurisdiction) {
    case 'us-ca':
    case 'tw':
    case 'cn':
      return d
    case 'us-tx':
      return involuntary ? plusDays(d, 6) : nextPayday(d)
    case 'us-co':
      return involuntary ? d : nextPayday(d)
    case 'us-nc':
      return nextPayday(d)
    case 'us-wa':
      return d.slice(8) <= '15' ? `${d.slice(0, 7)}-15` : monthEndOf(d)
    case 'ca': {
      if (e.location === 'Vancouver') return plusDays(d, involuntary ? 2 : 6)
      const week = plusDays(d, 7)
      return week > nextPayday(d) ? week : nextPayday(d)
    }
    case 'de':
      return weekdayOnOrBefore(monthEndOf(d))
    case 'il':
      return `${plusDays(monthEndOf(d), 1).slice(0, 7)}-09`
    case 'in':
      return workingDaysAfter(d, 2)
    case 'vn':
      return workingDaysAfter(d, 14)
    default:
      throw new Error(`No final pay rule for ${jurisdiction}`)
  }
}
/** Mean of 13 month-end snapshots ending at `end` (the Census convention). */
function avgHeadcount(emps: Employee[], end: string): number {
  const e = new Date(t(end))
  const points: string[] = []
  for (let i = 12; i >= 0; i--)
    points.push(new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - i + 1, 0)).toISOString().slice(0, 10))
  return mean(points.map((d) => emps.filter((x) => activeOn(x, d)).length))
}

const data: Datasets = generateSample()
const byId = new Map(data.employees.map((e) => [e.employeeId, e]))
const emp = (id: string) => byId.get(id)!
const employees = data.employees.filter((e) => e.employmentType === 'Employee')
/** Employees on the payroll today (pre-hires, with a future hire date, are not). */
const activeEmployees = employees.filter((e) => activeOn(e, AS_OF))
const ratingOf = new Map(data.reviews.map((r) => [`${r.employeeId}|${r.cycle}`, r.rating]))
const reqById = new Map(data.requisitions.map((r) => [r.reqId, r]))

/* ───────────── determinism and speed ───────────── */

describe('generator', () => {
  it('identifies the company and its as-of date', () => {
    expect(SAMPLE_AS_OF).toBe('2026-09-30')
    expect(SAMPLE_COMPANY).toBe('Northgate Semiconductor')
  })

  it('is deterministic: two runs are deep-equal', () => {
    expect(JSON.stringify(generateSample()) === JSON.stringify(data)).toBe(true)
  })
})

/* ───────────── sizes ───────────── */

describe('sizes', () => {
  const between = (n: number, lo: number, hi: number) => {
    expect(n).toBeGreaterThanOrEqual(lo)
    expect(n).toBeLessThanOrEqual(hi)
  }
  it('has a company of the planned size', () => {
    between(activeEmployees.length, 1400, 1500)
    between(
      data.employees.filter((e) => e.employmentType !== 'Employee' && !e.terminationDate).length,
      90,
      130,
    )
    // Three years of background exits, planted stories and first-year exits in three hire cohorts.
    between(data.employees.filter((e) => e.terminationDate).length, 450, 540)
    between(data.employees.length, 1900, 2100)
  })
  it('has the planned volumes in every dataset', () => {
    between(data.requisitions.length, 480, 620)
    between(data.requisitions.filter((r) => r.status === 'Open').length, 100, 120)
    between(data.requisitions.filter((r) => r.status === 'On hold').length, 12, 18)
    between(data.candidates.length, 8000, 10000)
    between(data.cases.length, 6000, 7000)
    between(data.transactions.length, 3200, 3800)
    between(data.reviews.length, 4800, 5600)
    between(new Set(data.succession.map((s) => s.roleId)).size, 50, 60)
    between(data.learning.length, 9000, 12000)
    expect(data.comp.length).toBe(activeEmployees.length)
  })
  it('spans every site with San Jose largest and Bengaluru second', () => {
    const bySite = new Map<string, number>()
    for (const e of activeEmployees) bySite.set(e.location, (bySite.get(e.location) ?? 0) + 1)
    expect(bySite.size).toBe(SITES.length)
    const ranked = [...bySite].sort((a, b) => b[1] - a[1]).map(([s]) => s)
    expect(ranked.slice(0, 2)).toEqual(['San Jose', 'Bengaluru'])
  })
})

/* ───────────── integrity ───────────── */

describe('referential integrity', () => {
  const ids = new Set(data.employees.map((e) => e.employeeId))
  it('uses unique identifiers and names', () => {
    expect(ids.size).toBe(data.employees.length)
    expect(new Set(data.employees.map((e) => e.name)).size).toBe(data.employees.length)
    expect(new Set(data.requisitions.map((r) => r.reqId)).size).toBe(data.requisitions.length)
    expect(new Set(data.candidates.map((c) => c.applicationId)).size).toBe(data.candidates.length)
    expect(new Set(data.cases.map((c) => c.caseId)).size).toBe(data.cases.length)
    expect(new Set(data.transactions.map((x) => x.transactionId)).size).toBe(data.transactions.length)
    expect(data.employees.every((e) => /^E\d{5}$/.test(e.employeeId))).toBe(true)
  })
  it('resolves every manager, and only the CEO has none', () => {
    const roots = data.employees.filter((e) => !e.managerId)
    expect(roots.map((e) => e.jobTitle)).toEqual(['Chief Executive Officer'])
    expect(data.employees.every((e) => !e.managerId || ids.has(e.managerId))).toBe(true)
    // Active people report to active managers.
    expect(
      data.employees
        .filter((e) => !e.terminationDate && e.managerId)
        .every((e) => !emp(e.managerId!).terminationDate),
    ).toBe(true)
  })
  it('resolves every employee reference in every dataset', () => {
    const ok = (id: string | null | undefined) => id == null || ids.has(id)
    expect(
      data.jobChanges.every((j) => ids.has(j.employeeId) && ok(j.fromManagerId) && ok(j.toManagerId)),
    ).toBe(true)
    expect(data.requisitions.every((r) => ok(r.hiringManagerId))).toBe(true)
    expect(data.candidates.every((c) => reqById.has(c.reqId))).toBe(true)
    expect(data.cases.every((c) => c.requesterId && ids.has(c.requesterId))).toBe(true)
    expect(data.transactions.every((x) => ids.has(x.employeeId))).toBe(true)
    expect(data.reviews.every((r) => ids.has(r.employeeId) && ok(r.reviewerId))).toBe(true)
    expect(data.succession.every((s) => ids.has(s.incumbentId) && ok(s.successorId))).toBe(true)
    expect(data.learning.every((l) => ids.has(l.employeeId))).toBe(true)
    expect(
      data.comp.every(
        (c) =>
          ids.has(c.employeeId) &&
          emp(c.employeeId).employmentType === 'Employee' &&
          !emp(c.employeeId).terminationDate,
      ),
    ).toBe(true)
    expect(new Set(data.comp.map((c) => c.employeeId)).size).toBe(data.comp.length)
  })
  it('gives titles that match levels', () => {
    const leader = /^(Director|Vice President|Senior Vice President|Chief|General Counsel)/
    for (const e of data.employees) {
      if (e.level?.startsWith('L')) expect(e.jobTitle).not.toMatch(leader)
      if (e.level === 'M2') expect(e.jobTitle).toMatch(/^(Director|Associate General Counsel|Chief of Staff)/)
      if (e.level?.startsWith('E')) expect(e.jobTitle).toMatch(leader)
      if (e.employmentType === 'Contractor') expect(e.jobTitle).toMatch(/\(Contract\)$/)
      if (e.employmentType === 'Intern') expect(e.jobTitle).toMatch(/Intern$/)
    }
  })
  it('names an active HRBP for each business unit', () => {
    const names = new Map(data.employees.map((e) => [e.name, e]))
    const hrbps = new Set(data.employees.map((e) => e.hrbp))
    expect(hrbps.size).toBe(6)
    for (const h of hrbps) expect(names.get(h!)?.department).toBe('People')
  })
  it('only plans successions for active incumbents and successors', () => {
    expect(
      data.succession.every(
        (s) => !emp(s.incumbentId).terminationDate && (!s.successorId || !emp(s.successorId).terminationDate),
      ),
    ).toBe(true)
  })
  it('links filled requisitions to their hires', () => {
    const hired = data.candidates.filter((c) => c.status === 'Hired')
    for (const r of data.requisitions.filter((x) => x.status === 'Filled')) {
      const mine = hired.filter((c) => c.reqId === r.reqId)
      expect(mine.length).toBe(r.openings)
      expect(r.filledDate).toBe(
        mine
          .map((c) => c.hiredDate!)
          .sort()
          .at(-1),
      )
    }
    // Most hires are people in the roster, who started after accepting.
    const names = new Map(data.employees.map((e) => [e.name, e]))
    const linked = hired.filter((c) => names.has(c.candidateName))
    expect(linked.length / hired.length).toBeGreaterThan(0.85)
    expect(
      linked
        .filter((c) => c.source !== 'Internal')
        .every((c) => names.get(c.candidateName)!.hireDate > c.hiredDate!),
    ).toBe(true)
  })
})

describe('dates', () => {
  /**
   * Fields that may legitimately be in the future: scheduled events, target starts, deadlines,
   * start dates of accepted offers, planned returns, plan months and expiries.
   */
  const FUTURE_OK = new Set([
    'nextEventDate',
    'targetStartDate',
    'dueDate',
    'startDate',
    'expectedReturnDate',
    'period',
    'expiryDate',
    'exportLicenseExpiry',
  ])
  /** Pre-hires start after the as-of date; some returns from leave are entered ahead. */
  const futureOk = (name: string, k: string, row: Record<string, unknown>) =>
    FUTURE_OK.has(k) ||
    (name === 'employees' && k === 'hireDate' && !row.terminationDate) ||
    (name === 'transactions' && k === 'effectiveDate' && row.type === 'Return from leave')
  it('has nothing after the as-of date except scheduled events, target starts and deadlines', () => {
    const late: string[] = []
    for (const [name, rows] of Object.entries(data) as [string, Record<string, unknown>[]][]) {
      for (const row of rows) {
        for (const [k, v] of Object.entries(row)) {
          if (
            typeof v === 'string' &&
            /^\d{4}-\d{2}-\d{2}/.test(v) &&
            v.slice(0, 10) > AS_OF &&
            !futureOk(name, k, row)
          )
            late.push(`${name}.${k}=${v}`)
        }
      }
    }
    expect(late).toEqual([])
  })
  it('keeps every timeline in order', () => {
    expect(data.employees.every((e) => !e.terminationDate || e.hireDate <= e.terminationDate)).toBe(true)
    expect(data.employees.every((e) => e.hireDate >= '2014-03-03')).toBe(true)
    for (const c of data.candidates) {
      const seq = [c.appliedDate, c.screenDate, c.hmDate, c.onsiteDate, c.offerDate, c.hiredDate].filter(
        Boolean,
      ) as string[]
      expect(seq).toEqual(seq.slice().sort())
      if (c.rejectedDate) expect(c.rejectedDate >= c.appliedDate).toBe(true)
    }
    for (const r of data.requisitions) {
      if (r.filledDate) expect(r.openedDate <= r.filledDate).toBe(true)
      if (r.closedDate) expect(r.openedDate <= r.closedDate).toBe(true)
    }
    for (const c of data.cases) {
      if (c.firstResponseAt) expect(c.firstResponseAt >= c.openedAt).toBe(true)
      if (c.resolvedAt) expect(c.resolvedAt >= c.openedAt).toBe(true)
    }
    expect(data.transactions.every((x) => !x.completedDate || x.completedDate >= x.submittedDate)).toBe(true)
    expect(
      data.learning.every(
        (l) =>
          (!l.dueDate || l.dueDate >= l.assignedDate) &&
          (!l.completedDate || l.completedDate >= l.assignedDate),
      ),
    ).toBe(true)
  })
  it('only leaves recent cases open, apart from the planted backlog and employee relations', () => {
    const old = data.cases.filter((c) => !c.resolvedAt && days(c.openedAt, AS_OF) > 30)
    expect(
      old.every((c) => c.category === 'Immigration & mobility' || c.category === 'Employee relations'),
    ).toBe(true)
  })
})

describe('vocabularies', () => {
  const inList = (list: readonly string[], v: unknown) => list.includes(v as string)
  it('uses schema enums everywhere', () => {
    const sites = SITES.map((s) => s.location)
    for (const e of data.employees) {
      expect(inList(LEVELS, e.level)).toBe(true)
      expect(inList(EMPLOYMENT_TYPES, e.employmentType)).toBe(true)
      expect(inList(sites, e.location)).toBe(true)
      expect(e.country).toBe(siteByLocation.get(e.location)!.country)
      if (e.terminationDate) {
        expect(inList(TERMINATION_TYPES, e.terminationType)).toBe(true)
        expect(
          inList(
            e.terminationType === 'Voluntary' ? VOLUNTARY_REASONS : INVOLUNTARY_REASONS,
            e.terminationReason,
          ),
        ).toBe(true)
        expect(typeof e.regrettable).toBe('boolean')
      } else expect(e.terminationType ?? null).toBeNull()
    }
    for (const j of data.jobChanges) {
      expect(inList(CHANGE_TYPES, j.changeType)).toBe(true)
      expect(inList(LEVELS, j.fromLevel) && inList(LEVELS, j.toLevel)).toBe(true)
    }
    for (const r of data.requisitions) {
      expect(
        inList(REQ_STATUSES, r.status) &&
          inList(REQ_TYPES, r.reqType) &&
          inList(REQ_PRIORITIES, r.priority) &&
          inList(LEVELS, r.level),
      ).toBe(true)
    }
    for (const c of data.candidates) {
      expect(
        inList(STAGES, c.currentStage) && inList(CANDIDATE_STATUSES, c.status) && inList(SOURCES, c.source),
      ).toBe(true)
    }
    const categories = new Map(CASE_CATEGORIES.map((c) => [c.category, c]))
    for (const c of data.cases) {
      const cat = categories.get(c.category)!
      expect(cat).toBeDefined()
      expect(c.team).toBe(cat.team)
      expect(c.processId).toBe(cat.processId)
      expect(
        inList(CASE_STATUSES, c.status) &&
          inList(CASE_CHANNELS, c.channel) &&
          inList(CASE_PRIORITIES, c.priority) &&
          inList(CASE_TIERS, c.tier),
      ).toBe(true)
      if (c.category === 'Employee relations') expect(c.subcategory ?? null).toBeNull()
    }
    for (const x of data.transactions) {
      expect(inList(TRANSACTION_TYPES, x.type)).toBe(true)
      expect(x.processId).toBe(TRANSACTION_PROCESS[x.type])
    }
    for (const r of data.reviews) {
      expect([1, 2, 3, 4, 5]).toContain(r.rating)
      expect([1, 2, 3, 4, 5]).toContain(r.preCalibrationRating)
      if (r.potential != null) expect(inList(POTENTIALS, r.potential)).toBe(true)
    }
    for (const s of data.succession)
      if (s.readiness != null) expect(inList(READINESS, s.readiness)).toBe(true)
    for (const l of data.learning) expect(inList(LEARNING_CATEGORIES, l.category)).toBe(true)
  })
  it('maps each case category to the Atlas process that governs it', () => {
    const process = new Map(CASE_CATEGORIES.map((c) => [c.category, c.processId]))
    // Policy questions belong to policy lifecycle governance, not the ER-01 speak-up intake.
    expect(process.get('Policy question')).toBe('DS-08')
    // General pay and equity questions sit with the annual compensation review, not EQ-01 grant administration.
    expect(process.get('Compensation & equity')).toBe('CO-02')
    expect(process.get('Employee relations')).toBe('ER-02')
    for (const c of CASE_CATEGORIES) expect(c.processId).toMatch(/^[A-Z]{2}-\d{2}$/)
    const used = new Set(data.cases.map((c) => c.processId))
    expect(used.has('ER-01') || used.has('EQ-01')).toBe(false)
    expect(
      data.cases.filter((c) => c.category === 'Policy question').every((c) => c.processId === 'DS-08'),
    ).toBe(true)
  })
  it('only rates employees active and 90+ days in role at each cycle', () => {
    for (const r of data.reviews) {
      const e = emp(r.employeeId)
      expect(e.employmentType).toBe('Employee')
      expect(activeOn(e, r.cycleDate) && days(e.hireDate, r.cycleDate) >= 90).toBe(true)
      expect(r.potential == null).toBe(r.cycle.endsWith('Mid-year'))
    }
  })
})

describe('compensation sanity', () => {
  it('has ordered ranges, positive pay and site currencies', () => {
    for (const c of data.comp) {
      expect(c.rangeMin).toBeLessThan(c.rangeMid)
      expect(c.rangeMid).toBeLessThan(c.rangeMax)
      expect(c.baseSalary).toBeGreaterThan(0)
      expect(c.fxToUsd).toBeGreaterThan(0)
      expect(c.currency).toBe(siteByLocation.get(emp(c.employeeId).location)!.currency)
      expect(Math.abs(c.rangeMin / c.rangeMid - 0.8)).toBeLessThan(0.01)
      expect(Math.abs(c.rangeMax / c.rangeMid - 1.2)).toBeLessThan(0.01)
    }
  })
  it('anchors San Jose midpoints and lower-cost zones', () => {
    const mid = (site: string, level: string) =>
      data.comp.find((c) => emp(c.employeeId).location === site && emp(c.employeeId).level === level)!
        .rangeMid
    expect(mid('San Jose', 'L3')).toBe(165_000)
    expect(mid('San Jose', 'L5')).toBe(235_000)
    expect(mid('San Jose', 'M2')).toBe(285_000)
    expect(mid('Austin', 'L3') / mid('San Jose', 'L3')).toBeCloseTo(0.9, 2)
    const blr = data.comp.find(
      (c) => emp(c.employeeId).location === 'Bengaluru' && emp(c.employeeId).level === 'L3',
    )!
    expect((blr.rangeMid * blr.fxToUsd!) / 165_000).toBeLessThan(0.35)
  })
})

describe('job history', () => {
  const events = new Map<string, Datasets['jobChanges']>()
  for (const j of data.jobChanges) events.set(j.employeeId, [...(events.get(j.employeeId) ?? []), j])
  it('chains levels, departments and managers into the current record', () => {
    for (const [id, list] of events) {
      const e = emp(id)
      expect(
        list.every((j) => j.effectiveDate >= e.hireDate && j.effectiveDate <= (e.terminationDate ?? AS_OF)),
      ).toBe(true)
      for (let i = 1; i < list.length; i++) {
        expect(list[i].fromLevel).toBe(list[i - 1].toLevel)
        expect(list[i].fromDepartment).toBe(list[i - 1].toDepartment)
      }
      const last = list.at(-1)!
      expect(last.toLevel).toBe(e.level)
      expect(last.toDepartment).toBe(e.department)
      const lastMgr = list
        .filter((j) => j.changeType === 'Manager change' || j.changeType === 'Transfer')
        .at(-1)
      if (lastMgr) expect(lastMgr.toManagerId).toBe(e.managerId)
    }
  })
  it('lands the latest promotion on the current level (demotions are the latest level change when present)', () => {
    for (const [id, list] of events) {
      const levelChange = list
        .filter((j) => j.changeType === 'Promotion' || j.changeType === 'Demotion')
        .at(-1)
      if (levelChange) expect(levelChange.toLevel).toBe(emp(id).level)
      for (const j of list.filter((x) => x.changeType === 'Promotion'))
        expect(LEVELS.indexOf(j.toLevel!)).toBeGreaterThan(LEVELS.indexOf(j.fromLevel!))
    }
    const demotions = data.jobChanges.filter((j) => j.changeType === 'Demotion')
    expect(demotions.length).toBeGreaterThanOrEqual(3)
    expect(demotions.length).toBeLessThanOrEqual(6)
  })
  it('promotes about 10-12% and transfers about 5% of employees a year', () => {
    const hc = avgHeadcount(employees, AS_OF)
    const inT12 = (type: string) =>
      data.jobChanges.filter(
        (j) =>
          j.changeType === type &&
          j.effectiveDate >= T12_START &&
          emp(j.employeeId).employmentType === 'Employee',
      ).length
    expect(inT12('Promotion') / hc).toBeGreaterThan(0.09)
    expect(inT12('Promotion') / hc).toBeLessThan(0.13)
    expect(inT12('Transfer') / hc).toBeGreaterThan(0.03)
    expect(inT12('Transfer') / hc).toBeLessThan(0.07)
  })
})

/* ───────────── planted stories ───────────── */

const leftT12 = employees.filter((e) => e.terminationDate && e.terminationDate >= T12_START)
const hcT12 = avgHeadcount(employees, AS_OF)

describe('story: People stats', () => {
  it('1. one Austin Physical Design manager lost 4+ regretted people citing their manager', () => {
    const counts = new Map<string, number>()
    for (const e of leftT12) {
      if (
        e.terminationType === 'Voluntary' &&
        e.regrettable &&
        e.terminationReason === 'My manager' &&
        e.managerId
      ) {
        counts.set(e.managerId, (counts.get(e.managerId) ?? 0) + 1)
      }
    }
    const flagged = [...counts].filter(([, n]) => n >= 4)
    expect(flagged.length).toBe(1)
    const m = emp(flagged[0][0])
    expect([m.department, m.location, m.level]).toEqual(['Physical Design', 'Austin', 'M1'])
    expect(flagged[0][1]).toBeGreaterThanOrEqual(4)
    expect(
      Math.max(...[...counts].filter(([id]) => id !== m.employeeId).map(([, n]) => n)),
    ).toBeLessThanOrEqual(2)
  })
  it('2. Bengaluru voluntary attrition is about twice the company, for pay and growth', () => {
    const company = leftT12.filter((e) => e.terminationType === 'Voluntary').length / hcT12
    const blrPeople = employees.filter((e) => e.location === 'Bengaluru')
    const blrLeft = leftT12.filter((e) => e.location === 'Bengaluru' && e.terminationType === 'Voluntary')
    const blr = blrLeft.length / avgHeadcount(blrPeople, AS_OF)
    expect(blr / company).toBeGreaterThan(1.7)
    const reasons = new Map<string, number>()
    for (const e of blrLeft) reasons.set(e.terminationReason!, (reasons.get(e.terminationReason!) ?? 0) + 1)
    const top2 = [...reasons]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([r]) => r)
    expect(top2.sort()).toEqual(['Base salary', 'Career growth or promotion'])
  })
  /** Share of the people hired in [from, to] who left within 365 days of starting. */
  const firstYear = (from: string, to: string, pred: (e: Employee) => boolean = () => true) => {
    const c = employees.filter((e) => e.hireDate >= from && e.hireDate <= to && pred(e))
    return share(c, (e) => !!e.terminationDate && days(e.hireDate, e.terminationDate) < 365)
  }
  const gtm = (e: Employee) => e.businessUnit === 'Go-to-Market'
  it('3. first-year attrition in Go-to-Market is about 28%', () => {
    const rate = firstYear('2024-10-01', PRIOR_END, gtm)
    expect(rate).toBeGreaterThan(0.24)
    expect(rate).toBeLessThan(0.34)
    expect(firstYear('2024-10-01', PRIOR_END, (e) => !gtm(e))).toBeLessThan(0.12)
  })
  it('3. first-year attrition was 10-12% in each earlier cohort, so the Go-to-Market jump is new', () => {
    for (const [from, to] of [
      ['2022-10-01', '2023-09-30'],
      ['2023-10-01', '2024-09-30'],
    ]) {
      expect(firstYear(from, to)).toBeGreaterThan(0.1)
      expect(firstYear(from, to)).toBeLessThan(0.12)
      expect(firstYear(from, to, gtm)).toBeLessThan(0.15)
    }
    // The comparison a year earlier is a real rate, not an artifact of missing exits.
    const current = firstYear('2024-10-01', PRIOR_END)
    expect(Math.abs(current - firstYear('2023-10-01', '2024-09-30'))).toBeLessThan(0.02)
    // Every first-year exit falls inside its cohort's year, and the earlier cohorts all left before the last 12 months.
    const early = employees.filter(
      (e) => e.hireDate < '2024-10-01' && e.terminationDate && days(e.hireDate, e.terminationDate) < 365,
    )
    expect(early.length).toBeGreaterThan(40)
    expect(early.every((e) => e.hireDate >= '2022-10-01' && e.terminationDate! < T12_START)).toBe(true)
  })
  it('4. span outliers: three 12+ spans, four single-report managers, one new manager with 8+', () => {
    const directs = new Map<string, number>()
    for (const e of data.employees)
      if (!e.terminationDate && e.managerId) directs.set(e.managerId, (directs.get(e.managerId) ?? 0) + 1)
    expect([...directs.values()].filter((n) => n >= 12).length).toBe(3)
    expect([...directs.values()].filter((n) => n === 1).length).toBe(4)
    const newBig = [...directs].filter(([id, n]) => n >= 8 && days(emp(id).hireDate, AS_OF) < 365)
    expect(newBig.length).toBe(1)
    // Everyone else sits in the 2-9 range, mostly 4-8.
    const normal = [...directs.values()].filter((n) => n > 1 && n < 12)
    expect(share(normal, (n) => n >= 4 && n <= 8)).toBeGreaterThan(0.85)
  })
  it('5. Silicon Engineering grew about 14% year over year; Corporate is flat', () => {
    const growth = (bu: string) => {
      const g = employees.filter((e) => e.businessUnit === bu)
      return g.filter((e) => activeOn(e, AS_OF)).length / g.filter((e) => activeOn(e, PRIOR_END)).length - 1
    }
    expect(growth('Silicon Engineering')).toBeGreaterThan(0.12)
    expect(growth('Silicon Engineering')).toBeLessThan(0.16)
    expect(Math.abs(growth('Corporate'))).toBeLessThan(0.01)
  })
  it('6. company attrition: voluntary 9-10%, total about 12%', () => {
    const vol = leftT12.filter((e) => e.terminationType === 'Voluntary').length / hcT12
    expect(vol).toBeGreaterThan(0.085)
    expect(vol).toBeLessThan(0.105)
    expect(leftT12.length / hcT12).toBeGreaterThan(0.11)
    expect(leftT12.length / hcT12).toBeLessThan(0.13)
  })
})

describe('story: recruiting', () => {
  const cands = data.candidates
  const dept = (c: Datasets['candidates'][0]) => reqById.get(c.reqId)!.department
  const active = cands.filter((c) => c.status === 'Active')
  it('1. Design Verification onsite-to-offer is about 2.5x slower this quarter', () => {
    const o2o = (pred: (c: (typeof cands)[0]) => boolean) =>
      median(
        cands
          .filter((c) => c.onsiteDate && c.offerDate && c.offerDate >= '2026-07-01' && pred(c))
          .map((c) => days(c.onsiteDate!, c.offerDate!)),
      )
    const dv = o2o((c) => dept(c) === 'Design Verification')
    const other = o2o((c) => dept(c) !== 'Design Verification')
    expect(dv / other).toBeGreaterThan(2.2)
    const screenToHm = median(
      cands
        .filter((c) => c.screenDate && c.hmDate && c.hmDate >= '2026-07-01')
        .map((c) => days(c.screenDate!, c.hmDate!)),
    )
    expect(dv / screenToHm).toBeGreaterThan(2.2)
  })
  it('2. offer acceptance fell from about 85% to about 68%, mostly in Bengaluru', () => {
    const acceptance = (from: string, to: string, pred: (c: (typeof cands)[0]) => boolean = () => true) => {
      const hired = cands.filter(
        (c) => c.status === 'Hired' && c.hiredDate! >= from && c.hiredDate! <= to && pred(c),
      ).length
      const declined = cands.filter(
        (c) => c.status === 'Declined' && c.rejectedDate! >= from && c.rejectedDate! <= to && pred(c),
      ).length
      return { rate: hired / (hired + declined), declined }
    }
    const q3 = acceptance('2026-07-01', '2026-09-30')
    const q2 = acceptance('2026-04-01', '2026-06-30')
    expect(q3.rate).toBeGreaterThan(0.63)
    expect(q3.rate).toBeLessThan(0.72)
    expect(q2.rate).toBeGreaterThan(0.82)
    const blr = acceptance('2026-07-01', '2026-09-30', (c) => reqById.get(c.reqId)!.location === 'Bengaluru')
    expect(blr.declined / q3.declined).toBeGreaterThan(0.6)
    const reasons = cands
      .filter(
        (c) =>
          c.status === 'Declined' &&
          c.rejectedDate! >= '2026-07-01' &&
          reqById.get(c.reqId)!.location === 'Bengaluru',
      )
      .map((c) => c.rejectionReason)
    expect(
      share(reasons, (r) => r === 'Accepted competing offer' || r === 'Compensation below expectations'),
    ).toBeGreaterThan(0.8)
  })
  it('3. about 20% have had no step booked for 14+ days (the tiered rule is tested in the view); two hiring managers hold most feedback waits', () => {
    const noStep = share(
      active,
      (c) => c.currentStage !== 'Offer' && !c.nextEventDate && days(c.stageEnteredDate!, AS_OF) > 14,
    )
    expect(noStep).toBeGreaterThan(0.16)
    expect(noStep).toBeLessThan(0.25)
    const interviewing = active.filter((c) => ['Screen', 'Hiring manager', 'Onsite'].includes(c.currentStage))
    expect(share(interviewing, (c) => !!c.nextEventDate)).toBeGreaterThan(0.5)
    const awaiting = active.filter((c) => c.nextEventDate && c.nextEventDate <= AS_OF)
    expect(
      awaiting.every((c) => days(c.nextEventDate!, AS_OF) >= 1 && days(c.nextEventDate!, AS_OF) <= 6),
    ).toBe(true)
    expect(
      active
        .filter((c) => c.nextEventDate && c.nextEventDate > AS_OF)
        .every((c) => days(AS_OF, c.nextEventDate!) <= 10),
    ).toBe(true)
    const byHm = new Map<string, number>()
    for (const c of awaiting) {
      const hm = reqById.get(c.reqId)!.hiringManagerId!
      byHm.set(hm, (byHm.get(hm) ?? 0) + 1)
    }
    const top = [...byHm.values()].sort((a, b) => b - a)
    expect((top[0] + top[1]) / awaiting.length).toBeGreaterThan(0.4)
    expect(top[2]).toBeLessThan(top[1] / 2)
  })
  it('4. four critical analog reqs are open 75+ days with nobody past the screen', () => {
    const pastScreen = new Set(cands.filter((c) => c.hmDate).map((c) => c.reqId))
    const stuck = data.requisitions.filter(
      (r) =>
        r.status === 'Open' &&
        r.priority === 'Critical' &&
        days(r.openedDate, AS_OF) > 75 &&
        !pastScreen.has(r.reqId),
    )
    expect(stuck.length).toBe(4)
    expect(
      stuck.every((r) => r.department === 'Analog & Mixed-Signal' && (r.level === 'L5' || r.level === 'L6')),
    ).toBe(true)
  })
  it('5. referrals hire best, agencies accept worst, job board volume fell about 40%', () => {
    const bySource = new Map<string, { apps: number; hired: number; declined: number }>()
    for (const c of cands) {
      const s = bySource.get(c.source) ?? { apps: 0, hired: 0, declined: 0 }
      s.apps++
      if (c.status === 'Hired') s.hired++
      if (c.status === 'Declined') s.declined++
      bySource.set(c.source, s)
    }
    const hireRate = [...bySource].map(([s, v]) => [s, v.hired / v.apps] as const).sort((a, b) => b[1] - a[1])
    expect(hireRate[0][0]).toBe('Referral')
    const accept = [...bySource]
      .filter(([, v]) => v.hired + v.declined >= 20)
      .map(([s, v]) => [s, v.hired / (v.hired + v.declined)] as const)
      .sort((a, b) => a[1] - b[1])
    expect(accept[0][0]).toBe('Agency')
    const jobBoard = (from: string, to: string) =>
      cands.filter((c) => c.source === 'Job board' && c.appliedDate >= from && c.appliedDate <= to).length
    const change = jobBoard(T12_START, AS_OF) / jobBoard('2024-10-01', PRIOR_END) - 1
    expect(change).toBeLessThan(-0.35)
    expect(change).toBeGreaterThan(-0.55)
  })
  it('6. senior and analog roles take 90+ days to fill against about 55 overall', () => {
    const filled = data.requisitions.filter((r) => r.status === 'Filled' && r.filledDate! >= T12_START)
    const ttf = (pred: (r: (typeof filled)[0]) => boolean) =>
      median(filled.filter(pred).map((r) => days(r.openedDate, r.filledDate!)))
    const all = ttf(() => true)
    expect(all).toBeGreaterThan(48)
    expect(all).toBeLessThan(62)
    expect(ttf((r) => ['L5', 'L6', 'M2', 'E1', 'E2', 'E3'].includes(r.level ?? ''))).toBeGreaterThan(90)
    expect(ttf((r) => r.department === 'Analog & Mixed-Signal')).toBeGreaterThan(90)
  })
})

describe('story: HR ops', () => {
  const cases = data.cases
  const resolved = cases.filter((c) => c.resolvedAt)
  const slaMet = (xs: typeof cases) =>
    share(
      xs.filter((c) => c.resolvedAt),
      (c) => hours(c.openedAt, c.resolvedAt!) <= c.resolutionTargetHours!,
    )
  it('1. payroll cases spiked about 2.5x in July 2026 and SLA attainment fell to about 60%', () => {
    const perMonth = new Map<string, number>()
    for (const c of cases)
      if (c.category === 'Payroll')
        perMonth.set(c.openedAt.slice(0, 7), (perMonth.get(c.openedAt.slice(0, 7)) ?? 0) + 1)
    const july = perMonth.get('2026-07')!
    const typical = median([...perMonth].filter(([m]) => m !== '2026-07').map(([, n]) => n))
    expect(july / typical).toBeGreaterThan(2.2)
    expect(july / typical).toBeLessThan(3)
    const julySla = slaMet(cases.filter((c) => c.category === 'Payroll' && c.openedAt.startsWith('2026-07')))
    expect(julySla).toBeGreaterThan(0.5)
    expect(julySla).toBeLessThan(0.68)
    expect(
      slaMet(cases.filter((c) => c.category === 'Payroll' && !c.openedAt.startsWith('2026-07'))),
    ).toBeGreaterThan(0.85)
    const overall = slaMet(cases)
    expect(overall).toBeGreaterThan(0.85)
    expect(overall).toBeLessThan(0.92)
  })
  it('2. leave and accommodation meets SLA about 70% of the time, with open cases waiting on third parties', () => {
    const leave = cases.filter((c) => c.category === 'Leave & accommodation')
    expect(slaMet(leave)).toBeGreaterThan(0.6)
    expect(slaMet(leave)).toBeLessThan(0.78)
    const open = leave.filter((c) => !c.resolvedAt)
    expect(open.length).toBeGreaterThanOrEqual(8)
    expect(share(open, (c) => c.status === 'Waiting on third party')).toBeGreaterThan(0.66)
  })
  it('3. final pay is late for about a quarter of California involuntary and India exits', () => {
    const term = data.transactions.filter((x) => x.type === 'Termination' && x.completedDate)
    const late = (pred: (e: Employee) => boolean) =>
      share(
        term.filter((x) => pred(emp(x.employeeId))),
        (x) => x.completedDate! > x.dueDate,
      )
    const caInvol = (e: Employee) => e.location === 'San Jose' && e.terminationType === 'Involuntary'
    const india = (e: Employee) => e.location === 'Bengaluru'
    expect(late(caInvol)).toBeGreaterThan(0.18)
    expect(late(india)).toBeGreaterThan(0.18)
    expect(late((e) => !caInvol(e) && !india(e))).toBeLessThan(0.05)
    // Deadlines follow the jurisdiction rules (FINAL_PAY_RULES in the services catalog).
    const rules = new Set<string>()
    for (const x of data.transactions.filter((y) => y.type === 'Termination')) {
      const e = emp(x.employeeId)
      expect(x.effectiveDate).toBe(e.terminationDate)
      expect(x.dueDate, `${e.location} ${e.terminationType} ${e.terminationDate}`).toBe(finalPayDue(e))
      rules.add(siteByLocation.get(e.location)!.jurisdiction)
    }
    expect(rules.size).toBe(new Set(SITES.map((s) => s.jurisdiction)).size)
  })
  it('3. final pay deadlines: semi-monthly paydays, month-end in Germany, the 9th in Israel', () => {
    const exit = (location: string, terminationDate: string, terminationType: 'Voluntary' | 'Involuntary') =>
      ({ location, terminationDate, terminationType }) as Employee
    // Thursday 14 May 2026: the next payday is Friday 29 May (the 31st is a Sunday).
    expect(finalPayDue(exit('Raleigh', '2026-05-14', 'Involuntary'))).toBe('2026-05-15')
    expect(finalPayDue(exit('Raleigh', '2026-05-15', 'Voluntary'))).toBe('2026-05-29')
    expect(finalPayDue(exit('Austin', '2026-05-15', 'Voluntary'))).toBe('2026-05-29')
    expect(finalPayDue(exit('Austin', '2026-05-15', 'Involuntary'))).toBe('2026-05-21')
    expect(finalPayDue(exit('Boulder', '2026-05-15', 'Involuntary'))).toBe('2026-05-15')
    expect(finalPayDue(exit('Seattle', '2026-05-18', 'Voluntary'))).toBe('2026-05-31')
    expect(finalPayDue(exit('Seattle', '2026-05-04', 'Involuntary'))).toBe('2026-05-15')
    expect(finalPayDue(exit('Toronto', '2026-05-12', 'Voluntary'))).toBe('2026-05-19')
    expect(finalPayDue(exit('Toronto', '2026-05-04', 'Voluntary'))).toBe('2026-05-15')
    expect(finalPayDue(exit('Vancouver', '2026-05-04', 'Involuntary'))).toBe('2026-05-06')
    expect(finalPayDue(exit('Vancouver', '2026-05-04', 'Voluntary'))).toBe('2026-05-10')
    expect(finalPayDue(exit('Munich', '2026-05-12', 'Voluntary'))).toBe('2026-05-29')
    expect(finalPayDue(exit('Haifa', '2026-05-12', 'Voluntary'))).toBe('2026-06-09')
    expect(finalPayDue(exit('Hsinchu', '2026-05-12', 'Voluntary'))).toBe('2026-05-12')
    expect(finalPayDue(exit('Shanghai', '2026-05-12', 'Involuntary'))).toBe('2026-05-12')
    expect(finalPayDue(exit('Bengaluru', '2026-05-15', 'Voluntary'))).toBe('2026-05-19')
    expect(finalPayDue(exit('Ho Chi Minh City', '2026-05-15', 'Voluntary'))).toBe('2026-06-04')
    expect(finalPayDue(exit('San Jose', '2026-05-15', 'Voluntary'))).toBe('2026-05-15')
  })
  it('4. new hires in Asia Pacific are ready by Day -3 less than 90% of the time', () => {
    const apac = new Set(['Bengaluru', 'Hsinchu', 'Shanghai', 'Ho Chi Minh City'])
    const nh = data.transactions.filter((x) => x.type === 'New hire' && x.completedDate)
    const ready = (pred: (loc: string) => boolean) =>
      share(
        nh.filter((x) => pred(emp(x.employeeId).location)),
        (x) => x.completedDate! <= x.dueDate,
      )
    expect(ready((l) => apac.has(l))).toBeLessThan(0.9)
    expect(ready((l) => !apac.has(l))).toBeGreaterThan(0.95)
  })
  it('5. email satisfaction trails portal and chat; HR data cases reopen about 12% of the time', () => {
    const csat = (ch: string) =>
      mean(cases.filter((c) => c.channel === ch && c.csat != null).map((c) => c.csat!))
    expect(csat('Email')).toBeLessThan(3.8)
    expect(csat('Portal')).toBeGreaterThan(4.3)
    expect(csat('Chat')).toBeGreaterThan(4.3)
    expect(share(resolved, (c) => c.csat != null)).toBeGreaterThan(0.3)
    const reopen = (pred: (c: (typeof cases)[0]) => boolean) =>
      share(resolved.filter(pred), (c) => !!c.reopened)
    const data_ = reopen((c) => c.category === 'HR data & records')
    expect(data_).toBeGreaterThan(0.09)
    expect(data_ / reopen((c) => c.category !== 'HR data & records')).toBeGreaterThan(2.5)
    expect(share(cases, (c) => !!c.escalated)).toBeGreaterThan(0.04)
  })
  it('6. about 15 immigration cases have been open for more than 30 days', () => {
    const backlog = cases.filter(
      (c) => c.category === 'Immigration & mobility' && !c.resolvedAt && days(c.openedAt, AS_OF) > 30,
    )
    expect(backlog.length).toBeGreaterThanOrEqual(12)
    expect(backlog.length).toBeLessThanOrEqual(18)
  })
})

describe('story: talent', () => {
  const rv = data.reviews
  it('1. Go-to-Market rates about 45% of people 4-5 against a 35% guideline', () => {
    const gtm = rv.filter((r) => emp(r.employeeId).businessUnit === 'Go-to-Market')
    const other = rv.filter((r) => emp(r.employeeId).businessUnit !== 'Go-to-Market')
    expect(share(gtm, (r) => r.rating >= 4)).toBeGreaterThan(0.42)
    expect(share(gtm, (r) => r.rating >= 4)).toBeLessThan(0.5)
    expect(share(other, (r) => r.rating >= 4)).toBeLessThan(0.37)
  })
  it('2. calibration pulls Silicon Engineering down about 0.4 points', () => {
    const drop = (pred: (bu: string) => boolean) =>
      mean(
        rv.filter((r) => pred(emp(r.employeeId).businessUnit)).map((r) => r.preCalibrationRating! - r.rating),
      )
    expect(drop((bu) => bu === 'Silicon Engineering')).toBeGreaterThan(0.35)
    expect(drop((bu) => bu === 'Silicon Engineering')).toBeLessThan(0.5)
    expect(drop((bu) => bu !== 'Silicon Engineering')).toBeLessThan(0.2)
  })
  it('3. three high-potential, highly rated people resigned in the last six months', () => {
    const highPotential = new Set(rv.filter((r) => r.potential === 'High').map((r) => r.employeeId))
    const latest = new Map<string, number>()
    for (const r of rv.slice().sort((a, b) => (a.cycleDate < b.cycleDate ? -1 : 1)))
      latest.set(r.employeeId, r.rating)
    const exits = employees.filter(
      (e) =>
        e.terminationDate &&
        e.terminationDate >= '2026-04-01' &&
        e.terminationType === 'Voluntary' &&
        e.regrettable &&
        highPotential.has(e.employeeId) &&
        (latest.get(e.employeeId) ?? 0) >= 4,
    )
    expect(exits.length).toBe(3)
  })
  it('4. about 30% of critical roles lack a ready-now successor; four high-risk incumbents have nobody', () => {
    const roles = new Map<string, Datasets['succession']>()
    for (const s of data.succession) roles.set(s.roleId, [...(roles.get(s.roleId) ?? []), s])
    const critical = [...roles.values()].filter((rows) => rows[0].criticality === 'Critical')
    const noReady = share(critical, (rows) => !rows.some((r) => r.readiness === 'Ready now'))
    expect(noReady).toBeGreaterThan(0.25)
    expect(noReady).toBeLessThan(0.35)
    const bare = [...roles.values()].filter(
      (rows) => rows[0].incumbentRiskOfLoss === 'High' && !rows.some((r) => r.successorId),
    )
    expect(bare.length).toBe(4)
  })
  it('5. export control training is overdue in Operations and Hsinchu', () => {
    const campaign = data.learning.filter(
      (l) =>
        l.course === 'Export control & trade compliance' &&
        l.assignedDate === '2026-07-13' &&
        !emp(l.employeeId).terminationDate,
    )
    const overdue = (pred: (e: Employee) => boolean) =>
      share(
        campaign.filter((l) => pred(emp(l.employeeId))),
        (l) => !l.completedDate && l.dueDate! < AS_OF,
      )
    expect(overdue((e) => e.businessUnit === 'Operations')).toBeGreaterThan(0.2)
    expect(overdue((e) => e.location === 'Hsinchu')).toBeGreaterThan(0.2)
    expect(overdue((e) => e.businessUnit !== 'Operations' && e.location !== 'Hsinchu')).toBeLessThan(0.06)
  })
  it('6. about 25 high performers have waited 3+ years for a promotion, mostly Design Verification L4-L5', () => {
    const lastPromotion = new Map<string, string>()
    for (const j of data.jobChanges)
      if (j.changeType === 'Promotion') lastPromotion.set(j.employeeId, j.effectiveDate)
    const threeYearsAgo = '2023-09-30'
    const stuck = activeEmployees.filter(
      (e) =>
        !e.level?.startsWith('E') &&
        e.hireDate <= threeYearsAgo &&
        (ratingOf.get(`${e.employeeId}|2024 Annual`) ?? 0) >= 4 &&
        (ratingOf.get(`${e.employeeId}|2025 Annual`) ?? 0) >= 4 &&
        (lastPromotion.get(e.employeeId) ?? '0000') <= threeYearsAgo,
    )
    expect(stuck.length).toBeGreaterThanOrEqual(20)
    expect(stuck.length).toBeLessThanOrEqual(30)
    expect(
      share(stuck, (e) => e.department === 'Design Verification' && (e.level === 'L4' || e.level === 'L5')),
    ).toBeGreaterThan(0.5)
  })
})

describe('story: compensation', () => {
  const comp = data.comp
  const compa = (c: (typeof comp)[0]) => c.baseSalary / c.rangeMid
  const of = (c: (typeof comp)[0]) => emp(c.employeeId)
  const latestRating = (id: string) =>
    ratingOf.get(`${id}|2026 Mid-year`) ?? ratingOf.get(`${id}|2025 Annual`)
  it('1. Bengaluru compa-ratios sit around 0.88', () => {
    const blr = median(comp.filter((c) => of(c).location === 'Bengaluru').map(compa))
    expect(blr).toBeGreaterThan(0.85)
    expect(blr).toBeLessThan(0.91)
    expect(median(comp.filter((c) => of(c).location !== 'Bengaluru').map(compa))).toBeGreaterThan(0.97)
  })
  it('2. about 5% are below range minimum and 3% above maximum, the latter mostly long-tenured L4s', () => {
    expect(share(comp, (c) => c.baseSalary < c.rangeMin)).toBeGreaterThan(0.04)
    expect(share(comp, (c) => c.baseSalary < c.rangeMin)).toBeLessThan(0.06)
    const above = comp.filter((c) => c.baseSalary > c.rangeMax)
    expect(above.length / comp.length).toBeGreaterThan(0.025)
    expect(above.length / comp.length).toBeLessThan(0.035)
    expect(
      share(above, (c) => of(c).level === 'L4' && days(of(c).hireDate, AS_OF) > 5.5 * 365),
    ).toBeGreaterThan(0.7)
  })
  it("3. this year's Design Verification L3-L4 hires are paid above incumbents", () => {
    const dv = comp.filter(
      (c) => of(c).department === 'Design Verification' && (of(c).level === 'L3' || of(c).level === 'L4'),
    )
    const recent = median(dv.filter((c) => of(c).hireDate >= T12_START).map(compa))
    const incumbents = median(dv.filter((c) => of(c).hireDate < T12_START).map(compa))
    expect(dv.filter((c) => of(c).hireDate >= T12_START).length).toBeGreaterThanOrEqual(12)
    expect(recent).toBeGreaterThan(1.02)
    expect(incumbents).toBeLessThan(0.98)
    expect(recent - incumbents).toBeGreaterThan(0.06)
  })
  it('4. Go-to-Market merit runs about 4.3% against a 3.5% budget, with a few rating outliers', () => {
    const spend = (xs: typeof comp) => {
      const m = xs.filter((c) => c.meritPct != null)
      return (
        m.reduce((a, c) => a + c.meritPct! * c.baseSalary * c.fxToUsd!, 0) /
        m.reduce((a, c) => a + c.baseSalary * c.fxToUsd!, 0)
      )
    }
    expect(spend(comp)).toBeGreaterThan(0.033)
    expect(spend(comp)).toBeLessThan(0.037)
    expect(spend(comp.filter((c) => of(c).businessUnit === 'Go-to-Market'))).toBeGreaterThan(0.041)
    // Outliers hold under either join: the latest rating or the 2025 Annual rating.
    for (const rating of [latestRating, (id: string) => ratingOf.get(`${id}|2025 Annual`)]) {
      expect(
        comp.filter((c) => c.meritPct != null && rating(c.employeeId) === 5 && c.meritPct < 0.02).length,
      ).toBe(5)
      expect(
        comp.filter((c) => c.meritPct != null && (rating(c.employeeId) ?? 3) <= 2 && c.meritPct > 0.03)
          .length,
      ).toBe(6)
    }
    expect(
      share(
        comp.filter((c) => c.meritPct != null),
        (c) => c.promotionPct != null,
      ),
    ).toBeCloseTo(0.08, 2)
  })
  it('5. Analog & Mixed-Signal base pay is about 9% below market median', () => {
    const vsMarket = (pred: (c: (typeof comp)[0]) => boolean) =>
      median(comp.filter(pred).map((c) => c.baseSalary / c.marketP50!))
    expect(vsMarket((c) => of(c).department === 'Analog & Mixed-Signal')).toBeGreaterThan(0.88)
    expect(vsMarket((c) => of(c).department === 'Analog & Mixed-Signal')).toBeLessThan(0.94)
    expect(
      vsMarket((c) => of(c).department !== 'Analog & Mixed-Signal' && of(c).location !== 'Bengaluru'),
    ).toBeGreaterThan(0.96)
  })
  it('6. Firmware gives everyone the same merit regardless of rating', () => {
    const byRating = (dept: string) => {
      const xs = comp.filter((c) => of(c).department === dept && c.meritPct != null)
      return [2, 3, 4, 5].map((r) =>
        mean(xs.filter((c) => latestRating(c.employeeId) === r).map((c) => c.meritPct!)),
      )
    }
    const fw = byRating('Firmware')
    expect(Math.max(...fw) - Math.min(...fw)).toBeLessThan(0.004)
    const dd = byRating('Digital Design')
    expect(dd[3] - dd[0]).toBeGreaterThan(0.03)
  })
})

/* ───────────── onboarding and the hiring plan ───────────── */

describe('story: Onboarding', () => {
  const cands = data.candidates
  const accepted = cands.filter((c) => c.status === 'Hired')
  const loc = (c: Datasets['candidates'][0]) => reqById.get(c.reqId)!.location
  const upcoming = accepted.filter((c) => c.startDate! > AS_OF)
  const preHires = data.employees.filter((e) => e.hireDate > AS_OF)
  const tasks = data.onboardingTasks
  const candById = new Map(cands.map((c) => [c.applicationId, c]))
  const startOf = (t: Datasets['onboardingTasks'][0]) =>
    t.employeeId ? emp(t.employeeId).hireDate : candById.get(t.applicationId!)!.startDate!
  const siteOf = (t: Datasets['onboardingTasks'][0]) =>
    t.employeeId ? emp(t.employeeId).location : loc(candById.get(t.applicationId!)!)
  const APAC = new Set(['Bengaluru', 'Hsinchu', 'Shanghai', 'Ho Chi Minh City'])

  it('every accepted offer has a start date; Bengaluru waits 60-92 days, the US two to five weeks', () => {
    expect(accepted.every((c) => c.startDate && c.startDate > c.hiredDate!)).toBe(true)
    const wait = (pred: (c: (typeof accepted)[0]) => boolean) =>
      median(
        accepted
          .filter((c) => c.hiredDate! >= T12_START && c.source !== 'Internal' && pred(c))
          .map((c) => days(c.hiredDate!, c.startDate!)),
      )
    expect(wait((c) => loc(c) === 'Bengaluru')).toBeGreaterThanOrEqual(60)
    expect(wait((c) => siteByLocation.get(loc(c))!.country === 'United States')).toBeLessThan(40)
  })

  it('59 accepted offers start in Q4 2026, 44 of them in October and 12 in Bengaluru', () => {
    expect(upcoming).toHaveLength(59)
    expect(upcoming.every((c) => c.startDate! <= '2026-12-31')).toBe(true)
    expect(upcoming.filter((c) => c.startDate! < '2026-11-01')).toHaveLength(44)
    expect(upcoming.filter((c) => loc(c) === 'Bengaluru')).toHaveLength(12)
  })

  it('25 of them are pre-hires in the roster; two moved their first day a week later in the HRIS', () => {
    expect(preHires).toHaveLength(25)
    const gaps = preHires.map((e) => {
      const c = upcoming.find((x) => x.candidateName === e.name)!
      expect(reqById.get(c.reqId)!.department).toBe(e.department)
      expect(e.managerId).toBe(reqById.get(c.reqId)!.hiringManagerId)
      return days(c.startDate!, e.hireDate)
    })
    expect(gaps.filter((g) => g === 0)).toHaveLength(23)
    expect(gaps.filter((g) => g === 7)).toHaveLength(2)
    // Pre-hires have no pay, reviews, learning or transactions yet.
    const ids = new Set(preHires.map((e) => e.employeeId))
    expect(data.comp.some((c) => ids.has(c.employeeId))).toBe(false)
    expect(data.transactions.some((x) => ids.has(x.employeeId))).toBe(false)
  })

  it('two Bengaluru offers were accepted and then withdrawn (reneges): 2.3% in India, none elsewhere', () => {
    const reneges = cands.filter((c) => c.status === 'Withdrawn' && c.hiredDate)
    expect(reneges).toHaveLength(2)
    expect(reneges.every((c) => loc(c) === 'Bengaluru' && c.rejectionReason!.startsWith('Reneged'))).toBe(
      true,
    )
    const acceptedT12 = (pred: (c: (typeof cands)[0]) => boolean) =>
      cands.filter((c) => c.hiredDate && c.hiredDate >= T12_START && pred(c)).length
    expect(2 / acceptedT12((c) => loc(c) === 'Bengaluru')).toBeCloseTo(0.023, 3)
    expect(2 / acceptedT12(() => true)).toBeLessThan(0.01)
  })

  it('laptops shipped late for 41% of Asia Pacific starts in the last 12 months, 6% elsewhere', () => {
    const laptops = tasks.filter(
      (t) => t.task === 'Laptop shipped' && t.employeeId && startOf(t) >= T12_START && startOf(t) <= AS_OF,
    )
    const late = (t: (typeof tasks)[0]) =>
      t.completedDate ? t.completedDate > t.dueDate! : t.dueDate! < AS_OF
    expect(
      share(
        laptops.filter((t) => APAC.has(siteOf(t))),
        late,
      ),
    ).toBeCloseTo(0.41, 2)
    expect(
      share(
        laptops.filter((t) => !APAC.has(siteOf(t))),
        late,
      ),
    ).toBeLessThan(0.08)
  })

  it('day-one readiness is about 83% against a 95% target, Asia Pacific about 72%', () => {
    const people = new Map<string, (typeof tasks)[0][]>()
    for (const t of tasks) {
      if (!t.employeeId || startOf(t) < T12_START || startOf(t) > AS_OF) continue
      people.set(t.employeeId, [...(people.get(t.employeeId) ?? []), t])
    }
    const readiness = new Set(ONBOARDING_TASKS.filter((d) => d.readiness).map((d) => d.task))
    const ready = (id: string) =>
      people
        .get(id)!
        .filter((t) => readiness.has(t.task))
        .every((t) => t.status === 'Not needed' || (!!t.completedDate && t.completedDate <= emp(id).hireDate))
    const ids = [...people.keys()]
    expect(share(ids, ready)).toBeGreaterThan(0.8)
    expect(share(ids, ready)).toBeLessThan(0.86)
    const apac = ids.filter((id) => APAC.has(emp(id).location))
    expect(share(apac, ready)).toBeGreaterThan(0.68)
    expect(share(apac, ready)).toBeLessThan(0.76)
  })

  it('three people start next week (5 Oct) without a cleared background check', () => {
    const open = tasks.filter(
      (t) =>
        t.task === 'Background check cleared' &&
        t.status !== 'Done' &&
        startOf(t) <= workingDaysAfter(AS_OF, 10),
    )
    expect(open).toHaveLength(3)
    expect(open.every((t) => startOf(t) === '2026-10-05')).toBe(true)
    // Two more October starts wait for an export license (their screening is blocked).
    const blocked = tasks.filter((t) => t.task === 'Export-control screening' && t.status === 'Blocked')
    expect(blocked.map(startOf)).toEqual(['2026-10-12', '2026-10-12'])
  })

  it('probation decisions are overdue for four Sales starts, and nowhere else', () => {
    const overdue = tasks.filter(
      (t) =>
        t.task === 'Probation decision' &&
        t.dueDate &&
        t.dueDate < AS_OF &&
        !t.completedDate &&
        t.status !== 'Not needed',
    )
    expect(overdue).toHaveLength(4)
    expect(overdue.every((t) => emp(t.employeeId!).department === 'Sales')).toBe(true)
  })

  it('30/60/90-day check-ins happen on time for about 46% of Software starts against 88% elsewhere', () => {
    const due = tasks.filter(
      (t) => /check-in$/.test(t.task) && t.employeeId && t.dueDate! <= AS_OF && t.status !== 'Not needed',
    )
    const onTime = (t: (typeof due)[0]) => !!t.completedDate && t.completedDate <= t.dueDate!
    const sw = due.filter((t) => emp(t.employeeId!).department === 'Software')
    expect(share(sw, onTime)).toBeGreaterThan(0.4)
    expect(share(sw, onTime)).toBeLessThan(0.52)
    expect(
      share(
        due.filter((t) => !sw.includes(t)),
        onTime,
      ),
    ).toBeGreaterThan(0.85)
  })

  it('follows the checklist: due dates from the start, I-9 in the US, probation outside it', () => {
    const names = new Set(ONBOARDING_TASKS.map((d) => d.task))
    for (const t of tasks) {
      expect(names.has(t.task)).toBe(true)
      expect(ONBOARDING_STATUSES).toContain(t.status)
      expect(!!t.employeeId !== !!t.applicationId).toBe(true)
      if (t.status === 'Done') expect(t.completedDate).toBeTruthy()
      else expect(t.completedDate ?? null).toBeNull()
      const us = siteByLocation.get(siteOf(t))!.country === 'United States'
      if (t.task.startsWith('I-9')) expect(us).toBe(true)
      if (t.task === 'Probation decision') expect(us).toBe(false)
      if (t.task === 'Laptop shipped') expect(t.dueDate).toBe(plusDays(startOf(t), -3))
      if (t.task === 'I-9 Section 2') expect(t.dueDate).toBe(workingDaysAfter(startOf(t), 3))
    }
    // Pre-hires by employee ID, accepted candidates by application ID: 59 people about to start.
    const next = new Set(tasks.filter((t) => startOf(t) > AS_OF).map((t) => t.employeeId ?? t.applicationId))
    expect(next.size).toBe(59)
  })
})

describe('story: hiring plan', () => {
  const plan = data.hiringPlan
  const q4 = plan.filter((l) => l.period >= '2026-10-01' && l.period <= '2026-12-01')
  const covered = (l: (typeof plan)[0]) => {
    const r = l.reqId ? reqById.get(l.reqId) : undefined
    return r?.status === 'Open' || r?.status === 'Filled'
  }
  const sum = (ls: typeof plan) => ls.reduce((a, l) => a + l.plannedHires, 0)

  it('is one FY27 v2 plan from April 2026 to March 2027, counts and planned roles in one sheet', () => {
    expect(new Set(plan.map((l) => l.planVersion))).toEqual(new Set(['FY27 v2']))
    expect(
      plan.every((l) => l.period >= '2026-04-01' && l.period <= '2027-03-01' && l.period.endsWith('-01')),
    ).toBe(true)
    expect(plan.every((l) => !l.reqId || reqById.has(l.reqId))).toBe(true)
    expect(plan.some((l) => l.plannedHires > 1)).toBe(true)
    expect(plan.filter((l) => l.positionId).every((l) => l.plannedHires === 1)).toBe(true)
    const keys = plan.map((l) => [l.period, l.businessUnit, l.department, l.location, l.positionId].join('|'))
    expect(new Set(keys).size).toBe(plan.length)
  })

  it('ramps in Q4 2026, which is why open reqs surged in Q3', () => {
    expect(sum(q4)).toBeGreaterThan(sum(plan.filter((l) => l.period <= '2026-09-01')))
    const openedQ3 = data.requisitions.filter((r) => r.status === 'Open' && r.openedDate >= '2026-07-01')
    const onQ4 = new Set(q4.map((l) => l.reqId))
    // About four in five of the reqs opened in Q3 and still open target a Q4 start.
    expect(share(openedQ3, (r) => onQ4.has(r.reqId))).toBeGreaterThan(0.78)
  })

  it('Silicon Engineering is 14 starts behind its Q4 plan: 9 planned roles have no req, 5 are on hold', () => {
    const uncovered = q4.filter((l) => l.businessUnit === 'Silicon Engineering' && !covered(l))
    expect(sum(uncovered)).toBe(14)
    expect(uncovered.filter((l) => !l.reqId)).toHaveLength(9)
    expect(uncovered.filter((l) => reqById.get(l.reqId ?? '')?.status === 'On hold')).toHaveLength(5)
    // Every other business unit has an accepted offer or an open req behind each Q4 role.
    expect(q4.filter((l) => l.businessUnit !== 'Silicon Engineering').every(covered)).toBe(true)
  })

  it('year to date: Silicon Engineering behind (86%), Go-to-Market ahead (120%), the rest within 10%', () => {
    const ratio = (bu: string) => {
      const planned = sum(plan.filter((l) => l.businessUnit === bu && l.period <= '2026-09-01'))
      const actual = employees.filter(
        (e) => e.businessUnit === bu && e.hireDate >= '2026-04-01' && e.hireDate <= AS_OF,
      ).length
      return actual / planned
    }
    expect(ratio('Silicon Engineering')).toBeCloseTo(0.86, 2)
    expect(ratio('Go-to-Market')).toBeCloseTo(1.2, 2)
    for (const bu of ['Systems & Software', 'Operations', 'Corporate']) {
      expect(ratio(bu)).toBeGreaterThan(0.9)
      expect(ratio(bu)).toBeLessThan(1.1)
    }
  })

  it('12 open reqs are not in the plan: 9 backfills and 3 new reqs', () => {
    const planned = new Set(plan.map((l) => l.reqId))
    const off = data.requisitions.filter((r) => r.status === 'Open' && !planned.has(r.reqId))
    expect(off).toHaveLength(12)
    expect(off.filter((r) => r.reqType === 'Backfill')).toHaveLength(9)
    expect(off.every((r) => r.businessUnit !== 'Silicon Engineering')).toBe(true)
  })
})

/* ───────────── compliance and right to work ───────────── */

describe('story: Compliance', () => {
  const rtw = data.rightToWork
  const within = (n: number) =>
    rtw.filter((r) => r.expiryDate && r.expiryDate > AS_OF && r.expiryDate <= plusDays(AS_OF, n))

  it('holds broad authorization categories only: no nationality or citizenship anywhere', () => {
    for (const r of rtw) {
      expect(AUTHORIZATION_TYPES).toContain(r.authorizationType)
      expect(Object.keys(r).some((k) => /nation|citizen/i.test(k))).toBe(false)
      if (r.authorizationType === 'Permanent (no expiry)') expect(r.expiryDate ?? null).toBeNull()
      else expect(r.expiryDate).toBeTruthy()
      if (r.i9Section1Date || r.i9Section2Date) expect(emp(r.employeeId).country).toBe('United States')
    }
    const limited = share(rtw, (r) => r.authorizationType !== 'Permanent (no expiry)')
    expect(limited).toBeGreaterThan(0.06)
    expect(limited).toBeLessThan(0.12)
  })

  it('12 authorizations expire in the next 90 days: reverification not started for 3, late for 2', () => {
    const in90 = within(90)
    expect(in90).toHaveLength(12)
    expect(in90.filter((r) => !r.reverificationStartedDate)).toHaveLength(3)
    expect(
      in90.filter(
        (r) => r.reverificationStartedDate && days(r.reverificationStartedDate, r.expiryDate!) < 90,
      ),
    ).toHaveLength(2)
    expect(within(180)).toHaveLength(26)
    expect(in90.every((r) => activeOn(emp(r.employeeId), AS_OF))).toBe(true)
  })

  it('one engineer is working without an export license in force; two pre-hires wait for theirs', () => {
    const notInForce = rtw.filter(
      (r) =>
        r.exportLicenseRequired &&
        activeOn(emp(r.employeeId), AS_OF) &&
        (r.exportLicenseStatus !== 'Approved' || (r.exportLicenseExpiry ?? '9999') < AS_OF),
    )
    expect(notInForce).toHaveLength(1)
    expect(emp(notInForce[0].employeeId).hireDate.slice(0, 7)).toBe('2026-08')
    const pending = rtw.filter(
      (r) => r.exportLicenseStatus === 'Pending' && emp(r.employeeId).hireDate > AS_OF,
    )
    expect(pending).toHaveLength(2)
  })

  it('I-9 Section 2 was done within three business days for 96% of US starts in the last 12 months', () => {
    const us = rtw.filter((r) => {
      const e = emp(r.employeeId)
      return (
        e.country === 'United States' &&
        e.employmentType === 'Employee' &&
        e.hireDate >= T12_START &&
        e.hireDate <= AS_OF
      )
    })
    const onTime = (r: (typeof us)[0]) =>
      !!r.i9Section2Date && r.i9Section2Date <= workingDaysAfter(emp(r.employeeId).hireDate, 3)
    expect(us.length).toBeGreaterThan(100)
    expect(us.filter((r) => !onTime(r))).toHaveLength(5)
    // The same dates as the onboarding checklist's I-9 tasks.
    const s2 = new Map(
      data.onboardingTasks
        .filter((t) => t.task === 'I-9 Section 2' && t.employeeId)
        .map((t) => [t.employeeId!, t.completedDate ?? null]),
    )
    for (const r of us) expect(r.i9Section2Date ?? null).toBe(s2.get(r.employeeId) ?? null)
  })
})

/* ───────────── leave and return to work ───────────── */

describe('story: Leave & return', () => {
  const tx = data.transactions
  const starts = tx
    .filter((x) => x.type === 'Leave start')
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  const returns = tx.filter((x) => x.type === 'Return from leave')
  /** Each leave start with the next return of the same person on or after it. */
  const pairs = (() => {
    const used = new Set<string>()
    return starts.map((s) => {
      const r = returns
        .filter(
          (x) =>
            x.employeeId === s.employeeId && x.effectiveDate >= s.effectiveDate && !used.has(x.transactionId),
        )
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0]
      if (r) used.add(r.transactionId)
      return {
        start: s,
        ret: r && r.effectiveDate <= AS_OF ? r : null,
        ahead: r && r.effectiveDate > AS_OF ? r : null,
      }
    })
  })()
  const employed = (id: string) => !emp(id).terminationDate || emp(id).terminationDate! > AS_OF

  it('every leave start has its Atlas category and a planned return; no other transaction has them', () => {
    for (const x of tx) {
      if (x.type === 'Leave start') {
        expect(LEAVE_REASONS).toContain(x.leaveReason)
        expect(x.expectedReturnDate! > x.effectiveDate).toBe(true)
      } else expect(x.leaveReason ?? x.expectedReturnDate ?? null).toBeNull()
    }
    const parental = share(starts, (s) => s.leaveReason === 'Parental')
    expect(parental).toBeGreaterThan(0.25)
    expect(parental).toBeLessThan(0.4)
  })

  it('20 people are on leave now, and nobody started a leave after leaving', () => {
    expect(pairs.filter((p) => !p.ret && employed(p.start.employeeId))).toHaveLength(20)
    for (const s of starts) {
      const e = emp(s.employeeId)
      expect(!e.terminationDate || e.terminationDate >= s.effectiveDate).toBe(true)
    }
    // Six people resigned during a leave; nobody was dismissed during one.
    const during = pairs.filter((p) => !p.ret && !employed(p.start.employeeId))
    expect(during).toHaveLength(6)
    expect(during.every((p) => emp(p.start.employeeId).terminationType === 'Voluntary')).toBe(true)
  })

  it('85% of parental leavers were still here 12 months after returning (target 90%), 95% for other leaves', () => {
    const cohort = pairs.filter(
      (p) => p.ret && p.ret.effectiveDate >= '2024-10-01' && p.ret.effectiveDate <= PRIOR_END,
    )
    const stayed = (p: (typeof cohort)[0]) => {
      const e = emp(p.start.employeeId)
      return !e.terminationDate || days(p.ret!.effectiveDate, e.terminationDate) > 365
    }
    const parental = cohort.filter((p) => p.start.leaveReason === 'Parental')
    expect(parental).toHaveLength(20)
    expect(parental.filter(stayed)).toHaveLength(17)
    expect(
      share(
        cohort.filter((p) => p.start.leaveReason !== 'Parental'),
        stayed,
      ),
    ).toBeGreaterThan(0.93)
  })

  it('two people resigned within six months of coming back from parental leave, both in the last 12 months', () => {
    const soon = pairs.filter((p) => {
      const exit = p.ret ? emp(p.start.employeeId).terminationDate : null
      return !!exit && exit >= p.ret!.effectiveDate && days(p.ret!.effectiveDate, exit) <= 183
    })
    expect(soon).toHaveLength(2)
    for (const p of soon) {
      expect(p.start.leaveReason).toBe('Parental')
      expect(emp(p.start.employeeId).terminationType).toBe('Voluntary')
      expect(emp(p.start.employeeId).terminationDate! >= T12_START).toBe(true)
    }
  })

  it('9 people are due back in the next 30 days: 6 returns processed ahead, 1 entered, 2 not entered', () => {
    const due = pairs.filter(
      (p) => !p.ret && employed(p.start.employeeId) && p.start.expectedReturnDate! <= plusDays(AS_OF, 30),
    )
    expect(due).toHaveLength(9)
    expect(due.filter((p) => p.ahead?.completedDate)).toHaveLength(6)
    expect(due.filter((p) => p.ahead && !p.ahead.completedDate)).toHaveLength(1)
    expect(due.filter((p) => !p.ahead)).toHaveLength(2)
  })
})

/* ───────────── listening ───────────── */

describe('story: Listening', () => {
  const sr = data.surveyResponses
  const cand = new Map(data.candidates.map((c) => [c.applicationId, c]))
  const nps = (scores: number[]) =>
    ((scores.filter((x) => x >= 9).length - scores.filter((x) => x <= 6).length) / scores.length) * 100
  const of = (survey: string, item?: string) =>
    sr.filter((r) => r.survey === survey && (!item || r.item === item))

  it('covers every program in long format, one answer per respondent, item and wave', () => {
    expect(new Set(sr.map((r) => r.survey))).toEqual(new Set(SURVEY_TYPES))
    const items = new Map(data.surveyItems.map((i) => [`${i.survey}|${i.item}`, i]))
    for (const r of sr) {
      expect(SURVEY_SCALES).toContain(r.scale)
      const [lo, hi] = r.scale === '0-10' ? [0, 10] : [1, 5]
      expect(Number.isInteger(r.score) && r.score >= lo && r.score <= hi).toBe(true)
      expect(items.get(`${r.survey}|${r.item}`)?.driver).toBe(r.driver)
      expect(r.responseDate <= AS_OF).toBe(true)
      // Respondent keys are employee IDs, or application IDs for candidates.
      expect(
        r.survey === 'Candidate experience' ? cand.has(r.respondentKey) : byId.has(r.respondentKey),
      ).toBe(true)
    }
    const keys = sr.map((r) => [r.survey, r.wave, r.respondentKey, r.item, r.subjectKey ?? ''].join('|'))
    expect(new Set(keys).size).toBe(sr.length)
    // Modest, so the app still loads quickly.
    expect(sr.length).toBeLessThan(22_000)
  })

  it('candidates who reached the Design Verification onsite this quarter score the process far lower', () => {
    const cx = of('Candidate experience', 'CX_NPS').filter(
      (r) => r.touchpoint === 'Onsite' && r.wave === '2026 Q3',
    )
    const dv = cx.filter(
      (r) => reqById.get(cand.get(r.respondentKey)!.reqId)!.department === 'Design Verification',
    )
    expect(dv.length).toBeGreaterThanOrEqual(10)
    expect(nps(dv.map((r) => r.score))).toBeLessThan(-20)
    expect(nps(cx.filter((r) => !dv.includes(r)).map((r) => r.score))).toBeGreaterThan(0)
  })

  it('hiring managers rate the recruiter with the heaviest load lowest', () => {
    const byRecruiter = new Map<string, number[]>()
    for (const r of of('Hiring manager satisfaction', 'HM_OVERALL')) {
      const rec = reqById.get(r.subjectKey!)!.recruiter!
      byRecruiter.set(rec, [...(byRecruiter.get(rec) ?? []), r.score])
    }
    const ranked = [...byRecruiter]
      .map(([k, v]) => [k, mean(v), v.length] as const)
      .sort((a, b) => a[1] - b[1])
    expect(ranked[0][0]).toBe('Agnieszka Nielsen')
    expect(ranked[0][1]).toBeLessThan(3.1)
    expect(ranked[0][2]).toBeGreaterThanOrEqual(10)
    expect(ranked[1][1]).toBeGreaterThan(3.5)
  })

  it('day-30 "I had what I needed" is about 3.4 in Asia Pacific against 4.3 elsewhere', () => {
    const ready = of('Onboarding pulse day 30', 'ON30_READY')
    const apac = (r: (typeof ready)[0]) =>
      siteByLocation.get(emp(r.respondentKey).location)!.region === 'APAC'
    expect(mean(ready.filter(apac).map((r) => r.score))).toBeCloseTo(3.4, 1)
    expect(mean(ready.filter((r) => !apac(r)).map((r) => r.score))).toBeGreaterThan(4.2)
  })

  it('career growth is the top stay risk for Design Verification L4-L5 key talent', () => {
    const rows = of('Stay interview', 'STAY_GROWTH')
    const dv = rows.filter((r) => {
      const e = emp(r.respondentKey)
      return e.department === 'Design Verification' && (e.level === 'L4' || e.level === 'L5')
    })
    expect(dv.length).toBeGreaterThanOrEqual(10)
    expect(share(dv, (r) => r.reason === 'Career growth')).toBeGreaterThan(0.6)
    const others = mean(rows.filter((r) => !dv.includes(r)).map((r) => r.score))
    expect(mean(dv.map((r) => r.score))).toBeLessThan(others - 0.8)
  })

  it('base salary is the top exit-survey reason in Bengaluru (the HRIS records career growth there most)', () => {
    const counts = new Map<string, number>()
    for (const r of of('Exit survey', 'EXIT_RETURN'))
      if (emp(r.respondentKey).location === 'Bengaluru')
        counts.set(r.reason!, (counts.get(r.reason!) ?? 0) + 1)
    const ranked = [...counts].sort((a, b) => b[1] - a[1])
    expect(ranked[0][0]).toBe('Base salary')
    expect(ranked[0][1]).toBeGreaterThan(2 * ranked[1][1])
  })

  it('upward feedback is lowest for the Austin Physical Design manager, with 10+ respondents in four quarters', () => {
    const fb = of('Manager feedback').filter((r) => r.responseDate >= T12_START)
    const by = new Map<string, { who: Set<string>; scores: number[] }>()
    for (const r of fb) {
      const g = by.get(r.subjectKey!) ?? { who: new Set(), scores: [] }
      g.who.add(r.respondentKey)
      g.scores.push(r.score)
      by.set(r.subjectKey!, g)
    }
    const shown = [...by]
      .filter(([, g]) => g.who.size >= 10)
      .sort((a, b) => mean(a[1].scores) - mean(b[1].scores))
    const m = emp(shown[0][0])
    expect([m.department, m.location, m.level]).toEqual(['Physical Design', 'Austin', 'M1'])
    expect(mean(shown[0][1].scores)).toBeLessThan(2.5)
    expect(shown.length).toBeGreaterThan(3)
  })
})
