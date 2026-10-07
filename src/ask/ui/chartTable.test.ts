/**
 * A chart Ask drew, as its table view and exports read (docs/ASK-ACTIONS.md, part 4): months and
 * quarters in words, sorting by their keys, while the chart's axis keeps the keys; the
 * definition says where the numbers come from in one plain sentence. And the docked panel is
 * measured on the page without its scrollbar.
 */
import { describe, expect, it } from 'vitest'
import { type AskChart, Conversation } from '@/ask/engine'
import { callScreen, envOf, fakeApp, sampleCtx } from '@/ask/engine/testkit'
import { chartSourceText, chartView, periodLabel } from './chartView'
import { dockLayout, MAIN_MIN } from './dock'

const ctx = sampleCtx()
const env = () => envOf(ctx, { app: fakeApp(ctx).app })

async function draw(spec: Record<string, unknown>): Promise<AskChart> {
  const r = await callScreen(new Conversation(), env(), 'make_chart', { title: 'A chart', ...spec })
  if (!r.chart) throw new Error(r.content)
  return r.chart
}

describe('the table of a chart over time', () => {
  it('names months in words and sorts them by their keys', async () => {
    const chart = await draw({
      source: {
        tool: 'query_records',
        input: {
          dataset: 'employees',
          where: [{ field: 'hireDate', op: 'in_period', value: 'current' }],
          group_by: [{ field: 'hireDate', by: 'month' }],
        },
      },
      form: 'columns',
    })
    const v = chartView(chart)
    const key = chart.x as string
    // The axis keeps the keys; the table shows the words.
    expect(v.rows.every((r) => /^\d{4}-\d{2}$/.test(String(r[key])))).toBe(true)
    expect(v.tableRows.every((r) => /^[A-Z][a-z]{2} \d{4}$/.test(String(r[key])))).toBe(true)
    const col = v.columns.find((c) => c.key === key)
    expect(col?.sortKey).toBeTruthy()
    v.tableRows.forEach((r, i) => {
      expect(r[col?.sortKey as string]).toBe(v.rows[i]?.[key])
    })
    // Every column's label is its own.
    const labels = v.columns.map((c) => c.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('reads month and quarter keys, and leaves anything else alone', () => {
    expect(periodLabel('month', '2026-04')).toBe('Apr 2026')
    expect(periodLabel('quarter', '2026 Q2')).toBe('Q2 2026')
    expect(periodLabel('month', 'April')).toBeNull()
    expect(periodLabel('category', '2026-04')).toBeNull()
    expect(periodLabel('month', null)).toBeNull()
  })

  it('keeps the rows as they are when no column is a month or quarter', async () => {
    const chart = await draw({
      source: {
        tool: 'query_records',
        input: {
          dataset: 'employees',
          where: [{ field: 'active', op: 'eq', value: true }],
          group_by: [{ field: 'location' }],
        },
      },
      form: 'bars',
    })
    const v = chartView(chart)
    expect(v.tableRows).toBe(v.rows)
    expect(v.columns.some((c) => c.sortKey)).toBe(false)
  })
})

describe('where the numbers come from', () => {
  it('is one sentence, with the scope inside it', () => {
    expect(
      chartSourceText({
        source: 'Employees, counted from records',
        scope: 'Whole company',
        period: 'as of 30 Jun 2026',
      }),
    ).toBe('Employees, counted from records, for the whole company, as of 30 Jun 2026.')
    expect(
      chartSourceText({
        source: 'the figure "Hires by month"',
        scope: 'Bengaluru, not L1',
        period: 'last 12 months',
      }),
    ).toBe('The figure "Hires by month", for Bengaluru, not L1, last 12 months.')
  })
})

describe('the docked panel', () => {
  it('leaves the main area its minimum on the page without the scrollbar', () => {
    const layout = dockLayout(
      'open',
      { width: 800, height: 800, page: 785 },
      { width: 640, tall: false },
      120,
    )
    expect(layout.kind).toBe('dock')
    expect(785 - layout.right).toBe(MAIN_MIN)
    // Without a page width, the window's.
    expect(dockLayout('open', { width: 800, height: 800 }, { width: 640, tall: false }, 120).right).toBe(
      800 - MAIN_MIN,
    )
  })
})
