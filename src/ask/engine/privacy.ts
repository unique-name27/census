/**
 * Person tokens: the privacy pass every tool result and the user's question go through before
 * anything is sent to Claude (docs/ASK.md, Person tokens).
 *
 * Per conversation, `TokenMap` indexes every person name and ID in the loaded data: employees
 * (name, employee ID), candidates (name, application ID, candidate ID), the person-name fields
 * (hiring manager, recruiter, coordinator, HR business partner, case assignee) and the people who
 * confirmed, certified or remapped a dataset in the Data room. Tools emit `{{P12}}` for a person.
 * As a second line of defence, `scan` replaces any known full name, employee ID, application ID,
 * candidate ID or email left in a result (findings text written by the engines names people) with
 * its token, and any money amount with "[amount withheld]". The user's question is tokenized the
 * same way.
 *
 * Names are matched the way people type them: case, accents, curly apostrophes, hyphens and runs
 * of spaces do not matter, and "Last, First" and "Last First" match too. A full name always wins
 * over a category value that happens to spell it (a cost center column holding managers' names);
 * only a single word that is also a work site, department or other category value ("Austin") is
 * left alone.
 *
 * Tokens are handed out on first use (P1, P2, ...), so their numbers say nothing about the roster.
 * The map never leaves the browser; `resolve` turns a token back into a name locally, and a token
 * Claude invents resolves to nothing (the UI shows "someone").
 */
import type { AnalyticsContext } from '@/data/context'
import {
  CASE_CATEGORIES,
  CASE_CHANNELS,
  DATASET_KEYS,
  DATASETS,
  type Datasets,
  LEARNING_CATEGORIES,
  LEVEL_LABELS,
  LEVELS,
  ONBOARDING_OWNERS,
  SITES,
  SOURCES,
  VIEW_LABEL,
} from '@/data/schema'
import { isTeamName } from '@/views/actions/engine/collect'
import { ACTION_OWNER_LABEL } from '@/views/types'
import type { PersonInfo } from './types'

/** A well-formed token anywhere in text: `{{P12}}`. */
export const TOKEN_RE = /\{\{P(\d+)\}\}/g

/** `{{P12}}` for the token id 'P12'. */
export const tokenText = (id: string): string => `{{${id}}}`

/** Shown in place of a money amount found in text. */
export const AMOUNT_WITHHELD = '[amount withheld]'

const CURRENCIES = 'USD|EUR|GBP|INR|TWD|CNY|RMB|ILS|CAD|VND|JPY|AUD|SGD|KRW|CHF'
const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?`
const SCALE = String.raw`(?:\s?(?:[KkMmBb]|thousand|million|billion)\b)?`
/** Money amounts: "$1.2M", "€80,000", "USD 145,000", "145,000 USD". */
const MONEY_RE = new RegExp(
  String.raw`(?:[$€£¥₹₪₩]\s?${NUMBER}${SCALE})|(?:\b(?:${CURRENCIES})\s?${NUMBER}${SCALE})|(?:\b${NUMBER}\s?(?:${CURRENCIES})\b)`,
  'g',
)
const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu
const WORD_RE = /[\p{L}\p{N}]+/gu
const ID_RUN_RE = /[\p{L}\p{N}_-]+/uy
const ID_CHAR = /[\p{L}\p{N}_-]/u
const LETTER_NUM = /[\p{L}\p{N}]/u

/** Words that may be a value in a name field but are never a person. */
const NOT_A_PERSON = new Set(
  [
    'open',
    'unknown',
    'unassigned',
    'vacant',
    'none',
    'tbd',
    'n/a',
    'other',
    'hold',
    'on hold',
    'pending',
    'agency',
    'internal',
    'external',
    'hiring manager',
    'recruiter',
    'coordinator',
    'manager',
    'team',
  ].map((s) => s.toLowerCase()),
)

/**
 * Words of a team rather than a person. A certifier, confirmer or remapper written only in these
 * words ("HRIS team", "People analytics") is a team; anything else ("Dana Whitfield, People
 * analytics", "Sam (HR)") names someone.
 */
const TEAM_WORDS = new Set(
  'team teams operations ops analytics mobility finance acquisition rewards payroll hris hr people talent learning department office group services it admin and of the'.split(
    ' ',
  ),
)

type EntryKind = PersonInfo['kind']

interface Entry {
  key: string
  name: string
  employeeId: string | null
  kind: EntryKind
  token: string | null
}

interface NamePattern {
  /** The name folded (see `fold`). */
  text: string
  key: string
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

/* ───────────── folding: how names are compared ───────────── */

/**
 * Text folded for name matching, with where each folded character came from. Lowercase, accents
 * dropped (composed or decomposed), curly and modifier apostrophes as ', hyphens as spaces, runs
 * of spaces as one, and a comma with the spaces around it as a bare ",".
 */
interface Folded {
  text: string
  /** Raw index of the character each folded character came from. */
  start: number[]
  /** Raw index just after it. */
  end: number[]
  /** For each raw index, the folded index of the first character it gave (or the next one). */
  at: number[]
}

const APOSTROPHE = /[‘’‛ʼʹ`´′]/
const DASH = /[‐‑‒–—−]/
const SPACE = /\s/u
const MARK = /\p{M}/u

