/**
 * Pure helpers behind the upload dialog: field order and sample values for the mapping table,
 * the column choices for each field, which date columns need a day order, the value grid for
 * list fields, and the counts and wording of the validation summary.
 */
import type { Severity } from '@/components/types'
import type {
  ApplyArgs,
  DateOrderGuess,
  HeaderCandidate,
  ImportIssue,
  ImportResult,
  IssueAction,
  Mapping,
  ParsedSheet,
  ValueSummary,
} from '@/data/import'
import {
  DATASET_KEYS,
  type DatasetDef,
  type DatasetKey,
  datasetDef,
  type FieldDef,
  LEVELS,
} from '@/data/schema'
import { fmt } from '@/lib/format'
import { isFilled, requirementOf } from './coverage'
import { DERIVED_WITHOUT_COLUMN } from './fills'

export type Step = 'columns' | 'values' | 'check'

/* ───────────── mapping table ───────────── */

const REQ_RANK = { required: 0, recommended: 1, optional: 2 } as const

/** Required fields first, then recommended, then optional; schema order within each group. */
export function orderedFields(def: DatasetDef): FieldDef[] {
  return def.fields
    .map((f, i) => ({ f, i }))
    .sort((a, b) => REQ_RANK[requirementOf(a.f)] - REQ_RANK[requirementOf(b.f)] || a.i - b.i)
    .map((x) => x.f)
}

/** A cell as short display text: dates as ISO, numbers plain, text trimmed. */
export function cellText(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    const iso = v.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ')
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v).trim()
}

/** Up to `n` distinct non-blank values of a column, in file order. */
export function sampleValues(sheet: Pick<ParsedSheet, 'rows'>, header: string, n = 3): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of sheet.rows) {
    const t = cellText(r[header])
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= n) break
  }
  return out
}

export interface HeaderOption {
  header: string
  /** Match score from `rankHeaders`; null for columns that don't fit the field. */
  score: number | null
  /** Label of the other field this column is mapped to, if any. */
  usedBy: string | null
}

/** Columns for one field's dropdown: plausible ones ranked first, then every other column. */
export function headerOptions(
  def: DatasetDef,
  headers: readonly string[],
  ranked: readonly HeaderCandidate[],
  mapping: Mapping,
  fieldKey: string,
): { suggested: HeaderOption[]; others: HeaderOption[] } {
  const usedBy = new Map<string, string>()
  for (const f of def.fields) {
    const h = mapping[f.key]?.header
    if (h && f.key !== fieldKey) usedBy.set(h, f.label)
  }
  const rankedSet = new Set(ranked.map((r) => r.header))
  return {
    suggested: ranked.map((r) => ({
      header: r.header,
      score: r.score,
      usedBy: usedBy.get(r.header) ?? null,
    })),
    others: headers
      .filter((h) => !rankedSet.has(h))
      .map((h) => ({ header: h, score: null, usedBy: usedBy.get(h) ?? null })),
  }
}

/** Columns of the file that no field uses. */
export function unusedHeaders(headers: readonly string[], mapping: Mapping): string[] {
  const used = new Set(Object.values(mapping).flatMap((m) => (m.header ? [m.header] : [])))
  return headers.filter((h) => !used.has(h))
}

const SLASHED_DATE = /^\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/

/**
 * Mapped date columns whose values are typed as text like 03/04/2026, where the day order matters.
 * Real Excel dates and ISO text are unambiguous and left out.
 */
export function textDateHeaders(
  sheet: Pick<ParsedSheet, 'rows'>,
  dateOrders: Readonly<Record<string, DateOrderGuess>>,
): string[] {
  return Object.keys(dateOrders).filter((h) => {
    let checked = 0
    for (const r of sheet.rows) {
      const v = r[h]
      if (v == null || v === '') continue
      if (typeof v === 'string' && SLASHED_DATE.test(v)) return true
      if (++checked >= 200) break
    }
    return false
  })
}

/**
 * Required fields that no column feeds and no default can fill, so no row could be imported.
 * Asks the importer itself (on zero rows, so it is instant) rather than repeating its rules.
 */
export function blockingFields(
  apply: (args: ApplyArgs) => Pick<ImportResult, 'issues'>,
  sheet: ParsedSheet,
  def: DatasetDef,
  mapping: Mapping,
): string[] {
  const probe = apply({ sheet: { ...sheet, rows: [], rowNumbers: [] }, def, mapping })
  return probe.issues.filter((i) => i.code === 'column-missing').map((i) => i.field)
}

/* ───────────── value grid ───────────── */

const VALUE_TYPES = new Set<FieldDef['type']>(['enum', 'level', 'boolean'])

