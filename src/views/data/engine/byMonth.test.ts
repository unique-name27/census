/**
 * Records by month (engine/byMonth.ts): each cell recounts the rows dated in its month, a row
 * counts once however many of its dates fall in the month, the drill lists exactly those rows,
 * and survey answers open as grouped counts, never one by one.
 */
import { describe, expect, it } from 'vitest'
import { decide } from '@/access/policy'
import { generateSample } from '@/data/sample'
import { type Datasets, type Employee, emptyDatasets, type SurveyResponse } from '@/data/schema'
import { CATALOG } from '@/metrics/catalog'
import { DATA_METRIC } from '../roomMetrics'
import { byMonthDrill, MONTH_RULES, rowsByMonth, SNAPSHOT_DATASETS } from './byMonth'

const emp = (id: string, hireDate: string, terminationDate?: string): Employee => ({
  employeeId: id,
  name: id,
  jobTitle: 'Engineer',
  businessUnit: 'Silicon Engineering',
  department: 'Digital Design',
  location: 'San Jose',
  country: 'United States',
  level: 'L3',
  hireDate,
  employmentType: 'Employee',
  ...(terminationDate ? { terminationDate, terminationType: 'Voluntary' as const } : {}),
})

const answer = (
  key: string,
  survey: SurveyResponse['survey'],
  wave: string,
  date: string,
): SurveyResponse => ({
  survey,
  wave,
  responseDate: date,
  respondentKey: key,
  item: 'Q1',
  driver: 'Speed',
  score: 4,
  scale: '1-5',
})

describe('records by month', () => {
  const data: Datasets = {
    ...emptyDatasets(),
    employees: [
      emp('A', '2026-07-03'),
      // Hired and gone in the same month: one row.
      emp('B', '2026-08-01', '2026-08-28'),
      emp('C', '2020-01-06', '2026-09-15'),
    ],
    surveyResponses: [
      ...['1', '2', '3', '4', '5', '6'].map((k) =>
        answer(k, 'Hiring manager satisfaction', '2026 Q3', '2026-08-10'),
      ),
      ...['7', '8'].map((k) => answer(k, 'Engagement', '2026 Q3', '2026-08-12')),
    ],
  }
  const r = rowsByMonth(data, '2026-09-30', 3)

  it('counts each row once in the months its event dates fall in', () => {
    expect(r.months).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(r.datasets).toEqual(['employees', 'surveyResponses'])
    const emps = r.cells.filter((c) => c.key === 'employees')
    expect(emps.map((c) => c.rows)).toEqual([1, 1, 1])
    expect(emps.map((c) => c.share)).toEqual([1, 1, 1])
    const answers = r.cells.filter((c) => c.key === 'surveyResponses')
    expect(answers.map((c) => [c.rows, c.share])).toEqual([
      [0, 0],
      [8, 1],
      [0, 0],
    ])
    // Snapshot datasets never get a row; empty dated datasets are named apart.
    expect(SNAPSHOT_DATASETS).toEqual(['succession', 'comp', 'rightToWork', 'surveyItems'])
    expect(r.empty).toContain('candidates')
  })

  it('opens exactly the rows of a cell, and survey answers only as groups', () => {
    const aug = r.cells.find((c) => c.key === 'employees' && c.month === '2026-08')!
    expect(byMonthDrill(aug, data)?.rows).toEqual([data.employees[1]])
    const none = r.cells.find((c) => c.key === 'surveyResponses' && c.month === '2026-07')!
    expect(byMonthDrill(none, data)).toBeNull()
    const answers = r.cells.find((c) => c.key === 'surveyResponses' && c.month === '2026-08')!
    const spec = byMonthDrill(answers, data, { min: 5, engagement: false })
    expect(spec?.kind).toBe('surveyGroups')
    const rows = (spec?.rows ?? []) as unknown as readonly {
      survey: string
      responses: number
      mean: number | null
      suppressed: boolean
    }[]
    expect(rows.reduce((a, g) => a + g.responses, 0)).toBe(answers.rows)
    // Two engagement answers: a count only (under the minimum, and the switch is off).
    expect(rows.find((g) => g.survey === 'Engagement')).toMatchObject({ mean: null, suppressed: true })
    expect(rows.find((g) => g.survey === 'Hiring manager satisfaction')).toMatchObject({ mean: 4 })
    for (const g of rows) expect(Object.keys(g)).not.toContain('respondentKey')
  })

  it('recounts the sample company from the raw rows', () => {
    const sample = generateSample()
    const asOf = '2026-09-30'
    const s = rowsByMonth(sample, asOf)
    expect(s.months).toHaveLength(24)
    for (const c of s.cells) {
      const rule = MONTH_RULES[c.key]!
      const rows = sample[c.key] as unknown as Record<string, unknown>[]
      const n = rows.filter((x) =>
        rule.fields.some((f) => typeof x[f] === 'string' && (x[f] as string).slice(0, 7) === c.month),
      ).length
      expect(c.rows, `${c.key} ${c.month}`).toBe(n)
      expect(c.share).toBeGreaterThanOrEqual(0)
      expect(c.share).toBeLessThanOrEqual(1)
      const spec = byMonthDrill(c, sample)
      if (c.key !== 'surveyResponses') expect(spec?.rows.length ?? 0).toBe(n)
    }
    // Every dated dataset the sample loads has a busiest month at 100%.
    for (const k of s.datasets)
      expect(
        s.cells.some((c) => c.key === k && c.share === 1),
        k,
      ).toBe(true)
  })

  it('is hidden with the Data room in Manager mode', () => {
    const views = (id: string) => CATALOG.byId.get(id)?.views
    expect(CATALOG.byId.has(DATA_METRIC.byMonth)).toBe(true)
    expect(decide('manager', `metric:${DATA_METRIC.byMonth}`, undefined, { metricViews: views }).access).toBe(
      'hidden',
    )
    expect(decide('manager', 'figure:data-coverage-by-month').access).toBe('hidden')
    expect(decide('hr', 'figure:data-coverage-by-month').access).toBe('shown')
  })
})
