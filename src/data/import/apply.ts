/**
 * Turn a mapped sheet into typed dataset rows.
 *
 * Steps per row: coerce every mapped cell → resolve people against the roster → fill documented
 * defaults → drop the row if a required value is still blank. Then de-duplicate by the
 * dataset's row key (the row with the most recent date wins) and, for the roster itself, link
 * managers. Every change is written to the exceptions log; nothing is guessed silently.
 */
import type { DatasetDef, DatasetKey, Datasets, Employee, FieldDef } from '../schema'
import { DEFAULT_HOURS_PER_YEAR, type FillMode, fillDefaults, type SheetContext } from './defaults'
import { buildPersonIndex, type LinkRow, linkManagers, matchPerson, type PersonIndex } from './managers'
import { type ColumnSettings, coerceValue, detectDateOrder, detectPercentWhole } from './normalize'
import { readNumber } from './numbers'
import { displayValue, headerTokens, isBlank, normalizeHeader, normText } from './text'
import type {
  ApplyOptions,
  DateOrder,
  HourlyConversion,
  ImportIssue,
  ImportResult,
  ImportStats,
  IssueAction,
  IssueCode,
  Mapping,
  ParsedSheet,
  SuggestedOptions,
} from './types'

export interface ApplyArgs {
  sheet: ParsedSheet
  def: DatasetDef
  mapping: Mapping
  /** The current roster, for linking people in other datasets and site-based defaults. */
  roster?: readonly Employee[]
  options?: ApplyOptions
}

/* ───────────── option detection ───────────── */

const BASIS_HEADER =
  /\b(?:pay|comp|compensation|salary|wage|rate)\s(?:basis|type|frequency|class|unit)\b|^basis$|\bhourly\ssalaried\b|\bsalaried\shourly\b|\bflsa\sbasis\b/

function columnValues(sheet: ParsedSheet, header: string): unknown[] {
  return sheet.rows.map((r) => r[header]).filter((v) => !isBlank(v))
}

function mappedHeaders(mapping: Mapping): Set<string> {
  return new Set(Object.values(mapping).flatMap((m) => (m.header ? [m.header] : [])))
}

function detectHourly(sheet: ParsedSheet, mapping: Mapping): HourlyConversion | null {
  const used = mappedHeaders(mapping)
  const basisHeader = sheet.headers.find(
    (h) =>
      !used.has(h) &&
      BASIS_HEADER.test(normalizeHeader(h)) &&
      sheet.rows.some((r) => normText(r[h]).startsWith('hour')),
  )
  if (basisHeader) return { hours: DEFAULT_HOURS_PER_YEAR, basisHeader }
  const base = mapping.baseSalary?.header
  if (!base) return null
  const nums = columnValues(sheet, base)
    .map((v) => readNumber(v, true).value)
    .filter((n): n is number => n != null && Number.isFinite(n))
  if (!nums.length) return null
  const hourlyLike = nums.filter((n) => n > 5 && n < 500).length
  return hourlyLike / nums.length >= 0.8 ? { hours: DEFAULT_HOURS_PER_YEAR, basisHeader: null } : null
}

/**
 * Options read from the data: day order per mapped date column, whole-number percent columns,
 * and (compensation) whether base pay is hourly. Show these in the Data room so the user can
 * correct them; `applyMapping` uses the same detection for anything not passed in.
 */
export function suggestOptions(sheet: ParsedSheet, def: DatasetDef, mapping: Mapping): SuggestedOptions {
  const out: SuggestedOptions = { dateOrders: {}, percentWhole: {}, hourlyToAnnual: null }
  const headers = new Set(sheet.headers)
  for (const f of def.fields) {
    const h = mapping[f.key]?.header
    if (!h || !headers.has(h)) continue
    if (f.type === 'date' || f.type === 'datetime')
      out.dateOrders[h] = detectDateOrder(columnValues(sheet, h))
    if (f.type === 'percent') out.percentWhole[f.key] = detectPercentWhole(columnValues(sheet, h))
  }
  if (def.key === 'comp') out.hourlyToAnnual = detectHourly(sheet, mapping)
  return out
}

/* ───────────── helpers ───────────── */

/** Datasets keyed by a person who must exist in the roster, and the fields that name them. */
const PERSON_FIELDS: Partial<Record<DatasetKey, string[]>> = {
  jobChanges: ['employeeId'],
  transactions: ['employeeId'],
  reviews: ['employeeId'],
  learning: ['employeeId'],
  comp: ['employeeId'],
  succession: ['incumbentId', 'successorId'],
}

