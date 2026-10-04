/**
 * Drill-down consistency: every number the Org chart shows opens exactly the records it counts,
 * suppressed figures open nothing, and zero counts do not open an empty panel.
 */
import { describe, expect, it } from 'vitest'
import type { Employee, Review } from '@/data/schema'
import { buildDrillTable } from '@/drill/records'
import { buildReviewIndex } from '@/lib/people'
import { median } from '@/lib/stats'
import { colorScheme, OTHER_KEY } from './colorBy'
import { exitImpact, teamStats } from './detail'
import {
  type DrillScope,
  directsDrill,
  flagKindDrill,
  keyFigureDrills,
  layerDrill,
  leaversDrill,
  orgDrill,
  peopleDrill,
  removedDrill,
  reportingChangesDrill,
  spanChangesDrill,
  teamChangeDrill,
} from './drill'
import { expandedForLevels } from './expand'
import {
  EXPORT_MAX_CARDS,
  EXPORT_MAX_WIDTH,
  exportCut,
  exportDepth,
  orgKeyFigures,
  peopleAtLayer,
} from './figures'
import { AS_OF, ctxFor, person, sampleCtx, smallCompany } from './fixtures'
import { computeFlags } from './flags'
import { layoutTree, visibleTree } from './layout'
import { buildOrgModel } from './model'
import { applyScenario, diffTrees } from './scenario'
import { countsText, planSlides, SMALL_PX } from './slides'
import { buildOrgTree, COMPANY_ROOT, subtreeOf } from './tree'

const scope: DrillScope = { label: 'Whole company', asOf: AS_OF }
const extraValues = (
  spec: { rows: readonly Employee[]; extra?: { values: (e: Employee) => Record<string, unknown> } },
  key: string,
) => spec.rows.map((e) => spec.extra!.values(e)[key] as number)

describe('key figures and their drills (small company)', () => {
  const tree = buildOrgTree(smallCompany(), AS_OF)
  const flags = computeFlags(tree)
  const reqs = new Map([
    [
      'MGR-2',
      [
        {
          reqId: 'R1',
          jobTitle: 'Engineer',
          level: 'L3',
          openings: 2,
          openedDate: '2026-08-01',
          location: 'Austin',
        },
      ],
    ],
  ])
  const reqRecords = new Map([
    [
      'R1',
      {
        reqId: 'R1',
        jobTitle: 'Engineer',
        businessUnit: 'Silicon Engineering',
        department: 'Digital Design',
        location: 'Austin',
        level: 'L3' as const,
        hiringManagerId: 'MGR-2',
        openedDate: '2026-08-01',
        status: 'Open' as const,
        reqType: 'New' as const,
        priority: 'Standard' as const,
        openings: 2,
      },
    ],
  ])

  it('counts people, managers, span, layers, open roles and flags', () => {
    const k = orgKeyFigures({ tree, flags, reqs }, tree.rootId, null)
    expect(k.people).toHaveLength(18)
    expect(k.managers.sort()).toEqual(['CEO', 'DIR-1', 'MGR-1', 'MGR-2', 'MGR-3', 'VP-A', 'VP-B'])
    // Spans 2, 2, 1, 5, 1, 1, 5.
    expect(k.medianSpan).toBe(2)
    expect(k.layers).toBe(5)
    expect(k.openReqIds).toEqual(['R1'])
    expect(k.flagged.sort()).toEqual(['DIR-1', 'MGR-2', 'VP-B'])
  })

  it('every tile opens exactly the records it counts', () => {
    const k = orgKeyFigures({ tree, flags, reqs }, tree.rootId, null)
    const d = keyFigureDrills(tree, tree.rootId, k, scope, flags, reqRecords)
    expect(d.people!.rows).toHaveLength(k.people.length)
    expect(d.managers!.rows).toHaveLength(k.managers.length)
    expect(d.openRoles!.rows.map((r) => r.reqId)).toEqual(k.openReqIds)
    expect(d.flagged!.rows).toHaveLength(k.flagged.length)
    // A median opens the records measured, with the measured value as a column.
    expect(median(extraValues(d.medianSpan!, 'orgDirects'))).toBe(k.medianSpan)
    expect(d.medianSpan!.note).toContain('Median span = 2.0')
    // A maximum opens everyone with the value, deepest first.
    const layers = extraValues(d.layers!, 'orgLayer')
    expect(Math.max(...layers)).toBe(k.layers)
    expect(layers[0]).toBe(k.layers)
    // Everyone on the chart is active, so the status column is hidden.
    expect(d.people!.hide).toEqual(['status'])
  })

  it('counts only the people matching the filters when they are on, from a focused root', () => {
    const inSoftware = (id: string) => tree.people.get(id)?.department === 'Software'
    const k = orgKeyFigures({ tree, flags, reqs }, 'VP-B', inSoftware)
    expect(k.people.sort()).toEqual(
      ['VP-B', 'DIR-1', 'MGR-3', 'IC-7', 'IC-8', 'IC-9', 'IC-10', 'IC-11'].sort(),
    )
    expect(k.layers).toBe(4)
    expect(k.openReqIds).toEqual([])
    const d = keyFigureDrills(tree, 'VP-B', k, { ...scope, filtered: true }, flags, reqRecords)
    expect(d.people!.rows).toHaveLength(k.people.length)
    expect(d.people!.title).toContain('matching the filters')
    expect(d.people!.subtitle).toContain('people matching the filters')
    // Nothing behind a zero: no empty panel.
    expect(d.openRoles).toBeNull()
  })

  it('card counts open the direct reports and the whole org', () => {
    for (const id of tree.people.keys()) {
      const directs = tree.directs.get(id) ?? 0
      const total = tree.total.get(id) ?? 0
      expect(directsDrill(tree, id, scope)?.rows.length ?? 0).toBe(directs)
      expect(orgDrill(tree, id, scope)?.rows.length ?? 0).toBe(total)
    }
    expect(countsText(9, 1557)).toBe('9 direct · 1,557 org')
    expect(countsText(0, 0)).toBe('')
  })

  it('the flags table opens everyone with a flag kind', () => {
    const spec = flagKindDrill(tree, tree.people.keys(), 'narrow-span', flags, scope)!
    expect(spec.rows.map((e) => e.employeeId).sort()).toEqual(['DIR-1', 'MGR-2', 'VP-B'])
  })
})

