/**
 * The Recruiting view's metric dictionary: every KPI, figure and finding links to a registered
 * metric, every registered setting is read through `ctx.metrics`, changing a setting changes the
 * numbers it should, and the defaults are the constants the view used before.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Finding } from '@/components/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { invalidRefs } from '@/data/quality'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { addDays } from '@/lib/dates'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { ANONYMITY } from '@/metrics/privacy'
import { validateCatalog } from '@/metrics/registry'
import { metricsWith, metricsWithEdits, paramRef, paramsOfView, recordParamReads } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { metrics as REGISTERED, RM } from '../metrics'
import { computeRecruitingUncached } from '.'
import { computeBase } from './base'
import { fillStartDate } from './clock'
import { kpiDefinition, metricDefinition, settingsSentence } from './definitions'
import { filledReqsDrill } from './drills'
import { allProblemFindings } from './findings'
import { cand, ctxOf, emp, req } from './fixtures'
import { headline, recruitingKpis } from './kpis'
import { FIGURE_USES, KPI_USES } from './lineage'
import { FIGURE_ALSO_METRICS, FIGURE_METRICS, FINDING_METRICS, KPI_METRICS } from './metricLinks'
import { prepareApps, reqIndex } from './prepare'
import { defaultSettings } from './settings'

const sources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: 0 } satisfies SourceMeta]),
) as Record<DatasetKey, SourceMeta>

let data: Datasets
const sample = (
  o: { filters?: Partial<Filters>; asOf?: string; metrics?: MetricsApi } = {},
): AnalyticsContext =>
  buildContext({
    data,
    sources,
    filters: { ...DEFAULT_FILTERS, ...o.filters },
    asOfOverride: o.asOf ?? null,
    showPay: false,
    metrics: o.metrics,
  })

beforeAll(() => {
  data = generateSample()
})

const ids = new Set<string>(Object.values(RM))

describe('the recruiting entries', () => {
  it('are sound: ids, views, lineage, settings and copy', () => {
    expect(validateCatalog(REGISTERED)).toEqual([])
    expect(REGISTERED.map((d) => d.id).sort()).toEqual([...ids].sort())
    for (const d of REGISTERED) {
      expect(d.id.startsWith('recruiting.'), d.id).toBe(true)
      expect(d.views[0]).toBe('recruiting')
      expect(CATALOG.byId.get(d.id), d.id).toBe(d)
      expect(d.uses.length, `${d.id} declares no fields`).toBeGreaterThan(0)
      expect(invalidRefs(d.uses), d.id).toEqual([])
      expect(d.owner).toBe('People analytics')
      expect(d.name[0]).toBe(d.name[0].toUpperCase())
      for (const p of d.params) expect(p.label[0], `${d.id} ${p.key}`).toBe(p.label[0].toUpperCase())
    }
  })

  it('reuse the lineage of the numbers they define', () => {
    for (const [kpi, id] of Object.entries(KPI_METRICS))
      expect(CATALOG.byId.get(id)!.uses, kpi).toEqual(KPI_USES[kpi as keyof typeof KPI_USES])
    // A figure that shows exactly one metric's measure declares at least the metric's fields.
    for (const [fig, id] of Object.entries(FIGURE_METRICS)) {
      const figUses = new Set<string>(FIGURE_USES[fig as keyof typeof FIGURE_USES])
      for (const ref of CATALOG.byId.get(id)!.uses) expect(figUses.has(ref), `${fig}: ${ref}`).toBe(true)
    }
  })

  it('are each shown by a KPI, a figure or a readout rule, and every link is registered', () => {
    const linked = new Set<string>([
      ...Object.values(KPI_METRICS),
      ...Object.values(FIGURE_METRICS),
      ...Object.values(FIGURE_ALSO_METRICS).flat(),
      ...Object.values(FINDING_METRICS),
    ])
    expect([...linked].sort()).toEqual([...ids].sort())
    expect(Object.keys(FIGURE_METRICS).sort()).toEqual(Object.keys(FIGURE_USES).sort())
    expect(Object.keys(KPI_METRICS).sort()).toEqual(Object.keys(KPI_USES).sort())
  })

  it('have a settings sentence for every metric with settings', () => {
    const m = defaultMetrics()
    for (const d of REGISTERED) {
      const sentence = settingsSentence(m, d.id as (typeof RM)[keyof typeof RM])
      if (d.params.length) expect(sentence, d.id).toMatch(/^Settings: .+\.$/)
      else expect(sentence, d.id).toBeNull()
      expect(sentence ?? '').not.toMatch(/—|!/)
    }
  })
})

describe('every number links to its dictionary entry', () => {
  it('KPI tiles and the folder-tab headline', () => {
    const ctx = sample()
    const m = computeRecruitingUncached(ctx)
    expect(m.kpis).toHaveLength(6)
    for (const k of m.kpis) {
      expect(k.metricId, k.id).toBe(KPI_METRICS[k.id as keyof typeof KPI_METRICS])
      const def = ctx.metrics.def(k.metricId!)!
      expect(def, k.id).toBeDefined()
      // The info popover reads the registry wording, then the settings in force.
      expect(k.definition!.startsWith(def.definition), k.id).toBe(true)
    }
    expect(headline(ctx).metricId).toBe(RM.openReqs)
  })

  it('every finding, shown or not, across scopes, periods and dates', () => {
    const ctxs = [
      sample(),
      sample({ filters: { department: ['Design Verification'] } }),
      sample({ filters: { department: ['Analog & Mixed-Signal'] } }),
      sample({ filters: { period: 't3m' } }),
      sample({ filters: { period: 'lastQuarter' } }),
      sample({ filters: { location: ['Bengaluru'] } }),
      sample({ asOf: '2026-03-31' }),
    ]
    const seen = new Set<string>()
    for (const ctx of ctxs) {
      const m = computeRecruitingUncached(ctx)
      const all: Finding[] = [...m.findings, ...allProblemFindings(m.base)]
      for (const f of all) {
        expect(f.metricId, f.id).toBe(FINDING_METRICS[f.id as keyof typeof FINDING_METRICS])
        expect(ctx.metrics.def(f.metricId!), f.id).toBeDefined()
        seen.add(f.id)
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(7)
  })

  it('the data join finding on hand-built data', () => {
    const ctx = ctxOf({
      requisitions: [req('R1')],
      candidates: Array.from({ length: 6 }, () => cand('R-UNKNOWN', { appliedDate: '2026-06-01' })),
    })
    const f = computeRecruitingUncached(ctx).findings.find((x) => x.id === 'rec-data-join')!
    expect(f.metricId).toBe(RM.reqMatch)
  })
})

/* Every Figure in the view's UI names the dictionary entry registered for its id. */
const UI = import.meta.glob<string>('../ui/*.tsx', { query: '?raw', import: 'default', eager: true })

