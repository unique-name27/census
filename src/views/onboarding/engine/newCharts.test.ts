/**
 * The Onboarding figures added in the design refresh (docs/CHARTS.md, Onboarding): the countdown
 * to day one, late day-one tasks by task and region, when day-one tasks were finished, and starts
 * against plan by unit and month. Numbers recount from the raw rows, each mark opens exactly what
 * it counts, small groups stay hidden, Manager mode never shows a contingency outcome, and "Filter
 * to" reproduces the number clicked.
 */
import { describe, expect, it } from 'vitest'
import { can } from '@/access/policy'
import type { Employee, OnboardingTask } from '@/data/schema'
import { resolveDrill } from '@/drill/Drill'
import { applyDrillFilter, expectFilterTo } from '@/drill/testing'
import { addDays, daysBetween, monthKey } from '@/lib/dates'
import { lateCellDrill, planMonthCellDrill } from '../ui/drill'
import { onboardingBase } from './base'
import { countdownDrill, lateTasksDrill, MASKED_NOTE, timingBinDrill } from './drills'
import { computeFirst90, lateByTaskAndPlace, lateTaskNames, taskTiming } from './first90'
import { computeOnboardingUncached } from './index'
import { ACTUAL, PLAN, STARTERS, TASKS, union } from './lineage'
import { byUnitMonth } from './plan'
import { AS_OF, cand, emp, fixtureContext, line, req, sampleContext, task } from './testkit'
import { computeUpcoming, countdownGrid, countdownRows, NOTHING_OPEN, readinessWords } from './upcoming'

const lateUses = union(STARTERS, TASKS)