describe('detail panel and exit simulation drills', () => {
  const rows = [
    ...smallCompany(),
    person('C-1', 'MGR-1', { employmentType: 'Contractor' }),
    person('LEFT-1', 'MGR-1', {
      terminationDate: '2026-05-01',
      terminationType: 'Voluntary',
      regrettable: true,
    }),
    person('LEFT-2', 'MGR-1', { terminationDate: '2026-02-01', terminationType: 'Involuntary' }),
    person('LEFT-OLD', 'MGR-1', {
      terminationDate: '2024-05-01',
      terminationType: 'Voluntary',
      regrettable: true,
    }),
  ]
  const tree = buildOrgTree(rows, AS_OF)

  it('team figures carry the people they count', () => {
    const s = teamStats(tree, 'MGR-1', rows)
    expect(s.ids.directs).toHaveLength(s.directs)
    expect(s.ids.org).toHaveLength(s.totalOrg)
    expect(s.ids.contingent).toEqual(['C-1'])
    expect(s.exits.map((e) => e.employeeId).sort()).toEqual(['LEFT-1', 'LEFT-2'])
    expect(s.exits).toHaveLength(s.exits12)
    expect(s.regretted).toHaveLength(s.regrettedExits12)
    expect(s.ids.tenure).toHaveLength(s.totalOrg)
    const leavers = leaversDrill('Name MGR-1', s.exits, false, scope)!
    expect(leavers.rows).toHaveLength(2)
    expect(leavers.rows[0].employeeId).toBe('LEFT-1')
    expect(leaversDrill('Name MGR-1', [], true, scope)).toBeNull()
  })

  it('a suppressed average (fewer than 5 people) carries no records', () => {
    const s = teamStats(tree, 'MGR-2', rows)
    expect(s.avgTenure).toBeNull()
    expect(s.ids.tenure).toEqual([])
    expect(peopleDrill(tree, s.ids.tenure, { title: 'Tenure' })).toBeNull()
  })

  it('exit counts match the people listed', () => {
    const reviews: Review[] = [
      { employeeId: 'IC-1', cycle: '2026 Mid-year', cycleDate: '2026-06-30', rating: 5 },
    ]
    const x = exitImpact(tree, 'MGR-1', buildReviewIndex(reviews))
    expect(x.peerIds).toHaveLength(x.peers)
    expect(x.managerTeamAfter).toHaveLength(x.managerSpan!.after)
    expect(x.unratedIds).toHaveLength(x.unrated)
    expect(x.unratedIds).not.toContain('IC-1')
    const after = applyScenario(tree, [{ kind: 'exit', personId: 'MGR-1' }]).tree
    expect(new Set(x.managerTeamAfter)).toEqual(new Set(after.children.get('VP-A')))
  })
})

