import { describe, expect, it } from 'vitest'
import { AS_OF, person, smallCompany } from './fixtures'
import { buildOrgTree, COMPANY_ROOT, chainTo, isWithin, layersBelow, subtreeOf } from './tree'

describe('buildOrgTree', () => {
  it('counts direct reports and whole-org size, and orders people leaders first', () => {
    const t = buildOrgTree(smallCompany(), AS_OF)
    expect(t.people.size).toBe(18)
    expect(t.rootId).toBe('CEO')
    expect(t.roots).toEqual(['CEO'])
    expect(t.directs.get('CEO')).toBe(2)
    expect(t.total.get('CEO')).toBe(17)
    expect(t.total.get('VP-A')).toBe(8)
    expect(t.total.get('VP-B')).toBe(7)
    expect(t.children.get('CEO')).toEqual(['VP-A', 'VP-B'])
    // MGR-1 (5 reports) before MGR-2 (1 report)
    expect(t.children.get('VP-A')).toEqual(['MGR-1', 'MGR-2'])
    expect(t.depth.get('IC-7')).toBe(4)
    expect(layersBelow(t, 'CEO')).toBe(5)
    expect(layersBelow(t, 'VP-A')).toBe(3)
  })

  it('leaves out people who are not active on the date and re-homes their reports to the next active manager', () => {
    const rows = smallCompany().map((e) =>
      e.employeeId === 'MGR-1' ? { ...e, terminationDate: '2026-08-01' } : e,
    )
    rows.push(person('FUTURE', 'VP-A', { hireDate: '2026-10-05' }))
    const t = buildOrgTree(rows, AS_OF)
    expect(t.people.has('MGR-1')).toBe(false)
    expect(t.people.has('FUTURE')).toBe(false)
    expect(t.parent.get('IC-1')).toBe('VP-A')
    expect(t.notes.get('IC-1')).toBe('manager-inactive')
    expect(t.directs.get('VP-A')).toBe(6)
    expect(t.issues.rehomed).toHaveLength(5)
  })

  it('walks up through several departed managers', () => {
    const rows = [
      person('TOP', null),
      person('GONE-1', 'TOP', { terminationDate: '2025-01-01' }),
      person('GONE-2', 'GONE-1', { terminationDate: '2025-01-01' }),
      person('KID', 'GONE-2'),
    ]
    const t = buildOrgTree(rows, AS_OF)
    expect(t.parent.get('KID')).toBe('TOP')
  })

  it('puts people whose manager is not in the roster at the top level, under a virtual company root', () => {
    const rows = [...smallCompany(), person('ORPHAN', 'NOPE'), person('SOLO', null)]
    const t = buildOrgTree(rows, AS_OF)
    expect(t.rootId).toBe(COMPANY_ROOT)
    expect(new Set(t.roots)).toEqual(new Set(['CEO', 'ORPHAN', 'SOLO']))
    expect(t.notes.get('ORPHAN')).toBe('manager-missing')
    expect(t.children.get(COMPANY_ROOT)?.[0]).toBe('CEO')
    expect(t.total.get(COMPANY_ROOT)).toBe(20)
    expect(subtreeOf(t, COMPANY_ROOT)).toHaveLength(20)
  })

  it('breaks a reporting loop at its most senior member', () => {
    const rows = [
      person('ROOT', null, { level: 'E3' }),
      person('A', 'C', { level: 'M1' }),
      person('B', 'A', { level: 'L4' }),
      person('C', 'B', { level: 'M2' }),
      person('D', 'A'),
    ]
    const t = buildOrgTree(rows, AS_OF)
    expect(t.issues.cycles).toHaveLength(1)
    expect(new Set(t.issues.cycles[0])).toEqual(new Set(['A', 'B', 'C']))
    expect(t.parent.get('C')).toBe(null)
    expect(t.notes.get('C')).toBe('cycle-broken')
    expect(t.total.get('C')).toBe(3)
    // Everyone appears exactly once.
    expect(subtreeOf(t, t.rootId).sort()).toEqual(['A', 'B', 'C', 'D', 'ROOT'])
  })

  it('treats self-managers as top level', () => {
    const t = buildOrgTree([person('ROOT', null), person('X', 'X')], AS_OF)
    expect(t.notes.get('X')).toBe('self-manager')
    expect(t.rootId).toBe(COMPANY_ROOT)
  })

  it('keeps contractors and interns in the tree and in spans', () => {
    const rows = [
      person('M', null, { level: 'M1' }),
      person('E', 'M'),
      person('C', 'M', { employmentType: 'Contractor' }),
      person('I', 'M', { employmentType: 'Intern' }),
    ]
    const t = buildOrgTree(rows, AS_OF)
    expect(t.directs.get('M')).toBe(3)
  })

  it('handles an empty roster', () => {
    const t = buildOrgTree([], AS_OF)
    expect(t.people.size).toBe(0)
    expect(t.rootId).toBe(COMPANY_ROOT)
    expect(subtreeOf(t, t.rootId)).toEqual([])
  })

  it('answers chain and containment questions', () => {
    const t = buildOrgTree(smallCompany(), AS_OF)
    expect(chainTo(t, 'IC-7')).toEqual(['CEO', 'VP-B', 'DIR-1', 'MGR-3', 'IC-7'])
    expect(isWithin(t, 'IC-7', 'VP-B')).toBe(true)
    expect(isWithin(t, 'IC-7', 'VP-A')).toBe(false)
    expect(isWithin(t, 'VP-B', 'VP-B')).toBe(true)
    expect(isWithin(t, 'VP-B', COMPANY_ROOT)).toBe(true)
  })
})