describe('countdown to day one', () => {
  // Pre-hires starting 5, 12 and 20 Oct, and one on 20 Nov (past the 30-day look-ahead).
  const employees = [
    emp('P1', { hireDate: '2026-10-05' }),
    emp('P2', { hireDate: '2026-10-12' }),
    emp('P3', { hireDate: '2026-10-20' }),
    emp('P4', { hireDate: '2026-11-20' }),
  ]
  const tasks: OnboardingTask[] = [
    task({ employeeId: 'P1', task: 'Background check cleared', status: 'Blocked', dueDate: '2026-10-02' }),
    task({ employeeId: 'P1', task: 'Laptop shipped', status: 'Done', completedDate: '2026-09-20' }),
    task({ employeeId: 'P2', task: 'Laptop shipped', status: 'In progress', dueDate: '2026-10-09' }),
    task({ employeeId: 'P3', task: 'Laptop shipped', status: 'Done', completedDate: '2026-09-28' }),
    task({ employeeId: 'P4', task: 'Laptop shipped', status: 'Not started' }),
  ]
  const ctx = fixtureContext({ employees, onboardingTasks: tasks })
  const b = onboardingBase(ctx)
  const u = computeUpcoming(b, ctx)

  it('places each start in the next 30 days on the owner of its blocking item', () => {
    const rows = countdownRows(u.rows, 30)
    expect(rows.map((r) => [r.key, r.daysToGo, r.owner, r.blocking, r.status])).toEqual([
      ['P1', 5, 'People ops', 'Background check cleared', 'On track'],
      ['P2', 12, 'IT', 'Laptop shipped', 'On track'],
      ['P3', 20, NOTHING_OPEN, null, 'Ready'],
    ])
    expect(rows[0].label).toBe('Person P1, On track')
  })

  it('in Manager mode words a contingency as the team holding it, in the row and the drill', () => {
    const rows = countdownRows(u.rows, 30, true)
    expect(rows[0].blocking).toBe('With People ops')
    const spec = countdownDrill(b, rows[0].row.readiness, rows[0].name, { masked: true })
    expect(spec?.rows).toHaveLength(2)
    const states = spec!.rows.map((t) => spec!.extra!.values(t).state)
    expect(states).toContain('With People ops')
    expect(states).not.toContain('Blocked')
    // HR sees where it stands.
    const hr = countdownDrill(b, rows[0].row.readiness, rows[0].name)
    expect(hr!.rows.map((t) => hr!.extra!.values(t).state)).toContain('Blocked')
    expect(spec?.note).toContain(MASKED_NOTE)
    expect(hr?.note).not.toContain(MASKED_NOTE)
  })

  it('in Manager mode a cleared or unneeded contingency shows only who handled it, with no date', () => {
    const done = fixtureContext({
      employees: [emp('Q1', { hireDate: '2026-10-05' })],
      onboardingTasks: [
        task({
          employeeId: 'Q1',
          task: 'Background check cleared',
          status: 'Done',
          completedDate: '2026-09-25',
        }),
        task({ employeeId: 'Q1', task: 'Export-control screening', status: 'Not needed' }),
        task({ employeeId: 'Q1', task: 'Laptop shipped', status: 'Done', completedDate: '2026-09-20' }),
      ],
    })
    const bq = onboardingBase(done)
    const r = computeUpcoming(bq, done).rows[0].readiness
    const spec = countdownDrill(bq, r, 'Q1', { masked: true })!
    const byTask = new Map(spec.rows.map((t) => [t.task, spec.extra!.values(t)]))
    expect(byTask.get('Background check cleared')).toMatchObject({
      state: 'Handled by People ops',
      completedDate: null,
      daysLate: null,
    })
    expect(byTask.get('Export-control screening')?.state).toBe('Handled by Trade compliance')
    // Other tasks keep their state and dates.
    expect(byTask.get('Laptop shipped')?.state).toBe('Done')
    expect(byTask.get('Laptop shipped')?.completedDate).toBeUndefined()
    // HR mode shows Done and Not needed as they are.
    const hr = countdownDrill(bq, r, 'Q1')!
    expect(hr.rows.map((t) => hr.extra!.values(t).state)).toEqual(
      expect.arrayContaining(['Done', 'Not needed']),
    )
  })

  it('a dot opens exactly that start’s day-one tasks', () => {
    for (const r of countdownRows(u.rows, 30))
      expect(countdownDrill(b, r.row.readiness, r.name)?.rows.length, r.key).toBe(r.row.readiness.total)
  })

  it('as a grid: a cell per holder and start week, every week kept, counts that add up', () => {
    const rows = countdownRows(u.rows, 30)
    const owners = ['People ops', 'IT', 'Facilities', NOTHING_OPEN]
    const grid = countdownGrid(rows, AS_OF, 30, owners)
    // Holders in the given order, only those holding a start; every week from the as-of date to 30 days out.
    expect([...new Set(grid.map((c) => c.owner))]).toEqual(['People ops', 'IT', NOTHING_OPEN])
    const weeks = [...new Set(grid.map((c) => c.week))]
    expect(weeks[0]).toBe('2026-10-05')
    for (let i = 1; i < weeks.length; i++) expect(daysBetween(weeks[i - 1], weeks[i])).toBe(7)
    expect(grid).toHaveLength(3 * weeks.length)
    expect(grid.reduce((n, c) => n + c.starts, 0)).toBe(rows.length)
    const it5 = grid.find((c) => c.owner === 'People ops' && c.week === '2026-10-05')!
    expect(it5).toMatchObject({ starts: 1, weekLabel: '5 Oct', readiness: '1 on track' })
    expect(it5.rows.map((r) => r.key)).toEqual(['P1'])
    expect(grid.find((c) => c.owner === 'IT' && c.week === '2026-10-05')?.starts).toBe(0)
    expect(readinessWords([{ status: 'Not ready' }, { status: 'On track' }, { status: 'Not ready' }])).toBe(
      '2 not ready · 1 on track',
    )
    expect(countdownGrid([], AS_OF, 30, owners)).toEqual([])
  })

  it('on the sample: starts on one Monday are one cell, counted, never piled up', () => {
    const ctx = sampleContext()
    const m = computeOnboardingUncached(ctx)
    const horizon = m.base.settings.readinessHorizonDays
    const rows = countdownRows(m.upcoming.rows, horizon)
    const grid = countdownGrid(rows, ctx.asOf, horizon, [NOTHING_OPEN])
    expect(grid.reduce((n, c) => n + c.starts, 0)).toBe(rows.length)
    for (const c of grid) {
      expect(new Set(c.rows.map((r) => r.owner)).size, `${c.owner} ${c.week}`).toBeLessThanOrEqual(1)
      expect(c.atRisk).toBe(c.rows.filter((r) => r.status === 'Not ready' || r.status === 'Behind').length)
    }
  })

  it('on the sample: every start within the look-ahead is a dot, blocked by an owner or nothing', () => {
    const ctx = sampleContext()
    const m = computeOnboardingUncached(ctx)
    const horizon = m.base.settings.readinessHorizonDays
    const rows = countdownRows(m.upcoming.rows, horizon)
    const raw = m.base.upcoming.starts.filter((s) => daysBetween(ctx.asOf, s.startDate) <= horizon)
    expect(rows).toHaveLength(raw.length)
    for (const r of rows) {
      const open = r.row.readiness.tasks.filter((t) => t.open)
      expect(r.owner === NOTHING_OPEN, r.key).toBe(open.length === 0)
      if (open.length)
        expect(
          open.map((t) => t.owner),
          r.key,
        ).toContain(r.owner)
    }
    // Story 5: three starts on 5 Oct are held by People ops on the background check.
    const held = rows.filter((r) => r.startDate === '2026-10-05' && r.blocking === 'Background check cleared')
    expect(held.length).toBe(3)
    expect(held.every((r) => r.owner === 'People ops')).toBe(true)
  })
})

