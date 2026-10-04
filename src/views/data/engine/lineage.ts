/**
 * Lineage of a dataset version, field by field: which column of the file filled it, how the
 * values were converted on the way in (date order, percent scale, hourly pay, spellings the
 * importer standardized, corrections made by hand), how sure the automatic match was, and whether
 * a person reviewed it. Also turns a stored
 * mapping back into the upload dialog's mapping, so a version can be re-mapped from its raw sheet.
 * Pure.
 */
import type { Column } from '@/charts/types'
import type { ApplyOptions, Confidence, MappedField, Mapping } from '@/data/import'
import { normText } from '@/data/import/text'
import type { DatasetVersion, VersionMapping } from '@/data/quality'
import { byWho, shortDate } from '@/data/quality/text'
import type { DatasetDef } from '@/data/schema'
import { fmt } from '@/lib/format'
import { REQUIREMENT_LABEL, type Requirement, requirementOf } from './coverage'

/** How a field got its values in this version. */
export type FillSource =
  /** From a column of the file. */
  | 'column'
  /** No column; built from other columns of the same row (a name from first and last name). */
  | 'derived'
  /** No column; the importer filled a documented default. */
  | 'defaulted'
  /** No column and no values. */
  | 'none'

export interface LineageRow {
  field: string
  label: string
  requirement: Requirement
  /** Pay amount field: its values stay hidden while pay amounts are off (its column name is fine). */
  pay: boolean
  /** Source column, or null when the file had none for the field. */
  header: string | null
  source: FillSource
  /** Plain phrases: "Dates read day first (DD/MM/YYYY)", "3 values corrected by hand". */
  conversions: string[]
  /** How sure the automatic match was; null without a column. */
  confidence: Confidence | null
  /** A person reviewed this field's column. */
  confirmed: boolean
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const SOURCE_LABEL: Record<FillSource, string> = {
  column: 'From the file',
  derived: 'Derived from other columns',
  defaulted: 'Filled by a default',
  none: 'Not in the file',
}

const REQ_RANK: Record<Requirement, number> = { required: 0, recommended: 1, optional: 2 }

const plural = (n: number, one: string, many: string) => `${fmt(n, 'int')} ${n === 1 ? one : many}`

/** A distinct raw value of a column and what the importer read it as (`rawSpellings`). */
export interface Spelling {
  raw: string
  value: string | null
  count: number
}

/** Values the importer standardized on its own: how many, and the most common changes. */
export interface Standardized {
  total: number
  examples: { from: string; to: string }[]
}

/**
 * The raw spellings the importer read as a different canonical value without being told to
 * ("IC4" read as L4). Values corrected by hand (`valueMaps`) and values not recognized are left
 * out; they have their own lines. Null when every value was read as is.
 */
export function standardizedOf(
  spellings: readonly Spelling[] | undefined,
  byHand?: Readonly<Record<string, unknown>>,
): Standardized | null {
  if (!spellings?.length) return null
  const changed = spellings.filter(
    (s) => s.value != null && s.value !== s.raw && !(byHand && Object.hasOwn(byHand, normText(s.raw))),
  )
  if (!changed.length) return null
  const examples = [...changed]
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map((s) => ({ from: s.raw, to: s.value as string }))
  return { total: changed.reduce((a, s) => a + s.count, 0), examples }
}

/** "1,214 values standardized, such as IC4 → L4 and IC2 → L2". */
export function standardizedText(s: Standardized): string {
  const such = s.examples.map((e) => `${e.from} → ${e.to}`)
  const list = such.length > 1 ? `${such.slice(0, -1).join(', ')} and ${such[such.length - 1]}` : such[0]
  return `${plural(s.total, 'value', 'values')} standardized${list ? `, such as ${list}` : ''}`
}

/** Conversions the importer applied to one field, in plain words. */
export function conversionsOf(
  def: Pick<DatasetDef, 'key'>,
  field: { key: string; type: string },
  header: string | null,
  options: ApplyOptions | null | undefined,
): string[] {
  const out: string[] = []
  if (!options) return out
  if (header && (field.type === 'date' || field.type === 'datetime')) {
    const order = options.dateOrders?.[header]
    if (order === 'DMY') out.push('Dates read day first (DD/MM/YYYY)')
    else if (order === 'MDY') out.push('Dates read month first (MM/DD/YYYY)')
  }
  if (header && field.type === 'percent') {
    const whole = options.percentWhole?.[field.key]
    if (whole === true) out.push('Whole numbers read as percent (3.5 means 3.5%)')
    else if (whole === false) out.push('Fractions read as percent (0.035 means 3.5%)')
  }
  if (header && def.key === 'comp' && field.key === 'baseSalary' && options.hourlyToAnnual) {
    const h = options.hourlyToAnnual
    out.push(
      `Hourly rates annualized at ${fmt(h.hours, 'int')} h a year${h.basisHeader ? `, where ${h.basisHeader} says hourly` : ''}`,
    )
  }
  const fixes = options.valueMaps?.[field.key]
  if (fixes) {
    const values = Object.values(fixes)
    const corrected = values.filter((v) => v != null).length
    const blanked = values.length - corrected
    if (corrected) out.push(`${plural(corrected, 'value', 'values')} corrected by hand`)
    if (blanked) out.push(`${plural(blanked, 'value', 'values')} left blank on purpose`)
  }
  return out
}

/**
 * One row per field of the dataset, required fields first. `filled` (per field key, from the
 * quality index) tells a derived field from one left empty when the file had no column.
 * `spellings` (per field key, from the stored sheet) adds the values the importer standardized.
 */
export function lineageRows(
  def: DatasetDef,
  version: Pick<DatasetVersion, 'mapping' | 'applyOptions' | 'issues'>,
  filled?: Readonly<Record<string, number>>,
  spellings?: Readonly<Record<string, readonly Spelling[]>>,
): LineageRow[] {
  const rows = def.fields.map((f, i) => {
    const m = version.mapping[f.key]
    const header = m?.header ?? null
    const defaulted = version.issues.defaultedByField[f.key] ?? 0
    const source: FillSource = header
      ? 'column'
      : defaulted > 0
        ? 'defaulted'
        : (filled?.[f.key] ?? 0) > 0
          ? 'derived'
          : 'none'
    const conversions = conversionsOf(def, f, header, version.applyOptions)
    const standardized = header
      ? standardizedOf(spellings?.[f.key], version.applyOptions?.valueMaps?.[f.key])
      : null
    if (standardized) conversions.unshift(standardizedText(standardized))
    if (source === 'defaulted') conversions.unshift(`${plural(defaulted, 'row', 'rows')} filled by a default`)
    return {
      row: {
        field: f.key,
        label: f.label,
        requirement: requirementOf(f),
        pay: !!f.pay,
        header,
        source,
        conversions,
        confidence: header ? (m?.confidence ?? null) : null,
        confirmed: !!m?.confirmed,
      } satisfies LineageRow,
      i,
    }
  })
  return rows
    .sort((a, b) => REQ_RANK[a.row.requirement] - REQ_RANK[b.row.requirement] || a.i - b.i)
    .map((x) => x.row)
}

/** The version records which columns filled which fields (not the generated sample or an old upload). */
export const hasLineage = (version: Pick<DatasetVersion, 'mapping'>): boolean =>
  Object.keys(version.mapping).length > 0

export interface LineageSummary {
  fields: number
  fromFile: number
  /** Fields matched with low confidence that a person has not reviewed. */
  lowUnreviewed: number
  /** Required or recommended fields with no column and no values. */
  missingNeeded: number
}

export function lineageSummary(rows: readonly LineageRow[]): LineageSummary {
  return {
    fields: rows.length,
    fromFile: rows.filter((r) => r.source === 'column').length,
    lowUnreviewed: rows.filter((r) => r.confidence === 'low' && !r.confirmed).length,
    missingNeeded: rows.filter((r) => r.source === 'none' && r.requirement !== 'optional').length,
  }
}

/** "Confirmed 2 Oct by Jamie" or "Not confirmed yet". */
export function mappingStatusText(
  version: Pick<DatasetVersion, 'mappingConfirmedAt' | 'mappingConfirmedBy'>,
  refYear?: string,
): string {
  return version.mappingConfirmedAt
    ? `Confirmed ${shortDate(version.mappingConfirmedAt, refYear)} by ${byWho(version.mappingConfirmedBy)}`
    : 'Not confirmed yet'
}

/* ───────────── export ───────────── */

export const LINEAGE_COLUMNS: Column[] = [
  { key: 'field', label: 'Field', width: 24 },
  { key: 'requirement', label: 'Needed', width: 12 },
  { key: 'header', label: 'Source column', width: 28 },
  { key: 'source', label: 'How it was filled', width: 24 },
  { key: 'conversion', label: 'Conversion', width: 48 },
  { key: 'confidence', label: 'Match confidence', width: 14 },
  { key: 'confirmed', label: 'Reviewed', width: 10 },
]

export function lineageExportRows(rows: readonly LineageRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    field: r.label,
    requirement: REQUIREMENT_LABEL[r.requirement],
    header: r.header ?? '',
    source: SOURCE_LABEL[r.source],
    conversion: r.conversions.join('; '),
    confidence: r.confidence ? CONFIDENCE_LABEL[r.confidence] : '',
    confirmed: r.confirmed ? 'Yes' : 'No',
  }))
}

