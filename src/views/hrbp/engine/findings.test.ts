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
    expect(text).toContain(
      "2 regretted exits over the last 12 months. The largest group, 2 of 2, left Alex Boss's team.",
    )
    expect(text).not.toContain('Sam Other')
  })

  it('names no manager when no team lost more than one', () => {
    const m = run([...base, regretted('B1', '2026-02-02'), regretted('B2', '2026-05-04')])
    expect(talkingPoints(m)).toContain(
      "2 regretted exits over the last 12 months, no more than one from any manager's team.",
    )
  })

  it('lists only the named team in the people chip', () => {
    const m = run([
      ...base,
      regretted('B1', '2026-02-02'),
      regretted('B1', '2026-05-04'),
      regretted('B1', '2026-06-01'),
      regretted('B2', '2026-02-02'),
      regretted('B2', '2026-03-02'),
    ])
    const f = byId(m, 'hrbp-regretted-cluster')!
    expect(f.people).toHaveLength(3)
    expect(f.detail).toContain('“My manager” (3 of 3)')
    expect(f.detail).toContain('1 other manager also had 2 or more: Sam Other (2).')
  })
})

describe('talking points privacy (n < 5)', () => {
  it('drops the regretted bullet and rates when the scope averages under 5 employees', () => {
    const people = [
      ...many(3, { level: 'E3' }),
      leaver('2026-02-02', 'Voluntary', { level: 'E3', regrettable: true }),
      ...many(30),
    ]
    const text = talkingPoints(run(people, { level: ['E3'] }))
    expect(text).not.toMatch(/regretted/i)
    expect(text).not.toMatch(/Voluntary attrition is/)
    expect(text).toContain('Rates are hidden to protect anonymity')
  })

  it('names the top reason only when 2 or more of 5 or more leavers gave it', () => {
    const site = (n: number, reasons: string[]) => [
      ...many(n, { location: 'Vancouver' }),
      ...reasons.map((r, i) =>
        leaver(`2026-0${i + 2}-02`, 'Voluntary', { location: 'Vancouver', terminationReason: r }),
      ),
      ...many(40),
    ]
    const one = talkingPoints(run(site(14, ['The work itself']), { location: ['Vancouver'] }))
    expect(one).toContain('Voluntary attrition is')
    expect(one).not.toContain('The work itself')
    const few = talkingPoints(
      run(site(14, ['Base salary', 'Base salary', 'Commute']), { location: ['Vancouver'] }),
    )
    expect(few).not.toContain('Base salary')
    const enough = talkingPoints(
      run(site(30, ['Base salary', 'Base salary', 'Commute', 'Relocation', 'Base salary']), {
        location: ['Vancouver'],
      }),
    )
    expect(enough).toContain('The top reason given was “Base salary” (3 of 5 voluntary exits)')
  })
})