function fold(s: string): Folded {
  let text = ''
  const start: number[] = []
  const end: number[] = []
  const at: number[] = new Array(s.length + 1)
  const push = (ch: string, i: number, j: number) => {
    text += ch
    start.push(i)
    end.push(j)
  }
  let i = 0
  while (i < s.length) {
    const code = s.charCodeAt(i)
    const len = code >= 0xd800 && code <= 0xdbff && i + 1 < s.length ? 2 : 1
    const j = i + len
    at[i] = text.length
    if (len === 2) at[i + 1] = text.length
    const c = s.slice(i, j)
    const last = text[text.length - 1]
    if (c === ' ' || c === '-' || SPACE.test(c) || DASH.test(c)) {
      if (last === ' ' || last === ',') end[end.length - 1] = j
      else if (text) push(' ', i, j)
    } else if (c === ',') {
      if (last === ' ') {
        text = text.slice(0, -1)
        start.pop()
        end.pop()
      }
      push(',', i, j)
    } else if (c === "'" || APOSTROPHE.test(c)) push("'", i, j)
    else if (code < 0x80) push(code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : c, i, j)
    else {
      const f = c.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
      for (let k = 0; k < f.length; k++) push(f[k] as string, i, j)
    }
    i = j
  }
  at[s.length] = text.length
  return { text, start, end, at }
}

/** A name or category value as it is compared: folded, without edge spaces or commas. */
export const foldKey = (s: string): string => fold(s).text.replace(/^[ ,]+|[ ,]+$/g, '')

const FIRST_WORD = /[\p{L}\p{N}]+/u
const FIRST_WORD_AT = /[\p{L}\p{N}]+/uy
/** Folded text that ends in the word "by " (the quality text's "certified 30 Sep by Dana"). */
const BY_BEFORE = /(?:^|[^\p{L}\p{N}])by $/u

