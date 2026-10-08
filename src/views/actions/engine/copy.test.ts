/**
 * The Action center's own sentences from the roles review: what a regional HR business partner's
 * Needs attention holds, the owners note, and nothing that reads as the same count twice.
 */
import { describe, expect, it } from 'vitest'
import { ownersNote } from './charts'
import { modeCtx } from './roleKit'
import { listsLine } from './roles'

describe('the lists line', () => {
  it('says a regional HRBP named in Settings also holds the region’s site matters', () => {
    const region = modeCtx('hrbp-region')
    const s = region.access.scope
    expect(s?.kind).toBe('region')
    const owned = s?.kind === 'region' && !!s.owner
    expect(listsLine(region)).toBe(
      owned
        ? "Needs attention is yours, with what the surveys say about your region's sites; Waiting on others is in your area, with someone else."
        : 'Needs attention is yours; Waiting on others is in your area, with someone else.',
    )
    // Without a regional HRBP named, items route by kind: no site matters.
    if (s?.kind === 'region') {
      const unnamed = { ...region, access: { ...region.access, scope: { ...s, owner: null } } }
      expect(listsLine(unnamed)).toBe(
        'Needs attention is yours; Waiting on others is in your area, with someone else.',
      )
    }
    expect(listsLine(modeCtx('compensation'))).toMatch(/^Needs attention is yours; /)
  })
})

describe('the owners note', () => {
  it('reads as English for one owner, all teams and some teams', () => {
    expect(ownersNote(12, 0)).toBe('12 owners')
    expect(ownersNote(1, 1)).toBe('1 owner, a team')
    expect(ownersNote(1, 0)).toBe('1 owner')
    expect(ownersNote(2, 2)).toBe('2 owners, both teams')
    expect(ownersNote(5, 5)).toBe('5 owners, all teams')
    expect(ownersNote(12, 3)).toBe('12 owners, 3 of them teams')
    expect(ownersNote(3, 1)).toBe('3 owners, 1 of them a team')
  })
})
