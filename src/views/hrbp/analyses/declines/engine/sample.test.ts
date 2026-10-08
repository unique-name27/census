/**
 * Offer declines on the sample company (docs/ANALYSES.md, 3.2, 3.10 and part 7): every number
 * recounted from the raw candidate and requisition rows, the planted stories, the readout, drills
 * that open exactly the offers each number counts, "Filter to this" on the requisition's business
 * unit, location and level and on quarters, the settings, and every value finite or null.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { readDeclineReason } from '@/data/lists'
import type { Candidate, Requisition } from '@/data/schema'
import { resolveDrill } from '@/drill/Drill'
import { applyDrillFilter, expectFilterTo, expectLeaveOut } from '@/drill/testing'
import { daysBetween } from '@/lib/dates'
import { median } from '@/lib/stats'
import { metricsWith } from '@/metrics/testing'
import { sampleCtx } from '@/views/hrbp/engine/fixtures'
import { analysisModel } from '../../registry'
import type { GroupRow } from './cuts'
import {
  bucketDrill,
  competingDrill,
  groupDrill,
  quarterDrill,
  rangeDrill,
  reasonDrill,
  themeDrill,
} from './figureDrills'
import { DM } from './metrics'
import { type DeclinesModel, declinesModel } from './model'
import { bandOf } from './offers'

let ctx: AnalyticsContext
let m: DeclinesModel
beforeAll(() => {
  ctx = sampleCtx()
  m = analysisModel<DeclinesModel>(ctx, 'declines')
}, 60_000)

const rowsOf = (src: unknown) => resolveDrill(src as Parameters<typeof resolveDrill>[0])?.rows ?? []
const near = (v: number | null | undefined, want: number, tol = 0.0005) => {
  expect(v).not.toBeNull()
  expect(Math.abs((v as number) - want)).toBeLessThanOrEqual(tol)
}

/** Offers resolved in a window, straight from the rows: accepted by offer accepted date, declined by decline date. */
function rawOffers(c: AnalyticsContext, w = c.window): Candidate[] {
  const inW = (d: string | null | undefined) => !!d && d >= w.start && d <= w.end && d <= c.asOf
  return c.data.candidates.filter(
    (x) =>
      !!x.appliedDate &&
      x.appliedDate <= c.asOf &&
      ((x.status === 'Hired' && inW(x.hiredDate)) || (x.status === 'Declined' && inW(x.rejectedDate))),
  )
}

const reqsOf = (c: AnalyticsContext) =>
  new Map<string, Requisition>(c.all.requisitions.map((r) => [r.reqId, r]))

function tally<K>(list: readonly Candidate[], key: (x: Candidate) => K) {
  const by = new Map<K, { n: number; declined: number }>()
  for (const x of list) {
    const k = key(x)
    const t = by.get(k) ?? { n: 0, declined: 0 }
    t.n++
    if (x.status === 'Declined') t.declined++
    by.set(k, t)
  }
  return by
}

