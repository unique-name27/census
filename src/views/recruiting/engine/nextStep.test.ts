import { describe, expect, it } from 'vitest'
import { AS_OF, cand, req } from './fixtures'
import {
  activeItems,
  agingTier,
  breakdownParts,
  inQueue,
  nextStepState,
  ownerFor,
  stateLabel,
} from './nextStep'
import { coverage, isOpenAt, prepareApp, reqIndex, stageNorms } from './prepare'
import type { Norms } from './types'

const R = req('REQ-1')
const norms: Norms = { days: [4, 7, 8, 8, 4], samples: [10, 10, 10, 10, 10] }
const app = (patch: Parameters<typeof cand>[1]) => prepareApp(cand('REQ-1', patch), R, AS_OF)!

describe('prepareApp', () => {
  it('reaches a stage by its date or any later one, so skipped stages count as passed', () => {
    const a = app({ currentStage: 'Onsite', screenDate: '2026-09-05', onsiteDate: '2026-09-20' })
    expect(a.furthest).toBe(3)
    expect(a.dates[2]).toBeNull()
  })

  it('falls back to the current stage only when its date is missing', () => {
    const a = app({ currentStage: 'Hiring manager', screenDate: '2026-09-05' })
    expect(a.furthest).toBe(2)
    expect(a.enteredDate).toBe('2026-09-05')
  })

  it('treats exits after the as-of date as still active', () => {
    const a = prepareApp(
      cand('REQ-1', {
        currentStage: 'Offer',
        status: 'Hired',
        offerDate: '2026-09-20',
        hiredDate: '2026-10-05',
      }),
      R,
      AS_OF,
    )!
    expect(a.outcome).toBe('Active')
    expect(a.furthest).toBe(4)
    expect(a.exitDate).toBeNull()
  })

  it('drops applications made after the as-of date', () => {
    expect(prepareApp(cand('REQ-1', { appliedDate: '2026-10-01' }), R, AS_OF)).toBeNull()
  })

  it('joins org fields from the requisition and keeps nulls when the req is unknown', () => {
    expect(app({}).department).toBe('Design Verification')
    const orphan = prepareApp(cand('REQ-404'), null, AS_OF)!
    expect(orphan.department).toBeNull()
    expect(orphan.title).toBe('—')
  })
})

describe('nextStepState', () => {
  it('offer-out when at Offer with the offer date on or before the as-of date', () => {
    const a = app({ currentStage: 'Offer', offerDate: '2026-09-22', stageEnteredDate: '2026-09-22' })
    expect(nextStepState(a, 4, AS_OF)).toEqual({ state: 'offer-out', since: '2026-09-22' })
  })

  it('scheduled when the next event is after the as-of date, never alarmed when close', () => {
    const a = app({ currentStage: 'Onsite', onsiteDate: '2026-08-01', nextEventDate: '2026-10-03' })
    const s = nextStepState(a, 3, AS_OF)
    expect(s.state).toBe('scheduled')
    expect(agingTier(a, 3, s, AS_OF, norms)).toBeNull()
  })

  it('scheduled far out is amber only', () => {
    const a = app({ currentStage: 'Screen', screenDate: '2026-09-20', nextEventDate: '2026-11-30' })
    expect(agingTier(a, 1, nextStepState(a, 1, AS_OF), AS_OF, norms)).toBe('amber')
  })

  it('awaiting feedback when the event passed after the stage was entered', () => {
    const a = app({ currentStage: 'Onsite', onsiteDate: '2026-09-10', nextEventDate: '2026-09-26' })
    const s = nextStepState(a, 3, AS_OF)
    expect(s).toEqual({ state: 'awaiting-feedback', since: '2026-09-26' })
    expect(agingTier(a, 3, s, AS_OF, norms)).toBe('amber')
    const b = app({ currentStage: 'Onsite', onsiteDate: '2026-09-10', nextEventDate: '2026-09-23' })
    expect(agingTier(b, 3, nextStepState(b, 3, AS_OF), AS_OF, norms)).toBe('red')
    const c = app({ currentStage: 'Onsite', onsiteDate: '2026-09-10', nextEventDate: '2026-09-29' })
    expect(agingTier(c, 3, nextStepState(c, 3, AS_OF), AS_OF, norms)).toBeNull()
  })

  it('a past event before the stage was entered means nothing is pending', () => {
    const a = app({ currentStage: 'Onsite', onsiteDate: '2026-09-20', nextEventDate: '2026-09-10' })
    expect(nextStepState(a, 3, AS_OF).state).toBe('needs-step')
  })

  it('needs-step tiers at 1.5× and 2.5× the stage norm', () => {
    // Screen norm 7 d: amber past 10.5 d, red past 17.5 d.
    const ok = app({ currentStage: 'Screen', screenDate: '2026-09-20' })
    const amber = app({ currentStage: 'Screen', screenDate: '2026-09-18' })
    const red = app({ currentStage: 'Screen', screenDate: '2026-09-10' })
    const tier = (a: ReturnType<typeof app>) => agingTier(a, 1, nextStepState(a, 1, AS_OF), AS_OF, norms)
    expect(tier(ok)).toBeNull()
    expect(tier(amber)).toBe('amber')
    expect(tier(red)).toBe('red')
  })

  it('offer-out tiers at more than 5 and 10 days', () => {
    const tier = (offer: string) => {
      const a = app({ currentStage: 'Offer', offerDate: offer })
      return agingTier(a, 4, nextStepState(a, 4, AS_OF), AS_OF, norms)
    }
    expect(tier('2026-09-26')).toBeNull()
    expect(tier('2026-09-24')).toBe('amber')
    expect(tier('2026-09-19')).toBe('red')
  })
})