/* ───────────── re-map ───────────── */

const SCORE: Record<Confidence, number> = { high: 1, medium: 0.75, low: 0.5 }

/**
 * The upload dialog's mapping for a stored version: each field keeps the column it was read from
 * when the sheet still has it; fields the version doesn't name keep the automatic match.
 */
export function draftMapping(
  def: Pick<DatasetDef, 'fields'>,
  stored: VersionMapping,
  headers: readonly string[],
  auto: Mapping,
): Mapping {
  const have = new Set(headers)
  const out: Mapping = {}
  const taken = new Set<string>()
  for (const f of def.fields) {
    const s = stored[f.key]
    if (!s) continue
    if (s.header && have.has(s.header)) {
      out[f.key] = {
        header: s.header,
        confidence: s.confirmed ? 'high' : s.confidence,
        score: s.confirmed ? 1 : SCORE[s.confidence],
        reason: s.confirmed ? 'Reviewed in the current version' : 'Used in the current version',
      } satisfies MappedField
      taken.add(s.header)
    } else if (s.header == null)
      out[f.key] = { header: null, confidence: 'low', score: 0, reason: 'No column in the current version' }
  }
  for (const f of def.fields) {
    if (out[f.key]) continue
    const a = auto[f.key]
    out[f.key] =
      a?.header && !taken.has(a.header)
        ? a
        : { header: null, confidence: 'low', score: 0, reason: 'No matching column' }
    if (a?.header) taken.add(a.header)
  }
  return out
}
