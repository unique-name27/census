/**
 * Collecting every view's items: a failing view is reported and the rest still show, the data
 * standard hides items below it (counted, with the reason), owners named only by name are matched
 * to the roster, "My team" adds items owned in the leader's org anywhere in the company, and an
 * employee relations item never shows in a scope under the anonymity minimum.
 */
import { describe, expect, it } from 'vitest'
import { resolveDrill } from '@/drill/Drill'
import { buildDrillTable, DRILLS_KEY, PERSON_KEY } from '@/drill/records'
import { defaultMetrics } from '@/metrics/api'
import { metricsWith, paramRef, paramsOfView, recordParamReads } from '@/metrics/testing'
import { M, P } from '../metrics'
import { collectActions, collectUncached, isPrivateItem, withoutLeader } from './collect'
import { exportRows, itemsDrill } from './rows'
import { settingsOf } from './settings'
import { actionKpis, countActions, ownerDueRows, viewRows } from './summary'
import { AS_OF, ctxOf, item, scopedBySubject, source } from './testkit'

describe('collectActions', () => {
  it('lists every view, reports one that throws, and orders the most pressing first', () => {
    const late = item({ id: 'talent:a:1', severity: 'warning', due: '2026-09-01' })
    const crit = item({ id: 'recruiting:b:1', view: 'recruiting', tab: 'pipeline', severity: 'critical' })
    const info = item({ id: 'talent:c:1', severity: 'info', due: null })
    const views = [
      source('talent', 'Talent', [info, late]),
      source('recruiting', 'Recruiting', [crit, crit]),
      source('comp', 'Compensation', () => {
        throw new Error('no comp data')
      }),
    ]
    const c = collectUncached(ctxOf(), views)
    expect(c.items.map((a) => a.id)).toEqual(['recruiting:b:1', 'talent:a:1', 'talent:c:1'])
    expect(c.errors).toEqual([{ view: 'comp', label: 'Compensation', message: 'no comp data' }])
    expect(c.sources).toBe(3)
    expect(c.items[0]).toMatchObject({
      viewLabel: 'Recruiting',
      tabLabel: 'Pipeline',
      from: 'Recruiting · Pipeline',
    })
  })

  it('is cached per context', () => {
    const views = [source('talent', 'Talent', [item()])]
    const ctx = ctxOf()
    expect(collectActions(ctx, views)).toBe(collectActions(ctx, views))
  })

  it('matches owners named only by name to the roster, and tells teams from people', () => {
    const views = [
      source('talent', 'Talent', [
        item({ id: 'talent:x:1', ownerId: 'E9', ownerName: 'Rita Rao' }),
        item({ id: 'talent:x:2', ownerId: null, ownerName: 'Rita Rao' }),
        item({ id: 'talent:x:3', ownerRole: 'it', ownerId: null, ownerName: 'IT' }),
        item({ id: 'talent:x:4', ownerRole: 'hr-ops', ownerId: null, ownerName: 'Amanda Wright' }),
      ]),
    ]
    const by = new Map(collectUncached(ctxOf(), views).items.map((a) => [a.id, a]))
    expect(by.get('talent:x:2')).toMatchObject({ ownerId: 'E9', ownerKey: 'id:E9', isTeam: false })
    expect(by.get('talent:x:1')?.ownerKey).toBe(by.get('talent:x:2')?.ownerKey)
    expect(by.get('talent:x:3')).toMatchObject({ ownerId: null, ownerKey: 'team:it:it', isTeam: true })
    // A name not on the roster is still a person, not a team.
    expect(by.get('talent:x:4')).toMatchObject({ ownerId: null, isTeam: false })
  })

  it('opens the person an item is about only when they are on the roster', () => {
    const views = [
      source('talent', 'Talent', [
        item({ id: 'talent:p:1', subject: { kind: 'employees', id: 'E3', label: 'Person 3' } }),
        item({ id: 'talent:p:2', subject: { kind: 'employees', id: 'E99', label: 'Gone' } }),
        item({ id: 'talent:p:3', subject: { kind: 'candidates', id: 'APP-1', label: 'A candidate' } }),
      ]),
    ]
    const by = new Map(collectUncached(ctxOf(), views).items.map((a) => [a.id, a.personId]))
    expect(Object.fromEntries(by)).toEqual({ 'talent:p:1': 'E3', 'talent:p:2': null, 'talent:p:3': null })
  })

  it('hides items below the data standard and counts them by what holds them back', () => {
    const views = [source('talent', 'Talent', [item(), item()])]
    const shown = collectUncached(ctxOf({ standard: 'bronze' }), views)
    expect(shown.items).toHaveLength(2)
    expect(shown.hidden.count).toBe(0)
    // Hand-built uploads are bronze: under Validated both items are held back.
    const held = collectUncached(ctxOf({ standard: 'silver' }), views)
    expect(held.items).toHaveLength(0)
    expect(held.hidden.count).toBe(2)
    expect(held.hidden.reasons).toEqual([
      expect.objectContaining({ dataset: 'employees', tier: 'bronze', count: 2 }),
    ])
    // A field with no data hides its item even when everything shows.
    const empty = collectUncached(ctxOf(), [
      source('talent', 'Talent', [item({ uses: ['learning.dueDate'] })]),
    ])
    expect(empty.items).toHaveLength(0)
    expect(empty.hidden.reasons[0]).toMatchObject({ tier: 'none', dataset: 'learning' })
  })

  describe('"My team" mode (the leader filter)', () => {
    // Sam's report; Rita (in Lena's org) owns an item about Tom, outside the org; Tom owns one about Person 3.
    const aboutTeam = item({ id: 'talent:t:1', subject: { kind: 'employees', id: 'E3', label: 'Person 3' } })
    const ritaOwns = item({
      id: 'recruiting:r:1',
      view: 'recruiting',
      ownerRole: 'recruiter',
      ownerId: null,
      ownerName: 'Rita Rao',
      subject: { kind: 'employees', id: 'E10', label: 'Tom Fox' },
    })
    const lenaOwns = item({
      id: 'talent:l:1',
      ownerId: 'E1',
      ownerName: 'Lena Ortiz',
      subject: { kind: 'employees', id: 'E10', label: 'Tom Fox' },
    })
    const outside = item({
      id: 'talent:o:1',
      ownerId: 'E10',
      ownerName: 'Tom Fox',
      subject: { kind: 'employees', id: 'E10', label: 'Tom Fox' },
    })
    const views = [
      source('talent', 'Talent', scopedBySubject([aboutTeam, lenaOwns, outside])),
      source('recruiting', 'Recruiting', scopedBySubject([ritaOwns])),
    ]

    it("lists items about the leader's org and items owned in it anywhere, tagged by who they wait on", () => {
      const c = collectUncached(ctxOf({ filters: { leaderId: 'E1' } }), views)
      expect(c.leader).toEqual({ id: 'E1', name: 'Lena Ortiz' })
      const team = Object.fromEntries(c.items.map((a) => [a.id, a.team]))
      expect(team).toEqual({ 'talent:t:1': 'org', 'recruiting:r:1': 'org', 'talent:l:1': 'leader' })
    })

    it('leaves the rest of the company alone without a leader', () => {
      const c = collectUncached(ctxOf(), views)
      expect(c.leader).toBeNull()
      expect(c.items.map((a) => a.team)).toEqual([null, null, null, null])
      const ctx = ctxOf()
      expect(withoutLeader(ctx)).toBe(ctx)
    })

    it('widens only the leader filter', () => {
      const ctx = ctxOf({ filters: { leaderId: 'E2', department: ['Design Verification'] } })
      const wide = withoutLeader(ctx)
      expect(wide.filters.leaderId).toBeNull()
      expect(wide.filters.department).toEqual(['Design Verification'])
      expect(wide.data.employees).toHaveLength(ORG_SIZE)
      expect(withoutLeader(ctx)).toBe(wide)
    })
  })

  it('never shows an employee relations item in a scope under the anonymity minimum', () => {
    const er = item({
      id: 'services:case:HR-1',
      view: 'services',
      ownerRole: 'hr-ops',
      ownerId: null,
      ownerName: 'Employee relations',
      subject: { kind: 'none', label: 'Employee relations case' },
    })
    expect(isPrivateItem(er)).toBe(true)
    expect(isPrivateItem(item())).toBe(false)
    const views = [source('services', 'HR ops', [er])]
    // Sam Lee's org: 7 people. Raised to 8, it is too small.
    const big = collectUncached(ctxOf({ filters: { leaderId: 'E2' } }), views)
    expect(big.items.map((a) => a.id)).toEqual(['services:case:HR-1'])
    expect(big.smallScope).toBe(false)
    const strict = metricsWith({ 'privacy.anonymity': { minGroup: 8 } })
    const small = collectUncached(ctxOf({ filters: { leaderId: 'E2' }, metrics: strict }), views)
    expect(small.items).toHaveLength(0)
    expect(small.smallScope).toBe(true)
    // The company as a whole is never "small".
    expect(collectUncached(ctxOf({ metrics: strict }), views).items).toHaveLength(1)
    // Its id carries the case ID; exports and drills never show it.
    const rows = exportRows(big.items, AS_OF)
    expect(JSON.stringify(rows)).not.toContain('HR-1')
    const table = buildDrillTable(itemsDrill(ctxOf(), 'Items', big.items), ctxOf())
    expect(table.columns.map((c) => c.key)).not.toContain('id')
    expect(JSON.stringify(table.rows.map((r) => Object.values(r)))).not.toContain('HR-1')
  })
})

