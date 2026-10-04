/**
 * Drill-down consistency: the number a reader clicks equals the number of records the drill panel
 * lists (or the median/rate recomputed from those records), and hidden (n < 5) numbers carry no
 * records. Runs over the sample company and over small hand-built fixtures.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Kpi } from '@/components/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import type { Candidate, DatasetKey, Datasets, Employee, Requisition } from '@/data/schema'
import { DATASET_KEYS } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { DrillSource } from '@/drill/Drill'
import { buildDrillTable, PERSON_KEY } from '@/drill/records'
import type { DrillSpec } from '@/drill/types'
import { median } from '@/lib/stats'
import { computeRecruitingUncached, type RecruitingModel } from '.'
import { computeBase } from './base'
import {
  ageBinDrill,
  flowDrill,
  hiresMonthDrill,
  leftDrill,
  recruiterDrill,
  reqMonthDrill,
  reqRowDrill,
  rosterLink,
  sourceDrill,
  speedCellDrill,
  stepChangeDrill,
  stepDaysDrill,
  ttfGroupDrill,
  unmatchedDrill,
} from './drills'
import { allProblemFindings } from './findings'
import { AS_OF, cand, ctxOf, req } from './fixtures'
import { prepareApps, reqIndex } from './prepare'
import { ttfDays } from './reqs'
import { HIRED } from './types'

const resolve = (src: DrillSource): DrillSpec | null => (typeof src === 'function' ? src() : (src ?? null))

/** The extra-column values of every row of a spec. */
function extras(spec: DrillSpec | null): Record<string, unknown>[] {
  if (!spec) return []
  const values = spec.extra?.values as ((r: unknown) => Record<string, unknown>) | undefined
  return spec.rows.map((r) => (values ? values(r) : {}))
}

const nums = (xs: Record<string, unknown>[], key: string) => xs.map((x) => x[key] as number)

const sources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: 0 } satisfies SourceMeta]),
) as Record<DatasetKey, SourceMeta>

let data: Datasets
let ctx: AnalyticsContext
let m: RecruitingModel

beforeAll(() => {
  data = generateSample()
  ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })
  m = computeRecruitingUncached(ctx)
})

const kpi = (id: string): Kpi => m.kpis.find((k) => k.id === id)!

