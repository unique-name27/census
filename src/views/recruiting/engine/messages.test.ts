import { describe, expect, it } from 'vitest'
import { AS_OF, cand, req } from './fixtures'
import { ownerNote } from './messages'
import { activeItems } from './nextStep'
import { queueGroups } from './pipeline'
import { prepareApps, reqIndex } from './prepare'
import type { Norms } from './types'

const norms: Norms = { days: [4, 7, 8, 8, 4], samples: [9, 9, 9, 9, 9] }
const R = reqIndex([req('REQ-1', { jobTitle: 'Senior DV Engineer' })])
const NAGGING = /\b(chase|chasing|push|nag|ping|hound|unblock)\b/i

const items = (cs: ReturnType<typeof cand>[]) => activeItems(prepareApps(cs, R, AS_OF), AS_OF, norms)

describe('ownerNote', () => {
  it('asks the hiring manager to have the panel submit scorecards and decide', () => {
    const decision = items([
      cand('REQ-1', {
        candidateName: 'Priya Raman',
        currentStage: 'Onsite',
        onsiteDate: '2026-09-10',
        nextEventDate: '2026-09-24',
      }),
    ])
    const note = ownerNote('Hana Manager', decision)
    expect(note.startsWith('Hi Hana,')).toBe(true)
    expect(note).toContain(
      'Could you ask the panel to submit scorecards for Priya Raman (Senior DV Engineer), who interviewed on 24 Sep, and make a decision this week?',
    )
    expect(note).not.toMatch(NAGGING)
  })

  it('lists several decisions and uses the standard leader ask', () => {
    const many = items(
      ['2026-09-22', '2026-09-23'].map((d) =>
        cand('REQ-1', { currentStage: 'Screen', screenDate: '2026-09-15', nextEventDate: d }),
      ),
    )
    const note = ownerNote('Hana Manager', many)
    expect(note).toContain('2 candidates have interviewed and are waiting on scorecards or a decision:')
    expect(note).toContain('Could you ask the panel to submit scorecards and make a decision this week?')
  })

  it('composes scheduling, review and offer asks politely, and leaves scheduled candidates out', () => {
    const list = items([
      cand('REQ-1', { currentStage: 'Hiring manager', hmDate: '2026-09-01', coordinator: 'Cora' }),
      cand('REQ-1', { appliedDate: '2026-09-01' }),
      cand('REQ-1', { currentStage: 'Offer', offerDate: '2026-09-18' }),
      cand('REQ-1', {
        candidateName: 'Sam Booked',
        currentStage: 'Onsite',
        onsiteDate: '2026-09-25',
        nextEventDate: '2026-10-02',
      }),
    ])
    const note = ownerNote('Rita Recruiter', list)
    expect(note).toContain('Can we get these on the calendar this week?')
    expect(note).toContain('Could you review it this week?')
    expect(note).toContain('Worth a follow-up call?')
    expect(note).not.toContain('Sam Booked')
    expect(note).not.toMatch(NAGGING)
    expect(note).not.toContain('—')
    expect(note.endsWith('Thank you.')).toBe(true)
  })

  it('is empty when there is nothing to ask', () => {
    expect(ownerNote('Rita', [])).toBe('')
  })
})

describe('queueGroups', () => {
  it('groups queue items by owner in a stable order, oldest first inside a group', () => {
    const list = items([
      cand('REQ-1', { appliedDate: '2026-09-01' }),
      cand('REQ-1', { appliedDate: '2026-08-01' }),
      cand('REQ-1', { currentStage: 'Onsite', onsiteDate: '2026-09-10', nextEventDate: '2026-09-23' }),
    ])
    const groups = queueGroups(list)
    expect(groups.map((g) => [g.owner, g.role, g.items.length])).toEqual([
      ['Rita Recruiter', 'Recruiter', 2],
      ['Hana Manager', 'Hiring manager', 1],
    ])
    expect(groups[0].items[0].days).toBeGreaterThan(groups[0].items[1].days)
  })
})
