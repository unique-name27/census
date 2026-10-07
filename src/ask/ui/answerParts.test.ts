/**
 * An answer with Ask on the screen (docs/ASK-ACTIONS.md, parts 3 and 4): charts sit where the text
 * stood when their tool ran, the answer's tables keep one numbering across the pieces, and the
 * action lines list what changed, with Undo where there is something to put back.
 */
import { describe, expect, it } from 'vitest'
import type { AppSnapshot, AskAction, AskChart, ToolCallRecord } from '@/ask/engine'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import { actionCallIds, actionLines, actionsOf, answerParts, chartsOf } from './answerParts'

const chart = (id: string): AskChart =>
  ({ id, title: id, form: 'bars', rows: [], columns: [], refs: [], notes: [] }) as unknown as AskChart

const call = (id: string, extra: Partial<ToolCallRecord> = {}): ToolCallRecord => ({
  id,
  name: 'make_chart',
  input: {},
  result: '{}',
  isError: false,
  ms: 1,
  label: id,
  round: 1,
  ...extra,
})

const action = (id: string, undo = true): AskAction => ({
  id,
  tool: undo ? 'set_filters' : 'show_figure',
  line: `Line ${id}`,
  undo: undo
    ? {
        before: {} as never,
        after: {} as never,
        parts: ['scope'],
      }
    : null,
})

describe('answerParts', () => {
  it('puts a chart where the text stood when its tool ran', () => {
    const text = 'I will draw it.\n\nBengaluru is highest.'
    const parts = answerParts(text, [{ chart: chart('c1'), at: 'I will draw it.'.length }])
    expect(parts.map((p) => p.kind)).toEqual(['text', 'charts', 'text'])
    expect(parts[0]).toMatchObject({ kind: 'text', text: 'I will draw it.' })
    expect(parts[2]).toMatchObject({ kind: 'text', text: '\n\nBengaluru is highest.' })
  })

  it('leads with the chart when nothing came before it, and groups charts of one round', () => {
    const parts = answerParts('After.', [
      { chart: chart('a'), at: 0 },
      { chart: chart('b'), at: 0 },
    ])
    expect(parts).toEqual([
      { kind: 'charts', charts: [chart('a'), chart('b')] },
      { kind: 'text', text: 'After.', tablesBefore: 0 },
    ])
  })

  it('keeps one numbering for the tables across the pieces', () => {
    const text = '| a |\n|---|\n| 1 |\n\nMore\n\n| b |\n|---|\n| 2 |'
    const at = text.indexOf('More')
    const count = (t: string) => (t.match(/\|---\|/g) ?? []).length
    const parts = answerParts(text, [{ chart: chart('c'), at }], count)
    const texts = parts.filter((p) => p.kind === 'text')
    expect(texts.map((p) => p.tablesBefore)).toEqual([0, 1])
  })

  it('reads charts from the calls with their steps, the text alone without any', () => {
    const calls = [call('t1'), call('t2', { chart: chart('ask-chart-1') })]
    const got = chartsOf(calls, [
      { id: 't1', at: 0 },
      { id: 't2', at: 7 },
    ])
    expect(got).toEqual([{ chart: chart('ask-chart-1'), at: 7 }])
    expect(answerParts('Just text', [])).toEqual([{ kind: 'text', text: 'Just text', tablesBefore: 0 }])
    // A chart whose step is unknown goes after the text.
    expect(answerParts('Text', chartsOf(calls, [])).map((p) => p.kind)).toEqual(['text', 'charts'])
  })
})

describe('actionLines', () => {
  it('lists the actions in order, with Undo where there is something to put back', () => {
    const calls = [
      call('f', { name: 'set_filters', action: action('f') }),
      call('q', { name: 'query_records' }),
      call('s', { name: 'show_figure', action: action('s', false) }),
      call('bad', { name: 'open_view', isError: true, action: action('bad') }),
    ]
    const lines = actionLines(calls, { f: true })
    expect(lines.map((l) => [l.action.id, l.undone, l.canUndo])).toEqual([
      ['f', true, false],
      ['s', false, false],
    ])
    expect([...actionCallIds(calls)]).toEqual(['f', 's'])
  })

  const snap = (filters: Partial<Filters>, entry: number): AppSnapshot => ({
    route: { view: 'scorecard', tab: '' },
    filters: { ...DEFAULT_FILTERS, ...filters },
    standard: 'bronze',
    lens: false,
    savedViewId: null,
    records: [],
    entry,
  })
  const filterAction = (id: string, before: AppSnapshot, after: AppSnapshot): AskAction => ({
    id,
    tool: 'set_filters',
    line: id,
    undo: { before, after, parts: ['scope'] },
  })

  it('offers Undo on an earlier action only once a later one that changed the same filter is undone', () => {
    const s0 = snap({}, 1)
    const s1 = snap({ location: ['Bengaluru'] }, 2)
    const s2 = snap({ location: ['Bengaluru'], period: 't6m' }, 3)
    const s3 = snap({ location: ['Austin'], period: 't6m' }, 4)
    const loc = filterAction('loc', s0, s1)
    const period = filterAction('period', s1, s2)
    const austin = filterAction('austin', s2, s3)
    const first = [call('loc', { action: loc }), call('period', { action: period })]
    const all = [loc, period, austin]
    const can = (undone: Record<string, true>, entry: number | null = 4) =>
      actionLines(first, undone, { all, entry }).map((l) => [l.action.id, l.canUndo])
    // A later answer moved the location again: the first line waits; the period is its own.
    expect(can({})).toEqual([
      ['loc', false],
      ['period', true],
    ])
    expect(can({ austin: true })).toEqual([
      ['loc', true],
      ['period', true],
    ])
    // Stepped Back past the period's entry: it reads as undone, with nothing to offer.
    const back = actionLines(first, {}, { all: [loc, period], entry: 2 })
    expect(back.map((l) => [l.action.id, l.undone, l.canUndo])).toEqual([
      ['loc', false, true],
      ['period', true, false],
    ])
    expect(
      actionsOf([{ calls: first }, { calls: [call('a', { action: austin })] }]).map((a) => a.id),
    ).toEqual(['loc', 'period', 'austin'])
  })

  it('says Changed since when everything an action changed was changed again by hand', () => {
    const s0 = snap({}, 1)
    const s1 = snap({ location: ['Bengaluru'], period: 't6m' }, 2)
    const both = filterAction('both', s0, s1)
    const lines = (now: AppSnapshot) =>
      actionLines([call('both', { action: both })], {}, { all: [both], entry: now.entry, now }).map((l) => [
        l.canUndo,
        l.changedSince,
      ])
    // As the action left it, and with only the location changed since: Undo has the period to put back.
    expect(lines(s1)).toEqual([[true, false]])
    expect(lines(snap({ location: ['Austin'], period: 't6m' }, 3))).toEqual([[true, false]])
    // Both changed since: nothing of the action is on screen.
    expect(lines(snap({ location: ['Austin'], period: 'ytd' }, 4))).toEqual([[false, true]])
    // Without the screen, the line offers Undo as before.
    expect(actionLines([call('both', { action: both })], {}).map((l) => l.changedSince)).toEqual([false])
  })
})
