/**
 * The Ask sheet's model: turns built from the engine's events, the progress line and what the
 * live region says, "What was sent", answer tables as DataTable rows, view links, the keyboard
 * rules and the key line in Settings.
 */
import { describe, expect, it } from 'vitest'
import { type AskResult, type Block, NO_USAGE, type PersonLookup, parseAnswer, STOPPED } from '@/ask/engine'
import {
  type AskedScope,
  announcement,
  answerTable,
  applyEvent,
  askedScope,
  cellValue,
  composerKey,
  exportScope,
  failTurn,
  finalText,
  finishTurn,
  firstWords,
  inferFormat,
  isAskShortcut,
  keyLine,
  leadOf,
  MIXED_SCOPE,
  newTurn,
  PERSON_KEY,
  REF_KEY,
  readableJson,
  refLabel,
  routeExists,
  sentCalls,
  settingsErrorDetail,
  sizeText,
  statusLine,
  type Turn,
  usageLine,
  withNames,
  withoutPartial,
} from './model'

const PEOPLE: Record<string, string> = { P1: 'Ana Diaz', P2: 'Ravi Menon' }
const person: PersonLookup = (t) => {
  const id = t.replace(/[{}]/g, '')
  return PEOPLE[id] ? { name: PEOPLE[id] as string } : null
}

const call = (
  id: string,
  label: string,
  extra: Partial<{ isError: boolean; ms: number; result: string }> = {},
) => ({
  id,
  name: 'view_summary',
  input: { view: 'hrbp' },
  result: extra.result ?? '{"ok":true}',
  isError: extra.isError ?? false,
  ms: extra.ms ?? 12.4,
  label,
  round: 1,
})

/** A turn after the usual stream: the question, two tools, then text. */
function streamed(): Turn[] {
  const out: Turn[] = []
  let t = newTurn(1, 'Where is attrition highest?', 'claude-opus-5-5')
  out.push(t)
  const events = [
    { type: 'question', sent: 'Where is attrition highest?' },
    { type: 'request', round: 1 },
    {
      type: 'tool_start',
      id: 'a',
      name: 'view_summary',
      label: 'Calculating People stats key figures for {{P1}}',
      round: 1,
    },
    { type: 'tool_end', call: call('a', 'Calculating People stats key figures for {{P1}}') },
    { type: 'request', round: 2 },
    { type: 'text', delta: 'Voluntary attrition is ' },
    { type: 'text', delta: '[18.8%](ref:r1) in Bengaluru. ' },
    { type: 'text', delta: 'More follows.' },
    { type: 'usage', usage: { input: 300, output: 40, cacheRead: 2000, cacheWrite: 0, requests: 2 } },
  ] as const
  for (const e of events) {
    t = applyEvent(t, e)
    out.push(t)
  }
  return out
}

