import { describe, expect, it } from 'vitest'
import {
  labelInSentence,
  peopleChipLabel,
  peopleCount,
  peoplePreview,
  readoutRows,
  severityCounts,
  sortFindings,
} from './readoutModel'
import type { Finding } from './types'

const finding = (id: string, severity: Finding['severity'], extra: Partial<Finding> = {}): Finding => ({
  id,
  severity,
  title: `Finding ${id}`,
  ...extra,
})

describe('sortFindings', () => {
  it('puts critical first, then warning, info and good, keeping order within a severity', () => {
    const sorted = sortFindings([
      finding('g1', 'good'),
      finding('w1', 'warning'),
      finding('i1', 'info'),
      finding('c1', 'critical'),
      finding('w2', 'warning'),
      finding('c2', 'critical'),
    ])
    expect(sorted.map((f) => f.id)).toEqual(['c1', 'c2', 'w1', 'w2', 'i1', 'g1'])
  })

  it('does not mutate its input', () => {
    const input = [finding('g', 'good'), finding('c', 'critical')]
    sortFindings(input)
    expect(input.map((f) => f.id)).toEqual(['g', 'c'])
  })

  it('counts by severity', () => {
    expect(severityCounts([finding('a', 'warning'), finding('b', 'warning'), finding('c', 'good')])).toEqual({
      critical: 0,
      warning: 2,
      info: 0,
      good: 1,
    })
  })
})

describe('peoplePreview', () => {
  const people = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Person ${i}` }))
  it('shows the first five and counts the rest', () => {
    const { shown, more } = peoplePreview(people)
    expect(shown.map((p) => p.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
    expect(more).toBe(7)
  })
  it('has nothing more for a short list', () => {
    expect(peoplePreview(people.slice(0, 3)).more).toBe(0)
  })
})

describe('readoutRows', () => {
  it('exports findings in severity order with people counted, not named', () => {
    const rows = readoutRows([
      finding('a', 'info', { detail: 'Detail a' }),
      finding('b', 'critical', {
        action: 'Ask the panel to submit scorecards and make a decision this week.',
        people: [
          { id: '1', name: 'A' },
          { id: '2', name: 'B' },
        ],
      }),
    ])
    expect(rows).toEqual([
      {
        severity: 'Critical',
        finding: 'Finding b',
        detail: '',
        nextStep: 'Ask the panel to submit scorecards and make a decision this week.',
        people: 2,
      },
      { severity: 'Note', finding: 'Finding a', detail: 'Detail a', nextStep: '', people: null },
    ])
  })
})

describe('labelInSentence', () => {
  it('lowers the first letter of ordinary labels and keeps acronyms', () => {
    expect(labelInSentence('Drivers')).toBe('drivers')
    expect(labelInSentence('Time to fill')).toBe('time to fill')
    expect(labelInSentence('HR transactions')).toBe('HR transactions')
    expect(labelInSentence('HRBP view')).toBe('HRBP view')
    expect(labelInSentence('9-box')).toBe('9-box')
    expect(labelInSentence('A')).toBe('A')
    expect(labelInSentence('')).toBe('')
  })
})

describe('capped people lists', () => {
  const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `E${i}`, name: `Person ${i}` }))

  it('labels the toggle with the total when the list is capped', () => {
    expect(peopleChipLabel(50, 57)).toBe('57 people (first 50 listed)')
    expect(peopleChipLabel(1, 2)).toBe('2 people (first 1 listed)')
    expect(peopleChipLabel(12)).toBe('12 people')
    expect(peopleChipLabel(12, 12)).toBe('12 people')
    expect(peopleChipLabel(1)).toBe('1 person')
    // A total below the list length is stale; the list wins.
    expect(peopleChipLabel(12, 10)).toBe('12 people')
  })

  it('counts peopleTotal, else the list length', () => {
    expect(peopleCount({ people: people(50), peopleTotal: 57 })).toBe(57)
    expect(peopleCount({ people: people(3) })).toBe(3)
    expect(peopleCount({ peopleTotal: 9 })).toBe(9)
    expect(peopleCount({ people: people(3), peopleTotal: 2 })).toBe(3)
    expect(peopleCount({})).toBeNull()
  })

  it('exports peopleTotal in the People column', () => {
    const rows = readoutRows([
      finding('capped', 'warning', { people: people(50), peopleTotal: 57 }),
      finding('full', 'info', { people: people(4) }),
      finding('none', 'good'),
    ])
    expect(rows.map((r) => r.people)).toEqual([57, 4, null])
  })
})
