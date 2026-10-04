/**
 * Bringing dictionary changes in from a file: the summary every import reports, and the
 * dictionary section of the Census settings file. Pure.
 */
import { moveSettings } from './moved'
import { applyEdits, type ChangeOpts, cleanOverride, currentValue, fieldsOf } from './overrides'
import type { MetricCatalog } from './registry'
import type {
  MetricChange,
  MetricEdit,
  MetricImportReport,
  MetricOverrides,
  MetricsState,
  RejectedValue,
} from './types'

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** "Changed 3 values in 2 metrics. 1 value was not applied." */
export function importSummary(
  changed: readonly MetricChange[],
  rejected: readonly RejectedValue[],
  unknown: readonly string[],
): string {
  const metrics = new Set(changed.map((c) => c.metricId)).size
  const parts = [
    changed.length
      ? `Changed ${plural(changed.length, 'value')} in ${plural(metrics, 'metric')}.`
      : rejected.length
        ? 'Nothing changed.'
        : 'Nothing changed: every value in the file matches what is in force.',
  ]
  if (rejected.length)
    parts.push(`${plural(rejected.length, 'value')} ${rejected.length === 1 ? 'was' : 'were'} not applied.`)
  if (unknown.length)
    parts.push(
      `${plural(unknown.length, 'metric ID')} in the file ${unknown.length === 1 ? 'is' : 'are'} not in Census and ${unknown.length === 1 ? 'was' : 'were'} skipped.`,
    )
  return parts.join(' ')
}

/** Apply planned edits as one import and report what happened, field by field. */
export function applyImport(
  state: MetricsState,
  catalog: MetricCatalog,
  planned: readonly { edit: MetricEdit; where?: Pick<RejectedValue, 'sheet' | 'row' | 'value'> }[],
  rejectedBefore: readonly RejectedValue[],
  unknown: readonly string[],
  opts: Omit<ChangeOpts, 'kind'> = {},
): { state: MetricsState; report: MetricImportReport } {
  const where = new Map(planned.map((p) => [p.edit, p.where]))
  const r = applyEdits(
    state,
    catalog,
    planned.map((p) => p.edit),
    { ...opts, kind: 'import' },
  )
  // In file order: by sheet, then row (values without a place keep their order, first).
  const rejected: RejectedValue[] = [
    ...rejectedBefore,
    ...r.rejected.map(({ edit, error }) => ({
      metricId: edit.metricId,
      field: edit.field,
      reason: error,
      ...where.get(edit),
    })),
  ].sort((a, b) => (a.sheet ?? '').localeCompare(b.sheet ?? '') || (a.row ?? 0) - (b.row ?? 0))
  return {
    state: r.state,
    report: { changed: r.applied, rejected, unknown, summary: importSummary(r.applied, rejected, unknown) },
  }
}

/* ───────────── settings file ───────────── */

/** The dictionary as it travels in the settings file: your overrides, and the change log for reference. */
export interface MetricsFileSection {
  overrides: MetricOverrides
  log?: MetricsState['log']
}

export const metricsFileSection = (state: MetricsState): MetricsFileSection => ({
  overrides: state.overrides,
  log: state.log,
})

/**
 * Apply the dictionary section of a settings file. The file is a snapshot: every registered
 * metric ends up with the file's values, and a metric the file doesn't mention goes back to its
 * defaults. A value that is invalid (or past a lock) keeps the value in force and is reported.
 */
export function importMetricsSection(
  raw: unknown,
  state: MetricsState,
  catalog: MetricCatalog,
  opts: Omit<ChangeOpts, 'kind'> = {},
): { ok: true; state: MetricsState; report: MetricImportReport } | { ok: false; error: string } {
  const section = raw as Partial<MetricsFileSection> | null
  if (!section || typeof section !== 'object' || !section.overrides || typeof section.overrides !== 'object')
    return { ok: false, error: 'The metric definitions in the file are not readable.' }
  // Settings that moved to one home keep the value the file holds at the old place.
  const moved = moveSettings(section, catalog) as Partial<MetricsFileSection>
  const fileOverrides = moved.overrides as Record<string, unknown>
  const unknown = Object.keys(fileOverrides).filter((id) => !catalog.byId.has(id))
  const planned: { edit: MetricEdit }[] = []
  const rejected: RejectedValue[] = []
  for (const def of catalog.list) {
    const { override, problems } = cleanOverride(def, fileOverrides[def.id])
    const bad = new Set(problems.map((p) => p.field))
    for (const p of problems) rejected.push({ metricId: def.id, field: p.field, reason: p.reason })
    for (const field of fieldsOf(def)) {
      if (bad.has(field)) continue
      planned.push({ edit: { metricId: def.id, field, value: currentValue(def, override, field) } })
    }
  }
  return { ok: true, ...applyImport(state, catalog, planned, rejected, unknown, opts) }
}
