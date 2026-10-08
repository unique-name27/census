/**
 * The "Reference mapping" workbook: your changes as rows anyone can read (and the HRIS team can
 * apply at the source), plus a column that lets Census read the file back exactly. Reading
 * accepts the readable columns too, so a sheet typed by hand also works. Pure.
 */
import type { Column } from '@/charts/types'
import type { ParsedSheet } from '@/data/import/types'
import { isFieldRef } from '@/data/quality/fieldRef'
import {
  categoryOf,
  describeMapping,
  type NewReferenceMapping,
  type ReferenceAudit,
  type ReferenceMapping,
  validateMapping,
} from '@/data/reference'
import { fieldLabel } from './lists'

export const CHANGE_LABEL: Record<ReferenceMapping['kind'], string> = {
  'move-department': 'Move department',
  'move-function': 'Move job function',
  'move-family': 'Set job function (before job families held functions)',
  merge: 'Merge values',
  rename: 'Rename value',
}

/** Why a legacy row (a job family moved under a function) is not read back. */
export const LEGACY_REFUSED = 'Made before job families held job functions; not imported.'

export const SCOPE_LABEL = { category: 'Every field of the category', field: 'This field only' } as const

/** Joins the values a merge replaces in one cell. */
export const VALUE_SEPARATOR = ' | '

export interface MappingRow {
  order: number
  change: string
  field: string
  fieldRef: string
  scope: string
  subject: string
  from: string
  to: string
  rows: number | null
  description: string
  by: string
  at: string
  status: string
  json: string
}

export const MAPPING_COLUMNS: Column<MappingRow>[] = [
  { key: 'order', label: 'Order', format: 'int' },
  { key: 'change', label: 'Change' },
  { key: 'field', label: 'Field' },
  { key: 'fieldRef', label: 'Field reference' },
  { key: 'scope', label: 'Applies to' },
  { key: 'subject', label: 'Department or job function' },
  { key: 'from', label: 'From' },
  { key: 'to', label: 'To' },
  { key: 'rows', label: 'Rows changed', format: 'int' },
  { key: 'description', label: 'Description' },
  { key: 'by', label: 'Made by' },
  { key: 'at', label: 'Made at' },
  { key: 'status', label: 'Status' },
  { key: 'json', label: 'Mapping for import' },
]

type Essence =
  | NewReferenceMapping
  | Omit<Extract<ReferenceMapping, { kind: 'move-family' }>, 'id' | 'at' | 'by'>

/** The parts of a mapping that decide what it does (no id, author or time). */
function essence(m: ReferenceMapping | NewReferenceMapping): Essence {
  switch (m.kind) {
    case 'move-department':
      return { kind: m.kind, department: m.department, from: m.from ?? null, to: m.to }
    case 'move-function':
      return { kind: m.kind, jobFunction: m.jobFunction, from: m.from ?? null, to: m.to }
    case 'move-family':
      return { kind: m.kind, jobFamily: m.jobFamily, from: m.from ?? null, to: m.to }
    default:
      return { kind: m.kind, ref: m.ref, from: [...m.from], to: m.to, scope: m.scope ?? 'category' }
  }
}

/** Two mappings that do the same thing have the same signature. */
export function mappingSignature(m: ReferenceMapping | NewReferenceMapping): string {
  const e = essence(m)
  if (e.kind === 'merge' || e.kind === 'rename')
    return JSON.stringify({ ...e, from: [...e.from].map((v) => v.trim()).sort() })
  return JSON.stringify(e)
}

