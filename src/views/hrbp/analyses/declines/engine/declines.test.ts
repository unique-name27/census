/**
 * Offer declines' definitions on hand-built offers (docs/ANALYSES.md, 7.1): the decline rate is one
 * minus Recruiting's acceptance on the same offers, reneges are not declines, reasons map onto the
 * list and its themes, the Pareto ends at 100% with "Other reasons" after the named ones, the
 * expected rate leaves the cut's own dimension out, people fold under their minimum, buckets meet
 * at their edges, competing and revised groups, medians of position in range, suppression, and
 * every drill lists exactly the offers its number counts.
 */
import { describe, expect, it } from 'vitest'
import type { Candidate, Requisition } from '@/data/schema'
import { resolveDrill } from '@/drill/Drill'
import { addDays } from '@/lib/dates'
import { metricsWith } from '@/metrics/testing'
import { cand, ctxOf, req } from '@/views/recruiting/engine/fixtures'
import { prepareApps, reqIndex } from '@/views/recruiting/engine/prepare'
import { acceptance, resolvedOffers } from '@/views/recruiting/engine/sources'
import { competingGroupOf, rangeRows } from './competing'
import { cutDef, cutRows } from './cuts'
import { competingDrill, groupDrill, rangeDrill, reasonDrill } from './figureDrills'
import { aboveExpectedRow, soleGroup } from './findings'
import { DECLINES } from './index'
import { recordedNote } from './kpis'
import { DM, DSET } from './metrics'
import { mixBenchmark, wilson } from './mix'
import { declinesModel } from './model'
import type { Offer } from './offers'
import { declinesSettings } from './settings'
import { DECIDE_BUCKETS, inBucket, OFFER_BUCKETS } from './timing'

const W = { start: '2025-10-01', end: '2026-09-30' }

interface OfferOpts {
  /** The decision date (accepted or declined). */
  on?: string
  /** Days from offer to decision. */
  decide?: number
  /** Days from the final interview (onsite) to the offer. */
  toOffer?: number
  reason?: string | null
  competing?: boolean | null
  revised?: boolean | null
  position?: number | null
  source?: string
  recruiter?: string
}

/** One resolved offer on a req: accepted (Hired) or declined, with its dates. */
function offer(reqId: string, outcome: 'Hired' | 'Declined', o: OfferOpts = {}): Candidate {
  const on = o.on ?? '2026-06-15'
  const offerDate = addDays(on, -(o.decide ?? 3))
  const onsite = addDays(offerDate, -(o.toOffer ?? 5))
  return cand(reqId, {
    status: outcome,
    currentStage: outcome === 'Hired' ? 'Hired' : 'Offer',
    appliedDate: addDays(onsite, -30),
    onsiteDate: onsite,
    offerDate,
    hiredDate: outcome === 'Hired' ? on : null,
    rejectedDate: outcome === 'Declined' ? on : null,
    rejectionReason:
      outcome === 'Declined' ? (o.reason === undefined ? 'Accepted competing offer' : o.reason) : null,
    competingOffer: o.competing ?? null,
    offerRevised: o.revised ?? null,
    offerPositionInRange: o.position ?? null,
    source: o.source ?? 'Referral',
    recruiter: o.recruiter ?? 'Rita Recruiter',
  })
}

const many = (n: number, f: (i: number) => Candidate): Candidate[] =>
  Array.from({ length: n }, (_, i) => f(i))

const rows = (src: unknown) => resolveDrill(src as Parameters<typeof resolveDrill>[0])?.rows ?? []

const REQS: Requisition[] = [
  req('SJ4', {
    location: 'San Jose',
    level: 'L4',
    businessUnit: 'Silicon Engineering',
    hiringManager: 'Hana Manager',
  }),
  req('BL5', {
    location: 'Bengaluru',
    level: 'L5',
    businessUnit: 'Systems & Software',
    hiringManager: 'Bala Manager',
  }),
  req('BL3', {
    location: 'Bengaluru',
    level: 'L3',
    businessUnit: 'Systems & Software',
    hiringManager: 'Bala Manager',
  }),
  req('AU6', {
    location: 'Austin',
    level: 'L6',
    businessUnit: 'Silicon Engineering',
    hiringManager: 'Hana Manager',
  }),
]

