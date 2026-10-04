import { describe, expect, it } from 'vitest'
import { addDays } from '@/lib/dates'
import { computeRecruitingUncached } from '.'
import { computeBase } from './base'
import { allProblemFindings, MAX_FINDINGS, MIN_CRITICAL_TRANSITIONS, recruitingFindings } from './findings'
import { cand, ctxOf, req } from './fixtures'

describe('with no recruiting data', () => {
  it('has no findings and every KPI is null, not 0', () => {
    const m = computeRecruitingUncached(ctxOf({}))
    expect(m.findings).toEqual([])
    expect(m.kpis).toHaveLength(6)
    for (const k of m.kpis) expect(k.value).toBeNull()
    expect(m.kpis.find((k) => k.id === 'open-reqs')!.note).toBe('Upload Requisitions to see this')
    expect(m.kpis.find((k) => k.id === 'hires')!.note).toBe('Upload Candidates to see this')
  })
})

describe('bottleneck', () => {
  // Ten onsite-to-offer steps finished last quarter: five in Design Verification at 20 days, five elsewhere at 6.
  const reqs = [req('REQ-DV'), req('REQ-SW', { department: 'Software', hiringManager: 'Sam Lead' })]
  const step = (reqId: string, days: number, i: number) => {
    const offer = addDays('2026-08-01', i)
    return cand(reqId, {
      currentStage: 'Offer',
      appliedDate: '2026-06-01',
      onsiteDate: addDays(offer, -days),
      offerDate: offer,
    })
  }
  const candidates = [
    ...[0, 1, 2, 3, 4].map((i) => step('REQ-DV', 20, i)),
    ...[0, 1, 2, 3, 4].map((i) => step('REQ-SW', 6, i)),
    cand('REQ-DV', { currentStage: 'Onsite', onsiteDate: '2026-09-01', appliedDate: '2026-08-01' }),
  ]

  it('names the step and where it concentrates', () => {
    const all = allProblemFindings(computeBase(ctxOf({ requisitions: reqs, candidates })))
    const f = all.find((x) => x.id === 'rec-bottleneck')!
    expect(f.title).toBe(
      'Onsite to offer is the bottleneck in Design Verification: median 20 d vs 6 d elsewhere over the last 3 months.',
    )
    // 3.3× slower, but over only 5 transitions: a warning, not critical.
    expect(f.severity).toBe('warning')
    expect(f.action).toBe(
      'Resolve the onsite to offer bottleneck. Start with the Design Verification hiring managers.',
    )
    expect(f.filter).toEqual({ department: ['Design Verification'] })
    expect(f.detail).toContain('1 of the 1 active candidates at onsite is in Design Verification')
    expect(f.people).toHaveLength(1)
  })

  it('is critical only over at least 10 transitions in the segment', () => {
    const more = [
      ...Array.from({ length: MIN_CRITICAL_TRANSITIONS }, (_, i) => step('REQ-DV', 20, i)),
      ...[0, 1, 2, 3, 4].map((i) => step('REQ-SW', 6, i)),
    ]
    const all = allProblemFindings(computeBase(ctxOf({ requisitions: reqs, candidates: more })))
    expect(all.find((x) => x.id === 'rec-bottleneck')!.severity).toBe('critical')
  })

  it('stays quiet when the gap is under 5 days', () => {
    const near = [
      ...[0, 1, 2, 3, 4].map((i) => step('REQ-DV', 4, i)),
      ...[0, 1, 2, 3, 4].map((i) => step('REQ-SW', 1, i)),
    ]
    const all = allProblemFindings(computeBase(ctxOf({ requisitions: reqs, candidates: near })))
    expect(all.find((x) => x.id === 'rec-bottleneck')).toBeUndefined()
  })
})

describe('lacks a next step', () => {
  it('counts candidates without a timely step and sends decisions to the hiring manager', () => {
    const reqs = [req('REQ-1', { hiringManagerId: 'E77', hiringManager: 'Ji-woo Lim' })]
    const decisions = Array.from({ length: 6 }, () =>
      cand('REQ-1', { currentStage: 'Onsite', onsiteDate: '2026-09-10', nextEventDate: '2026-09-22' }),
    )
    const stale = cand('REQ-1', { appliedDate: '2026-08-01' })
    const fresh = cand('REQ-1', { appliedDate: '2026-09-29' })
    const all = allProblemFindings(
      computeBase(ctxOf({ requisitions: reqs, candidates: [...decisions, stale, fresh] })),
    )
    const f = all.find((x) => x.id === 'rec-lacking-next-step')!
    expect(f.title).toBe('7 candidates lack a next step, 6 of them waiting on an interview decision.')
    expect(f.detail).toContain('Ji-woo Lim has 6 of the 6 decisions.')
    expect(f.action).toBe(
      'Ask the panels to submit scorecards and make a decision this week, starting with Ji-woo Lim.',
    )
    expect(f.filter).toEqual({ leaderId: 'E77' })
    // Critical from 8 candidates or a quarter of the pipeline, whichever is larger.
    expect(f.severity).toBe('warning')
    expect(f.people).toHaveLength(7)
  })
})

describe('empty funnel', () => {
  it('flags open reqs past 30 days with nobody past the screen', () => {
    const reqs = [
      req('REQ-A', { department: 'Analog & Mixed-Signal', priority: 'Critical', openedDate: '2026-05-01' }),
      req('REQ-B', { department: 'Analog & Mixed-Signal', priority: 'Critical', openedDate: '2026-06-15' }),
      req('REQ-C', { openedDate: '2026-09-20' }),
    ]
    const candidates = [
      cand('REQ-A', { currentStage: 'Screen', screenDate: '2026-05-10', appliedDate: '2026-05-05' }),
    ]
    const f = allProblemFindings(computeBase(ctxOf({ requisitions: reqs, candidates }))).find(
      (x) => x.id === 'rec-empty-funnel',
    )!
    expect(f.title).toBe(
      '2 open critical Analog & Mixed-Signal reqs have nobody past the screen after 107 to 152 days.',
    )
    expect(f.filter).toEqual({ department: ['Analog & Mixed-Signal'] })
    expect(f.tab).toBe('requisitions')
  })
})

describe('readout', () => {
  it('keeps at most six findings, critical first', () => {
    const reqs = [req('REQ-1', { openedDate: '2026-01-01' })]
    const candidates = Array.from({ length: 12 }, () => cand('REQ-1', { appliedDate: '2026-07-01' }))
    const f = recruitingFindings(computeBase(ctxOf({ requisitions: reqs, candidates })))
    expect(f.length).toBeLessThanOrEqual(MAX_FINDINGS)
    const rank = { critical: 0, warning: 1, info: 2, good: 3 }
    expect(f.map((x) => rank[x.severity])).toEqual([...f.map((x) => rank[x.severity])].sort())
    for (const x of f) {
      expect(x.title).not.toMatch(/—|!|\b(chase|nag|push|ping|hound|unblock)\b/i)
      expect(x.title.endsWith('.')).toBe(true)
    }
  })
})
