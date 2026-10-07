/**
 * The Recruiting figures added in the design refresh (docs/CHARTS.md, Recruiting): open reqs at
 * each month end, median time to fill by quarter, interview decisions waiting by hiring manager,
 * and open reqs by age against candidates past the screen. Each number is recounted from the raw
 * rows, each mark's drill opens exactly the records it counts, small groups stay hidden, and
 * "Filter to" reproduces the number clicked.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { can } from '@/access/policy'
import type { AnalyticsContext } from '@/data/context'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, type Requisition } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from '@/drill/Drill'
import { applyDrillFilter, expectFilterTo } from '@/drill/testing'
import { addDays, addMonths, daysBetween, monthEnd } from '@/lib/dates'
import { median } from '@/lib/stats'
import { openReqsByMonthEndDrill, ttfQuarterGroupDrill } from '../ui/drill'
import { computeRecruitingUncached } from '.'
import { computeBase } from './base'
import {
  decisionsDrill,
  monthEndReqsDrill,
  otherDecisionsDrill,
  pastScreenDrill,
  reqActiveDrill,
  reqRowDrill,
  ttfQuarterDrill,
} from './drills'
import { AS_OF, cand, ctxOf, req } from './fixtures'
import { decisionsByHiringManager, NO_HIRING_MANAGER } from './pipeline'
import { ALL_REQS, OTHER_SERIES, openReqsByMonthEnd, reqAgeDots, TTF_BANDS, ttfByQuarter } from './reqs'

/** Open on day d, recounted from the raw fields (the Open reqs KPI's definition). */
function openOn(r: Requisition, d: string): boolean {
  if (!r.openedDate || r.openedDate > d) return false
  if (r.status === 'Open') return !r.closedDate || r.closedDate > d
  if (r.status === 'Filled') return (r.filledDate ?? r.closedDate ?? '') > d
  if (r.status === 'Cancelled') return (r.closedDate ?? r.filledDate ?? '') > d
  return false
}

let data: Datasets
const sources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: 0 } satisfies SourceMeta]),
) as Record<DatasetKey, SourceMeta>
const sample = (filters: Partial<Filters> = {}): AnalyticsContext =>
  buildContext({
    data,
    sources,
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
    showPay: false,
  })

beforeAll(() => {
  data = generateSample()
}, 60_000)