/** "Last, First" and "Last First" for a plain multi-word name (folded), and "First Last" for "Last, First". */
function nameVariants(l: string): string[] {
  const comma = l.split(',')
  if (comma.length === 2 && comma[0] && comma[1] && !/[^\p{L}' ]/u.test(l.replace(',', '')))
    return [`${comma[1]} ${comma[0]}`]
  if (!/^[\p{L}' ]+$/u.test(l)) return []
  const words = l.split(' ')
  if (words.length < 2) return []
  const last = words[words.length - 1] as string
  const rest = words.slice(0, -1).join(' ')
  return [`${last},${rest}`, `${last} ${rest}`]
}

/** What the token map reads: the loaded data, and who certified, confirmed or remapped it. */
export interface TokenSource {
  all: Datasets
  quality?: AnalyticsContext['quality']
  reference?: { mappings: readonly { by?: string | null }[] } | null
}

export class TokenMap {
  private readonly entries = new Map<string, Entry>()
  private readonly byToken = new Map<string, Entry>()
  private next = 1
  /** Lowercased ID → entry key, for IDs long enough to search text for. */
  private ids = new Map<string, string>()
  /** Every person ID → entry key. */
  private allIds = new Map<string, string>()
  /** First word of a folded name → patterns, longest first. */
  private names = new Map<string, NamePattern[]>()
  /**
   * Who certified, confirmed or remapped data in the Data room, matched only right after "by"
   * (where the quality text names them), whatever their length.
   */
  private bylines = new Map<string, NamePattern[]>()
  /** Folded name → employee IDs with that name. */
  private empByName = new Map<string, string[]>()
  private protectedWords = new Set<string>()
  private indexed: object | null = null
  private indexedBy = ''

  /** How many people the map knows (for tests and diagnostics). */
  get size(): number {
    return this.entries.size
  }

  /**
   * Index the loaded data. Cheap when the data and the Data room attributions have not changed
   * since the last call; otherwise the index is rebuilt and every token handed out so far keeps its
   * person.
   */
  index(ctx: TokenSource): void {
    const by = attributions(ctx)
    const byKey = by.join('\u0001')
    if (this.indexed === ctx.all && this.indexedBy === byKey) return
    this.indexed = ctx.all
    this.indexedBy = byKey
    this.build(ctx.all, by)
  }

  private entry(key: string, init: () => Omit<Entry, 'key' | 'token'>): Entry {
    let e = this.entries.get(key)
    if (!e) {
      e = { key, token: null, ...init() }
      this.entries.set(key, e)
    }
    return e
  }

  private build(all: Datasets, attributed: readonly string[]): void {
    this.ids = new Map()
    this.allIds = new Map()
    this.names = new Map()
    this.bylines = new Map()
    this.empByName = new Map()
    this.protectedWords = protectedVocabulary(all)
    const patterns = new Map<string, string>()

    // Employees: one entry per employee ID.
    for (const e of all.employees) {
      if (!e.employeeId) continue
      const key = `e:${e.employeeId}`
      const ent = this.entry(key, () => ({
        name: e.name || e.employeeId,
        employeeId: e.employeeId,
        kind: 'employee',
      }))
      if (e.name) ent.name = e.name
      ent.employeeId = e.employeeId
      ent.kind = 'employee'
      this.addId(e.employeeId, key)
      if (e.name) {
        const l = foldKey(e.name)
        const list = this.empByName.get(l)
        if (list) list.push(e.employeeId)
        else this.empByName.set(l, [e.employeeId])
      }
    }
    for (const [l, ids] of this.empByName) {
      const key = ids.length === 1 ? `e:${ids[0]}` : this.nameKey(this.entries.get(`e:${ids[0]}`)?.name ?? l)
      patterns.set(l, key)
    }

    // Candidates: one entry per candidate (candidate ID, else application ID).
    const candByName = new Map<string, Set<string>>()
    for (const c of all.candidates) {
      const id = c.candidateId || c.applicationId
      if (!id) continue
      const key = `c:${id}`
      this.entry(key, () => ({ name: c.candidateName || id, employeeId: null, kind: 'candidate' }))
      if (c.applicationId) this.addId(c.applicationId, key)
      if (c.candidateId) this.addId(c.candidateId, key)
      if (c.candidateName) {
        const l = foldKey(c.candidateName)
        const set = candByName.get(l)
        if (set) set.add(key)
        else candByName.set(l, new Set([key]))
      }
    }
    for (const [l, keys] of candByName) {
      if (patterns.has(l)) continue
      const only = keys.size === 1 ? [...keys][0] : null
      patterns.set(l, only ?? this.nameKey(this.entries.get([...keys][0] as string)?.name ?? l))
    }

    // Name fields that may hold someone not on the roster.
    const extra: string[] = [...attributed]
    for (const r of all.requisitions) extra.push(r.hiringManager ?? '', r.recruiter ?? '')
    for (const c of all.candidates) extra.push(c.recruiter ?? '', c.coordinator ?? '')
    for (const e of all.employees) extra.push(e.hrbp ?? '')
    for (const c of all.cases) extra.push(c.assignee ?? '')
    for (const n of extra) {
      if (!n.trim() || !isPersonLike(n)) continue
      const l = foldKey(n)
      if (patterns.has(l)) continue
      patterns.set(l, this.nameKey(n))
    }

    // "Last, First" and "Last First": never over a real name spelled that way.
    const variants = new Map<string, string>()
    for (const [l, key] of patterns)
      for (const v of nameVariants(l)) if (!patterns.has(v) && !variants.has(v)) variants.set(v, key)

    for (const [l, key] of patterns) this.addName(this.names, l, key)
    for (const [l, key] of variants) this.addName(this.names, l, key)
    for (const n of attributed) {
      const l = foldKey(n)
      const key = patterns.get(l)
      if (key) this.addName(this.bylines, l, key, true)
    }
    for (const map of [this.names, this.bylines])
      for (const list of map.values()) list.sort((a, b) => b.text.length - a.text.length)
  }

  /** The entry key for a name that is not one known person (a name-only token). */
  private nameKey(name: string): string {
    const l = foldKey(name)
    const key = `n:${l}`
    const ids = this.empByName.get(l)
    this.entry(key, () => ({ name: norm(name), employeeId: ids?.length === 1 ? ids[0] : null, kind: 'name' }))
    return key
  }

  private addId(id: string, key: string): void {
    const v = id.trim()
    if (!v) return
    this.allIds.set(v, key)
    // Very short IDs, and short numbers, would match ordinary text: they are tokenized when a tool
    // emits them, never searched for.
    if (v.length < 3 || (/^\d+$/.test(v) && v.length < 5)) return
    this.ids.set(v.toLowerCase(), key)
  }

  private addName(map: Map<string, NamePattern[]>, l: string, key: string, any = false): void {
    if (!any && !this.searchable(l)) return
    const first = l.match(FIRST_WORD)?.[0]
    if (!first) return
    const pattern: NamePattern = { text: l, key }
    const list = map.get(first)
    if (list) list.push(pattern)
    else map.set(first, [pattern])
  }

  /**
   * A name worth searching text for: not a team or a placeholder, not a short single word, and
   * not a single word that is also a category value (a work site such as "Austin"). A full name
   * is searched for even when a category column holds it.
   */
  private searchable(l: string): boolean {
    if ((l.match(/\p{L}/gu)?.length ?? 0) < 3) return false
    if (NOT_A_PERSON.has(l) || isTeamName(l)) return false
    const multi = /[ ,]/.test(l)
    if (!multi && this.protectedWords.has(l)) return false
    return multi || l.length >= 4
  }

  private tokenOf(key: string): string {
    const e = this.entries.get(key)
    if (!e) return tokenText('P0')
    if (!e.token) {
      e.token = `P${this.next++}`
      this.byToken.set(e.token, e)
    }
    return tokenText(e.token)
  }

  /* ───────────── what tools emit ───────────── */

  /** The token for an employee ID (an ID not on the roster still gets one; it never goes out as is). */
  forEmployee(id: string): string {
    const key = `e:${id}`
    this.entry(key, () => ({ name: id, employeeId: null, kind: 'name' }))
    return this.tokenOf(key)
  }

  /** The token for a candidate, by application ID or candidate ID. */
  forCandidate(id: string): string {
    const key = this.allIds.get(id.trim()) ?? `c:${id}`
    this.entry(key, () => ({ name: id, employeeId: null, kind: 'candidate' }))
    return this.tokenOf(key)
  }

  /**
   * The token for a person named in a name field (recruiter, HR business partner, assignee): the
   * employee's own token when exactly one employee has the name. A team name ("People
   * operations") is returned as it is.
   */
  forName(name: string): string {
    const n = norm(name)
    if (!n) return n
    if (isTeamName(n) || NOT_A_PERSON.has(n.toLowerCase())) return n
    const ids = this.empByName.get(foldKey(n))
    if (ids?.length === 1) return this.forEmployee(ids[0] as string)
    return this.tokenOf(this.nameKey(n))
  }

  /** Who a token stands for, or null for a token this conversation never handed out. */
  resolve(token: string): PersonInfo | null {
    const id = token.replace(/^\{\{|\}\}$/g, '').trim()
    const e = this.byToken.get(id)
    if (!e?.token) return null
    return { token: e.token, name: e.name, employeeId: e.employeeId, kind: e.kind }
  }

  /** The employee ID behind a token (for a leader filter), or null. */
  employeeIdOf(token: string): string | null {
    return this.resolve(token)?.employeeId ?? null
  }

  /** Does a person field's value (an employee ID or a name) belong to the person behind the token? */
  matches(token: string, value: unknown, by: 'id' | 'name'): boolean {
    if (typeof value !== 'string' || !value) return false
    const p = this.resolve(token)
    if (!p) return false
    if (by === 'id') return p.employeeId === value
    if (foldKey(p.name) === foldKey(value)) return true
    const ids = this.empByName.get(foldKey(value))
    return !!p.employeeId && ids?.length === 1 && ids[0] === p.employeeId
  }

  /* ───────────── the second line: scanning text ───────────── */

  /**
   * Replace every known full name, person ID and email in text with its token, and every money
   * amount with "[amount withheld]". Tokens already in the text are left alone.
   */
  scan(text: string): string {
    if (!text) return text
    let out = ''
    let last = 0
    for (const m of text.matchAll(TOKEN_RE)) {
      const i = m.index ?? 0
      out += this.scanPlain(text.slice(last, i)) + m[0]
      last = i + m[0].length
    }
    return out + this.scanPlain(text.slice(last))
  }

  /** `scan` over every string in a JSON-like value (keys included), returning a copy. */
  scanDeep<T>(value: T): T {
    return walk(value, (s) => this.scan(s)) as T
  }

  private scanPlain(s: string): string {
    if (!s) return s
    let out = ''
    let last = 0
    for (const m of s.matchAll(EMAIL_RE)) {
      const i = m.index ?? 0
      out += this.scanWords(s.slice(last, i)) + this.forEmail(m[0])
      last = i + m[0].length
    }
    return out + this.scanWords(s.slice(last))
  }

  private forEmail(email: string): string {
    const key = `m:${email.toLowerCase()}`
    this.entry(key, () => ({ name: email, employeeId: null, kind: 'name' }))
    return this.tokenOf(key)
  }

  private scanWords(s: string): string {
    if (!s) return s
    let out = ''
    let last = 0
    let folded: Folded | null = null
    const words = new RegExp(WORD_RE.source, 'gu')
    for (let m = words.exec(s); m; m = words.exec(s)) {
      const i = m.index
      let hit = this.idAt(s, i, m[0])
      if (!hit && (this.names.size || this.bylines.size)) {
        folded ??= fold(s)
        hit = this.nameAt(s, folded, i)
      }
      if (!hit) continue
      out += s.slice(last, i) + this.tokenOf(hit.key)
      last = hit.end
      words.lastIndex = hit.end
    }
    return (out + s.slice(last)).replace(MONEY_RE, AMOUNT_WITHHELD)
  }

  private idAt(s: string, i: number, word: string): { end: number; key: string } | null {
    if (!this.ids.size) return null
    if (i > 0 && ID_CHAR.test(s[i - 1] as string)) return null
    ID_RUN_RE.lastIndex = i
    const run = ID_RUN_RE.exec(s)?.[0].replace(/[-_]+$/, '') ?? word
    const full = this.ids.get(run.toLowerCase())
    if (full) return { end: i + run.length, key: full }
    const end = i + word.length
    const short = this.ids.get(word.toLowerCase())
    if (short && !LETTER_NUM.test(s[end] ?? '')) return { end, key: short }
    return null
  }

  /** A known name starting at raw index `i`, compared folded; the end is in the raw text. */
  private nameAt(s: string, f: Folded, i: number): { end: number; key: string } | null {
    const fi = f.at[i] ?? f.text.length
    // Inside a word once folded (a letter after a combining accent): not the start of a name.
    if (fi > 0 && LETTER_NUM.test(f.text[fi - 1] ?? '')) return null
    FIRST_WORD_AT.lastIndex = fi
    const word = FIRST_WORD_AT.exec(f.text)?.[0]
    if (!word) return null
    const lists = [this.names.get(word)]
    if (BY_BEFORE.test(f.text.slice(Math.max(0, fi - 4), fi))) lists.push(this.bylines.get(word))
    for (const list of lists) {
      if (!list) continue
      for (const p of list) {
        if (!f.text.startsWith(p.text, fi)) continue
        const fe = fi + p.text.length
        if (LETTER_NUM.test(f.text[fe] ?? '')) continue
        // The match must end on a whole character of the raw text.
        if (fe < f.text.length && f.start[fe] === f.start[fe - 1]) continue
        let end = f.end[fe - 1] ?? s.length
        while (end < s.length && MARK.test(s[end] as string)) end++
        return { end, key: p.key }
      }
    }
    return null
  }
}

/** A name-field value that could be a person: not blank, a team, or a placeholder. */
function isPersonLike(n: string): boolean {
  const l = foldKey(n)
  return !!l && !NOT_A_PERSON.has(l) && !isTeamName(l)
}

/** A Data room attribution that is a team only ("HRIS team", "People analytics"), not a person. */
function isTeamOnly(by: string): boolean {
  if (isTeamName(by)) return true
  const words = foldKey(by)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  return words.length > 0 && words.every((w) => TEAM_WORDS.has(w))
}

/**
 * Who certified or confirmed each dataset and who made each reference mapping in the Data room,
 * when that names a person rather than only a team. Sorted, so the list doubles as a cache key.
 */
function attributions(ctx: TokenSource): string[] {
  const out = new Set<string>()
  const add = (by: string | null | undefined) => {
    const v = by?.trim()
    if (v && !isTeamOnly(v)) out.add(v)
  }
  const q = ctx.quality
  if (q)
    for (const k of DATASET_KEYS) {
      let v: ReturnType<typeof q.dataset>['version'] = null
      try {
        v = q.dataset(k).version
      } catch {
        continue
      }
      add(v?.certification?.by)
      add(v?.mappingConfirmedBy)
    }
  for (const m of ctx.reference?.mappings ?? []) add(m.by)
  return [...out].sort()
}

/**
 * Category words that appear in tool output and must never be taken for a one-word name: work
 * sites, business units, departments, levels, categories, teams, view names.
 */
function protectedVocabulary(all: Datasets): Set<string> {
  const out = new Set<string>()
  const add = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.add(foldKey(v))
  }
  for (const s of SITES) {
    add(s.location)
    add(s.country)
    add(s.region)
  }
  for (const c of CASE_CATEGORIES) {
    add(c.category)
    add(c.team)
  }
  for (const v of [
    ...CASE_CHANNELS,
    ...SOURCES,
    ...LEARNING_CATEGORIES,
    ...ONBOARDING_OWNERS,
    ...LEVELS,
    ...Object.values(LEVEL_LABELS),
    ...Object.values(VIEW_LABEL),
    ...Object.values(ACTION_OWNER_LABEL),
    ...DATASETS.flatMap((d) => d.fields.flatMap((f) => f.values ?? [])),
  ])
    add(v)
  for (const e of all.employees) {
    add(e.businessUnit)
    add(e.department)
    add(e.location)
    add(e.country)
    add(e.jobFamily)
    add(e.jobFunction)
    add(e.costCenter)
  }
  for (const r of all.requisitions) {
    add(r.businessUnit)
    add(r.department)
    add(r.location)
  }
  for (const c of all.cases) {
    add(c.team)
    add(c.category)
  }
  return out
}

function walk(v: unknown, f: (s: string) => string): unknown {
  if (typeof v === 'string') return f(v)
  if (Array.isArray(v)) return v.map((x) => walk(x, f))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[f(k)] = walk(x, f)
    return out
  }
  return v
}
