/**
 * Smoke test on the generated sample (whole company, last 12 months): every planted employee
 * services story in src/data/sample/README.md is detected, every KPI is finite or null, and the
 * engine runs well inside its time budget.
 */
import { describe, expect, it } from 'vitest'
import type { Finding } from '@/components/types'
import { compute, headline, type ServicesModel } from './index'
import { sampleContext } from './testkit'

const ctx = sampleContext()
const model: ServicesModel = compute(ctx)
const find = (id: string): Finding => {
  const f = model.findings.find((x) => x.id === id)
  if (!f) throw new Error(`Missing finding ${id}. Have: ${model.findings.map((x) => x.id).join(', ')}`)
  return f
}
const pctIn = (text: string) => Number(/([\d.]+)%/.exec(text)?.[1])

describe('employee services on the sample company', () => {
  it('runs in under 150 ms', () => {
    compute(ctx)
    const t0 = performance.now()
    compute(ctx)
    expect(performance.now() - t0).toBeLessThan(150)
  })

  it('returns finite or null KPIs, all seven of them', () => {
    expect(model.kpis.map((k) => k.id)).toEqual([
      'cases-opened',
      'open-backlog',
      'resolution-sla',
      'response-sla',
      'time-to-resolve',
      'csat',
      'tx-on-time',
    ])
    for (const k of model.kpis) {
      expect(k.value === null || Number.isFinite(k.value), k.id).toBe(true)
      expect(k.delta == null || Number.isFinite(k.delta), k.id).toBe(true)
      for (const s of k.spark ?? []) expect(s === null || Number.isFinite(s), k.id).toBe(true)
    }
    expect(model.kpis.find((k) => k.id === 'open-backlog')?.value).toBe(48)
  })

  it('story 1: finds the July 2026 payroll spike and its SLA drop', () => {
    const f = find('services-spike-payroll')
    expect(f.severity).toBe('critical')
    expect(f.title).toMatch(/^Payroll cases rose to 118 in Jul 2026, 2\.\d× the usual \d+ a month\.$/)
    expect(f.detail).toContain('60.2%')
    expect(f.action).toContain('PY-05')
  })

  it('story 2: finds leave SLA under 80% with the waiting-on-third-party backlog', () => {
    const f = find('services-sla-leave-accommodation')
    expect(pctIn(f.title)).toBeLessThan(72)
    expect(f.detail).toContain('13 of the 15 open cases are waiting on a third party, 10 of them past')
    expect(f.action).toContain('LV-01')
  })

  it('story 3: finds late final pay in India and California, involuntary exits in California', () => {
    const india = find('services-final-pay-in')
    expect(pctIn(india.title)).toBeGreaterThan(65)
    expect(pctIn(india.title)).toBeLessThan(85)
    expect(india.filter).toEqual({ location: ['Bengaluru'] })
    const ca = find('services-final-pay-us-ca')
    expect(ca.detail).toMatch(/Involuntary exits were on time for (6|7)\d\.\d%/)
    expect(ca.filter).toEqual({ location: ['San Jose'] })
    expect(model.findings.filter((x) => x.id.startsWith('services-final-pay'))).toHaveLength(2)
  })

  it('story 4: finds Day −3 readiness under 95% in APAC only', () => {
    const f = find('services-new-hire-apac')
    expect(pctIn(f.title)).toBeLessThan(90)
    expect(f.filter?.location).toEqual(expect.arrayContaining(['Bengaluru', 'Shanghai']))
    expect(model.findings.filter((x) => x.id.startsWith('services-new-hire'))).toHaveLength(1)
  })

  it('story 5: finds the email satisfaction gap and HR data reopens', () => {
    const email = find('services-csat-email')
    expect(email.title).toMatch(/^Email cases score 3\.\d out of 5/)
    expect(model.findings.filter((x) => x.id.startsWith('services-csat'))).toHaveLength(1)
    const reopen = find('services-reopen-hr-data-records')
    expect(pctIn(reopen.title)).toBeGreaterThan(10)
    expect(model.findings.filter((x) => x.id.startsWith('services-reopen'))).toHaveLength(1)
  })

  it('story 6: finds the 15 immigration cases open more than 30 days', () => {
    const f = find('services-aged-immigration-mobility')
    expect(f.title).toMatch(/^15 Immigration & mobility cases have been open for more than 30 days/)
    expect(f.detail).toContain('Employee relations')
  })

  it('adds exactly one good finding and keeps the copy rules', () => {
    expect(model.findings.filter((f) => f.severity === 'good')).toHaveLength(1)
    for (const f of model.findings) {
      const text = [f.title, f.detail, f.action].join(' ')
      expect(text, f.id).not.toMatch(/—|!|\b(chase|push|nag|ping|hound)\b/i)
      expect((f.people ?? []).length).toBeLessThanOrEqual(50)
    }
  })

  it('scores every Atlas service level with an actual', () => {
    expect(model.levels).toHaveLength(13)
    for (const l of model.levels) {
      expect(l.actual, l.id).not.toBeNull()
      expect(l.status, l.id).not.toBeNull()
      expect(l.n, l.id).toBeGreaterThanOrEqual(5)
    }
    const of05 = model.levels.find((l) => l.id === 'of05-final-pay')!
    expect(of05.status).toBe('Missed')
  })

  it('counts the open backlog and draws the folder-tab headline', () => {
    expect(model.backlogTotal).toBe(48)
    const h = headline(ctx)
    expect(h).toMatchObject({ value: '48', label: 'open cases' })
    expect(h.spark).toHaveLength(8)
  })

  it('keeps figure rows consistent with their totals', () => {
    const opened = model.opened.rows
      .filter((r) => model.windowMonths.includes(r.month))
      .reduce((a, r) => a + r.cases, 0)
    expect(opened).toBe(model.summary.opened)
    expect(model.arrivals.reduce((a, r) => a + r.cases, 0)).toBe(model.summary.opened)
    expect(model.backlog.reduce((a, r) => a + r.cases, 0)).toBe(48)
  })

  it('narrows to a scope without breaking', () => {
    const scoped = compute(sampleContext({ location: ['Bengaluru'] }))
    expect(scoped.findings.some((f) => f.id === 'services-final-pay-in')).toBe(true)
    for (const k of scoped.kpis) expect(k.value === null || Number.isFinite(k.value)).toBe(true)
  })
})