describe('open reqs at each month end', () => {
  const reqs = [
    req('R1', { openedDate: '2026-01-10' }),
    req('R2', { openedDate: '2026-02-01', status: 'Filled', filledDate: '2026-08-15' }),
    req('R3', { openedDate: '2026-03-01', status: 'Cancelled', closedDate: '2026-06-30' }),
    req('R4', { openedDate: '2026-04-01', status: 'On hold' }),
    req('R5', { openedDate: '2026-05-01', businessUnit: 'Go-to-Market', department: 'Sales' }),
  ]

  it('counts reqs open on each month end by business unit, on hold left out', () => {
    const m = openReqsByMonthEnd(reqs, AS_OF, 12)
    expect(m.dim).toBe('businessUnit')
    expect(m.totals).toHaveLength(12)
    expect(m.totals.at(-1)?.date).toBe(AS_OF)
    const at = (month: string, group: string) =>
      m.rows.find((r) => r.month === month && r.group === group)?.reqs ?? 0
    // 30 Jun: R1, R2, R5 (R3 closes on 30 Jun itself, so it is no longer open).
    expect(at('2026-06', 'Silicon Engineering')).toBe(2)
    expect(at('2026-06', 'Go-to-Market')).toBe(1)
    // 31 Aug: R2 was filled on 15 Aug.
    expect(at('2026-08', 'Silicon Engineering')).toBe(1)
    for (const t of m.totals) expect(t.reqs, t.date).toBe(reqs.filter((r) => openOn(r, t.date)).length)
    expect(m.rows.some((r) => r.list.some((x) => x.reqId === 'R4'))).toBe(false)
  })

  it('stacks by department when every req sits in one business unit', () => {
    const one = reqs.filter((r) => r.businessUnit === 'Silicon Engineering')
    expect(openReqsByMonthEnd(one, AS_OF, 6).dim).toBe('department')
  })

  it('keeps eight series at most, folding the smallest into Other', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      Array.from({ length: 12 - i }, (_, j) =>
        req(`R${i}-${j}`, { businessUnit: `Unit ${String(i).padStart(2, '0')}`, openedDate: '2026-01-05' }),
      ),
    ).flat()
    const m = openReqsByMonthEnd(many, AS_OF, 3)
    expect(m.groups).toHaveLength(8)
    expect(m.groups.at(-1)).toBe(OTHER_SERIES)
    const other = m.rows.find((r) => r.group === OTHER_SERIES && r.date === AS_OF)
    expect(other?.folded).toHaveLength(5)
    expect(other?.reqs).toBe(5 + 4 + 3 + 2 + 1)
  })

  it('a segment and a column open exactly the reqs they count, on that date', () => {
    const b = computeBase(ctxOf({ requisitions: reqs }))
    const m = openReqsByMonthEnd(b.reqs, AS_OF, 12)
    for (const r of m.rows) {
      const spec = monthEndReqsDrill(b, r.date, r.list, r.group)
      // A zero row (a month end with no open req) opens nothing.
      expect(spec?.rows.length ?? 0, `${r.month} ${r.group}`).toBe(r.reqs)
      expect(spec?.filter).toBeUndefined()
    }
    const june = m.totals.find((t) => t.month === '2026-06')!
    expect(monthEndReqsDrill(b, june.date, june.list)?.rows.length).toBe(june.reqs)
  })

  it('keeps a month end with no open req on the axis, as zero rows', () => {
    // One req open only in the last two months, one filled in April: May to July have none open.
    const list = [
      req('LATE', { openedDate: '2026-08-10' }),
      req('EARLY', { openedDate: '2025-12-01', status: 'Filled', filledDate: '2026-04-10' }),
    ]
    const m = openReqsByMonthEnd(list, AS_OF, 12)
    const months = new Set(m.rows.map((r) => r.month))
    expect(months.size).toBe(12)
    for (const t of m.totals) {
      const own = m.rows.filter((r) => r.month === t.month)
      expect(
        own.reduce((n, r) => n + r.reqs, 0),
        t.month,
      ).toBe(t.reqs)
      if (!t.reqs)
        expect(
          own.map((r) => r.group),
          t.month,
        ).toEqual(m.groups)
    }
  })

  it('on the sample: totals recount from the raw rows and the series stack to them', () => {
    const ctx = sample()
    const m = computeRecruitingUncached(ctx).openReqsMonthEnd
    expect(m.totals).toHaveLength(24)
    for (const t of m.totals) {
      expect(t.reqs, t.date).toBe(ctx.data.requisitions.filter((r) => openOn(r, t.date)).length)
      const stacked = m.rows.filter((r) => r.month === t.month).reduce((n, r) => n + r.reqs, 0)
      expect(stacked, t.date).toBe(t.reqs)
    }
    expect(m.groups.length).toBeLessThanOrEqual(8)
  })

  it('Filter to a business unit keeps the column at the number clicked', () => {
    const ctx = sample()
    const m = computeRecruitingUncached(ctx).openReqsMonthEnd
    const drill = openReqsByMonthEndDrill(computeRecruitingUncached(ctx).base)
    const picks = m.rows.filter((r) => r.group !== OTHER_SERIES && r.group !== 'Not set').slice(-3)
    expect(picks.length).toBeGreaterThan(0)
    for (const r of picks) {
      const spec = resolveDrill(drill(r))
      expect(spec?.filter?.businessUnit).toEqual([r.group])
      expect(spec?.rows.length).toBe(r.reqs)
      const after = computeRecruitingUncached(applyDrillFilter(ctx, spec!.filter!)).openReqsMonthEnd
      expect(after.totals.find((t) => t.month === r.month)?.reqs, `${r.group} ${r.month}`).toBe(r.reqs)
    }
  })

  it('Other carries no filter', () => {
    const b = computeBase(ctxOf({ requisitions: reqs }))
    const drill = openReqsByMonthEndDrill(b)
    const spec = resolveDrill(
      drill({ month: '2026-09', date: AS_OF, group: OTHER_SERIES, reqs: 1, list: [reqs[0]], folded: ['X'] }),
    )
    expect(spec?.filter).toBeUndefined()
  })
})

