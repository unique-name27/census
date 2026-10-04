import { describe, expect, it } from 'vitest'
import { AS_OF, person, smallCompany } from './fixtures'
import {
  applyScenario,
  checkAction,
  describeAction,
  diffSummary,
  diffTrees,
  movingIds,
  rippleOf,
  rippleTeams,
  signedCount,
} from './scenario'
import { buildOrgTree, layersBelow } from './tree'

const base = buildOrgTree(smallCompany(), AS_OF)

describe('scenario moves', () => {
  it('moves a person alone; their reports roll up to the old manager', () => {
    const r = applyScenario(base, [{ kind: 'move', personId: 'MGR-1', toManagerId: 'VP-B', mode: 'person' }])
    expect(r.skipped).toEqual([])
    expect(r.tree.parent.get('MGR-1')).toBe('VP-B')
    expect(r.tree.parent.get('IC-1')).toBe('VP-A')
    expect(r.tree.directs.get('VP-A')).toBe(6)
    expect(r.tree.directs.get('VP-B')).toBe(2)
    // The datasets and the base tree are untouched.
    expect(base.parent.get('MGR-1')).toBe('VP-A')
  })

  it('moves a person with their whole org', () => {
    const r = applyScenario(base, [{ kind: 'move', personId: 'MGR-1', toManagerId: 'VP-B', mode: 'team' }])
    expect(r.tree.parent.get('IC-1')).toBe('MGR-1')
    expect(r.tree.total.get('VP-B')).toBe(13)
    expect(r.tree.total.get('VP-A')).toBe(2)
  })

  it('blocks moving a manager under their own report, in both modes, and explains why', () => {
    for (const mode of ['person', 'team'] as const) {
      const res = checkAction(base, { kind: 'move', personId: 'VP-A', toManagerId: 'IC-1', mode })
      expect(res.ok).toBe(false)
      expect(res.code).toBe('cycle')
      expect(res.reason).toContain('reporting loop')
      expect(res.reason).toContain('Name IC-1 → Name MGR-1 → Name VP-A')
      expect(res.reason).toMatch(/^Name IC-1 already reports up to Name VP-A /)
    }
    const r = applyScenario(base, [{ kind: 'move', personId: 'VP-B', toManagerId: 'IC-9', mode: 'team' }])
    expect(r.applied).toEqual([])
    expect(r.skipped).toHaveLength(1)
    expect(r.tree.parent.get('VP-B')).toBe('CEO')
  })

  it('blocks no-op and unknown moves', () => {
    expect(
      checkAction(base, { kind: 'move', personId: 'IC-1', toManagerId: 'IC-1', mode: 'person' }).code,
    ).toBe('self')
    expect(
      checkAction(base, { kind: 'move', personId: 'IC-1', toManagerId: 'MGR-1', mode: 'person' }).code,
    ).toBe('same-manager')
    expect(
      checkAction(base, { kind: 'move', personId: 'NOPE', toManagerId: 'MGR-1', mode: 'person' }).code,
    ).toBe('unknown-person')
    expect(
      checkAction(base, { kind: 'move', personId: 'IC-1', toManagerId: 'NOPE', mode: 'person' }).code,
    ).toBe('unknown-manager')
  })

  it('warns about wide spans, level inversions, contractors and emptied teams without blocking', () => {
    const res = checkAction(base, { kind: 'move', personId: 'IC-6', toManagerId: 'IC-1', mode: 'person' })
    expect(res.ok).toBe(true)
    expect(res.warnings.join(' ')).toContain('same or a lower level')
    expect(res.warnings.join(' ')).toContain('Name MGR-2 would have no direct reports left.')
    const rows = [...smallCompany(), person('CTR', 'VP-A', { employmentType: 'Contractor' })]
    const t = buildOrgTree(rows, AS_OF)
    expect(
      checkAction(t, { kind: 'move', personId: 'IC-6', toManagerId: 'CTR', mode: 'person' }).warnings,
    ).toContain('Name CTR is a contractor.')
  })

  it('simulates an exit: reports roll up to the manager; the top of the chart stays', () => {
    const r = applyScenario(base, [{ kind: 'exit', personId: 'MGR-1' }])
    expect(r.tree.people.has('MGR-1')).toBe(false)
    expect(r.tree.parent.get('IC-1')).toBe('VP-A')
    expect(r.tree.directs.get('VP-A')).toBe(6)
    expect(checkAction(base, { kind: 'exit', personId: 'CEO' }).code).toBe('top')
  })

  it('applies a sequence and skips steps that no longer apply', () => {
    const r = applyScenario(base, [
      { kind: 'exit', personId: 'MGR-2' },
      { kind: 'move', personId: 'IC-6', toManagerId: 'MGR-2', mode: 'person' },
      { kind: 'move', personId: 'IC-6', toManagerId: 'MGR-1', mode: 'person' },
    ])
    expect(r.applied).toHaveLength(2)
    expect(r.skipped[0].reason).toContain('not in the chart')
    expect(r.tree.directs.get('MGR-1')).toBe(6)
  })
})

