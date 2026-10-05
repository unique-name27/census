/**
 * Claude's answer as a typed tree the UI renders (docs/ASK.md, Record refs): a small Markdown
 * subset (paragraphs, headings, lists, tables, rules, code, bold, italics) plus Census's own
 * markers:
 *
 *  - `[42 leavers](ref:r7)`: a number linked to its records (opens the drill panel);
 *  - `[People stats, Attrition](view:hrbp.attrition)`: a view and tab;
 *  - `[Voluntary attrition](metric:hrbp.attrition.voluntary)`: a metric definition;
 *  - `{{P12}}`: a person, rehydrated locally from the conversation's tokens.
 *
 * There is no HTML node: anything that looks like HTML stays text (React escapes it). A link to
 * anything else (a web address, an unknown ref, view or metric) becomes its label as plain text,
 * and a garbled person token (`{P12}`, `{{p12}}`) becomes a person with no token, shown as
 * "someone".
 */
import { VIEW_KEYS } from '@/data/schema'
import type { RouteView } from '@/data/store'
import type { PersonInfo } from './types'

/** Every page a view link may open: the folder tabs, the Data room and the Action center. */
const ROUTES: readonly string[] = [...VIEW_KEYS, 'data', 'actions']

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'ref'; ref: string; children: Inline[] }
  | { type: 'view'; view: RouteView; tab: string | null; children: Inline[] }
  | { type: 'metric'; metric: string; children: Inline[] }
  /** A person token ('P12'); null when Claude garbled it (shown as "someone"). */
  | { type: 'person'; token: string | null }
  | { type: 'break' }

export type Align = 'left' | 'right' | 'center' | null

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: { depth: number; children: Inline[] }[] }
  | { type: 'table'; header: Inline[][]; align: Align[]; rows: Inline[][][] }
  | { type: 'code'; text: string }
  | { type: 'rule' }

/** Which markers are real; a marker that fails becomes plain text. Leave one out to accept any. */
export interface MarkerCheck {
  isRef?: (ref: string) => boolean
  isView?: (view: RouteView, tab: string | null) => boolean
  isMetric?: (metric: string) => boolean
}

/* ───────────── inline ───────────── */

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|>~<]/
/** A person token, well formed or not, at the start of the text. */
const PERSON_AT = /^\{{1,3}\s*[Pp]\s*(\d{1,6})\s*\}{1,3}/
const CANONICAL = /^\{\{P\d{1,6}\}\}$/

function pushText(out: Inline[], text: string): void {
  const last = out[out.length - 1]
  if (last?.type === 'text') last.text += text
  else out.push({ type: 'text', text })
}

