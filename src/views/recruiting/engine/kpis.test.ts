import { describe, expect, it } from 'vitest'
import { computeBase } from './base'
import { cand, ctxOf, req } from './fixtures'
import { headline, recruitingKpis } from './kpis'

const kpi = (ctx: ReturnType<typeof ctxOf>, id: string) =>
  recruitingKpis(computeBase(ctx)).find((k) => k.id === id)!

describe('open reqs on the as-of date', () => {
  // Opened in January; one filled in August, one cancelled in July, one still open, one on hold.
  const reqs = [
    req('REQ-FILLED', { status: 'Filled', openedDate: '2026-01-10', filledDate: '2026-08-20' }),
    req('REQ-CANCELLED', { status: 'Cancelled', openedDate: '2026-01-10', closedDate: '2026-07-01' }),
    req('REQ-OPEN', { openedDate: '2026-01-10' }),
    req('REQ-LATER', { openedDate: '2026-05-01' }),
    req('REQ-HOLD', { status: 'On hold', openedDate: '2026-01-10' }),
  ]

  it('counts reqs open on a past as-of date, even if they have since been filled or cancelled', () => {
    const ctx = ctxOf({ requisitions: reqs }, { asOf: '2026-03-31' })
    const b = computeBase(ctx)
    expect(b.req.open.map((r) => r.reqId).sort()).toEqual(['REQ-CANCELLED', 'REQ-FILLED', 'REQ-OPEN'])
    const k = kpi(ctx, 'open-reqs')
    expect(k.value).toBe(3)
    // The tile, its sparkline and the folder headline agree.
    expect(k.spark!.at(-1)).toBe(3)
    expect(headline(ctx)).toMatchObject({ value: '3' })
    expect(b.req.rows.map((r) => r.daysOpen)).toEqual([80, 80, 80])
  })

  it('drops them once they are filled or cancelled', () => {
    const ctx = ctxOf({ requisitions: reqs })
    expect(kpi(ctx, 'open-reqs').value).toBe(2)
    expect(headline(ctx)).toMatchObject({ value: '2' })
  })
})

describe('anonymity floor on the KPI tiles', () => {
  const hire = (date: string) =>
    cand('REQ-1', {
      currentStage: 'Hired',
      status: 'Hired',
      appliedDate: '2026-06-01',
      offerDate: date,
      hiredDate: date,
    })
  const decline = (date: string) =>
    cand('REQ-1', {
      currentStage: 'Offer',
      status: 'Declined',
      appliedDate: '2026-06-01',
      offerDate: date,
      rejectedDate: date,
    })

  it('hides offer acceptance, time to hire and time to fill over 1 to 4 people', () => {
    const ctx = ctxOf({
      requisitions: [req('REQ-1', { status: 'Filled', openedDate: '2026-05-01', filledDate: '2026-08-01' })],
      candidates: [hire('2026-07-01'), hire('2026-07-02'), hire('2026-08-01'), decline('2026-08-03')],
    })
    for (const id of ['offer-acceptance', 'time-to-hire', 'time-to-fill']) {
      const k = kpi(ctx, id)
      expect(k.value, id).toBeNull()
      expect(k.suppressed, id).toBe(true)
      expect(k.delta ?? null, id).toBeNull()
    }
  })

  it('shows them from 5 people up', () => {
    const ctx = ctxOf({
      requisitions: [req('REQ-1')],
      candidates: [
        ...['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'].map(hire),
        decline('2026-08-03'),
      ],
    })
    const acc = kpi(ctx, 'offer-acceptance')
    expect(acc.value).toBeCloseTo(0.8)
    expect(acc.suppressed).toBe(false)
    expect(acc.note).toBe('4 of 5 offers accepted')
    expect(kpi(ctx, 'time-to-hire').suppressed).toBe(true)
  })

  it('reads null, not suppressed, when nobody is in the group at all', () => {
    const ctx = ctxOf({ requisitions: [req('REQ-1')], candidates: [cand('REQ-1')] })
    const k = kpi(ctx, 'time-to-hire')
    expect(k.value).toBeNull()
    expect(k.suppressed).toBe(false)
  })

  it('leaves the share out of the lacking note under 5 active candidates', () => {
    const ctx = ctxOf({
      requisitions: [req('REQ-1')],
      candidates: [
        cand('REQ-1', { appliedDate: '2026-07-01' }),
        cand('REQ-1', { appliedDate: '2026-07-02' }),
      ],
    })
    const k = kpi(ctx, 'lacking-next-step')
    expect(k.value).toBe(2)
    expect(k.note).toBe('2 active candidates (no next-event dates in the data)')
  })
})
