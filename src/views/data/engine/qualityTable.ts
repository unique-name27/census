/**
 * The Quality panel's field table and its export: each field's rows it applies to, fill rate,
 * values not recognized or defaulted, rows remapped by reference mappings and its tier, from the
 * quality index. Pure.
 */
import type { Column } from '@/charts/types'
import type { FieldRowKind, FieldStats, Tier } from '@/data/quality'
import { TIER_LABEL, tierRank } from '@/data/quality'
import type { DatasetDef } from '@/data/schema'
import { REQUIREMENT_LABEL, type Requirement, requirementOf } from './coverage'

export interface QualityRow extends FieldStats {
  field: string
  requirement: Requirement
  pay: boolean
}

const REQ_RANK: Record<Requirement, number> = { required: 0, recommended: 1, optional: 2 }

/** Required fields first, then recommended, then optional; schema order within each. */
export function qualityRows(def: Pick<DatasetDef, 'fields'>, stats: readonly FieldStats[]): QualityRow[] {
  const byKey = new Map(def.fields.map((f, i) => [f.key, { f, i }]))
  return stats
    .flatMap((s) => {
      const field = s.ref.slice(s.ref.indexOf('.') + 1)
      const d = byKey.get(field)
      if (!d) return []
      return [{ row: { ...s, field, requirement: requirementOf(d.f), pay: !!d.f.pay }, i: d.i }]
    })
    .sort((a, b) => REQ_RANK[a.row.requirement] - REQ_RANK[b.row.requirement] || a.i - b.i)
    .map((x) => x.row)
}

/** How many fields sit at each tier. */
export function tierCounts(rows: readonly Pick<FieldStats, 'tier'>[]): Record<Tier, number> {
  const out: Record<Tier, number> = { none: 0, bronze: 0, silver: 0, gold: 0 }
  for (const r of rows) out[r.tier]++
  return out
}

/** Fields below their dataset's tier, the ones that hold numbers back. */
export function cappedFields(rows: readonly QualityRow[], datasetTier: Tier): QualityRow[] {
  return rows.filter((r) => tierRank(r.tier) < tierRank(datasetTier))
}

/** "34 blank": the drill wording for one of a field's numbers. */
export const FIELD_ROWS_NOUN: Record<FieldRowKind, string> = {
  applicable: 'rows it applies to',
  filled: 'rows with a value',
  blank: 'rows with no value',
  invalid: 'rows with a value that was not recognized',
  defaulted: 'rows filled by a default',
  remapped: 'rows changed by your reference mappings',
}

/* ───────────── export ───────────── */

export const QUALITY_COLUMNS: Column[] = [
  { key: 'field', label: 'Field', width: 24 },
  { key: 'requirement', label: 'Needed', width: 12 },
  { key: 'scope', label: 'Which rows count', width: 34 },
  { key: 'applicable', label: 'Rows it applies to', format: 'int' },
  { key: 'filled', label: 'Rows filled', format: 'int' },
  { key: 'coverage', label: 'Filled', format: 'pct' },
  { key: 'blank', label: 'Blank', format: 'int' },
  { key: 'invalid', label: 'Not recognized', format: 'int' },
  { key: 'defaulted', label: 'Defaulted', format: 'int' },
  { key: 'remapped', label: 'Remapped', format: 'int' },
  { key: 'tier', label: 'Tier', width: 10 },
  { key: 'why', label: 'Why below the dataset', width: 60 },
]

export function qualityExportRows(rows: readonly QualityRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    field: r.label,
    requirement: REQUIREMENT_LABEL[r.requirement],
    scope: r.scope ?? 'All rows',
    applicable: r.applicableRows,
    filled: r.filled,
    coverage: r.coverage,
    blank: r.blank,
    invalid: r.invalid,
    defaulted: r.defaulted,
    remapped: r.remapped,
    tier: TIER_LABEL[r.tier],
    why: r.capReason ?? '',
  }))
}

export const RULE_COLUMNS: Column[] = [
  { key: 'check', label: 'Check', width: 28 },
  { key: 'needed', label: 'Needed for', width: 12 },
  { key: 'result', label: 'Result', width: 8 },
  { key: 'detail', label: 'Detail', width: 70 },
  { key: 'rows', label: 'Rows', format: 'int' },
]

const GATE_WORD = { silver: 'Silver', gold: 'Gold' } as const

export function ruleExportRows(
  rules: readonly {
    label: string
    gate: 'silver' | 'gold' | null
    pass: boolean
    detail: string
    count: number
  }[],
): Record<string, unknown>[] {
  return rules.map((r) => ({
    check: r.label,
    needed: r.gate ? GATE_WORD[r.gate] : 'Information',
    result: r.pass ? 'Pass' : 'Fail',
    detail: r.detail,
    rows: r.count,
  }))
}

/** "To reach silver: mapping confirmed and references resolve." Null at gold. */
export function nextTierText(tier: Tier, missing: readonly string[]): string | null {
  if (tier === 'none') return 'Load rows to reach bronze.'
  if (tier === 'gold' || !missing.length) return null
  const next = tier === 'bronze' ? 'silver' : 'gold'
  const parts = missing.map((m) => m.charAt(0).toLowerCase() + m.slice(1))
  const list = parts.length < 2 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `To reach ${next}: ${list}.`
}