export function mappingRows(
  mappings: readonly ReferenceMapping[],
  perMapping: Readonly<Record<string, number>> = {},
  skipped: readonly { id: string; reason: string }[] = [],
): MappingRow[] {
  const why = new Map(skipped.map((s) => [s.id, s.reason]))
  return mappings.map((m, i) => {
    const base = {
      order: i + 1,
      change: CHANGE_LABEL[m.kind],
      rows: perMapping[m.id] ?? null,
      description: describeMapping(m),
      by: m.by ?? '',
      at: m.at,
      status: why.has(m.id) ? `Not applied: ${why.get(m.id)}` : 'Applied',
      json: JSON.stringify({ ...essence(m), by: m.by ?? null, at: m.at }),
    }
    switch (m.kind) {
      case 'move-department':
        return {
          ...base,
          field: 'Employees, Requisitions and Hiring plan: Business unit',
          fieldRef: 'employees.businessUnit',
          scope: SCOPE_LABEL.field,
          subject: m.department,
          from: m.from ?? '',
          to: m.to,
        }
      case 'move-function':
        return {
          ...base,
          field: 'Employees: Job family',
          fieldRef: 'employees.jobFamily',
          scope: SCOPE_LABEL.field,
          subject: m.jobFunction,
          from: m.from ?? '',
          to: m.to,
        }
      case 'move-family':
        return {
          ...base,
          field: 'Employees: Job function',
          fieldRef: 'employees.jobFunction',
          scope: SCOPE_LABEL.field,
          subject: m.jobFamily,
          from: m.from ?? '',
          to: m.to,
        }
      default:
        return {
          ...base,
          field: fieldLabel(m.ref),
          fieldRef: m.ref,
          scope: SCOPE_LABEL[m.scope ?? 'category'],
          subject: '',
          from: m.from.join(VALUE_SEPARATOR),
          to: m.to,
        }
    }
  })
}

export interface AuditRow {
  at: string
  by: string
  what: string
  action: string
}

export const AUDIT_COLUMNS: Column<AuditRow>[] = [
  { key: 'at', label: 'When' },
  { key: 'by', label: 'Who' },
  { key: 'action', label: 'Action' },
  { key: 'what', label: 'Change' },
]

export function auditRows(audit: readonly ReferenceAudit[]): AuditRow[] {
  return audit.map((a) => ({
    at: a.at,
    by: a.by?.trim() ? a.by : 'Not named',
    action: a.action === 'add' ? 'Added' : 'Removed',
    what: a.what,
  }))
}

/* ───────────── reading a workbook back ───────────── */

/** A mapping read from the file, with the author it names (if any). */
export type ParsedMapping = NewReferenceMapping & { by?: string | null }

export interface ParseResult {
  mappings: ParsedMapping[]
  /** Rows that could not be read: Excel row number and why. */
  errors: { row: number; message: string }[]
}

const key = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '')

const HEADER: Record<string, keyof MappingRow> = {
  change: 'change',
  kind: 'change',
  fieldreference: 'fieldRef',
  field: 'field',
  appliesto: 'scope',
  scope: 'scope',
  departmentorjobfunction: 'subject',
  departmentorjobfamily: 'subject',
  department: 'subject',
  jobfunction: 'subject',
  jobfamily: 'subject',
  from: 'from',
  to: 'to',
  madeby: 'by',
  by: 'by',
  mappingforimport: 'json',
}

const text = (v: unknown): string => (v == null ? '' : v instanceof Date ? v.toISOString() : String(v).trim())

function kindOf(change: string): ReferenceMapping['kind'] | null {
  const k = key(change)
  for (const [kind, label] of Object.entries(CHANGE_LABEL) as [ReferenceMapping['kind'], string][])
    if (k === key(label) || k === key(kind)) return kind
  if (k === 'merge') return 'merge'
  if (k === 'rename') return 'rename'
  if (k === 'movedepartment' || k === 'department') return 'move-department'
  if (k === 'movefunction' || k === 'movejobfunction' || k === 'assignjobfunction') return 'move-function'
  if (k === 'movefamily' || k === 'movejobfamily' || k === 'assignjobfamily') return 'move-family'
  return null
}

function fromJson(raw: string): ParsedMapping | string {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return 'The mapping column is not readable.'
  }
  if (!v || typeof v !== 'object') return 'The mapping column is not readable.'
  const o = v as Record<string, unknown>
  const str = (x: unknown) => (typeof x === 'string' ? x : null)
  const by = str(o.by)
  switch (o.kind) {
    case 'move-department':
      return { kind: o.kind, department: str(o.department) ?? '', from: str(o.from), to: str(o.to) ?? '', by }
    case 'move-function':
      return {
        kind: o.kind,
        jobFunction: str(o.jobFunction) ?? '',
        from: str(o.from),
        to: str(o.to) ?? '',
        by,
      }
    case 'move-family':
      return LEGACY_REFUSED
    case 'merge':
    case 'rename': {
      const ref = str(o.ref) ?? ''
      if (!isFieldRef(ref)) return `${ref || 'The field'} is not a field Census knows.`
      const from = Array.isArray(o.from) ? o.from.filter((x): x is string => typeof x === 'string') : []
      return {
        kind: o.kind,
        ref,
        from,
        to: str(o.to) ?? '',
        scope: o.scope === 'field' ? 'field' : 'category',
        by,
      }
    }
    default:
      return 'The mapping column names no known change.'
  }
}

