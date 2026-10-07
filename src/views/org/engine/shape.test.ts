/**
 * Team shape: people at each layer, spans by layer, the orgs under each direct report and their
 * tenure mix. Numbers recount from the roster, each mark opens exactly the records it counts, an
 * org opens with its leader as the filter, and orgs under the anonymity minimum are folded.
 */
import { describe, expect, it } from 'vitest'
import type { Requisition } from '@/data/schema'
import { orgKeyFigures } from './figures'
import { AS_OF, ctxFor, person, sampleCtx, smallCompany } from './fixtures'
import { buildOrgModel } from './model'
import {
  layerPeopleDrill,
  peopleByLayer,
  spanDrill,
  spansByLayer,
  teamPartDrill,
  teamShape,
  teamsUnder,
  tenureMixDrill,
  tenureMixUnder,
} from './shape'
import { subtreeOf } from './tree'

const scope = { label: 'Whole company', asOf: AS_OF }

describe('team shape on a small company', () => {
  const roster = [
    ...smallCompany(),
    person('CON-1', 'MGR-1', { employmentType: 'Contractor' }),
    person('INT-1', 'MGR-3', { employmentType: 'Intern', hireDate: '2026-06-01' }),
  ]
  const req: Requisition = {
    reqId: 'R-1',
    jobTitle: 'Engineer',
    department: 'Software',
    businessUnit: 'Systems & Software',
    location: 'San Jose',
    level: 'L3',
    hiringManagerId: 'MGR-3',
    openedDate: '2026-08-01',
    status: 'Open',
    reqType: null,
    priority: null,
    openings: 1,
  }
  const ctx = ctxFor({ employees: roster, requisitions: [req] })
  const m = buildOrgModel(ctx)
  const tree = m.tree

  it('counts people at each layer by role, top first', () => {
    const l = peopleByLayer(tree, 'CEO', null)
    expect(l.layers).toEqual(['Layer 1', 'Layer 2', 'Layer 3', 'Layer 4', 'Layer 5'])
    const at = (layer: string, role: string) =>
      l.rows.find((r) => r.layer === layer && r.role === role)!.people
    expect(at('Layer 1', 'People managers')).toBe(1)
    expect(at('Layer 3', 'People managers')).toBe(3) // MGR-1, MGR-2, DIR-1
    expect(at('Layer 4', 'Individual contributors')).toBe(6)
    expect(at('Layer 4', 'Contractors and interns')).toBe(1)
    expect(at('Layer 5', 'Contractors and interns')).toBe(1)
    expect(l.total).toBe(20)
    expect(l.rows.reduce((a, r) => a + r.people, 0)).toBe(subtreeOf(tree, 'CEO').length)
  })

  it('opens exactly the people behind a segment and a layer', () => {
    const l = peopleByLayer(tree, 'CEO', null)
    expect(layerPeopleDrill(tree, 'CEO', l, 'Layer 4', 'Individual contributors', scope)!.rows).toHaveLength(
      6,
    )
    expect(layerPeopleDrill(tree, 'CEO', l, 'Layer 4', null, scope)!.rows).toHaveLength(8)
  })

  it('places every people manager by layer, wide and narrow spans named', () => {
    const s = spansByLayer(tree, 'CEO', null, m.rules)
    expect(s.dots.map((d) => d.id).sort()).toEqual([
      'CEO',
      'DIR-1',
      'MGR-1',
      'MGR-2',
      'MGR-3',
      'VP-A',
      'VP-B',
    ])
    const mgr1 = s.dots.find((d) => d.id === 'MGR-1')!
    expect(mgr1.directs).toBe(6) // 5 ICs and a contractor: every worker type counts
    expect(s.dots.find((d) => d.id === 'MGR-2')!.flag).toBe('Span of 1')
    expect(s.narrow).toBe(3) // MGR-2, VP-B, DIR-1
    expect(spanDrill(tree, mgr1, scope)!.rows).toHaveLength(6)
  })

  it('sizes the org under each direct report with its open roles', () => {
    const t = teamsUnder(tree, 'CEO', null, m.reqs)
    // 9 each (VP-B's open role counts toward its size): ties go by name.
    expect(t.leaders.map((x) => x.id)).toEqual(['VP-A', 'VP-B'])
    const v = (leader: string, part: string) =>
      t.rows.find((r) => r.leaderId === leader && r.part === part)!.value
    expect(v('VP-A', 'Employees')).toBe(8)
    expect(v('VP-A', 'Contractors and interns')).toBe(1)
    expect(v('VP-B', 'Employees')).toBe(7)
    expect(v('VP-B', 'Contractors and interns')).toBe(1)
    expect(v('VP-B', 'Open roles')).toBe(1)
    // The whole org below the leader is the card's "org" count.
    expect(v('VP-A', 'Employees') + v('VP-A', 'Contractors and interns')).toBe(tree.total.get('VP-A'))
  })

  it('opens an org with its leader as the filter, and its open roles as requisitions', () => {
    const t = teamsUnder(tree, 'CEO', null, m.reqs)
    const people = teamPartDrill(tree, t, { leaderId: 'VP-A', part: 'Employees' }, m.reqRecords, scope)!
    expect(people.rows).toHaveLength(8)
    expect(people.filter).toEqual({ leaderId: 'VP-A' })
    const reqs = teamPartDrill(tree, t, { leaderId: 'VP-B', part: 'Open roles' }, m.reqRecords, scope)!
    expect(reqs.kind).toBe('requisitions')
    expect(reqs.rows).toHaveLength(1)
    const all = teamPartDrill(tree, t, { leaderId: 'VP-B', part: null }, m.reqRecords, scope)!
    expect(all.rows).toHaveLength(8)
  })

  it('folds orgs under the anonymity minimum into Other, and hides them when still too small', () => {
    const mix = tenureMixUnder(tree, 'CEO', null, AS_OF, 5)
    expect(mix.teams).toEqual(['Name VP-A', 'Name VP-B'])
    const small = tenureMixUnder(tree, 'VP-A', null, AS_OF, 5)
    // MGR-1 leads 6, MGR-2 leads 1: MGR-2's org alone is too small to show or fold.
    expect(small.teams).toEqual(['Name MGR-1'])
    expect(small.hiddenPeople).toBe(1)
    const vpb = mix.rows.filter((r) => r.team === 'Name VP-B')
    expect(vpb.find((r) => r.band === 'Under 1 yr')!.people).toBe(1)
    expect(vpb.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 10)
    const d = tenureMixDrill(tree, mix, 'Name VP-B', 'Under 1 yr', scope)!
    expect(d.rows).toHaveLength(1)
    expect(d.filter).toEqual({ leaderId: 'VP-B' })
  })

  it('counts only people matching the filters when they are on', () => {
    const f = buildOrgModel(ctxFor({ employees: roster }, { department: ['Software'] }))
    const l = peopleByLayer(f.tree, f.rootId, f.dims ? f.matches : null)
    expect(l.total).toBe(orgKeyFigures(f, f.rootId, f.matches).people.length)
  })
})