describe('recounted from the raw rows', () => {
  it('counts the offers resolved in the window and the declines among them', () => {
    const raw = rawOffers(ctx)
    expect(m.count.resolved).toBe(raw.length)
    expect(m.count.declined).toBe(raw.filter((x) => x.status === 'Declined').length)
    expect(m.count.resolved).toBe(401)
    expect(m.count.declined).toBe(88)
    near(m.count.rate, 88 / 401)
    const prior = rawOffers(ctx, ctx.prior)
    expect(m.priorCount.resolved).toBe(prior.length)
    expect(m.priorCount.declined).toBe(prior.filter((x) => x.status === 'Declined').length)
  })

  it('counts every group of every cut from the requisition and candidate fields', () => {
    const raw = rawOffers(ctx)
    const reqs = reqsOf(ctx)
    const keyOf: Record<GroupRow['cut'], (x: Candidate) => string | null> = {
      level: (x) => bandOf(reqs.get(x.reqId)?.level),
      location: (x) => reqs.get(x.reqId)?.location ?? null,
      businessUnit: (x) => reqs.get(x.reqId)?.businessUnit ?? null,
      source: (x) => x.source?.trim() || null,
      recruiter: (x) => x.recruiter ?? reqs.get(x.reqId)?.recruiter ?? null,
      hiringManager: (x) => reqs.get(x.reqId)?.hiringManager ?? null,
    }
    for (const g of m.groups) {
      if (g.kind !== 'group') continue
      const t = tally(raw, keyOf[g.cut]).get(g.group)
      expect(t?.n, `${g.cut} ${g.group}`).toBe(g.resolved)
      if (g.rate != null) {
        expect(g.declined, `${g.cut} ${g.group}`).toBe(t?.declined)
        near(g.rate, (t?.declined ?? 0) / (t?.n ?? 1), 1e-12)
      }
    }
    // Each cut accounts for every resolved offer.
    for (const cut of ['level', 'location', 'businessUnit', 'source', 'recruiter', 'hiringManager'] as const)
      expect(
        m.groups.filter((g) => g.cut === cut).reduce((s, g) => s + g.resolved, 0),
        cut,
      ).toBe(401)
  })

  it('counts reasons, days and positions from the rows', () => {
    const declined = rawOffers(ctx).filter((x) => x.status === 'Declined')
    const reasons = new Map<string, number>()
    for (const x of declined) {
      const r = readDeclineReason(x.rejectionReason, ctx.offerDeclineReasons)?.reason ?? 'Not recorded'
      reasons.set(r, (reasons.get(r) ?? 0) + 1)
    }
    for (const r of m.reasons.filter((x) => x.kind === 'reason'))
      expect(r.declined, r.reason).toBe(reasons.get(r.reason))
    const decide = declined
      .filter((x) => x.offerDate)
      .map((x) => daysBetween(x.offerDate as string, x.rejectedDate as string))
    expect(m.decide.declined.days).toBe(median(decide))
    const blr = rawOffers(ctx).filter(
      (x) => reqsOf(ctx).get(x.reqId)?.location === 'Bengaluru' && x.offerPositionInRange != null,
    )
    const row = m.range.find((r) => r.label === 'Bengaluru')!
    expect(row.declined).toBe(
      median(blr.filter((x) => x.status === 'Declined').map((x) => x.offerPositionInRange as number)),
    )
    expect(row.accepted).toBe(
      median(blr.filter((x) => x.status === 'Hired').map((x) => x.offerPositionInRange as number)),
    )
  })
})

