/**
 * Lines Ask draws (docs/ASK-ACTIONS.md, part 4): months and dates keep the kit's own time ticks
 * (no names per point, which would overlap at the panel's width); quarters and years are named on
 * the axis; and the line under a chart starts with a capital, whatever the source's scope wording.
 */
import { describe, expect, it } from 'vitest'
import type { AskChart, ChartColumn } from '@/ask/engine'
import { chartNote, chartView } from './chartView'

const line = (kind: ChartColumn['kind'], xs: string[], helper: (x: string) => string | null): AskChart => ({
  id: 'ask-chart-1',
  title: 'T',
  subtitle: null,
  form: 'lines',
  rows: xs.map((x, i) => ({ when: x, count: i + 1, ...(helper(x) ? { __x: helper(x) } : {}) })),
  columns: [
    { key: 'when', label: 'When', kind, format: kind === 'date' ? 'date' : 'text' },
    { key: 'count', label: 'Count', kind: 'number', format: 'int' },
  ],
  x: kind === 'month' ? 'when' : '__x',
  xLabel: 'when',
  y: 'count',
  series: null,
  value: null,
  target: null,
  label: null,
  xType: 'month',
  refs: xs.map(() => null),
  notes: [],
  source: 's',
  scope: 'Whole company',
  period: 'last 12 months',
  tier: null,
  metric: null,
})

describe('lines', () => {
  it('names quarters and years, and leaves months and dates to the kit’s time ticks', () => {
    const quarters = chartView(
      line('quarter', ['2026 Q1', '2026 Q2'], (q) => (q.endsWith('1') ? '2026-01' : '2026-04')),
    )
    expect(quarters.spec.kit === 'Lines' && quarters.spec.xNames).toEqual({
      '2026-01': '2026 Q1',
      '2026-04': '2026 Q2',
    })
    const years = chartView(line('year', ['2025', '2026'], (y) => `${y}-01`))
    expect(years.spec.kit === 'Lines' && years.spec.xNames).toEqual({ '2025-01': '2025', '2026-01': '2026' })
    const dates = chartView(line('date', ['2026-07-31', '2026-08-31', '2026-09-30'], (d) => d))
    expect(dates.spec.kit === 'Lines' && dates.spec.xNames).toBeNull()
    expect(dates.spec.kit === 'Lines' && dates.spec.x).toBe('__x')
    const months = chartView(line('month', ['2026-07', '2026-08'], () => null))
    expect(months.spec.kit === 'Lines' && months.spec.xNames).toBeNull()
  })

  it('starts the line under a chart with a capital', () => {
    expect(chartNote({ scope: 'the whole company', period: 'last 12 months', notes: ['Two notes'] })).toBe(
      'The whole company, last 12 months. Two notes.',
    )
    expect(chartNote({ scope: 'Whole company', period: 'last 12 months', notes: [] })).toBe(
      'Whole company, last 12 months.',
    )
  })
})