describe('turns', () => {
  it('build from the streamed events', () => {
    const t = streamed().at(-1) as Turn
    expect(t.sent).toBe('Where is attrition highest?')
    expect(t.requests).toBe(2)
    expect(t.text).toBe('Voluntary attrition is [18.8%](ref:r1) in Bengaluru. More follows.')
    expect(t.steps).toEqual([
      { id: 'a', label: 'Calculating People stats key figures for {{P1}}', done: true, isError: false },
    ])
    expect(t.calls).toHaveLength(1)
    expect(t.usage.cacheRead).toBe(2000)
    expect(t.status).toBe('answering')
  })

  it('take the result as the record when the answer ends', () => {
    const t = streamed().at(-1) as Turn
    const r: AskResult = {
      status: 'done',
      text: 'Final text.',
      sent: 'Where is attrition highest?',
      calls: t.calls,
      usage: { ...NO_USAGE, input: 1 },
      rounds: 1,
      roundLimited: false,
      truncated: true,
      stopReason: 'max_tokens',
      error: null,
      model: 'claude-opus-5-5',
    }
    const done = finishTurn(t, r)
    expect(done.status).toBe('done')
    expect(done.text).toBe('Final text.')
    expect(done.truncated).toBe(true)
    expect(done.error).toBeNull()
    expect(done.steps.every((s) => s.done)).toBe(true)
    const stopped = finishTurn(
      { ...t, steps: [{ id: 'b', label: 'x', done: false, isError: false }] },
      {
        ...r,
        status: 'stopped',
        error: STOPPED,
      },
    )
    expect(stopped.status).toBe('stopped')
    expect(stopped.error?.kind).toBe('stopped')
    expect(stopped.steps[0]?.done).toBe(true)
  })

  it('fail without sending anything', () => {
    const t = failTurn(newTurn(2, 'Q', 'claude-opus-5-5'), {
      kind: 'no_key',
      title: 'Ask uses your own Claude API key.',
      detail: 'Add one.',
      action: 'settings',
    })
    expect(t.status).toBe('error')
    expect(t.sent).toBeNull()
    expect(failTurn(newTurn(3, 'Q', 'x'), STOPPED).status).toBe('stopped')
  })

  it('say what is happening while it is answered, with names for tokens', () => {
    const [fresh, , , started, ended, , text] = streamed()
    expect(statusLine(fresh as Turn, person)).toBe('Waiting for Claude')
    expect(statusLine(started as Turn, person)).toBe('Calculating People stats key figures for Ana Diaz')
    expect(statusLine(ended as Turn, person)).toBe('Waiting for Claude')
    expect(statusLine(text as Turn, person)).toBe('Writing the answer')
    expect(statusLine({ ...(text as Turn), status: 'done' }, person)).toBeNull()
  })

  it('show names for tokens, and "someone" for a token this chat never handed out', () => {
    expect(withNames('{{P1}} and {{P2}} and {{P9}}', person)).toBe('Ana Diaz and Ravi Menon and someone')
    expect(withNames('No people here.', person)).toBe('No people here.')
  })
})

describe('an answer still arriving', () => {
  it('leaves out a half-written link or token until it is complete', () => {
    expect(withoutPartial('Attrition is [18.8')).toBe('Attrition is ')
    expect(withoutPartial('Attrition is [18.8%](ref:r')).toBe('Attrition is ')
    expect(withoutPartial('Attrition is [18.8%](ref:r1).')).toBe('Attrition is [18.8%](ref:r1).')
    expect(withoutPartial('Led by {{P1')).toBe('Led by ')
    expect(withoutPartial('Led by {{P1}}.')).toBe('Led by {{P1}}.')
    expect(withoutPartial('A [amount withheld] note.')).toBe('A [amount withheld] note.')
    expect(withoutPartial('')).toBe('')
  })
})

type AskedScopeFilters = Parameters<typeof askedScope>[0]['filters']

describe('the live region', () => {
  const plain = () => 'Voluntary attrition is 18.8% in Bengaluru. More follows.'

  it('speaks when a tool starts and when text starts, never for each streamed word', () => {
    const turns = streamed()
    const said = turns.map((t, i) => announcement(i ? turns[i - 1] : undefined, t, plain, person))
    expect(said[0]).toBe('Asking Claude.')
    expect(said[3]).toBe('Calculating People stats key figures for Ana Diaz')
    expect(said.filter((s) => s === 'Writing the answer.')).toHaveLength(1)
    // Seven later events, two announcements.
    expect(said.slice(4).filter(Boolean)).toEqual(['Writing the answer.'])
  })

  it('says the answer is ready with its first sentence, once', () => {
    const t = streamed().at(-1) as Turn
    const done = { ...t, status: 'done' as const }
    expect(announcement(t, done, plain)).toBe('Answer ready. Voluntary attrition is 18.8% in Bengaluru.')
    expect(announcement(done, { ...done }, plain)).toBeNull()
    expect(announcement(t, { ...t, status: 'stopped' }, plain)).toBe('Stopped.')
    expect(
      announcement(
        t,
        {
          ...t,
          status: 'error',
          error: { kind: 'offline', title: 'You are offline.', detail: 'Ask again later.', action: 'retry' },
        },
        plain,
      ),
    ).toBe('You are offline. Ask again later.')
  })

  it('reads the answer after the last tool round, and says when it was cut off', () => {
    let t = newTurn(3, 'q', 'claude-opus-5-5')
    t = applyEvent(t, { type: 'text', delta: 'I will look at People stats for Bengaluru.' })
    t = applyEvent(t, { type: 'tool_start', id: 'a', name: 'view_summary', label: 'Calculating', round: 1 })
    t = applyEvent(t, { type: 'text', delta: '\n\nVoluntary attrition is 18.8% in Bengaluru.' })
    expect(finalText(t).trim()).toBe('Voluntary attrition is 18.8% in Bengaluru.')
    expect(finalText({ text: 'Only a preamble.', answerFrom: 16 })).toBe('Only a preamble.')
    const plain = () => firstWords(finalText(t))
    expect(announcement(t, { ...t, status: 'done' }, plain)).toBe(
      'Answer ready. Voluntary attrition is 18.8% in Bengaluru.',
    )
    expect(announcement(t, { ...t, status: 'done', truncated: true }, plain)).toBe(
      'Answer cut off at its length limit. Voluntary attrition is 18.8% in Bengaluru.',
    )
  })

  it('reads the first words without list marks, cut at a word', () => {
    expect(firstWords('- Voluntary attrition is 9.4%, within target.\n- Regretted is 4.8%.')).toBe(
      'Voluntary attrition is 9.4%, within target.',
    )
    expect(firstWords('1. First point here, long enough. 2. Second.')).toBe('First point here, long enough.')
    const long = `${'word '.repeat(100)}end.`
    const cut = firstWords(long, 60)
    expect(cut.length).toBeLessThanOrEqual(61)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut).not.toMatch(/wor…$/)
    expect(firstWords('')).toBe('')
  })
})