describe('the planted stories (docs/ANALYSES.md, 3.2 and 3.10)', () => {
  const group = (cut: GroupRow['cut'], g: string) => m.groups.find((x) => x.cut === cut && x.group === g)!

  it('declines rose to 31.8% in Q3 2026 against 15.2% in Q2', () => {
    const q3 = m.quarters.at(-1)!
    const q2 = m.quarters.at(-2)!
    expect([q3.label, q3.declined, q3.resolved]).toEqual(['Q3 2026', 50, 157])
    near(q2.rate, 0.152)
    near(q3.rate, 0.318)
  })

  it('Bengaluru and L5 to L6 decline far more; Agency far more than Referral', () => {
    expect([group('location', 'Bengaluru').declined, group('location', 'Bengaluru').resolved]).toEqual([
      48, 132,
    ])
    expect([group('level', 'L5-L6').declined, group('level', 'L5-L6').resolved]).toEqual([46, 70])
    // M1 to E3 has 1 offer: with L1 to L4 shown, 88 − 42 − 46 would give that offer away, so L1 to
    // L4 (the smallest band no finding flags) is hidden with it, its offer count kept.
    expect(group('level', 'M1-E3')).toMatchObject({ resolved: 1, declined: null, rate: null })
    expect(group('level', 'L1-L4')).toMatchObject({ resolved: 330, declined: null, rate: null, offers: [] })
    expect(m.offers.filter((o) => o.band === 'L1-L4' && o.outcome === 'Declined')).toHaveLength(42)
    near(group('source', 'Agency').rate, 0.485)
    near(group('source', 'Referral').rate, 0.009)
    // L5 and L6 are well past what their locations would predict; Bengaluru's is mostly its level mix.
    expect(group('level', 'L5-L6').flagged).toBe(true)
    near(group('level', 'L5-L6').expected, 0.229, 0.005)
    // Shreya Ramesh's 49% against her Bengaluru, senior mix: she clears the gap, narrowly.
    const shreya = group('recruiter', 'Shreya Ramesh')
    near(shreya.rate, 0.492)
    expect((shreya.gap as number) >= m.settings.gapPts).toBe(true)
    expect(shreya.gap as number).toBeLessThan(0.12)
  })

  it('three reasons explain 86% of declines', () => {
    expect(m.reasons.slice(0, 3).map((r) => [r.reason, r.declined])).toEqual([
      ['Accepted competing offer', 44],
      ['Compensation below expectations', 23],
      ['Counteroffer from current employer', 9],
    ])
    expect(m.toLine).toHaveLength(3)
    near(m.toLine[2].cumulative, 76 / 88, 1e-12)
  })

  it('days to offer shows no link; deciding after a week does', () => {
    near(m.toOffer.rows[0].rate, 0.215, 0.005)
    near(m.toOffer.rows[1].rate, 0.226, 0.005)
    expect(m.toOffer.flat).toBe(true)
    expect(m.toDecide.flat).toBe(false)
    const slow = m.findings.find((f) => f.id === 'hrbp-declines-slow-decisions')!
    expect(slow.title).toBe(
      'Offers decided after more than a week were declined 59% of the time, against 17% within a week.',
    )
    expect(rowsOf(slow.drill)).toHaveLength(51)
  })

  it('competing offers: mostly on competing and pay declines, never on counteroffers; revising helps', () => {
    const declined = m.declined
    const share = (reason: string) => {
      const list = declined.filter((o) => o.reason?.reason === reason)
      return list.filter((o) => o.competing === true).length / list.length
    }
    expect(share('Accepted competing offer')).toBeGreaterThanOrEqual(0.8)
    expect(share('Counteroffer from current employer')).toBe(0)
    near(share('Compensation below expectations'), 0.3, 0.05)
    const [rev, notRev] = m.competing
    expect([rev.accepted, rev.resolved, notRev.accepted, notRev.resolved]).toEqual([11, 17, 10, 49])
    expect(rev.acceptance as number).toBeGreaterThanOrEqual(0.55)
    expect(notRev.acceptance as number).toBeLessThanOrEqual(0.25)
    const all = (11 + 10) / (17 + 49)
    expect(all).toBeGreaterThanOrEqual(0.25)
    expect(all).toBeLessThanOrEqual(0.35)
  })

  it('declined offers sat low in the range, lowest in Bengaluru', () => {
    const blr = m.range.find((r) => r.label === 'Bengaluru')!
    expect(blr.declined as number).toBeGreaterThanOrEqual(0.18)
    expect(blr.declined as number).toBeLessThanOrEqual(0.24)
    expect(blr.accepted as number).toBeGreaterThanOrEqual(0.35)
    expect(blr.accepted as number).toBeLessThanOrEqual(0.42)
    const senior = m.offers.filter((o) => o.declined && o.band === 'L5-L6' && o.position != null)
    const med = median(senior.map((o) => o.position as number)) as number
    expect(med).toBeGreaterThanOrEqual(0.3)
    expect(med).toBeLessThanOrEqual(0.38)
  })

  it('reneges stay rare', () => {
    near(m.kpis.find((k) => k.id === 'renege-rate')?.value, 0.006, 0.001)
  })
})

