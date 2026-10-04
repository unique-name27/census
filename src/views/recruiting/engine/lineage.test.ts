/**
 * Lineage: every KPI, figure and finding in the Recruiting view declares the dataset fields it is
 * computed from, and every declared field exists in the schema.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Finding } from '@/components/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { invalidRefs } from '@/data/quality'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { computeRecruitingUncached } from '.'
import { allProblemFindings } from './findings'
import { cand, ctxOf, req } from './fixtures'
import * as L from './lineage'

const sources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: 0 } satisfies SourceMeta]),
) as Record<DatasetKey, SourceMeta>

let data: Datasets
const sample = (filters: Partial<Filters> = {}, asOfOverride: string | null = null): AnalyticsContext =>
  buildContext({ data, sources, filters: { ...DEFAULT_FILTERS, ...filters }, asOfOverride, showPay: false })

beforeAll(() => {
  data = generateSample()
})

/** A finding's declared fields, checked against the schema. */
function expectLineage(f: { id: string; uses?: readonly string[] }) {
  expect(f.uses?.length ?? 0, `${f.id} declares no fields`).toBeGreaterThan(0)
  expect(invalidRefs(f.uses ?? []), `${f.id} names fields outside the schema`).toEqual([])
  expect(new Set(f.uses).size, `${f.id} repeats a field`).toBe(f.uses?.length)
}

describe('declared fields', () => {
  it('every group, KPI and figure names schema fields only', () => {
    const groups = Object.entries(L).filter(([, v]) => Array.isArray(v)) as [string, string[]][]
    expect(groups.length).toBeGreaterThan(8)
    for (const [name, refs] of groups) expect(invalidRefs(refs), name).toEqual([])
    for (const [id, refs] of Object.entries(L.KPI_USES)) expectLineage({ id, uses: refs })
    for (const [id, refs] of Object.entries(L.FIGURE_USES)) expectLineage({ id, uses: refs })
    for (const refs of [...Object.values(L.APP_DIM), ...Object.values(L.REQ_DIM)])
      expect(invalidRefs(refs)).toEqual([])
  })

  it('a field that only picks the population still counts', () => {
    // Voluntary-attrition style: hires are counted on the hired date, but only for applications
    // received by the as-of date with status Hired.
    expect(L.KPI_USES.hires).toEqual(['candidates.appliedDate', 'candidates.status', 'candidates.hiredDate'])
    // Offers resolved need the exit date as well, so declines are dated.
    expect(L.KPI_USES['offer-acceptance']).toContain('candidates.rejectedDate')
    // Open reqs depend on every date that can close a req.
    expect(L.KPI_USES['open-reqs']).toEqual([
      'requisitions.openedDate',
      'requisitions.status',
      'requisitions.closedDate',
      'requisitions.filledDate',
    ])
    // A breakdown through the req declares the join.
    expect(L.FIGURE_USES['recruiting-offer-acceptance-location']).toEqual(
      expect.arrayContaining(['candidates.reqId', 'requisitions.reqId', 'requisitions.location']),
    )
  })

  it('uses() keeps the first of each field, in order', () => {
    expect(L.uses(['candidates.source'], L.COHORT, ['candidates.source'])).toEqual([
      'candidates.source',
      'candidates.appliedDate',
    ])
    expect(L.appDimUses(null)).toEqual([])
    expect(L.appDimUses('department')).toContain('requisitions.department')
    expect(L.reqDimUses('level')).toEqual(['requisitions.level'])
    expect(L.reqDimUses('hiringManager')).toEqual([])
  })
})

