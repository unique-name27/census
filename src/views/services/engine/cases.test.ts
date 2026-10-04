import { describe, expect, it } from 'vitest'
import {
  ageBucket,
  agedCases,
  agedPrivate,
  arrivals,
  backlogByAge,
  byCategory,
  csat,
  isFirstContact,
  medianHours,
  openedByMonth,
  reopenRow,
  resolutionSla,
  teamWorkload,
  timeToResolve,
} from './cases'
import { caseColumns, caseFacts } from './facts'
import { kase, win } from './testkit'

const AS_OF = '2026-09-30'
const W = win('2026-09-01', '2026-09-30')
const facts = (rows: ReturnType<typeof kase>[]) => caseFacts(rows, AS_OF, caseColumns(rows))
const times = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i))

describe('service levels', () => {
  it('rates over judged cases only and hides groups under 5', () => {
    const four = facts(times(4, () => kase()))
    expect(resolutionSla(four)).toEqual({ rate: null, hits: 4, n: 4, people: 4 })
    const six = facts([
      ...times(5, () => kase()),
      kase({ openedAt: '2026-09-01T09:00', resolvedAt: '2026-09-05T09:00' }),
      kase({ openedAt: '2026-09-30T20:00', resolvedAt: null, status: 'New', firstResponseAt: null }),
    ])
    expect(resolutionSla(six)).toEqual({ rate: 5 / 6, hits: 5, n: 6, people: 6 })
  })

  it('hides rates, medians and means behind fewer than 5 requesters, however many cases', () => {
    // Nine cases from four people (e.g. a level filter on the executives).
    const nine = facts(times(9, (i) => kase({ requesterId: `P${i % 4}`, csat: 4 })))
    expect(resolutionSla(nine)).toMatchObject({ rate: null, n: 9, people: 4 })
    expect(medianHours(nine).hours).toBeNull()
    expect(csat(nine).mean).toBeNull()
    const five = facts(times(9, (i) => kase({ requesterId: `P${i % 5}`, csat: 4 })))
    expect(resolutionSla(five).rate).toBe(1)
    expect(csat(five).mean).toBe(4)
  })
})

describe('durations and satisfaction', () => {
  it('takes the median of resolved cases and suppresses below 5', () => {
    const rows = facts(
      times(5, (i) => kase({ openedAt: '2026-09-01T00:00', resolvedAt: `2026-09-01T0${i + 1}:00` })),
    )
    expect(medianHours(rows)).toEqual({ hours: 3, n: 5 })
    expect(medianHours(rows.slice(0, 4)).hours).toBeNull()
  })

  it('averages satisfaction with n and hides it below 5 responses', () => {
    const rows = facts([...times(4, () => kase({ csat: 5 })), kase({ csat: 2 }), kase({ csat: null })])
    expect(csat(rows)).toEqual({ mean: 4.4, n: 5 })
    expect(csat(rows.slice(0, 4)).mean).toBeNull()
  })

  it('counts first-contact resolution only for resolved Tier 0/1 cases without reopen or escalation', () => {
    const [a, b, c, d] = facts([
      kase({ tier: 'Tier 0' }),
      kase({ tier: 'Tier 2' }),
      kase({ reopened: true }),
      kase({ resolvedAt: null, status: 'In progress' }),
    ])
    expect([a, b, c, d].map(isFirstContact)).toEqual([true, false, false, false])
  })
})

describe('backlog', () => {
  it('buckets open cases by age and status', () => {
    expect([0, 2, 3, 7, 8, 14, 15, 30, 31].map(ageBucket)).toEqual([
      '0-2 d',
      '0-2 d',
      '3-7 d',
      '3-7 d',
      '8-14 d',
      '8-14 d',
      '15-30 d',
      '15-30 d',
      '30+ d',
    ])
    const rows = facts([
      kase({ openedAt: '2026-09-29T09:00', resolvedAt: null, status: 'In progress' }),
      kase({ openedAt: '2026-08-01T09:00', resolvedAt: null, status: 'Waiting on third party' }),
      kase(),
    ])
    const backlog = backlogByAge(rows)
    const total = backlog.reduce((a, r) => a + r.cases, 0)
    expect(total).toBe(2)
    expect(backlog.find((r) => r.age === '30+ d' && r.status === 'Waiting on third party')?.cases).toBe(1)
    const aged = agedCases(rows, 14)
    expect(aged).toHaveLength(1)
    expect(aged[0].ageDays).toBe(60)
    expect(aged[0].daysPastTarget).toBe(58)
  })

  it('never lists employee relations cases row by row, only counts them', () => {
    const rows = facts([
      kase({ openedAt: '2026-08-01T09:00', resolvedAt: null, status: 'In progress' }),
      ...times(2, () =>
        kase({
          category: 'Employee relations',
          openedAt: '2026-07-01T09:00',
          resolvedAt: null,
          status: 'In progress',
          assignee: 'Investigator',
        }),
      ),
    ])
    expect(agedCases(rows, 14).map((r) => r.category)).toEqual(['Payroll'])
    expect(agedPrivate(rows, 14)).toEqual([{ category: 'Employee relations', cases: 2, oldestDays: null }])
  })
})

