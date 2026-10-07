/**
 * How a chart Ask drew reads (docs/ASK-ACTIONS.md, part 4): every column of its table and exports
 * has its own label; where the numbers come from is said without tool names; a count not limited
 * to the period is dated as of the as-of date, not labelled with the period; and Claude's subtitle
 * never names a scope or period the numbers are not for.
 */
import { describe, expect, it } from 'vitest'
import { chartScope, chartSubtitle } from './chart'
import { Conversation } from './conversation'
import { callScreen, envOf, fakeApp, sampleCtx } from './testkit'

const ctx = sampleCtx()
const env = () => envOf(ctx, { app: fakeApp(ctx).app })
const chart = (spec: Record<string, unknown>) => callScreen(new Conversation(), env(), 'make_chart', spec)

const ACTIVE = [{ field: 'active', op: 'eq', value: true }]
const TOOL_NAMES = /query_records|compare_groups|view_summary|make_chart/

const labels = (r: Awaited<ReturnType<typeof chart>>) => r.chart?.columns.map((c) => c.label) ?? []
const unique = (xs: readonly string[]) => new Set(xs).size === xs.length

describe('a chart’s columns', () => {
  it('count people once on one-row-per-person data', async () => {
    const r = await chart({
      source: {
        tool: 'query_records',
        input: { dataset: 'employees', where: ACTIVE, group_by: [{ field: 'businessUnit' }] },
      },
      form: 'bars',
      title: 'Headcount by business unit',
    })
    expect(r.isError, r.content.slice(0, 200)).toBe(false)
    expect(labels(r)).toEqual(['Business unit', 'People'])
    expect(r.chart?.rows.every((row) => !('people' in row))).toBe(true)
    // Asking for distinct people on the same data adds nothing: they are the count.
    const asked = await chart({
      source: {
        tool: 'query_records',
        input: {
          dataset: 'employees',
          where: ACTIVE,
          group_by: [{ field: 'businessUnit' }],
          measures: [{ op: 'count' }, { op: 'distinct_people' }],
        },
      },
      form: 'bars',
      title: 'Headcount by business unit',
    })
    expect(labels(asked)).toEqual(['Business unit', 'People'])
  })

  it('keep the dataset’s own count, with people beside it only when asked for', async () => {
    const input = { dataset: 'cases', group_by: [{ field: 'category' }] }
    const plain = await chart({
      source: { tool: 'query_records', input },
      form: 'bars',
      title: 'Cases by category',
    })
    expect(plain.isError, plain.content.slice(0, 200)).toBe(false)
    expect(labels(plain)).toEqual(['Category', 'Cases'])
    const both = await chart({
      source: {
        tool: 'query_records',
        input: { ...input, measures: [{ op: 'count' }, { op: 'distinct_people' }] },
      },
      form: 'bars',
      title: 'Cases by category',
    })
    expect(labels(both)).toEqual(['Category', 'Cases', 'People'])
    for (const r of [plain, both]) expect(unique(labels(r))).toBe(true)
  })

  it('say what a change is compared with', async () => {
    const r = await chart({
      source: { tool: 'compare_groups', input: { view: 'hrbp', kpi: 'voluntary', by: 'location' } },
      form: 'bars',
      title: 'Voluntary attrition by location',
    })
    expect(r.isError, r.content.slice(0, 200)).toBe(false)
    const change = r.chart?.columns.find((c) => c.key === 'change')
    expect(change?.label).toMatch(/^Change vs /)
    expect(unique(labels(r))).toBe(true)
  })
})

