/**
 * Settings > Compensation cycle, without React (docs/ROLES-V2.md 4.6 and "Decisions made": comp
 * cycle dates in Settings > Compensation cycle, so Compensation's items have due dates).
 *
 * The cycle's dates (open, calibration, close, effective, eligible if hired by) are set right in
 * the section, in every mode that shows it, Compensation mode included, which has no Data room.
 * The merit budget, healthy band and merit guideline stay settings of their metrics, edited in
 * Metric definitions: an Edit link where the Data room shows, the value only elsewhere. Every
 * change goes through the metric dictionary, so it is checked, logged and can be undone. Pure.
 */
import { COMP_CYCLE_ROWS } from '@/metrics/compCycle'
import { formatParam, parseParamInput } from '@/metrics/params'
import type { MetricEdit, MetricsApi, ParamDef, ParamValue } from '@/metrics/types'

export interface CycleRow {
  metricId: string
  key: string
  label: string
  param: ParamDef
  /** The value in force, in words ("Not set", "30 Oct 2026", "3%"). */
  text: string
  /** A date setting's value as the date input holds it ('' when not set). */
  date: string | null
  changed: boolean
  /** Set here (the dates), opened in Metric definitions, or shown only (no Data room). */
  edit: 'inline' | 'link' | 'read-only'
}

export function compCycleRows(metrics: MetricsApi, dataRoom: boolean): CycleRow[] {
  const out: CycleRow[] = []
  for (const { metricId, key } of COMP_CYCLE_ROWS) {
    const param = metrics.paramDef(metricId, key)
    if (!param) continue
    const value = metrics.param<ParamValue>(metricId, key)
    const isDate = param.type === 'date'
    out.push({
      metricId,
      key,
      label: param.label,
      param,
      text: formatParam(param, value),
      date: isDate ? (typeof value === 'string' ? value : '') : null,
      changed: metrics.changedFields(metricId).includes(`params.${key}`),
      edit: isDate ? 'inline' : dataRoom ? 'link' : 'read-only',
    })
  }
  return out
}

/** The section's lead, worded for whether the other settings can be opened from here. */
export function compCycleIntro(dataRoom: boolean): string {
  return dataRoom
    ? 'Set the cycle dates here; Compensation’s open items are due on the close date. The merit budget, healthy band and guideline live in Metric definitions in the Data room. Every change applies to every view, is logged and can be undone.'
    : 'Set the cycle dates here; Compensation’s open items are due on the close date. The merit budget, healthy band and guideline live in Metric definitions in the Data room; change them in HR mode. Every change applies to every view and is logged.'
}

export type CycleDateEdit = { ok: true; edit: MetricEdit; done: string } | { ok: false; error: string }

/** A cycle date typed in the section ('' clears it), checked against its setting, as one edit. */
export function cycleDateEdit(
  row: Pick<CycleRow, 'metricId' | 'key' | 'param'>,
  text: string,
): CycleDateEdit {
  const v = parseParamInput(row.param, text.trim())
  if (!v.ok) return { ok: false, error: v.error }
  // "Cycle closes: 30 Oct 2026", "Cycle closes: not set".
  const done = `${row.param.label}: ${v.value === '' ? 'not set' : formatParam(row.param, v.value)}`
  return { ok: true, edit: { metricId: row.metricId, field: `params.${row.key}`, value: v.value }, done }
}