describe('an Employees upload with no leavers (active roster only)', () => {
  const active = [...many(40), ...many(10, { hireDate: '2025-03-03' })]

  it('shows every exit rate as null with a note, never 0', () => {
    const m = run(active)
    for (const id of ['attrition', 'voluntary', 'regretted', 'first-year']) {
      const k = m.kpi.kpis.find((x) => x.id === id)!
      expect(k.value).toBeNull()
      expect(k.note).toBe('Add leavers (Termination date) to Employees to see this')
      expect((k.spark ?? []).every((v) => v === null)).toBe(true)
    }
    const hc = m.kpi.kpis.find((x) => x.id === 'headcount')!
    expect(hc.value).toBe(50)
    expect(hc.delta).toBeNull()
    expect(
      m.scorecard.rows.every((r) => r.voluntary === null && r.firstYear === null && r.netChange === null),
    ).toBe(true)
    expect(byId(m, 'hrbp-first-year')).toBeUndefined()
  })

  it('says so in the talking points instead of reporting 0%', () => {
    const text = talkingPoints(run(active))
    expect(text).not.toMatch(/0\.0%/)
    expect(text).toContain('the Employees upload has no leavers')
    expect(text).toContain('Headcount is 50 employees.')
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

  it('judges a department on the rest when most of its leavers sit in the flagged location', () => {
    const people = [
      ...many(100, { location: 'San Jose', department: 'Firmware' }),
      ...many(20, { location: 'San Jose', department: 'Physical Design' }),
      ...many(30, { location: 'Bengaluru', department: 'Physical Design' }),
      ...many(20, { location: 'Bengaluru', department: 'Firmware' }),
      ...Array.from({ length: 6 }, (_, i) =>
        leaver(`2026-0${i + 1}-15`, 'Voluntary', { location: 'Bengaluru', department: 'Physical Design' }),
      ),
    ]
    const m = run(people)
    expect(byId(m, 'hrbp-voluntary-location')?.title).toMatch(/^Voluntary attrition in Bengaluru/)
    // Every Physical Design leaver is in Bengaluru: outside it the department is at 0%, so no second finding.
    expect(byId(m, 'hrbp-voluntary-department')).toBeUndefined()

    const spread = [
      ...people,
      ...Array.from({ length: 4 }, (_, i) =>
        leaver(`2026-0${i + 2}-20`, 'Voluntary', { location: 'San Jose', department: 'Physical Design' }),
      ),
    ]
    const f = byId(run(spread), 'hrbp-voluntary-department')!
    expect(f.title).toMatch(/^Voluntary attrition in Physical Design/)
    expect(f.detail).toMatch(/Outside Bengaluru it is \d+\.\d%, \d+\.\d pts above the company\./)
  })

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
    expect(half.title).toBe("3 of H's 6 direct reports were hired in the last 6 months")
    const two = byId(run([...team('H', 3, 6), ...team('J', 4, 5)]), 'hrbp-new-hire-concentration')!
    expect(two.detail).toBe("New hires since 1 Apr 2026: J's team 4 of 5 and H's team 3 of 6.")
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

  it('finds no growth without leavers in the upload (past headcount would count survivors only)', () => {
    const people = [
      ...many(6, { department: 'Firmware' }),
      ...many(4, { department: 'Firmware', hireDate: '2026-06-01' }),
    ]
    expect(byId(run(people), 'hrbp-rapid-growth')).toBeUndefined()
  })

  it('counts people who have since moved out when a department filter is on (true headcount then)', () => {
    const people = [
      ...many(6, { department: 'Firmware' }),
      // In Firmware on 31 Mar 2026, now in Software: the filtered roster no longer holds them.
      emp({ employeeId: 'OUT', department: 'Software' }),
      ...many(3, { department: 'Firmware', hireDate: '2026-06-01' }),
      ...many(10, { department: 'Software' }),
    ]
    const jobChanges = [
      change({
        employeeId: 'OUT',
        effectiveDate: '2026-06-01',
        changeType: 'Transfer',
        fromDepartment: 'Firmware',
        toDepartment: 'Software',
      }),
    ]
    const company = departmentGrowth(prepOf({ employees: people, jobChanges })).find(
      (x) => x.dept === 'Firmware',
    )!
    const filtered = departmentGrowth(
      prepOf({ employees: people, jobChanges }, { department: ['Firmware'] }),
    ).find((x) => x.dept === 'Firmware')!
    expect(company).toMatchObject({ before: 7, now: 9 })
    expect(filtered).toMatchObject({ before: 7, now: 9 })
  })

  it('fires at 35% growth on a base of 5 or more, following transfers in', () => {
    const people = [
      ...many(6, { department: 'Firmware' }),
      emp({ employeeId: 'MOVER', department: 'Firmware' }),
      ...many(2, { department: 'Firmware', hireDate: '2026-06-01' }),
      // One leaver elsewhere: without any termination date, past headcount is not trusted.
      leaver('2025-02-03', 'Voluntary', { department: 'Software' }),
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