function fromColumns(r: Partial<Record<keyof MappingRow, string>>): ParsedMapping | string {
  const kind = kindOf(r.change ?? '')
  if (!kind)
    return `"${r.change ?? ''}" is not a change Census knows. Use ${Object.entries(CHANGE_LABEL)
      .filter(([k]) => k !== 'move-family')
      .map(([, l]) => l)
      .join(', ')}.`
  const by = r.by || null
  if (kind === 'move-department')
    return { kind, department: r.subject ?? '', from: r.from || null, to: r.to ?? '', by }
  if (kind === 'move-function')
    return { kind, jobFunction: r.subject ?? '', from: r.from || null, to: r.to ?? '', by }
  if (kind === 'move-family') return LEGACY_REFUSED
  const ref = r.fieldRef || (isFieldRef(r.field ?? '') ? (r.field ?? '') : '')
  if (!isFieldRef(ref) || !categoryOf(ref))
    return `${ref ? `"${ref}"` : 'The field reference'} is not a categorical field (for example employees.department).`
  const scopeKey = key(r.scope ?? '')
  return {
    kind,
    ref,
    from: (r.from ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    to: r.to ?? '',
    scope: scopeKey === key(SCOPE_LABEL.field) || scopeKey === 'field' ? 'field' : 'category',
    by,
  }
}

/** Read the mappings of a "Mappings" sheet. Rows are read in order; each one is validated. */
export function parseMappingSheet(sheet: ParsedSheet): ParseResult {
  const cols = new Map<string, keyof MappingRow>()
  for (const h of sheet.headers) {
    const k = HEADER[key(h)]
    if (k && ![...cols.values()].includes(k)) cols.set(h, k)
  }
  const out: ParseResult = { mappings: [], errors: [] }
  if (![...cols.values()].includes('change') && ![...cols.values()].includes('json')) {
    out.errors.push({ row: sheet.headerRow + 1, message: 'No "Change" column was found on the sheet.' })
    return out
  }
  sheet.rows.forEach((raw, i) => {
    const row = sheet.rowNumbers[i] ?? i + 1
    const r: Partial<Record<keyof MappingRow, string>> = {}
    for (const [h, k] of cols) r[k] = text(raw[h])
    if (!Object.values(r).some(Boolean)) return
    const m = r.json ? fromJson(r.json) : fromColumns(r)
    if (typeof m === 'string') {
      out.errors.push({ row, message: m })
      return
    }
    const err = validateMapping(m)
    if (err) out.errors.push({ row, message: err })
    else out.mappings.push(m)
  })
  return out
}

/** The sheet to read: "Mappings" by name, else the first sheet with a change column. */
export function pickMappingSheet(sheets: readonly ParsedSheet[]): ParsedSheet | null {
  const byName = sheets.find((s) => key(s.name) === 'mappings')
  if (byName) return byName
  return (
    sheets.find((s) => s.headers.some((h) => HEADER[key(h)] === 'change' || HEADER[key(h)] === 'json')) ??
    null
  )
}

/** Split parsed mappings into new ones and ones already in place (also within the file). */
export function newMappings(
  parsed: readonly ParsedMapping[],
  existing: readonly ReferenceMapping[],
): { add: ParsedMapping[]; duplicates: number } {
  const seen = new Set(existing.map(mappingSignature))
  const add: ParsedMapping[] = []
  let duplicates = 0
  for (const m of parsed) {
    const s = mappingSignature(m)
    if (seen.has(s)) duplicates++
    else {
      seen.add(s)
      add.push(m)
    }
  }
  return { add, duplicates }
}

/** The mapping without the author the file names, as the store takes it. */
export function withoutBy(m: ParsedMapping): NewReferenceMapping {
  const { by: _by, ...rest } = m
  return rest as NewReferenceMapping
}