describe('what was sent', () => {
  it('lists each call with its exact result laid out, its size and time', () => {
    const [c] = sentCalls(
      [
        call('a', 'Counting requisitions by recruiter for {{P2}}', {
          result: '{"rows":[{"count":3}]}',
          ms: 0.3,
        }),
      ],
      person,
    )
    expect(c?.label).toBe('Counting requisitions by recruiter for Ravi Menon')
    expect(c?.result).toBe('{\n  "rows": [\n    {\n      "count": 3\n    }\n  ]\n}')
    expect(c?.input).toContain('"view": "hrbp"')
    expect(c?.ms).toBe('under 1 ms')
    expect(c?.size).toBe('22 bytes')
    expect(readableJson('not json')).toBe('not json')
    expect(sizeText('x'.repeat(4200))).toBe('4.2 KB')
  })

  it('states the tokens used and the requests made', () => {
    expect(
      usageLine({ input: 1240, output: 320, cacheRead: 2100, cacheWrite: 0, requests: 3 }, 'claude-opus-5-5'),
    ).toBe('1,240 input tokens and 320 output tokens, 2,100 read from cache. 3 requests to Claude Opus 5.5.')
    expect(usageLine({ ...NO_USAGE, input: 10, output: 2, requests: 1 }, 'claude-haiku-4-5-20251001')).toBe(
      '10 input tokens and 2 output tokens. 1 request to Claude Haiku 4.5.',
    )
    expect(usageLine(NO_USAGE, 'claude-opus-5-5')).toBe('No request reached Claude Opus 5.5.')
    expect(
      usageLine({ ...NO_USAGE, input: 100, output: 1, requests: 1, partial: true }, 'claude-opus-5-5'),
    ).toBe(
      '100 input tokens and 1 output token. 1 request to Claude Opus 5.5. A request that was stopped or failed is counted as far as it got.',
    )
  })
})

