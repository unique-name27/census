import { describe, expect, it } from 'vitest'
import { OFFER_DECLINE_REASONS } from '../schema'
import { readDeclineReason } from './declines'
import { censusValues } from './seed'

describe('offer decline reasons and themes', () => {
  it('ships every reason with a theme, Other last', () => {
    const list = censusValues('offerDeclineReason')
    expect(list.map((v) => v.value)).toEqual(OFFER_DECLINE_REASONS.map((r) => r.reason))
    expect(list.at(-1)).toMatchObject({ value: 'Other', attrs: { theme: 'Other' } })
    for (const v of list) expect(v.attrs?.theme, v.value).toBeTruthy()
  })

  it.each([
    ['Accepted competing offer', 'Accepted competing offer', 'Competition'],
    ['accepted another offer', 'Accepted competing offer', 'Competition'],
    ['Went with another company', 'Accepted competing offer', 'Competition'],
    ['Reneged: accepted another offer', 'Accepted competing offer', 'Competition'],
    ['Counter offer', 'Counteroffer from current employer', 'Competition'],
    ['counter', 'Counteroffer from current employer', 'Competition'],
    ['Reneged: counteroffer from current employer', 'Counteroffer from current employer', 'Competition'],
    ['Salary', 'Compensation below expectations', 'Pay'],
    ['comp', 'Compensation below expectations', 'Pay'],
    ['Pay too low', 'Compensation below expectations', 'Pay'],
    ['Equity', 'Equity, bonus or total rewards', 'Pay'],
    ['Relocation', 'Location or relocation', 'Logistics'],
    ['Commute', 'Location or relocation', 'Logistics'],
    ['Notice period', 'Start date or notice period', 'Logistics'],
    ['Process took too long', 'Process took too long', 'Process'],
    ['Role or level', 'Role or level', 'Role'],
    ['Personal reasons', 'Personal reasons', 'Personal'],
  ])('reads %s as %s (%s)', (raw, reason, theme) => {
    expect(readDeclineReason(raw)).toEqual({ reason, theme, recognized: true })
  })

  it('keeps text it does not recognize, under Other, and nothing for a blank', () => {
    expect(readDeclineReason('Ghosted')).toEqual({ reason: 'Ghosted', theme: 'Other', recognized: false })
    expect(readDeclineReason('  ')).toBe(null)
    expect(readDeclineReason(null)).toBe(null)
  })

  it('takes reasons and themes you add to the list, and follows a retired reason to its replacement', () => {
    const list = [
      ...censusValues('offerDeclineReason'),
      { value: 'Sign-on bonus too low', attrs: { theme: 'Pay' }, added: true },
      { value: 'Old reason', retired: true, replacedBy: 'Role or level' },
    ]
    expect(readDeclineReason('sign-on bonus too low', list)).toEqual({
      reason: 'Sign-on bonus too low',
      theme: 'Pay',
      recognized: true,
    })
    expect(readDeclineReason('Old reason', list)).toEqual({
      reason: 'Role or level',
      theme: 'Role',
      recognized: true,
    })
  })
})
