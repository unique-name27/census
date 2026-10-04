/**
 * The hiring plan and the forecast on hand-built rows: versions, coverage of plan lines, status
 * bands, the coming quarter, open reqs outside the plan, cumulative lines, and the forecast from
 * Recruiting's pass rates and time to fill.
 */
import { describe, expect, it } from 'vitest'
import { metricsWith } from '@/metrics/testing'
import { M } from '../metrics'
import { onboardingBase } from './base'
import { chanceFrom, computeForecast, daysFrom } from './forecast'
import { comingQuarter, computePlan, coverageOf, cumulative, linesOf, planVersions, statusOf } from './plan'
import { cand, emp, fixtureContext, line, req } from './testkit'

describe('plan versions', () => {
  it('reads the latest version, in natural order', () => {
    const lines = [
      line({ planVersion: 'FY27 v2' }),
      line({ planVersion: 'FY27 v10' }),
      line({ planVersion: null }),
    ]
    expect(planVersions(lines)).toEqual({ versions: ['FY27 v2', 'FY27 v10'], latest: 'FY27 v10' })
    expect(linesOf(lines, 'FY27 v10')).toHaveLength(1)
    expect(linesOf([line({ planVersion: null })], null)).toHaveLength(1)
  })
})

describe('coverage of plan lines', () => {
  it('lets accepted offers cover the earliest lines of a req, then follows the req status', () => {
    const reqs = new Map([
      ['R1', req('R1', { openings: 2 })],
      ['R2', req('R2', { status: 'On hold' })],
    ])
    const lines = [
      line({ period: '2026-11-01', reqId: 'R1' }),
      line({ period: '2026-10-01', reqId: 'R1' }),
      line({ reqId: 'R2' }),
      line({ reqId: 'R9' }),
      line({ reqId: null }),
    ]
    const out = coverageOf(lines, reqs, new Map([['R1', 1]]))
    expect(out.map((v) => v.coverage)).toEqual(['open', 'accepted', 'on-hold', 'no-req', 'no-req'])
  })
})

describe('status against plan', () => {
  it('is On plan within the band, else Behind or Ahead; none without a plan to date', () => {
    expect(statusOf(9, 10, 0.1)).toBe('On plan')
    expect(statusOf(8, 10, 0.1)).toBe('Behind')
    expect(statusOf(12, 10, 0.1)).toBe('Ahead')
    expect(statusOf(8, 10, 0.25)).toBe('On plan')
    expect(statusOf(3, 0, 0.1)).toBeNull()
  })

  it('names the coming quarter from the day after the as-of date', () => {
    expect(comingQuarter('2026-09-30')).toEqual({ label: 'Q4 2026', start: '2026-10-01', end: '2026-12-31' })
    expect(comingQuarter('2026-11-15')).toEqual({ label: 'Q4 2026', start: '2026-11-01', end: '2026-12-31' })
  })
})

describe('the plan model', () => {
  const data = {
    hiringPlan: [
      line({ period: '2026-04-01', plannedHires: 4, planVersion: 'FY27 v2' }),
      line({ period: '2026-07-01', plannedHires: 6, planVersion: 'FY27 v2' }),
      line({ period: '2026-10-01', reqId: 'R1', planVersion: 'FY27 v2' }),
      line({ period: '2026-11-01', reqId: 'R2', planVersion: 'FY27 v2' }),
      line({ period: '2026-12-01', planVersion: 'FY27 v2' }),
      line({ period: '2027-03-01', plannedHires: 2, planVersion: 'FY27 v2' }),
      line({ period: '2026-04-01', plannedHires: 99, planVersion: 'FY27 v1' }),
    ],
    requisitions: [
      req('R1'),
      req('R2', { status: 'On hold' }),
      req('R3'),
      req('R4', { reqType: 'Backfill' }),
      req('R5', { status: 'Filled', filledDate: '2026-08-01' }),
    ],
    candidates: [cand('A1', 'R5', { startDate: '2026-10-12' })],
    employees: [
      ...Array.from({ length: 4 }, (_, i) => emp(`E${i}`, { hireDate: '2026-05-04' })),
      ...Array.from({ length: 4 }, (_, i) => emp(`F${i}`, { hireDate: '2026-08-03' })),
      emp('C1', { hireDate: '2026-06-01', employmentType: 'Contractor' }),
    ],
  }

  it('compares starts to date with the plan to date, and splits the rest', () => {
    const ctx = fixtureContext(data)
    const p = computePlan(onboardingBase(ctx), ctx, null)!
    expect(p.version).toBe('FY27 v2')
    expect([p.start, p.end, p.toDate]).toEqual(['2026-04-01', '2027-03-31', '2026-09-30'])
    expect([p.planYtd, p.planFull, p.actual.length, p.committed.length]).toEqual([10, 15, 8, 1])
    expect(p.vsPlan).toBe(0.8)
    expect(p.status).toBe('Behind')
    const q = p.quarter.units[0]
    expect([q.planned, q.open, q.onHold, q.noReq, q.uncovered]).toEqual([3, 1, 1, 1, 2])
    expect(p.noReq.map((v) => v.coverage)).toEqual(['on-hold', 'no-req', 'no-req'])
    expect(p.notInPlan.added.map((r) => r.reqId)).toEqual(['R3'])
    expect(p.notInPlan.backfills.map((r) => r.reqId)).toEqual(['R4'])
    const unit = p.byUnit[0]
    expect([unit.planYtd, unit.actualYtd, unit.committed, unit.openReqs, unit.gap]).toEqual([10, 8, 1, 3, 6])
  })

  it('reads the on-plan band from the dictionary', () => {
    const ctx = fixtureContext(data, { metrics: metricsWith({ [M.vsPlan]: { onPlanBand: 0.25 } }) })
    expect(computePlan(onboardingBase(ctx), ctx, null)?.status).toBe('On plan')
  })

  it('builds cumulative lines: actual to the as-of month, then committed and forecast from it', () => {
    const ctx = fixtureContext(data)
    const p = computePlan(onboardingBase(ctx), ctx, null)!
    const rows = cumulative(p, '2026-09-30')
    const at = (series: string, month: string) =>
      rows.find((r) => r.series === series && r.month === month)?.starts
    expect(at('Plan', '2027-03')).toBe(15)
    expect(at('Actual', '2026-09')).toBe(8)
    expect(at('Actual', '2026-10')).toBeUndefined()
    expect(at('Committed', '2026-10')).toBe(9)
    expect(at('Forecast', '2027-03')).toBe(9)
  })

  it('is null without a plan', () => {
    const ctx = fixtureContext({ employees: data.employees })
    expect(computePlan(onboardingBase(ctx), ctx, null)).toBeNull()
  })
})