describe('breakdowns', () => {
  it('folds categories behind fewer than 5 people into Other', () => {
    const rows = facts([
      ...times(6, () => kase({ category: 'Payroll' })),
      ...times(2, () => kase({ category: 'Employee relations', team: 'Employee relations' })),
      ...times(2, () => kase({ category: 'Onboarding' })),
      // Seven immigration cases, all from two people: still folded.
      ...times(7, (i) => kase({ category: 'Immigration & mobility', requesterId: `I${i % 2}` })),
    ])
    const out = byCategory(rows, W)
    expect(out.map((r) => r.category)).toEqual(['Payroll', 'Other (3)'])
    expect(out[1].cases).toBe(11)
    expect(out[1].people).toBe(6)
    expect(out[1].slaRate).toBe(1)
    expect(out[0].share).toBeCloseTo(6 / 17)
  })

  it('splits volume into the top categories and Other per month', () => {
    const rows = facts([
      kase({ category: 'A', openedAt: '2026-08-03T09:00' }),
      ...times(5, () => kase({ category: 'A', openedAt: '2026-09-03T09:00' })),
      ...times(5, () => kase({ category: 'B', openedAt: '2026-09-03T09:00' })),
      kase({ category: 'C', openedAt: '2026-09-03T09:00' }),
    ])
    const { rows: out, series } = openedByMonth(rows, ['2026-08', '2026-09'], 1)
    expect(series).toEqual(['A', 'Other'])
    expect(out).toContainEqual({ month: '2026-09', category: 'Other', cases: 6 })
    expect(out).toContainEqual({ month: '2026-08', category: 'Other', cases: 0 })
  })

  it('gives no category its own monthly series behind fewer than 5 people', () => {
    const rows = facts([
      ...times(8, (i) => kase({ category: 'A', requesterId: `P${i % 3}` })),
      kase({ category: 'B', requesterId: 'P9' }),
    ])
    const { rows: out, series } = openedByMonth(rows, ['2026-09'])
    expect(series).toEqual(['All categories'])
    expect(out).toEqual([{ month: '2026-09', category: 'All categories', cases: 9 }])
  })

  it('computes reopen over resolved cases and escalation over all cases', () => {
    const rows = facts([
      ...times(4, () => kase({ reopened: false, escalated: false })),
      kase({ reopened: true, escalated: true }),
      kase({ resolvedAt: null, status: 'In progress', reopened: false, escalated: true }),
    ])
    const r = reopenRow('Payroll', rows)
    expect(r.resolved).toBe(5)
    expect(r.reopenRate).toBeCloseTo(0.2)
    expect(r.escalateRate).toBeCloseTo(2 / 6)
    // Below 5 people the counts go with the rates: "1 of 3 reopened" would give the rate away.
    const few = reopenRow('Payroll', rows.slice(3))
    expect(few).toMatchObject({ resolved: 2, reopened: null, reopenRate: null, escalated: null })
  })

  it('leaves first-contact resolution null when tiers are unknown', () => {
    const rows = facts(times(6, () => kase({ tier: null })))
    expect(teamWorkload(rows, W, false)[0].firstContact).toBeNull()
    expect(teamWorkload(rows, W, true)[0].firstContact).toBe(0)
  })
})

describe('time to resolve', () => {
  it('puts every category on one axis as a share of its own target', () => {
    const rows = facts([
      // Payroll: 24 h against 48 h, so half the target.
      ...times(5, () => kase({ openedAt: '2026-09-01T09:00', resolvedAt: '2026-09-02T09:00' })),
      // Employee relations: 15 days against 30 days, also half.
      ...times(5, () =>
        kase({
          category: 'Employee relations',
          resolutionTargetHours: 720,
          openedAt: '2026-09-01T09:00',
          resolvedAt: '2026-09-16T09:00',
        }),
      ),
      // Three leave cases are too few to show.
      ...times(3, () => kase({ category: 'Leave & accommodation', resolutionTargetHours: 168 })),
    ])
    const out = timeToResolve(rows, W)
    expect(out.map((r) => r.category).sort()).toEqual(['Employee relations', 'Payroll'])
    const er = out.find((r) => r.category === 'Employee relations')!
    expect(er.median).toBe(15)
    expect(er.medianShare).toBeCloseTo(0.5)
    expect(er.targetShare).toBe(1)
    expect(out.find((r) => r.category === 'Payroll')!.medianShare).toBeCloseTo(0.5)
  })
})

describe('arrivals', () => {
  it('trims the grid to the hours in use and to weekdays when nothing arrives at weekends', () => {
    const rows = facts([kase({ openedAt: '2026-09-01T09:15' }), kase({ openedAt: '2026-09-02T11:40' })])
    const out = arrivals(rows, W)
    expect(new Set(out.map((r) => r.hour))).toEqual(new Set(['09', '10', '11']))
    expect(new Set(out.map((r) => r.weekday)).size).toBe(5)
    expect(out.find((r) => r.weekday === 'Tue' && r.hour === '09')?.cases).toBe(1)
    expect(arrivals(facts([kase({ openedAt: '2026-09-01' })]), W)).toEqual([])
  })
})