describe('the readout', () => {
  it('fires the rules the sample plants, warnings first, and names where', () => {
    expect(m.findings.map((f) => f.id)).toEqual([
      'hrbp-declines-above-expected',
      'hrbp-declines-rising',
      'hrbp-declines-slow-decisions',
      'hrbp-declines-low-in-range',
      'hrbp-declines-reasons',
      'hrbp-declines-revising',
    ])
    const [above, rising, , low, reasons, revising] = m.findings
    expect(above.title).toBe(
      'Offers at L5 and L6 were declined 66% of the time, against 13% at other levels.',
    )
    expect(above.detail).toContain('The gap holds in Bengaluru and elsewhere.')
    expect(above.filter).toEqual({ level: ['L5', 'L6'] })
    expect(above.filterLabel).toBe('L5 and L6')
    expect(rising.title).toBe('Offer declines rose to 32% in Q3 2026 from 15% in Q2, mostly in Bengaluru.')
    expect(rising.filter).toEqual({ location: ['Bengaluru'] })
    expect(rowsOf(rising.drill)).toHaveLength(157)
    expect(low.title).toBe(
      'Declined offers in Bengaluru sat at 0.19 of the range, against 0.37 for accepted ones.',
    )
    expect(reasons.title).toBe(
      'Three reasons explain 86% of declined offers: a competing offer (50%), pay below expectations (26%) and a counteroffer (10%).',
    )
    expect(rowsOf(reasons.drill)).toHaveLength(76)
    expect(revising.title).toBe(
      'Candidates with a competing offer accepted 32% of offers; when we revised the offer, 65% accepted.',
    )
    for (const f of m.findings) {
      expect(f.metricId, f.id).toBeTruthy()
      expect(ctx.metrics.def(f.metricId as string), f.id).toBeTruthy()
      expect(f.uses?.length, f.id).toBeGreaterThan(0)
      expect(`${f.title} ${f.detail} ${f.action}`, f.id).not.toMatch(/—|!|\b(chase|push|nag|ping|hound)\b/i)
    }
  })
})

describe('tiles', () => {
  it('show the sample’s numbers, each with its metric, and open the offers they count', () => {
    const tile = (id: string) => m.kpis.find((k) => k.id === id)!
    expect(m.kpis.map((k) => k.id)).toEqual([
      'decline-rate',
      'declined-offers',
      'top-reason',
      'with-competing-offer',
      'days-to-decide',
      'renege-rate',
    ])
    near(tile('decline-rate').value, 0.219)
    expect(tile('decline-rate').deltaLabel).toBe('vs prior 12 months')
    expect(tile('declined-offers').value).toBe(88)
    expect(tile('top-reason')).toMatchObject({ value: 0.5, note: 'Accepted competing offer' })
    expect(tile('days-to-decide').value).toBe(6)
    expect(tile('days-to-decide').note).toBe('Accepted: 4 d')
    expect(rowsOf(tile('decline-rate').drill)).toHaveLength(401)
    expect(rowsOf(tile('decline-rate').deltaDrill)).toHaveLength(m.priorCount.resolved)
    expect(rowsOf(tile('declined-offers').drill)).toHaveLength(88)
    expect(rowsOf(tile('top-reason').drill)).toHaveLength(44)
    const comp = m.declined.filter((o) => o.competing === true).length
    expect(rowsOf(tile('with-competing-offer').drill)).toHaveLength(comp)
    expect(rowsOf(tile('days-to-decide').drill)).toHaveLength(88)
    expect(rowsOf(tile('days-to-decide').noteDrill)).toHaveLength(313)
    expect(rowsOf(tile('renege-rate').drill)).toHaveLength(m.renege.accepted.length)
    for (const k of m.kpis) {
      expect(ctx.metrics.def(k.metricId as string), k.id).toBeTruthy()
      expect(k.uses?.length, k.id).toBeGreaterThan(0)
    }
  })

  it('compare with the company under an org filter', () => {
    const blr = analysisModel<DeclinesModel>(sampleCtx({ location: ['Bengaluru'] }), 'declines')
    const rate = blr.kpis[0]
    expect(rate.deltaLabel).toBe('vs company')
    near(rate.value, 48 / 132, 1e-12)
    near(rate.delta, 48 / 132 - 88 / 401, 1e-12)
    expect(blr.companyQuarters).toHaveLength(8)
  })
})