describe('where a chart’s numbers come from', () => {
  it('is said without tool names, to the reader and to Claude', async () => {
    const sources = [
      {
        tool: 'query_records',
        input: { dataset: 'employees', where: ACTIVE, group_by: [{ field: 'location' }] },
      },
      { tool: 'compare_groups', input: { view: 'hrbp', kpi: 'voluntary', by: 'department' } },
      { tool: 'view_summary', input: { view: 'hrbp' } },
    ]
    for (const source of sources) {
      const r = await chart({ source, form: 'bars', title: 'A chart' })
      expect(r.isError, `${source.tool}: ${r.content.slice(0, 200)}`).toBe(false)
      expect(r.chart?.source, source.tool).not.toMatch(TOOL_NAMES)
      expect(String(r.json.source), source.tool).not.toMatch(TOOL_NAMES)
    }
    const q = await chart({ source: sources[0], form: 'bars', title: 'A chart' })
    expect(q.chart?.source).toBe('Employees, counted from records')
  })

  it('dates a count not limited to the period as of the as-of date', async () => {
    const r = await chart({
      source: {
        tool: 'query_records',
        input: { dataset: 'employees', where: ACTIVE, group_by: [{ field: 'businessUnit' }] },
      },
      form: 'bars',
      title: 'Headcount by business unit',
    })
    expect(r.chart?.period).toMatch(/^as of \d{1,2} [A-Z][a-z]{2} \d{4}$/)
    expect(
      r.chart?.notes.some((n) => /^Not limited to the period on screen \(last 12 months\)/.test(n)),
    ).toBe(true)
    expect(r.json.period).toBe(r.chart?.period)
    const inPeriod = await chart({
      source: {
        tool: 'query_records',
        input: {
          dataset: 'employees',
          where: [{ field: 'hireDate', op: 'in_period', value: 'current' }],
          group_by: [{ field: 'hireDate', by: 'month' }],
        },
      },
      form: 'columns',
      title: 'Hires by month',
    })
    expect(inPeriod.isError, inPeriod.content.slice(0, 200)).toBe(false)
    expect(inPeriod.chart?.period).toBe('last 12 months')
    expect(inPeriod.chart?.notes.some((n) => /Not limited to the period/.test(n))).toBe(false)
  })

  it('words the scope with one separator, starting a sentence', () => {
    expect(chartScope('{{P3}}’s org · Bengaluru')).toBe('{{P3}}’s org, Bengaluru')
    expect(chartScope('the whole company')).toBe('Whole company')
    expect(chartScope('Whole company')).toBe('Whole company')
  })
})

describe('Claude’s subtitle', () => {
  const place = String(ctx.all.employees.find((e) => e.location)?.location)
  const at = { scope: 'Whole company', period: 'last 12 months', places: [place], shown: new Set<string>() }

  it('is left out when it names a period, place, org or the company the numbers are not for', () => {
    for (const sub of [`${place}, last 6 months`, 'Year to date', 'Q2 2026', `${place} only`, '{{P4}}’s org'])
      expect(chartSubtitle(sub, at), sub).toEqual({ text: null, leftOut: true })
    expect(chartSubtitle('Whole company', { ...at, scope: `${place}` })).toEqual({
      text: null,
      leftOut: true,
    })
  })

  it('stays when it adds to the scope and period, and goes quietly when it only repeats them', () => {
    expect(chartSubtitle('Active employees, by business unit', at)).toEqual({
      text: 'Active employees, by business unit',
      leftOut: false,
    })
    expect(chartSubtitle('Whole company, last 12 months', at)).toEqual({ text: null, leftOut: false })
    // A place the chart itself shows (a bar per location) may be named.
    expect(chartSubtitle(`${place} is highest`, { ...at, shown: new Set([place]) }).text).toBe(
      `${place} is highest`,
    )
    // Rows not limited to the period may be dated by their own where clause, never by a window.
    const unlimited = { ...at, period: 'as of 30 Jun 2026', unlimited: true }
    expect(chartSubtitle('Hired since 2023', unlimited).text).toBe('Hired since 2023')
    expect(chartSubtitle('Last 6 months', unlimited).leftOut).toBe(true)
  })

  it('that contradicts the chart is left out, and Claude is told what the numbers are for', async () => {
    const r = await chart({
      source: {
        tool: 'compare_groups',
        input: { view: 'hrbp', kpi: 'voluntary', by: 'department' },
      },
      form: 'bars',
      title: 'Voluntary attrition by department',
      subtitle: `${place}, last 6 months`,
    })
    expect(r.isError, r.content.slice(0, 200)).toBe(false)
    expect(r.chart?.subtitle).toBeNull()
    expect(String(r.json.subtitle_left_out)).toMatch(/the whole company, last 12 months\.$/)
    const kept = await chart({
      source: { tool: 'compare_groups', input: { view: 'hrbp', kpi: 'voluntary', by: 'department' } },
      form: 'bars',
      title: 'Voluntary attrition by department',
      subtitle: 'Leavers who chose to go',
    })
    expect(kept.chart?.subtitle).toBe('Leavers who chose to go')
    expect(kept.json.subtitle_left_out).toBeUndefined()
  })
})
