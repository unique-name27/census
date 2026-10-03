import { describe, expect, it } from 'vitest'
import { peoplePreview, readoutRows, severityCounts, sortFindings } from './readoutModel'
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
