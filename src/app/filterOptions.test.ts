import { describe, expect, it } from 'vitest'
import type { Employee } from '@/data/schema'
import { buildOrgIndex, DEFAULT_FILTERS } from '@/data/scope'
import {
  customRangeError,
  dimensionOptions,
  leaderChain,
  leaderOptions,
  orgSizes,
  otherFilters,
  shortRange,
} from './filterOptions'

const AS_OF = '2026-09-30'

function emp(employeeId: string, managerId: string | null, extra: Partial<Employee> = {}): Employee {
  return {
    employeeId,
    name: `Person ${employeeId}`,
    jobTitle: `Title ${employeeId}`,
    businessUnit: 'Compute',
    department: 'Design verification',
    location: 'Austin',
    country: 'United States',
    level: 'L3',
    managerId,
    hireDate: '2020-01-01',
    employmentType: 'Employee',
    ...extra,
  }
}

/*
 *        ceo
 *       /    \
 *     vpA     vpB
 *    / | \      \
 *  a1 a2 a3     b1 (+ contractor c1, leaver x1 under vpB)
 *  |
 *  a1x (under a1)
 */
const roster: Employee[] = [
  emp('ceo', null, { level: 'E3', location: 'San Jose' }),
  emp('vpA', 'ceo', { level: 'E1', businessUnit: 'Compute' }),
  emp('vpB', 'ceo', { level: 'E1', businessUnit: 'Networking', location: 'Hsinchu' }),
  emp('a1', 'vpA', { level: 'M1' }),
  emp('a2', 'vpA'),
  emp('a3', 'vpA', { level: 'L5' }),
  emp('a1x', 'a1', { level: 'L1' }),
  emp('b1', 'vpB', { businessUnit: 'Networking', location: 'Hsinchu' }),
  emp('c1', 'vpB', { employmentType: 'Contractor', businessUnit: 'Networking' }),
  emp('x1', 'vpB', { terminationDate: '2026-06-30', businessUnit: 'Networking' }),
  emp('future', 'vpB', { hireDate: '2026-11-01', businessUnit: 'Networking' }),
]
const index = buildOrgIndex(roster)

describe('dimensionOptions', () => {
  it('counts active employees only, alphabetically', () => {
    const bu = dimensionOptions(roster, AS_OF, 'businessUnit')
    // Networking: vpB + b1 (contractor, leaver and future hire excluded)
    expect(bu).toEqual([
      { value: 'Compute', label: 'Compute', count: 6 },
      { value: 'Networking', label: 'Networking', count: 2 },
    ])
  })

  it('orders levels along the ladder with long labels', () => {
    const lv = dimensionOptions(roster, AS_OF, 'level')
    expect(lv.map((o) => o.value)).toEqual(['L1', 'L3', 'L5', 'M1', 'E1', 'E3'])
    expect(lv[0]).toEqual({ value: 'L1', label: 'L1 Entry', count: 1 })
    expect(lv.find((o) => o.value === 'E1')?.count).toBe(2)
  })

  it('keeps a selected value that no longer exists so it can be cleared', () => {
    const loc = dimensionOptions(roster, AS_OF, 'location', ['Munich'])
    expect(loc.find((o) => o.value === 'Munich')).toEqual({ value: 'Munich', label: 'Munich', count: 0 })
  })

  it('returns nothing for an empty roster', () => {
    expect(dimensionOptions([], AS_OF, 'department')).toEqual([])
  })

  it('counts within the rest of the filter row, and lists values with nobody left last', () => {
    const filters = { ...DEFAULT_FILTERS, businessUnit: ['Networking'] }
    // Locations within Networking: Hsinchu has vpB and b1; Austin and San Jose have nobody left.
    const loc = dimensionOptions(roster, AS_OF, 'location', [], otherFilters(filters, index, 'location'))
    expect(loc).toEqual([
      { value: 'Hsinchu', label: 'Hsinchu', count: 2 },
      { value: 'Austin', label: 'Austin', count: 0 },
      { value: 'San Jose', label: 'San Jose', count: 0 },
    ])
    // A dimension's own choice does not narrow its own list, so it can still be widened.
    const bu = dimensionOptions(
      roster,
      AS_OF,
      'businessUnit',
      ['Networking'],
      otherFilters(filters, index, 'businessUnit'),
    )
    expect(bu.map((o) => [o.value, o.count])).toEqual([
      ['Compute', 6],
      ['Networking', 2],
    ])
    // A leader narrows every dimension to their org.
    const underA = otherFilters({ ...DEFAULT_FILTERS, leaderId: 'vpA' }, index, 'level')
    const lv = dimensionOptions(roster, AS_OF, 'level', [], underA)
    expect(lv.filter((o) => o.count > 0).map((o) => o.value)).toEqual(['L1', 'L3', 'L5', 'M1', 'E1'])
    expect(lv.at(-1)).toEqual({ value: 'E3', label: 'E3 Executive', count: 0 })
  })
})

