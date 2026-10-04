/**
 * Text and tone for KPI tiles, and the rows a KPI strip contributes to view exports. Pure.
 */
import type { Column } from '@/charts/types'
import { TIER_LABEL } from '@/data/quality/tier'
import { MIN_GROUP } from '@/data/schema'
import { DASH, fmt, fmtDelta, isNum } from '@/lib/format'
import type { TierGate } from './tier/tierModel'
import type { Kpi } from './types'

export const SUPPRESSED_NOTE = `Hidden to protect anonymity (n < ${MIN_GROUP})`

export type DeltaTone = 'good' | 'bad' | 'neutral'

export function deltaDirection(delta: number | null | undefined): 'up' | 'down' | 'flat' | null {
  if (!isNum(delta)) return null
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
}

/**
 * Good or bad only when the KPI says which direction is good AND the change is material;
 * everything else (neutral KPIs, small changes, no change) stays gray.
 */
export function deltaTone(
  k: Pick<Kpi, 'delta' | 'goodDirection' | 'deltaMaterial' | 'suppressed'>,
): DeltaTone {
  const dir = deltaDirection(k.delta)
  if (k.suppressed || !k.goodDirection || k.deltaMaterial === false || !dir || dir === 'flat')
    return 'neutral'
  return dir === k.goodDirection ? 'good' : 'bad'
}

export function kpiValueText(k: Pick<Kpi, 'value' | 'format' | 'suppressed'>): string {
  return k.suppressed ? DASH : fmt(k.value, k.format)
}

/** "+4 d", "−1.2 pts"; null when there is no comparable delta. */
export function kpiDeltaText(k: Pick<Kpi, 'delta' | 'format' | 'suppressed'>): string | null {
  if (k.suppressed || !isNum(k.delta)) return null
  return fmtDelta(k.delta, k.format)
}

export const KPI_COLUMNS: Column[] = [
  { key: 'measure', label: 'Measure', format: 'text' },
  { key: 'value', label: 'Value', format: 'text', align: 'right' },
  { key: 'change', label: 'Change', format: 'text', align: 'right' },
  { key: 'comparedWith', label: 'Compared with', format: 'text' },
  { key: 'note', label: 'Note', format: 'text' },
]

/** The key figures table with each number's tier after its value. */
export const KPI_COLUMNS_WITH_TIER: Column[] = [
  ...KPI_COLUMNS.slice(0, 2),
  { key: 'tier', label: 'Tier', format: 'text' },
  ...KPI_COLUMNS.slice(2),
]

/**
 * Formatted rows for the "Key figures" table in view exports (values are text: units differ by
 * row). With `gates` (one per KPI), each row carries its tier, and a number the data standard
 * hides exports as "—" with the reason, exactly as the tile shows it.
 */
export function kpiRows(
  kpis: readonly Kpi[],
  gates?: readonly (TierGate | null)[],
): Record<string, unknown>[] {
  return kpis.map((k, i) => {
    const gate = gates?.[i] ?? null
    const hidden = !!gate && !gate.shown
    const change = hidden ? null : kpiDeltaText(k)
    const row: Record<string, unknown> = {
      measure: k.label,
      value: hidden ? DASH : kpiValueText(k),
      change: change ?? '',
      comparedWith: change ? (k.deltaLabel ?? '') : '',
      note: hidden ? (gate.reason ?? '') : k.suppressed ? SUPPRESSED_NOTE : (k.note ?? ''),
    }
    if (gates) row.tier = gate ? TIER_LABEL[gate.tier] : ''
    return row
  })
}
