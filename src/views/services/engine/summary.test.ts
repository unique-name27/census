/**
 * HR ops for the People scorecard (`summary`) and the Action center (`actions`): the three
 * measures with their targets, the readout without HR-only findings, and open items for cases
 * past target, overdue transactions and returns from leave without systems ready.
 */
import { describe, expect, it } from 'vitest'
import { invalidRefs } from '@/data/quality'
import { resolveDrill } from '@/drill/Drill'
import { defaultMetrics } from '@/metrics/api'
import { ACTION_OWNER_ROLES } from '@/views/types'
import { levelMetric, M } from '../metrics'
import { servicesActions } from './actions'
import { compute, computeCached } from './index'
import { servicesSummary, summaryFindings } from './summary'
import { emp, fixtureContext, kase, sampleContext, tx } from './testkit'

const ctx = sampleContext()

describe('summary for the People scorecard', () => {
  const s = servicesSummary(ctx)

  it('gives resolution SLA met, transactions on time and final pay on time, each with a target', () => {
    expect(s.kpis.map((k) => k.id)).toEqual(['resolution-sla', 'tx-on-time', 'final-pay'])
    expect(s.kpis.map((k) => k.metricId)).toEqual([M.resolutionSla, M.onTime, levelMetric('of05-final-pay')])
    const api = defaultMetrics()
    expect(s.kpis.map((k) => api.target(k.metricId ?? '')?.value)).toEqual([0.9, 0.98, 1])
    for (const k of s.kpis) {
      expect(k.value === null || Number.isFinite(k.value), k.id).toBe(true)
      expect(k.uses?.length, k.id).toBeGreaterThan(0)
      expect(invalidRefs(k.uses ?? []), k.id).toEqual([])
      expect(k.tab, k.id).toBeTruthy()
      expect(resolveDrill(k.drill), k.id).not.toBeNull()
    }
  })

  it('reports final pay on time as the OF-05 scorecard row does', () => {
    const m = computeCached(ctx)
    const fp = s.kpis.find((k) => k.id === 'final-pay')
    const of05 = m.levels.find((r) => r.id === 'of05-final-pay')
    expect(fp?.value).toBeCloseTo(of05?.actual as number, 6)
    expect(fp?.value).toBeLessThan(1)
  })

  it('opens the exits due from the final pay note, as many as it states', () => {
    const fp = s.kpis.find((k) => k.id === 'final-pay')!
    const n = Number(fp.note!.match(/([\d,]+) exits due/)![1].replace(/\D/g, ''))
    const note = resolveDrill(fp.noteDrill)
    expect(note?.rows.length).toBe(n)
    expect(note?.uses).toEqual(fp.uses)
  })

  it('ranks the readout with the leave findings, minus the HR-only one and minus names', () => {
    const order = { critical: 0, warning: 1, info: 2, good: 3 }
    const sev = s.findings.map((f) => order[f.severity])
    expect(sev).toEqual([...sev].sort((a, b) => a - b))
    expect(s.findings.some((f) => f.id === 'services-leave-retention-parental')).toBe(true)
    const leave = s.findings.filter((f) => f.id.startsWith('services-leave-'))
    for (const f of leave) expect(f.people).toBeUndefined()
    // The HR-only finding never reaches the scorecard, even when it is raised.
    const m = computeCached(ctx)
    const withCluster = {
      ...m,
      leave: {
        ...m.leave,
        findings: [
          ...m.leave.findings,
          { id: 'services-leave-exit-cluster', severity: 'critical' as const, title: 'x' },
        ],
      },
    }
    expect(summaryFindings(withCluster).some((f) => f.id === 'services-leave-exit-cluster')).toBe(false)
  })

  it('shares one computation with the view', () => {
    expect(computeCached(ctx)).toBe(computeCached(ctx))
  })
})

