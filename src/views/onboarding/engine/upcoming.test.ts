/**
 * Upcoming starts on hand-built rows: windows, Day -3 tasks, open contingencies in business days,
 * the start calendar, offer accepted to start and the renege rate.
 */
import { describe, expect, it } from 'vitest'
import { metricsWith } from '@/metrics/testing'
import { M } from '../metrics'
import { onboardingBase } from './base'
import { cand, emp, fixtureContext, req, task } from './testkit'
import { computeUpcoming, renegeCount, weekOf } from './upcoming'

const upcoming = (ctx: ReturnType<typeof fixtureContext>) => computeUpcoming(onboardingBase(ctx), ctx)

describe('weeks', () => {
  it('start on Monday', () => {
    expect(weekOf('2026-10-01')).toBe('2026-09-28')
    expect(weekOf('2026-10-05')).toBe('2026-10-05')
    expect(weekOf('2026-10-11')).toBe('2026-10-05')
  })
})

describe('upcoming starts', () => {
  const employees = [
    emp('E1', { hireDate: '2026-10-05' }),
    emp('E2', { hireDate: '2026-10-12', businessUnit: 'Operations' }),
    emp('E3', { hireDate: '2026-11-16' }),
    emp('E4', { hireDate: '2027-02-01' }),
  ]
  const onboardingTasks = [
    task({
      employeeId: 'E1',
      task: 'Background check cleared',
      dueDate: '2026-10-02',
      status: 'In progress',
    }),
    task({
      employeeId: 'E1',
      task: 'Laptop shipped',
      dueDate: '2026-10-02',
      status: 'Done',
      completedDate: '2026-09-28',
    }),
    task({ employeeId: 'E2', task: 'Export-control screening', dueDate: '2026-10-09', status: 'Blocked' }),
    task({ employeeId: 'E2', task: 'Badge ready', dueDate: '2026-10-10' }),
    task({ employeeId: 'E3', task: 'Background check cleared', dueDate: '2026-11-13' }),
  ]

  it('counts starts in the next 30, 60 and 90 days', () => {
    const u = upcoming(fixtureContext({ employees, onboardingTasks }))
    expect([u.in30.length, u.in60.length, u.in90.length]).toEqual([2, 3, 3])
  })

  it('lists starts in the look-ahead with a task due by day -3 still open', () => {
    const u = upcoming(fixtureContext({ employees, onboardingTasks }))
    expect(u.dayMinus3.map((x) => [x.start.key, x.tasks.map((t) => t.name)])).toEqual([
      ['E1', ['Background check cleared']],
      ['E2', ['Export-control screening']],
    ])
  })

  it('finds open contingencies in the next business days, a setting', () => {
    const u = upcoming(fixtureContext({ employees, onboardingTasks }))
    expect(u.contingencyEnd).toBe('2026-10-14')
    expect(u.contingencies.map((x) => x.start.key)).toEqual(['E1', 'E2'])
    const short = fixtureContext(
      { employees, onboardingTasks },
      { metrics: metricsWith({ [M.contingencies]: { businessDays: 2 } }) },
    )
    expect(upcoming(short).contingencies.map((x) => x.start.key)).toEqual([])
  })

  it('places starts on the calendar by week and business unit', () => {
    const u = upcoming(fixtureContext({ employees, onboardingTasks }))
    expect(u.weeks[0]).toBe('2026-09-28')
    expect(u.weeks).toHaveLength(13)
    expect(u.calendar.map((r) => [r.week, r.businessUnit, r.starts])).toEqual([
      ['2026-10-05', 'Silicon Engineering', 1],
      ['2026-10-12', 'Operations', 1],
      ['2026-11-16', 'Silicon Engineering', 1],
    ])
    expect(u.beyondCalendar).toBe(1)
  })

  it('shares each day-one task done so far for starts in the look-ahead, by task and owner', () => {
    const u = upcoming(fixtureContext({ employees, onboardingTasks }))
    const laptop = u.byTask.find((r) => r.task === 'Laptop shipped')
    expect([laptop?.starts, laptop?.done, laptop?.share]).toEqual([1, 1, 1])
    const people = u.byOwner.find((r) => r.owner === 'People ops')
    expect([people?.tasks, people?.open]).toEqual([1, 1])
  })
})

describe('offers', () => {
  const requisitions = [req('R1', { location: 'Bengaluru' }), req('R2', { location: 'Austin' })]
  const offer = (id: string, reqId: string, hired: string, start: string, x = {}) =>
    cand(id, reqId, { hiredDate: hired, startDate: start, ...x })
  const candidates = [
    ...[1, 2, 3, 4, 5].map((i) => offer(`B${i}`, 'R1', '2026-03-02', `2026-05-${String(10 + i)}`)),
    offer('B6', 'R1', '2026-04-01', '2026-07-01', { status: 'Withdrawn', rejectedDate: '2026-06-01' }),
    ...[1, 2, 3, 4, 5].map((i) => offer(`A${i}`, 'R2', '2026-03-02', `2026-03-${String(20 + i)}`)),
    offer('A6', 'R2', '2026-03-02', '2026-03-03', { source: 'Internal' }),
  ]

  it('takes the median days from offer accepted to start, by location, without internal moves', () => {
    const u = upcoming(fixtureContext({ requisitions, candidates }))
    expect(u.acceptToStart.offers).toHaveLength(10)
    expect(u.acceptToStart.byLocation.map((r) => [r.location, r.days])).toEqual([
      ['Bengaluru', 72],
      ['Austin', 21],
    ])
  })

  it('counts accepted offers later withdrawn as reneges, with the tracked country on its own', () => {
    const u = upcoming(fixtureContext({ requisitions, candidates }))
    expect(u.renege.reneged.map((c) => c.applicationId)).toEqual(['B6'])
    expect(u.renege.rate).toBeCloseTo(1 / 12)
    expect(u.renege.tracked).toMatchObject({ country: 'India', rate: 1 / 6 })
    const us = fixtureContext(
      { requisitions, candidates },
      { metrics: metricsWith({ [M.renege]: { trackedCountry: 'United States' } }) },
    )
    expect(upcoming(us).renege.tracked).toMatchObject({ country: 'United States', rate: 0 })
  })

  it('judges offers by the accept date in the window', () => {
    expect(renegeCount(candidates, { start: '2026-04-01', end: '2026-04-30' }).accepted).toHaveLength(1)
  })
})