describe('median time to fill by quarter', () => {
  // Filled in Q3 2026: six L3 reqs (10 to 60 days) and four L6 reqs (90 days).
  const filled = [
    ...[10, 20, 30, 40, 50, 60].map((d, i) =>
      req(`J${i}`, {
        level: 'L3',
        openedDate: addDays('2026-07-15', -d),
        status: 'Filled',
        filledDate: '2026-07-15',
      }),
    ),
    ...[0, 1, 2, 3].map((i) =>
      req(`S${i}`, { level: 'L6', openedDate: '2026-05-01', status: 'Filled', filledDate: '2026-07-30' }),
    ),
    req('X', { level: 'L3', openedDate: '2026-01-01', status: 'Cancelled', filledDate: '2026-07-01' }),
  ]

  it('takes the median of each series and hides one under the anonymity minimum', () => {
    const rows = ttfByQuarter(filled, AS_OF, { n: 4 })
    expect(rows).toHaveLength(4 * (1 + TTF_BANDS.length))
    const q3 = (s: string) => rows.find((r) => r.quarter === 'Q3 2026' && r.series === s)!
    expect(q3(ALL_REQS).reqs).toBe(10)
    expect(q3(ALL_REQS).days).toBe(median([10, 20, 30, 40, 50, 60, 90, 90, 90, 90]))
    expect(q3('L1 to L4').days).toBe(35)
    expect(q3('L5 and above').reqs).toBe(4)
    expect(q3('L5 and above').days).toBeNull()
    expect(q3('L5 and above').filled).toEqual([])
    // The cancelled req is never counted as filled.
    expect(q3(ALL_REQS).filled.some((r) => r.reqId === 'X')).toBe(false)
  })

  it('a point opens the reqs it measures, with the quarter as the period', () => {
    const b = computeBase(ctxOf({ requisitions: filled }))
    const row = ttfByQuarter(filled, AS_OF, { n: 4 }).find(
      (r) => r.quarter === 'Q3 2026' && r.series === 'L1 to L4',
    )!
    const spec = ttfQuarterDrill(b, row, ALL_REQS)
    expect(spec?.rows.length).toBe(6)
    expect(spec?.filter).toMatchObject({
      period: 'custom',
      customStart: '2026-07-01',
      customEnd: '2026-09-30',
    })
    const band = resolveDrill(ttfQuarterGroupDrill(b)(row))
    expect(band?.filter?.level).toEqual(['L1', 'L2', 'L3', 'L4'])
    expect(band?.filterLabel).toBe('L1 to L4')
    const hidden = ttfByQuarter(filled, AS_OF, { n: 4 }).find(
      (r) => r.quarter === 'Q3 2026' && r.series === 'L5 and above',
    )!
    expect(ttfQuarterDrill(b, hidden, ALL_REQS)).toBeNull()
  })

  it('on the sample: medians recount from the raw rows', () => {
    const ctx = sample()
    const m = computeRecruitingUncached(ctx)
    const b = m.base
    expect(m.ttfByQuarter.length).toBe(8 * 3)
    for (const r of m.ttfByQuarter) {
      const raw = ctx.data.requisitions.filter(
        (q) =>
          q.status !== 'Cancelled' &&
          !!q.openedDate &&
          !!q.filledDate &&
          q.filledDate >= r.quarterStart &&
          q.filledDate <= r.quarterEnd &&
          (r.levels.length === 0 || (!!q.level && r.levels.includes(q.level))),
      )
      expect(r.reqs, `${r.quarter} ${r.series}`).toBe(raw.length)
      expect(r.days, `${r.quarter} ${r.series}`).toBe(raw.length >= 5 ? median(raw.map(b.ttf)) : null)
      if (r.days != null) expect(ttfQuarterDrill(b, r, ALL_REQS)?.rows.length).toBe(r.reqs)
    }
    // The default clock: days from opened to offer accepted.
    const any = m.ttfByQuarter.find((r) => r.filled.length)!
    expect(b.ttf(any.filled[0])).toBe(daysBetween(any.filled[0].openedDate, any.filled[0].filledDate!))
  })

  it('Filter to a band and quarter keeps the median', () => {
    expectFilterTo(sample(), {
      name: 'time to fill by quarter',
      rows: (c) => computeRecruitingUncached(c).ttfByQuarter.filter((r) => r.series !== ALL_REQS),
      key: (r) => `${r.quarter}|${r.series}`,
      value: (r) => r.days,
      drill: (r, c) => ttfQuarterGroupDrill(computeRecruitingUncached(c).base)(r),
      kind: 'rate',
    })
  })
})

