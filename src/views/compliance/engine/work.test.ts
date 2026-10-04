import { describe, expect, it } from 'vitest'
import { metricsWith } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { M } from '../metrics'
import { buildBase } from './base'
import { emp, fixtureContext, rtw } from './testkit'
import { computeWork, expiryRow } from './work'

// As of Wed 30 Sep 2026; window 1 Oct 2025 to 30 Sep 2026; headline to 29 Dec, horizon to 29 Mar 2027.
const A = emp({ name: 'A', businessUnit: 'Operations' })
const B = emp({ name: 'B' })
const C = emp({ name: 'C' })
const D = emp({ name: 'D' })
const E = emp({ name: 'E' })
const F = emp({ name: 'F' })
const G = emp({ name: 'G', terminationDate: '2026-06-30', terminationType: 'Voluntary' })
const H = emp({ name: 'H' })
const I = emp({ name: 'I' })
const J = emp({ name: 'J' })
const K = emp({ name: 'K', hireDate: '2026-10-12' })
const visa = 'Employer-sponsored visa' as const

const rows = [
  rtw(A, { authorizationType: visa, expiryDate: '2026-11-15' }),
  rtw(B, { authorizationType: visa, expiryDate: '2026-12-20', reverificationStartedDate: '2026-09-25' }),
  rtw(C, { authorizationType: visa, expiryDate: '2026-12-01', reverificationStartedDate: '2026-08-01' }),
  rtw(D, { authorizationType: visa, expiryDate: '2027-02-15' }),
  rtw(E, { authorizationType: visa, expiryDate: '2027-03-20', reverificationStartedDate: '2026-09-01' }),
  rtw(F, { authorizationType: 'Student work authorization', expiryDate: '2027-05-01' }),
  rtw(G, { authorizationType: visa, expiryDate: '2026-11-10' }),
  rtw(H, { authorizationType: 'Work permit', expiryDate: '2026-09-15' }),
  rtw(I, {
    authorizationType: 'Work permit',
    expiryDate: '2026-03-01',
    reverificationStartedDate: '2025-11-01',
  }),
  rtw(J),
  rtw(K, { authorizationType: visa, expiryDate: '2026-11-01' }),
]
const employees = [A, B, C, D, E, F, G, H, I, J, K]

function work(metrics?: MetricsApi) {
  const ctx = fixtureContext({ employees, rightToWork: rows }, { metrics })
  return computeWork(buildBase(ctx), ctx.window)
}
const names = (xs: readonly { e: { name: string } }[]) => xs.map((x) => x.e.name)

describe('expiring authorizations', () => {
  it('counts active people ending after the as-of date, within 90 and 180 days, soonest first', () => {
    const w = work()
    expect(names(w.expiringHeadline)).toEqual(['A', 'C', 'B'])
    expect(names(w.expiringHorizon)).toEqual(['A', 'C', 'B', 'D', 'E'])
    // Leavers, pre-hires, later expiries and permanent authorization never count.
    expect(names(w.expiringHorizon)).not.toContain('G')
    expect(names(w.expiringHorizon)).not.toContain('K')
    expect(w.activeCount).toBe(9)
  })

  it('lists active people whose authorization already ended', () => {
    expect(names(work().expired)).toEqual(['H'])
  })

  it('follows the headline and planning windows set in the dictionary', () => {
    const w = work(metricsWith({ [M.expiring]: { headlineDays: 60, horizonDays: 90 } }))
    expect(names(w.expiringHeadline)).toEqual(['A'])
    expect(names(w.expiringHorizon)).toEqual(['A', 'C', 'B'])
    expect(w.months).toEqual(['2026-10', '2026-11', '2026-12'])
  })
})