describe('the forecast', () => {
  it('multiplies pass rates from a stage and adds the median days left', () => {
    const pass = [0.5, 0.5, 0.5, 0.5, 0.8]
    expect(chanceFrom(4, pass)).toBe(0.8)
    expect(chanceFrom(3, pass)).toBe(0.4)
    expect(chanceFrom(0, [0.5, null, 1, 1, 1])).toBeNull()
    expect(daysFrom(3, [5, 5, 5, 10, 4])).toBe(14)
    expect(daysFrom(0, [5, null, 5, 10, 4])).toBe(24)
  })

  const forecastFor = (lead: boolean) => {
    // History: ten filled reqs and no cancellations, so the fill rate is 100%.
    const filled = Array.from({ length: 10 }, (_, i) =>
      req(`F${i}`, { status: 'Filled', openedDate: '2026-01-05', filledDate: '2026-03-06' }),
    )
    const history = filled.map((r, i) =>
      cand(`H${i}`, r.reqId, {
        appliedDate: '2026-01-10',
        hiredDate: '2026-03-06',
        startDate: '2026-04-06',
        screenDate: '2026-01-20',
        hmDate: '2026-01-30',
        onsiteDate: '2026-02-10',
        offerDate: '2026-03-01',
      }),
    )
    const ctx = fixtureContext({
      requisitions: [
        ...filled,
        req('O1', { openedDate: '2026-09-01' }),
        req('O2', { openedDate: '2026-09-01' }),
        req('O3', { status: 'On hold' }),
      ],
      candidates: [
        ...history,
        cand('X1', 'O2', { startDate: '2026-11-02' }),
        ...(lead
          ? [
              cand('L1', 'O1', {
                status: 'Active',
                currentStage: 'Offer',
                appliedDate: '2026-09-02',
                screenDate: '2026-09-05',
                hmDate: '2026-09-10',
                onsiteDate: '2026-09-15',
                offerDate: '2026-09-25',
                hiredDate: null,
                startDate: null,
              }),
            ]
          : []),
      ],
    })
    return computeForecast(onboardingBase(ctx), ctx)
  }

  it('counts each open req once, at most its uncovered openings', () => {
    const f = forecastFor(false)
    expect(f.fillRate).toBe(1)
    expect(f.ttf).toBe(60)
    expect(f.reqs.map((r) => r.req.reqId)).toEqual(['O1'])
    const o1 = f.reqs[0]
    expect(o1.expected).toBeCloseTo(1)
    // No pipeline: opened 1 Sep + 60 d is 31 Oct, but a full median cycle from today (10 + 10 +
    // 11 + 19 + 5 = 55 d) lands on 24 Nov; then 31 d from accepted to start.
    expect(f.stageDays).toEqual([10, 10, 11, 19, 5])
    expect(o1.parts).toEqual([{ weight: 1, start: '2026-12-25', basis: 'time to fill' }])
  })

  it('times a req with a candidate at the offer by the median days left from that stage', () => {
    const f = forecastFor(true)
    const o1 = f.reqs.find((r) => r.req.reqId === 'O1')!
    expect(o1.leadStage).toBe(4)
    expect(o1.pLead).toBe(1)
    // 5 d from offer to accepted, then 31 d to the start; nothing left for the time-to-fill part.
    expect(o1.parts).toEqual([{ weight: 1, start: '2026-11-05', basis: 'pipeline' }])
  })
})