describe('labels and owners', () => {
  it('uses the user’s sub-state words', () => {
    expect(stateLabel(0, 'needs-step')).toBe('Needs review')
    expect(stateLabel(2, 'needs-step')).toBe('Needs scheduling')
    expect(stateLabel(4, 'needs-step')).toBe('Offer pending')
    expect(stateLabel(3, 'scheduled')).toBe('Onsite scheduled')
    expect(stateLabel(1, 'awaiting-feedback')).toBe('Needs decision')
    expect(stateLabel(4, 'offer-out')).toBe('Offer extended')
  })

  it('sends interview decisions to the hiring manager, recruiter as fallback', () => {
    const a = app({ currentStage: 'Onsite', coordinator: 'Cora Coordinator' })
    expect(ownerFor(a, 3, 'awaiting-feedback')).toEqual({ name: 'Hana Manager', role: 'Hiring manager' })
    const noHm = prepareApp(cand('REQ-2'), req('REQ-2', { hiringManager: null }), AS_OF)!
    expect(ownerFor(noHm, 3, 'awaiting-feedback')).toEqual({ name: 'Rita Recruiter', role: 'Recruiter' })
  })

  it('scheduling goes to the coordinator, applications and offers to the recruiter', () => {
    const a = app({ coordinator: 'Cora Coordinator' })
    expect(ownerFor(a, 2, 'needs-step').role).toBe('Coordinator')
    expect(ownerFor(a, 0, 'needs-step').role).toBe('Recruiter')
    expect(ownerFor(a, 4, 'offer-out').role).toBe('Recruiter')
    expect(ownerFor(app({}), 2, 'needs-step').role).toBe('Recruiter')
  })
})

describe('activeItems', () => {
  it('builds the state clock, queue membership and breakdown', () => {
    const apps = [
      app({ currentStage: 'Applied', appliedDate: '2026-09-01' }),
      app({ currentStage: 'Onsite', onsiteDate: '2026-09-10', nextEventDate: '2026-09-23' }),
      app({ currentStage: 'Screen', screenDate: '2026-09-25', nextEventDate: '2026-12-31' }),
      app({ currentStage: 'Offer', offerDate: '2026-09-18' }),
      app({ status: 'Rejected', rejectedDate: '2026-09-05' }),
    ]
    const items = activeItems(apps, AS_OF, norms)
    expect(items).toHaveLength(4)
    const decision = items.find((x) => x.state === 'awaiting-feedback')!
    expect(decision.days).toBe(7)
    expect(decision.owner).toBe('Hana Manager')
    const queue = items.filter(inQueue)
    expect(queue.map((x) => x.state).sort()).toEqual(['awaiting-feedback', 'needs-step', 'offer-out'])
    expect(breakdownParts(items.filter((x) => x.tier))).toEqual([
      '1 needs review',
      '1 needs a decision',
      '1 offer waits on an answer',
      '1 is scheduled far out',
    ])
  })
})

describe('norms, coverage and open reqs', () => {
  it('uses the historical median with at least 5 samples, else 14 days', () => {
    const apps = [1, 2, 3, 4, 5].map((d) =>
      app({ appliedDate: '2026-08-01', screenDate: `2026-08-0${1 + d}`, currentStage: 'Screen' }),
    )
    const n = stageNorms(apps)
    expect(n.days[0]).toBe(3)
    expect(n.days[1]).toBe(14)
  })

  it('reports missing optional columns', () => {
    const cov = coverage([cand('REQ-1')], [R])
    expect(cov).toMatchObject({ hasNextEvent: false, hasDeclined: false, hasFilledDate: false })
  })

  it('counts a req as open between opening and filling; on hold never counts', () => {
    const filled = req('REQ-9', { status: 'Filled', openedDate: '2026-01-01', filledDate: '2026-05-01' })
    expect(isOpenAt(filled, '2026-04-30')).toBe(true)
    expect(isOpenAt(filled, '2026-05-01')).toBe(false)
    expect(isOpenAt(req('REQ-8', { status: 'On hold' }), AS_OF)).toBe(false)
    expect(reqIndex([R]).get('REQ-1')).toBe(R)
  })
})
