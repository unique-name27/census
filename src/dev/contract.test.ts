/**
 * Contract checks (docs/DESIGN-REFRESH.md 4.3): each figure, key figure and finding is judged on its
 * metric id, its `uses` and (key figures and findings) its records; figures about the app or the data
 * are not judged; coverage, what was checked and the gaps add up.
 */
import { describe, expect, it } from 'vitest'
import type { FigureFacts } from '@/charts/types'
import {
  CONTRACT_ORDER,
  checkedRows,
  contractCoverage,
  contractElements,
  coverageShare,
  gapRows,
} from './contract'
import { distinctFigureIds, type FigureScan, figuresOnly, scannedFigures } from './scanModel'

const fig = (id: string, extra: Partial<FigureFacts> = {}): FigureFacts => ({
  id,
  title: id,
  gated: true,
  rows: 1,
  image: true,
  kind: 'figure',
  order: 1,
  ...extra,
})

function scan(): FigureScan {
  const a = { key: 'hrbp', label: 'People stats' }
  const b = { key: 'data', label: 'Data room' }
  return {
    mode: 'developer',
    managerId: null,
    at: '2026-10-01T10:00:00Z',
    ms: 500,
    views: [
      {
        key: 'hrbp',
        label: 'People stats',
        tabs: [
          { key: 'overview', label: 'Overview', failed: false, ms: 120 },
          { key: 'workforce', label: 'Workforce', failed: true, ms: 30 },
        ],
      },
      {
        key: 'data',
        label: 'Data room',
        tabs: [{ key: 'quality', label: 'Data quality', failed: false, ms: 50 }],
      },
    ],
    figures: [
      ...scannedFigures(a, { key: 'overview', label: 'Overview' }, [
        fig('hrbp-ok', { metric: 'hrbp.x', uses: ['employees.hireDate'], order: 1 }),
        fig('hrbp-no-metric', { uses: ['employees.hireDate'], order: 2 }),
        fig('hrbp-nothing', { order: 3 }),
        fig('key-figures', {
          kind: 'table',
          gated: false,
          image: false,
          order: 0,
          items: {
            kind: 'kpi',
            list: [
              { id: 'k1', metricId: 'hrbp.k1', uses: true, drill: true },
              { id: 'k2', metricId: 'hrbp.k2', uses: true, drill: false },
            ],
          },
        }),
        fig('readout', {
          kind: 'table',
          gated: false,
          image: false,
          order: 4,
          items: { kind: 'finding', list: [{ id: 'f1', uses: false, drill: true }] },
        }),
      ]),
      ...scannedFigures(b, { key: 'quality', label: 'Data quality' }, [
        fig('data-quality-fields', { gated: false }),
      ]),
    ],
  }
}

describe('contract checks', () => {
  const s = scan()
  const elements = contractElements(s)

  it('judges figures, key figures and findings, and leaves figures about the data out', () => {
    expect(elements.map((e) => `${e.element}:${e.id}:${e.status}`)).toEqual([
      'kpi:k1:complete',
      'kpi:k2:no-drill',
      'figure:hrbp-ok:complete',
      'figure:hrbp-no-metric:no-metric',
      'figure:hrbp-nothing:no-uses',
      'finding:f1:no-uses',
    ])
    expect(elements.find((e) => e.id === 'hrbp-nothing')?.missing).toEqual(['no-metric', 'no-uses'])
    expect(elements.find((e) => e.id === 'f1')?.missing).toEqual(['no-metric', 'no-uses'])
  })

  it('counts each element once by its most serious gap, every status of every view', () => {
    const cov = contractCoverage(elements)
    expect(cov).toHaveLength(CONTRACT_ORDER.length)
    expect(cov.reduce((n, r) => n + r.count, 0)).toBe(elements.length)
    expect(Object.fromEntries(cov.map((r) => [r.status, r.count]))).toEqual({
      complete: 2,
      'no-metric': 1,
      'no-uses': 2,
      'no-drill': 1,
    })
    expect(coverageShare(elements)).toBeCloseTo(2 / 6)
    expect(coverageShare([])).toBeNull()
  })

  it('says what was checked per view, with failed tabs and the time', () => {
    const rows = checkedRows(s)
    expect(rows[0]).toMatchObject({
      view: 'hrbp',
      tabs: 2,
      figures: 3,
      kpis: 2,
      findings: 1,
      notJudged: 0,
      ms: 150,
    })
    expect(rows[0].failedTabs).toBe('Workforce')
    expect(rows[1]).toMatchObject({ view: 'data', figures: 0, notJudged: 1 })
  })

  it('lists every gap, most serious first', () => {
    const gaps = gapRows(elements)
    expect(gaps).toHaveLength(4)
    expect(gaps[0]).toMatchObject({ id: 'k2', element: 'KPI', missing: 'KPI or finding without a drill' })
    expect(gaps.at(-1)?.status).toBe('no-metric')
  })

  it('counts figures only, once per id', () => {
    expect(figuresOnly(s).map((f) => f.id)).toEqual([
      'hrbp-ok',
      'hrbp-no-metric',
      'hrbp-nothing',
      'data-quality-fields',
    ])
    expect(distinctFigureIds(s)).toHaveLength(4)
    expect(figuresOnly(null)).toEqual([])
  })
})