describe('answer tables', () => {
  it('infer one format per column, and leave mixed or unknown values as text', () => {
    expect(inferFormat(['12.4%', '3.0%', '—'])).toBe('pct')
    expect(inferFormat(['12%', '3%'])).toBe('pct0')
    expect(inferFormat(['1,284', '57', '−3'])).toBe('int')
    expect(inferFormat(['4.2', '1'])).toBe('num1')
    expect(inferFormat(['0.98', '1.02'])).toBe('num2')
    expect(inferFormat(['12%', '3'])).toBeNull()
    expect(inferFormat(['—', ''])).toBeNull()
  })

  it('read Census units and signs as numbers, so change and duration columns sort by value', () => {
    expect(inferFormat(['+9.4 pts', '−5.1 pts', '+2.2 pts', '−1.5 pts', '0.0 pts'])).toBe('pts')
    expect(inferFormat(['+0.81 pts', '−0.4 pts'])).toBe('pts2')
    expect(inferFormat(['52 d', '7.5 d', '—'])).toBe('days')
    expect(inferFormat(['+4 d', '−1 d', '±0 d'])).toBe('deltaDays')
    expect(inferFormat(['4.2 yrs', '3.0 yrs'])).toBe('years')
    expect(inferFormat(['6.5 h', '12 h'])).toBe('hours')
    expect(inferFormat(['1.58×', '0.92×'])).toBe('times')
    expect(inferFormat(['+103%', '−47.6%'])).toBe('deltaPct')
    // Mixed units, a plus a Census format would not show, or a positive change without its plus.
    expect(inferFormat(['52 d', '4.2 yrs'])).toBeNull()
    expect(inferFormat(['+12', '−3'])).toBeNull()
    expect(inferFormat(['9.4 pts', '3.1 pts'])).toBeNull()
    expect(inferFormat(['+4 d', '52 d'])).toBeNull()
    // Bare years are labels, not counts ("2,026").
    expect(inferFormat(['2025', '2026'])).toBeNull()
    expect(inferFormat(['2,025', '57'])).toBe('int')
    expect(cellValue('+9.4 pts', 'pts')).toBeCloseTo(0.094, 10)
    expect(cellValue('−5.1 pts', 'pts')).toBeCloseTo(-0.051, 10)
    expect(cellValue('18.8%', 'pct')).toBeCloseTo(0.188, 10)
    expect(cellValue('52 d', 'days')).toBe(52)
    expect(cellValue('±0 d', 'deltaDays')).toBe(0)
    expect(cellValue('—', 'days')).toBeNull()
  })

  it('carry a change column as signed numbers that sort in order', () => {
    const blocks = parseAnswer(
      '| Location | Change |\n|---|---:|\n| Austin | +2.2 pts |\n| Bengaluru | +9.4 pts |\n| Dresden | −1.5 pts |\n| Hsinchu | −5.1 pts |\n| Penang | — |',
    )
    const m = answerTable(blocks[0] as Extract<Block, { type: 'table' }>, person)
    expect(m.columns.map((c) => c.format)).toEqual(['text', 'pts'])
    const sorted = m.rows
      .filter((r) => typeof r.c1 === 'number')
      .sort((a, b) => (a.c1 as number) - (b.c1 as number))
      .map((r) => r.c0)
    expect(sorted).toEqual(['Hsinchu', 'Dresden', 'Austin', 'Bengaluru'])
    expect(m.rows[4]?.c1).toBeNull()
  })

  it('carry numbers, names, the ref behind each cell and the person in each row', () => {
    const blocks = parseAnswer(
      '| Recruiter | Open reqs | Share |\n|---|---:|---:|\n| {{P1}} | [29](ref:r17) | 25.4% |\n| {{P9}} | [20](ref:r18) | — |\n| Agency | 3 | 2.6% |',
    )
    const table = blocks[0] as Extract<Block, { type: 'table' }>
    const m = answerTable(table, person)
    expect(m.columns.map((c) => [c.label, c.format])).toEqual([
      ['Recruiter', 'text'],
      ['Open reqs', 'int'],
      ['Share', 'pct'],
    ])
    expect(m.rows.map((r) => [r.c0, r.c1])).toEqual([
      ['Ana Diaz', 29],
      ['someone', 20],
      ['Agency', 3],
    ])
    expect(m.rows[0]?.c2).toBeCloseTo(0.254, 10)
    expect(m.rows[1]?.c2).toBeNull()
    expect(m.rows[2]?.c2).toBeCloseTo(0.026, 10)
    expect(m.rows[0]?.[REF_KEY]).toEqual({ c1: 'r17' })
    expect(m.rows[1]?.[REF_KEY]).toEqual({ c1: 'r18' })
    expect(m.rows[2]?.[REF_KEY]).toEqual({})
    expect(m.rows.map((r) => r[PERSON_KEY])).toEqual(['P1', 'P9', null])
  })
})