describe('actions for the Action center', () => {
  const items = servicesActions(ctx)
  const m = computeCached(ctx)

  it('lists cases past target, overdue transactions and returns without systems ready', () => {
    const kinds = new Set(items.map((i) => i.id.split(':')[1]))
    expect([...kinds].sort()).toEqual(['case', 'return', 'tx'])
    const returns = items.filter((i) => i.id.startsWith('services:return:'))
    expect(returns).toHaveLength(3)
    expect(returns.every((i) => i.ownerRole === 'hr-ops' && i.tab === 'leave')).toBe(true)
    expect(returns.filter((i) => i.what.includes('not entered'))).toHaveLength(2)
    const cases = items.filter((i) => i.id.startsWith('services:case:'))
    const pastTarget = m.cases.filter((f) => f.open && f.resolutionMet === false)
    expect(cases).toHaveLength(pastTarget.length)
    const overdue = m.tx.filter((f) => f.outcome === 'overdue')
    expect(items.filter((i) => i.id.startsWith('services:tx:'))).toHaveLength(overdue.length)
  })

  it('gives every item a stable unique id, a known owner, valid fields and polite wording', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    expect(servicesActions(sampleContext()).map((i) => i.id)).toEqual(items.map((i) => i.id))
    for (const i of items) {
      expect(ACTION_OWNER_ROLES, i.id).toContain(i.ownerRole)
      expect(i.view).toBe('services')
      expect(i.ownerName.length, i.id).toBeGreaterThan(0)
      expect(invalidRefs(i.uses ?? []), i.id).toEqual([])
      expect(`${i.what} ${i.note ?? ''}`, i.id).not.toMatch(/\b(chase|push|nag|ping|hound)\b|!|—/i)
      // A return from leave never says why the person was away.
      expect(`${i.what} ${i.note}`, i.id).not.toMatch(/Parental|Medical|Family care|Military|Sabbatical/)
    }
  })

  it('never names a person or a case behind an employee relations item', () => {
    const cases = Array.from({ length: 6 }, (_, i) =>
      kase({
        category: 'Employee relations',
        team: 'Employee relations',
        assignee: 'Jordan Agent',
        requesterId: `E${i}`,
        openedAt: '2026-07-01T09:00',
        firstResponseAt: '2026-07-01T10:00',
        resolvedAt: null,
        status: 'In progress',
        resolutionTargetHours: 720,
      }),
    )
    const employees = Array.from({ length: 6 }, (_, i) => emp({ employeeId: `E${i}`, name: `Named ${i}` }))
    // One resolved case, so the file has resolved times and open cases are judged on them.
    const resolved = kase({ requesterId: 'E0' })
    const out = servicesActions(fixtureContext({ cases: [...cases, resolved], employees }))
    expect(out).toHaveLength(6)
    for (const i of out) {
      expect(i.subject).toEqual({ kind: 'none', label: 'Employee relations case' })
      expect(i.ownerName).toBe('Employee relations')
      expect(i.drill).toBeUndefined()
      expect(JSON.stringify({ ...i, id: '' })).not.toMatch(/Named|HR-\d|Jordan/)
    }
  })

  it('marks overdue final pay critical and owned by Payroll', () => {
    const employees = Array.from({ length: 6 }, (_, i) => emp({ employeeId: `E${i}`, name: `Leaver ${i}` }))
    const transactions = employees.map((e) =>
      tx({ type: 'Termination', employeeId: e.employeeId, dueDate: '2026-09-25', completedDate: null }),
    )
    const out = servicesActions(fixtureContext({ employees, transactions }))
    expect(out).toHaveLength(6)
    for (const i of out) {
      expect(i).toMatchObject({
        ownerRole: 'payroll',
        severity: 'critical',
        due: '2026-09-25',
        tab: 'transactions',
      })
      // The as-of year goes without saying; final pay past due is legal exposure.
      expect(i.what).toMatch(/^Termination for Leaver \d is not processed, due 25 Sep$/)
      expect(i.exposure).toBe(true)
    }
    expect(
      compute(fixtureContext({ employees, transactions })).tx.every((f) => f.outcome === 'overdue'),
    ).toBe(true)
  })
})
