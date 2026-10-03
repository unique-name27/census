import { describe, expect, it } from 'vitest'
import { computeBase } from './base'
import { AS_OF, cand, ctxOf, req } from './fixtures'
import { recruitingKpis } from './kpis'
import { EMPTY_FUNNEL_DAYS, filledIn, medianTtf, openByDepartment, recruiterLoad, ttfBy } from './reqs'

describe('open requisitions and health', () => {
  const ctx = ctxOf({
    requisitions: [
      req('REQ-EMPTY', { openedDate: '2026-06-01', priority: 'Critical' }),
      req('REQ-NEW', { openedDate: '2026-09-15' }),
      req('REQ-OK', { openedDate: '2026-06-01' }),
      req('REQ-HOLD', { status: 'On hold', openedDate: '2026-01-01' }),
    ],
    candidates: [
      cand('REQ-EMPTY', { currentStage: 'Screen', screenDate: '2026-06-10', appliedDate: '2026-06-05' }),
      cand('REQ-OK', {
        currentStage: 'Hiring manager',
        status: 'Rejected',
        hmDate: '2026-07-01',
        rejectedDate: '2026-07-10',
        appliedDate: '2026-06-05',
      }),
      cand('REQ-OK', { appliedDate: '2026-06-02' }),
    ],
  })
  const b = computeBase(ctx)

  it('marks an empty funnel only after 30 days with nobody ever past the screen', () => {
    expect(EMPTY_FUNNEL_DAYS).toBe(30)
    expect(b.req.emptyFunnel.map((r) => r.reqId)).toEqual(['REQ-EMPTY'])
    const ok = b.req.rows.find((r) => r.reqId === 'REQ-OK')!
    expect(ok.health).toBe('1 lacks a next step')
    expect(ok.severity).toBe('warning')
    expect(b.req.rows.find((r) => r.reqId === 'REQ-NEW')!.health).toBe('On track')
  })

  it('sorts critical first and keeps on-hold reqs out of the open list', () => {
    expect(b.req.rows[0].reqId).toBe('REQ-EMPTY')
    expect(b.req.open).toHaveLength(3)
    expect(b.req.onHold).toHaveLength(1)
  })

  it('counts open reqs per department with the oldest age', () => {
    expect(openByDepartment(b.req.open, AS_OF)).toEqual([
      { department: 'Design Verification', open: 3, oldest: 121, medianAge: 121 },
    ])
  })
})

describe('time to fill', () => {
  const filled = ['2026-01-11', '2026-01-21', '2026-01-31', '2026-02-10', '2026-02-20', '2026-03-02'].map(
    (filledDate, i) =>
      req(`REQ-F${i}`, {
        status: 'Filled',
        openedDate: '2026-01-01',
        filledDate,
        level: i < 5 ? 'L3' : 'L6',
      }),
  )

  it('uses reqs filled in the window and leaves cancelled ones out', () => {
    const w = { start: '2026-01-01', end: '2026-12-31' }
    const cancelled = req('REQ-C', {
      status: 'Cancelled',
      openedDate: '2026-01-01',
      filledDate: '2026-03-01',
    })
    expect(filledIn([...filled, cancelled], w)).toHaveLength(6)
  })

  it('shows no median for a group under 5 reqs', () => {
    const rows = ttfBy(filled, (r) => r.level, ['L3', 'L6'])
    expect(rows[0]).toMatchObject({ group: 'L3', reqs: 5, days: 30 })
    expect(rows[1]).toMatchObject({ group: 'L6', reqs: 1, days: null })
    expect(medianTtf([])).toBeNull()
  })

  it('reads null, not 0, when the filled date column is missing', () => {
    const ctx = ctxOf({ requisitions: [req('REQ-1', { status: 'Filled', openedDate: '2026-01-01' })] })
    const ttf = recruitingKpis(computeBase(ctx)).find((k) => k.id === 'time-to-fill')!
    expect(ttf.value).toBeNull()
    expect(ttf.note).toBe('Filled date is missing from Requisitions')
  })
})

describe('recruiter load', () => {
  it('flags a recruiter whose median wait is above 1.5× the team median', () => {
    const ctx = ctxOf({
      requisitions: [
        req('REQ-A', { recruiter: 'Ana' }),
        req('REQ-B', { recruiter: 'Ben' }),
        req('REQ-C', { recruiter: 'Cy' }),
      ],
      candidates: [
        cand('REQ-A', { recruiter: 'Ana', appliedDate: '2026-09-25' }),
        cand('REQ-B', { recruiter: 'Ben', appliedDate: '2026-09-24' }),
        cand('REQ-C', { recruiter: 'Cy', appliedDate: '2026-07-01' }),
      ],
    })
    const b = computeBase(ctx)
    const { rows, teamMedianWait } = recruiterLoad(b.req.open, b.actives, b.apps, b.window)
    expect(teamMedianWait).toBe(6)
    expect(rows.find((r) => r.recruiter === 'Cy')!.flagged).toBe(true)
    expect(rows.find((r) => r.recruiter === 'Ana')!.flagged).toBe(false)
  })
})