describe('orgSizes and leaderOptions', () => {
  it('counts each active employee once in every org above them, themselves included', () => {
    const sizes = orgSizes(index, AS_OF)
    expect(sizes.get('ceo')).toBe(8)
    expect(sizes.get('vpA')).toBe(5)
    expect(sizes.get('vpB')).toBe(2)
    expect(sizes.get('a1')).toBe(2)
    expect(sizes.get('c1')).toBeUndefined()
  })

  it('lists active leaders with at least three people below, largest first', () => {
    const opts = leaderOptions(index, AS_OF)
    expect(opts.map((o) => o.id)).toEqual(['ceo', 'vpA'])
    expect(opts[0]).toEqual({ id: 'ceo', name: 'Person ceo', title: 'Title ceo', size: 8 })
  })

  it('honours a lower threshold and breaks ties by name', () => {
    const opts = leaderOptions(index, AS_OF, 1)
    expect(opts.map((o) => o.id)).toEqual(['ceo', 'vpA', 'a1', 'vpB'])
  })

  it('leaves out leaders who are no longer active', () => {
    const gone = buildOrgIndex(
      roster.map((e) => (e.employeeId === 'vpA' ? { ...e, terminationDate: '2026-01-31' } : e)),
    )
    expect(leaderOptions(gone, AS_OF).map((o) => o.id)).toEqual(['ceo'])
  })

  it('survives a reporting cycle', () => {
    const loop = buildOrgIndex([emp('p', 'q'), emp('q', 'p'), emp('r', 'p'), emp('s', 'p'), emp('t', 'p')])
    const sizes = orgSizes(loop, AS_OF)
    expect(sizes.get('p')).toBe(5)
    expect(sizes.get('q')).toBe(5)
  })
})

describe('leaderChain', () => {
  it('runs from the top of the org down to the leader', () => {
    expect(leaderChain(index, 'a1x').map((e) => e.employeeId)).toEqual(['ceo', 'vpA', 'a1', 'a1x'])
    expect(leaderChain(index, 'ceo').map((e) => e.employeeId)).toEqual(['ceo'])
  })

  it('is empty for an unknown id and cycle-safe', () => {
    expect(leaderChain(index, 'nobody')).toEqual([])
    const loop = buildOrgIndex([emp('p', 'q'), emp('q', 'p')])
    expect(leaderChain(loop, 'p').map((e) => e.employeeId)).toEqual(['q', 'p'])
  })
})

describe('period helpers', () => {
  it('validates a custom range', () => {
    expect(customRangeError('2026-01-01', '2026-06-30')).toBeNull()
    expect(customRangeError('2026-06-30', '2026-06-30')).toBeNull()
    expect(customRangeError('2026-07-01', '2026-06-30')).toMatch(/on or before/)
    expect(customRangeError('', '2026-06-30')).toBe('Enter both dates.')
  })

  it('refuses a custom range that ends after the reporting date', () => {
    expect(customRangeError('2026-01-01', '2026-09-30', '2026-09-30')).toBeNull()
    expect(customRangeError('2027-01-01', '2027-06-30', '2026-09-30')).toBe(
      'The end date must be on or before the reporting date, 30 Sep 2026.',
    )
    expect(customRangeError('2026-01-01', '2027-03-01', '2026-09-30')).toMatch(/reporting date/)
    // the order check still comes first
    expect(customRangeError('2027-07-01', '2027-06-30', '2026-09-30')).toMatch(/start date/)
  })

  it('prints a compact month range', () => {
    expect(shortRange('2025-10-01', '2026-09-30')).toBe("Oct '25 – Sep '26")
  })
})
