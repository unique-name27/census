/**
 * Smoke test on the sample company: every planted recruiting story (src/data/sample/README.md)
 * surfaces in the readout or the figures, every KPI is finite or null, and the engine is fast.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { computeRecruitingUncached, type RecruitingModel } from '.'
import { allProblemFindings } from './findings'
import { headline } from './kpis'

let data: Datasets
let ctx: AnalyticsContext
let m: RecruitingModel

const sources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: 0 } satisfies SourceMeta]),
) as Record<DatasetKey, SourceMeta>

beforeAll(() => {
  data = generateSample()
  ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })
  m = computeRecruitingUncached(ctx)
})

const finding = (id: string) => {
  const f = m.findings.find((x) => x.id === id)
  if (!f) throw new Error(`finding ${id} missing: ${m.findings.map((x) => x.id).join(', ')}`)
  return f
}

describe('sample company, whole company, last 12 months', () => {
  it('runs in under 150 ms', () => {
    computeRecruitingUncached(ctx)
    const t0 = performance.now()
    computeRecruitingUncached(ctx)
    expect(performance.now() - t0).toBeLessThan(150)
  })

  it('keeps every KPI finite or null', () => {
    expect(m.kpis.map((k) => k.id)).toEqual([
      'open-reqs',
      'hires',
      'time-to-fill',
      'time-to-hire',
      'offer-acceptance',
      'lacking-next-step',
    ])
    for (const k of m.kpis) {
      expect(k.value === null || Number.isFinite(k.value), k.id).toBe(true)
      if (k.delta != null) expect(Number.isFinite(k.delta), k.id).toBe(true)
      for (const v of k.spark ?? []) expect(v === null || Number.isFinite(v), k.id).toBe(true)
    }
    expect(m.kpis.find((k) => k.id === 'open-reqs')!.value).toBe(114)
    expect(m.kpis.find((k) => k.id === 'time-to-fill')!.value).toBe(52)
  })

  it('folder-tab headline: open reqs with an 8-point sparkline', () => {
    const h = headline(ctx)
    expect(h).toMatchObject({ value: '114', label: 'open reqs' })
    expect(h.spark).toHaveLength(8)
  })

  it('story 1: onsite-to-offer bottleneck in Design Verification (27 d vs 8 d)', () => {
    const f = finding('rec-bottleneck')
    expect(f.severity).toBe('critical')
    expect(f.title).toContain('Onsite to offer is the bottleneck in Design Verification')
    expect(f.title).toContain('median 27 d vs 8 d elsewhere')
    expect(f.detail).toContain('28 of the 59 active candidates at onsite')
    expect(f.filter).toEqual({ department: ['Design Verification'] })
  })

  it('story 2: offer acceptance fell to 68% in Q3 from 85%, driven by Bengaluru', () => {
    const f = finding('rec-offer-acceptance')
    expect(f.title).toBe('Offer acceptance fell to 68% in Q3 2026 from 85% in Q2 2026, mostly in Bengaluru.')
    expect(f.detail).toContain('Bengaluru accepted 10 of 32 offers (31%)')
    expect(f.detail).toContain('accepted competing offer (13)')
    expect(f.filter).toEqual({ location: ['Bengaluru'] })
    const q3 = m.acceptanceByQuarter.find((q) => q.label === 'Q3 2026')!
    expect(q3.rate).toBeCloseTo(58 / 85, 3)
  })

  it('story 3: candidates without a next step; decisions stuck with two hiring managers', () => {
    const f = finding('rec-lacking-next-step')
    const lacking = m.kpis.find((k) => k.id === 'lacking-next-step')!.value!
    // The README counts 91 with a simpler rule (no event, 14+ days); the tiered rule is wider.
    expect(lacking).toBeGreaterThanOrEqual(91)
    expect(f.title).toContain(`${lacking} candidates lack a next step`)
    expect(f.detail).toContain('Ji-woo Lim has 33 candidates waiting on a decision and Hannah Smith 22')
    expect(f.detail).toContain('of the 76 waiting')
    expect(f.action).toContain('Ask the panels to submit scorecards and make a decision this week')
    const hms = m.queue.filter((g) => g.role === 'Hiring manager').map((g) => g.owner)
    expect(hms.slice(0, 2)).toEqual(['Ji-woo Lim', 'Hannah Smith'])
  })

  it('story 4: four critical analog reqs stuck at the screen', () => {
    const f = finding('rec-empty-funnel')
    expect(f.severity).toBe('critical')
    expect(f.title).toContain('4 of them critical Analog & Mixed-Signal roles open 82 to 124 days')
    const stuck = m.base.req.emptyFunnel.filter((r) => r.daysOpen > 75)
    expect(stuck).toHaveLength(4)
    expect(stuck.every((r) => r.department === 'Analog & Mixed-Signal' && r.priority === 'Critical')).toBe(
      true,
    )
  })

  it('story 5: referrals convert best, agency offers are accepted least often, job board volume fell', () => {
    const good = finding('rec-best-source')
    expect(good.severity).toBe('good')
    expect(good.title).toMatch(/^Referral applicants are hired at/)
    const agency = m.sources.find((s) => s.source === 'Agency')!
    expect(agency.offerAcceptance).toBeLessThan(0.6)
    const dry = allProblemFindings(m.base).find((x) => x.id === 'rec-source-drying-up')!
    expect(dry.title).toBe('Job board applications fell 48% to 356, from 680 in the prior 12 months.')
    expect(m.changedSource).toBe('Job board')
  })

  it('story 6: senior and analog reqs take far longer to fill', () => {
    const ttf = finding('rec-time-to-fill')
    expect(ttf.title).toBe('L5 reqs took a median 107 d to fill in the last 12 months, vs 52 d overall.')
    expect(finding('rec-empty-funnel').detail).toContain(
      'Analog & Mixed-Signal reqs filled in the last 12 months took a median 127 d to fill',
    )
    expect(m.ttfByDepartment[0]).toMatchObject({ group: 'Analog & Mixed-Signal', days: 127 })
  })

  it('keeps the readout to six findings with plain copy', () => {
    expect(m.findings.length).toBeLessThanOrEqual(6)
    for (const f of m.findings) {
      for (const text of [f.title, f.detail ?? '', f.action ?? '']) {
        expect(text).not.toMatch(/—|!|\b(chase|chasing|nag|push|ping|hound|unblock)\b/i)
      }
      if (f.people) expect(f.people.length).toBeLessThanOrEqual(50)
    }
  })

  it('scoped to Design Verification, the bottleneck reads as the whole step', () => {
    const dv = buildContext({
      data,
      sources,
      filters: { ...DEFAULT_FILTERS, department: ['Design Verification'] },
      asOfOverride: null,
      showPay: false,
    })
    const f = computeRecruitingUncached(dv).findings.find((x) => x.id === 'rec-bottleneck')!
    expect(f.title).toMatch(/^Onsite to offer is the bottleneck: median 27 d/)
  })
})
