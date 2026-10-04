/**
 * Smoke test over the generated sample (as of 30 Sep 2026): the planted Compliance stories in
 * src/data/sample/README.md are detected, and every number is finite or null.
 */
import { describe, expect, it } from 'vitest'
import type { Kpi } from '@/components/types'
import { resolveDrill } from '@/drill/Drill'
import { view } from '../index'
import { M } from '../metrics'
import { actions, compute, headline, summary } from './index'
import { sampleContext } from './testkit'

const m = compute(sampleContext())
const kpi = (id: string): Kpi => {
  const k = m.kpis.find((x) => x.id === id)
  if (!k) throw new Error(`No KPI ${id}`)
  return k
}

describe('planted compliance stories', () => {
  it('12 authorizations end in the next 90 days and 26 in 180', () => {
    expect(m.work.expiringHeadline).toHaveLength(12)
    expect(m.work.expiringHorizon).toHaveLength(26)
    expect(kpi('compliance-expiring').value).toBe(12)
    expect(kpi('compliance-expiring').note).toBe('26 people in 180 days')
    expect(headline(sampleContext())).toMatchObject({ value: '12', label: 'expiring in 90 days' })
  })

  it('of those 12: reverification not started for 3, started late for 2, on time for 7', () => {
    const in90 = m.work.expiringHeadline
    expect(in90.filter((x) => x.status === 'Not started')).toHaveLength(3)
    expect(in90.filter((x) => x.status === 'Started late')).toHaveLength(2)
    expect(in90.filter((x) => x.status === 'On time')).toHaveLength(7)
    expect(kpi('compliance-reverification-overdue').value).toBe(3)
    expect(m.work.expired).toEqual([])
  })

  it('names the overdue reverifications in the readout', () => {
    const f = m.findings.find((x) => x.id === 'compliance-reverification-overdue')
    expect(f?.title).toBe(
      'Reverification has not started for 3 people whose work authorization ends in the next 90 days.',
    )
    expect(f?.people).toHaveLength(3)
    expect(f?.action).toMatch(/^Start reverification with Global mobility this week for the 3 people/)
    expect(resolveDrill(f?.drill)?.rows).toHaveLength(3)
  })

  it('I-9 Section 2 within 3 business days for 115 of 120 US starts (95.8%)', () => {
    expect(m.i9.current.judged).toHaveLength(120)
    expect(m.i9.current.onTime).toHaveLength(115)
    expect(kpi('compliance-i9').value).toBeCloseTo(115 / 120, 10)
    const f = m.findings.find((x) => x.id === 'compliance-i9-late')
    expect(f?.severity).toBe('warning')
    expect(f?.title).toBe(
      'I-9 Section 2 was completed within 3 business days for 95.8% of US starts in the last 12 months, against a 100% target.',
    )
    expect(f?.people).toHaveLength(5)
  })

  it('one engineer works without an export license in force; two pre-hires wait for theirs', () => {
    expect(m.exportControl.without).toHaveLength(1)
    expect(m.exportControl.without[0].status).toBe('Pending')
    expect(m.exportControl.without[0].startDate.slice(0, 7)).toBe('2026-08')
    expect(m.exportControl.pendingStarts).toHaveLength(2)
    expect(m.exportControl.pendingStarts.every((x) => x.startDate === '2026-10-12')).toBe(true)
    expect(m.exportControl.approved).toBe(19)
    expect(kpi('compliance-without-license').value).toBe(1)
    expect(m.findings.find((x) => x.id === 'compliance-without-license')?.severity).toBe('critical')
    expect(m.findings.find((x) => x.id === 'compliance-pending-starts')?.people).toHaveLength(2)
  })

  it('summarizes required training from Talent and acknowledgments from Onboarding tasks', () => {
    expect(m.training.required.available).toBe(true)
    expect(m.training.required.rate).toBeGreaterThan(0.8)
    expect(m.training.required.rate).toBeLessThan(1)
    expect(m.training.policy.available).toBe(true)
    expect(m.training.policy.judged.length).toBeGreaterThan(100)
    expect(kpi('compliance-training').metricId).toBe('talent.learning.requiredOnTime')
  })

  it('lists statutory deadlines in the next 60 days for every jurisdiction with people', () => {
    expect(m.deadlines.jurisdictions.map((j) => j.jurisdiction.id)).toEqual([
      'us',
      'us-ca',
      'us-tx',
      'us-nc',
      'us-co',
      'us-wa',
      'ca',
      'de',
      'il',
      'in',
      'tw',
      'cn',
      'vn',
    ])
    expect(m.deadlines.until).toBe('2026-11-29')
    expect(m.deadlines.upcoming.length).toBeGreaterThan(20)
    expect(
      m.deadlines.upcoming.some((d) => d.entry.title === 'Q2 TDS return' && d.when === '31 Oct 2026'),
    ).toBe(true)
  })
})