describe('KPI tiles drill to the records they count', () => {
  it('counts: open reqs, hires and candidates lacking a next step', () => {
    for (const id of ['open-reqs', 'hires', 'lacking-next-step']) {
      const k = kpi(id)
      const spec = resolve(k.drill)!
      expect(spec, id).not.toBeNull()
      expect(spec.rows.length, id).toBe(k.value)
    }
    expect(resolve(kpi('open-reqs').drill)!.kind).toBe('requisitions')
    const lacking = extras(resolve(kpi('lacking-next-step').drill))
    expect(lacking.every((x) => x.aging === 'Overdue' || x.aging === 'Watch')).toBe(true)
    expect(lacking.every((x) => typeof x.daysWaiting === 'number' && typeof x.owner === 'string')).toBe(true)
  })

  it('medians: the records measured, with the measured value as a column', () => {
    const ttf = resolve(kpi('time-to-fill').drill)!
    expect(median(nums(extras(ttf), 'daysToFill'))).toBe(kpi('time-to-fill').value)
    expect(ttf.hide).toContain('daysOpen')
    const tth = resolve(kpi('time-to-hire').drill)!
    expect(median(nums(extras(tth), 'daysToHire'))).toBe(kpi('time-to-hire').value)
    expect(tth.rows.length).toBe(m.base.hires.length)
  })

  it('offer acceptance: the resolved offers with their outcome, and the denominator in the note', () => {
    const k = kpi('offer-acceptance')
    const spec = resolve(k.drill)!
    const out = extras(spec).map((x) => x.offerOutcome)
    expect(out.filter((o) => o === 'Accepted').length / out.length).toBeCloseTo(k.value!, 10)
    expect(out.every((o) => o === 'Accepted' || o === 'Declined')).toBe(true)
    expect(spec.note).toMatch(/accepted ÷ .* offers resolved/)
  })

  it('each change opens the comparison records it is measured against', () => {
    const open = kpi('open-reqs')
    expect(open.value! - resolve(open.deltaDrill)!.rows.length).toBe(open.delta)
    const hires = kpi('hires')
    expect(hires.value! - resolve(hires.deltaDrill)!.rows.length).toBe(hires.delta)
    const ttf = kpi('time-to-fill')
    const ttfPrior = median(nums(extras(resolve(ttf.deltaDrill)), 'daysToFill'))!
    expect(ttf.value! - ttfPrior).toBeCloseTo(ttf.delta!, 10)
    const tth = kpi('time-to-hire')
    const tthPrior = median(nums(extras(resolve(tth.deltaDrill)), 'daysToHire'))!
    expect(tth.value! - tthPrior).toBeCloseTo(tth.delta!, 10)
    const acc = kpi('offer-acceptance')
    const out = extras(resolve(acc.deltaDrill)).map((x) => x.offerOutcome)
    expect(acc.value! - out.filter((o) => o === 'Accepted').length / out.length).toBeCloseTo(acc.delta!, 10)
    // A tile with no change states nothing to compare, so nothing opens.
    expect(kpi('lacking-next-step').deltaDrill).toBeUndefined()
  })

  it('each number in a note opens the records it counts', () => {
    const first = (k: Kpi, re = /\d[\d,]*/) => Number(k.note!.match(re)![0].replace(/\D/g, ''))
    const open = kpi('open-reqs')
    expect(open.note).toMatch(/^\d[\d,]* on hold, not counted$/)
    const hold = resolve(open.noteDrill)!
    expect(hold.rows.length).toBe(first(open))
    expect(hold.rows.every((r) => (r as Requisition).status === 'On hold')).toBe(true)
    for (const id of ['time-to-fill', 'time-to-hire', 'offer-acceptance']) {
      const k = kpi(id)
      expect(resolve(k.noteDrill)!.rows.length, id).toBe(first(k))
    }
    const lacking = kpi('lacking-next-step')
    expect(resolve(lacking.noteDrill)!.rows.length).toBe(first(lacking, /of [\d,]+ active/))
    expect(resolve(lacking.noteDrill)!.rows.length).toBe(m.base.actives.length)
    // Notes without a count of records ("Counted on the accept date") open nothing.
    expect(kpi('hires').noteDrill).toBeUndefined()
    // Recruiting's hire count is offers accepted; People stats keeps "Hires" for people who started.
    expect(kpi('hires').label).toBe('Offers accepted')
    expect(kpi('hires').definition).toMatch(/People stats counts hires by start date/)
  })

  it('every drill on a tile shows the tile tier (it carries the tile fields)', () => {
    for (const k of m.kpis)
      for (const src of [k.drill, k.deltaDrill, k.noteDrill]) {
        const spec = resolve(src)
        if (spec) expect(spec.uses, k.id).toEqual(k.uses)
      }
    for (const f of m.findings) {
      const spec = resolve(f.drill)
      if (spec && f.uses?.length) expect(spec.uses?.length, f.id).toBeGreaterThan(0)
    }
  })

  it('a hidden KPI has no drill', () => {
    const vancouver = computeRecruitingUncached(
      buildContext({
        data,
        sources,
        filters: { ...DEFAULT_FILTERS, period: 't3m', location: ['Vancouver'] },
        asOfOverride: null,
        showPay: false,
      }),
    )
    for (const k of vancouver.kpis) if (k.suppressed || k.value == null) expect(k.drill, k.id).toBeUndefined()
  })
})

