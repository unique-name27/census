/**
 * Lineage: every KPI, figure and finding in the view names the dataset fields its number reads,
 * and every name is a real schema field (docs/DATA-TIERS.md, build step 5).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { invalidRefs, isTier } from '@/data/quality'
import { SERVICE_LEVELS } from './catalog'
import { compute } from './index'
import { FIGURE_IDS, levelUses, lineage } from './lineage'
import { emp, fixtureContext, kase, sampleContext, tx } from './testkit'

const ctx = sampleContext()
const model = compute(ctx)

const UI_DIR = new URL('../ui/', import.meta.url)
const uiSources = readdirSync(UI_DIR)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ file: f, text: readFileSync(new URL(f, UI_DIR), 'utf8') }))

describe('lineage on the sample company', () => {
  it('declares at least one field on every KPI, all of them in the schema', () => {
    expect(model.kpis.length).toBeGreaterThan(0)
    for (const k of model.kpis) {
      expect(k.uses?.length, k.id).toBeGreaterThan(0)
      expect(invalidRefs(k.uses ?? []), k.id).toEqual([])
    }
  })

  it('declares at least one field on every finding, all of them in the schema', () => {
    expect(model.findings.length).toBeGreaterThan(0)
    for (const f of model.findings) {
      expect(f.uses?.length, f.id).toBeGreaterThan(0)
      expect(invalidRefs(f.uses ?? []), f.id).toEqual([])
    }
  })

  it('declares at least one field on every figure, all of them in the schema', () => {
    expect(Object.keys(model.uses).sort()).toEqual([...FIGURE_IDS].sort())
    for (const id of FIGURE_IDS) {
      expect(model.uses[id].length, id).toBeGreaterThan(0)
      expect(invalidRefs(model.uses[id]), id).toEqual([])
    }
  })

  it('declares valid fields for every Atlas measure in the scorecard', () => {
    const L = lineage({ resolvedAt: true })
    for (const d of SERVICE_LEVELS) {
      expect(levelUses(d.id, L).length, d.id).toBeGreaterThan(0)
      expect(invalidRefs(levelUses(d.id, L)), d.id).toEqual([])
    }
  })

  it('lists each field once', () => {
    const lists = [...model.kpis, ...model.findings].map((x) => x.uses ?? [])
    for (const list of [...lists, ...Object.values(model.uses)]) expect(new Set(list).size).toBe(list.length)
  })

  it('names the population fields, not only the measured ones', () => {
    const kpi = (id: string) => model.kpis.find((k) => k.id === id)?.uses ?? []
    // Resolution SLA: cases opened in the period, judged by resolved time, status and target.
    expect(kpi('resolution-sla')).toEqual(
      expect.arrayContaining([
        'cases.openedAt',
        'cases.resolvedAt',
        'cases.status',
        'cases.resolutionTargetHours',
        'cases.category',
      ]),
    )
    expect(kpi('tx-on-time')).toEqual(['transactions.dueDate', 'transactions.completedDate'])
    expect(kpi('csat')).toEqual(['cases.openedAt', 'cases.resolvedAt', 'cases.csat'])
  })

  it('adds the requester org fields to a case finding that names where it concentrates', () => {
    for (const f of model.findings.filter((x) => x.tab === 'cases' && x.filter))
      expect(f.uses, f.id).toEqual(expect.arrayContaining(['cases.requesterId', 'employees.location']))
    for (const f of model.findings.filter((x) => x.tab === 'cases' && !x.filter))
      expect(f.uses, f.id).not.toContain('cases.requesterId')
  })

  it('gives every number a tier through the quality index', () => {
    for (const k of model.kpis) expect(isTier(ctx.quality.tierOf(k.uses, ['cases']))).toBe(true)
    for (const id of FIGURE_IDS) expect(isTier(ctx.quality.tierOf(model.uses[id], ['cases']))).toBe(true)
  })
})

describe('lineage follows the columns in the file', () => {
  it('judges the backlog by status alone when the file has no resolved times', () => {
    const cases = Array.from({ length: 6 }, () => kase({ resolvedAt: null, status: 'In progress' }))
    const m = compute(fixtureContext({ cases }))
    expect(m.kpis.find((k) => k.id === 'open-backlog')?.uses).toEqual(['cases.openedAt', 'cases.status'])
    // The resolution SLA still names its resolved time, so it reads "no data" like its value.
    expect(m.kpis.find((k) => k.id === 'resolution-sla')?.uses).toContain('cases.resolvedAt')
  })

  it('leaves absent optional columns out of a figure that shows several measures', () => {
    const cases = Array.from({ length: 6 }, () => kase({ csat: null, reopened: null, escalated: null }))
    const m = compute(fixtureContext({ cases }))
    expect(m.uses['services-team-workload']).not.toContain('cases.csat')
    expect(m.uses['services-team-workload']).toContain('cases.tier')
    expect(m.uses['services-team-workload']).not.toContain('cases.reopened')
    // A single-number KPI keeps it, so its tier is "no data" like its value.
    expect(m.kpis.find((k) => k.id === 'csat')?.uses).toContain('cases.csat')
  })

  it('scores the scorecard on the measures that have data', () => {
    const cases = Array.from({ length: 6 }, (_, i) => kase({ requesterId: `R${i}` }))
    const onlyCases = compute(fixtureContext({ cases }))
    expect(onlyCases.uses['services-scorecard'].some((r) => r.startsWith('transactions.'))).toBe(false)
    expect(onlyCases.uses['services-atlas-processes'].some((r) => r.startsWith('transactions.'))).toBe(false)
    const employees = Array.from({ length: 6 }, (_, i) => emp({ employeeId: `E${i}` }))
    const transactions = employees.map((e) => tx({ employeeId: e.employeeId }))
    const onlyTx = compute(fixtureContext({ employees, transactions }))
    expect(onlyTx.uses['services-scorecard'].some((r) => r.startsWith('cases.'))).toBe(false)
    expect(onlyTx.uses['services-scorecard']).toEqual(
      expect.arrayContaining(['transactions.dueDate', 'transactions.completedDate', 'transactions.type']),
    )
  })

  it('adds the requester org fields when a finding names where the problem concentrates', () => {
    const day = (i: number) => String(1 + (i % 28)).padStart(2, '0')
    const employees = Array.from({ length: 90 }, (_, i) =>
      emp({ employeeId: `E${i}`, location: i < 10 ? 'Austin' : 'San Jose' }),
    )
    // Benefits: 8 of the 10 Austin requesters' cases came back, none elsewhere; payroll: 2 of 60.
    const cases = employees.map((e, i) =>
      kase({
        category: i < 30 ? 'Benefits' : 'Payroll',
        requesterId: e.employeeId,
        openedAt: `2026-09-${day(i)}T09:00`,
        resolvedAt: `2026-09-${day(i)}T12:00`,
        reopened: i < 8 || i === 40 || i === 50,
        escalated: false,
      }),
    )
    const m = compute(fixtureContext({ employees, cases }))
    const f = m.findings.find((x) => x.id === 'services-reopen-benefits')
    expect(f?.filter).toEqual({ location: ['Austin'] })
    expect(f?.uses).toEqual(
      expect.arrayContaining(['cases.reopened', 'cases.requesterId', 'employees.location']),
    )
  })

  it('adds the exit type to final pay only when the roster has one', () => {
    const employees = Array.from({ length: 6 }, (_, i) => emp({ employeeId: `E${i}`, terminationType: null }))
    const transactions = employees.map((e) => tx({ type: 'Termination', employeeId: e.employeeId }))
    const m = compute(fixtureContext({ employees, transactions }))
    expect(m.uses['services-final-pay']).not.toContain('employees.terminationType')
    expect(model.uses['services-final-pay']).toContain('employees.terminationType')
  })
})

describe('every figure in the view passes its lineage', () => {
  it('passes uses on every Figure in the UI', () => {
    for (const { file, text } of uiSources) {
      const figures = text.match(/<Figure\b/g)?.length ?? 0
      const uses = text.match(/\buses=\{m\.uses\[/g)?.length ?? 0
      expect(uses, file).toBe(figures)
    }
  })

  it('uses the ids the lineage knows, each one once', () => {
    // A linked survey number (`<LinkedSurvey>`) carries Listening's lineage and metric, not this view's.
    const linked = new Set(
      uiSources.flatMap(({ text }) =>
        [...text.matchAll(/<LinkedSurvey\b[^>]*?\bid="(services-[a-z0-9-]+)"/g)].map((x) => x[1]),
      ),
    )
    expect([...linked]).toEqual(['services-hr-service-survey'])
    const ids = uiSources
      .flatMap(({ text }) => [...text.matchAll(/\bid="(services-[a-z0-9-]+)"/g)].map((x) => x[1]))
      .filter((id) => !linked.has(id))
    expect([...ids].sort()).toEqual([...FIGURE_IDS].sort())
  })
})