describe('offers and the decline rate', () => {
  const candidates = [
    ...many(8, () => offer('SJ4', 'Hired')),
    ...many(2, () => offer('SJ4', 'Declined')),
    ...many(3, () => offer('BL5', 'Hired')),
    ...many(4, () => offer('BL5', 'Declined')),
    // A renege: accepted, then withdrawn. Not a decline, and not a resolved offer.
    cand('SJ4', {
      status: 'Withdrawn',
      appliedDate: '2026-01-02',
      offerDate: '2026-02-01',
      hiredDate: '2026-02-03',
      rejectedDate: '2026-03-01',
    }),
    // Resolved before the window.
    offer('SJ4', 'Declined', { on: '2025-06-01' }),
  ]
  const ctx = ctxOf({ requisitions: REQS, candidates })
  const m = declinesModel(ctx)

  it('is one minus Recruiting’s offer acceptance on the same offers', () => {
    const apps = resolvedOffers(prepareApps(candidates, reqIndex(REQS), ctx.asOf), W)
    const acc = acceptance(apps)
    expect(m.count).toMatchObject({ resolved: 17, declined: 6, accepted: 11 })
    expect(m.count.rate).toBeCloseTo(6 / 17, 12)
    expect(m.count.rate).toBeCloseTo(1 - (acc.rate as number), 12)
    expect(m.offers.map((o) => o.app.id).sort()).toEqual(apps.map((a) => a.id).sort())
  })

  it('leaves reneges out of declines and counts them on their own tile', () => {
    expect(m.offers.some((o) => o.app.raw.status === 'Withdrawn')).toBe(false)
    const renege = m.kpis.find((k) => k.id === 'renege-rate')!
    expect(m.renege.reneged).toHaveLength(1)
    expect(m.renege.accepted).toHaveLength(12)
    expect(renege.value).toBeCloseTo(1 / 12, 12)
    expect(rows(renege.drill)).toHaveLength(12)
  })

  it('opens exactly the offers each tile counts', () => {
    const tile = (id: string) => m.kpis.find((k) => k.id === id)!
    expect(rows(tile('decline-rate').drill)).toHaveLength(17)
    expect(rows(tile('declined-offers').drill)).toHaveLength(6)
    expect(tile('declined-offers').value).toBe(6)
    // Declined first, then the latest decision first.
    const listed = rows(tile('decline-rate').drill) as Candidate[]
    expect(listed.slice(0, 6).every((c) => c.status === 'Declined')).toBe(true)
    expect(tile('decline-rate').formula).toBe('6 declined ÷ 17 offers resolved (accepted or declined).')
  })
})