describe('figures in the UI', () => {
  it('every Figure passes metric={FIGURE_METRICS[<its id>]}', () => {
    const seen: string[] = []
    for (const [file, src] of Object.entries(UI)) {
      for (const chunk of src.split(/<Figure\b/).slice(1)) {
        const id = /\bid="([^"]+)"/.exec(chunk)?.[1] as string
        expect(chunk, `${file}: ${id} names no metric`).toContain(`metric={FIGURE_METRICS['${id}']}`)
        seen.push(id)
      }
    }
    expect(seen.sort()).toEqual(Object.keys(FIGURE_METRICS).sort())
  })

  it('no figure hard-codes a threshold that is now a setting', () => {
    for (const [file, src] of Object.entries(UI)) {
      expect(src, file).not.toMatch(
        /1\.5×|2\.5×|fewer than 5\b|under 5\b|Fewer than 5\b|10 pts|more than 120/,
      )
      expect(src, file).not.toMatch(/OLD_REQ_DAYS|LOAD_FLAG_RATIO|EMPTY_FUNNEL_DAYS/)
    }
  })
})

describe('wording comes from the dictionary', () => {
  it('your definition and formula replace the defaults in the popover and the figure definitions', () => {
    const metrics = metricsWithEdits([
      { metricId: RM.timeToFill, field: 'definition', value: 'Days from req approval to an accepted offer.' },
      { metricId: RM.timeToFill, field: 'formula', value: 'accepted date − approval date' },
    ])
    const ctx = sample({ metrics })
    const k = computeRecruitingUncached(ctx).kpis.find((x) => x.id === 'time-to-fill')!
    expect(k.definition).toBe(
      'Days from req approval to an accepted offer. Settings: the clock stops on the date the offer was accepted.',
    )
    const row = metricDefinition(ctx.metrics, RM.timeToFill, {
      term: 'Time to fill',
      extra: 'Levels below 5.',
    })
    expect(row).toEqual({
      term: 'Time to fill',
      text: 'Days from req approval to an accepted offer. Settings: the clock stops on the date the offer was accepted. Levels below 5.',
      formula: 'accepted date − approval date',
      metricId: RM.timeToFill,
    })
  })

  it('a changed setting shows wherever the metric is explained', () => {
    const metrics = metricsWith({ [RM.lackingNextStep]: { watchMultiple: 2, decisionWatchDays: 3 } })
    const text = kpiDefinition(metrics, RM.lackingNextStep)
    expect(text).toContain('no step booked past 2× the usual days for the stage')
    expect(text).toContain('a decision pending past 3 d')
    expect(kpiDefinition(defaultMetrics(), RM.lackingNextStep)).toContain(
      'no step booked past 1.5× the usual days for the stage (overdue past 2.5×), a decision pending past 2 d (overdue past 5 d), an offer out past 5 d (overdue past 10 d)',
    )
  })
})