/** Mapped list, level and yes/no fields: the ones whose values are checked against a vocabulary. */
export function valueFields(def: DatasetDef, mapping: Mapping): FieldDef[] {
  return orderedFields(def).filter((f) => VALUE_TYPES.has(f.type) && !!mapping[f.key]?.header)
}

/**
 * Values a person can pick to fix an unrecognized entry. Yes/no fields have no fix list: a
 * correction there must be made in the file (the importer stores corrections as text).
 */
export function fixChoices(field: FieldDef): readonly string[] | null {
  if (field.type === 'enum') return field.values ?? null
  if (field.type === 'level') return LEVELS
  return null
}

export type FixMap = Readonly<Record<string, string | null>>

/** What a value will import as once the person's corrections are applied. */
export function effectiveValue(
  s: Pick<ValueSummary, 'key' | 'value' | 'recognized'>,
  fixes: FixMap | undefined,
): { value: string | null; fixed: boolean; open: boolean } {
  if (fixes && Object.hasOwn(fixes, s.key)) return { value: fixes[s.key], fixed: true, open: false }
  return { value: s.value, fixed: false, open: !s.recognized }
}

/** Distinct values still unrecognized after corrections. */
export function openValues(summaries: readonly ValueSummary[], fixes: FixMap | undefined): number {
  return summaries.filter((s) => effectiveValue(s, fixes).open).length
}

/** Rows holding values still unrecognized after corrections. */
export function openValueRows(summaries: readonly ValueSummary[], fixes: FixMap | undefined): number {
  return summaries.reduce((a, s) => a + (effectiveValue(s, fixes).open ? s.count : 0), 0)
}

/* ───────────── validation summary ───────────── */

export const ACTIONS: readonly IssueAction[] = [
  'row-skipped',
  'left-blank',
  'cleared',
  'defaulted',
  'converted',
  'kept',
]

export interface IssueCounts {
  total: number
  byAction: Record<IssueAction, number>
  /** Distinct source rows with at least one issue (sheet-level issues excluded). */
  rows: number
}

export function issueCounts(issues: readonly ImportIssue[]): IssueCounts {
  const byAction = Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<IssueAction, number>
  const rows = new Set<number>()
  for (const i of issues) {
    byAction[i.action]++
    if (i.row > 0) rows.add(i.row)
  }
  return { total: issues.length, byAction, rows: rows.size }
}

/** How serious an importer action is, for the icon next to each summary sentence. */
export function actionSeverity(action: IssueAction): Exclude<Severity, 'good'> {
  if (action === 'row-skipped') return 'critical'
  if (action === 'left-blank' || action === 'cleared') return 'warning'
  return 'info'
}

/**
 * Nothing changes on the way in: rows come through, no default fills a blank and nothing is
 * logged. Only then may the check step say so.
 */
export function isAllClear(result: Pick<ImportResult, 'issues' | 'stats'>): boolean {
  return result.stats.rowsOut > 0 && result.stats.defaulted === 0 && result.issues.length === 0
}

/** How the importer fills a blank without logging it, mid-sentence after "was". */
const QUIET_FILL: Partial<Record<DatasetKey, Record<string, string>>> = {
  employees: {
    name: 'built from the first and last name columns',
    country: 'taken from the work site',
  },
  requisitions: { openings: 'set to 1' },
  candidates: {
    candidateName: 'built from the first and last name columns',
    stageEnteredDate: 'set to the date of the current stage',
  },
  cases: {
    processId: 'taken from the case category',
    team: 'taken from the case category',
    responseTargetHours: 'taken from the case category',
    resolutionTargetHours: 'taken from the case category',
  },
  transactions: { processId: 'taken from the transaction type' },
  learning: { required: 'treated as not required' },
  comp: {
    currency: 'taken from the employee’s work site',
    fxToUsd: 'set to 1 for pay in USD',
  },
}

export interface QuietFill {
  field: string
  label: string
  count: number
  message: string
}

/**
 * Blanks the importer filled without a line in the log (derivations such as country from the
 * work site), one sentence per field, so the check step accounts for every default it counts.
 */
