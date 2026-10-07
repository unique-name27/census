/**
 * The People stats charts added in the design refresh: each number recounts from the roster, each
 * mark opens exactly the people it counts, small groups are hidden or folded, and groups of an
 * org filter carry the filter that reproduces them.
 */
import { describe, expect, it } from 'vitest'
import { resolveDrill } from '@/drill/Drill'
import { applyDrillFilter } from '@/drill/testing'
import { addMonths } from '@/lib/dates'
import { attrition, headcountAt, isActiveAt, isEmployee, monthPoints } from '@/lib/people'
import { hrbpModel } from '.'
import { prepare, trailing } from './base'
import { change, emp, leaver, many, prepOf, sampleCtx } from './fixtures'
import {
  attritionTrailing,
  cohortDrill,
  cohortRetention,
  headcountByOrg,
  managerChangeDrill,
  managerChanges,
  orgMonthDrill,
  SCOPE_LINE,
  trailingDrill,
  WHOLE_COMPANY,
} from './trends'

describe('attrition, rolling 12 months', () => {
  const people = [
    ...many(20, { hireDate: '2020-01-06' }),
    leaver('2025-03-10', 'Voluntary', { hireDate: '2020-01-06' }),
    leaver('2026-02-10', 'Voluntary', { hireDate: '2020-01-06', regrettable: true }),
    leaver('2026-06-10', 'Involuntary', { hireDate: '2020-01-06' }),
  ]
  const p = prepOf({ employees: people })
  const t = attritionTrailing(p)

  it('draws 24 month ends, each the 12 months to it', () => {
    // With no filter the one line is the whole company, and says so in its Line column.
    expect(t.scopeLine).toBe(WHOLE_COMPANY)
    const v = t.voluntary.filter((x) => x.series === WHOLE_COMPANY)
    expect(v.map((x) => x.date)).toEqual(monthPoints('2026-09-30', 24))
    expect(t.company).toBe(false)
  })

  it('recounts each point from the roster', () => {
    for (const pt of t.voluntary) {
      const r = attrition(people, trailing(pt.date, 12), 'voluntary')
      expect(pt.rate, pt.date).toBeCloseTo(r.rate!, 10)
      expect(pt.exits, pt.date).toBe(r.events)
      expect(trailingDrill(p, pt)?.rows.length ?? 0, pt.date).toBe(r.events)
    }
    const sep = t.voluntary.at(-1)!
    expect(sep.exits).toBe(1)
    const mar25 = t.voluntary.find((x) => x.date === '2025-03-31')!
    expect(mar25.exits).toBe(1)
    const regretted = t.regretted.at(-1)!
    expect(regretted.exits).toBe(1)
  })

  it('hides every point of a scope under the anonymity minimum', () => {
    const small = prepOf({ employees: [...many(3), leaver('2026-02-10', 'Voluntary')] })
    const x = attritionTrailing(small)
    expect(x.voluntary.every((pt) => pt.rate == null && pt.records.length === 0)).toBe(true)
  })

  it('adds the company line under an org filter', () => {
    const both = [...people, ...many(10, { location: 'Austin' })]
    const x = attritionTrailing(prepOf({ employees: both }, { location: ['Austin'] }))
    expect(x.company).toBe(true)
    expect(x.scopeLine).toBe(SCOPE_LINE)
    expect(x.voluntary.filter((pt) => pt.series === SCOPE_LINE)).toHaveLength(24)
    expect(x.voluntary.filter((pt) => pt.series === 'Company')).toHaveLength(24)
  })
})