describe('settings', () => {
  it('defaults are the constants the view used before', () => {
    expect(defaultSettings()).toEqual({
      minGroup: 5,
      aging: {
        watch: 1.5,
        overdue: 2.5,
        farOut: 1.5,
        decisionWatchDays: 2,
        decisionOverdueDays: 5,
        offerWatchDays: 5,
        offerOverdueDays: 10,
      },
      norms: { fallbackDays: 14, minSteps: 5 },
      lackingCritical: { count: 8, share: 0.25 },
      ttfEnd: 'accepted',
      acceptanceColor: { pts: 0.05, minOffers: 10 },
      acceptanceDrop: { pts: 0.05, criticalPts: 0.1, minOffers: 10 },
      offersWaitingMin: 2,
      emptyFunnelDays: 30,
      oldReqDays: 120,
      slowFill: { factor: 1.5, minFilled: 10 },
      bottleneck: {
        factor: 2,
        minGapDays: 5,
        recentMonths: 3,
        minSteps: 10,
        criticalFactor: 3,
        minCriticalSteps: 10,
      },
      withdrawals: { share: 0.15, risePts: 0.05, minExits: 10 },
      dryingUp: { drop: 0.4, gapPts: 0.2, minPrior: 30, minPriorShare: 0.05 },
      bestSource: { factor: 1.5, minApplications: 30, minHires: 5, minMonths: 6 },
      highlightMinPrior: 30,
      locationGapPts: 0.1,
      recruiterFlagFactor: 1.5,
      joinMinShare: 0.5,
    })
  })

  it('every registered setting is read through the dictionary, with the anonymity minimum', () => {
    const { metrics, reads } = recordParamReads(defaultMetrics())
    computeRecruitingUncached(sample({ metrics }))
    // The view's own settings. (The privacy rules list Recruiting first among their views, so
    // `paramsOfView` names their locked settings too; of those, the engine reads the anonymity
    // minimum, checked below.)
    const registered = paramsOfView('recruiting').filter((r) => r.startsWith('recruiting.'))
    expect(registered.length).toBeGreaterThanOrEqual(40)
    expect(registered.filter((r) => !reads.has(r))).toEqual([])
    expect(reads.has(paramRef(ANONYMITY.metricId, ANONYMITY.key))).toBe(true)
    // Nothing reads a recruiting setting that is not registered (the dictionary would throw).
    for (const r of reads) if (r.startsWith('recruiting.')) expect(registered).toContain(r)
  })

  it('defaults reproduce the numbers: an empty dictionary and the defaults give the same model', () => {
    const a = computeRecruitingUncached(sample())
    const b = computeRecruitingUncached(sample({ metrics: metricsWith({}) }))
    const view = (m: typeof a) => ({
      kpis: m.kpis.map((k) => [k.id, k.value, k.delta, k.note, k.definition]),
      findings: m.findings.map((f) => [f.id, f.severity, f.title, f.detail, f.action]),
      ttf: [m.ttf, m.companyTtf, m.ttfByLevel.map((r) => r.days)],
    })
    expect(view(b)).toEqual(view(a))
    expect(a.kpis.find((k) => k.id === 'time-to-fill')!.value).toBe(52)
  })
})