describe('on the sample company', () => {
  it('every KPI declares the fields it is computed from', () => {
    const m = computeRecruitingUncached(sample())
    expect(m.kpis.length).toBe(6)
    for (const k of m.kpis) {
      expectLineage(k)
      expect(k.uses).toEqual(L.KPI_USES[k.id as keyof typeof L.KPI_USES])
    }
  })

  it('every finding, shown or not, declares its fields across scopes, periods and dates', () => {
    const ctxs = [
      sample(),
      sample({ department: ['Design Verification'] }),
      sample({ department: ['Analog & Mixed-Signal'] }),
      sample({ period: 't3m' }),
      sample({ period: 't6m' }),
      sample({ period: 'lastQuarter' }),
      sample({ location: ['Bengaluru'] }),
      sample({}, '2026-03-31'),
    ]
    const seen = new Set<string>()
    for (const ctx of ctxs) {
      const m = computeRecruitingUncached(ctx)
      const all: Finding[] = [...m.findings, ...allProblemFindings(m.base)]
      for (const f of all) {
        expectLineage(f)
        seen.add(f.id)
      }
    }
    // The sample's stories reach most finding kinds, so the check above covers them.
    for (const id of [
      'rec-bottleneck',
      'rec-lacking-next-step',
      'rec-offer-acceptance',
      'rec-empty-funnel',
      'rec-time-to-fill',
      'rec-source-drying-up',
      'rec-best-source',
    ])
      expect(seen, id).toContain(id)
  })

  it('names the breakdown a finding concentrates in', () => {
    const m = computeRecruitingUncached(sample())
    const byId = (id: string) => m.findings.find((f) => f.id === id)
    // Story 1: the bottleneck sits in one department, read through the req.
    expect(byId('rec-bottleneck')?.uses).toEqual(
      expect.arrayContaining(['candidates.onsiteDate', 'candidates.offerDate', 'requisitions.department']),
    )
    // Story 2: acceptance fell most in one location, with the top decline reasons.
    expect(byId('rec-offer-acceptance')?.uses).toEqual(
      expect.arrayContaining([
        'candidates.rejectedDate',
        'requisitions.location',
        'candidates.rejectionReason',
      ]),
    )
    // Story 5: the best source is a candidate field; no requisition field is involved.
    const best = byId('rec-best-source')?.uses ?? []
    expect(best).toContain('candidates.source')
    expect(best.some((r) => r.startsWith('requisitions.'))).toBe(false)
  })
})

describe('on hand-built data', () => {
  it('the join finding declares the req ID on both sides', () => {
    const ctx = ctxOf({
      requisitions: [req('R1')],
      candidates: Array.from({ length: 6 }, () => cand('R-UNKNOWN', { appliedDate: '2026-06-01' })),
    })
    const f = computeRecruitingUncached(ctx).findings.find((x) => x.id === 'rec-data-join')
    expect(f?.uses).toEqual(['candidates.reqId', 'requisitions.reqId'])
  })

  it('withdrawals declare the reason only when the detail names one', () => {
    const exits = (reason: string | null) =>
      Array.from({ length: 12 }, (_, i) =>
        cand('R1', {
          appliedDate: '2026-05-01',
          screenDate: '2026-05-05',
          currentStage: 'Screen',
          status: i < 4 ? 'Withdrawn' : 'Rejected',
          rejectedDate: '2026-06-01',
          rejectionReason: reason,
        }),
      )
    const run = (reason: string | null) =>
      computeRecruitingUncached(
        ctxOf({ requisitions: [req('R1')], candidates: exits(reason) }),
      ).findings.find((x) => x.id === 'rec-withdrawals')
    const named = run('Accepted another offer')
    expect(named?.uses).toEqual(
      expect.arrayContaining(['candidates.currentStage', 'candidates.rejectionReason']),
    )
    expect(run(null)?.uses).not.toContain('candidates.rejectionReason')
  })
})

/* Every Figure in the view's UI passes the lineage registered for its id, and no entry is stale. */
const UI = import.meta.glob<string>('../ui/*.tsx', { query: '?raw', import: 'default', eager: true })

describe('figures in the UI', () => {
  it('every Figure passes uses={FIGURE_USES[<its id>]}', () => {
    const ids: string[] = []
    for (const [file, src] of Object.entries(UI)) {
      const chunks = src.split(/<Figure\b/).slice(1)
      for (const chunk of chunks) {
        const id = /\bid="([^"]+)"/.exec(chunk)?.[1]
        expect(id, `${file}: a Figure without an id`).toBeTruthy()
        expect(chunk, `${file}: ${id} passes no lineage`).toContain(`uses={FIGURE_USES['${id}']}`)
        ids.push(id as string)
      }
    }
    expect(ids.length).toBeGreaterThanOrEqual(20)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(Object.keys(L.FIGURE_USES).sort())
  })
})