describe('headcount by organization over time', () => {
  const people = [
    ...many(12, { businessUnit: 'Silicon Engineering', hireDate: '2020-01-06' }),
    ...many(6, { businessUnit: 'Go-to-Market', hireDate: '2025-06-02' }),
    ...many(2, { businessUnit: 'Operations', hireDate: '2020-01-06' }),
    leaver('2025-12-31', 'Voluntary', { businessUnit: 'Go-to-Market', hireDate: '2020-01-06' }),
    emp({ businessUnit: 'Silicon Engineering', employmentType: 'Contractor' }),
  ]
  const p = prepOf({ employees: people })
  const h = headcountByOrg(p)

  it('splits every month end by business unit, small units in Other', () => {
    expect(h.dim).toBe('businessUnit')
    expect(h.groups).toEqual(['Silicon Engineering', 'Go-to-Market', 'Other (1)'])
    for (const t of h.totals) {
      const rows = h.rows.filter((r) => r.date === t.date)
      expect(rows.reduce((a, r) => a + r.headcount, 0)).toBe(t.headcount)
      expect(t.headcount).toBe(headcountAt(people, t.date))
    }
    const at = (date: string, group: string) =>
      h.rows.find((r) => r.date === date && r.group === group)!.headcount
    // The leaver counts in Go-to-Market until they left; the June 2025 hires from then on.
    expect(at('2025-05-31', 'Go-to-Market')).toBe(1)
    expect(at('2025-11-30', 'Go-to-Market')).toBe(7)
    expect(at('2026-09-30', 'Go-to-Market')).toBe(6)
  })

  it('opens the segment with its business unit as the filter, Other with none', () => {
    const seg = h.rows.find((r) => r.date === '2026-09-30' && r.group === 'Silicon Engineering')!
    const d = orgMonthDrill(p, seg)!
    expect(d.rows).toHaveLength(12)
    expect(d.filter).toEqual({ businessUnit: ['Silicon Engineering'] })
    const other = h.rows.find((r) => r.date === '2026-09-30' && r.group === 'Other (1)')!
    expect(orgMonthDrill(p, other)!.filter).toBeUndefined()
  })
})

describe('how long new hires stay', () => {
  const asOf = '2026-09-30'
  const stay = (hireDate: string, n: number) => many(n, { hireDate })
  const people = [
    // Hired 12-24 months ago: 6 hires, 2 gone within 6 months.
    ...stay('2025-01-15', 4),
    leaver('2025-04-01', 'Voluntary', { hireDate: '2025-01-15' }),
    leaver('2025-06-01', 'Voluntary', { hireDate: '2025-01-15' }),
    // Hired in the last 12 months: 5 hires, none gone yet; only those hired by 30 Jun count at 3 months.
    ...stay('2026-02-02', 3),
    ...stay('2026-08-03', 2),
    // Hired 24-36 months ago: too few to show.
    ...stay('2024-03-01', 3),
  ]
  const p = prepOf({ employees: people })
  const r = cohortRetention(p)
  const point = (cohort: string, months: number) =>
    r.points.find((x) => x.cohort === cohort && x.months === months)!

  it('recounts each cohort at each checkpoint, only hires whose checkpoint has passed', () => {
    const prev = point('Hired 12 to 24 months ago', 6)
    expect(prev.observed).toBe(6)
    expect(prev.stayed).toBe(4)
    expect(prev.share).toBeCloseTo(4 / 6, 10)
    expect(point('Hired 12 to 24 months ago', 3).stayed).toBe(5)
    // 24 months after Jan 2025 has not passed: nobody observed, hidden.
    expect(point('Hired 12 to 24 months ago', 24).observed).toBe(0)
    expect(point('Hired 12 to 24 months ago', 24).share).toBeNull()
    // Three of the five recent hires have passed 3 months: under the minimum, hidden.
    expect(point('Hired in the last 12 months', 3).observed).toBe(3)
    expect(point('Hired in the last 12 months', 3).share).toBeNull()
    for (const pt of r.points) {
      const cohort = r.cohorts.find((c) => c.label === pt.cohort)!
      const seen = cohort.hires.filter((e) => addMonths(e.hireDate, pt.months) <= asOf)
      expect(pt.observed).toBe(seen.length)
    }
  })

  it('hides a cohort under the anonymity minimum and names it', () => {
    expect(r.hidden).toEqual(['Hired 24 to 36 months ago'])
    expect(r.points.some((x) => x.cohort === 'Hired 24 to 36 months ago')).toBe(false)
  })

  it('opens the hires a bar counts, those who left first and marked', () => {
    const pt = point('Hired 12 to 24 months ago', 6)
    const d = cohortDrill(p, r, pt)!
    expect(d.rows).toHaveLength(pt.observed)
    const left = d.rows.map((e) => d.extra!.values(e).leftByCheckpoint)
    expect(left).toEqual(['Yes', 'Yes', 'No', 'No', 'No', 'No'])
    // Still employed = the rows marked No, the bar's share.
    expect(left.filter((x) => x === 'No').length / d.rows.length).toBeCloseTo(pt.share!, 10)
    expect(cohortDrill(p, r, point('Hired 12 to 24 months ago', 3))!.rows).toHaveLength(6)
  })

  it('opens a bar at 100% too: every hire, none marked as left', () => {
    const all = prepOf({ employees: [...stay('2025-01-15', 6)] })
    const rr = cohortRetention(all)
    const pt = rr.points.find((x) => x.cohort === 'Hired 12 to 24 months ago' && x.months === 3)!
    expect(pt.share).toBe(1)
    const d = cohortDrill(all, rr, pt)!
    expect(d.rows).toHaveLength(6)
    expect(d.rows.every((e) => d.extra!.values(e).leftByCheckpoint === 'No')).toBe(true)
  })
})

