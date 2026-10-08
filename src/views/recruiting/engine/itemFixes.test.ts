/**
 * Recruiting's item changes (docs/ROLES-V2.md 5.14; docs/ACTION-CENTER-AUDIT.md 4.2 and part 6):
 * no candidate item on a req that is on hold, cancelled, filled or closed; reqs past their
 * time-to-fill target; dates that keep their year; and every item's place.
 */
import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { DEFAULT_FILTERS } from '@/data/scope'
import { resolveDrill } from '@/drill/Drill'
import { metricsWithEdits } from '@/metrics/testing'
import type { ActionItem } from '../../types'
import { RM } from '../metrics'
import { recruitingActions } from './actions'
import { cand, ctxOf, req } from './fixtures'
import { computeRecruiting } from './index'

const byId = (items: readonly ActionItem[], id: string) => {
  const x = items.find((i) => i.id === id)
  if (!x) throw new Error(`no item ${id}: ${items.map((i) => i.id).join(', ')}`)
  return x
}

/** A candidate waiting for a first review since early September (in the action queue). */
const waiting = (reqId: string, applicationId: string) =>
  cand(reqId, { applicationId, appliedDate: '2026-08-01', stageEnteredDate: '2026-08-01' })

describe('candidate items only on reqs open on the as-of date', () => {
  const reqs = [
    req('R-OPEN', { openedDate: '2026-09-01' }),
    req('R-HOLD', { status: 'On hold', openedDate: '2026-03-01' }),
    req('R-CANCEL', { status: 'Cancelled', openedDate: '2026-03-01', closedDate: '2026-08-15' }),
    req('R-FILLED', { status: 'Filled', openedDate: '2026-03-01', filledDate: '2026-09-10' }),
  ]
  const candidates = [
    waiting('R-OPEN', 'A-OPEN'),
    waiting('R-HOLD', 'A-HOLD'),
    waiting('R-CANCEL', 'A-CANCEL'),
    waiting('R-FILLED', 'A-FILLED'),
  ]
  const items = recruitingActions(ctxOf({ requisitions: reqs, candidates }))

  it('lists the open req’s candidate and none on a held, cancelled or filled req', () => {
    const ids = items.filter((i) => i.subject.kind === 'candidates').map((i) => i.subject.id)
    expect(ids).toEqual(['A-OPEN'])
  })

  it('places a candidate item by its req', () => {
    expect(byId(items, 'recruiting:review:A-OPEN').place).toEqual({
      businessUnit: 'Silicon Engineering',
      location: 'San Jose',
      region: 'Americas',
    })
  })
})