/** Fields that may name a person instead of giving an ID; resolved by name when unambiguous. */
const PERSON_REF_FIELDS: Partial<Record<DatasetKey, string[]>> = {
  jobChanges: ['fromManagerId', 'toManagerId'],
  reviews: ['reviewerId'],
  requisitions: ['hiringManagerId'],
  cases: ['requesterId'],
}

const FIRST_NAME = ['first name', 'given name', 'preferred first name', 'legal first name', 'firstname']
const LAST_NAME = ['last name', 'surname', 'family name', 'legal last name', 'lastname']

function findNameParts(sheet: ParsedSheet, mapping: Mapping, def: DatasetDef): [string, string] | null {
  const nameField = def.key === 'employees' ? 'name' : def.key === 'candidates' ? 'candidateName' : null
  if (!nameField || mapping[nameField]?.header) return null
  const used = mappedHeaders(mapping)
  const find = (names: string[]) =>
    sheet.headers.find((h) => !used.has(h) && names.includes(headerTokens(h).join(' ')))
  const first = find(FIRST_NAME)
  const last = find(LAST_NAME)
  return first && last ? [first, last] : null
}

function rowId(def: DatasetDef, rec: Record<string, unknown>): string | null {
  const parts = def.rowKey.map((k) => rec[k]).filter((v) => v != null && v !== '')
  return parts.length ? parts.join(' · ') : null
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function emptyStats(rowsIn: number): ImportStats {
  return {
    rowsIn,
    rowsOut: 0,
    skippedMissingRequired: 0,
    duplicates: 0,
    defaulted: 0,
    defaults: {},
    blanked: 0,
    notInRoster: 0,
    rowsWithIssues: 0,
  }
}

/* ───────────── apply ───────────── */

interface Column {
  field: FieldDef
  header: string | null
  settings: ColumnSettings
}

interface Built {
  rec: Record<string, unknown>
  row: number
  issues: ImportIssue[]
}

/** Required fields a default can supply, so an unmapped column doesn't block the import. */
const DERIVABLE_REQUIRED: Partial<Record<DatasetKey, string[]>> = {
  candidates: ['applicationId', 'currentStage', 'status'],
  jobChanges: ['changeType'],
  reviews: ['cycleDate'],
}

/**
 * Coerce, validate, default and de-duplicate a mapped sheet. Pass the K type parameter
 * (`applyMapping<'employees'>(…)`) to get typed rows; with the default the rows are the union.
 */
export function applyMapping<K extends DatasetKey = DatasetKey>(args: ApplyArgs): ImportResult<K> {
  const { sheet, def, mapping } = args
  const options = args.options ?? {}
  const suggested = suggestOptions(sheet, def, mapping)
  const dateOrders: Record<string, DateOrder> = {}
  for (const [h, g] of Object.entries(suggested.dateOrders))
    dateOrders[h] = options.dateOrders?.[h] ?? g.order
  const percentWhole: Record<string, boolean> = {}
  for (const [k, w] of Object.entries(suggested.percentWhole))
    percentWhole[k] = options.percentWhole?.[k] ?? w
  const hourly = options.hourlyToAnnual === undefined ? suggested.hourlyToAnnual : options.hourlyToAnnual
  const used = { dateOrders, percentWhole, hourlyToAnnual: hourly }

  const headerSet = new Set(sheet.headers)
  const columns: Column[] = def.fields.map((field) => {
    const h = mapping[field.key]?.header ?? null
    const header = h && headerSet.has(h) ? h : null
    return {
      field,
      header,
      settings: {
        dateOrder: (header && dateOrders[header]) || 'MDY',
        percentWhole: percentWhole[field.key] ?? false,
        valueMap: options.valueMaps?.[field.key],
      },
    }
  })
  const mappedKeys = new Set(columns.filter((c) => c.header).map((c) => c.field.key))
  const issues: ImportIssue[] = []
  const stats = emptyStats(sheet.rows.length)
  const result = (rows: Record<string, unknown>[]): ImportResult<K> => ({
    dataset: def.key as K,
    // The field definitions drive every record's shape, so the rows match the dataset's type.
    rows: rows as unknown as Datasets[K],
    issues,
    stats,
    used,
  })

  const derivable = new Set(DERIVABLE_REQUIRED[def.key] ?? [])
  const blockers = def.fields.filter((f) => f.required && !mappedKeys.has(f.key) && !derivable.has(f.key))
  if (blockers.length) {
    for (const f of blockers)
      issues.push({
        row: 0,
        id: null,
        field: f.key,
        label: f.label,
        value: '',
        code: 'column-missing',
        issue: `${f.label} is required, but no column is mapped to it. Map a column to import this sheet.`,
        action: 'row-skipped',
      })
    stats.skippedMissingRequired = sheet.rows.length
    return result([])
  }

  const roster = args.roster?.length ? args.roster : null
  const rosterIdx: PersonIndex | null = roster ? buildPersonIndex(roster) : null
  const ctx: SheetContext = {
    nameParts: findNameParts(sheet, mapping, def),
    roster: roster ? new Map(roster.map((e) => [e.employeeId, e])) : null,
    hourly,
  }
  const fieldByKey = new Map(def.fields.map((f) => [f.key, f]))
  const unmappedDefaults = new Map<string, { key: string; count: number; what: string }>()

  const built: Built[] = []
  sheet.rows.forEach((raw, i) => {
    const row = sheet.rowNumbers[i] ?? i + 2
    const rec: Record<string, unknown> = {}
    const rowIssues: ImportIssue[] = []
    const add = (
      field: FieldDef | undefined,
      key: string,
      value: unknown,
      code: IssueCode,
      issue: string,
      action: IssueAction,
    ) =>
      rowIssues.push({
        row,
        id: null,
        field: key,
        label: field?.label ?? key,
        value: displayValue(value),
        code,
        issue,
        action,
      })

    for (const c of columns) {
      if (!c.header) {
        rec[c.field.key] = null
        continue
      }
      const v = raw[c.header]
      const r = coerceValue(def.key, c.field, v, c.settings)
      rec[c.field.key] = r.value ?? null
      if (r.issue) add(c.field, c.field.key, v, r.code ?? 'unreadable', r.issue, 'left-blank')
    }

    if (rosterIdx)
      resolvePeople(def.key, rec, rosterIdx, (key, from, to) => {
        add(
          fieldByKey.get(key),
          key,
          from,
          'converted',
          `Matched to roster ID ${to} (the ID was written differently).`,
          'converted',
        )
      })

    const filled: string[] = []
    const unmappedFills: { key: string; what: string }[] = []
    const fill = (key: string, value: unknown, mode: FillMode = 'silent', what = '') => {
      // Defaults fill blank cells only: a value that could not be read stays blank and logged.
      if (rec[key] != null || value == null || value === '' || rowIssues.some((x) => x.field === key)) return
      rec[key] = value
      filled.push(key)
      if (mode === 'silent') return
      const field = fieldByKey.get(key)
      if (!mappedKeys.has(key)) unmappedFills.push({ key, what })
      else if (mode === 'logged')
        add(
          field,
          key,
          null,
          'defaulted',
          `${field?.label ?? key} was blank, so it was ${what}.`,
          'defaulted',
        )
    }
    const note = (key: string, issue: string, code: IssueCode, action: IssueAction) =>
      add(fieldByKey.get(key), key, rec[key], code, issue, action)
    fillDefaults(def.key, { rec, raw, fill, note }, ctx)

    const id = rowId(def, rec)
    const missing = def.fields.filter((f) => f.required && rec[f.key] == null)
    if (missing.length) {
      stats.skippedMissingRequired++
      for (const f of missing) {
        const prior = rowIssues.find((x) => x.field === f.key)
        if (prior) issues.push({ ...prior, id, action: 'row-skipped' })
        else
          issues.push({
            row,
            id,
            field: f.key,
            label: f.label,
            value: '',
            code: 'missing-required',
            issue: `${f.label} is blank, and it is required.`,
            action: 'row-skipped',
          })
      }
      return
    }
    for (const key of filled) {
      stats.defaulted++
      stats.defaults[key] = (stats.defaults[key] ?? 0) + 1
    }
    for (const u of unmappedFills) {
      const id = `${u.key}|${u.what}`
      const agg = unmappedDefaults.get(id) ?? { key: u.key, count: 0, what: u.what }
      agg.count++
      unmappedDefaults.set(id, agg)
    }
    for (const x of rowIssues) x.id = id
    built.push({ rec, row, issues: rowIssues })
  })

  const fieldOrder = (key: string) => def.fields.findIndex((f) => f.key === key)
  for (const u of [...unmappedDefaults.values()].sort((a, b) => fieldOrder(a.key) - fieldOrder(b.key))) {
    const label = fieldByKey.get(u.key)?.label ?? u.key
    issues.push({
      row: 0,
      id: null,
      field: u.key,
      label,
      value: '',
      code: 'defaulted',
      issue: `No column is mapped to ${label}, so ${u.count.toLocaleString('en-US')} ${u.count === 1 ? 'row was' : 'rows were'} ${u.what}.`,
      action: 'defaulted',
    })
  }

  const kept = dedupe(def, built, issues, stats)
  for (const b of kept) {
    issues.push(...b.issues)
    stats.blanked += b.issues.filter((x) => x.action === 'left-blank').length
  }

  if (def.key === 'employees') {
    const managerField = fieldByKey.get('managerId')
    stats.managers = linkManagers(kept as unknown as LinkRow[], issues, managerField?.label)
  }
  if (rosterIdx) checkRoster(def, kept, rosterIdx, issues, stats)

  issues.sort((a, b) => a.row - b.row)
  stats.rowsOut = kept.length
  stats.rowsWithIssues = new Set(
    issues.filter((x) => x.row > 0 && x.action !== 'row-skipped').map((x) => x.row),
  ).size
  return result(kept.map((b) => b.rec))
}

/** Fix IDs that lost leading zeros or case, and turn names into IDs where the field allows names. */
function resolvePeople(
  dataset: DatasetKey,
  rec: Record<string, unknown>,
  idx: PersonIndex,
  onFixed: (key: string, from: string, to: string) => void,
): void {
  for (const key of PERSON_FIELDS[dataset] ?? []) {
    const ref = rec[key]
    if (typeof ref !== 'string' || idx.ids.has(ref)) continue
    const m = matchPerson(ref, idx)
    if (m.kind === 'id-fixed') {
      rec[key] = m.id
      onFixed(key, ref, m.id)
    }
  }
  for (const key of PERSON_REF_FIELDS[dataset] ?? []) {
    const ref = rec[key]
    if (typeof ref !== 'string' || idx.ids.has(ref)) continue
    const m = matchPerson(ref, idx)
    if (m.kind === 'id-fixed' || m.kind === 'name') rec[key] = m.id
  }
  if (dataset === 'requisitions') {
    const name = rec.hiringManager
    if (rec.hiringManagerId == null && typeof name === 'string') {
      const m = matchPerson(name, idx)
      if (m.kind === 'name' || m.kind === 'id' || m.kind === 'id-fixed') rec.hiringManagerId = m.id
    }
  }
}

/** Keep one row per row key: the one with the latest date anywhere in it (later in the file on a tie). */
function dedupe(def: DatasetDef, built: Built[], issues: ImportIssue[], stats: ImportStats): Built[] {
  const dateKeys = def.fields.filter((f) => f.type === 'date' || f.type === 'datetime').map((f) => f.key)
  const recency = (rec: Record<string, unknown>) =>
    dateKeys.reduce((m, k) => {
      const v = rec[k]
      return typeof v === 'string' && v > m ? v : m
    }, '')
  const labels = def.rowKey.map((k) => def.fields.find((f) => f.key === k)?.label ?? k)
  const label = labels.join(' + ')
  const out: Built[] = []
  const at = new Map<string, number>()
  for (const b of built) {
    const key = def.rowKey.map((k) => String(b.rec[k] ?? '')).join('\u0001')
    const i = at.get(key)
    if (i === undefined) {
      at.set(key, out.length)
      out.push(b)
      continue
    }
    const prev = out[i]
    const rb = recency(b.rec)
    const rp = recency(prev.rec)
    const [keep, drop] = rb >= rp ? [b, prev] : [prev, b]
    const why =
      rb === rp ? 'the later row in the file was kept' : 'the row with the more recent dates was kept'
    out[i] = keep
    stats.duplicates++
    issues.push({
      row: drop.row,
      id: rowId(def, drop.rec),
      field: def.rowKey[0] ?? '',
      label,
      value: def.rowKey.map((k) => String(drop.rec[k] ?? '')).join(' · '),
      code: 'duplicate',
      issue: `Same ${label} as row ${keep.row}; ${why}.`,
      action: 'row-skipped',
    })
  }
  return out
}

function checkRoster(
  def: DatasetDef,
  kept: Built[],
  idx: PersonIndex,
  issues: ImportIssue[],
  stats: ImportStats,
): void {
  const fields = PERSON_FIELDS[def.key]
  if (!fields) return
  for (const b of kept) {
    let missing = false
    for (const key of fields) {
      const ref = b.rec[key]
      if (typeof ref !== 'string' || idx.ids.has(ref)) continue
      missing = true
      const label = def.fields.find((f) => f.key === key)?.label ?? key
      issues.push({
        row: b.row,
        id: rowId(def, b.rec),
        field: key,
        label,
        value: ref,
        code: 'not-in-roster',
        issue: `${cap(label)} ${ref} is not in the current roster.`,
        action: 'kept',
      })
    }
    if (missing) stats.notInRoster++
  }
}
