import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import { describeFocus, filterChips, isFiltered } from './filterLabels'

const names: Record<string, string> = { E100: 'Priya Raman' }
const nameOf = (id: string) => names[id]
const f = (patch: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...patch })

describe('filterChips', () => {
  it('has no chips for the default filters', () => {
    expect(filterChips(DEFAULT_FILTERS, nameOf)).toEqual([])
  })

  it('makes one chip per value with a patch that removes just that value', () => {
    const filters = f({ leaderId: 'E100', location: ['Hsinchu', 'Munich'], level: ['L4'] })
    const chips = filterChips(filters, nameOf)
    expect(chips.map((c) => [c.key, c.dimension, c.label])).toEqual([
      ['leaderId', 'Leader', "Priya Raman's org"],
      ['location', 'Location', 'Hsinchu'],
      ['location', 'Location', 'Munich'],
      ['level', 'Level', 'L4 Senior'],
    ])
    expect(chips[0].remove).toEqual({ leaderId: null })
    expect(chips[1].remove).toEqual({ location: ['Munich'] })
    expect(chips[3].remove).toEqual({ level: [] })
  })

  it('falls back when the leader is unknown', () => {
    expect(filterChips(f({ leaderId: 'X' }), nameOf)[0].label).toBe('Leader org')
  })
})

describe('isFiltered', () => {
  it('is true for any org filter or a non-default period', () => {
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false)
    expect(isFiltered(f({ period: 'ytd' }))).toBe(true)
    expect(isFiltered(f({ department: ['Layout'] }))).toBe(true)
    expect(isFiltered(f({ leaderId: 'E100' }))).toBe(true)
  })
})

describe('describeFocus', () => {
  it('describes a finding filter in plain words', () => {
    expect(describeFocus({ location: ['Bengaluru'] }, nameOf)).toBe('Bengaluru')
    expect(describeFocus({ leaderId: 'E100', department: ['Layout'] }, nameOf)).toBe(
      "Priya Raman's org · Layout",
    )
    expect(describeFocus({ level: ['L1', 'L2', 'L3'] }, nameOf)).toBe('L1 Entry +2')
    expect(describeFocus({ businessUnit: ['Compute', 'Networking'] }, nameOf)).toBe('Compute, Networking')
    expect(describeFocus({ period: 't6m' }, nameOf)).toBe('Last 6 months')
  })

  it('is empty when the patch sets nothing', () => {
    expect(describeFocus({}, nameOf)).toBe('')
    expect(describeFocus({ location: [] }, nameOf)).toBe('')
  })
})

describe('exclusions', () => {
  it('read "Not Sales" and "Not in Priya Raman’s org" on chips', () => {
    const chips = filterChips(
      f({
        leaderId: 'E100',
        businessUnit: ['Sales'],
        location: ['Hsinchu'],
        modes: { leaderId: 'exclude', businessUnit: 'exclude' },
      }),
      nameOf,
    )
    expect(chips.map((c) => [c.label, c.excluded])).toEqual([
      ["Not in Priya Raman's org", true],
      ['Not Sales', true],
      ['Hsinchu', false],
    ])
  })

  it('describe a focus that excludes, and a custom period in words', () => {
    expect(describeFocus({ businessUnit: ['Sales'], modes: { businessUnit: 'exclude' } }, nameOf)).toBe(
      'not Sales',
    )
    expect(describeFocus({ leaderId: 'E100', modes: { leaderId: 'exclude' } }, nameOf)).toBe(
      "not in Priya Raman's org",
    )
    expect(
      describeFocus({ period: 'custom', customStart: '2026-03-01', customEnd: '2026-03-31' }, nameOf),
    ).toBe('Mar 2026')
    expect(
      describeFocus({ period: 'custom', customStart: '2026-04-01', customEnd: '2026-06-30' }, nameOf),
    ).toBe('Q2 2026')
    expect(
      describeFocus({ period: 'custom', customStart: '2026-03-05', customEnd: '2026-03-31' }, nameOf),
    ).toBe('5 Mar 2026 – 31 Mar 2026')
  })
})