/** Index of the `]` closing the `[` at `open`, or -1. */
function closeBracket(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (c === '\\') {
      i++
      continue
    }
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Whether a link label shows anything (an empty one would be an empty focusable control). */
function hasLabel(nodes: readonly Inline[]): boolean {
  return nodes.some((n) =>
    n.type === 'text' || n.type === 'code'
      ? n.text.trim() !== ''
      : n.type === 'person'
        ? true
        : n.type === 'break'
          ? false
          : hasLabel(n.children),
  )
}

/** Index of the `)` closing the `(` at `open`, counting nested parentheses, or -1. */
function closeParen(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (c === '\\') {
      i++
      continue
    }
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function linkNode(target: string, children: Inline[], check: MarkerCheck): Inline[] {
  // A link with nothing to click on is dropped, so no empty control is focusable.
  if (!hasLabel(children)) return []
  const t = target.trim().split(/\s+/)[0] ?? ''
  let m = /^ref:(r[1-9]\d*)$/.exec(t)
  if (m) {
    const ref = m[1] as string
    return !check.isRef || check.isRef(ref) ? [{ type: 'ref', ref, children }] : children
  }
  m = /^view:([a-z]+)(?:\.([a-z0-9-]+))?$/.exec(t)
  if (m && ROUTES.includes(m[1] as string)) {
    const view = m[1] as RouteView
    const tab = m[2] ?? null
    return !check.isView || check.isView(view, tab) ? [{ type: 'view', view, tab, children }] : children
  }
  m = /^metric:([A-Za-z0-9_.-]+)$/.exec(t)
  if (m) {
    const metric = m[1] as string
    return !check.isMetric || check.isMetric(metric) ? [{ type: 'metric', metric, children }] : children
  }
  // Web addresses and anything else: the label only.
  return children
}

/** Emphasis delimiter run at i: '*', '**', '_' or '__' (underscores only between non-letters). */
function emphasisAt(s: string, i: number): { run: string; end: number } | null {
  const c = s[i]
  if (c !== '*' && c !== '_') return null
  const run = s[i + 1] === c ? c + c : c
  const after = s[i + run.length]
  if (!after || /\s/.test(after)) return null
  if (c === '_' && i > 0 && /[\p{L}\p{N}]/u.test(s[i - 1] as string)) return null
  // Find the closing run: same delimiter, not preceded by space.
  let j = i + run.length
  while (j < s.length) {
    const k = s.indexOf(run, j)
    if (k < 0) return null
    const before = s[k - 1]
    const next = s[k + run.length]
    const okClose =
      before &&
      !/\s/.test(before) &&
      (c !== '_' || !next || !/[\p{L}\p{N}]/u.test(next)) &&
      !(run === c && next === c)
    if (okClose && k > i + run.length) return { run, end: k }
    j = k + 1
  }
  return null
}

export function parseInline(s: string, check: MarkerCheck = {}, inLink = false): Inline[] {
  const out: Inline[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i] as string
    if (c === '\\' && i + 1 < s.length && ESCAPABLE.test(s[i + 1] as string)) {
      pushText(out, s[i + 1] as string)
      i += 2
      continue
    }
    if (c === '`') {
      const j = s.indexOf('`', i + 1)
      if (j > i + 1) {
        out.push({ type: 'code', text: s.slice(i + 1, j) })
        i = j + 1
        continue
      }
    }
    if (c === '{') {
      const m = PERSON_AT.exec(s.slice(i))
      if (m) {
        out.push({ type: 'person', token: CANONICAL.test(m[0]) ? `P${m[1]}` : null })
        i += m[0].length
        continue
      }
    }
    if (c === '[' && !inLink) {
      const close = closeBracket(s, i)
      if (close > i && s[close + 1] === '(') {
        const end = closeParen(s, close + 1)
        if (end > close) {
          const children = parseInline(s.slice(i + 1, close), check, true)
          for (const n of linkNode(s.slice(close + 2, end), children, check))
            n.type === 'text' ? pushText(out, n.text) : out.push(n)
          i = end + 1
          continue
        }
      }
    }
    const em = emphasisAt(s, i)
    if (em) {
      const children = parseInline(s.slice(i + em.run.length, em.end), check, inLink)
      out.push(em.run.length === 2 ? { type: 'strong', children } : { type: 'em', children })
      i = em.end + em.run.length
      continue
    }
    pushText(out, c)
    i++
  }
  return out
}

/* ───────────── blocks ───────────── */

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const BULLET = /^(\s*)[-*+]\s+(.*)$/
const NUMBERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/
const FENCE = /^\s*(```|~~~)/
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/

function splitRow(line: string): string[] {
  let t = line.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  let code = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (c === '\\' && t[i + 1] === '|') {
      cur += '|'
      i++
    } else if (c === '`') {
      code = !code
      cur += c
    } else if (c === '|' && !code) {
      cells.push(cur.trim())
      cur = ''
    } else cur += c
  }
  cells.push(cur.trim())
  return cells
}

const alignOf = (cell: string): Align => {
  const c = cell.trim()
  const l = c.startsWith(':')
  const r = c.endsWith(':')
  return l && r ? 'center' : r ? 'right' : l ? 'left' : null
}