describe('sandbox drills', () => {
  const base = buildOrgTree(smallCompany(), AS_OF)
  const after = applyScenario(base, [
    { kind: 'move', personId: 'MGR-1', toManagerId: 'VP-B', mode: 'person' },
    { kind: 'exit', personId: 'MGR-2' },
  ]).tree
  const d = diffTrees(base, after)
  const sc: DrillScope = { label: 'Reorg sandbox', asOf: AS_OF, scenario: true }

  it('every diff number opens the people it affects', () => {
    const changes = reportingChangesDrill(after, d.reportingChanges, sc)!
    expect(changes.rows).toHaveLength(d.reportingChanges.length)
    expect(spanChangesDrill(base, after, d.spanChanges, sc)!.rows).toHaveLength(d.spanChanges.length)
    expect(removedDrill(base, d.removed, sc)!.rows.map((e) => e.employeeId)).toEqual(['MGR-2'])
    for (const l of d.layers.byDepth) {
      expect(peopleAtLayer(base, base.rootId, l.layer)).toHaveLength(l.before)
      expect(peopleAtLayer(after, after.rootId, l.layer)).toHaveLength(l.after)
      if (l.after)
        expect(
          layerDrill(after, peopleAtLayer(after, after.rootId, l.layer), l.layer, sc)!.rows,
        ).toHaveLength(l.after)
    }
    expect(changes.subtitle).toBe('Reorg sandbox · what-if on the org as of 30 Sep 2026')
  })

  it('a span change opens who joins and leaves that team', () => {
    for (const s of d.spanChanges) {
      const spec = teamChangeDrill(base, after, s.id, sc)
      const joins =
        spec?.rows.filter((e) => spec.extra!.values(e).teamChange === 'Joins the team').length ?? 0
      const leaves = (spec?.rows.length ?? 0) - joins
      expect(joins - leaves).toBe(s.delta)
    }
  })
})

