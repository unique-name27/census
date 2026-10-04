/**
 * Talent for the Scorecard and the Action center: the summary's measures and the open items
 * (overdue required training by manager, high performers overdue for promotion, Critical roles
 * without a ready-now successor), on hand-built data and on the sample company.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import type { Datasets, JobChange, Review, SuccessionPlan } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import { resolveDrill } from '@/drill/Drill'
import { ACTION_OWNER_ROLES, type ActionItem } from '../../types'
import { SUMMARY_KPIS, TALENT_TEAM, talentActions, talentSummary } from './actions'
import { talentModel } from './index'
import { TALENT_METRIC as M } from './settings'
import { course, ctxFor, emp, review, sourcesFor } from './test-fixtures'

const NAGGING = /\b(chas\w*|push\w*|nag\w*|ping\w*|hound\w*|remind\w*)\b/i

const byId = (items: readonly ActionItem[], id: string) => {
  const x = items.find((i) => i.id === id)
  if (!x) throw new Error(`no item ${id}: ${items.map((i) => i.id).join(', ')}`)
  return x
}

describe('action items on hand-built data (as of 30 Sep 2026)', () => {
  const annual = (id: string, r1: number, r2: number): Review[] => [
    review(id, '2024 Annual', '2024-12-15', r1, { potential: 'Moderate' }),
    review(id, '2025 Annual', '2025-12-15', r2, { potential: 'Moderate' }),
  ]
  const employees = [
    emp('HR1', { name: 'Mei Chen', department: 'People' }),
    emp('MGR', { name: 'Priya Raman', level: 'M1', hrbp: 'Mei Chen' }),
    emp('A', { name: 'Ana Silva', managerId: 'MGR', level: 'L4', hireDate: '2019-01-07', hrbp: 'Mei Chen' }),
    emp('B', { name: 'Ben Ito', managerId: 'MGR', level: 'L4', hireDate: '2019-01-07', hrbp: 'Mei Chen' }),
    emp('C', { name: 'Cy Park', managerId: 'GONE', level: 'L3' }),
    emp('GONE', { name: 'Old Boss', terminationDate: '2026-02-01', terminationType: 'Voluntary' }),
    emp('INC', { name: 'Ida Incumbent', level: 'E1' }),
    emp('S1', { name: 'Sol Successor', level: 'M2' }),
  ]
  const learning = [
    course('A', 'Export control', { dueDate: '2026-08-26' }),
    course('B', 'Export control', { dueDate: '2026-09-15' }),
    course('B', 'Code of conduct', { dueDate: '2026-08-26', completedDate: '2026-08-20' }),
    course('C', 'Code of conduct', { dueDate: '2026-09-01' }),
  ]
  const reviews = [...annual('A', 4, 5), ...annual('B', 3, 4)]
  const jobChanges: JobChange[] = []
  const plan = (o: Partial<SuccessionPlan> & Pick<SuccessionPlan, 'roleId'>): SuccessionPlan => ({
    roleTitle: `Director ${o.roleId}`,
    incumbentId: 'INC',
    criticality: 'Critical',
    successorId: null,
    readiness: null,
    incumbentRiskOfLoss: 'Low',
    ...o,
  })
  const succession = [
    plan({ roleId: 'R-NONE', incumbentRiskOfLoss: 'High' }),
    plan({ roleId: 'R-THIN', successorId: 'S1', readiness: 'Ready in 1-2 years' }),
    plan({ roleId: 'R-OK', successorId: 'S1', readiness: 'Ready now' }),
    plan({ roleId: 'R-KEY', criticality: 'Key' }),
  ]
  let items: ActionItem[]
  beforeAll(() => {
    // A job change somewhere, so promotion history counts as loaded.
    jobChanges.push({
      employeeId: 'S1',
      effectiveDate: '2025-03-01',
      changeType: 'Promotion',
      fromLevel: 'M1',
      toLevel: 'M2',
    })
    items = talentActions(ctxFor({ employees, learning, reviews, jobChanges, succession }))
  })

  it('groups overdue required training by manager, due from the oldest assignment', () => {
    const x = byId(items, 'talent:training-overdue:MGR')
    expect(x).toMatchObject({
      ownerRole: 'manager',
      ownerId: 'MGR',
      ownerName: 'Priya Raman',
      severity: 'warning',
      due: '2026-08-26',
      view: 'talent',
      tab: 'learning',
      subject: { kind: 'employees', id: 'MGR', label: "Priya Raman's team" },
    })
    expect(x.what).toBe(
      "2 required courses overdue for 2 people on Priya Raman's team, the oldest due 26 Aug",
    )
    expect(x.note).toBe('Could you ask your team to complete their overdue required courses this week?')
    const spec = resolveDrill(x.drill)!
    expect(spec.kind).toBe('learning')
    expect(spec.rows).toHaveLength(2)
  })

  it('gives a departed manager’s team to Talent management', () => {
    expect(byId(items, 'talent:training-overdue:GONE')).toMatchObject({
      ownerRole: 'talent',
      ownerName: TALENT_TEAM,
      ownerId: null,
    })
  })

  it('sends a high performer overdue for promotion to the HR business partner', () => {
    const x = byId(items, 'talent:promotion-overdue:A')
    expect(x).toMatchObject({ ownerRole: 'hrbp', ownerName: 'Mei Chen', ownerId: 'HR1', tab: 'retention' })
    expect(x.what).toMatch(
      /^Rated 4 and 5 in the last two annual cycles, not promoted since joining on 7 Jan 2019/,
    )
    expect(x.note).toBe(
      "Could we review Ana's path to the next level with Priya Raman before the next promotion cycle?",
    )
    // Rated 3 then 4: not a consistent high performer.
    expect(items.some((i) => i.id === 'talent:promotion-overdue:B')).toBe(false)
  })

  it('lists Critical roles without a ready-now successor for Talent management', () => {
    const none = byId(items, 'talent:critical-role:R-NONE')
    expect(none).toMatchObject({
      ownerRole: 'talent',
      ownerName: TALENT_TEAM,
      severity: 'critical',
      tab: 'succession',
    })
    expect(none.what).toBe(
      'No successor named for this Critical role, and the incumbent is at high risk of loss',
    )
    const thin = byId(items, 'talent:critical-role:R-THIN')
    expect(thin.severity).toBe('warning')
    expect(thin.what).toBe('No ready-now successor for this Critical role: 1 in 1-2 yrs')
    expect(items.some((i) => i.id === 'talent:critical-role:R-OK')).toBe(false)
    expect(items.some((i) => i.id === 'talent:critical-role:R-KEY')).toBe(false)
    expect(resolveDrill(none.drill)!.rows).toHaveLength(1)
  })

  it('is empty without data', () => {
    expect(talentActions(ctxFor({}))).toEqual([])
  })
})

describe('on the sample company', () => {
  let data: Datasets
  let ctx: AnalyticsContext
  let items: ActionItem[]
  beforeAll(() => {
    data = generateSample()
    ctx = buildContext({
      data,
      sources: sourcesFor(data, 'sample'),
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      showPay: false,
    })
    items = talentActions(ctx)
  })

  it('summary: critical roles covered, required training on time and key talent at risk', () => {
    const s = talentSummary(ctx)
    expect(s.kpis.map((k) => k.id)).toEqual([...SUMMARY_KPIS])
    expect(s.kpis.map((k) => k.metricId)).toEqual([M.criticalCoverage, M.requiredOnTime, M.keyTalent])
    // Story 4: 20 of 28 Critical roles have a successor ready now.
    expect(s.kpis[0].value).toBeCloseTo(20 / 28, 6)
    expect(ctx.metrics.target(M.criticalCoverage)).toEqual({ value: 0.8, comparator: '>=' })
    for (const k of s.kpis) expect(k.uses?.length, k.id).toBeGreaterThan(0)
    expect(s.findings).toBe(talentModel(ctx).findings)
  })

  it('story 4: the 8 Critical roles without a ready-now successor, the three with nobody named critical', () => {
    const roles = items.filter((i) => i.id.startsWith('talent:critical-role:'))
    expect(roles).toHaveLength(8)
    for (const id of ['SP-001', 'SP-002', 'SP-003'])
      expect(byId(roles, `talent:critical-role:${id}`).severity).toBe('critical')
  })

  it('story 6: the 25 high performers waiting for promotion, 15 in Design Verification', () => {
    const promo = items.filter((i) => i.id.startsWith('talent:promotion-overdue:'))
    expect(promo).toHaveLength(25)
    const dv = promo.filter((i) => ctx.org.byId.get(i.subject.id!)?.department === 'Design Verification')
    expect(dv).toHaveLength(15)
    for (const x of promo) expect(x.ownerId, x.id).toBeTruthy()
  })

  it('story 5: overdue export control training, every overdue assignment in exactly one manager item', () => {
    const training = items.filter((i) => i.id.startsWith('talent:training-overdue:'))
    const overdue = talentModel(ctx).learning.records.pastDue.filter((p) => p.overdue)
    const listed = training.reduce((n, i) => n + resolveDrill(i.drill)!.rows.length, 0)
    expect(listed).toBe(overdue.length)
    const ops = training.filter((i) => ctx.org.byId.get(i.subject.id ?? '')?.businessUnit === 'Operations')
    expect(ops.length).toBeGreaterThan(0)
  })

  it('keeps ids unique and stable, owners known and words polite', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    expect(
      talentActions(
        buildContext({
          data,
          sources: sourcesFor(data, 'sample'),
          filters: DEFAULT_FILTERS,
          asOfOverride: null,
          showPay: false,
        }),
      ).map((i) => i.id),
    ).toEqual(items.map((i) => i.id))
    for (const x of items) {
      expect(ACTION_OWNER_ROLES, x.id).toContain(x.ownerRole)
      expect(x.uses?.length, x.id).toBeGreaterThan(0)
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(NAGGING)
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(/—|!/)
      expect(resolveDrill(x.drill)?.rows.length, x.id).toBeGreaterThan(0)
    }
  })

  it('a leader filter keeps the leader’s org', () => {
    const scoped = talentActions(
      buildContext({
        data,
        sources: sourcesFor(data, 'sample'),
        filters: { ...DEFAULT_FILTERS, department: ['Design Verification'] },
        asOfOverride: null,
        showPay: false,
      }),
    )
    expect(scoped.length).toBeLessThan(items.length)
    expect(scoped.filter((i) => i.id.startsWith('talent:promotion-overdue:'))).toHaveLength(15)
  })
})
