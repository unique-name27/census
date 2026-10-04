/**
 * Rule results as the dashboard judges them, with the rows behind each from the drill index.
 * Pure.
 */
import type { QualityIndex, RuleResult } from '@/data/quality/types'
import type { DatasetKey } from '@/data/schema'

/**
 * `q`'s rule results for a dataset (its counts and verdicts: the rules in force, your reference
 * mappings) with the rows the drill index `drillQ` finds behind each: rows with an import error
 * (from the import logs), and the rows a passing rule still names, such as a few references that
 * don't resolve within the share allowed. A failing rule keeps its count, which may include rows
 * the import skipped; a passing rule counts the rows it names.
 */
export function withDrillRows(
  q: Pick<QualityIndex, 'checks'>,
  drillQ: Pick<QualityIndex, 'checks'>,
  key: DatasetKey,
): RuleResult[] {
  const extra = new Map(drillQ.checks(key).map((r) => [r.id, r.rows]))
  return q.checks(key).map((r) => {
    const rows = extra.get(r.id)
    if (!rows?.length || rows.length === r.rows.length) return r
    return { ...r, rows, count: r.pass ? rows.length : r.count }
  })
}

/**
 * The rows a fix's drill opens: every row behind the checks it has to pass, each once, and how
 * many rows those checks count that are not loaded any more (an import error on a row the import
 * skipped).
 */
export function fixRows(rules: readonly Pick<RuleResult, 'rows' | 'count'>[]): {
  indexes: number[]
  notLoaded: number
} {
  const indexes = [...new Set(rules.flatMap((r) => r.rows))].sort((a, b) => a - b)
  const notLoaded = rules.reduce((a, r) => a + Math.max(0, r.count - r.rows.length), 0)
  return { indexes, notLoaded }
}