describe('findings drill to the records behind their headline number', () => {
  const f = (id: string) => allProblemFindings(m.base).find((x) => x.id === id)!

  it('every finding in the readout has a drill', () => {
    for (const x of m.findings) expect(resolve(x.drill), x.id).not.toBeNull()
  })

  it('bottleneck: the steps measured, whose median is the headline', () => {
    const spec = resolve(f('rec-bottleneck').drill)!
    expect(median(nums(extras(spec), 'stepDays'))).toBe(27)
    expect(spec.title).toBe('Onsite to offer in Design Verification, last 3 months')
  })

  it('lacking a next step and offer acceptance', () => {
    expect(resolve(f('rec-lacking-next-step').drill)!.rows.length).toBe(kpi('lacking-next-step').value)
    const acc = resolve(f('rec-offer-acceptance').drill)!
    // 107 of 157 since the sample planted the offers accepted for its Q4 starts (README, Onboarding).
    expect(acc.rows).toHaveLength(157)
    expect(extras(acc).filter((x) => x.offerOutcome === 'Accepted')).toHaveLength(107)
    expect(acc.title).toBe('Offers resolved in Q3 2026')
  })

  it('empty funnel, slow fill, source drying up, withdrawals and best source', () => {
    expect(resolve(f('rec-empty-funnel').drill)!.rows).toHaveLength(m.base.req.emptyFunnel.length)
    const slow = resolve(f('rec-time-to-fill').drill)!
    expect(median(nums(extras(slow), 'daysToFill'))).toBe(107)
    const dry = extras(resolve(f('rec-source-drying-up').drill))
    expect(dry.filter((x) => x.period === 'This period')).toHaveLength(356)
    expect(dry.filter((x) => x.period === 'Prior period')).toHaveLength(680)
    const best = resolve(m.findings.find((x) => x.id === 'rec-best-source')!.drill)!
    const referral = m.sources.find((s) => s.source === 'Referral')!
    expect(best.rows).toHaveLength(referral.hires)
  })
})

