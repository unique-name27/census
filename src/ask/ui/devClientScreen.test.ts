/**
 * The development build's scripted Claude on the screen (docs/ASK-ACTIONS.md, part 5): flows that
 * call set_filters, reset_filters, open_view, show_figure, open_records, apply_saved_view,
 * get_screen and make_chart through the engine's real loop and a fake app, so the whole thing can be demoed and
 * tested with no key; and the answer it writes when "Let Ask change the screen" is off.
 */
import { describe, expect, it } from 'vitest'
import { ask, Conversation, type FigureData } from '@/ask/engine'
import { envOf, expectClean, fakeApp, sampleCtx } from '@/ask/engine/testkit'
import { DEFAULT_FILTERS } from '@/data/scope'
import { createDevClient, planFor } from './devClient'

const ctx = sampleCtx()

const figure: FigureData = {
  id: 'hrbp-attrition-by-location',
  title: 'Voluntary attrition by location',
  subtitle: null,
  note: null,
  columns: [{ key: 'location', label: 'Location' }],
  rows: [{ location: 'Bengaluru' }],
  tier: 'bronze',
  withheld: false,
  metric: 'hrbp.attrition.voluntary',
  view: 'hrbp',
  tab: 'attrition',
}

const names = (q: string, tools?: string[]) =>
  planFor(q, tools ? new Set(tools) : null).rounds.map((r) => r.map((c) => c.name))

async function run(question: string, app = fakeApp(ctx, { figures: [figure] })) {
  const conv = new Conversation()
  const r = await ask({
    client: createDevClient({ pace: 0 }),
    conversation: conv,
    question,
    env: envOf(ctx, { app: app.app }),
  })
  return { r, conv, app }
}

describe('planFor on the screen', () => {
  it('reads the question after the screen line, never the line itself', () => {
    expect(names('On screen: People stats, Attrition; the whole company; last 12 months.\n\nHello')).toEqual([
      ['get_context'],
      ['view_summary'],
    ])
  })

  it('picks the screen tools by the words in the question', () => {
    expect(names('Filter to Bengaluru, last 6 months')).toEqual([['set_filters']])
    expect(planFor('Filter to Bengaluru, last 6 months').rounds[0]?.[0]?.input).toEqual({
      location: ['Bengaluru'],
      period: 't6m',
    })
    expect(names('Reset the filters')).toEqual([['reset_filters']])
    expect(names('Open attrition and point to the chart')).toEqual([['open_view'], ['show_figure']])
    expect(names('Draw a chart of headcount by location')).toEqual([['make_chart']])
    // The headcount chart is grouped by the dimension asked for, and titled to match.
    for (const [words, field] of [
      ['department', 'department'],
      ['level', 'level'],
      ['location', 'location'],
      ['business unit', 'businessUnit'],
    ] as const) {
      const input = planFor(`Draw a chart of headcount by ${words}`).rounds[0]?.[0]?.input as {
        source: { input: { group_by: { field: string }[] } }
        title: string
      }
      expect(input.source.input.group_by).toEqual([{ field }])
      expect(input.title).toBe(`Headcount by ${words}`)
    }
    expect(names('Apply my saved view')).toEqual([['get_screen'], ['apply_saved_view']])
    expect(names('Open the records')).toEqual([['query_records'], ['open_records']])
    expect(names('What am I looking at?')).toEqual([['get_screen']])
  })

  it('leaves the actions out when the request does not offer them', () => {
    const tools = ['get_context', 'view_summary', 'get_screen', 'make_chart']
    expect(names('Filter to Bengaluru', tools)).toEqual([['get_screen']])
    expect(planFor('Filter to Bengaluru', new Set(tools)).actionsOff).toBe(true)
    expect(names('Filter to Bengaluru', ['get_context', 'view_summary'])).toEqual([
      ['get_context'],
      ['view_summary'],
    ])
  })
})

describe('the scripted answer on the screen', () => {
  it('filters, and says what it changed', async () => {
    const { r, app } = await run('Filter to Bengaluru, last 6 months')
    expect(r.status).toBe('done')
    expect(app.app.screen().filters).toMatchObject({ location: ['Bengaluru'], period: 't6m' })
    expect(r.actions?.map((a) => a.line)).toEqual(['Filtered to Bengaluru, last 6 months'])
    expect(r.text).toContain('Filtered to Bengaluru, last 6 months.')
    expectClean(r.text, 'scripted answer')
  })

  it('opens a tab and points at its first figure', async () => {
    const { r, app } = await run('Open attrition and point to the chart')
    expect(r.calls.map((c) => c.name)).toEqual(['open_view', 'show_figure'])
    expect(app.app.screen().route).toEqual({ view: 'hrbp', tab: 'attrition' })
    expect(app.events).toEqual([{ id: figure.id, table: false }])
    expect(r.text).toContain('Opened People stats, Attrition.')
    expect(r.text).toContain('Pointed to Voluntary attrition by location.')
  })

  it('draws a chart whose numbers link to their records', async () => {
    const { r, conv } = await run('Chart voluntary attrition by location')
    expect(r.charts).toHaveLength(1)
    expect(r.charts?.[0]?.title).toBe('Voluntary attrition by location')
    const refs = [...r.text.matchAll(/\(ref:(r\d+)\)/g)].map((m) => m[1] as string)
    expect(refs.length).toBe(2)
    for (const ref of refs) expect(conv.hasRef(ref)).toBe(true)
    expectClean(r.text, 'scripted chart answer')
  })

  it('opens the records behind a number it counted', async () => {
    const { r, app, conv } = await run('Open the records')
    expect(r.calls.map((c) => c.name)).toEqual(['query_records', 'open_records'])
    const opened = (r.calls[1]?.input as { ref?: string })?.ref
    expect(opened && conv.hasRef(opened)).toBe(true)
    expect(app.records).toHaveLength(1)
    expect(r.actions?.map((a) => a.tool)).toEqual(['open_records'])
    expect(r.actions?.[0]?.line).toMatch(/^Opened the records for /)
    expectClean(r.text, 'scripted records answer')
  })

  it('applies a saved view and reads the screen', async () => {
    const app = fakeApp(ctx, {
      savedViews: [
        {
          id: 'v1',
          name: 'Bengaluru, year to date',
          page: null,
          filters: { ...DEFAULT_FILTERS, location: ['Bengaluru'], period: 'ytd', modes: {} },
        },
      ],
    })
    const { r } = await run('Apply my saved view', app)
    expect(r.calls.map((c) => c.name)).toEqual(['get_screen', 'apply_saved_view'])
    expect(app.app.screen().filters.location).toEqual(['Bengaluru'])
    expect(r.text).toContain('Applied the saved view "Bengaluru, year to date".')
    const screen = await run('What am I looking at?')
    expect(screen.r.text).toMatch(
      /^You are looking at \[People stats, Overview\]\(view:hrbp\.overview\) for the whole company, last 12 months\./,
    )
  })

  it('says so when changing the screen is off', async () => {
    const app = fakeApp(ctx, { actions: false })
    const { r } = await run('Filter to Bengaluru', app)
    expect(r.calls.map((c) => c.name)).toEqual(['get_screen'])
    expect(r.text).toMatch(/^Changing the screen is turned off in Settings > Ask Census/)
    expect(app.history).toHaveLength(1)
  })
})
