import { describe, expect, it } from 'vitest'
import { computeBase } from './base'
import { AS_OF, cand, ctxOf, req } from './fixtures'
import { recruitingKpis } from './kpis'
import { prepareApps, reqIndex } from './prepare'
import {
  acceptance,
  acceptanceBy,
  acceptanceByQuarter,
  declineReasons,
  exitReasons,
  quarterWindows,
  resolvedOffers,
  sourceRows,
} from './sources'

const R = reqIndex([req('REQ-1', { location: 'Bengaluru' }), req('REQ-2', { location: 'Austin' })])
const hired = (reqId: string, date: string) =>
  cand(reqId, {
    currentStage: 'Hired',
    status: 'Hired',
    offerDate: date,
    hiredDate: date,
    appliedDate: '2026-05-01',
  })
const declined = (reqId: string, date: string, reason = 'Accepted competing offer') =>
  cand(reqId, {
    currentStage: 'Offer',
    status: 'Declined',
    offerDate: date,
    rejectedDate: date,
    rejectionReason: reason,
    appliedDate: '2026-05-01',
  })

describe('offer acceptance', () => {
  const apps = prepareApps(
    [
      ...['2026-07-10', '2026-07-11', '2026-07-12'].map((d) => hired('REQ-2', d)),
      ...['2026-07-15', '2026-08-01'].map((d) => declined('REQ-1', d)),
      hired('REQ-1', '2026-08-02'),
      declined('REQ-1', '2026-09-01', 'Compensation below expectations'),
    ],
    R,
    AS_OF,
  )

  it('is hired ÷ (hired + declined) by resolution date, null with no offers', () => {
    const offers = resolvedOffers(apps, { start: '2026-07-01', end: '2026-09-30' })
    expect(acceptance(offers)).toEqual({ rate: 4 / 7, hired: 4, declined: 3 })
    expect(acceptance([]).rate).toBeNull()
  })

  it('hides groups and quarters with fewer than 5 resolved offers', () => {
    const offers = resolvedOffers(apps, { start: '2026-07-01', end: '2026-09-30' })
    const by = acceptanceBy(offers, (a) => a.location)
    expect(by.find((g) => g.group === 'Bengaluru')).toMatchObject({ offers: 4, rate: null, hired: 1 })
    const q = acceptanceByQuarter(apps, AS_OF, 2)
    expect(q.map((x) => x.label)).toEqual(['Q2 2026', 'Q3 2026'])
    expect(q[1]).toMatchObject({ offers: 7, end: '2026-09-30' })
    expect(q[1].rate).toBeCloseTo(4 / 7)
    expect(q[0].rate).toBeNull()
  })

  it('counts decline reasons', () => {
    const offers = resolvedOffers(apps, { start: '2026-07-01', end: '2026-09-30' })
    expect(declineReasons(offers).map((r) => [r.reason, r.candidates])).toEqual([
      ['Accepted competing offer', 2],
      ['Compensation below expectations', 1],
    ])
  })

  it('quarter windows end at the window end for the quarter in progress', () => {
    expect(quarterWindows('2026-08-15', 2)).toEqual([
      { key: '2026 Q2', start: '2026-04-01', end: '2026-06-30' },
      { key: '2026 Q3', start: '2026-07-01', end: '2026-08-15' },
    ])
  })

  it('KPI is null with a note when the data has no Declined status at all', () => {
    const ctx = ctxOf({ requisitions: [req('REQ-1')], candidates: [hired('REQ-1', '2026-08-01')] })
    const k = recruitingKpis(computeBase(ctx)).find((x) => x.id === 'offer-acceptance')!
    expect(k.value).toBeNull()
    expect(k.note).toMatch(/No declined offers/)
  })
})

describe('sources and exits', () => {
  it('computes share, hire rate and change; hides rates under 5 applications', () => {
    const cur = prepareApps(
      [
        ...Array.from({ length: 4 }, () => cand('REQ-1', { source: 'Referral' })),
        hired('REQ-1', '2026-09-01'),
        cand('REQ-1', { source: 'Agency' }),
      ].map((c, i) => (i === 4 ? { ...c, source: 'Referral' } : c)),
      R,
      AS_OF,
    )
    const prior = prepareApps([cand('REQ-1', { source: 'Referral', appliedDate: '2025-05-01' })], R, AS_OF)
    const rows = sourceRows(cur, prior)
    const referral = rows.find((r) => r.source === 'Referral')!
    expect(referral).toMatchObject({
      applications: 5,
      hires: 1,
      hireRate: 0.2,
      priorApplications: 1,
      change: 4,
    })
    expect(referral.share).toBeCloseTo(5 / 6)
    expect(rows.find((r) => r.source === 'Agency')!.hireRate).toBeNull()
  })

  it('folds rare exit reasons into Other reasons, by the stage people left from', () => {
    const exits = prepareApps(
      [
        ...Array.from({ length: 3 }, () =>
          cand('REQ-1', {
            status: 'Rejected',
            rejectedDate: '2026-09-01',
            rejectionReason: 'Skills mismatch',
          }),
        ),
        cand('REQ-1', {
          status: 'Withdrawn',
          currentStage: 'Screen',
          screenDate: '2026-09-02',
          rejectedDate: '2026-09-05',
          rejectionReason: 'Unresponsive',
        }),
        cand('REQ-1', { status: 'Rejected', rejectedDate: '2026-09-01', rejectionReason: 'Rare reason' }),
        cand('REQ-1', { status: 'Rejected', rejectedDate: '2026-09-02', rejectionReason: 'Rarer reason' }),
      ],
      R,
      AS_OF,
    )
    const rows = exitReasons(exits, { start: '2025-10-01', end: '2026-09-30' }, 1)
    expect(rows).toContainEqual({
      outcome: 'Rejected',
      reason: 'Skills mismatch',
      stage: 'Applied',
      candidates: 3,
    })
    expect(rows).toContainEqual({
      outcome: 'Rejected',
      reason: 'Other reasons',
      stage: 'Applied',
      candidates: 2,
    })
    expect(rows).toContainEqual({
      outcome: 'Withdrawn',
      reason: 'Unresponsive',
      stage: 'Screen',
      candidates: 1,
    })
  })
})