describe('chart marks and table cells drill to the records they count', () => {
  it('pipeline today: every segment and stage', () => {
    for (const s of m.pipeline) {
      expect(s.items).toHaveLength(s.active)
      for (const c of s.cells) {
        expect(c.items, `${s.stage} ${c.state}`).toHaveLength(c.candidates)
        expect(c.items.filter((x) => x.tier)).toHaveLength(c.lacking)
      }
    }
  })

  it('hires by month and offer acceptance by quarter', () => {
    for (const r of m.hiresByMonth) {
      expect(r.apps).toHaveLength(r.hires)
      if (r.hires) expect(resolve(() => hiresMonthDrill(m.base, r))!.rows).toHaveLength(r.hires)
    }
    for (const q of m.acceptanceByQuarter) {
      if (q.rate == null) expect(q.apps).toEqual([])
      else expect(q.apps).toHaveLength(q.offers)
    }
  })

  it('requisition figures: departments, months, ages, open req rows and recruiters', () => {
    for (const r of m.openByDepartment) expect(r.reqs).toHaveLength(r.open)
    for (const r of m.openedFilled) expect(r.list).toHaveLength(r.reqs)
    const sep = m.openedFilled.filter((r) => r.month === '2026-09')
    const opened = sep.find((r) => r.series === 'Opened')!
    const filled = sep.find((r) => r.series === 'Filled')!
    expect(reqMonthDrill(m.base, '2026-09', opened.list, filled.list, 'Filled')!.rows).toHaveLength(
      filled.reqs,
    )
    const both = reqMonthDrill(m.base, '2026-09', opened.list, filled.list)!
    expect(new Set(both.rows).size).toBe(both.rows.length)
    const young = m.base.req.rows.filter((r) => r.daysOpen < 30).map((r) => r.req)
    expect(ageBinDrill(m.base, young, 0, 30)!.rows).toHaveLength(young.length)
    for (const row of m.base.req.rows.slice(0, 40)) {
      const stages = ['applied', 'screen', 'hiringManagerStage', 'onsite', 'offer'] as const
      for (const k of stages) expect(reqRowDrill(m.base, row, k)?.rows.length ?? 0).toBe(row[k])
      expect(reqRowDrill(m.base, row, 'lacking')?.rows.length ?? 0).toBe(row.lacking)
      expect(reqRowDrill(m.base, row, 'req')!.rows).toEqual([row.req])
      // Health drills to what it says: an empty funnel to everyone still waiting, else the lacking.
      const health = reqRowDrill(m.base, row, 'health')
      if (row.health === 'Empty funnel') {
        expect(health!.rows.length).toBe(Math.max(1, row.active))
        expect(health!.title).toMatch(row.active ? /none past the screen/ : /^REQ-/)
      } else expect(health?.rows.length ?? 0).toBe(row.lacking)
    }
    expect(m.base.req.rows.slice(0, 40).some((r) => r.health === 'Empty funnel')).toBe(true)
    for (const r of m.recruiters) {
      expect(recruiterDrill(m.base, r, 'openReqs')?.rows.length ?? 0).toBe(r.openReqs)
      expect(recruiterDrill(m.base, r, 'active')?.rows.length ?? 0).toBe(r.active)
      expect(recruiterDrill(m.base, r, 'hires')?.rows.length ?? 0).toBe(r.hires)
      expect(recruiterDrill(m.base, r, 'lacking')?.rows.length ?? 0).toBe(r.lacking)
    }
  })

  it('time to fill: shown medians recompute from their records; hidden ones carry none', () => {
    const rows = [...m.ttfByDepartment, ...m.ttfByLevel]
    expect(rows.some((r) => r.days == null)).toBe(true)
    for (const r of rows) {
      if (r.days == null) {
        expect(r.filled).toEqual([])
        expect(ttfGroupDrill(m.base, r)).toBeNull()
      } else {
        expect(r.filled).toHaveLength(r.reqs)
        expect(median(r.filled.map(ttfDays))).toBe(r.days)
      }
    }
  })

  it('candidate flow: every ribbon, node and the band', () => {
    const flow = m.base.flow
    for (const s of flow.stages) {
      for (const kind of ['advanced', 'active', 'rejected', 'withdrawn', 'declined'] as const)
        expect(flowDrill(m.base, kind, s.stage)?.rows.length ?? 0, `${kind} ${s.stage}`).toBe(s[kind])
      expect(flowDrill(m.base, 'node', s.stage)!.rows).toHaveLength(s.entered)
      expect(flowDrill(m.base, 'left', s.stage)?.rows.length ?? 0).toBe(s.rejected + s.withdrawn + s.declined)
      if (s.medianDays != null)
        expect(median(nums(extras(stepDaysDrill(m.base, s.stage)), 'stepDays'))).toBe(s.medianDays)
    }
    expect(flowDrill(m.base, 'node', HIRED)!.rows).toHaveLength(flow.hired)
    const left = flow.left.rejected + flow.left.withdrawn + flow.left.declined
    expect(leftDrill(m.base)!.rows).toHaveLength(left)
    const change = extras(stepChangeDrill(m.base, 1))
    expect(change.some((x) => x.period === 'Prior period')).toBe(true)
  })

  it('speed by month: shown cells recompute; hidden cells carry no records', () => {
    for (const c of m.speed) {
      if (c.days == null) {
        expect(c.steps).toEqual([])
        expect(speedCellDrill(m.base, c)).toBeNull()
      } else {
        expect(c.steps).toHaveLength(c.n)
        expect(median(nums(extras(speedCellDrill(m.base, c)), 'stepDays'))).toBe(c.days)
      }
    }
  })

  it('sources, months by source, offers by location and reasons', () => {
    for (const s of m.sources) {
      expect(sourceDrill(m.base, s, 'applications')?.rows.length ?? 0).toBe(s.applications)
      expect(sourceDrill(m.base, s, 'priorApplications')?.rows.length ?? 0).toBe(s.priorApplications)
      expect(sourceDrill(m.base, s, 'hires')?.rows.length ?? 0).toBe(s.hires)
      if (s.hireRate == null) expect(sourceDrill(m.base, s, 'hireRate')).toBeNull()
      if (s.offerAcceptance == null) expect(sourceDrill(m.base, s, 'offerAcceptance')).toBeNull()
      else expect(sourceDrill(m.base, s, 'offerAcceptance')!.rows).toHaveLength(s.offers)
      if (s.medianTimeToHire == null) expect(sourceDrill(m.base, s, 'medianTimeToHire')).toBeNull()
      else expect(s.hires).toBeGreaterThanOrEqual(5)
    }
    for (const r of m.sourcesByMonth) expect(r.apps).toHaveLength(r.applications)
    for (const r of [...m.acceptanceByLocation, ...m.acceptanceByLocationQuarter]) {
      if (r.rate == null) expect(r.apps).toEqual([])
      else expect(r.apps).toHaveLength(r.offers)
    }
    for (const r of m.declineReasons) expect(r.apps).toHaveLength(r.candidates)
    for (const r of m.exitReasons) expect(r.apps).toHaveLength(r.candidates)
  })

  it('queue rows and waiting dots carry their candidate', () => {
    for (const d of m.waiting) expect(d.item.app.id).toBe(d.applicationId)
  })
})