describe('reasons and themes', () => {
  const raw = [
    'accepted another offer',
    'Went with another company',
    'salary',
    'comp',
    'Pay',
    'counter offer',
    'counter',
    'relocation',
    'commute',
    'notice period',
    'Bad weather',
    null,
  ]
  const ctx = ctxOf({
    requisitions: REQS,
    candidates: [
      ...raw.map((r) => offer('SJ4', 'Declined', { reason: r })),
      ...many(10, () => offer('SJ4', 'Hired')),
    ],
  })
  const m = declinesModel(ctx)

  it('reads each wording onto the Offer decline reasons list, with its theme', () => {
    const read = new Map(m.declined.map((o) => [o.app.raw.rejectionReason ?? '', o.reason]))
    expect(read.get('accepted another offer')).toMatchObject({
      reason: 'Accepted competing offer',
      theme: 'Competition',
    })
    expect(read.get('Went with another company')?.reason).toBe('Accepted competing offer')
    for (const r of ['salary', 'comp', 'Pay'])
      expect(read.get(r), r).toMatchObject({ reason: 'Compensation below expectations', theme: 'Pay' })
    for (const r of ['counter offer', 'counter'])
      expect(read.get(r), r).toMatchObject({
        reason: 'Counteroffer from current employer',
        theme: 'Competition',
      })
    for (const r of ['relocation', 'commute'])
      expect(read.get(r), r).toMatchObject({ reason: 'Location or relocation', theme: 'Logistics' })
    expect(read.get('notice period')).toMatchObject({
      reason: 'Start date or notice period',
      theme: 'Logistics',
    })
    expect(read.get('Bad weather')).toMatchObject({
      reason: 'Bad weather',
      theme: 'Other',
      recognized: false,
    })
    expect(read.get('')).toBeNull()
  })

  it('draws a Pareto that ends at 100%, with Other reasons after the named ones and Not recorded last', () => {
    expect(m.reasons.map((r) => [r.reason, r.declined])).toEqual([
      ['Compensation below expectations', 3],
      ['Accepted competing offer', 2],
      ['Counteroffer from current employer', 2],
      ['Location or relocation', 2],
      ['Start date or notice period', 1],
      ['Other reasons (1)', 1],
      ['Not recorded', 1],
    ])
    expect(m.reasons.at(-1)?.cumulative).toBeCloseTo(1, 12)
    expect(m.reasons.reduce((s, r) => s + (r.share ?? 0), 0)).toBeCloseTo(1, 12)
    // The running total only grows.
    for (let i = 1; i < m.reasons.length; i++)
      expect(m.reasons[i].cumulative).toBeGreaterThan(m.reasons[i - 1].cumulative ?? 1)
    // Each column opens its declined offers.
    for (const r of m.reasons) expect(rows(reasonDrill(ctx, m)(r))).toHaveLength(r.declined)
  })

  it('folds the reasons beyond the top ones into Other reasons, whatever its size', () => {
    const many8 = [
      'salary',
      'counter',
      'relocation',
      'notice period',
      'too slow',
      'family',
      'team',
      'bonus',
      'title',
    ]
    const c2 = ctxOf({
      requisitions: REQS,
      candidates: [
        ...many8.flatMap((r, i) => many(9 - i, () => offer('SJ4', 'Declined', { reason: r }))),
        ...many(5, () => offer('SJ4', 'Hired')),
      ],
    })
    const r2 = declinesModel(c2).reasons
    expect(r2.filter((r) => r.kind === 'reason')).toHaveLength(7)
    expect(r2.at(-1)).toMatchObject({ reason: 'Other reasons (2)', kind: 'other', declined: 3 })
  })

  it('names themes by size with the owner and the next step for where they concentrate', () => {
    const themes = m.themes.map((t) => t.theme)
    // Competition 4 (two competing offers, two counteroffers); Pay and Logistics 3 each, in theme order.
    expect(themes.slice(0, 3)).toEqual(['Competition', 'Pay', 'Logistics'])
    expect(themes.at(-1)).toBe('Other')
    const pay = m.themes.find((t) => t.theme === 'Pay')!
    expect(pay.owner).toBe('Total rewards')
    expect(pay.nextStep).toBe('Review offer ranges with Total rewards before the next offers go out.')
    expect(m.themes.find((t) => t.theme === 'Other')?.nextStep).toBeNull()
  })
})