describe('late day-one tasks by task and region', () => {
  // Six Bengaluru starts (laptops late for three) and two in Munich (too few to show).
  const employees: Employee[] = [
    ...['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((id) =>
      emp(id, { location: 'Bengaluru', country: 'India', hireDate: '2026-09-07' }),
    ),
    ...['M1x', 'M2x'].map((id) =>
      emp(id, { location: 'Munich', country: 'Germany', hireDate: '2026-09-07' }),
    ),
  ]
  const tasks: OnboardingTask[] = employees.map((e, i) =>
    task({
      employeeId: e.employeeId,
      task: 'Laptop shipped',
      dueDate: '2026-09-04',
      completedDate: i < 3 ? '2026-09-10' : '2026-09-01',
      status: 'Done',
    }),
  )
  const ctx = fixtureContext({ employees, onboardingTasks: tasks })
  const b = onboardingBase(ctx)
  const f = computeFirst90(b, ctx)

  it('shares late per task and region, hiding a region under the anonymity minimum', () => {
    const cells = lateByTaskAndPlace(f.readinessTasks, 'region', 5)
    const apac = cells.find((c) => c.place === 'APAC')!
    expect([apac.n, apac.late, apac.share]).toEqual([6, 3, 0.5])
    const emea = cells.find((c) => c.place === 'EMEA')!
    expect([emea.n, emea.late, emea.share, emea.items]).toEqual([2, null, null, []])
    expect(lateTasksDrill(b, emea)).toBeNull()
    expect(lateTasksDrill(b, apac)?.rows.length).toBe(3)
  })

  it('a region cell offers "Filter to" its sites, named as the region', () => {
    const cells = lateByTaskAndPlace(f.readinessTasks, 'region', 5)
    const apac = cells.find((c) => c.place === 'APAC')!
    const spec = resolveDrill(lateCellDrill(b, 'region', lateUses)(apac))
    expect(spec?.filter?.location).toEqual(['Bengaluru'])
    expect(spec?.filterLabel).toBe('APAC')
  })

  it('on the sample: cells recount from the raw tasks, and laptops were late for 51 of 124 in APAC', () => {
    const ctx = sampleContext()
    const m = computeOnboardingUncached(ctx)
    const min = m.base.settings.minGroup
    const cells = lateByTaskAndPlace(m.first90.readinessTasks, 'region', min)
    for (const c of cells) {
      const raw = m.first90.readinessTasks.filter(
        (x) =>
          x.task.name === c.task &&
          (x.start.region ?? 'Unknown') === c.place &&
          x.task.state !== 'Not needed',
      )
      const late = raw.filter((x) => x.task.state === 'Done late' || x.task.state === 'Overdue')
      expect(c.n, `${c.task} ${c.place}`).toBe(raw.length)
      expect(c.late, `${c.task} ${c.place}`).toBe(raw.length >= min ? late.length : null)
      if (c.late) expect(lateTasksDrill(m.base, c)?.rows.length).toBe(c.late)
    }
    const laptop = cells.find((c) => c.task === 'Laptop shipped' && c.place === 'APAC')!
    expect([laptop.late, laptop.n]).toEqual([51, 124])
    expect(lateTaskNames(m.first90.readinessTasks)[0]).toBe('Laptop shipped')
  })

  it('Filter to a region keeps the share', () => {
    expectFilterTo(sampleContext(), {
      name: 'late day-one tasks by region',
      rows: (c) => lateByTaskAndPlace(computeOnboardingUncached(c).first90.readinessTasks, 'region', 5),
      key: (c) => `${c.task}|${c.place}`,
      value: (c) => c.share,
      drill: (c, ctx) => lateCellDrill(onboardingBase(ctx), 'region', lateUses)(c),
      kind: 'rate',
    })
  })
})