/** Lines joined into one paragraph: a single line break inside an answer is kept. */
function paragraph(lines: readonly string[], check: MarkerCheck): Inline[] {
  const out: Inline[] = []
  lines.forEach((l, i) => {
    if (i > 0) out.push({ type: 'break' })
    for (const n of parseInline(l.trim(), check)) n.type === 'text' ? pushText(out, n.text) : out.push(n)
  })
  return out
}

/** Parse an answer (as streamed so far, or complete) into blocks. Never throws. */
export function parseAnswer(text: string, check: MarkerCheck = {}): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', children: paragraph(para, check) })
    para = []
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i] as string
    if (!line.trim()) {
      flush()
      i++
      continue
    }
    if (FENCE.test(line)) {
      flush()
      const fence = (FENCE.exec(line) as RegExpExecArray)[1] as string
      const body: string[] = []
      i++
      while (i < lines.length && !(lines[i] as string).trim().startsWith(fence))
        body.push(lines[i++] as string)
      i++
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }
    const h = HEADING.exec(line)
    if (h) {
      flush()
      const level = Math.min(3, (h[1] as string).length) as 1 | 2 | 3
      blocks.push({ type: 'heading', level, children: parseInline(h[2] as string, check) })
      i++
      continue
    }
    if (RULE.test(line)) {
      flush()
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      TABLE_SEP.test(lines[i + 1] as string) &&
      (lines[i + 1] as string).includes('-') &&
      // As in GitHub Markdown, the separator row has one cell per header cell; "a | b" over a
      // lone "---" is a paragraph and a rule, not an empty table.
      splitRow(lines[i + 1] as string).length === splitRow(line).length
    ) {
      flush()
      const header = splitRow(line)
      const align = splitRow(lines[i + 1] as string).map(alignOf)
      const cellRows: string[][] = []
      i += 2
      while (i < lines.length && (lines[i] as string).trim() && (lines[i] as string).includes('|')) {
        cellRows.push(splitRow(lines[i] as string))
        i++
      }
      // A row with more cells than the header keeps them: the header widens with blank labels.
      const width = Math.max(header.length, ...cellRows.map((r) => r.length))
      const cols = Array.from({ length: width }, (_, k) => k)
      blocks.push({
        type: 'table',
        header: cols.map((k) => parseInline(header[k] ?? '', check)),
        align: cols.map((k) => align[k] ?? null),
        rows: cellRows.map((cells) => cols.map((k) => parseInline(cells[k] ?? '', check))),
      })
      continue
    }
    const b = BULLET.exec(line)
    const n = NUMBERED.exec(line)
    if (b || n) {
      flush()
      const ordered = !b
      const start = n ? Number(n[2]) : 1
      const items: { depth: number; children: Inline[] }[] = []
      while (i < lines.length) {
        const l = lines[i] as string
        const mb = BULLET.exec(l)
        const mn = NUMBERED.exec(l)
        const m = ordered ? (mn ?? mb) : (mb ?? mn)
        // At the top level only items of the list's own kind continue it; a bullet after a
        // numbered list (or a number after bullets) starts a new list. Nested items may be either.
        const top = m != null && (m[1] as string).replace(/\t/g, '  ').length < 2
        if (m && top && (ordered ? !mn : !mb)) break
        if (m) {
          const indent = (m[1] as string).replace(/\t/g, '  ').length
          const body = (mn && m === mn ? mn[3] : (m[2] as string)) as string
          items.push({ depth: Math.min(2, Math.floor(indent / 2)), children: parseInline(body, check) })
          i++
        } else if (l.trim() && /^\s{2,}/.test(l) && items.length) {
          // A continuation line of the item above.
          const last = items[items.length - 1] as { children: Inline[] }
          last.children.push({ type: 'break' })
          for (const x of parseInline(l.trim(), check))
            x.type === 'text' ? pushText(last.children, x.text) : last.children.push(x)
          i++
        } else break
      }
      blocks.push({ type: 'list', ordered, start, items })
      continue
    }
    para.push(line.replace(/^\s*>\s?/, ''))
    i++
  }
  flush()
  return blocks
}