describe('the expected rate from location and level', () => {
  const o = (location: string, band: Offer['band'], declined: boolean) =>
    ({ location, band, declined }) as Offer
  const company = [
    ...many(6, (i) => o('Bengaluru', 'L5-L6', i < 4) as never),
    ...many(6, (i) => o('Bengaluru', 'L1-L4', i < 1) as never),
    ...many(8, (i) => o('San Jose', 'L1-L4', i < 1) as never),
    ...many(2, () => o('San Jose', 'L5-L6', true) as never),
  ] as unknown as Offer[]
  const mix = mixBenchmark(company, 5)

  it('uses the finest cell with enough offers, then the location, then the company', () => {
    expect(mix.cellRate(o('Bengaluru', 'L5-L6', false))).toBeCloseTo(4 / 6, 12)
    // San Jose L5-L6 has 2 offers: the location takes over.
    expect(mix.cellRate(o('San Jose', 'L5-L6', false))).toBeCloseTo(3 / 10, 12)
    // No offers at all in Munich: the company.
    expect(mix.cellRate(o('Munich', 'L1-L4', false))).toBeCloseTo(8 / 22, 12)
  })

  it('leaves the cut’s own dimension out of the cells', () => {
    // Cut by location: the level band alone.
    expect(mix.cellRate(o('Bengaluru', 'L5-L6', false), 'location')).toBeCloseTo(6 / 8, 12)
    // Cut by level: the location alone.
    expect(mix.cellRate(o('Bengaluru', 'L5-L6', false), 'band')).toBeCloseTo(5 / 12, 12)
    const group = [o('Bengaluru', 'L5-L6', true), o('San Jose', 'L1-L4', false)]
    expect(mix.expected(group)).toBeCloseTo((4 / 6 + 1 / 8) / 2, 12)
  })

  it('reads the cell size from its setting', () => {
    const ctx = ctxOf({ requisitions: REQS }, { metrics: metricsWith({ [DM.expected]: { minCell: 7 } }) })
    expect(declinesSettings(ctx.metrics).minCell).toBe(7)
    const strict = mixBenchmark(company, 7)
    // Bengaluru L5-L6 has 6 offers: under 7 it falls back to Bengaluru.
    expect(strict.cellRate(o('Bengaluru', 'L5-L6', false))).toBeCloseTo(5 / 12, 12)
  })

  it('gives a 90% Wilson interval that holds the rate', () => {
    const w = wilson(46, 70)!
    expect(w.low).toBeLessThan(46 / 70)
    expect(w.high).toBeGreaterThan(46 / 70)
    expect(w.low).toBeCloseTo(0.5595, 3)
    expect(w.high).toBeCloseTo(0.743, 3)
    expect(wilson(0, 10)?.low).toBe(0)
    expect(wilson(0, 0)).toBeNull()
  })
})

