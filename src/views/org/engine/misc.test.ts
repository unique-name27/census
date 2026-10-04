import { describe, expect, it } from 'vitest'
import type { Employee, Review } from '@/data/schema'
import { buildReviewIndex } from '@/lib/people'
import { COLOR_BY_LABELS, colorScheme, OTHER_KEY, swatchCss } from './colorBy'
import { exitImpact, ratingOf, teamStats } from './detail'
import { AS_OF, ctxFor, person, smallCompany } from './fixtures'
import { computeFlags } from './flags'
import { layoutTree, reqCardId, visibleIds, visibleTree } from './layout'
import { buildOrgModel, peopleManagers } from './model'
import { flagRows, moveRows, rosterRows, shownRows } from './rows'
import { applyScenario } from './scenario'
import { searchPeople } from './search'
import { defaultSlideLeaders, planSlides, SLIDE } from './slides'
import { buildOrgTree, COMPANY_ROOT } from './tree'

const base = buildOrgTree(smallCompany(), AS_OF)

describe('searchPeople', () => {
  const people: Employee[] = [
    person('E1', null, {
      name: 'Wei-Lun Lee',
      jobTitle: 'Test Engineering Manager',
      department: 'Test & Product Engineering',
    }),
    person('E2', null, { name: 'Leena Rao', jobTitle: 'Design Engineer' }),
    person('E3', null, { name: 'Sam Doe', jobTitle: 'Lead Engineer', department: 'Lee Studies' }),
    person('E4', null, { name: 'Ana Lima', location: 'Austin' }),
  ]
  it('ranks name matches above title and department matches', () => {
    expect(searchPeople(people, 'lee').map((h) => h.id)).toEqual(['E2', 'E1', 'E3'])
    expect(searchPeople(people, 'leena rao')[0].id).toBe('E2')
    expect(searchPeople(people, 'e4')[0].id).toBe('E4')
    expect(searchPeople(people, 'austin').map((h) => h.id)).toEqual(['E4'])
    expect(searchPeople(people, '  ')).toEqual([])
  })
  it('ignores accents and case, and breaks ties by org size', () => {
    const p = [person('A', null, { name: 'José Ruiz' }), person('B', null, { name: 'Jose Ruiz' })]
    const hits = searchPeople(p, 'JOSE', { orgSize: (id) => (id === 'B' ? 10 : 0) })
    expect(hits.map((h) => h.id)).toEqual(['B', 'A'])
  })
})

describe('colorScheme', () => {
  it('gives the largest groups fixed slots and folds the rest into Other when there are more than eight', () => {
    const rows: Employee[] = []
    for (let d = 0; d < 10; d++)
      for (let i = 0; i <= 10 - d; i++) rows.push(person(`P${d}-${i}`, null, { department: `D${d}` }))
    const s = colorScheme('department', rows, AS_OF)
    expect(s.legend.map((k) => k.label)).toEqual(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'Other (3)'])
    expect(s.keyOf(rows[rows.length - 1])).toBe(OTHER_KEY)
    expect(swatchCss(s.swatchOf(rows[0]))).toBe('var(--s1)')
    expect(swatchCss(s.swatchOf(rows[rows.length - 1]))).toBe('var(--deemph)')
  })
  it('uses the sequential ramp for level groups and tenure bands', () => {
    const rows = [
      person('A', null, { level: 'L1' }),
      person('B', null, { level: 'M2' }),
      person('C', null, { level: null }),
    ]
    const s = colorScheme('level', rows, AS_OF)
    expect(s.legend.map((k) => k.label)).toEqual(['L1-L2', 'M2 Director', 'No level'])
    expect(swatchCss(s.swatchOf(rows[1]))).toBe('var(--seq-600)')
    const t = colorScheme('tenure', [person('N', null, { hireDate: '2026-06-01' })], AS_OF)
    expect(t.legend).toEqual([
      { key: 'Under 1 yr', label: 'Under 1 yr', swatch: { kind: 'seq', step: 200 }, count: 1 },
    ])
    expect(colorScheme('none', rows, AS_OF).swatchOf(rows[0])).toBeNull()
    expect(COLOR_BY_LABELS.businessUnit).toBe('Business unit')
  })
})

