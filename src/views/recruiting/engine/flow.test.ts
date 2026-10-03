import { describe, expect, it } from 'vitest'
import { AS_OF, cand, req } from './fixtures'
import { cohort, flowMembers, speedByMonth, stageFlow, topReason, transitionsIn } from './flow'
import { prepareApps, reqIndex } from './prepare'

const reqs = reqIndex([req('REQ-1')])
const prep = (cs: ReturnType<typeof cand>[]) => prepareApps(cs, reqs, AS_OF)

describe('stageFlow', () => {
  const apps = prep([
    // Hired, with every stage dated.
    cand('REQ-1', {
      currentStage: 'Hired',
      status: 'Hired',
      appliedDate: '2026-07-01',
      screenDate: '2026-07-05',
      hmDate: '2026-07-12',
      onsiteDate: '2026-07-20',
      offerDate: '2026-07-28',
      hiredDate: '2026-08-01',
    }),
    // Skipped the hiring manager stage, then declined the offer.
    cand('REQ-1', {
      currentStage: 'Offer',
      status: 'Declined',
      appliedDate: '2026-07-02',
      screenDate: '2026-07-06',
      onsiteDate: '2026-07-20',
      offerDate: '2026-07-30',
      rejectedDate: '2026-08-04',
      rejectionReason: 'Accepted competing offer',
    }),
    // Rejected at screen, withdrawn at applied, still active at screen.
    cand('REQ-1', {
      currentStage: 'Screen',
      status: 'Rejected',
      appliedDate: '2026-07-03',
      screenDate: '2026-07-08',
      rejectedDate: '2026-07-15',
      rejectionReason: 'Skills mismatch',
    }),
    cand('REQ-1', { status: 'Withdrawn', appliedDate: '2026-07-04', rejectedDate: '2026-07-10' }),
    cand('REQ-1', { currentStage: 'Screen', appliedDate: '2026-09-01', screenDate: '2026-09-10' }),
  ])

  it('counts reached, advanced, exits and actives per stage', () => {
    const f = stageFlow(apps, [])
    const [applied, screen, hm, onsite, offer] = f.stages
    expect(applied).toMatchObject({ entered: 5, advanced: 4, withdrawn: 1, active: 0 })
    expect(screen).toMatchObject({ entered: 4, advanced: 2, rejected: 1, active: 1 })
    expect(hm.entered).toBe(2)
    expect(onsite.entered).toBe(2)
    expect(offer).toMatchObject({ entered: 2, advanced: 1, declined: 1 })
    expect(f.hired).toBe(1)
    expect(f.left).toEqual({ rejected: 1, withdrawn: 1, declined: 1 })
  })

  it('leaves still-active candidates out of the pass rate', () => {
    const screen = stageFlow(apps, []).stages[1]
    expect(screen.resolved).toBe(3)
    expect(screen.pass).toBeCloseTo(2 / 3)
  })

  it('measures transition days only where both dates exist, and gates the prior comparison at n ≥ 5', () => {
    const f = stageFlow(apps, apps)
    expect(f.stages[0].medianDays).toBe(4.5)
    expect(f.stages[0].nDays).toBe(4)
    expect(f.stages[0].deltaDays).toBeNull()
  })

  it('returns null rates for an empty cohort', () => {
    const f = stageFlow([], [])
    expect(f.stages.every((s) => s.pass === null && s.medianDays === null)).toBe(true)
    expect(f.total).toBe(0)
  })

  it('lists the applications behind each ribbon', () => {
    expect(flowMembers(apps, 'advanced', 0)).toHaveLength(4)
    expect(flowMembers(apps, 'declined', 4)).toHaveLength(1)
    expect(flowMembers(apps, 'active', 1)).toHaveLength(1)
    expect(flowMembers(apps, 'node', 5)).toHaveLength(1)
    expect(topReason(flowMembers(apps, 'rejected', 1))).toEqual({ reason: 'Skills mismatch', n: 1 })
  })
})

describe('windows', () => {
  it('selects the cohort and completed transitions by date', () => {
    const apps = prep([
      cand('REQ-1', { appliedDate: '2025-09-30' }),
      cand('REQ-1', {
        appliedDate: '2025-10-01',
        currentStage: 'Screen',
        screenDate: '2026-09-29',
      }),
    ])
    const w = { start: '2025-10-01', end: '2026-09-30' }
    expect(cohort(apps, w)).toHaveLength(1)
    expect(transitionsIn(apps, { start: '2026-09-01', end: '2026-09-30' })).toHaveLength(1)
  })

  it('blanks month cells with fewer than 5 transitions', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      cand('REQ-1', { appliedDate: '2026-09-01', currentStage: 'Screen', screenDate: `2026-09-0${2 + i}` }),
    )
    const cells = speedByMonth(
      prep([
        ...many,
        cand('REQ-1', { appliedDate: '2026-08-01', screenDate: '2026-08-03', currentStage: 'Screen' }),
      ]),
      AS_OF,
    )
    expect(cells).toHaveLength(60)
    const sep = cells.find((c) => c.month === '2026-09' && c.transition === 'Applied to screen')!
    expect(sep).toMatchObject({ days: 3, n: 5 })
    const aug = cells.find((c) => c.month === '2026-08' && c.transition === 'Applied to screen')!
    expect(aug).toMatchObject({ days: null, n: 1 })
  })
})