describe('groups, folds and suppression', () => {
  const candidates = [
    // Rita: 10 offers, shown on her own.
    ...many(10, (i) => offer('SJ4', i < 3 ? 'Declined' : 'Hired', { recruiter: 'Rita Recruiter' })),
    // Sam 9 and Tess 6: both under 10, folded together.
    ...many(9, (i) => offer('BL5', i < 5 ? 'Declined' : 'Hired', { recruiter: 'Sam Sourcer' })),
    ...many(6, (i) => offer('BL3', i < 1 ? 'Declined' : 'Hired', { recruiter: 'Tess Talent' })),
    // Austin: 3 offers, under the anonymity minimum.
    ...many(3, (i) =>
      offer('AU6', i < 2 ? 'Declined' : 'Hired', { recruiter: 'Rita Recruiter', source: '' }),
    ),
  ]
  const ctx = ctxOf({ requisitions: REQS, candidates })
  const m = declinesModel(ctx)
  const s = m.settings
  const cut = (k: Parameters<typeof cutDef>[0]) => m.groups.filter((g) => g.cut === k)

  it('folds recruiters under the person minimum into Other recruiters', () => {
    const people = cut('recruiter')
    expect(people.map((g) => [g.group, g.resolved, g.declined])).toEqual([
      ['Rita Recruiter', 13, 5],
      ['Other recruiters (2)', 15, 6],
    ])
    expect(people[0].rate).toBeCloseTo(5 / 13, 12)
    // At a person minimum of 5, all three show.
    const lower = declinesModel(
      ctxOf(
        { requisitions: REQS, candidates },
        { metrics: metricsWith({ [DM.rate]: { minPersonOffers: 5 } }) },
      ),
    )
    expect(lower.groups.filter((g) => g.cut === 'recruiter').map((g) => g.group)).toEqual([
      'Rita Recruiter',
      'Sam Sourcer',
      'Tess Talent',
    ])
  })

  it('keeps a lone small group by name with its count only, and hides it from drills', () => {
    const austin = cut('location').find((g) => g.group === 'Austin')!
    expect(austin).toMatchObject({ resolved: 3, declined: null, rate: null, expected: null, offers: [] })
    expect(groupDrill(ctx, m)(austin)).toBeNull()
    // The level band of the Austin req (L6) shares a row with Bengaluru's L5: not small.
    expect(cut('level').map((g) => [g.group, g.resolved])).toEqual([
      ['L1-L4', 16],
      ['L5-L6', 12],
    ])
  })

  it('lists a blank value as Not recorded, last and never folded', () => {
    const sources = cut('source')
    expect(sources.at(-1)).toMatchObject({
      group: 'Not recorded',
      kind: 'notRecorded',
      resolved: 3,
      rate: null,
    })
    expect(sources[0].group).toBe('Referral')
  })

  it('opens each group’s offers with the filter that reproduces it, and none for sources or people', () => {
    const drillOf = groupDrill(ctx, m)
    for (const g of m.groups) {
      const spec = resolveDrill(drillOf(g))
      if (g.rate == null) {
        expect(spec, `${g.cut} ${g.group}`).toBeNull()
        continue
      }
      expect(spec?.rows, `${g.cut} ${g.group}`).toHaveLength(g.resolved)
      const dim = cutDef(g.cut).dim
      if (dim && g.kind === 'group') expect(spec?.filter, g.group).toBeDefined()
      else expect(spec?.filter, `${g.cut} ${g.group}`).toBeUndefined()
    }
    const band = resolveDrill(drillOf(cut('level').find((g) => g.group === 'L5-L6')!))
    expect(band?.filter).toEqual({ level: ['L5', 'L6'] })
    expect(band?.filterLabel).toBe('L5 and L6')
  })

  it('flags a group past the gap only with enough offers', () => {
    // Sam's Bengaluru L5 offers decline 56%, but 9 offers is under the person minimum and 20 for groups.
    expect(m.groups.filter((g) => g.flagged)).toEqual([])
    expect(s.minResolved).toBe(20)
  })
})