describe('record links', () => {
  it('name the number with the bold label it sits under, and a phrase as records', () => {
    expect(refLabel('52 d', null)).toBe('Show the records behind 52 d')
    expect(refLabel('18.8%', 'Bengaluru')).toBe('Bengaluru: show the records behind 18.8%')
    expect(refLabel('See the 42 people', 'Bengaluru')).toBe('Records: See the 42 people')
    expect(refLabel('−5.1 pts', null)).toBe('Show the records behind −5.1 pts')
    expect(refLabel('18.8%', '18.8% voluntary')).toBe('Show the records behind 18.8%')
    const lead = (text: string) => {
      const b = parseAnswer(text)[0] as Extract<Block, { type: 'list' }>
      return leadOf(b.items[0]?.children ?? [], person)
    }
    expect(lead('- **Time to fill**: [52 d](ref:r1)')).toBe('Time to fill')
    expect(lead('- **[52 d](ref:r1)** time to fill')).toBeNull()
    expect(lead('- Time to fill is **52 d**')).toBeNull()
  })
})

describe('the scope an answer was calculated for', () => {
  const asked: AskedScope = askedScope({
    scopeLabel: 'Whole company',
    filters: {
      period: 't12m',
      customStart: null,
      customEnd: null,
      leaderId: null,
      businessUnit: [],
      department: [],
      location: [],
      level: [],
    } as unknown as AskedScopeFilters,
    window: { start: '2025-10-01', end: '2026-09-30', months: 12, label: '1 Oct 2025 – 30 Sep 2026' },
    asOf: '2026-09-30',
    standard: 'bronze',
    isSample: true,
  })
  const result = (
    scope: string,
    filters: Record<string, unknown>,
    start = '2025-10-01',
    end = '2026-09-30',
  ) =>
    JSON.stringify({
      scope,
      filters: { leader: null, business_unit: [], department: [], location: [], level: [], ...filters },
      period: { preset: 't12m', label: 'Last 12 months', start, end },
    })
  const at = (id: string, r: string) => ({ ...call(id, 'x'), result: r })
  const people = (t: string) =>
    t.replace(/[{}]/g, '') === 'P3' ? { name: 'Mei Lin', employeeId: 'E0003' } : null

  it('stamps the asked scope when every tool used it', () => {
    const s = exportScope(
      asked,
      [at('a', result('Whole company', {})), at('b', '{"metrics":[]}')],
      [],
      people,
    )
    expect(s).toEqual({
      scope: 'Whole company',
      window: '1 Oct 2025 – 30 Sep 2026',
      asOf: '2026-09-30',
      standard: 'bronze',
      isSample: true,
    })
    expect(exportScope(asked, [], [], people).scope).toBe('Whole company')
  })

  it('stamps the one other scope the tools used, with names', () => {
    const s = exportScope(asked, [at('a', result('Bengaluru', { location: ['Bengaluru'] }))], [], people)
    expect(s.scope).toBe('Bengaluru')
    expect(s.window).toBe('1 Oct 2025 – 30 Sep 2026')
    const lead = exportScope(
      asked,
      [at('a', result("{{P3}}'s org", { leader: '{{P3}}' }, '2026-01-01'))],
      [],
      people,
    )
    expect(lead.scope).toBe("Mei Lin's org")
    expect(lead.window).toBe('1 Jan 2026 – 30 Sep 2026')
  })

  it('leaves out the scope and period when the tools used different ones', () => {
    const s = exportScope(
      asked,
      [at('a', result('Whole company', {})), at('b', result('Bengaluru', { location: ['Bengaluru'] }))],
      [],
      people,
    )
    expect(s.scope).toBe(MIXED_SCOPE)
    expect(s.window).toBe('')
    expect(s.asOf).toBe('2026-09-30')
  })

  it('goes by the earlier calls when the answer ran none', () => {
    const earlier = [at('a', result('Bengaluru', { location: ['Bengaluru'] }))]
    expect(exportScope(asked, [], earlier, people).scope).toBe('Bengaluru')
    // A call that failed computed nothing.
    expect(
      exportScope(asked, [{ ...at('a', result('Bengaluru', {})), isError: true }], [], people).scope,
    ).toBe('Whole company')
  })

  it('is recorded on the turn when the question is asked', () => {
    expect(newTurn(2, 'q', 'claude-opus-5-5', asked).asked).toBe(asked)
    expect(newTurn(2, 'q', 'claude-opus-5-5').asked).toBeNull()
  })
})