describe('roster links', () => {
  it('hires who started open their employee card; the panel rows carry the person key', () => {
    const spec = resolve(kpi('hires').drill)!
    const table = buildDrillTable(spec, ctx)
    const linked = table.rows.filter((r) => r[PERSON_KEY])
    expect(linked.length).toBeGreaterThan(spec.rows.length / 2)
    for (const r of linked) {
      const e = ctx.org.byId.get(String(r[PERSON_KEY]))!
      expect(e.name).toBe(r.candidateName)
      expect(r.employeeId).toBe(e.employeeId)
    }
    expect(table.columns.map((c) => c.key)).toContain('employeeId')
  })

  it('links by name and start date, internal applicants by employment, and never other candidates', () => {
    const emp = (id: string, name: string, hireDate: string, patch: Partial<Employee> = {}): Employee => ({
      employeeId: id,
      name,
      jobTitle: 'Engineer',
      businessUnit: 'Silicon Engineering',
      department: 'Design Verification',
      location: 'San Jose',
      country: 'United States',
      level: 'L4',
      hireDate,
      employmentType: 'Employee',
      ...patch,
    })
    const roster = [
      emp('E1', 'Ana Ortiz', '2026-08-03'),
      emp('E2', 'Ana Ortiz', '2020-01-06', { department: 'Software' }),
      emp('E3', 'Bo Chen', '2019-05-06'),
    ]
    const R = reqIndex([req('REQ-1')])
    const [hired, rejected, internal, late] = prepareApps(
      [
        cand('REQ-1', {
          candidateName: 'Ana Ortiz',
          status: 'Hired',
          currentStage: 'Hired',
          hiredDate: '2026-07-01',
          appliedDate: '2026-05-01',
        }),
        cand('REQ-1', { candidateName: 'Ana Ortiz', status: 'Rejected', rejectedDate: '2026-09-02' }),
        cand('REQ-1', { candidateName: 'Bo Chen', source: 'Internal' }),
        cand('REQ-1', {
          candidateName: ' ana  ortiz ',
          status: 'Hired',
          currentStage: 'Hired',
          hiredDate: '2025-01-02',
          appliedDate: '2024-12-01',
        }),
      ] satisfies Candidate[],
      R,
      AS_OF,
    )
    expect(rosterLink(hired, roster)?.employeeId).toBe('E1')
    expect(rosterLink(rejected, roster)).toBeNull()
    expect(rosterLink(internal, roster)?.employeeId).toBe('E3')
    // Accepted in Jan 2025 but the only later start is 19 months on: too far to be the same hire.
    expect(rosterLink(late, roster)).toBeNull()
  })
})

describe('small fixtures', () => {
  it('candidates matching no requisition drill to themselves', () => {
    const reqs: Requisition[] = [req('REQ-1')]
    const b = computeBase(
      ctxOf({
        requisitions: reqs,
        candidates: [cand('REQ-1'), cand('REQ-X'), cand('REQ-Y'), cand('REQ-Z')],
      }),
    )
    expect(b.joinNote).toBe('1 of 4 applications match a requisition ID')
    expect(unmatchedDrill(b)!.rows.map((c) => c.reqId)).toEqual(['REQ-X', 'REQ-Y', 'REQ-Z'])
  })

  it('empty buckets never open an empty panel', () => {
    const b = computeBase(ctxOf({ requisitions: [req('REQ-1')], candidates: [] }))
    expect(flowDrill(b, 'node', 0)).toBeNull()
    expect(leftDrill(b)).toBeNull()
  })
})