export function quietFills(
  def: Pick<DatasetDef, 'key' | 'fields'>,
  result: Pick<ImportResult, 'issues' | 'stats' | 'rows'>,
): QuietFill[] {
  const rowLevel = new Map<string, number>()
  const sheetLevel = new Set<string>()
  for (const i of result.issues) {
    if (i.code !== 'defaulted') continue
    if (i.row === 0) sheetLevel.add(i.field)
    else rowLevel.set(i.field, (rowLevel.get(i.field) ?? 0) + 1)
  }
  const rows = result.rows as unknown as readonly Record<string, unknown>[]
  const out: QuietFill[] = []
  for (const [field, n] of Object.entries(result.stats.defaults)) {
    // A field can mix quiet fills with logged ones (country from the site, else Unknown): count
    // only the quiet part, since the log's own sentence covers the rest.
    let count = n
    if (sheetLevel.has(field)) {
      const derived = DERIVED_WITHOUT_COLUMN[def.key]?.[field]
      count = derived ? rows.filter((r) => isFilled(r[field]) && derived(r)).length : 0
    } else count = n - (rowLevel.get(field) ?? 0)
    if (count <= 0) continue
    const label = def.fields.find((f) => f.key === field)?.label ?? field
    const how = QUIET_FILL[def.key]?.[field] ?? 'filled by a documented default'
    out.push({
      field,
      label,
      count,
      message: `${label} was ${how} in ${fmt(count, 'int')} ${count === 1 ? 'row' : 'rows'}.`,
    })
  }
  return out.sort((a, b) => b.count - a.count)
}

/**
 * Pay amounts are missing from the sheet: required pay columns are unmapped, or most rows were
 * skipped for a blank pay amount. A Census download made while pay amounts are off looks like this.
 */
export function payLeftOut(
  def: Pick<DatasetDef, 'fields'>,
  blockers: readonly string[],
  result: Pick<ImportResult, 'issues' | 'stats'> | null,
): boolean {
  const pay = new Set(def.fields.filter((f) => f.pay && f.required).map((f) => f.key))
  if (!pay.size) return false
  if (blockers.some((k) => pay.has(k))) return true
  if (!result?.stats.rowsIn) return false
  const rows = new Set(
    result.issues.filter((i) => i.code === 'missing-required' && pay.has(i.field)).map((i) => i.row),
  )
  return rows.size >= result.stats.rowsIn / 2
}

/**
 * Datasets in the sample workbook. Compensation needs its pay amounts to be uploaded again (base
 * salary and range midpoint are required), so while pay amounts are off it is left out rather
 * than written with blank amounts that would stop the upload.
 */
export function sampleWorkbookDatasets(includePay: boolean): DatasetKey[] {
  return DATASET_KEYS.filter((k) => includePay || !datasetDef(k).fields.some((f) => f.pay && f.required))
}

/**
 * The Read me line for the datasets a sample workbook leaves out while pay amounts are off, so
 * the missing sheet is explained in the file as well as in the toast.
 */
export function leftOutNotes(leftOut: readonly DatasetKey[]): string[] {
  if (!leftOut.length) return []
  const names = leftOut.map((k) => datasetDef(k).sheet).join(' and ')
  const one = leftOut.length === 1
  return [
    `${names} ${one ? 'is' : 'are'} left out because pay amounts are off. Turn them on in Settings, then download again to include ${one ? 'it' : 'them'}.`,
  ]
}

/** Toast after an apply: "Employees replaced: 1,912 rows". */
export function replacedMessage(datasetLabel: string, rows: number): string {
  return `${datasetLabel} replaced: ${fmt(rows, 'int')} ${rows === 1 ? 'row' : 'rows'}`
}

/** "census-import-issues-employees-roster" (no extension). */
export function issuesFileStem(datasetLabel: string, sheetName: string): string {
  const slug = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  const parts = [slug(datasetLabel), slug(sheetName)].filter((p, i, a) => p && a.indexOf(p) === i)
  return ['census-import-issues', ...parts].join('-').slice(0, 96)
}

/** Header picks the person made, to remember as synonyms for next time. */
export function learnedPicks(
  mapping: Mapping,
  overrides: Iterable<string>,
): { field: string; header: string }[] {
  const out: { field: string; header: string }[] = []
  for (const field of overrides) {
    const header = mapping[field]?.header
    if (header) out.push({ field, header })
  }
  return out
}

/* ───────────── privacy ───────────── */

/** Placeholder for the text of an issue about a pay amount while pay amounts are off. */
export const PAY_HIDDEN_ISSUE = 'Details are hidden while pay amounts are off.'

/**
 * Issues about a pay amount that quote a value lose the value and the wording (both can show an
 * amount) unless pay amounts are switched on. An issue about a blank amount has nothing to hide
 * and keeps its own sentence ("Base salary is blank, and it is required."). Everything else is
 * unchanged.
 */
export function redactPayIssues(
  issues: readonly ImportIssue[],
  def: Pick<DatasetDef, 'fields'>,
  showPay: boolean,
): ImportIssue[] {
  if (showPay) return [...issues]
  const pay = new Set(def.fields.filter((f) => f.pay).map((f) => f.key))
  if (!pay.size) return [...issues]
  return issues.map((i) =>
    pay.has(i.field) && i.value.trim() !== '' ? { ...i, value: '', issue: PAY_HIDDEN_ISSUE } : i,
  )
}