describe('speed, competing offers and the range', () => {
  it('meets at the bucket edges: 7 and 8 days, 3 and 4 days', () => {
    const b = (list: typeof OFFER_BUCKETS, d: number) => list.find((x) => inBucket(x, d))?.key
    expect(b(OFFER_BUCKETS, 7)).toBe('0-7 d')
    expect(b(OFFER_BUCKETS, 8)).toBe('8-14 d')
    expect(b(OFFER_BUCKETS, 21)).toBe('15-21 d')
    expect(b(OFFER_BUCKETS, 22)).toBe('22+ d')
    expect(b(DECIDE_BUCKETS, 3)).toBe('0-3 d')
    expect(b(DECIDE_BUCKETS, 4)).toBe('4-7 d')
    expect(b(DECIDE_BUCKETS, 7)).toBe('4-7 d')
    expect(b(DECIDE_BUCKETS, 8)).toBe('8-14 d')
    expect(b(DECIDE_BUCKETS, 15)).toBe('15+ d')
    const ctx = ctxOf({
      requisitions: REQS,
      candidates: [
        ...many(5, () => offer('SJ4', 'Hired', { toOffer: 7, decide: 7 })),
        ...many(5, () => offer('SJ4', 'Declined', { toOffer: 8, decide: 8 })),
      ],
    })
    const m = declinesModel(ctx)
    expect(m.toOffer.rows.map((r) => [r.bucket, r.resolved, r.rate])).toEqual([
      ['0-7 d', 5, 0],
      ['8-14 d', 5, 1],
      ['15-21 d', 0, null],
      ['22+ d', 0, null],
    ])
    expect(m.toDecide.rows.map((r) => [r.bucket, r.resolved])).toEqual([
      ['0-3 d', 0],
      ['4-7 d', 5],
      ['8-14 d', 5],
      ['15+ d', 0],
    ])
    expect(m.decide.declined.days).toBe(8)
    expect(m.decide.accepted.days).toBe(7)
  })

  it('splits acceptance by competing offer and revised offer, a blank reading as none', () => {
    const g = (competing: boolean | null, revised: boolean | null) =>
      competingGroupOf({ competing, revised } as Offer)
    expect(g(true, true)).toBe('Competing offer, revised')
    expect(g(true, false)).toBe('Competing offer, not revised')
    expect(g(true, null)).toBe('Competing offer, not revised')
    expect(g(null, true)).toBe('No competing offer recorded, revised')
    expect(g(false, null)).toBe('No competing offer recorded, not revised')
    const ctx = ctxOf({
      requisitions: REQS,
      candidates: [
        ...many(6, (i) => offer('SJ4', i < 4 ? 'Hired' : 'Declined', { competing: true, revised: true })),
        ...many(8, (i) => offer('SJ4', i < 2 ? 'Hired' : 'Declined', { competing: true, revised: false })),
        ...many(10, (i) => offer('SJ4', i < 9 ? 'Hired' : 'Declined', { competing: false })),
      ],
    })
    const m = declinesModel(ctx)
    expect(m.competing.map((r) => [r.group, r.accepted, r.resolved, r.acceptance])).toEqual([
      ['Competing offer, revised', 4, 6, 4 / 6],
      ['Competing offer, not revised', 2, 8, 2 / 8],
      ['No competing offer recorded, revised', null, 0, null],
      ['No competing offer recorded, not revised', 9, 10, 0.9],
    ])
    for (const r of m.competing)
      expect(rows(competingDrill(ctx, m)(r))).toHaveLength(r.acceptance == null ? 0 : r.resolved)
    const rev = m.findings.find((f) => f.id === 'hrbp-declines-revising')
    expect(rev?.title).toBe(
      'Candidates with a competing offer accepted 43% of offers; when we revised the offer, 67% accepted.',
    )
    // The tile: declines with a competing offer among those with it recorded.
    const tile = m.kpis.find((k) => k.id === 'with-competing-offer')!
    expect(tile.value).toBeCloseTo(8 / 9, 12)
    expect(rows(tile.drill)).toHaveLength(8)
  })

  it('compares median position in range of declined and accepted offers, the company first', () => {
    const ctx = ctxOf({
      requisitions: REQS,
      candidates: [
        ...[0.1, 0.2, 0.2, 0.3, 0.4].map((p) => offer('BL5', 'Declined', { position: p })),
        ...[0.3, 0.4, 0.4, 0.5, 0.6, 0.7].map((p) => offer('BL5', 'Hired', { position: p })),
        ...[0.5, 0.6].map((p) => offer('SJ4', 'Declined', { position: p })),
        ...[0.5, 0.5, 0.6, 0.6, 0.7].map((p) => offer('SJ4', 'Hired', { position: p })),
      ],
    })
    const m = declinesModel(ctx)
    expect(m.range.map((r) => [r.label, r.declined, r.accepted])).toEqual([
      ['Company', 0.3, 0.5],
      ['Bengaluru', 0.2, 0.45],
      // Two declines in San Jose: only the accepted dot shows.
      ['San Jose', null, 0.6],
    ])
    const blr = m.range[1]
    expect(rows(rangeDrill(ctx, m)(blr, 'declined'))).toHaveLength(5)
    expect(resolveDrill(rangeDrill(ctx, m)(blr, 'accepted'))?.filter).toEqual({ location: ['Bengaluru'] })
    expect(rangeDrill(ctx, m)(m.range[2], 'declined')).toBeNull()
    expect(rangeRows([], [], 5)).toEqual([])
    const low = m.findings.find((f) => f.id === 'hrbp-declines-low-in-range')
    expect(low?.title).toBe(
      'Declined offers in Bengaluru sat at 0.20 of the range, against 0.45 for accepted ones.',
    )
    expect(low?.filter).toEqual({ location: ['Bengaluru'] })
    // A wider gap to flag keeps it quiet.
    const quiet = declinesModel(
      ctxOf(
        { requisitions: REQS, candidates: ctx.all.candidates },
        { metrics: metricsWith({ [DSET.rangeGap.metricId]: { rangeGap: 0.3 } }) },
      ),
    )
    expect(quiet.findings.some((f) => f.id === 'hrbp-declines-low-in-range')).toBe(false)
  })
})