describe('changing a setting changes the number', () => {
  // A screen reached 25 days before the as-of date, with no history: the usual days fall back to 14.
  const screen = {
    requisitions: [req('REQ-1')],
    candidates: [
      cand('REQ-1', { currentStage: 'Screen', appliedDate: '2026-09-01', screenDate: '2026-09-05' }),
    ],
  }
  const lacking = (metrics?: MetricsApi) => {
    const b = computeBase(ctxOf(screen, { metrics }))
    return {
      count: recruitingKpis(b).find((k) => k.id === 'lacking-next-step')!.value,
      tier: b.actives[0].tier,
    }
  }

  it('aging multiples and the usual days without history', () => {
    // 25 d: past 1.5 × 14 = 21 (watch), short of 2.5 × 14 = 35 (overdue).
    expect(lacking()).toEqual({ count: 1, tier: 'amber' })
    expect(lacking(metricsWith({ [RM.lackingNextStep]: { watchMultiple: 2 } }))).toEqual({
      count: 0,
      tier: null,
    })
    expect(lacking(metricsWith({ [RM.lackingNextStep]: { overdueMultiple: 1.7 } }))).toEqual({
      count: 1,
      tier: 'red',
    })
    expect(lacking(metricsWith({ [RM.lackingNextStep]: { fallbackNormDays: 20 } }))).toEqual({
      count: 0,
      tier: null,
    })
  })

  it('the decision wait', () => {
    const ctx = (metrics?: MetricsApi) =>
      ctxOf(
        {
          requisitions: [req('REQ-1')],
          candidates: [
            cand('REQ-1', { currentStage: 'Onsite', onsiteDate: '2026-09-10', nextEventDate: '2026-09-27' }),
          ],
        },
        { metrics },
      )
    const tier = (metrics?: MetricsApi) => computeBase(ctx(metrics)).actives[0].tier
    // Interviewed 3 days ago: past the 2-day decision wait, short of 5 days overdue.
    expect(tier()).toBe('amber')
    expect(tier(metricsWith({ [RM.lackingNextStep]: { decisionWatchDays: 3 } }))).toBeNull()
    expect(tier(metricsWith({ [RM.lackingNextStep]: { decisionOverdueDays: 2 } }))).toBe('red')
  })

  it('the offer wait, in the tiers and the readout', () => {
    const offers = Array.from({ length: 3 }, () =>
      cand('REQ-1', { currentStage: 'Offer', appliedDate: '2026-08-01', offerDate: '2026-09-26' }),
    )
    const run = (metrics?: MetricsApi) => {
      const b = computeBase(ctxOf({ requisitions: [req('REQ-1')], candidates: offers }, { metrics }))
      return {
        tiers: b.actives.map((x) => x.tier),
        f: allProblemFindings(b).find((x) => x.id === 'rec-offers-waiting'),
      }
    }
    // Out 4 days: inside the 5-day offer wait.
    expect(run()).toEqual({ tiers: [null, null, null], f: undefined })
    const shorter = run(metricsWith({ [RM.lackingNextStep]: { offerWatchDays: 3 } }))
    expect(shorter.tiers).toEqual(['amber', 'amber', 'amber'])
    expect(shorter.f?.title).toBe('3 offers have waited more than 3 days for an answer, the oldest 4 d.')
    expect(shorter.f?.severity).toBe('warning')
    const overdue = run(metricsWith({ [RM.lackingNextStep]: { offerWatchDays: 2, offerOverdueDays: 3 } }))
    expect(overdue.tiers).toEqual(['red', 'red', 'red'])
    expect(overdue.f?.severity).toBe('critical')
    // Listed from the minimum number of offers.
    const fewer = run(
      metricsWith({ [RM.lackingNextStep]: { offerWatchDays: 3 }, [RM.offersWaiting]: { minOffers: 4 } }),
    )
    expect(fewer.f).toBeUndefined()
  })

  it('the empty-funnel age', () => {
    const data = {
      requisitions: [
        req('REQ-EMPTY', { openedDate: '2026-06-01' }),
        req('REQ-NEW', { openedDate: '2026-09-15' }),
      ],
      candidates: [
        cand('REQ-EMPTY', { currentStage: 'Screen', screenDate: '2026-06-10', appliedDate: '2026-06-05' }),
      ],
    }
    const run = (metrics?: MetricsApi) => computeBase(ctxOf(data, { metrics }))
    // Open 121 days with nobody past the screen.
    expect(run().req.emptyFunnel.map((r) => r.reqId)).toEqual(['REQ-EMPTY'])
    const later = run(metricsWith({ [RM.emptyFunnel]: { days: 150 } }))
    expect(later.req.emptyFunnel).toEqual([])
    expect(later.req.rows.find((r) => r.reqId === 'REQ-EMPTY')!.health).toBe('1 lacks a next step')
    expect(allProblemFindings(later).find((x) => x.id === 'rec-empty-funnel')).toBeUndefined()
    // REQ-NEW (15 days) reads as empty once the age drops under 15 days.
    expect(
      run(metricsWith({ [RM.emptyFunnel]: { days: 10 } }))
        .req.emptyFunnel.map((r) => r.reqId)
        .sort(),
    ).toEqual(['REQ-EMPTY', 'REQ-NEW'])
  })

  it('where the time-to-fill clock stops', () => {
    // Five reqs opened 1 Jan and filled 2 Mar (60 d); each hire started 1 Apr (90 d).
    const reqs = [0, 1, 2, 3, 4].map((i) =>
      req(`REQ-${i}`, { status: 'Filled', openedDate: '2026-01-01', filledDate: '2026-03-02' }),
    )
    const hires = reqs.map((r, i) =>
      cand(r.reqId, {
        candidateName: `Hire ${i}`,
        status: 'Hired',
        currentStage: 'Hired',
        appliedDate: '2026-01-15',
        hiredDate: '2026-03-02',
      }),
    )
    const employees = [0, 1, 2, 3, 4].map((i) => emp(`E${i}`, `Hire ${i}`, '2026-04-01'))
    const run = (metrics?: MetricsApi) =>
      computeBase(ctxOf({ requisitions: reqs, candidates: hires, employees }, { metrics }))
    const ttf = (b: ReturnType<typeof run>) => recruitingKpis(b).find((k) => k.id === 'time-to-fill')!
    expect(ttf(run()).value).toBe(60)
    const start = run(metricsWith({ [RM.timeToFill]: { endEvent: 'start' } }))
    expect(ttf(start).value).toBe(90)
    // The tile then declares the start dates it reads, and its popover says where the clock stops.
    expect(ttf(start).uses).toEqual(expect.arrayContaining(['employees.hireDate', 'employees.name']))
    expect(ttf(start).definition).toContain('the clock stops at the hire’s start date')
    // The drill lists the same days.
    const drill = filledReqsDrill(start, start.filled, 'Reqs filled')!
    expect(drill.note).toContain(
      'Median 90 d to fill over 5 reqs, from the opened date to the hire’s start date',
    )
  })

  it('a start date is used only when the hire linked to the roster had started by the as-of date', () => {
    const r = req('REQ-1', { status: 'Filled', openedDate: '2026-01-01', filledDate: '2026-03-02' })
    const [hire] = prepareApps(
      [
        cand('REQ-1', {
          candidateName: 'Ana Ortiz',
          status: 'Hired',
          currentStage: 'Hired',
          appliedDate: '2026-01-15',
          hiredDate: '2026-03-02',
        }),
      ],
      reqIndex([r]),
      '2026-09-30',
    )
    expect(fillStartDate(r, [hire], [emp('E1', 'Ana Ortiz', '2026-04-01')], '2026-09-30')).toBe('2026-04-01')
    // Not started by the as-of date, or no employee by that name: the offer accepted date stays.
    expect(fillStartDate(r, [hire], [emp('E1', 'Ana Ortiz', '2026-04-01')], '2026-03-31')).toBeNull()
    expect(fillStartDate(r, [hire], [emp('E1', 'Bo Chen', '2026-04-01')], '2026-09-30')).toBeNull()
    expect(fillStartDate(r, [], [], '2026-09-30')).toBeNull()
  })

  it('the bottleneck factor, window and critical rule', () => {
    const reqs = [req('REQ-DV'), req('REQ-SW', { department: 'Software', hiringManager: 'Sam Lead' })]
    const step = (reqId: string, days: number, i: number) => {
      const offer = addDays('2026-08-01', i)
      return cand(reqId, {
        currentStage: 'Offer',
        appliedDate: '2026-06-01',
        onsiteDate: addDays(offer, -days),
        offerDate: offer,
      })
    }
    // Five onsite-to-offer steps in Design Verification at 20 days, five elsewhere at 6 (3.3×).
    const candidates = [
      ...[0, 1, 2, 3, 4].map((i) => step('REQ-DV', 20, i)),
      ...[0, 1, 2, 3, 4].map((i) => step('REQ-SW', 6, i)),
    ]
    const run = (metrics?: MetricsApi) =>
      allProblemFindings(computeBase(ctxOf({ requisitions: reqs, candidates }, { metrics }))).find(
        (x) => x.id === 'rec-bottleneck',
      )
    expect(run()?.severity).toBe('warning')
    expect(run()?.title).toContain('over the last 3 months')
    expect(run(metricsWith({ [RM.bottleneck]: { factor: 4 } }))).toBeUndefined()
    expect(run(metricsWith({ [RM.bottleneck]: { minGapDays: 15 } }))).toBeUndefined()
    expect(run(metricsWith({ [RM.bottleneck]: { recentMonths: 1 } }))).toBeUndefined()
    expect(run(metricsWith({ [RM.bottleneck]: { recentMonths: 4 } }))?.title).toContain(
      'over the last 4 months',
    )
    expect(run(metricsWith({ [RM.bottleneck]: { minCriticalSteps: 5 } }))?.severity).toBe('critical')
  })

  it('a raised anonymity minimum hides more; it can never be lowered', () => {
    const hire = (date: string) =>
      cand('REQ-1', {
        currentStage: 'Hired',
        status: 'Hired',
        appliedDate: '2026-06-01',
        offerDate: date,
        hiredDate: date,
      })
    const decline = cand('REQ-1', {
      currentStage: 'Offer',
      status: 'Declined',
      appliedDate: '2026-06-01',
      offerDate: '2026-08-03',
      rejectedDate: '2026-08-03',
    })
    const data = {
      requisitions: [req('REQ-1')],
      candidates: [...['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'].map(hire), decline],
    }
    const acc = (metrics?: MetricsApi) =>
      recruitingKpis(computeBase(ctxOf(data, { metrics }))).find((k) => k.id === 'offer-acceptance')!
    expect(acc().value).toBeCloseTo(0.8)
    const raised = acc(metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 6 } }))
    expect(raised).toMatchObject({ value: null, suppressed: true })
    expect(() => metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 4 } })).toThrow()
  })

  it('the recruiter flag factor', () => {
    const ctx = (metrics?: MetricsApi) =>
      ctxOf(
        {
          requisitions: [
            ...['A1', 'A2', 'A3', 'A4'].map((id) => req(id, { recruiter: 'Ana' })),
            req('B1', { recruiter: 'Ben' }),
            req('B2', { recruiter: 'Ben' }),
            req('C1', { recruiter: 'Cy' }),
            req('C2', { recruiter: 'Cy' }),
          ],
          candidates: ['A1', 'B1', 'C1'].map((r) => cand(r, { recruiter: null, appliedDate: '2026-09-25' })),
        },
        { metrics },
      )
    const ana = (metrics?: MetricsApi) =>
      computeRecruitingUncached(ctx(metrics)).recruiters.find((r) => r.recruiter === 'Ana')!
    // Four open reqs against a team median of two: 2×.
    expect(ana().flag).toBe('Heavy load')
    expect(ana(metricsWith({ [RM.recruiterLoad]: { flagFactor: 2.5 } })).flagged).toBe(false)
  })

  it('the matching share for req health', () => {
    const data = {
      requisitions: [req('REQ-OLD', { openedDate: '2026-04-01' })],
      candidates: [
        cand('REQ-OLD', { appliedDate: '2026-04-05' }),
        ...Array.from({ length: 3 }, () => cand('REQ-GONE', { appliedDate: '2026-04-05' })),
      ],
    }
    expect(computeBase(ctxOf(data)).joinNote).toBe('1 of 4 applications match a requisition ID')
    const lenient = computeBase(ctxOf(data, { metrics: metricsWith({ [RM.reqMatch]: { minShare: 0.2 } }) }))
    expect(lenient.joinNote).toBeNull()
    expect(lenient.req.funnelChecked).toBe(true)
    expect(lenient.req.emptyFunnel.map((r) => r.reqId)).toEqual(['REQ-OLD'])
  })

  it('the withdrawal share to flag', () => {
    const exits = Array.from({ length: 12 }, (_, i) =>
      cand('R1', {
        appliedDate: '2026-05-01',
        screenDate: '2026-05-05',
        currentStage: 'Screen',
        status: i < 4 ? 'Withdrawn' : 'Rejected',
        rejectedDate: '2026-06-01',
      }),
    )
    const run = (metrics?: MetricsApi) =>
      allProblemFindings(
        computeBase(ctxOf({ requisitions: [req('R1')], candidates: exits }, { metrics })),
      ).find((x) => x.id === 'rec-withdrawals')
    // 4 of 12 exits (33%) are withdrawals: above the 15% share to flag.
    expect(run()?.title).toBe('Withdrawals are 33% of candidate exits in the last 12 months.')
    expect(run(metricsWith({ [RM.withdrawals]: { flagShare: 0.4 } }))).toBeUndefined()
    expect(run(metricsWith({ [RM.withdrawals]: { minExits: 13 } }))).toBeUndefined()
  })

  it('on the sample company: slow fill, source and acceptance rules, and the clock', () => {
    const run = (params: Parameters<typeof metricsWith>[0]) => {
      const m = computeRecruitingUncached(sample({ metrics: metricsWith(params) }))
      return { m, all: allProblemFindings(m.base).map((f) => f.id) }
    }
    const base = run({})
    for (const id of ['rec-time-to-fill', 'rec-source-drying-up', 'rec-offer-acceptance', 'rec-empty-funnel'])
      expect(base.all, id).toContain(id)
    expect(base.m.findings.map((f) => f.id)).toContain('rec-best-source')

    expect(run({ [RM.slowFill]: { factor: 5 } }).all).not.toContain('rec-time-to-fill')
    expect(run({ [RM.sourceDryingUp]: { drop: 0.6 } }).all).not.toContain('rec-source-drying-up')
    expect(run({ [RM.bestSource]: { factor: 10 } }).m.findings.map((f) => f.id)).not.toContain(
      'rec-best-source',
    )
    // Acceptance fell 17 pts from Q2 to Q3: a 20-point drop to flag lets it pass.
    expect(run({ [RM.acceptanceDrop]: { dropPts: 0.2 } }).all).not.toContain('rec-offer-acceptance')
    // Story 4's analog reqs are 82 to 124 days old.
    expect(run({ [RM.emptyFunnel]: { days: 200 } }).all).not.toContain('rec-empty-funnel')
    // Hires start after they accept, so a clock that stops at the start date runs longer.
    const start = run({ [RM.timeToFill]: { endEvent: 'start' } }).m
    expect(start.ttf!).toBeGreaterThan(base.m.ttf!)
    expect(start.kpis.find((k) => k.id === 'time-to-fill')!.value).toBe(start.ttf)
    // The highlighted source needs enough prior applications.
    expect(run({ [RM.sourceApplications]: { minPrior: 100000 } }).m.changedSource).toBeNull()
  })
})
