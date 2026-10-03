import { describe, expect, it } from 'vitest'
import { compute, headline } from './index'
import { emp, fixtureContext, kase, tx } from './testkit'

const times = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i))
const day = (i: number) => String(1 + (i % 28)).padStart(2, '0')

describe('findings on hand-built data', () => {
  it('flags late final pay by jurisdiction with the people and the site filter', () => {
    const employees = times(10, (i) =>
      emp({ employeeId: `E${i}`, name: `Person ${i}`, location: 'Bengaluru', terminationType: 'Voluntary' }),
    )
    const transactions = times(10, (i) =>
      tx({
        type: 'Termination',
        employeeId: `E${i}`,
        dueDate: '2026-09-10',
        completedDate: i < 3 ? '2026-09-14' : '2026-09-09',
      }),
    )
    const m = compute(fixtureContext({ employees, transactions }))
    const f = m.findings.find((x) => x.id === 'services-final-pay-in')!
    expect(f.severity).toBe('critical')
    expect(f.title).toBe('Final pay was on time for 70.0% of exits in India, against a 100% target.')
    expect(f.filter).toEqual({ location: ['Bengaluru'] })
    expect(f.people).toHaveLength(3)
    expect(f.tab).toBe('transactions')
  })

  it('does not flag a single late final payment', () => {
    const employees = times(10, (i) => emp({ employeeId: `E${i}`, location: 'Austin' }))
    const transactions = times(10, (i) =>
      tx({
        type: 'Termination',
        employeeId: `E${i}`,
        dueDate: '2026-09-10',
        completedDate: i ? '2026-09-09' : '2026-09-12',
      }),
    )
    const m = compute(fixtureContext({ employees, transactions }))
    expect(m.findings.some((x) => x.id.startsWith('services-final-pay'))).toBe(false)
  })

  it('reports a channel satisfaction gap of 0.5 or more', () => {
    const cases = [
      ...times(10, (i) =>
        kase({
          channel: 'Email',
          csat: 3,
          openedAt: `2026-09-${day(i)}T09:00`,
          resolvedAt: `2026-09-${day(i)}T12:00`,
        }),
      ),
      ...times(10, (i) =>
        kase({
          channel: 'Portal',
          csat: 5,
          openedAt: `2026-09-${day(i)}T09:00`,
          resolvedAt: `2026-09-${day(i)}T12:00`,
        }),
      ),
    ]
    const m = compute(fixtureContext({ cases }))
    const f = m.findings.find((x) => x.id === 'services-csat-email')!
    expect(f.title).toBe('Email cases score 3.0 out of 5 on satisfaction, 2.0 below the other channels.')
    expect(m.findings.some((x) => x.id === 'services-csat-portal')).toBe(false)
  })

  it('reports an aged backlog once, folding in the category SLA', () => {
    const cases = [
      ...times(30, (i) =>
        kase({
          category: 'Immigration & mobility',
          team: 'Global mobility',
          resolutionTargetHours: 240,
          openedAt: `2026-09-${day(i)}T09:00`,
          resolvedAt: `2026-09-${day(i)}T15:00`,
        }),
      ),
      ...times(10, (i) =>
        kase({
          category: 'Immigration & mobility',
          team: 'Global mobility',
          resolutionTargetHours: 240,
          openedAt: `2026-0${6 + (i % 2)}-${day(i)}T09:00`,
          resolvedAt: null,
          status: 'Waiting on third party',
        }),
      ),
    ]
    const m = compute(fixtureContext({ cases }))
    const aged = m.findings.filter((x) => x.id === 'services-aged-immigration-mobility')
    expect(aged).toHaveLength(1)
    expect(aged[0].title).toMatch(/^10 Immigration & mobility cases have been open for more than 30 days/)
    expect(m.findings.some((x) => x.id === 'services-sla-immigration-mobility')).toBe(false)
  })

  it('skips a peak that also happened in the same month a year earlier', () => {
    const month = (m: string, n: number, category = 'Benefits') =>
      times(n, (i) =>
        kase({ category, openedAt: `${m}-${day(i)}T09:00`, resolvedAt: `${m}-${day(i)}T15:00` }),
      )
    const base = ['2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-12', '2026-01']
    const cases = [
      ...month('2024-11', 80),
      ...base.flatMap((m) => month(m, 30)),
      ...month('2025-11', 80),
      ...month('2026-02', 30),
      ...month('2026-03', 30),
      ...month('2026-04', 30),
      ...month('2026-05', 30),
      ...month('2026-06', 30),
      ...month('2026-07', 90, 'Payroll'),
      ...['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].flatMap((m) =>
        month(m, 30, 'Payroll'),
      ),
    ]
    const m = compute(fixtureContext({ cases }))
    expect(m.findings.some((x) => x.id === 'services-spike-benefits')).toBe(false)
    const payroll = m.findings.find((x) => x.id === 'services-spike-payroll')!
    expect(payroll.title).toBe('Payroll cases rose to 90 in Jul 2026, 3.0× the usual 30 a month.')
  })
})

describe('empty and partial data', () => {
  it('computes without cases or transactions and keeps every KPI null', () => {
    const ctx = fixtureContext({})
    const m = compute(ctx)
    expect(m.hasCases).toBe(false)
    expect(m.kpis.every((k) => k.value === null)).toBe(true)
    expect(m.findings).toEqual([])
    expect(m.levels.every((l) => l.actual === null)).toBe(true)
    expect(headline(ctx)).toEqual({ value: '—', label: 'open cases' })
  })

  it('names the missing column instead of reporting zero', () => {
    const cases = times(8, () => kase({ csat: null }))
    const m = compute(fixtureContext({ cases }))
    const csat = m.kpis.find((k) => k.id === 'csat')!
    expect(csat.value).toBeNull()
    expect(csat.note).toBe('Satisfaction column missing')
    const tx = m.kpis.find((k) => k.id === 'tx-on-time')!
    expect(tx.value).toBeNull()
    expect(tx.note).toBe('Upload HR transactions to see this')
  })
})
