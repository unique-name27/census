import { describe, expect, it } from 'vitest'
import type { Employee } from '@/data/schema'
import { summaryCut } from './summary'

const person = (department: string, level: Employee['level']) => ({ department, level }) as Employee

describe('records panel summary', () => {
  const people = [
    person('Design Verification', 'L3'),
    null,
    person('Fab Operations', 'L2'),
    person('Design Verification', 'L2'),
    person('Design Verification', null),
    undefined,
  ]

  it('counts the people behind a list by department, largest first, keeping their rows', () => {
    const cut = summaryCut(people, 'department')
    expect(cut.groups).toEqual([
      { label: 'Design Verification', count: 3, rows: [0, 3, 4] },
      { label: 'Fab Operations', count: 1, rows: [2] },
    ])
    expect(cut.people).toBe(4)
    expect(cut.unnamed).toBe(2)
  })

  it('names a blank level "Not set" and adds up to the people counted', () => {
    const cut = summaryCut(people, 'level')
    expect(cut.groups.map((g) => [g.label, g.count])).toEqual([
      ['L2', 2],
      ['L3', 1],
      ['Not set', 1],
    ])
    expect(cut.groups.reduce((s, g) => s + g.count, 0)).toBe(cut.people)
  })
})