describe('detail and exit simulation', () => {
  const reviews: Review[] = [
    { employeeId: 'IC-1', cycle: '2026 Mid-year', cycleDate: '2026-06-30', rating: 5 },
    { employeeId: 'IC-2', cycle: '2026 Mid-year', cycleDate: '2026-06-30', rating: 4 },
    { employeeId: 'IC-2', cycle: '2025 Annual', cycleDate: '2025-12-15', rating: 3, potential: 'High' },
    { employeeId: 'IC-3', cycle: '2026 Mid-year', cycleDate: '2026-06-30', rating: 3 },
    { employeeId: 'IC-4', cycle: '2025 Annual', cycleDate: '2025-12-15', rating: 5 },
  ]
  const idx = buildReviewIndex(reviews)

  it('lists direct reports rated 4 or 5 in the latest cycle as possible backfills', () => {
    const x = exitImpact(base, 'MGR-1', idx)
    expect(x.cycle).toBe('2026 Mid-year')
    expect(x.backfills.map((b) => [b.id, b.rating, b.potential])).toEqual([
      ['IC-1', 5, null],
      ['IC-2', 4, 'High'],
    ])
    // IC-4 was rated 5 only in an older cycle; IC-4 and IC-5 have no rating in the latest one.
    expect(x.unrated).toBe(2)
    expect(x.managerSpan).toEqual({ before: 2, after: 6 })
    expect(x.peers).toBe(1)
    expect(x.orgSize).toBe(5)
  })

  it('reads the latest rating and the latest potential on record', () => {
    expect(ratingOf(idx, 'IC-2', AS_OF)).toEqual({
      rating: 4,
      cycle: '2026 Mid-year',
      potential: 'High',
      potentialCycle: '2025 Annual',
    })
    expect(ratingOf(idx, 'IC-9', AS_OF)).toBeNull()
  })

  it('hides team averages under five people and counts exits of former reports', () => {
    const rows = [
      ...smallCompany(),
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
    const t = buildOrgTree(rows, AS_OF)
    const s = teamStats(t, 'MGR-1', rows, 2)
    expect(s).toMatchObject({ directs: 5, totalOrg: 5, regrettedExits12: 1, exits12: 2, openReqs: 2 })
    expect(s.avgTenure).toBeCloseTo(6.73, 1)
    expect(teamStats(t, 'MGR-2', rows).avgTenure).toBeNull()
  })
})

describe('export rows', () => {
  const flags = computeFlags(base)
  it('lists the people shown, skipping placeholder cards', () => {
    const ids = [COMPANY_ROOT, 'CEO', 'VP-A', reqCardId('R1')]
    const rows = shownRows(base, ids, flags)
    expect(rows.map((r) => r.employeeId)).toEqual(['CEO', 'VP-A'])
    expect(rows[1]).toMatchObject({ manager: 'Name CEO', managerId: 'CEO', directs: 2, totalOrg: 8 })
    const dir = shownRows(base, ['DIR-1'], flags)[0]
    expect(dir.flags).toBe('Span of 1; Single-report chain')
  })

  it('lists flags by kind', () => {
    const rows = flagRows(base, base.people.keys(), flags, new Set(['single-report-chain', 'narrow-span']))
    expect(rows.map((r) => [r.flag, r.employeeId])).toEqual([
      ['Span of 1', 'DIR-1'],
      ['Span of 1', 'MGR-2'],
      ['Span of 1', 'VP-B'],
      ['Single-report chain', 'DIR-1'],
      ['Single-report chain', 'VP-B'],
    ])
  })

  it('writes the moves and the resulting roster', () => {
    const actions = [
      { kind: 'move' as const, personId: 'MGR-1', toManagerId: 'VP-B', mode: 'team' as const },
      { kind: 'exit' as const, personId: 'MGR-2' },
    ]
    const step1 = applyScenario(base, actions.slice(0, 1)).tree
    const after = applyScenario(base, actions).tree
    const moves = moveRows([base, step1], actions)
    expect(moves).toEqual([
      {
        step: 1,
        change: 'Move Name MGR-1 and their org to Name VP-B',
        type: 'Move with org',
        employeeId: 'MGR-1',
        name: 'Name MGR-1',
        fromManager: 'Name VP-A',
        toManager: 'Name VP-B',
        peopleMoving: 6,
      },
      {
        step: 2,
        change: 'Name MGR-2 leaves',
        type: 'Exit',
        employeeId: 'MGR-2',
        name: 'Name MGR-2',
        fromManager: 'Name VP-A',
        toManager: '',
        peopleMoving: 1,
      },
    ])
    const roster = rosterRows(base, after)
    expect(roster).toHaveLength(18)
    expect(roster.find((r) => r.employeeId === 'MGR-1')).toMatchObject({
      changed: 'New manager',
      scenarioManager: 'Name VP-B',
    })
    expect(roster.find((r) => r.employeeId === 'MGR-2')).toMatchObject({ changed: 'Leaves', directsAfter: 0 })
    expect(roster.find((r) => r.employeeId === 'IC-6')).toMatchObject({
      changed: 'New manager',
      scenarioManager: 'Name VP-A',
    })
  })
})

describe('org slides', () => {
  const scheme = colorScheme('department', [...base.people.values()], AS_OF)
  it('fits each leader’s org inside the slide content area', () => {
    const plans = planSlides(base, ['CEO', 'VP-A', 'NOPE'], { levels: 2, scheme, asOf: AS_OF })
    expect(plans.map((p) => p.leaderId)).toEqual(['CEO', 'VP-A'])
    for (const p of plans) {
      for (const c of p.cards) {
        expect(c.x).toBeGreaterThanOrEqual(SLIDE.margin - 1e-9)
        expect(c.x + c.w).toBeLessThanOrEqual(SLIDE.w - SLIDE.margin + 1e-9)
        expect(c.y).toBeGreaterThanOrEqual(SLIDE.top - 1e-9)
        expect(c.y + c.h).toBeLessThanOrEqual(SLIDE.h - SLIDE.bottom + 1e-9)
      }
    }
    const vpa = plans[1]
    expect(vpa.title).toBe("Name VP-A's organization")
    expect(vpa.subtitle).toBe(
      'Engineer · Digital Design · 2 direct reports · 8 people in the org · As of 30 Sep 2026',
    )
    expect(vpa.cards.map((c) => c.id)).toContain('IC-1')
    expect(vpa.cards.find((c) => c.id === 'MGR-1')!.counts).toBe('5 direct · 5 org')
  })

  it('falls back to direct reports when two levels would not be readable', () => {
    const rows: Employee[] = [person('BIG', null, { level: 'E1' })]
    for (let m = 0; m < 10; m++) {
      rows.push(person(`M${m}`, 'BIG', { level: 'M1' }))
      for (let i = 0; i < 10; i++) rows.push(person(`M${m}-${i}`, `M${m}`))
    }
    const t = buildOrgTree(rows, AS_OF)
    const [plan] = planSlides(t, ['BIG'], { levels: 2, scheme, asOf: AS_OF })
    expect(plan.levels).toBe(1)
    expect(plan.note).toContain('direct reports')
    expect(plan.cards).toHaveLength(11)
    expect(plan.ptPerPx * 14).toBeGreaterThanOrEqual(7)
    expect(defaultSlideLeaders(t, 'BIG')).toHaveLength(11)
  })
})

describe('model', () => {
  it('roots the chart at the leader filter and dims people outside the other filters', () => {
    const ctx = ctxFor(
      {
        employees: smallCompany(),
        requisitions: [
          {
            reqId: 'R1',
            jobTitle: 'Engineer',
            businessUnit: 'Silicon Engineering',
            department: 'Digital Design',
            location: 'Austin',
            level: 'L3',
            hiringManagerId: 'MGR-2',
            openedDate: '2026-08-01',
            status: 'Open',
            reqType: 'New',
            priority: 'Standard',
            openings: 2,
          },
        ],
      },
      { leaderId: 'VP-A', department: ['Software'] },
    )
    const m = buildOrgModel(ctx)
    expect(m.rootId).toBe('VP-A')
    expect(m.dims).toBe(true)
    expect(m.matches('IC-7')).toBe(true)
    expect(m.matches('IC-1')).toBe(false)
    expect(m.reqs.get('MGR-2')?.[0].openings).toBe(2)
    const v = visibleTree(m.tree, m.rootId, new Set(['VP-A', 'MGR-2']), { reqs: m.reqs })
    expect(visibleIds(v)).toContain('req:R1')
    expect(layoutTree(v).cards).toHaveLength(5)
    // VP-A's org is all Digital Design, so nobody is in scope with the Software filter.
    expect(peopleManagers(ctx)).toEqual({ managers: 0, people: 0 })
    expect(peopleManagers(ctxFor({ employees: smallCompany() }, { leaderId: 'VP-A' }))).toEqual({
      managers: 3,
      people: 9,
    })
    const whole = ctxFor({ employees: smallCompany() })
    expect(peopleManagers(whole)).toEqual({ managers: 7, people: 18 })
  })
})
