import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { RegisteredFigure } from '@/charts/types'
import type { FieldRef } from '@/data/quality/fieldRef'
import { visibleColumns } from '@/lib/export/columns'
import {
  detached,
  findingRows,
  keyFiguresOf,
  pickLead,
  reportFileName,
  reportMonth,
  SLIDE_COLUMNS,
  scorecardSlides,
  scorecardTable,
  standingLine,
} from './report'
import { computeScorecard } from './schedule'
import { finding, kpi, practice, sampleContext } from './testkit'

const HIRE: readonly FieldRef[] = ['employees.hireDate']
const ctx = sampleContext()

// One practice below throws on purpose; keep its logged error out of the test output.
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function model() {
  return computeScorecard(ctx, [
    practice(
      'recruiting',
      {
        kpis: [
          kpi({
            id: 'ttf',
            label: 'Median time to fill',
            metricId: 'recruiting.reqs.timeToFill',
            value: 52,
            format: 'days',
            delta: 3,
            deltaLabel: 'vs prior 12 months',
            spark: [40, 45, 52],
            uses: HIRE,
          }),
          kpi({
            id: 'acc',
            label: 'Offer acceptance',
            metricId: 'recruiting.offers.acceptance',
            value: 0.9,
            uses: HIRE,
          }),
        ],
        findings: [
          finding({ id: 'r1', severity: 'critical', people: [{ id: 'E1', name: 'A' }], uses: HIRE }),
        ],
      },
      { label: 'Recruiting' },
    ),
    practice('talent', () => {
      throw new Error('boom')
    }),
    practice(
      'hrbp',
      {
        kpis: [
          kpi({
            id: 'vol',
            label: 'Voluntary attrition',
            metricId: 'hrbp.attrition.voluntary',
            value: 0.2,
            uses: HIRE,
          }),
        ],
        findings: [],
      },
      { label: 'People stats' },
    ),
  ])
}

describe('the scorecard table', () => {
  it('exports one row per measure with practice, value, target and status, and the reason for a failed practice', () => {
    const t = scorecardTable(model())
    expect(t.columns.map((c) => c.key).slice(0, 4)).toEqual(['practice', 'measure', 'value', 'valueText'])
    const keys = t.columns.map((c) => c.key)
    expect(keys.indexOf('status')).toBe(keys.indexOf('target') + 1)
    expect(t.rows.map((r) => [r.practice, r.measure, r.target, r.status])).toEqual([
      ['Recruiting', 'Median time to fill', 'At most 45 d', 'Missed'],
      ['Recruiting', 'Offer acceptance', 'At least 85.0%', 'Met'],
      ['Talent', '', undefined, undefined],
      ['People stats', 'Voluntary attrition', 'At most 10.0%', 'Missed'],
    ])
    expect(t.rows[2].note).toMatch(/^Could not be computed/)
    // Numbers stay numbers for the workbook, with the trend points as their own columns.
    expect(t.rows[0]).toMatchObject({ value: 52, unit: 'd', change: 3, comparedWith: 'vs prior 12 months' })
    expect(keys).toContain('trend0')
  })

  it('splits for slides at practice boundaries, naming the practice on every row', () => {
    const parts = scorecardSlides(model(), 3)
    expect(parts.map((p) => p.map((r) => r.measure))).toEqual([
      ['Median time to fill', 'Offer acceptance', expect.stringMatching(/^Could not be computed/)],
      ['Voluntary attrition'],
    ])
    expect(parts[0].map((r) => r.practice)).toEqual(['Recruiting', 'Recruiting', 'Talent'])
    expect(parts[0][0]).toMatchObject({
      valueText: '52 d',
      target: 'At most 45 d',
      status: 'Missed',
      changeText: '+3 d',
    })
    expect(visibleColumns(SLIDE_COLUMNS, false, 'slides')).toHaveLength(SLIDE_COLUMNS.length)
    expect(scorecardSlides(model()).length).toBe(1)
  })

  it('states the standing in one line', () => {
    expect(standingLine(model().counts)).toBe('1 of 3 targets met; 2 missed.')
    expect(
      standingLine({ measures: 0, judged: 0, met: 0, watch: 0, missed: 0, noTarget: 0, unknown: 0 }),
    ).toBe('No measure with a target has a value shown yet.')
    expect(
      standingLine({ measures: 4, judged: 4, met: 2, watch: 1, missed: 1, noTarget: 0, unknown: 0 }),
    ).toBe('2 of 4 targets met; 1 missed and 1 to watch.')
  })
})

describe('findings for the report', () => {
  it('counts people, never names them, and carries the practice', () => {
    const rows = findingRows(model().findings.all, () => 'bronze')
    expect(rows[0]).toMatchObject({ severity: 'Watch', practice: 'Scorecard' })
    expect(rows[1]).toEqual({
      severity: 'Critical',
      practice: 'Recruiting',
      finding: 'Finding r1.',
      tier: 'Bronze',
      detail: '',
      nextStep: '',
      people: 1,
    })
    expect(JSON.stringify(rows)).not.toContain('"A"')
  })
})

describe("a view's lead chart", () => {
  const fig = (id: string, order: number, svg: boolean, withheld = false): RegisteredFigure => ({
    id,
    title: id,
    columns: [],
    rows: [{}],
    order,
    withheld,
    getSvg: () => (svg ? ({} as SVGSVGElement) : null),
  })

  it('is the first figure after the key figures and the readout that draws a chart', () => {
    const figures = [
      fig('overview:key-figures', 1, false),
      fig('overview:readout', 2, false),
      fig('overview:table', 3, false),
      fig('overview:held', 4, true, true),
      fig('overview:chart', 5, true),
    ]
    expect(pickLead(figures)?.id).toBe('overview:chart')
    expect(keyFiguresOf(figures)?.id).toBe('overview:key-figures')
    expect(pickLead(figures.slice(0, 3))?.id).toBe('overview:table')
    expect(pickLead(figures.slice(0, 2))).toBeNull()
    // A view may prefix its strip and readout ids with its key.
    const talent = [
      fig('overview:talent-key-figures', 1, false),
      fig('overview:talent-readout', 2, false),
      fig('overview:grid', 3, true),
    ]
    expect(keyFiguresOf(talent)?.id).toBe('overview:talent-key-figures')
    expect(pickLead(talent)?.id).toBe('overview:grid')
  })

  it('is copied off the page with a new id once its image is captured', () => {
    const copy = detached(fig('overview:chart', 5, true), 'report:recruiting:lead', 'Recruiting: chart')
    expect(copy).toMatchObject({ id: 'report:recruiting:lead', title: 'Recruiting: chart', order: 5 })
    expect(copy.getSvg()).toBeNull()
  })
})

describe('the report', () => {
  it('covers the month of the as-of date', () => {
    expect(reportMonth('2026-09-30')).toBe('September 2026')
    expect(reportMonth('2027-01-31')).toBe('January 2027')
    expect(reportFileName('2026-09-30')).toBe('census-people-report-2026-09-30')
  })
})