describe('every mark opens the offers it counts', () => {
  it('reasons, quarters, groups, buckets, competing groups, range dots and themes', () => {
    for (const r of m.reasons) expect(rowsOf(reasonDrill(ctx, m)(r)), r.reason).toHaveLength(r.declined)
    for (const q of m.quarters)
      expect(rowsOf(quarterDrill(ctx, m)(q)), q.label).toHaveLength(q.rate == null ? 0 : q.resolved)
    for (const g of m.groups)
      expect(rowsOf(groupDrill(ctx, m)(g)), `${g.cut} ${g.group}`).toHaveLength(
        g.rate == null ? 0 : g.resolved,
      )
    for (const b of [...m.toOffer.rows, ...m.toDecide.rows])
      expect(rowsOf(bucketDrill(ctx, m)(b)), b.bucket).toHaveLength(b.rate == null ? 0 : b.resolved)
    for (const c of m.competing)
      expect(rowsOf(competingDrill(ctx, m)(c)), c.group).toHaveLength(c.acceptance == null ? 0 : c.resolved)
    for (const r of m.range) {
      expect(rowsOf(rangeDrill(ctx, m)(r, 'declined')), r.label).toHaveLength(
        r.declined == null ? 0 : r.declinedN,
      )
      expect(rowsOf(rangeDrill(ctx, m)(r, 'accepted')), r.label).toHaveLength(
        r.accepted == null ? 0 : r.acceptedN,
      )
    }
    for (const t of m.themes) expect(rowsOf(themeDrill(ctx, m)(t)), t.theme).toHaveLength(t.declined)
  })

  it('a hire who has started opens their employee card', () => {
    const spec = resolveDrill(
      groupDrill(ctx, m)(m.groups.find((g) => g.cut === 'location' && g.group === 'San Jose')!),
    )
    const extra = spec?.extra
    const linked = (spec?.rows ?? []).filter(
      (r) => (extra?.values(r as never) as { employeeId?: string })?.employeeId,
    )
    expect(linked.length).toBeGreaterThan(0)
  })
})

describe('Filter to this', () => {
  const cutCase = (cut: 'level' | 'location' | 'businessUnit') => ({
    name: `decline rate by ${cut}`,
    rows: (x: AnalyticsContext) =>
      analysisModel<DeclinesModel>(x, 'declines').groups.filter((g) => g.cut === cut && g.kind === 'group'),
    key: (r: GroupRow) => r.group,
    value: (r: GroupRow) => r.rate,
    drill: (r: GroupRow, x: AnalyticsContext) =>
      groupDrill(x, analysisModel<DeclinesModel>(x, 'declines'))(r),
    kind: 'rate' as const,
  })

  it('reproduces a level band, a location and a business unit', () => {
    for (const cut of ['level', 'location', 'businessUnit'] as const) {
      expectFilterTo(ctx, cutCase(cut), { sample: 3 })
      expectLeaveOut(ctx, cutCase(cut), { sample: 2 })
    }
  })

  it('sets the quarter as the period, so the tiles show that quarter', () => {
    const q3 = m.quarters.at(-1)!
    const filter = resolveDrill(quarterDrill(ctx, m)(q3))?.filter
    expect(filter).toEqual({ period: 'custom', customStart: '2026-07-01', customEnd: '2026-09-30' })
    const after = declinesModel(applyDrillFilter(ctx, filter!))
    expect(after.count.resolved).toBe(q3.resolved)
    expect(after.count.declined).toBe(q3.declined)
  })

  it('sets nothing on sources, people, reasons, buckets, competing groups or themes', () => {
    const none = [
      ...m.groups
        .filter((g) => ['source', 'recruiter', 'hiringManager'].includes(g.cut))
        .map((g) => groupDrill(ctx, m)(g)),
      ...m.groups.filter((g) => g.kind !== 'group').map((g) => groupDrill(ctx, m)(g)),
      ...m.reasons.map((r) => reasonDrill(ctx, m)(r)),
      ...[...m.toOffer.rows, ...m.toDecide.rows].map((b) => bucketDrill(ctx, m)(b)),
      ...m.competing.map((c) => competingDrill(ctx, m)(c)),
      ...m.themes.map((t) => themeDrill(ctx, m)(t)),
      rangeDrill(ctx, m)(m.range[0], 'declined'),
    ]
    for (const src of none) expect(resolveDrill(src)?.filter).toBeUndefined()
  })
})

