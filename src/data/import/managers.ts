/**
 * Resolving people references: manager columns that hold an ID or a name, and IDs that lost
 * their leading zeros on the way through Excel.
 */
import { levelIndex } from '../schema'
import type { ImportIssue } from './types'

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md'])

function nameWords(raw: string): string[] {
  const s = raw.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  const comma = s.indexOf(',')
  // "Last, First Middle" reads as "First Middle Last".
  const ordered = comma > 0 ? `${s.slice(comma + 1)} ${s.slice(0, comma)}` : s
  return ordered
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/['-]/g, '')
    .split(/\s+/)
    .filter((w) => w && !SUFFIXES.has(w))
}

/** Comparison key for a person's name: every word, "Last, First" aware, accents and case ignored. */
export function nameKey(raw: string | null | undefined): string {
  return raw ? nameWords(raw).join(' ') : ''
}

/** Looser key: first and last word only, so "Jane Q. Smith" meets "Smith, Jane". */
export function shortNameKey(raw: string | null | undefined): string {
  const w = raw ? nameWords(raw) : []
  return w.length >= 2 ? `${w[0]} ${w[w.length - 1]}` : w.join(' ')
}

const stripZeros = (id: string) => (/^\d+$/.test(id) ? id.replace(/^0+(?=\d)/, '') : null)

export interface PersonIndex {
  ids: Set<string>
  byUpper: Map<string, string[]>
  byDigits: Map<string, string[]>
  byName: Map<string, string[]>
  byShortName: Map<string, string[]>
}

const push = (m: Map<string, string[]>, k: string, id: string) => {
  if (!k) return
  const arr = m.get(k)
  if (!arr) m.set(k, [id])
  else if (!arr.includes(id)) arr.push(id)
}

export function buildPersonIndex(
  people: readonly { employeeId: string; name?: string | null }[],
): PersonIndex {
  const idx: PersonIndex = {
    ids: new Set(),
    byUpper: new Map(),
    byDigits: new Map(),
    byName: new Map(),
    byShortName: new Map(),
  }
  for (const p of people) {
    idx.ids.add(p.employeeId)
    push(idx.byUpper, p.employeeId.toUpperCase(), p.employeeId)
    const d = stripZeros(p.employeeId)
    if (d != null) push(idx.byDigits, d, p.employeeId)
    push(idx.byName, nameKey(p.name), p.employeeId)
    push(idx.byShortName, shortNameKey(p.name), p.employeeId)
  }
  return idx
}

export type PersonMatch =
  | { kind: 'id'; id: string }
  | { kind: 'id-fixed'; id: string }
  | { kind: 'name'; id: string }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'unknown' }

/** Resolve a reference by exact ID, then case or leading zeros, then a unique name. */
export function matchPerson(ref: string, idx: PersonIndex, exclude?: string): PersonMatch {
  if (idx.ids.has(ref)) return { kind: 'id', id: ref }
  const unique = (ids: string[] | undefined) => (ids ?? []).filter((x) => x !== exclude)
  const upper = unique(idx.byUpper.get(ref.toUpperCase()))
  if (upper.length === 1) return { kind: 'id-fixed', id: upper[0] }
  const d = stripZeros(ref)
  const digits = d != null ? unique(idx.byDigits.get(d)) : []
  if (digits.length === 1) return { kind: 'id-fixed', id: digits[0] }
  const full = unique(idx.byName.get(nameKey(ref)))
  if (full.length === 1) return { kind: 'name', id: full[0] }
  if (full.length > 1) return { kind: 'ambiguous', candidates: full }
  const short = unique(idx.byShortName.get(shortNameKey(ref)))
  if (short.length === 1) return { kind: 'name', id: short[0] }
  if (short.length > 1) return { kind: 'ambiguous', candidates: short }
  return { kind: 'unknown' }
}

/* ───────────── roster manager links ───────────── */

export interface LinkRow {
  rec: { employeeId: string; name?: string | null; managerId?: string | null; level?: string | null }
  row: number
}

export interface LinkStats {
  byId: number
  byName: number
  cleared: number
  topLevel: number
}

/**
 * Point every `managerId` at a person in the same roster: by ID first, then by unique name.
 * Self-references, unknown and ambiguous references, and reporting loops are cleared (the person
 * then sits at the top) and logged. A loop is broken at its most senior member.
 */
export function linkManagers(rows: LinkRow[], issues: ImportIssue[], label = 'Manager ID'): LinkStats {
  const idx = buildPersonIndex(rows.map((r) => r.rec))
  const stats: LinkStats = { byId: 0, byName: 0, cleared: 0, topLevel: 0 }
  const log = (r: LinkRow, value: string, code: ImportIssue['code'], issue: string) => {
    issues.push({
      row: r.row,
      id: r.rec.employeeId,
      field: 'managerId',
      label,
      value,
      code,
      issue,
      action: 'cleared',
    })
    stats.cleared++
  }
  for (const r of rows) {
    const ref = r.rec.managerId
    if (!ref) continue
    if (ref === r.rec.employeeId) {
      r.rec.managerId = null
      log(r, ref, 'manager-self', 'Listed as their own manager.')
      continue
    }
    const m = matchPerson(ref, idx, r.rec.employeeId)
    if (m.kind === 'id' || m.kind === 'id-fixed') {
      r.rec.managerId = m.id
      stats.byId++
    } else if (m.kind === 'name') {
      r.rec.managerId = m.id
      stats.byName++
    } else if (m.kind === 'ambiguous') {
      r.rec.managerId = null
      log(
        r,
        ref,
        'manager-ambiguous',
        `"${ref}" matches ${m.candidates.length} people (${m.candidates.slice(0, 3).join(', ')}).`,
      )
    } else {
      r.rec.managerId = null
      log(r, ref, 'manager-unknown', `Manager "${ref}" is not in this roster.`)
    }
  }
  breakCycles(rows, issues, label, stats)
  stats.topLevel = rows.filter((r) => !r.rec.managerId).length
  return stats
}

function breakCycles(rows: LinkRow[], issues: ImportIssue[], label: string, stats: LinkStats): void {
  const byId = new Map(rows.map((r) => [r.rec.employeeId, r]))
  const state = new Map<string, 1 | 2>()
  for (const start of rows) {
    const path: LinkRow[] = []
    let cur: LinkRow | undefined = start
    while (cur && !state.has(cur.rec.employeeId)) {
      state.set(cur.rec.employeeId, 1)
      path.push(cur)
      cur = cur.rec.managerId ? byId.get(cur.rec.managerId) : undefined
    }
    if (cur && state.get(cur.rec.employeeId) === 1) {
      const loop = path.slice(path.indexOf(cur))
      const victim = loop.reduce((best, r) => {
        const a = levelIndex(r.rec.level ?? '')
        const b = levelIndex(best.rec.level ?? '')
        return a > b || (a === b && r.row < best.row) ? r : best
      })
      const chain = [...loop.map((r) => r.rec.employeeId), loop[0].rec.employeeId].join(' → ')
      issues.push({
        row: victim.row,
        id: victim.rec.employeeId,
        field: 'managerId',
        label,
        value: victim.rec.managerId ?? '',
        code: 'manager-cycle',
        issue: `Reporting line loops back (${chain}); cleared here so this person sits at the top.`,
        action: 'cleared',
      })
      victim.rec.managerId = null
      stats.cleared++
    }
    for (const r of path) state.set(r.rec.employeeId, 2)
  }
}