describe('when day-one tasks were finished', () => {
  // Six starts on 7 Sep; laptops due 4 Sep, finished from 6 days before to 4 days after the start.
  const ids = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']
  const employees = ids.map((id) => emp(id, { hireDate: '2026-09-07' }))
  const done = ['2026-09-01', '2026-09-03', '2026-09-06', '2026-09-08', '2026-09-11', null]
  const tasks = ids.map((id, i) =>
    task({
      employeeId: id,
      task: 'Laptop shipped',
      dueDate: '2026-09-04',
      completedDate: done[i],
      status: done[i] ? 'Done' : 'In progress',
    }),
  )
  const ctx = fixtureContext({ employees, onboardingTasks: tasks })
  const b = onboardingBase(ctx)
  const f = computeFirst90(b, ctx)

  it('measures days from the start, counts open tasks apart, and hides under the minimum', () => {
    const t = taskTiming(f.readinessTasks, 'Laptop shipped', 5)
    expect(t.shown).toBe(true)
    expect(t.dueDay).toBe(-3)
    expect(t.done.map((d) => d.days)).toEqual([-6, -4, -1, 1, 4])
    expect(t.open).toHaveLength(1)
    expect(t.late).toBe(3)
    expect(t.lateAfterStart).toBe(2)
    const hidden = taskTiming(f.readinessTasks, 'Laptop shipped', 7)
    expect([hidden.shown, hidden.done.length, hidden.open.length]).toEqual([false, 0, 0])
  })

  it('a bin opens exactly its tasks with their days from the start', () => {
    const t = taskTiming(f.readinessTasks, 'Laptop shipped', 5)
    const bin = t.done.filter((d) => d.days >= -6 && d.days < -3)
    const spec = timingBinDrill(b, 'Laptop shipped', bin, -6, -3)
    expect(spec?.rows.length).toBe(2)
    expect(spec!.rows.map((r) => spec!.extra!.values(r).daysFromStart)).toEqual([-6, -4])
    expect(spec?.title).toBe('Laptop shipped, finished 6 d before to 4 d before')
  })

  it('on the sample: the timings recount from the completed dates', () => {
    const m = computeOnboardingUncached(sampleContext())
    const t = taskTiming(m.first90.readinessTasks, 'Laptop shipped', m.base.settings.minGroup)
    expect(t.shown).toBe(true)
    for (const d of t.done)
      expect(d.days).toBe(daysBetween(d.item.start.startDate, d.item.task.task.completedDate!))
    expect(t.done.length + t.open.length).toBeLessThanOrEqual(t.n)
    expect(t.lateAfterStart).toBeGreaterThan(0)
  })
})