describe('reqs past their time-to-fill target', () => {
  // Each req has a candidate past the screen, so none is an empty funnel.
  const pastScreen = (reqId: string) =>
    cand(reqId, {
      currentStage: 'Hiring manager',
      appliedDate: '2026-09-20',
      screenDate: '2026-09-22',
      hmDate: '2026-09-25',
      stageEnteredDate: '2026-09-25',
      nextEventDate: '2026-10-02',
    })
  const reqs = [
    req('R-OLD', { openedDate: '2026-06-01', jobTitle: 'Senior verification engineer' }),
    req('R-MID', { openedDate: '2026-07-20' }),
    req('R-NEW', { openedDate: '2026-09-01' }),
    req('R-HELD', { status: 'On hold', openedDate: '2026-01-05' }),
  ]
  const data = { requisitions: reqs, candidates: reqs.map((r) => pastScreen(r.reqId)) }
  const items = recruitingActions(ctxOf(data))

  it('lists open reqs older than the 45 d target for their recruiter, critical past 2.5 times it', () => {
    const old = byId(items, 'recruiting:past-target:R-OLD')
    expect(old).toMatchObject({
      kind: 'Req past its time-to-fill target',
      ownerRole: 'recruiter',
      ownerName: 'Rita Recruiter',
      severity: 'critical',
      due: '2026-07-16',
      tab: 'requisitions',
      subject: { kind: 'requisitions', id: 'R-OLD' },
    })
    expect(old.what).toBe('Req R-OLD Senior verification engineer has been open 121 d; the target is 45 d')
    expect(old.note).toBe('Could we review the req with Hana Manager this week?')
    expect(byId(items, 'recruiting:past-target:R-MID').severity).toBe('warning')
    expect(items.some((i) => i.id === 'recruiting:past-target:R-NEW')).toBe(false)
    // On hold: not open, and no item.
    expect(items.some((i) => i.id === 'recruiting:past-target:R-HELD')).toBe(false)
    expect(resolveDrill(old.drill)?.kind).toBe('candidates')
  })

  it('without a target, measures against 1.5 times the level’s median time to fill', () => {
    const filled = Array.from({ length: 5 }, (_, i) =>
      req(`F${i}`, { status: 'Filled', openedDate: '2026-03-02', filledDate: '2026-04-11' }),
    )
    const noTarget = metricsWithEdits([{ metricId: RM.timeToFill, field: 'target', value: null }])
    const out = recruitingActions(
      ctxOf({ ...data, requisitions: [...reqs, ...filled] }, { metrics: noTarget }),
    )
    // The L4 median is 40 d, so the bar is 60 d: 72 d open is past it, 29 d is not.
    expect(byId(out, 'recruiting:past-target:R-MID').what).toBe(
      'Req R-MID Engineer R-MID has been open 72 d; the median time to fill for L4 is 40 d',
    )
    expect(out.some((i) => i.id === 'recruiting:past-target:R-NEW')).toBe(false)
  })

  it('never lists an empty-funnel req twice', () => {
    const empty = req('R-EMPTY', { openedDate: '2026-05-01' })
    // One applicant, still at Applied and waiting less than a review takes: nobody past the screen.
    const applied = cand('R-EMPTY', { appliedDate: '2026-09-29', stageEnteredDate: '2026-09-29' })
    const out = recruitingActions(ctxOf({ requisitions: [empty], candidates: [applied] }))
    expect(out.filter((i) => i.subject.id === 'R-EMPTY').map((i) => i.id)).toEqual([
      'recruiting:empty-funnel:R-EMPTY',
    ])
  })
})

describe('dates keep their year outside the as-of year', () => {
  it('writes an offer from last year with its year', () => {
    const r = req('R-1', { openedDate: '2025-10-01' })
    const offer = cand('R-1', {
      applicationId: 'A-OFFER',
      currentStage: 'Offer',
      appliedDate: '2025-10-05',
      screenDate: '2025-10-10',
      hmDate: '2025-10-20',
      onsiteDate: '2025-11-05',
      offerDate: '2025-12-12',
      stageEnteredDate: '2025-12-12',
    })
    const x = recruitingActions(ctxOf({ requisitions: [r], candidates: [offer] })).find((i) =>
      i.id.startsWith('recruiting:offer-answer:'),
    )
    expect(x?.what).toMatch(/^Offer out since 12 Dec 2025 with no answer yet/)
  })
})

describe("Recruiter mode compares a recruiter's reqs with all reqs", () => {
  it('words the benchmark as all reqs in a reqs scope, and the company elsewhere', () => {
    const data = { requisitions: [req('R-1')], candidates: [cand('R-1')] }
    const company = computeRecruiting(ctxOf(data)).base
    expect(company.bench).toEqual({ label: 'Company', words: 'the company', note: 'company' })
    const base = ctxOf(data)
    const mine = buildContext({
      data: base.all,
      sources: base.sources,
      filters: DEFAULT_FILTERS,
      asOfOverride: base.asOf,
      showPay: false,
      access: { mode: 'recruiter', picks: { recruiter: { name: 'Rita Recruiter', id: null } } },
    })
    expect(mine.access.scope?.kind).toBe('reqs')
    expect(computeRecruiting(mine).base.bench).toEqual({
      label: 'All reqs',
      words: 'all reqs',
      note: 'all reqs',
    })
  })
})
