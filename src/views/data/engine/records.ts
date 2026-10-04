/**
 * The loaded rows behind the Data room's numbers, for the drill panel: a dataset's rows (the
 * first ones, when there are many), the rows an import-log entry is about, and where a number
 * sits in a sentence so it can be underlined in place. Pure (no React); the UI builds the specs.
 */
import type { ImportIssue, IssueAction, IssueCode } from '@/data/import'
import type { DatasetDef } from '@/data/schema'

/** Rows a Data room drill lists at most; the note says when there are more. */
export const DRILL_LIMIT = 2000

/** The first `limit` rows, in file order, and how many there are in all. */
export function firstRecords<R>(
  rows: readonly R[],
  limit = DRILL_LIMIT,
): { rows: readonly R[]; total: number; capped: boolean } {
  const capped = rows.length > limit
  return { rows: capped ? rows.slice(0, limit) : rows, total: rows.length, capped }
}

/**
 * A row's identity as the importer writes it into the log (`ImportIssue.id`): the dataset's row
 * key fields that hold a value, joined with " · ". Null when none of them does.
 */
export function recordKey(def: Pick<DatasetDef, 'rowKey'>, rec: object): string | null {
  const r = rec as Record<string, unknown>
  const parts = def.rowKey.map((k) => r[k]).filter((v) => v != null && v !== '')
  return parts.length ? parts.join(' · ') : null
}

/** One line of the "Last upload" summary: its issues share a code, a field and an action. */
export interface IssueGroup {
  code: IssueCode
  field: string
  action: IssueAction
}

export interface IssueRecords<R> {
  /** Loaded rows the group's issues are about, in file order. */
  records: R[]
  /** The group's first issue for each listed row (a method, so a typed group fits a general one). */
  issueOf(row: R): ImportIssue | undefined
  /** Issues in the group about one row that was imported (skipped rows and whole-sheet notes don't count). */
  logged: number
}

/** Free text that stays at category level for employee relations cases (privacy rule). */
const ER_TEXT_FIELDS = new Set(['subcategory'])

/** "code|field|action": how `summarizeIssues` groups the log, and the key of `issueRecordsByGroup`. */
export const issueGroupKey = (g: IssueGroup): string => `${g.code}|${g.field}|${g.action}`

/**
 * The loaded rows each import-log line is about, keyed by `issueGroupKey`, in one pass over the
 * log and one over the rows. Rows the import skipped (missing a required value, duplicates) are
 * not loaded, so they never list; neither do notes about the whole sheet. A row edited or replaced
 * since the upload no longer matches its logged key and drops out, so `logged` can exceed
 * `records.length`. Groups with nothing to list are absent.
 */
export function issueRecordsByGroup<R extends object>(
  def: Pick<DatasetDef, 'key' | 'rowKey'>,
  rows: readonly R[],
  issues: readonly ImportIssue[],
): Map<string, IssueRecords<R>> {
  interface Acc {
    logged: number
    records: R[]
    found: Map<R, ImportIssue>
  }
  const groups = new Map<string, Acc>()
  // Row key → the first issue of each group about that row.
  const wanted = new Map<string, Map<string, ImportIssue>>()
  for (const i of issues) {
    if (i.action === 'row-skipped' || i.row <= 0 || !i.id) continue
    const gk = issueGroupKey(i)
    let g = groups.get(gk)
    if (!g) {
      g = { logged: 0, records: [], found: new Map() }
      groups.set(gk, g)
    }
    g.logged++
    let byGroup = wanted.get(i.id)
    if (!byGroup) {
      byGroup = new Map()
      wanted.set(i.id, byGroup)
    }
    if (!byGroup.has(gk)) byGroup.set(gk, i)
  }
  if (wanted.size)
    for (const r of rows) {
      const k = recordKey(def, r)
      const hits = k == null ? undefined : wanted.get(k)
      if (!hits) continue
      for (const [gk, issue] of hits) {
        const g = groups.get(gk)
        if (!g || g.found.has(r)) continue
        g.found.set(r, issue)
        g.records.push(r)
      }
    }
  const out = new Map<string, IssueRecords<R>>()
  for (const [gk, g] of groups)
    out.set(gk, { records: g.records, issueOf: (r) => g.found.get(r), logged: g.logged })
  return out
}

/**
 * What the drill shows of a logged issue next to its row: the value in the file and what happened.
 * Employee relations cases keep their topic to themselves, so its logged text is withheld.
 */
export function issueDetail(
  def: Pick<DatasetDef, 'key'>,
  row: object,
  issue: ImportIssue | undefined,
): { value: string | null; issue: string | null } {
  if (!issue) return { value: null, issue: null }
  const er =
    def.key === 'cases' &&
    ER_TEXT_FIELDS.has(issue.field) &&
    (row as Record<string, unknown>).category === 'Employee relations'
  if (er) return { value: null, issue: 'Not shown for employee relations cases' }
  return { value: issue.value || null, issue: issue.issue }
}

/**
 * Splits `text` around the number `figure` so it can be underlined in place: the first time it
 * appears as a whole number (not part of a longer one such as "1,204" inside "21,204").
 */
export function splitFigure(text: string, figure: string): [string, string, string] | null {
  if (!figure) return null
  let from = 0
  for (;;) {
    const i = text.indexOf(figure, from)
    if (i < 0) return null
    const before = text.slice(0, i)
    const after = text.slice(i + figure.length)
    const joinsBefore = /\d[.,]?$/.test(before)
    const joinsAfter = /^[.,]?\d/.test(after)
    if (!joinsBefore && !joinsAfter) return [before, figure, after]
    from = i + 1
  }
}