describe('team shape on the sample company', () => {
  const ctx = sampleCtx()
  const m = buildOrgModel(ctx)
  const s = teamShape(m, m.rootId, null, m.reqs)

  it('adds up to the key figures', () => {
    const k = orgKeyFigures(m, m.rootId, null)
    expect(s.layers.total).toBe(k.people.length)
    expect(s.layers.layers).toHaveLength(k.layers)
    expect(s.spans.dots).toHaveLength(k.managers.length)
    expect(s.spans.median).toBe(k.medianSpan)
  })

  it('names the planted wide spans', () => {
    const wide = s.spans.dots.filter((d) => d.directs >= m.rules.wideSpan).map((d) => d.name)
    expect(wide).toEqual(expect.arrayContaining(['Wei-Lun Lee', 'Rohan Murthy', 'Nisha Iyer']))
    for (const d of s.spans.dots) expect(spanDrill(m.tree, d, scope)?.rows.length).toBe(d.directs)
  })

  it('Filter to an org under the top keeps its people', () => {
    for (const leader of s.teams.leaders.slice(0, 4)) {
      const people = s.teams.rows
        .filter((r) => r.leaderId === leader.id && r.part !== 'Open roles')
        .reduce((a, r) => a + r.value, 0)
      const spec = teamPartDrill(m.tree, s.teams, { leaderId: leader.id, part: null }, m.reqRecords, scope)!
      expect(spec.rows).toHaveLength(people)
      // After Filter to, the org chart starts at the leader and counts the same people below them.
      const after = buildOrgModel({ ...ctx, filters: { ...ctx.filters, ...spec.filter } })
      expect(after.rootId).toBe(leader.id)
      expect(orgKeyFigures(after, after.rootId, null).people.length - 1).toBe(people)
    }
  })

  it('opens every tenure segment with as many people as it counts', () => {
    for (const r of s.tenure.rows) {
      const d = tenureMixDrill(m.tree, s.tenure, r.team, r.band, scope)
      expect(d?.rows.length ?? 0, `${r.team} ${r.band}`).toBe(r.people)
    }
    // Every org drawn has the anonymity minimum or more.
    for (const team of s.tenure.teams) {
      const n = s.tenure.rows.filter((r) => r.team === team).reduce((a, r) => a + r.people, 0)
      expect(n).toBeGreaterThanOrEqual(m.rules.minGroup)
    }
  })
})