/* ───────────── plain text, for Copy answer and tables ───────────── */

/** A person as text: the name, or "someone" for a token this conversation never handed out. */
export type PersonLookup = (token: string) => Pick<PersonInfo, 'name'> | null

export const SOMEONE = 'someone'

/**
 * Code as shown and copied: person tokens Claude put inside code become names (or "someone"),
 * like tokens anywhere else in the answer; the rest of the code stays as written.
 */
export function codeText(text: string, person: PersonLookup): string {
  return text.replace(/\{\{P\d{1,6}\}\}/g, (t) => person(t.slice(2, -2))?.name || SOMEONE)
}

export function inlineText(nodes: readonly Inline[], person: PersonLookup): string {
  let s = ''
  for (const n of nodes) {
    switch (n.type) {
      case 'text':
        s += n.text
        break
      case 'code':
        s += codeText(n.text, person)
        break
      case 'person':
        s += (n.token && person(n.token)?.name) || SOMEONE
        break
      case 'break':
        s += '\n'
        break
      default:
        s += inlineText(n.children, person)
    }
  }
  return s
}

/** The whole answer as plain text with names (Copy answer: the copy stays on this computer). */
export function answerText(blocks: readonly Block[], person: PersonLookup): string {
  const parts: string[] = []
  for (const b of blocks) {
    switch (b.type) {
      case 'paragraph':
      case 'heading':
        parts.push(inlineText(b.children, person))
        break
      case 'list':
        parts.push(
          b.items
            .map(
              (it, k) =>
                `${'  '.repeat(it.depth)}${b.ordered ? `${b.start + k}.` : '-'} ${inlineText(it.children, person)}`,
            )
            .join('\n'),
        )
        break
      case 'table':
        parts.push(
          [b.header, ...b.rows]
            .map((r) => r.map((c) => inlineText(c, person).replace(/\n/g, ' ')).join('\t'))
            .join('\n'),
        )
        break
      case 'code':
        parts.push(codeText(b.text, person))
        break
      case 'rule':
        break
    }
  }
  return parts.filter(Boolean).join('\n\n')
}

/** A number in a table cell ("1,284", "−3.5", "12.4%" as 0.124), or null for text. */
export function cellNumber(text: string): number | null {
  const t = text.trim().replace(/−/g, '-')
  const m = /^(-?\d{1,3}(?:,\d{3})+|-?\d+)(\.\d+)?(%)?$/.exec(t)
  if (!m) return null
  const v = Number(`${(m[1] as string).replace(/,/g, '')}${m[2] ?? ''}`)
  if (!Number.isFinite(v)) return null
  return m[3] ? v / 100 : v
}

export interface AnswerTable {
  columns: { key: string; label: string; numeric: boolean }[]
  /** Cells as text with names; numeric columns as numbers (percentages as fractions). */
  rows: Record<string, string | number | null>[]
}

/** A table block as rows for the app's DataTable and for CSV and Excel downloads. */
export function tableData(t: Extract<Block, { type: 'table' }>, person: PersonLookup): AnswerTable {
  const texts = t.rows.map((r) => r.map((c) => inlineText(c, person).replace(/\n/g, ' ').trim()))
  const columns = t.header.map((h, k) => {
    const label = inlineText(h, person).replace(/\n/g, ' ').trim() || `Column ${k + 1}`
    const filled = texts.map((r) => r[k] ?? '').filter((v) => v && v !== '—')
    return { key: `c${k}`, label, numeric: filled.length > 0 && filled.every((v) => cellNumber(v) != null) }
  })
  const rows = texts.map((r) =>
    Object.fromEntries(
      columns.map((c, k) => {
        const v = r[k] ?? ''
        return [c.key, c.numeric ? cellNumber(v) : v || null]
      }),
    ),
  )
  return { columns, rows }
}
