/**
 * Smoke test on the generated sample company (src/data/sample/README.md, "Span outliers"): the
 * planted span outliers and the new manager with a large team are flagged, every active person
 * appears exactly once, the default view lays out without overlaps, and the whole pipeline stays
 * inside its time budget.
 */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { colorScheme } from './colorBy'
import { exitImpact } from './detail'
import { defaultExpanded } from './expand'
import { sampleCtx } from './fixtures'
import { flagSummary } from './flags'
import { layoutTree, visibleIds, visibleTree } from './layout'
import { buildOrgModel, peopleManagers } from './model'
import { shownRows } from './rows'
import { applyScenario, checkAction, diffTrees } from './scenario'
import { searchPeople } from './search'
import { defaultSlideLeaders, planSlides } from './slides'
import { entryPoints, subtreeOf } from './tree'

const ctx = sampleCtx()

describe('Org chart engine on the sample company', () => {
  it('builds the tree, flags and default layout in under 150 ms', () => {
    let cards = 0
    const ms = bestCostMs(() => {
      const m = buildOrgModel(ctx)
      const expanded = new Set([m.rootId, ...(m.tree.children.get(m.rootId) ?? [])])
      cards = layoutTree(visibleTree(m.tree, m.rootId, expanded, { reqs: m.reqs })).cards.length
    })
    expect(ms).toBeLessThan(150)
    expect(cards).toBeGreaterThan(10)
  })

  it('has one root (the CEO) and everyone active exactly once', () => {
    const m = buildOrgModel(ctx)
    const t = m.tree
    expect(t.people.size).toBe(1558)
    expect(t.rootId).toBe('E10001')
    const all = subtreeOf(t, t.rootId)
    expect(all).toHaveLength(1558)
    expect(new Set(all).size).toBe(1558)
    expect(t.total.get(t.rootId)).toBe(1557)
    expect(t.issues.cycles).toEqual([])
    expect(peopleManagers(ctx).managers).toBe(263)
  })

  it('flags the planted span outliers: three managers with 12+ and four with exactly one', () => {
    const m = buildOrgModel(ctx)
    const name = (id: string) => m.tree.people.get(id)!.name
    const wide = [...m.flags].filter(([, fs]) => fs.some((f) => f.kind === 'wide-span'))
    expect(wide.map(([id]) => [name(id), m.tree.directs.get(id)]).sort()).toEqual([
      ['Nisha Iyer', 12],
      ['Rohan Murthy', 13],
      ['Wei-Lun Lee', 14],
    ])
    const narrow = [...m.flags].filter(([, fs]) => fs.some((f) => f.kind === 'narrow-span'))
    expect(narrow.map(([id]) => m.tree.people.get(id)!.jobTitle).sort()).toEqual([
      'Director, Hardware Engineering',
      'Director, Tax & Treasury',
      'Legal Operations Manager',
      'Product Marketing Lead',
    ])
    const newMgr = [...m.flags].filter(([, fs]) => fs.some((f) => f.kind === 'new-manager-large-team'))
    expect(newMgr.map(([id]) => [name(id), m.tree.directs.get(id)])).toEqual([['Arjun Deshpande', 9]])
    const summary = flagSummary(m.flags)
    expect(summary.find((s) => s.kind === 'new-hire')!.people).toBeGreaterThan(50)
  })

  it('lays out the whole company expanded without overlapping cards', () => {
    const m = buildOrgModel(ctx)
    const t0 = performance.now()
    const v = visibleTree(m.tree, m.rootId, new Set(m.tree.people.keys()))
    const layout = layoutTree(v)
    expect(performance.now() - t0).toBeLessThan(150)
    expect(layout.cards).toHaveLength(1558)
    // Overlap check on a sweep over x.
    const cards = layout.cards.slice().sort((a, b) => a.x - b.x)
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length && cards[j].x < cards[i].x + cards[i].w; j++) {
        const a = cards[i]
        const b = cards[j]
        const overlap = a.y < b.y + b.h && b.y < a.y + a.h
        if (overlap) throw new Error(`${a.id} overlaps ${b.id}`)
      }
    }
    const rows = shownRows(m.tree, visibleIds(v), m.flags)
    expect(rows).toHaveLength(1558)
    for (const r of rows) {
      expect(Number.isFinite(r.directs)).toBe(true)
      expect(Number.isFinite(r.totalOrg)).toBe(true)
    }
  })

  it('roots the chart at the leader filter', () => {
    const lee = buildOrgModel(ctx).tree
    const id = [...lee.people.values()].find((e) => e.name === 'Wei-Lun Lee')!.employeeId
    const m = buildOrgModel(sampleCtx({ leaderId: id }))
    expect(m.rootId).toBe(id)
  })

  it('blocks moving a manager under their own report and diffs a real move', () => {
    const m = buildOrgModel(ctx)
    const t = m.tree
    const vp = t.children.get(t.rootId)!.find((c) => (t.total.get(c) ?? 0) > 100)!
    const deep = subtreeOf(t, vp).find((id) => (t.depth.get(id) ?? 0) >= 4)!
    const res = checkAction(t, { kind: 'move', personId: vp, toManagerId: deep, mode: 'team' })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('cycle')

    const wide = [...m.flags].find(([, fs]) => fs.some((f) => f.kind === 'wide-span'))![0]
    const kid = t.children.get(wide)![0]
    const peer = t.children.get(t.parent.get(wide)!)!.find((c) => c !== wide && (t.directs.get(c) ?? 0) > 0)!
    const after = applyScenario(t, [{ kind: 'move', personId: kid, toManagerId: peer, mode: 'person' }])
    expect(after.skipped).toEqual([])
    const d = diffTrees(t, after.tree)
    expect(d.spanChanges.find((s) => s.id === wide)).toMatchObject({ delta: -1 })
    expect(d.spanChanges.find((s) => s.id === peer)).toMatchObject({ delta: 1 })
    expect(d.layers.after).toBe(d.layers.before)
  })

  it('finds people by name, simulates an exit and plans slides for the top team', () => {
    const m = buildOrgModel(ctx)
    const hit = searchPeople(m.tree.people.values(), 'arjun desh')[0]
    expect(m.tree.people.get(hit.id)!.name).toBe('Arjun Deshpande')
    const x = exitImpact(m.tree, hit.id, m.reviews)
    expect(x.directs).toHaveLength(9)
    expect(x.cycle).toBe('2026 Mid-year')
    for (const b of x.backfills) expect(b.rating).toBeGreaterThanOrEqual(4)

    const scheme = colorScheme('department', [...m.tree.people.values()], ctx.asOf)
    const leaders = defaultSlideLeaders(m.tree, m.rootId)
    const plans = planSlides(m.tree, leaders, { levels: 2, scheme, asOf: ctx.asOf })
    expect(plans.length).toBe(leaders.length)
    for (const p of plans) {
      expect(p.ptPerPx * 14).toBeGreaterThanOrEqual(6)
      for (const c of p.cards) expect(Number.isFinite(c.x + c.y + c.w + c.h)).toBe(true)
    }
  })
})

describe('Filters on the sample company', () => {
  it('dims everyone outside Design Verification and opens the way down to them', () => {
    const m = buildOrgModel(sampleCtx({ department: ['Design Verification'] }))
    expect(m.dims).toBe(true)
    const entries = entryPoints(m.tree, m.rootId, m.matches)
    expect(entries.length).toBeGreaterThan(0)
    // The largest entry is the Design Verification leader, whose manager is outside the department.
    const top = m.tree.people.get(entries[0])!
    expect(top.department).toBe('Design Verification')
    expect(m.matches(m.tree.parent.get(entries[0])!)).toBe(false)
    const ids = defaultExpanded(m.tree, m.rootId, '2', m.matches)
    const layout = layoutTree(visibleTree(m.tree, m.rootId, ids))
    expect(layout.byId.has(entries[0])).toBe(true)
  })
})
