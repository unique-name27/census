/**
 * Answer rendering: links (ref, view, metric), person tokens, tables, unknown markers and the
 * absence of any HTML node.
 */
import { describe, expect, it } from 'vitest'
import {
  answerText,
  type Block,
  cellNumber,
  codeText,
  type Inline,
  parseAnswer,
  parseInline,
  tableData,
} from './markers'

const people: Record<string, string> = { P1: 'Lena Ortiz', P2: 'Sam Lee' }
const person = (t: string) => (people[t] ? { name: people[t] as string } : null)
const check = {
  isRef: (r: string) => r === 'r1' || r === 'r2',
  isView: (v: string, tab: string | null) => v === 'hrbp' && (tab == null || tab === 'attrition'),
  isMetric: (m: string) => m === 'hrbp.attrition.voluntary',
}

/** Every node type in a tree, for the no-HTML check. */
function types(blocks: readonly Block[]): Set<string> {
  const out = new Set<string>()
  const walk = (ns: readonly Inline[]) => {
    for (const n of ns) {
      out.add(n.type)
      if ('children' in n) walk(n.children)
    }
  }
  for (const b of blocks) {
    out.add(b.type)
    if (b.type === 'paragraph' || b.type === 'heading') walk(b.children)
    if (b.type === 'list') for (const it of b.items) walk(it.children)
    if (b.type === 'table') for (const r of [b.header, ...b.rows]) for (const c of r) walk(c)
  }
  return out
}

describe('parseInline', () => {
  it('reads ref, view and metric links with their labels', () => {
    expect(
      parseInline(
        '[42 leavers](ref:r1) in [People stats, Attrition](view:hrbp.attrition), see [Voluntary attrition](metric:hrbp.attrition.voluntary).',
        check,
      ),
    ).toEqual([
      { type: 'ref', ref: 'r1', children: [{ type: 'text', text: '42 leavers' }] },
      { type: 'text', text: ' in ' },
      {
        type: 'view',
        view: 'hrbp',
        tab: 'attrition',
        children: [{ type: 'text', text: 'People stats, Attrition' }],
      },
      { type: 'text', text: ', see ' },
      {
        type: 'metric',
        metric: 'hrbp.attrition.voluntary',
        children: [{ type: 'text', text: 'Voluntary attrition' }],
      },
      { type: 'text', text: '.' },
    ])
  })

  it('turns unknown refs, views and metrics, and web links, into plain text', () => {
    const nodes = parseInline(
      '[9 people](ref:r99) and [x](view:hrbp.nope) and [y](view:nowhere) and [z](metric:made.up) and [site](https://example.com)',
      check,
    )
    expect(nodes).toEqual([{ type: 'text', text: '9 people and x and y and z and site' }])
  })

  it('reads person tokens, and garbled ones as someone', () => {
    expect(parseInline("{{P1}}'s team and {{P2}}")).toEqual([
      { type: 'person', token: 'P1' },
      { type: 'text', text: "'s team and " },
      { type: 'person', token: 'P2' },
    ])
    for (const bad of ['{P3}', '{{p3}}', '{{P3}', '{{ P3 }}'])
      expect(parseInline(bad), bad).toEqual([{ type: 'person', token: null }])
    expect(parseInline('[{{P1}} has 4 items](ref:r2)', check)).toEqual([
      {
        type: 'ref',
        ref: 'r2',
        children: [
          { type: 'person', token: 'P1' },
          { type: 'text', text: ' has 4 items' },
        ],
      },
    ])
  })

  it('reads bold, italics and code, and leaves snake_case and HTML as text', () => {
    expect(parseInline('**9.4%** is *below* target, `code` and mean_tenure_years <b>x</b>')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: '9.4%' }] },
      { type: 'text', text: ' is ' },
      { type: 'em', children: [{ type: 'text', text: 'below' }] },
      { type: 'text', text: ' target, ' },
      { type: 'code', text: 'code' },
      { type: 'text', text: ' and mean_tenure_years <b>x</b>' },
    ])
  })
})

