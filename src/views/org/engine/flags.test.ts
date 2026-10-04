import { describe, expect, it } from 'vitest'
import type { Employee } from '@/data/schema'
import { AS_OF, person, smallCompany } from './fixtures'
import { becameManagerDates, computeFlags, flagSummary, managingSince } from './flags'
import { buildOrgTree } from './tree'

const kinds = (m: Map<string, { kind: string }[]>, id: string) => (m.get(id) ?? []).map((f) => f.kind)

describe('computeFlags', () => {
  it('flags spans of 1 and single-report chains over a team of 5 or more', () => {
    const t = buildOrgTree(smallCompany(), AS_OF)
    const f = computeFlags(t)
    // DIR-1 manages only MGR-3, who leads 5 people.
    expect(kinds(f, 'DIR-1')).toEqual(['narrow-span', 'single-report-chain'])
    // MGR-2 manages only IC-6, an individual contributor.
    expect(kinds(f, 'MGR-2')).toEqual(['narrow-span'])
    expect(kinds(f, 'MGR-1')).toEqual([])
  })

  it('flags 12 or more direct reports, counting contractors', () => {
    const rows: Employee[] = [person('M', null, { level: 'M1' })]
    for (let i = 0; i < 11; i++) rows.push(person(`E${i}`, 'M'))
    rows.push(person('C', 'M', { employmentType: 'Contractor' }))
    const f = computeFlags(buildOrgTree(rows, AS_OF))
    expect(kinds(f, 'M')).toContain('wide-span')
    expect(f.get('M')![0].label).toBe('12 direct reports')
    const fewer = computeFlags(buildOrgTree(rows.slice(0, -1), AS_OF))
    expect(kinds(fewer, 'M')).not.toContain('wide-span')
  })

  it('flags new managers with 8 or more reports, using the move into a manager level when there is one', () => {
    const team = (mgr: string) => Array.from({ length: 8 }, (_, i) => person(`${mgr}-${i}`, mgr))
    const rows: Employee[] = [
      person('TOP', null, { level: 'E3' }),
      person('NEWHIRE', 'TOP', { level: 'M1', hireDate: '2026-02-16' }),
      person('PROMOTED', 'TOP', { level: 'M1', hireDate: '2019-05-06' }),
      person('VETERAN', 'TOP', { level: 'M1', hireDate: '2019-05-06' }),
      ...team('NEWHIRE'),
      ...team('PROMOTED'),
      ...team('VETERAN'),
    ]
    const jobChanges = [
      {
        employeeId: 'PROMOTED',
        effectiveDate: '2026-03-01',
        changeType: 'Promotion' as const,
        fromLevel: 'L5' as const,
        toLevel: 'M1' as const,
      },
      {
        employeeId: 'VETERAN',
        effectiveDate: '2021-03-01',
        changeType: 'Promotion' as const,
        fromLevel: 'L5' as const,
        toLevel: 'M1' as const,
      },
    ]
    const f = computeFlags(buildOrgTree(rows, AS_OF), jobChanges)
    expect(kinds(f, 'NEWHIRE')).toContain('new-manager-large-team')
    expect(kinds(f, 'PROMOTED')).toContain('new-manager-large-team')
    expect(kinds(f, 'VETERAN')).not.toContain('new-manager-large-team')
    const became = becameManagerDates(jobChanges)
    expect(managingSince(rows[2], became)).toBe('2026-03-01')
    expect(managingSince(rows[1], became)).toBe('2026-02-16')
  })

  it('flags people hired in the last 90 days', () => {
    const rows = [
      person('A', null),
      person('B', 'A', { hireDate: '2026-07-06' }),
      person('C', 'A', { hireDate: '2026-06-01' }),
    ]
    const f = computeFlags(buildOrgTree(rows, AS_OF))
    expect(kinds(f, 'B')).toEqual(['new-hire'])
    expect(f.get('B')![0].detail).toBe('Joined 6 Jul 2026, 86 days ago.')
    expect(kinds(f, 'C')).toEqual([])
  })

  it('notes people shown away from their data manager', () => {
    const rows = [
      person('A', null),
      person('GONE', 'A', { terminationDate: '2026-01-01' }),
      person('B', 'GONE'),
    ]
    const f = computeFlags(buildOrgTree(rows, AS_OF))
    expect(kinds(f, 'B')).toEqual(['placement'])
    expect(flagSummary(f)).toEqual([
      { kind: 'narrow-span', label: 'Span of 1', people: 1 },
      { kind: 'placement', label: 'Reporting line note', people: 1 },
    ])
  })
})
