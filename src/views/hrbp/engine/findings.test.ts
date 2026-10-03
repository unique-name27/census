import { describe, expect, it } from 'vitest'
import type { Employee, JobChange } from '@/data/schema'
import { computeHrbp, talkingPoints } from '.'
import { departmentGrowth } from './findings'
import { change, ctxOf, emp, leaver, many, prepOf } from './fixtures'

const run = (employees: Employee[], filters = {}, jobChanges: JobChange[] = []) =>
  computeHrbp(ctxOf({ employees, jobChanges }, filters))
const byId = (m: ReturnType<typeof run>, id: string) => m.findings.find((f) => f.id === id)

describe('regretted exits clustered under a manager', () => {
  const boss = emp({ employeeId: 'B1', name: 'Alex Boss', level: 'M1' })
  const other = emp({ employeeId: 'B2', name: 'Sam Other', level: 'M1' })
  const base = [boss, other, ...many(20, { managerId: 'B1' }), ...many(20, { managerId: 'B2' })]
  const regretted = (mgr: string, date: string) =>
    leaver(date, 'Voluntary', { managerId: mgr, regrettable: true, terminationReason: 'My manager' })

  it('counts regretted exits, not all exits (the earlier tool counted every exit)', () => {
    const m = run([
      ...base,
      leaver('2026-02-02', 'Voluntary', { managerId: 'B2' }),
      leaver('2026-03-02', 'Involuntary', { managerId: 'B2' }),
      leaver('2026-04-06', 'Voluntary', { managerId: 'B2' }),
      regretted('B1', '2026-05-04'),
    ])
    expect(byId(m, 'hrbp-regretted-cluster')).toBeUndefined()
  })

  it('is a warning at 2 and critical at 3 or more', () => {
    const two = run([...base, regretted('B1', '2026-02-02'), regretted('B1', '2026-05-04')])
    expect(byId(two, 'hrbp-regretted-cluster')).toMatchObject({
      severity: 'warning',
      filter: { leaderId: 'B1' },
    })
    const three = run([
      ...base,
      regretted('B1', '2026-02-02'),
      regretted('B1', '2026-05-04'),
      regretted('B1', '2026-06-01'),
    ])
    const f = byId(three, 'hrbp-regretted-cluster')!
    expect(f.severity).toBe('critical')
    expect(f.title).toBe(
      "Alex Boss's team (Design Verification, San Jose) had 3 regretted exits in the last 12 months",
    )
    expect(f.people).toHaveLength(3)
    expect(f.action).toBe("Hold stay conversations with the rest of Alex Boss's team this month.")
  })

  it('talking points name the manager with the most regretted exits, not the most exits', () => {
    const m = run([
      ...base,
      ...Array.from({ length: 4 }, (_, i) => leaver(`2026-0${i + 2}-02`, 'Voluntary', { managerId: 'B2' })),
      regretted('B1', '2026-02-02'),
      regretted('B1', '2026-05-04'),
    ])
    const text = talkingPoints(m)
    expect(text).toContain('2 regretted exits over the last 12 months, most under Alex Boss (2).')
    expect(text).not.toContain('Sam Other')
  })
})

describe('voluntary attrition above the company', () => {
  const company = [
    ...many(60, { location: 'San Jose' }),
    ...many(30, { location: 'Bengaluru' }),
    ...Array.from({ length: 6 }, (_, i) =>
      leaver(`2026-0${i + 1}-15`, 'Voluntary', { location: 'Bengaluru' }),
    ),
    leaver('2026-03-16', 'Voluntary', { location: 'San Jose' }),
  ]

  it('names the location 3 pts or more above the company and focuses on it', () => {
    const f = byId(run(company), 'hrbp-voluntary-location')!
    expect(f.title).toMatch(/^Voluntary attrition in Bengaluru is \d+\.\d%, \d+\.\d pts above the company$/)
    expect(f.filter).toEqual({ location: ['Bengaluru'] })
    expect(f.tab).toBe('attrition')
  })

  it('needs an average headcount of 10 or more', () => {
    const tiny = [
      ...many(60, { location: 'San Jose' }),
      ...many(6, { location: 'Haifa' }),
      leaver('2026-03-02', 'Voluntary', { location: 'Haifa' }),
      leaver('2026-04-06', 'Voluntary', { location: 'Haifa' }),
    ]
    expect(byId(run(tiny), 'hrbp-voluntary-location')).toBeUndefined()
  })

  it('compares a filtered scope with the company', () => {
    const m = run(company, { location: ['Bengaluru'] })
    expect(byId(m, 'hrbp-voluntary-scope')?.title).toMatch(/^Voluntary attrition in Bengaluru is/)
    expect(m.kpi.kpis.find((k) => k.id === 'voluntary')!.deltaLabel).toBe('vs company')
  })

  it('stays silent when termination type is missing everywhere (null, not 0)', () => {
    const untyped = company.map((e) => ({ ...e, terminationType: null, regrettable: null }))
    const m = run(untyped)
    expect(byId(m, 'hrbp-voluntary-location')).toBeUndefined()
    const vol = m.kpi.kpis.find((k) => k.id === 'voluntary')!
    expect(vol.value).toBeNull()
    expect(vol.note).toBe('Add Termination type to Employees to see this')
    expect(m.kpi.kpis.find((k) => k.id === 'regretted')!.value).toBeNull()
    expect(m.kpi.kpis.find((k) => k.id === 'attrition')!.value).not.toBeNull()
  })
})