describe('parseAnswer', () => {
  const text = [
    '## Attrition',
    '',
    'Voluntary attrition is [9.4%](ref:r1).',
    'It rose 0.7 pts.',
    '',
    '- Bengaluru is highest',
    '- {{P1}} has the most regretted exits',
    '  across two teams',
    '',
    '1. First',
    '2. Second',
    '',
    '| Location | Rate | Leavers |',
    '|:--|--:|--:|',
    '| Bengaluru | 18.8% | [57](ref:r2) |',
    '| Austin | — | 13 |',
    '',
    '---',
    '<script>alert(1)</script>',
  ].join('\n')
  const blocks = parseAnswer(text, check)

  it('reads headings, paragraphs with line breaks, lists, tables and rules', () => {
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'table',
      'rule',
      'paragraph',
    ])
    const p = blocks[1] as Extract<Block, { type: 'paragraph' }>
    expect(p.children.map((n) => n.type)).toEqual(['text', 'ref', 'text', 'break', 'text'])
    const ul = blocks[2] as Extract<Block, { type: 'list' }>
    expect(ul.ordered).toBe(false)
    expect(ul.items).toHaveLength(2)
    expect(ul.items[1]?.children.map((n) => n.type)).toEqual(['person', 'text', 'break', 'text'])
    const ol = blocks[3] as Extract<Block, { type: 'list' }>
    expect(ol).toMatchObject({ ordered: true, start: 1 })
    const t = blocks[4] as Extract<Block, { type: 'table' }>
    expect(t.align).toEqual(['left', 'right', 'right'])
    expect(t.rows).toHaveLength(2)
    expect(t.rows[0]?.[2]).toEqual([{ type: 'ref', ref: 'r2', children: [{ type: 'text', text: '57' }] }])
  })

  it('has no HTML node anywhere: tags stay text', () => {
    const all = types(blocks)
    for (const t of all)
      expect([
        'heading',
        'paragraph',
        'list',
        'table',
        'rule',
        'code',
        'text',
        'ref',
        'view',
        'metric',
        'person',
        'break',
        'strong',
        'em',
      ]).toContain(t)
    const last = blocks.at(-1) as Extract<Block, { type: 'paragraph' }>
    expect(last.children).toEqual([{ type: 'text', text: '<script>alert(1)</script>' }])
  })

  it('copies the answer as text with names', () => {
    const copy = answerText(blocks, person)
    expect(copy).toContain('Voluntary attrition is 9.4%.\nIt rose 0.7 pts.')
    expect(copy).toContain('- Lena Ortiz has the most regretted exits\nacross two teams')
    expect(copy).toContain('Location\tRate\tLeavers\nBengaluru\t18.8%\t57')
    expect(answerText(parseAnswer('{{P9}} and {P1}'), person)).toBe('someone and someone')
  })

  it('turns a table into rows for the data table and downloads', () => {
    const t = blocks[4] as Extract<Block, { type: 'table' }>
    const data = tableData(t, person)
    expect(data.columns).toEqual([
      { key: 'c0', label: 'Location', numeric: false },
      { key: 'c1', label: 'Rate', numeric: true },
      { key: 'c2', label: 'Leavers', numeric: true },
    ])
    expect(data.rows).toEqual([
      { c0: 'Bengaluru', c1: 0.188, c2: 57 },
      { c0: 'Austin', c1: null, c2: 13 },
    ])
    expect(cellNumber('1,284')).toBe(1284)
    expect(cellNumber('−3.5')).toBe(-3.5)
    expect(cellNumber('12 d')).toBeNull()
  })

  it('shows names for person tokens inside code, on screen and in Copy answer', () => {
    const blocks = parseAnswer('Run `{{P1}}` here.\n\n```\nlead: {{P2}}\nother: {{P9}}\n```', check)
    expect(answerText(blocks, person)).toBe('Run Lena Ortiz here.\n\nlead: Sam Lee\nother: someone')
    expect(codeText('{{P1}} and {{P2}}', person)).toBe('Lena Ortiz and Sam Lee')
  })

  it('keeps a row’s extra cells, linked numbers included, by widening the header', () => {
    const [t] = parseAnswer('| A | B |\n|---|---|\n| x | y | [9](ref:r1) |', check) as [
      Extract<Block, { type: 'table' }>,
    ]
    expect(t.header).toHaveLength(3)
    expect(t.align).toHaveLength(3)
    expect(t.rows[0]?.[2]).toEqual([{ type: 'ref', ref: 'r1', children: [{ type: 'text', text: '9' }] }])
    expect(tableData(t, person).columns.map((c) => c.label)).toEqual(['A', 'B', 'Column 3'])
  })

  it('needs a separator row with one cell per header cell for a table', () => {
    const blocks = parseAnswer('Pay | grade\n---\nNext.', check)
    expect(blocks.map((b) => b.type)).not.toContain('table')
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'rule', 'paragraph'])
  })

  it('starts a new list when the kind changes at the top level', () => {
    const blocks = parseAnswer('1. one\n2. two\n- bullet\n  1. nested', check)
    expect(blocks.map((b) => (b.type === 'list' ? `${b.ordered}:${b.items.length}` : b.type))).toEqual([
      'true:2',
      'false:2',
    ])
  })

  it('drops links with an empty label, and reads parentheses inside a target', () => {
    expect(parseInline('Total [](ref:r1) here', check)).toEqual([{ type: 'text', text: 'Total  here' }])
    expect(parseInline('[js](javascript:alert(1)) done', check)).toEqual([{ type: 'text', text: 'js done' }])
    expect(parseInline('[a (b)](ref:r1)', check)).toEqual([
      { type: 'ref', ref: 'r1', children: [{ type: 'text', text: 'a (b)' }] },
    ])
  })

  it('parses a partial answer while it streams', () => {
    expect(() => parseAnswer('Voluntary attrition is [9.4%](ref:r')).not.toThrow()
    expect(parseAnswer('| a | b |\n|--')).toHaveLength(1)
    expect(parseAnswer('')).toEqual([])
    expect(parseAnswer('```\ncode')).toEqual([{ type: 'code', text: 'code' }])
  })
})