describe('a small scope', () => {
  it('hides every rate under five resolved offers, and opens nothing behind it', () => {
    const ctx = ctxOf({
      requisitions: REQS,
      candidates: [offer('SJ4', 'Declined'), offer('SJ4', 'Hired'), offer('SJ4', 'Hired')],
    })
    const m = declinesModel(ctx)
    const rate = m.kpis.find((k) => k.id === 'decline-rate')!
    expect(rate).toMatchObject({ value: null, suppressed: true })
    for (const g of m.groups) expect(g.rate, `${g.cut} ${g.group}`).toBeNull()
    for (const q of m.quarters) expect(q.rate).toBeNull()
    for (const b of [...m.toOffer.rows, ...m.toDecide.rows]) expect(b.rate).toBeNull()
    expect(m.kpis.find((k) => k.id === 'top-reason')).toMatchObject({ value: null, suppressed: true })
    expect(m.findings).toEqual([])
    expect(cutRows(cutDef('location'), m.offers, m.mix, m.settings)[0].offers).toEqual([])
  })

  // Privacy: one declined offer would otherwise read "100% of declines" on the Pareto, in What to
  // do next and in their exports (the figures' rows are these rows).
  it.each([1, 2, 3, 4])(
    'keeps counts but hides every reason and theme share under five declines (%i)',
    (n) => {
      const ctx = ctxOf({
        requisitions: REQS,
        candidates: [
          ...many(n, (i) =>
            offer('SJ4', 'Declined', { reason: i % 2 ? 'Counteroffer from current employer' : undefined }),
          ),
          ...many(12, () => offer('SJ4', 'Hired')),
          offer('BL5', 'Declined', { on: '2025-06-01' }),
        ],
      })
      const m = declinesModel(ctx)
      expect(m.declined).toHaveLength(n)
      expect(m.reasons.reduce((s, r) => s + r.declined, 0)).toBe(n)
      for (const r of m.reasons) {
        expect(r.share, r.reason).toBeNull()
        expect(r.cumulative, r.reason).toBeNull()
      }
      expect(m.toLine).toEqual([])
      expect(m.themes.length).toBeGreaterThan(0)
      for (const t of m.themes) expect(t.share, t.theme).toBeNull()
      expect(m.kpis.find((k) => k.id === 'top-reason')).toMatchObject({ value: null, suppressed: true })
      expect(m.findings.some((f) => f.id === 'hrbp-declines-reasons')).toBe(false)
    },
  )

  it('shows shares again from five declined offers', () => {
    const ctx = ctxOf({
      requisitions: REQS,
      candidates: [...many(5, () => offer('SJ4', 'Declined')), ...many(12, () => offer('SJ4', 'Hired'))],
    })
    const m = declinesModel(ctx)
    expect(m.reasons).toHaveLength(1)
    expect(m.reasons[0]).toMatchObject({ declined: 5, share: 1, cumulative: 1 })
    expect(m.themes[0].share).toBe(1)
  })
})

describe('the competing offer tile note', () => {
  const o = (decisionDate: string, competing: boolean | null) => ({ decisionDate, competing }) as Offer
  it('says which declines the count is out of', () => {
    const all = [o('2026-05-01', true), o('2026-06-01', false)]
    expect(recordedNote(1, all, all)).toBe('1 of 2 declines')
    // Recorded from a date on: the date it starts.
    const started = [o('2026-04-10', null), ...all]
    expect(recordedNote(1, all, started)).toBe('1 of 2 declines; recorded since 1 May 2026')
    // Gaps here and there: where it was recorded.
    const gaps = [...all, o('2026-07-01', null)]
    expect(recordedNote(1, all, gaps)).toBe('1 of 2 declines where it was recorded')
  })
})