describe('ripple preview', () => {
  it('shows who gains and loses reports', () => {
    const r = rippleOf(base, { kind: 'move', personId: 'MGR-1', toManagerId: 'VP-B', mode: 'person' })
    expect(r.ok).toBe(true)
    expect(r.oldManager).toEqual({ id: 'VP-A', before: 2, after: 6 })
    expect(r.newManager).toEqual({ id: 'VP-B', before: 1, after: 2 })
    expect(r.rolledUp).toHaveLength(5)
    expect(r.peopleMoving).toBe(1)
    expect(r.crossDept).toBe(1)
    const team = rippleOf(base, { kind: 'move', personId: 'MGR-1', toManagerId: 'VP-B', mode: 'team' })
    expect(team.oldManager).toEqual({ id: 'VP-A', before: 2, after: 1 })
    expect(team.peopleMoving).toBe(6)
    expect(team.movingIds).toHaveLength(6)
    expect(team.movingIds[0]).toBe('MGR-1')
    // Only MGR-1's reporting line changes in a team move; their reports keep MGR-1.
    expect(team.crossDept).toBe(1)
    expect(team.crossDeptIds).toEqual(['MGR-1'])
    const blocked = rippleOf(base, { kind: 'move', personId: 'VP-A', toManagerId: 'IC-2', mode: 'team' })
    expect(blocked.ok).toBe(false)
    expect(blocked.changes).toEqual([])
    expect(describeAction(base, team.action)).toBe('Move Name MGR-1 and their org to Name VP-B')
  })
})

describe('ripple and diff agree', () => {
  const cases = [
    { kind: 'move' as const, personId: 'MGR-1', toManagerId: 'VP-B', mode: 'team' as const },
    { kind: 'move' as const, personId: 'MGR-1', toManagerId: 'VP-B', mode: 'person' as const },
    { kind: 'move' as const, personId: 'DIR-1', toManagerId: 'VP-A', mode: 'person' as const },
    { kind: 'exit' as const, personId: 'VP-B' },
  ]
  it.each(cases)('cross-department count and people moving match the diff for %o', (action) => {
    const r = rippleOf(base, action)
    const after = applyScenario(base, [action]).tree
    const d = diffTrees(base, after)
    expect(r.crossDeptIds.sort()).toEqual(d.crossDept.map((c) => c.id).sort())
    expect(r.crossDept).toBe(d.crossDept.length)
    expect(r.changes.map((c) => c.id).sort()).toEqual(d.reportingChanges.map((c) => c.id).sort())
    expect(movingIds(base, action)).toEqual(r.movingIds)
    // The teams the preview lists are the teams the scenario produces.
    const teams = rippleTeams(base, r)
    if (r.oldManager) {
      expect(teams.oldAfter).toHaveLength(r.oldManager.after)
      expect(new Set(teams.oldAfter)).toEqual(new Set(after.children.get(r.oldManager.id) ?? []))
    }
    if (r.newManager) {
      expect(teams.newAfter).toHaveLength(r.newManager.after)
      expect(new Set(teams.newAfter)).toEqual(new Set(after.children.get(r.newManager.id) ?? []))
    }
  })
})

describe('diffTrees', () => {
  it('reports span changes, managers created and emptied, layers and cross-department moves', () => {
    const after = applyScenario(base, [
      { kind: 'move', personId: 'MGR-3', toManagerId: 'IC-1', mode: 'team' },
    ]).tree
    const d = diffTrees(base, after)
    expect(d.reportingChanges).toEqual([
      { id: 'MGR-3', name: 'Name MGR-3', fromId: 'DIR-1', from: 'Name DIR-1', toId: 'IC-1', to: 'Name IC-1' },
    ])
    expect(d.managersCreated).toEqual([{ id: 'IC-1', name: 'Name IC-1', directs: 1 }])
    expect(d.managersEmptied).toEqual([{ id: 'DIR-1', name: 'Name DIR-1', before: 1 }])
    expect(d.spanChanges.map((s) => [s.id, s.before, s.after])).toEqual([
      ['DIR-1', 1, 0],
      ['IC-1', 0, 1],
    ])
    expect(d.newSpansOfOne.map((x) => x.id)).toEqual(['IC-1'])
    expect(d.layers.before).toBe(layersBelow(base, 'CEO'))
    expect(d.layers.after).toBe(6)
    expect(d.crossDept).toEqual([
      { id: 'MGR-3', name: 'Name MGR-3', department: 'Software', managerDepartment: 'Digital Design' },
    ])
    expect(d.managers).toEqual({ before: 7, after: 7 })
    expect(diffSummary(d)).toBe('1 person changes manager · 2 spans change · layers 5 → 6')
  })

  it('lists exits as removed people', () => {
    const after = applyScenario(base, [{ kind: 'exit', personId: 'MGR-2' }]).tree
    const d = diffTrees(base, after)
    expect(d.removed).toEqual([{ id: 'MGR-2', name: 'Name MGR-2' }])
    expect(d.reportingChanges.map((r) => r.id)).toEqual(['IC-6'])
    expect(d.managers).toEqual({ before: 7, after: 6 })
  })
})

describe('signedCount', () => {
  it('signs a gain and a loss the way every delta reads', () => {
    expect(signedCount(1)).toBe('+1')
    expect(signedCount(12)).toBe('+12')
    expect(signedCount(-1)).toBe('−1')
    expect(signedCount(-1200)).toBe('−1,200')
    expect(signedCount(0)).toBe('0')
  })
})