describe('first-year attrition', () => {
  const hire = (n: number, left: number, patch: Partial<Employee>) => [
    ...many(n - left, { hireDate: '2025-01-06', ...patch }),
    ...Array.from({ length: left }, () =>
      emp({ hireDate: '2025-01-06', terminationDate: '2025-06-02', terminationType: 'Voluntary', ...patch }),
    ),
  ]

  it('fires above 20% with a cohort of 5 or more', () => {
    const m = run([...many(20), ...hire(5, 2, {})])
    expect(byId(m, 'hrbp-first-year')?.title).toBe('First-year attrition is 40.0% (2 of 5 hires)')
  })

  it('stays silent below a cohort of 5', () => {
    const m = run([...many(20), ...hire(4, 2, {})])
    expect(byId(m, 'hrbp-first-year')).toBeUndefined()
    expect(m.kpi.firstYear.rate).toBeNull()
  })

  it('finds the business unit where it concentrates', () => {
    const m = run([
      ...many(30),
      ...hire(30, 1, { businessUnit: 'Silicon Engineering' }),
      ...hire(12, 4, { businessUnit: 'Go-to-Market', department: 'Sales' }),
    ])
    const f = byId(m, 'hrbp-first-year')!
    expect(f.title).toBe(
      'First-year attrition in Go-to-Market is 33.3% (4 of 12 hires), against 3.3% elsewhere',
    )
    expect(f.filter).toEqual({ businessUnit: ['Go-to-Market'] })
  })
})

describe('org design rules', () => {
  it('flags span outliers: exactly 1 report or 12 or more', () => {
    const m = run([
      emp({ employeeId: 'W', name: 'Wide' }),
      ...many(12, { managerId: 'W' }),
      emp({ employeeId: 'N', name: 'Narrow' }),
      emp({ managerId: 'N' }),
    ])
    const f = byId(m, 'hrbp-span-outliers')!
    expect(f.title).toBe('1 manager has 12 or more direct reports and 1 has only one')
    expect(f.severity).toBe('info')
  })

  it('flags a new manager with 5 or more directs, warning at 8 or more', () => {
    const m = run([
      emp({ employeeId: 'NM', name: 'New Lead', hireDate: '2026-02-16', level: 'M1' }),
      ...many(9, { managerId: 'NM' }),
      emp({ employeeId: 'OLD', name: 'Old Lead', hireDate: '2015-02-16', level: 'M1' }),
      ...many(9, { managerId: 'OLD' }),
    ])
    const f = byId(m, 'hrbp-new-managers')!
    expect(f.severity).toBe('warning')
    expect(f.title).toBe('New Lead has managed for 7 months and leads 9 direct reports')
  })

  it('flags new-hire concentration at half the team (warning at 65%)', () => {
    const team = (id: string, recent: number, size: number) => [
      emp({ employeeId: id, name: id }),
      ...many(recent, { managerId: id, hireDate: '2026-06-01' }),
      ...many(size - recent, { managerId: id }),
    ]
    const half = byId(run(team('H', 3, 6)), 'hrbp-new-hire-concentration')!
    expect(half.severity).toBe('info')
    const most = byId(run(team('H', 4, 6)), 'hrbp-new-hire-concentration')!
    expect(most.severity).toBe('warning')
    expect(byId(run(team('H', 2, 6)), 'hrbp-new-hire-concentration')).toBeUndefined()
    expect(byId(run(team('H', 3, 4)), 'hrbp-new-hire-concentration')).toBeUndefined()
  })
})

describe('rapid growth uses true headcount at both dates', () => {
  it('does not mistake replacement hiring for growth (the earlier tool counted survivors)', () => {
    // 10 people 6 months ago; 5 left and 5 were hired since: headcount is flat.
    const people = [
      ...many(5, { department: 'Firmware', hireDate: '2020-01-06' }),
      ...Array.from({ length: 5 }, () =>
        emp({
          department: 'Firmware',
          hireDate: '2020-01-06',
          terminationDate: '2026-05-01',
          terminationType: 'Voluntary',
        }),
      ),
      ...many(5, { department: 'Firmware', hireDate: '2026-06-01' }),
    ]
    const g = departmentGrowth(prepOf({ employees: people })).find((x) => x.dept === 'Firmware')!
    expect(g).toMatchObject({ before: 10, now: 10, growth: 0 })
    expect(byId(run(people), 'hrbp-rapid-growth')).toBeUndefined()
  })

  it('fires at 35% growth on a base of 5 or more, following transfers in', () => {
    const people = [
      ...many(6, { department: 'Firmware' }),
      emp({ employeeId: 'MOVER', department: 'Firmware' }),
      ...many(2, { department: 'Firmware', hireDate: '2026-06-01' }),
    ]
    const jobChanges = [
      change({
        employeeId: 'MOVER',
        effectiveDate: '2026-05-04',
        changeType: 'Transfer',
        fromDepartment: 'Software',
        toDepartment: 'Firmware',
      }),
    ]
    const g = departmentGrowth(prepOf({ employees: people, jobChanges })).find((x) => x.dept === 'Firmware')!
    expect(g).toMatchObject({ before: 6, now: 9 })
    expect(byId(run(people, {}, jobChanges), 'hrbp-rapid-growth')?.title).toBe(
      'Firmware grew 50% in 6 months, from 6 to 9 people',
    )
  })
})

describe('copy rules', () => {
  it('never uses em dashes or exclamation marks in findings and talking points', () => {
    const m = run([
      emp({ employeeId: 'W', name: 'Wide' }),
      ...many(12, { managerId: 'W' }),
      leaver('2026-02-02', 'Voluntary', { managerId: 'W', regrettable: true }),
      leaver('2026-03-02', 'Voluntary', { managerId: 'W', regrettable: true }),
    ])
    const text = [
      talkingPoints(m),
      ...m.findings.flatMap((f) => [f.title, f.detail ?? '', f.action ?? '']),
    ].join('\n')
    expect(text).not.toMatch(/—|!/)
  })
})
