/**
 * Smoke test on the generated sample company: every planted HR business partner story in
 * src/data/sample/README.md is detected by the readout, every number is finite or null, and the
 * engine stays inside its time budget.
 */
import { describe, expect, it } from 'vitest'
import type { Finding } from '@/components/types'
import { attrition } from '@/lib/people'
import { computeHrbp, hrbpHeadline, talkingPoints } from '.'
import { trailing } from './base'
import { sampleCtx } from './fixtures'

const ctx = sampleCtx()
const m = computeHrbp(ctx)
const find = (id: string): Finding => {
  const f = m.findings.find((x) => x.id === id)
  if (!f) throw new Error(`missing finding ${id}; got ${m.findings.map((x) => x.id).join(', ')}`)
  return f
}
const kpi = (id: string) => m.kpi.kpis.find((k) => k.id === id)!

describe('HRBP engine on the sample company', () => {
  it('reproduces the company baseline: voluntary 9.4%, total 12.0%, regretted 4.8%', () => {
    expect(kpi('voluntary').value).toBeCloseTo(0.094, 3)
    expect(kpi('attrition').value).toBeCloseTo(0.12, 3)
    expect(kpi('regretted').value).toBeCloseTo(0.048, 3)
    expect(kpi('headcount').value).toBe(1450)
    expect(kpi('first-year').value).toBeCloseTo(0.115, 3)
    expect(kpi('promotion-rate').value).toBeCloseTo(0.108, 3)
  })

  it('story 1: finds the manager with 5 regretted exits, most of them "My manager"', () => {
    const t12 = trailing(ctx.asOf, 12)
    const counts = new Map<string, number>()
    for (const e of ctx.data.employees) {
      if (e.terminationType !== 'Voluntary' || e.regrettable !== true || e.terminationReason !== 'My manager')
        continue
      if (!e.terminationDate || e.terminationDate < t12.start || e.terminationDate > t12.end || !e.managerId)
        continue
      counts.set(e.managerId, (counts.get(e.managerId) ?? 0) + 1)
    }
    const [plantedId, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    expect(n).toBeGreaterThanOrEqual(4)
    const planted = ctx.org.byId.get(plantedId)!
    const f = find('hrbp-regretted-cluster')
    expect(f.severity).toBe('critical')
    expect(f.title).toContain(planted.name)
    expect(f.title).toContain('5 regretted exits')
    expect(f.filter).toEqual({ leaderId: plantedId })
    expect(f.people!.length).toBeLessThanOrEqual(50)
  })

  it('story 2: Bengaluru voluntary attrition 18.8% against 9.4% for the company', () => {
    const f = find('hrbp-voluntary-location')
    expect(f.title).toBe('Voluntary attrition in Bengaluru is 18.8%, 9.4 pts above the company')
    expect(f.detail).toContain('Career growth or promotion (20)')
    expect(f.detail).toContain('Base salary (18)')
    expect(f.filter).toEqual({ location: ['Bengaluru'] })
  })

  it('story 3: first-year attrition in Go-to-Market 27.0% (10 of 37) against 8.3% elsewhere', () => {
    const f = find('hrbp-first-year')
    expect(f.title).toBe(
      'First-year attrition in Go-to-Market is 27.0% (10 of 37 hires), against 8.3% elsewhere',
    )
    expect(f.detail).toContain('Sales accounts for 7 of the 10')
    expect(f.filter).toEqual({ businessUnit: ['Go-to-Market'] })
  })

  it('story 4: span outliers (3 with 12+, 4 with exactly 1) and the new manager with 9', () => {
    const spans = find('hrbp-span-outliers')
    expect(spans.title).toBe('3 managers have 12 or more direct reports and 4 have only one')
    for (const name of ['Nisha Iyer', 'Rohan Murthy', 'Wei-Lun Lee']) expect(spans.detail).toContain(name)
    const wide = m.org.managers
      .filter((x) => x.directs >= 12)
      .map((x) => x.directs)
      .sort()
    expect(wide).toEqual([12, 13, 14])

    // The planted new manager: hired in the last 12 months with 8 or more reports.
    const planted = m.org.managers.filter((x) => x.newManager && x.directs >= 8)
    expect(planted).toHaveLength(1)
    const f = find('hrbp-new-managers')
    expect(f.title).toContain(`${planted[0].name} with ${planted[0].directs} direct reports`)
    expect(planted[0].directs).toBe(9)
    expect(f.severity).toBe('warning')
  })

  it('story 5: Silicon Engineering grew 13.9% (488 to 556) while Corporate was flat', () => {
    const f = find('hrbp-uneven-growth')
    expect(f.title).toBe('Silicon Engineering grew 13.9% in 12 months, from 488 to 556 people')
    expect(f.detail).toContain('Corporate was flat at 196')
    const corp = m.workforce.growth.find((g) => g.group === 'Corporate')!
    expect(corp).toMatchObject({ yearAgo: 196, now: 196 })
  })

  it('story 6: the company baseline matches the shared definitions exactly', () => {
    expect(kpi('voluntary').value).toBe(attrition(ctx.data.employees, ctx.window, 'voluntary').rate)
  })

  it('ranks findings by severity and keeps people lists at 50 or fewer', () => {
    const rank = { critical: 0, warning: 1, info: 2, good: 3 }
    for (let i = 1; i < m.findings.length; i++) {
      expect(rank[m.findings[i].severity]).toBeGreaterThanOrEqual(rank[m.findings[i - 1].severity])
    }
    for (const f of m.findings) {
      expect((f.people ?? []).length).toBeLessThanOrEqual(50)
      expect(f.action).toBeTruthy()
      expect(`${f.title} ${f.detail ?? ''} ${f.action ?? ''}`).not.toMatch(/—|!/)
    }
  })

  it('returns finite or null numbers everywhere', () => {
    for (const k of m.kpi.kpis) {
      expect(k.value === null || Number.isFinite(k.value)).toBe(true)
      expect(k.delta == null || Number.isFinite(k.delta)).toBe(true)
      for (const v of k.spark ?? []) expect(v === null || Number.isFinite(v)).toBe(true)
    }
    for (const r of m.scorecard.rows) {
      for (const v of [r.voluntary, r.regretted, r.firstYear, r.promotionRate, r.avgSpan])
        expect(v === null || Number.isFinite(v)).toBe(true)
    }
    for (const r of [...m.attrition.byDepartment, ...m.attrition.byLocation, ...m.attrition.byLevel])
      expect(r.rate === null || Number.isFinite(r.rate)).toBe(true)
    for (const v of [m.org.meanSpan, m.org.medianSpan, m.org.managerRatio, m.movement.mobility.rate])
      expect(v === null || Number.isFinite(v)).toBe(true)
  })

  it('writes 5 to 7 talking points', () => {
    const lines = talkingPoints(m)
      .split('\n')
      .filter((l) => l.startsWith('- '))
    expect(lines.length).toBeGreaterThanOrEqual(5)
    expect(lines.length).toBeLessThanOrEqual(7)
    expect(lines.join('\n')).toContain('most under Heather Hayes (5)')
  })

  it('folds sub-orgs under 5 employees and benchmarks against the company', () => {
    const rows = m.scorecard.rows
    expect(m.scorecard.rowsLabel).toBe('Business units')
    expect(rows.at(-1)!.label).toBe('Company')
    expect(rows.filter((r) => r.kind === 'businessUnit').every((r) => r.headcount >= 5)).toBe(true)
  })

  it('scopes to a leader: scorecard rows are the direct reports', () => {
    const ceo = ctx.data.employees.find((e) => !e.managerId)!
    const scoped = computeHrbp(sampleCtx({ leaderId: ceo.employeeId }))
    expect(scoped.scorecard.rows.filter((r) => r.kind === 'leader').length).toBeGreaterThan(3)
    expect(scoped.kpi.kpis.find((k) => k.id === 'voluntary')!.deltaLabel).toBe('vs company')
  })

  it('computes the folder-tab headline cheaply', () => {
    const h = hrbpHeadline(ctx)
    expect(h.value).toBe(1450)
    expect(h.spark).toHaveLength(8)
  })

  it('runs in under 150 ms', () => {
    computeHrbp(sampleCtx({ location: ['San Jose'] }))
    const fresh = sampleCtx()
    const t0 = performance.now()
    computeHrbp(fresh)
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(150)
  })
})