const ORG_SIZE = 10

describe('counts and drills', () => {
  const items = [
    item({ id: 'talent:k:1', severity: 'critical', due: '2026-09-20' }),
    item({ id: 'talent:k:2', severity: 'warning', due: '2026-10-02' }),
    item({
      id: 'talent:k:3',
      severity: 'info',
      due: '2026-10-20',
      ownerRole: 'it',
      ownerId: null,
      ownerName: 'IT',
    }),
    item({ id: 'recruiting:k:4', view: 'recruiting', severity: 'warning', due: null }),
  ]
  const views = [
    source(
      'talent',
      'Talent',
      items.filter((i) => i.view === 'talent'),
    ),
    source(
      'recruiting',
      'Recruiting',
      items.filter((i) => i.view === 'recruiting'),
    ),
  ]

  it('count open, overdue, critical, due soon and owners, each drilling to exactly its items', () => {
    const ctx = ctxOf()
    const open = collectUncached(ctx, views).items
    const kpis = actionKpis(open, ctx)
    const by = Object.fromEntries(kpis.map((k) => [k.id, k]))
    expect(Object.fromEntries(kpis.map((k) => [k.id, k.value]))).toEqual({
      open: 4,
      overdue: 1,
      critical: 1,
      'due-soon': 1,
      owners: 2,
    })
    expect(by.owners.note).toBe('1 person, 1 team')
    for (const k of kpis) {
      expect(ctx.metrics.def(k.metricId!), k.id).toBeDefined()
      expect(k.uses?.length, k.id).toBeGreaterThan(0)
      const spec = resolveDrill(k.drill)
      expect(spec?.kind, k.id).toBe('actionItems')
      if (k.id !== 'owners') expect(spec?.rows.length, k.id).toBe(k.value)
    }
    expect(countActions(open, ctx).bySeverity).toEqual({ critical: 1, warning: 2, info: 1, good: 0 })
  })

  it('read the look-ahead and the snooze length through the dictionary, and change with them', () => {
    const rec = recordParamReads(defaultMetrics())
    const ctx = ctxOf({ metrics: rec.metrics })
    const open = collectUncached(ctx, views).items
    actionKpis(open, ctx)
    settingsOf(ctx.metrics)
    expect([...rec.reads].filter((r) => r.startsWith('actions.')).sort()).toEqual(
      paramsOfView('actions').sort(),
    )
    expect(paramsOfView('actions')).toEqual([
      paramRef(P.snoozeDays.metricId, P.snoozeDays.key),
      paramRef(P.dueSoonDays.metricId, P.dueSoonDays.key),
    ])
    const wider = ctxOf({ metrics: metricsWith({ [M.dueSoon]: { days: 30 }, [M.open]: { snoozeDays: 14 } }) })
    const soon = actionKpis(collectUncached(wider, views).items, wider).find((k) => k.id === 'due-soon')
    expect(soon?.value).toBe(2)
    expect(settingsOf(wider.metrics)).toEqual({ snoozeDays: 14, dueSoonDays: 30 })
  })

  it('give each figure its rows: owner groups by due date, and views', () => {
    const ctx = ctxOf()
    const open = collectUncached(ctx, views).items
    expect(ownerDueRows(open, ctx)).toEqual([
      { group: 'Managers', due: 'Overdue', bucket: 'overdue', items: 1 },
      { group: 'Managers', due: 'Due within 7 d', bucket: 'soon', items: 1 },
      { group: 'Managers', due: 'No due date', bucket: 'none', items: 1 },
      { group: 'IT', due: 'Due later', bucket: 'later', items: 1 },
    ])
    expect(viewRows(open, ctx).map((r) => [r.view, r.open, r.overdue, r.critical])).toEqual([
      ['Talent', 3, 1, 1],
      ['Recruiting', 1, 0, 0],
    ])
  })

  it('drill to item records whose About cell opens the item and whose row opens the person', () => {
    const ctx = ctxOf()
    const subjectSpec = () => null
    const open = collectUncached(ctx, [source('talent', 'Talent', [item({ drill: subjectSpec })])]).items
    const table = buildDrillTable(itemsDrill(ctx, 'Items', open), ctx)
    expect(table.columns.map((c) => c.label)).toEqual([
      'Severity',
      'What is open',
      'About',
      'Due date',
      'Due',
      'From',
    ])
    expect(table.rows[0][PERSON_KEY]).toBe('E3')
    expect((table.rows[0][DRILLS_KEY] as Record<string, unknown>).subject).toBe(subjectSpec)
  })
})