describe('interview decisions waiting by hiring manager', () => {
  const reqs = [
    req('A', { hiringManagerId: 'E1', hiringManager: 'Ji-woo Lim' }),
    req('B', { hiringManagerId: 'E2', hiringManager: 'Hannah Smith' }),
    req('C', { hiringManagerId: null, hiringManager: null }),
  ]
  // Onsite interviews on 29, 26 and 20 Sep: 1 day (on time), 4 days (watch), 10 days (overdue).
  const waiting = (reqId: string, event: string) =>
    cand(reqId, {
      currentStage: 'Onsite',
      onsiteDate: '2026-09-01',
      nextEventDate: event,
      appliedDate: '2026-08-01',
    })
  const candidates = [
    waiting('A', '2026-09-29'),
    waiting('A', '2026-09-26'),
    waiting('A', '2026-09-20'),
    waiting('B', '2026-09-20'),
    waiting('C', '2026-09-26'),
    // Scheduled ahead: not waiting on a decision.
    cand('A', { currentStage: 'Onsite', onsiteDate: '2026-09-01', nextEventDate: '2026-10-05' }),
  ]
  const ctx = ctxOf({ requisitions: reqs, candidates })
  const b = computeBase(ctx)

  it('counts candidates whose interview happened with no move since, with their aging', () => {
    const rows = decisionsByHiringManager(b.actives)
    expect(rows.map((r) => [r.hiringManager, r.candidates, r.overdue, r.watch, r.oldest])).toEqual([
      ['Ji-woo Lim', 3, 1, 1, 10],
      ['Hannah Smith', 1, 1, 0, 10],
      [NO_HIRING_MANAGER, 1, 0, 1, 4],
    ])
    expect(rows[0].hiringManagerId).toBe('E1')
    const raw = b.actives.filter((x) => x.state === 'awaiting-feedback').length
    expect(rows.reduce((n, r) => n + r.candidates, 0)).toBe(raw)
  })

  it('a bar opens exactly its candidates, and Other opens the folded ones', () => {
    const rows = decisionsByHiringManager(b.actives)
    for (const r of rows) {
      const spec = decisionsDrill(b, r)
      expect(spec?.rows.length, r.hiringManager).toBe(r.candidates)
      // A hiring manager's own reqs are not a filter: the leader filter is a whole org.
      expect(spec?.filter).toBeUndefined()
    }
    expect(otherDecisionsDrill(b, rows.slice(1))?.rows.length).toBe(2)
  })

  it('on the sample: every waiting decision is counted once', () => {
    const m = computeRecruitingUncached(sample())
    const raw = m.base.actives.filter((x) => x.state === 'awaiting-feedback')
    expect(m.decisions.reduce((n, r) => n + r.candidates, 0)).toBe(raw.length)
    expect(m.decisions.length).toBeGreaterThan(1)
    for (const r of m.decisions.slice(0, 5)) expect(decisionsDrill(m.base, r)?.rows.length).toBe(r.candidates)
  })
})

