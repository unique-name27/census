/**
 * Field coverage: how much of each dataset's fields the loaded rows actually fill.
 *
 * A field's coverage is the share of rows that hold a value. A few fields only apply to some
 * rows (a next interview date only exists for candidates who are interviewing), so those count
 * only the rows they apply to. The dataset's coverage is the mean over its required and
 * recommended fields, the ones the views depend on.
 */
import type { DatasetDef, DatasetKey, FieldDef } from '@/data/schema'

export type Requirement = 'required' | 'recommended' | 'optional'

export const requirementOf = (f: Pick<FieldDef, 'required' | 'recommended'>): Requirement =>
  f.required ? 'required' : f.recommended ? 'recommended' : 'optional'

export const REQUIREMENT_LABEL: Record<Requirement, string> = {
  required: 'Required',
  recommended: 'Recommended',
  optional: 'Optional',
}

export interface FieldCoverage {
  key: string
  label: string
  requirement: Requirement
  /** Pay amount field: its fill rate is fine to show, its values are not. */
  pay: boolean
  /** Rows the field applies to. */
  expected: number
  /** Rows among `expected` that hold a value. */
  filled: number
  /** filled ÷ expected; null when no row applies. */
  share: number | null
  /** Which rows count, when not all of them. */
  scope: string | null
}

export interface DatasetCoverage {
  key: DatasetKey
  rows: number
  fields: FieldCoverage[]
  /** Mean share over required and recommended fields; null for an empty dataset. */
  core: number | null
  /** Required and recommended fields that apply to some rows but are filled in none. */
  emptyCore: FieldCoverage[]
}

/** The importer's placeholder for a value it could not fill responsibly. */
const UNKNOWN = 'Unknown'

/** A value that counts as filled: not blank, not NaN, not the importer's "Unknown" placeholder. */
export function isFilled(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'number') return Number.isFinite(v)
  if (typeof v === 'string') {
    const t = v.trim()
    return t !== '' && t !== UNKNOWN
  }
  return true
}

type Row = Record<string, unknown>

interface Applicability {
  applies: (row: Row) => boolean
  scope: string
}

const INTERVIEW_STAGES = new Set(['Screen', 'Hiring manager', 'Onsite'])

/** Fields that only apply to some rows of their dataset. */
export const CONDITIONAL_FIELDS: Partial<Record<DatasetKey, Record<string, Applicability>>> = {
  candidates: {
    nextEventDate: {
      applies: (r) => r.status === 'Active' && INTERVIEW_STAGES.has(String(r.currentStage)),
      scope: 'Active candidates in interview stages',
    },
  },
}

export function fieldCoverage(def: DatasetDef, rows: readonly object[]): DatasetCoverage {
  const rules = CONDITIONAL_FIELDS[def.key] ?? {}
  const fields: FieldCoverage[] = def.fields.map((f) => {
    const rule = rules[f.key]
    let expected = 0
    let filled = 0
    for (const r of rows as readonly Row[]) {
      if (rule && !rule.applies(r)) continue
      expected++
      if (isFilled(r[f.key])) filled++
    }
    return {
      key: f.key,
      label: f.label,
      requirement: requirementOf(f),
      pay: !!f.pay,
      expected,
      filled,
      share: expected ? filled / expected : null,
      scope: rule?.scope ?? null,
    }
  })
  const core = fields.filter((f) => f.requirement !== 'optional' && f.share != null)
  return {
    key: def.key,
    rows: rows.length,
    fields,
    core: rows.length && core.length ? core.reduce((a, f) => a + (f.share ?? 0), 0) / core.length : null,
    emptyCore: core.filter((f) => f.filled === 0),
  }
}