describe('starts against plan by unit and month', () => {
  const employees = [
    emp('S1', { hireDate: '2026-07-06' }),
    emp('S2', { hireDate: '2026-07-20' }),
    emp('S3', { hireDate: '2026-08-03', businessUnit: 'Go-to-Market', department: 'Sales' }),
    emp('C1', { hireDate: '2026-07-06', employmentType: 'Contractor' }),
  ]
  const hiringPlan = [
    line({ period: '2026-07-01', plannedHires: 3 }),
    line({ period: '2026-08-01', plannedHires: 1 }),
    line({ period: '2026-08-01', businessUnit: 'Go-to-Market', department: 'Sales', plannedHires: 2 }),
    line({ period: '2026-12-01', plannedHires: 4 }),
  ]
  const ctx = fixtureContext({
    employees,
    hiringPlan,
    requisitions: [req('R1')],
    candidates: [cand('A1', 'R1')],
  })
  const m = computeOnboardingUncached(ctx)

  it('counts actual minus planned starts per unit and month, to the as-of month', () => {
    const g = byUnitMonth(m.plan!, AS_OF)
    expect(g.cut).toBe('businessUnit')
    expect(g.units).toEqual(['Silicon Engineering', 'Go-to-Market'])
    expect(g.months).toEqual(['2026-07', '2026-08', '2026-09'])
    const at = (unit: string, month: string) => g.cells.find((c) => c.unit === unit && c.month === month)!
    expect([
      at('Silicon Engineering', '2026-07').actual,
      at('Silicon Engineering', '2026-07').planned,
    ]).toEqual([2, 3])
    expect(at('Silicon Engineering', '2026-07').gap).toBe(-1)
    expect(at('Go-to-Market', '2026-08').gap).toBe(-1)
    expect(at('Go-to-Market', '2026-09').gap).toBe(0)
    expect(g.cells).toHaveLength(6)
  })

  it('a cell opens the people who started there, or its plan lines when nobody did', () => {
    const p = m.plan!
    const g = byUnitMonth(p, AS_OF)
    const drill = planMonthCellDrill(m.base, p, g.cut, { actual: ACTUAL, plan: PLAN })
    const july = resolveDrill(
      drill(g.cells.find((c) => c.unit === 'Silicon Engineering' && c.month === '2026-07')!),
    )
    expect(july?.rows.length).toBe(2)
    expect(july?.filter?.businessUnit).toEqual(['Silicon Engineering'])
    const aug = resolveDrill(drill(g.cells.find((c) => c.unit === 'Go-to-Market' && c.month === '2026-08')!))
    expect(aug?.rows.length).toBe(1)
    const empty = resolveDrill(
      drill(g.cells.find((c) => c.unit === 'Silicon Engineering' && c.month === '2026-08')!),
    )
    expect(empty?.kind).toBe('hiringPlan')
    expect(empty?.rows.length).toBe(1)
  })

  it('cuts by department inside one business unit', () => {
    const one = computeOnboardingUncached(
      fixtureContext({ employees, hiringPlan }, { filters: { businessUnit: ['Silicon Engineering'] } }),
    )
    expect(byUnitMonth(one.plan!, AS_OF).cut).toBe('department')
  })

  it('on the sample: cells recount from the raw rows and Filter to a unit keeps its month', () => {
    const ctx = sampleContext()
    const m = computeOnboardingUncached(ctx)
    const p = m.plan!
    const g = byUnitMonth(p, ctx.asOf)
    const lines = p.lines
    for (const c of g.cells) {
      const planned = lines
        .filter((l) => (l.businessUnit || 'Unknown') === c.unit && monthKey(l.period) === c.month)
        .reduce((n, l) => n + l.plannedHires, 0)
      const actual = ctx.data.employees.filter(
        (e) =>
          e.employmentType === 'Employee' &&
          (e.businessUnit || 'Unknown') === c.unit &&
          monthKey(e.hireDate) === c.month &&
          e.hireDate >= p.start &&
          e.hireDate <= p.toDate,
      ).length
      expect([c.planned, c.actual], `${c.unit} ${c.month}`).toEqual([planned, actual])
    }
    const drill = planMonthCellDrill(m.base, p, g.cut, { actual: ACTUAL, plan: PLAN })
    const pick = g.cells.filter((c) => c.actual > 0 && c.unit !== 'Unknown').slice(-3)
    expect(pick.length).toBeGreaterThan(0)
    for (const c of pick) {
      const spec = resolveDrill(drill(c))
      expect(spec?.rows.length).toBe(c.actual)
      const after = computeOnboardingUncached(applyDrillFilter(ctx, spec!.filter!))
      const ag = byUnitMonth(after.plan!, ctx.asOf)
      const gap = ag.cells.filter((x) => x.month === c.month).reduce((n, x) => n + x.gap, 0)
      expect(gap, `${c.unit} ${c.month}`).toBe(c.gap)
    }
  })
})

describe('the window', () => {
  it('starts in the look-ahead only', () => {
    const ctx = fixtureContext({ employees: [emp('Z', { hireDate: addDays(AS_OF, 45) })] })
    const b = onboardingBase(ctx)
    expect(countdownRows(computeUpcoming(b, ctx).rows, 30)).toEqual([])
  })
})

describe('modes', () => {
  it('shows the countdown in every mode; the late-task figures and the plan grid in HR and Developer only', () => {
    const figures: [string, string, boolean][] = [
      ['onboarding-countdown', 'upcoming', true],
      ['onboarding-late-tasks-by-region', 'first90', false],
      ['onboarding-task-timing', 'first90', false],
      ['onboarding-plan-gap-by-month', 'plan', false],
    ]
    for (const [id, tab, manager] of figures) {
      const at = { view: 'onboarding', tab }
      expect(can('hr', `figure:${id}`, at), id).toBe(true)
      expect(can('developer', `figure:${id}`, at), id).toBe(true)
      expect(can('manager', `figure:${id}`, at), id).toBe(manager)
    }
  })
})