describe('open reqs by age and candidates past the screen', () => {
  it('recounts candidates past the screen from the stage dates', () => {
    const ctx = ctxOf({
      requisitions: [req('OLD', { openedDate: '2026-05-01' }), req('NEW', { openedDate: '2026-09-20' })],
      candidates: [
        cand('OLD', { currentStage: 'Onsite', onsiteDate: '2026-09-25', appliedDate: '2026-06-01' }),
        cand('OLD', { currentStage: 'Hiring manager', hmDate: '2026-09-10', appliedDate: '2026-06-01' }),
        cand('OLD', { currentStage: 'Screen', screenDate: '2026-09-10', appliedDate: '2026-06-01' }),
        cand('NEW', { currentStage: 'Applied', appliedDate: '2026-09-21' }),
      ],
    })
    const b = computeBase(ctx)
    const dots = reqAgeDots(b.req.rows)
    const old = dots.find((d) => d.reqId === 'OLD')!
    expect(old).toMatchObject({
      daysOpen: daysBetween('2026-05-01', AS_OF),
      pastScreen: 2,
      active: 3,
      tone: 'default',
    })
    expect(pastScreenDrill(b, old.row)?.rows.length).toBe(2)
    expect(reqActiveDrill(b, old.row)?.rows.length).toBe(3)
    // A dot is one req: it opens that req.
    expect(reqRowDrill(b, old.row, 'req')?.rows.length).toBe(1)
  })

  it('on the sample: every open req is a dot, colored by the two numbers it is plotted at', () => {
    const m = computeRecruitingUncached(sample())
    const days = m.base.settings.emptyFunnelDays
    const dots = reqAgeDots(m.base.req.rows, days)
    expect(dots).toHaveLength(m.base.req.open.length)
    for (const d of dots) {
      const past = m.base.actives.filter((x) => x.app.reqId === d.reqId && x.stage >= 2).length
      expect(d.pastScreen, d.reqId).toBe(past)
      // Red is exactly the corner the reference line and the x axis mark: old, nobody past the screen now.
      expect(d.tone === 'critical', d.reqId).toBe(d.daysOpen > days && d.pastScreen === 0)
      // Every empty funnel sits in that corner.
      if (d.health === 'Empty funnel') expect(d.tone, d.reqId).toBe('critical')
      if (d.tone === 'warning') expect(d.row.lacking, d.reqId).toBeGreaterThan(0)
    }
    const corner = dots.filter((d) => d.tone === 'critical')
    expect(corner.length).toBeGreaterThan(dots.filter((d) => d.health === 'Empty funnel').length)
  })
})

describe('the month-end window', () => {
  it('ends on the as-of date and starts 23 month ends before', () => {
    const m = openReqsByMonthEnd([], AS_OF)
    expect(m.totals[0].date).toBe(monthEnd(addMonths('2026-09-01', -23)))
    expect(m.rows).toEqual([])
  })
})

describe('modes', () => {
  const at = (tab: string) => ({ view: 'recruiting', tab })
  it('shows the new figures in HR and Developer mode, and in Manager mode all but the quarterly trend', () => {
    const figures: [string, string][] = [
      ['recruiting-open-reqs-month-end', 'overview'],
      ['recruiting-decisions-by-hiring-manager', 'pipeline'],
      ['recruiting-req-age-vs-pipeline', 'requisitions'],
      ['recruiting-time-to-fill-quarter', 'requisitions'],
    ]
    for (const [id, tab] of figures) {
      expect(can('hr', `figure:${id}`, at(tab)), id).toBe(true)
      expect(can('developer', `figure:${id}`, at(tab)), id).toBe(true)
      expect(can('manager', `figure:${id}`, at(tab)), id).toBe(id !== 'recruiting-time-to-fill-quarter')
    }
    expect(can('manager', 'metric:recruiting.pipeline.awaitingDecision')).toBe(true)
  })
})
