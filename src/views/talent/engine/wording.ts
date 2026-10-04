/**
 * Definitions on screen come from the metric dictionary (`ctx.metrics`), so a definition edited
 * in Metric definitions shows on every KPI popover, figure datasheet and finding. When a metric's
 * settings or target differ from the defaults, one more sentence says so with the values in force,
 * because the registry wording names the defaults.
 * Pure: no React, no DOM.
 */
import type { Definition } from '@/charts/types'
import { fmt } from '@/lib/format'
import type { MetricDefinition } from '@/metrics/api'
import { formatFieldValue, targetText } from '@/metrics/overrides'
import { paramKeyOf } from '@/metrics/registry'
import type { MetricsApi, MetricTarget } from '@/metrics/types'

type Metrics = Pick<MetricsApi, 'def' | 'defaultDef' | 'changedFields' | 'param' | 'target'>

/** The definition in force (your wording, or the default); '' when the id is not registered. */
export const metricText = (m: Pick<MetricsApi, 'def'>, id: string): string => m.def(id)?.definition ?? ''

/** A metric as a Figure datasheet row, with your wording; null when the id is not registered. */
export function metricDefinition(m: Pick<MetricsApi, 'def'>, id: string): MetricDefinition | null {
  const d = m.def(id)
  if (!d) return null
  return d.formula
    ? { term: d.name, text: d.definition, formula: d.formula, metricId: id }
    : { term: d.name, text: d.definition, metricId: id }
}

/**
 * "Changed from the defaults: high performer rating 5 (default 4)." for the metrics' settings and
 * targets in force; '' when none differ. Wording changes need no note: the text is the wording.
 */
export function changedSettingsText(m: Metrics, ids: readonly string[]): string {
  const parts: string[] = []
  for (const id of new Set(ids)) {
    const base = m.defaultDef(id)
    if (!base) continue
    for (const field of m.changedFields(id)) {
      const key = paramKeyOf(field)
      if (key != null) {
        const p = base.params.find((x) => x.key === key)
        if (!p) continue
        const now = formatFieldValue(base, field, m.param(id, key))
        const was = formatFieldValue(base, field, p.default)
        parts.push(`${p.label.toLowerCase()} ${now} (default ${was})`)
      } else if (field === 'target') {
        const now = targetText(base, m.target(id)).toLowerCase()
        const was = targetText(base, base.target ?? null).toLowerCase()
        parts.push(`${base.name.toLowerCase()} target ${now} (default ${was})`)
      }
    }
  }
  return parts.length ? `Changed from the defaults: ${parts.join('; ')}.` : ''
}

/** A KPI's popover text: the registry definition, then facts about today's number, then changes. */
export function kpiDefinition(m: Metrics, id: string, facts = '', related: readonly string[] = []): string {
  return [metricText(m, id), facts, changedSettingsText(m, [id, ...related])].filter(Boolean).join(' ')
}

/**
 * A Figure's datasheet: its metrics from the registry (the figure's own first), then plain
 * explanations of terms that are not metrics (`extra`), then a row for settings that differ from
 * the defaults, of those metrics and of `related` ones the figure reads settings from (such as
 * the high performer rating) without defining them.
 */
export function figureDefinitions(
  m: Metrics,
  ids: readonly string[],
  extra: readonly Definition[] = [],
  related: readonly string[] = [],
): Definition[] {
  const rows: Definition[] = ids.map((id) => metricDefinition(m, id)).filter((d) => d != null)
  const changed = changedSettingsText(m, [...ids, ...related])
  return [...rows, ...extra, ...(changed ? [{ term: 'Settings in force', text: changed }] : [])]
}

/** "95%" for an at-least target, "at most 8%" for an at-most one ("under 2%" for an under one). */
export function targetWords(t: MetricTarget, unit: Parameters<typeof fmt>[1] = 'pct0'): string {
  if (t.comparator === '>=') return fmt(t.value, unit)
  return `${t.comparator === '<' ? 'under' : 'at most'} ${fmt(t.value, unit)}`
}