describe('a scope that is one group', () => {
  // Bengaluru declines far more than San Jose; filtered to Bengaluru, the location cut is the scope.
  const candidates = [
    ...many(30, () => offer('BL5', 'Declined', { position: 0.1 })),
    ...many(10, () => offer('BL5', 'Hired', { position: 0.5 })),
    ...many(16, () => offer('BL3', 'Declined', { position: 0.1 })),
    ...many(24, () => offer('BL3', 'Hired', { position: 0.5 })),
    ...many(40, () => offer('SJ4', 'Hired', { position: 0.5 })),
    ...many(4, () => offer('SJ4', 'Declined', { position: 0.4 })),
  ]

  it('never describes the scope as a group of itself, or offers to focus on it', () => {
    const company = declinesModel(ctxOf({ requisitions: REQS, candidates }))
    expect(soleGroup(company.offers, (o) => o.location)).toBe(false)
    const blr = declinesModel(
      ctxOf({ requisitions: REQS, candidates }, { filters: { location: ['Bengaluru'] } }),
    )
    expect(soleGroup(blr.offers, (o) => o.location)).toBe(true)
    expect(aboveExpectedRow(blr)?.cut).not.toBe('location')
    for (const f of blr.findings) expect(f.filter, f.id).not.toEqual({ location: ['Bengaluru'] })
    const low = blr.findings.find((f) => f.id === 'hrbp-declines-low-in-range')
    if (low) expect(low.filter).toBeUndefined()
  })
})

describe('without the optional offer fields', () => {
  const candidates = [
    ...many(8, () => offer('SJ4', 'Hired')),
    ...many(6, () => offer('BL5', 'Declined', { reason: null })),
  ].map((c) => ({ ...c, onsiteDate: null, hmDate: null }))
  const ctx = ctxOf({ requisitions: REQS, candidates })
  const m = declinesModel(ctx)

  it('says which column to add, and leaves out what needs it', () => {
    expect(m.has).toMatchObject({
      reasons: false,
      finalInterview: false,
      competing: false,
      revised: false,
      position: false,
    })
    expect(DECLINES.missing(ctx).map((x) => x.id)).toEqual([
      'rejectionReason',
      'finalInterview',
      'competingOffer',
      'offerRevised',
      'offerPositionInRange',
    ])
    const tile = (id: string) => m.kpis.find((k) => k.id === id)!
    expect(tile('with-competing-offer')).toMatchObject({
      value: null,
      note: 'Add Competing offer to Candidates to see this.',
    })
    expect(tile('top-reason')).toMatchObject({
      value: null,
      note: 'Add Rejection reason to Candidates to see this.',
    })
    expect(m.toOffer.measured).toEqual([])
    expect(m.reasons.map((r) => r.reason)).toEqual(['Not recorded'])
    const ids = m.findings.map((f) => f.id)
    for (const id of ['hrbp-declines-revising', 'hrbp-declines-low-in-range', 'hrbp-declines-reasons'])
      expect(ids).not.toContain(id)
  })

  it('is not ready without Candidates, or without a single declined offer', () => {
    expect(DECLINES.ready(ctxOf({ requisitions: REQS }))).toMatchObject({
      ready: false,
      message: 'Upload Candidates and Requisitions to see why offers are declined.',
    })
    expect(
      DECLINES.ready(ctxOf({ requisitions: REQS, candidates: many(5, () => offer('SJ4', 'Hired')) })),
    ).toMatchObject({
      ready: false,
      message: "No declined offers in the data, so declines can't be measured.",
    })
    expect(DECLINES.ready(ctx)).toEqual({ ready: true })
  })
})