describe('new manager in the last 12 months', () => {
  const mgrOld = emp({ employeeId: 'M-OLD', hireDate: '2015-01-05', level: 'M1' })
  const mgrNew = emp({ employeeId: 'M-NEW', hireDate: '2026-03-02', level: 'M1' })
  const team = many(10, { businessUnit: 'Silicon Engineering', managerId: 'M-OLD' })
  const gtm = many(6, { businessUnit: 'Go-to-Market', managerId: 'M-OLD' })
  const people = [mgrOld, mgrNew, ...team, ...gtm]
  const changes = [
    change({
      employeeId: team[0].employeeId,
      effectiveDate: '2026-01-10',
      changeType: 'Manager change',
      toManagerId: 'M-OLD',
      fromManagerId: 'X',
    }),
    change({
      employeeId: team[0].employeeId,
      effectiveDate: '2026-05-10',
      changeType: 'Manager change',
      toManagerId: 'M-OLD',
      fromManagerId: 'Y',
    }),
    change({
      employeeId: team[1].employeeId,
      effectiveDate: '2026-04-01',
      changeType: 'Transfer',
      fromManagerId: 'X',
      toManagerId: 'M-OLD',
    }),
    // A transfer that kept the manager is no manager change.
    change({
      employeeId: team[2].employeeId,
      effectiveDate: '2026-04-01',
      changeType: 'Transfer',
      fromManagerId: 'M-OLD',
      toManagerId: 'M-OLD',
    }),
    // Recorded when the new manager joined: left out.
    change({
      employeeId: gtm[0].employeeId,
      effectiveDate: '2026-03-02',
      changeType: 'Manager change',
      toManagerId: 'M-NEW',
      fromManagerId: 'M-OLD',
    }),
    // Over 12 months ago: left out.
    change({
      employeeId: gtm[1].employeeId,
      effectiveDate: '2025-06-01',
      changeType: 'Manager change',
      toManagerId: 'M-OLD',
      fromManagerId: 'X',
    }),
    change({
      employeeId: gtm[2].employeeId,
      effectiveDate: '2026-09-01',
      changeType: 'Manager change',
      toManagerId: 'M-OLD',
      fromManagerId: 'X',
    }),
  ]
  const p = prepOf({ employees: people, jobChanges: changes })
  const mc = managerChanges(p)
  const row = (g: string) => mc.rows.find((r) => r.group === g)!

  it('counts today’s employees with at least one manager change, by business unit', () => {
    expect(row('Silicon Engineering')).toMatchObject({ employees: 12, changed: 2 })
    expect(row('Silicon Engineering').share).toBeCloseTo(2 / 12, 10)
    expect(row('Go-to-Market')).toMatchObject({ employees: 6, changed: 1 })
    expect(mc.company).toBeCloseTo(3 / 18, 10)
  })

  it('opens the people behind a bar, with the unit as the filter', () => {
    const d = managerChangeDrill(p, mc, row('Silicon Engineering'))!
    expect(d.rows).toHaveLength(2)
    expect(d.filter).toEqual({ businessUnit: ['Silicon Engineering'] })
    expect(d.extra?.values(d.rows.find((e) => e.employeeId === team[0].employeeId)!)).toEqual({
      managerChanges: 2,
      lastManagerChange: '2026-05-10',
    })
  })

  it('folds groups under the anonymity minimum into Other', () => {
    const small = prepOf({
      employees: [
        ...people,
        ...many(2, { businessUnit: 'Operations' }),
        ...many(2, { businessUnit: 'Finance' }),
      ],
      jobChanges: changes,
    })
    const x = managerChanges(small)
    const other = x.rows.find((r) => r.other)!
    expect(other.group).toBe('Other (2)')
    expect(other.employees).toBe(4)
    expect(other.share).toBeNull()
  })
})

