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
    // The README's 33 and 22 count every awaiting-feedback item (76); the finding names the
    // decisions in its title (39 past 2 days), the same set the action queue and notes list.
    expect(f.title).toContain('39 of them waiting on an interview decision')
    expect(f.detail).toContain('Ji-woo Lim has 20 of the 39 decisions and Hannah Smith 9, 74% together.')
    const owners = new Map(m.queue.map((g) => [g.owner, g]))
    const decisions = (o: string) =>
      owners.get(o)!.items.filter((x) => x.state === 'awaiting-feedback').length
    expect([decisions('Ji-woo Lim'), decisions('Hannah Smith')]).toEqual([20, 9])
    const awaiting = m.base.actives.filter((x) => x.state === 'awaiting-feedback')
    expect(awaiting).toHaveLength(76)
    expect(awaiting.filter((x) => x.owner === 'Ji-woo Lim')).toHaveLength(33)
    expect(f.people).toHaveLength(lacking)
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

  it('story 6: senior and analog reqs take far longer to fill (one story in the readout)', () => {
    const ttf = allProblemFindings(m.base).find((x) => x.id === 'rec-time-to-fill')!
    expect(ttf.title).toBe('L5 reqs took a median 107 d to fill in the last 12 months, vs 52 d overall.')
    // Design Verification (79 d) is not the slowest department: Analog (127 d) and IT (90 d) are.
    expect(ttf.detail).toBe('By department, Design Verification also runs long at 79 d over 23 reqs.')
    // Six problems fire; the readout has five places next to the good finding, so the slow
    // time to fill folds into the analog empty-funnel story and the job board story stays.
    expect(m.findings.map((x) => x.id)).not.toContain('rec-time-to-fill')
    expect(finding('rec-empty-funnel').detail).toContain(
      'Analog & Mixed-Signal reqs filled in the last 12 months took a median 127 d to fill and L5 reqs 107 d, vs 52 d for the company.',
    )
    expect(finding('rec-source-drying-up').title).toMatch(/^Job board applications fell 48%/)
    expect(m.ttfByDepartment.slice(0, 3).map((r) => [r.group, r.days])).toEqual([
      ['Analog & Mixed-Signal', 127],
      ['IT', 90],
      ['Design Verification', 79],
    ])
  })

  it('keeps the readout to six findings with plain copy', () => {
    expect(m.findings.length).toBeLessThanOrEqual(6)
    for (const f of m.findings) {
      for (const text of [f.title, f.detail ?? '', f.action ?? '']) {
        expect(text).not.toMatch(/—|!|\b(chase|chasing|nag|push|ping|hound|unblock)\b/i)
      }
    }
  })

  it('every candidate join holds, so req health is checked', () => {
    expect(m.base.joinNote).toBeNull()
    expect(m.base.req.funnelChecked).toBe(true)
  })

  it('flags the uneven recruiter load from the README', () => {
    const a = m.recruiters.find((r) => r.recruiter === 'Agnieszka Nielsen')!
    expect(a).toMatchObject({ openReqs: 29, active: 136, flagged: true })
    expect(a.flag).toMatch(/^Heavy load/)
    expect(m.recruiters.find((r) => r.recruiter === 'Andreas Schmitz')!.flagged).toBe(false)
  })

  it('offers the latest quarter for acceptance by location, where Bengaluru stands out', () => {
    expect(m.acceptanceDropBasis).toBe('quarter')
    expect(m.latestQuarter).toMatchObject({ label: 'Q3 2026', complete: true })
    const blr = m.acceptanceByLocationQuarter.find((r) => r.group === 'Bengaluru')!
    expect(blr).toMatchObject({ hired: 10, offers: 32 })
    expect(m.companyAcceptanceQuarter).toBeCloseTo(58 / 85, 3)
    for (const r of [...m.acceptanceByLocation, ...m.acceptanceByLocationQuarter])
      expect(r.offers >= 5 || r.rate == null).toBe(true)
  })

  it('with an as-of date in the past, open reqs are those open on that date', () => {
    const past = buildContext({
      data,
      sources,
      filters: DEFAULT_FILTERS,
      asOfOverride: '2026-03-31',
      showPay: false,
    })
    const pm = computeRecruitingUncached(past)
    const k = pm.kpis.find((x) => x.id === 'open-reqs')!
    expect(k.value).toBe(50)
    expect(k.spark!.at(-1)).toBe(50)
    expect(headline(past)).toMatchObject({ value: '50' })
    expect(pm.base.req.rows).toHaveLength(50)
  })

  it('scoped to one department, the empty funnel compares it with the company, not itself', () => {
    const analog = buildContext({
      data,
      sources,
      filters: { ...DEFAULT_FILTERS, department: ['Analog & Mixed-Signal'] },
      asOfOverride: null,
      showPay: false,
    })
    const f = computeRecruitingUncached(analog).findings.find((x) => x.id === 'rec-empty-funnel')!
    expect(f.detail).toContain('took a median 127 d to fill, vs 52 d for the company.')
  })

  it('on a 3-month window: no good finding from censored hire rates, and small groups stay hidden', () => {
    const t3 = (filters = {}) =>
      computeRecruitingUncached(
        buildContext({
          data,
          sources,
          filters: { ...DEFAULT_FILTERS, period: 't3m', ...filters },
          asOfOverride: null,
          showPay: false,
        }),
      )
    const company = t3()
    expect(company.findings.find((x) => x.id === 'rec-best-source')).toBeUndefined()
    const ttf = allProblemFindings(company.base).find((x) => x.id === 'rec-time-to-fill')
    if (ttf?.detail) expect(ttf.detail).not.toMatch(/slowest/)
    const vancouver = t3({ location: ['Vancouver'] })
    const acc = vancouver.kpis.find((x) => x.id === 'offer-acceptance')!
    expect(acc).toMatchObject({ value: null, suppressed: true })
    for (const k of vancouver.kpis) if (k.suppressed) expect(k.value).toBeNull()
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