describe('on the sample company', () => {
  const ctx = sampleCtx()
  const m = buildOrgModel(ctx)
  const t = m.tree

  it('the key figures match the reviewed numbers and every drill shows that many rows', () => {
    const k = orgKeyFigures(m, m.rootId, null)
    expect(k.people).toHaveLength(1558)
    expect(k.managers).toHaveLength(263)
    expect(k.medianSpan).toBe(6)
    expect(k.layers).toBe(6)
    expect(k.openReqIds).toHaveLength(114)
    const d = keyFigureDrills(t, m.rootId, k, scope, m.flags, m.reqRecords)
    // Through the drill panel's own table builder, so the count on screen is the count in the panel.
    expect(buildDrillTable(d.people!, ctx).rows).toHaveLength(1558)
    expect(buildDrillTable(d.managers!, ctx).rows).toHaveLength(263)
    expect(buildDrillTable(d.openRoles!, ctx).rows).toHaveLength(114)
    expect(buildDrillTable(d.flagged!, ctx).rows).toHaveLength(k.flagged.length)
    const ceo = directsDrill(t, t.rootId, scope)!
    expect(buildDrillTable(ceo, ctx).rows).toHaveLength(t.directs.get(t.rootId)!)
    expect(orgDrill(t, t.rootId, scope)!.rows).toHaveLength(1557)
  })

  it('a department filter counts only the matching people', () => {
    const fm = buildOrgModel(sampleCtx({ department: ['Analog & Mixed-Signal'] }))
    const k = orgKeyFigures(fm, fm.rootId, fm.matches)
    expect(k.people.length).toBeGreaterThan(0)
    expect(k.people.length).toBeLessThan(1558)
    expect(k.people.every((id) => fm.tree.people.get(id)!.department === 'Analog & Mixed-Signal')).toBe(true)
  })

  it('exports the top levels of a big chart and the whole of a small one', () => {
    const all = visibleTree(t, m.rootId, new Set(t.people.keys()))
    const depth = exportDepth(all, EXPORT_MAX_CARDS)!
    expect(depth).toBeGreaterThanOrEqual(1)
    const cut = visibleTree(t, m.rootId, new Set(t.people.keys()), { maxDepth: depth })
    expect(subtreeCount(cut)).toBeLessThanOrEqual(EXPORT_MAX_CARDS)
    for (const levels of ['3', '4', 'all'] as const) {
      const ids = expandedForLevels(t, m.rootId, levels)
      const vtree = visibleTree(t, m.rootId, ids)
      const img = exportCut(t, m.rootId, ids, { vtree, layout: layoutTree(vtree) })
      expect(img.layout.width).toBeLessThanOrEqual(EXPORT_MAX_WIDTH)
      expect(img.layout.cards.length).toBeLessThanOrEqual(EXPORT_MAX_CARDS)
      expect(img.layout.byId.has(m.rootId)).toBe(true)
    }
    const ids = expandedForLevels(t, m.rootId, '2')
    const two = visibleTree(t, m.rootId, ids)
    expect(exportDepth(two, EXPORT_MAX_CARDS)).toBeNull()
    const whole = layoutTree(two)
    expect(exportCut(t, m.rootId, ids, { vtree: two, layout: whole })).toEqual({ layout: whole, depth: null })
  })

  it('keeps a department color when the chart focuses on a sub-org', () => {
    const everyone = [...t.people.values()]
    const whole = colorScheme('department', everyone, ctx.asOf)
    const vp = t.children.get(t.rootId)!.find((id) => (t.total.get(id) ?? 0) > 100)!
    const sub = subtreeOf(t, vp).map((id) => t.people.get(id)!)
    const focused = colorScheme('department', everyone, ctx.asOf, sub)
    for (const e of sub) expect(focused.swatchOf(e)).toEqual(whole.swatchOf(e))
    // The legend lists only what is on screen, counted on screen.
    const shownKeys = new Set(sub.map((e) => focused.keyOf(e)))
    expect(focused.legend.every((k) => shownKeys.has(k.key === OTHER_KEY ? OTHER_KEY : k.key))).toBe(true)
    expect(focused.legend.reduce((s, k) => s + k.count, 0)).toBe(sub.length)
  })

  it('two-level slides keep their smallest text at 7 pt or more', () => {
    const scheme = colorScheme('businessUnit', [...t.people.values()], ctx.asOf)
    const leaders = [...t.people.keys()].filter((id) => (t.directs.get(id) ?? 0) > 0)
    const plans = planSlides(t, leaders, { levels: 2, scheme, asOf: ctx.asOf })
    for (const p of plans) if (p.levels === 2) expect(SMALL_PX * p.ptPerPx).toBeGreaterThanOrEqual(7)
  })
})

describe('drills on an uploaded roster', () => {
  it('opens leavers through the drill table with their exit columns', () => {
    const rows = [
      ...smallCompany(),
      person('GONE', 'MGR-1', {
        terminationDate: '2026-06-01',
        terminationType: 'Voluntary',
        regrettable: false,
      }),
    ]
    const ctx = ctxFor({ employees: rows })
    const tree = buildOrgTree(rows, AS_OF)
    const s = teamStats(tree, 'MGR-1', rows)
    const table = buildDrillTable(leaversDrill('Name MGR-1', s.exits, false, scope)!, ctx)
    expect(table.rows).toHaveLength(1)
    expect(table.columns.map((c) => c.key)).toContain('terminationDate')
    expect(table.rows[0].status).toBe('Left')
  })

  it('the whole-company card opens everyone', () => {
    const rows = [person('A', null), person('B', null), person('C', 'A')]
    const tree = buildOrgTree(rows, AS_OF)
    expect(tree.rootId).toBe(COMPANY_ROOT)
    expect(orgDrill(tree, COMPANY_ROOT, scope)!.rows).toHaveLength(3)
  })
})

function subtreeCount(n: { children: { children: unknown[] }[] }): number {
  let total = 1
  for (const c of n.children) total += subtreeCount(c as typeof n)
  return total
}
