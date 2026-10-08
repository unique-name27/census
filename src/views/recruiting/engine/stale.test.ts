/**
 * Applications with no activity for months (docs/ACTION-CENTER-AUDIT.md 3.3 and 4.2): the Action
 * center leaves out a candidate item whose last activity date is older than the `staleDays`
 * setting (90 days by default), since it is more likely a record nobody closed. The action queue
 * still lists it, and without a last activity date nothing is left out.
 */
import { describe, expect, it } from 'vitest'
import { metricsWith } from '@/metrics/testing'
import { RM } from '../metrics'
import { recruitingActions } from './actions'
import { cand, ctxOf, req } from './fixtures'
import { computeRecruiting } from './index'
import { inQueue } from './nextStep'

/** Waiting for a first review since the start of June, last touched on `last`. */
const waiting = (applicationId: string, last: string | null) =>
  cand('R-1', {
    applicationId,
    appliedDate: '2026-06-01',
    stageEnteredDate: '2026-06-01',
    lastActivityDate: last,
  })
const data = {
  requisitions: [req('R-1', { openedDate: '2026-05-01' })],
  candidates: [
    waiting('A-RECENT', '2026-09-20'),
    waiting('A-91', '2026-07-01'),
    waiting('A-90', '2026-07-02'),
    waiting('A-NONE', null),
  ],
}
const candidateIds = (items: ReturnType<typeof recruitingActions>) =>
  items.filter((i) => i.subject.kind === 'candidates').map((i) => i.subject.id)

describe('stale applications', () => {
  it('leaves out an application with no activity in more than 90 days, keeping one without a date', () => {
    const ctx = ctxOf(data)
    expect(candidateIds(recruitingActions(ctx)).sort()).toEqual(['A-90', 'A-NONE', 'A-RECENT'])
    // The action queue on Pipeline still lists every one of them.
    const queue = computeRecruiting(ctx)
      .base.actives.filter(inQueue)
      .map((x) => x.app.id)
    expect(queue.sort()).toEqual(['A-90', 'A-91', 'A-NONE', 'A-RECENT'])
  })

  it('follows the setting', () => {
    const ctx = ctxOf(data, { metrics: metricsWith({ [RM.lackingNextStep]: { staleDays: 30 } }) })
    expect(candidateIds(recruitingActions(ctx)).sort()).toEqual(['A-NONE', 'A-RECENT'])
  })

  it('declares the last activity date among the fields its items read', () => {
    const item = recruitingActions(ctxOf(data)).find((i) => i.subject.id === 'A-RECENT')
    expect(item?.uses).toContain('candidates.lastActivityDate')
  })
})
