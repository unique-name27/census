/**
 * "Copy note": one polite, plain-text message per owner, following the recruiting tone rules.
 */
import { describe, expect, it } from 'vitest'
import { askOf, composeNote, DEFAULT_ASK, greeting, NAGGING, NOTE_MAX_ITEMS } from './note'
import { AS_OF, open } from './testkit'

describe('greeting', () => {
  it('uses a first name for a person and the team name for a team', () => {
    expect(greeting({ name: 'Ji-woo Lim', isTeam: false })).toBe('Hi Ji-woo,')
    expect(greeting({ name: 'People operations', isTeam: true })).toBe('Hi People operations team,')
    expect(greeting({ name: 'Recruiting team', isTeam: true })).toBe('Hi Recruiting team,')
    expect(greeting({ name: 'HR business partner', isTeam: true })).toBe('Hello,')
  })
})

describe('composeNote', () => {
  const decision = open({
    what: 'Scorecards and a decision are not in for the onsite on 24 Sep',
    note: 'Could you ask the panel to submit scorecards for Priya Raman and make a decision this week?',
    subject: { kind: 'candidates', id: 'APP-1', label: 'Priya Raman, Emulation Engineer (REQ-4558)' },
    due: '2026-09-29',
  })
  const check = open({
    what: 'Background check cleared is blocked for Alejandro Lopez, who starts on 5 Oct 2026. Due 2 Oct 2026.',
    note: 'Could you confirm the background check for Alejandro Lopez, who starts on 5 Oct 2026?',
    subject: { kind: 'employees', id: 'E3', label: 'Alejandro Lopez' },
    due: '2026-10-02',
  })

  it('greets, lists each item with what is open and its ask, and thanks', () => {
    const text = composeNote({ name: 'Ji-woo Lim', isTeam: false }, [decision, check], AS_OF)
    expect(text).toBe(
      [
        'Hi Ji-woo,',
        'Here are 2 open items for you, as of 30 Sep 2026.',
        [
          '1. Priya Raman, Emulation Engineer (REQ-4558)',
          '   Scorecards and a decision are not in for the onsite on 24 Sep. Due 29 Sep 2026.',
          '   Could you ask the panel to submit scorecards for Priya Raman and make a decision this week?',
          '',
          '2. Alejandro Lopez',
          // The item already says its due date, so it is not repeated.
          '   Background check cleared is blocked for Alejandro Lopez, who starts on 5 Oct 2026. Due 2 Oct 2026.',
          '   Could you confirm the background check for Alejandro Lopez, who starts on 5 Oct 2026?',
        ].join('\n'),
        'If any of these are already done, let me know and I will update the list. Thank you.',
      ].join('\n\n'),
    )
  })

  it('speaks to a team, and to one item', () => {
    const text = composeNote({ name: 'IT', isTeam: true }, [check], AS_OF)
    expect(text.startsWith('Hi IT team,\n\nHere is one open item for your team, as of 30 Sep 2026.')).toBe(
      true,
    )
    expect(text.endsWith('If this is already done, let me know and I will update the list. Thank you.')).toBe(
      true,
    )
  })

  it('never nags: an ask with a nagging verb is replaced by a neutral one', () => {
    const pushy = open({ note: 'Please chase the panel and push for a decision.' })
    expect(askOf(pushy)).toBe(DEFAULT_ASK)
    expect(askOf(open({ note: undefined }))).toBe(DEFAULT_ASK)
    const text = composeNote({ name: 'Sam Lee', isTeam: false }, [pushy, decision], AS_OF)
    expect(text).not.toMatch(NAGGING)
    expect(text).not.toMatch(/\w — \w/)
    expect(text).not.toContain('!')
  })

  it('lists at most the cap and counts the rest', () => {
    const items = Array.from({ length: NOTE_MAX_ITEMS + 3 }, () => open())
    const text = composeNote({ name: 'Sam Lee', isTeam: false }, items, AS_OF)
    expect(text).toContain(`Here are ${NOTE_MAX_ITEMS + 3} open items for you`)
    expect(text).toContain(`${NOTE_MAX_ITEMS}. `)
    expect(text).not.toContain(`${NOTE_MAX_ITEMS + 1}. `)
    expect(text).toContain('There are 3 more; I can send the full list.')
    expect(composeNote({ name: 'Sam Lee', isTeam: false }, [], AS_OF)).toBe('')
  })
})