describe('Settings wording for errors', () => {
  it('does not send the reader to the page they are on', () => {
    expect(settingsErrorDetail({ kind: 'key', detail: 'Check the key in Settings, Ask Census.' })).toBe(
      'Check the key, or create a new one in the Claude Console.',
    )
    expect(settingsErrorDetail({ kind: 'model', detail: 'x' })).toBe('Pick another model below.')
    expect(settingsErrorDetail({ kind: 'offline', detail: 'Ask again later.' })).toBe('Ask again later.')
  })
})

describe('view links', () => {
  const tabs = new Map([['hrbp', ['overview', 'attrition']]])
  const dataTab = (t: string) => t === 'quality'
  it('go only to pages and tabs that exist', () => {
    expect(routeExists('hrbp', null, tabs, dataTab)).toBe(true)
    expect(routeExists('hrbp', 'attrition', tabs, dataTab)).toBe(true)
    expect(routeExists('hrbp', 'payroll', tabs, dataTab)).toBe(false)
    expect(routeExists('comp', null, tabs, dataTab)).toBe(false)
    expect(routeExists('data', 'quality', tabs, dataTab)).toBe(true)
    expect(routeExists('data', 'nope', tabs, dataTab)).toBe(false)
    expect(routeExists('actions', null, tabs, dataTab)).toBe(true)
    expect(routeExists('actions', 'open', tabs, dataTab)).toBe(true)
    expect(routeExists('actions', 'later', tabs, dataTab)).toBe(false)
  })
})

describe('keys', () => {
  const k = (key: string, mods: Partial<KeyboardEvent> = {}) =>
    ({
      key,
      code: '',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...mods,
    }) as KeyboardEvent

  it('Alt+A opens Ask, also as Option+A on a Mac, and nothing else does', () => {
    expect(isAskShortcut(k('a', { altKey: true, code: 'KeyA' }))).toBe(true)
    expect(isAskShortcut(k('å', { altKey: true, code: 'KeyA' }))).toBe(true)
    expect(isAskShortcut(k('a', { altKey: true }))).toBe(true)
    expect(isAskShortcut(k('a', { code: 'KeyA' }))).toBe(false)
    expect(isAskShortcut(k('A', { altKey: true, shiftKey: true, code: 'KeyA' }))).toBe(false)
    // AltGr on Windows is Ctrl+Alt: left to type its own characters.
    expect(isAskShortcut(k('ą', { altKey: true, ctrlKey: true, code: 'KeyA' }))).toBe(false)
    expect(isAskShortcut(k('a', { metaKey: true, altKey: true, code: 'KeyA' }))).toBe(false)
    // The keys Census already binds are not it.
    for (const key of ['?', '/', 'Escape', '+', '-', 'z', 'y'])
      expect(isAskShortcut(k(key, { ctrlKey: key === 'z' || key === 'y' }))).toBe(false)
  })

  it('Enter asks; Shift+Enter, Alt+Enter and Enter while composing do not', () => {
    const e = (mods: Partial<KeyboardEvent> = {}) =>
      ({
        key: 'Enter',
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        isComposing: false,
        ...mods,
      }) as KeyboardEvent
    expect(composerKey(e())).toBe('send')
    expect(composerKey(e({ ctrlKey: true }))).toBe('send')
    expect(composerKey(e({ shiftKey: true }))).toBeNull()
    expect(composerKey(e({ altKey: true }))).toBeNull()
    expect(composerKey(e({ isComposing: true }))).toBeNull()
    expect(composerKey({ ...e(), key: 'a' })).toBeNull()
  })

  it('Settings says where the key is kept, masked', () => {
    const mask = (s: string) => `${s.slice(0, 7)}…${s.slice(-4)}`
    expect(keyLine(null, mask)).toBe('No key yet. Nothing is sent until you add one.')
    expect(keyLine({ key: 'sk-ant-test-fake-0000', kept: false }, mask)).toBe(
      'Using sk-ant-…0000, kept for this tab only.',
    )
    expect(keyLine({ key: 'sk-ant-test-fake-0000', kept: true }, mask)).toBe(
      'Using sk-ant-…0000, kept on this device until you forget it.',
    )
  })
})