describe('on the sample company', () => {
  const ctx = sampleCtx()
  const m = hrbpModel(ctx)
  const p = m.prep

  it('ends the rolling voluntary line on the voluntary attrition tile', () => {
    const t = attritionTrailing(p)
    const last = t.voluntary.filter((x) => x.series === t.scopeLine).at(-1)!
    expect(last.rate).toBeCloseTo(m.kpi.kpis.find((k) => k.id === 'voluntary')!.value as number, 10)
  })

  it('stacks headcount to the headcount line at every month end', () => {
    const h = headcountByOrg(p)
    for (const t of h.totals) {
      expect(t.headcount).toBe(headcountAt(ctx.data.employees, t.date))
      for (const r of h.rows.filter((x) => x.date === t.date))
        expect(orgMonthDrill(p, r)?.rows.length ?? 0, `${t.date} ${r.group}`).toBe(r.headcount)
    }
  })

  it('shows first-year leavers in the cohort hired 12 to 24 months ago', () => {
    const r = cohortRetention(p)
    const twelve = r.points.find((x) => x.cohort === 'Hired 12 to 24 months ago' && x.months === 12)!
    const cohort = r.cohorts.find((c) => c.label === twelve.cohort)!
    const stayed = cohort.hires.filter((e) => isActiveAt(e, addMonths(e.hireDate, 12))).length
    expect(twelve.stayed).toBe(stayed)
    expect(twelve.share).toBeCloseTo(stayed / cohort.hires.length, 10)
    expect(cohort.hires.every(isEmployee)).toBe(true)
  })

  // The rows are one level down from the scope, so after Filter to the group is the whole scope:
  // its total reproduces the number (the scorecard's rule).
  it('Filter to a group gives a scope whose total is the group’s share with a new manager', () => {
    const mc = managerChanges(p)
    for (const row of mc.rows.filter((r) => r.filter).slice(0, 4)) {
      const filter = resolveDrill(() => managerChangeDrill(p, mc, row))?.filter
      expect(filter).toEqual(row.filter)
      const after = managerChanges(prepare(applyDrillFilter(ctx, filter!)))
      const changed = after.rows.reduce((a, r) => a + r.changed, 0)
      const employees = after.rows.reduce((a, r) => a + r.employees, 0)
      expect(employees, row.group).toBe(row.employees)
      expect(changed / employees, row.group).toBeCloseTo(row.share!, 10)
    }
  })

  it('Filter to a group gives a scope whose headcount is the segment at every month end', () => {
    const h = headcountByOrg(p)
    for (const group of h.groups.filter((g) => !g.startsWith('Other')).slice(0, 4)) {
      const last = h.rows.find((r) => r.group === group && r.date === ctx.asOf)!
      const filter = orgMonthDrill(p, last)!.filter!
      const after = headcountByOrg(prepare(applyDrillFilter(ctx, filter)))
      for (const t of after.totals) {
        const before = h.rows.find((r) => r.group === group && r.date === t.date)!
        expect(t.headcount, `${group} ${t.date}`).toBe(before.headcount)
      }
    }
  })
})

describe('in a leader scope', () => {
  // A leader with two direct reports: one leads 6 people, the other 2 (folded into Other).
  const lead = emp({ employeeId: 'L1', hireDate: '2015-01-05', level: 'E1', managerId: null })
  const big = emp({ employeeId: 'D1', hireDate: '2016-01-05', level: 'M1', managerId: 'L1' })
  const small = emp({ employeeId: 'D2', hireDate: '2016-01-05', level: 'M1', managerId: 'L1' })
  const people = [
    lead,
    big,
    small,
    ...many(5, { managerId: 'D1', hireDate: '2020-01-06' }),
    ...many(1, { managerId: 'D2', hireDate: '2020-01-06' }),
  ]
  const p = prepOf({ employees: people }, { leaderId: 'L1' })

  it('counts the leader in Other in both charts, so each adds up to the scope', () => {
    const h = headcountByOrg(p)
    expect(h.dim).toBe('leader')
    expect(h.leader).toBe(lead.name)
    const last = h.rows.filter((r) => r.date === '2026-09-30')
    expect(last.reduce((a, r) => a + r.headcount, 0)).toBe(people.length)
    const otherHc = last.find((r) => r.group.startsWith('Other'))!
    expect(otherHc.records.map((e) => e.employeeId).sort()).toEqual(
      ['L1', 'D2', people.at(-1)!.employeeId].sort(),
    )
    const mc = managerChanges(p)
    expect(mc.leader).toBe(lead.name)
    expect(mc.rows.reduce((a, r) => a + r.employees, 0)).toBe(people.length)
    const other = mc.rows.find((r) => r.other)!
    expect(other.employees).toBe(otherHc.headcount)
  })
})