describe('scorecard summary and Action center', () => {
  const ctx = sampleContext()

  it('hands the scorecard reverification, I-9 and export license measures with metric and lineage', () => {
    const s = view.summary!(ctx)
    expect(s.kpis.map((k) => k.metricId)).toEqual([M.reverificationOnTime, M.i9Section2, M.withoutLicense])
    for (const k of s.kpis) {
      expect(k.uses?.length, k.id).toBeGreaterThan(0)
      expect(k.drill, k.id).toBeTruthy()
      expect(k.tab, k.id).toBeTruthy()
    }
    expect(s.findings.length).toBeGreaterThan(0)
    expect(summary(ctx).kpis[1].value).toBeCloseTo(115 / 120, 10)
  })

  it('opens the subset each reverification and I-9 note states', () => {
    const s = view.summary!(ctx)
    for (const id of ['compliance-reverification', 'compliance-i9']) {
      const k = s.kpis.find((x) => x.id === id)!
      const stated = Number(k.note!.match(/^([\d,]+) of/)![1].replace(/\D/g, ''))
      expect(resolveDrill(k.noteDrill)?.rows.length, id).toBe(stated)
    }
  })

  it('lists reverification, I-9 and license items for their owners', () => {
    const items = actions(ctx)
    const by = (role: string) => items.filter((x) => x.ownerRole === role)
    // 3 overdue, plus those whose 90-day mark falls in the next 30 days.
    expect(by('immigration').filter((x) => x.severity !== 'info')).toHaveLength(3)
    expect(by('immigration').every((x) => x.ownerName === 'Global mobility')).toBe(true)
    expect(
      by('trade-compliance')
        .map((x) => x.severity)
        .sort(),
    ).toEqual(['critical', 'warning', 'warning'])
    expect(by('hr-ops')).toEqual([])
    expect(new Set(items.map((x) => x.id)).size).toBe(items.length)
    expect(view.actions!(ctx).map((x) => x.id)).toEqual(items.map((x) => x.id))
  })
})

describe('every number is finite or null', () => {
  it('KPIs, rates and rows', () => {
    for (const k of m.kpis) {
      if (k.value != null) expect(Number.isFinite(k.value), k.id).toBe(true)
      if (k.delta != null) expect(Number.isFinite(k.delta), k.id).toBe(true)
    }
    const rates = [
      m.work.reverification.rate,
      m.i9.current.rate,
      m.i9.prior.rate,
      m.i9.section1.rate,
      m.training.required.rate,
      m.training.policy.rate,
      ...m.work.byQuarter.map((r) => r.rate),
      ...m.work.mix.map((r) => r.share),
      ...m.i9.bySite.map((r) => r.rate),
    ]
    for (const r of rates) if (r != null) expect(r >= 0 && r <= 1).toBe(true)
    for (const r of m.work.byMonth) expect(r.people).toBe(r.rows.length)
  })

  it('every KPI drills to as many records as it counts', () => {
    for (const id of [
      'compliance-expiring',
      'compliance-reverification-overdue',
      'compliance-without-license',
    ]) {
      const k = kpi(id)
      expect(resolveDrill(k.drill)?.rows.length, id).toBe(k.value)
    }
  })

  it('runs in well under the scorecard budget', () => {
    const t0 = performance.now()
    compute(sampleContext({ filters: { businessUnit: ['Silicon Engineering'] } }))
    expect(performance.now() - t0).toBeLessThan(400)
  })
})