describe('reverification', () => {
  it('judges each authorization by when reverification started, against the 90-day lead time', () => {
    const asOf = '2026-09-30'
    const status = (e: typeof A) =>
      expiryRow({ e, r: rows.find((r) => r.employeeId === e.employeeId)! }, asOf, 90)?.status
    expect(status(A)).toBe('Not started')
    expect(status(B)).toBe('Started late')
    expect(status(C)).toBe('On time')
    expect(status(D)).toBe('Not due yet')
    expect(status(E)).toBe('On time')
    expect(status(H)).toBe('Expired')
    expect(status(J)).toBeUndefined()
  })

  it('rates authorizations ended in the period or ending in the window, once judged', () => {
    const w = work()
    // I ended in the period (on time); H ended without one; D is not due yet.
    expect(names(w.reverification.judged).sort()).toEqual(['A', 'B', 'C', 'E', 'H', 'I'])
    expect(names(w.reverification.onTime).sort()).toEqual(['C', 'E', 'I'])
    expect(w.reverification.rate).toBe(0.5)
    expect(names(w.overdue)).toEqual(['A'])
    expect(names(w.startedLate)).toEqual(['B'])
  })

  it('hides the rate under the anonymity minimum', () => {
    const ctx = fixtureContext({ employees, rightToWork: rows.slice(0, 3) })
    const w = computeWork(buildBase(ctx), ctx.window)
    expect(w.reverification.judged).toHaveLength(3)
    expect(w.reverification.rate).toBeNull()
  })

  it('reads the lead time from the dictionary', () => {
    const w = work(metricsWith({ [M.reverificationOnTime]: { leadDays: 60 } }))
    // B started 86 days ahead: on time against 60.
    expect(names(w.startedLate)).toEqual([])
    expect(names(w.reverification.onTime).sort()).toEqual(['B', 'C', 'E', 'I'])
    expect(names(w.overdue)).toEqual(['A'])
  })

  it('groups the judged authorizations by the quarter they end in', () => {
    const q = work().byQuarter
    expect(q.map((r) => [r.quarter, r.judged, r.onTime])).toEqual([
      ['2026 Q1', 1, 1],
      ['2026 Q3', 1, 0],
      ['2026 Q4', 3, 1],
      ['2027 Q1', 1, 1],
    ])
    expect(q.every((r) => r.rate === null)).toBe(true)
  })
})

describe('expiries by month', () => {
  it('splits the planning window by month and business unit, largest unit first', () => {
    const w = work()
    expect(w.months).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'])
    expect(w.units).toEqual(['Silicon Engineering', 'Operations'])
    expect(w.byMonth.map((r) => [r.month, r.businessUnit, r.people])).toEqual([
      ['2026-11', 'Operations', 1],
      ['2026-12', 'Silicon Engineering', 2],
      ['2027-02', 'Silicon Engineering', 1],
      ['2027-03', 'Silicon Engineering', 1],
    ])
  })
})

describe('authorization mix', () => {
  it('counts categories in aggregate, folding small ones into a hidden Other', () => {
    const mix = work().mix
    expect(mix.map((r) => [r.type, r.people])).toEqual([
      ['Employer-sponsored visa', 5],
      ['Other (3)', null],
    ])
    expect(mix[0].share).toBeCloseTo(5 / 9)
    expect(mix[1].share).toBeNull()
  })

  it('counts employees only, like every headcount', () => {
    const X = emp({ name: 'X', employmentType: 'Contractor' })
    const Y = emp({ name: 'Y', employmentType: 'Intern' })
    const ctx = fixtureContext({
      employees: [...employees, X, Y],
      rightToWork: [...rows, rtw(X, { authorizationType: visa }), rtw(Y, { authorizationType: visa })],
    })
    const w = computeWork(buildBase(ctx), ctx.window)
    expect(w.mix.map((r) => [r.type, r.people])).toEqual([
      ['Employer-sponsored visa', 5],
      ['Other (3)', null],
    ])
    expect(w.activeCount).toBe(9)
  })
})

describe('missing data', () => {
  it('has no right to work: nothing counts and the flags say so', () => {
    const ctx = fixtureContext({ employees })
    const base = buildBase(ctx)
    expect(base.has.rightToWork).toBe(false)
    const w = computeWork(base, ctx.window)
    expect(w.expiringHeadline).toEqual([])
    expect(w.reverification.rate).toBeNull()
  })

  it('leaves out rows whose employee is not in the roster', () => {
    const ctx = fixtureContext({
      employees: [A],
      rightToWork: [rows[0], { employeeId: 'NOPE', expiryDate: '2026-10-10' }],
    })
    const base = buildBase(ctx)
    expect(base.notInRoster.map((r) => r.employeeId)).toEqual(['NOPE'])
    expect(names(computeWork(base, ctx.window).expiringHorizon)).toEqual(['A'])
  })
})