describe('settings', () => {
  const run = (params: Parameters<typeof metricsWith>[0]) => declinesModel(sampleCtx({}, metricsWith(params)))

  it('change the numbers they say they change', () => {
    // A lower person minimum shows more hiring managers on their own.
    const named = (x: DeclinesModel) =>
      x.groups.filter((g) => g.cut === 'hiringManager' && g.kind === 'group').length
    expect(named(run({ [DM.rate]: { minPersonOffers: 5 } }))).toBeGreaterThan(named(m))
    // A larger cell falls back to locations: the expected rate of L5 and L6 moves.
    const exp = (x: DeclinesModel) => x.groups.find((g) => g.cut === 'level' && g.group === 'L5-L6')?.expected
    expect(exp(run({ [DM.expected]: { minCell: 200 } }))).not.toBeCloseTo(exp(m) as number, 4)
    const ids = (x: DeclinesModel) => x.findings.map((f) => f.id)
    expect(ids(run({ [DM.findings]: { risePts: 0.2 } }))).not.toContain('hrbp-declines-rising')
    expect(ids(run({ [DM.findings]: { minResolved: 200 } }))).not.toContain('hrbp-declines-rising')
    expect(ids(run({ [DM.findings]: { gapPts: 0.45 } }))).not.toContain('hrbp-declines-above-expected')
    expect(ids(run({ [DM.rangePosition]: { rangeGap: 0.25 } }))).not.toContain('hrbp-declines-low-in-range')
    const slow = run({ [DM.findings]: { slowDecisionDays: 14 } }).findings.find(
      (f) => f.id === 'hrbp-declines-slow-decisions',
    )
    expect(slow?.title ?? '').not.toContain('a week')
  })
})

describe('privacy and shape', () => {
  it('holds no rate under its minimum, and every value is finite or null', () => {
    const s = m.settings
    for (const g of m.groups) {
      const min =
        ['recruiter', 'hiringManager'].includes(g.cut) && g.kind === 'group' ? s.minPersonOffers : s.minGroup
      if (g.resolved < min) expect(g.rate, `${g.cut} ${g.group}`).toBeNull()
    }
    for (const q of [...m.quarters]) if (q.resolved < s.minGroup) expect(q.rate).toBeNull()
    const values = [
      ...m.kpis.flatMap((k) => [k.value, k.delta]),
      ...m.groups.flatMap((g) => [g.rate, g.expected, g.gap, g.low, g.high]),
      ...m.reasons.flatMap((r) => [r.share, r.cumulative]),
      ...m.range.flatMap((r) => [r.declined, r.accepted, r.gap]),
      ...m.competing.map((c) => c.acceptance),
    ]
    for (const v of values) expect(v == null || Number.isFinite(v)).toBe(true)
  })

  it('no cut lets a hidden group be worked out from the totals shown (complementary suppression)', () => {
    const scopes = [
      ctx,
      sampleCtx({ businessUnit: ['Silicon Engineering'] }),
      sampleCtx({ location: ['Bengaluru'] }),
      sampleCtx({ businessUnit: ['Go-to-Market'] }),
    ]
    for (const c of scopes) {
      const mm = analysisModel<DeclinesModel>(c, 'declines')
      const s = mm.settings
      for (const cut of ['level', 'location', 'businessUnit', 'source', 'recruiter', 'hiringManager']) {
        const rows = mm.groups.filter((g) => g.cut === cut)
        if (!rows.length) continue
        // Every cut adds up to the offers the KPI strip counts.
        expect(
          rows.reduce((n, g) => n + g.resolved, 0),
          `${c.scopeLabel} ${cut}`,
        ).toBe(mm.offers.length)
        const min = cut === 'recruiter' || cut === 'hiringManager' ? s.minPersonOffers : s.minGroup
        const held = rows.filter((g) => g.declined == null).reduce((n, g) => n + g.resolved, 0)
        expect(held === 0 || held >= min, `${c.scopeLabel} ${cut}: ${held} offers hidden`).toBe(true)
      }
    }
    // The reviewer's case: Toronto's 4 offers no longer read as 0 declines by elimination.
    expect(m.groups.find((g) => g.cut === 'location' && g.group === 'Toronto')).toMatchObject({
      resolved: 4,
      declined: null,
    })
    expect(m.groups.filter((g) => g.cut === 'location' && g.declined == null).length).toBeGreaterThan(1)
  })

  it('never exports a pay amount: position in range is a ratio', () => {
    expect(ctx.metrics.def(DM.rangePosition)?.unit).toBe('ratio')
  })
})
