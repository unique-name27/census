/**
 * Text and tone for KPI tiles, and the rows a KPI strip contributes to view exports. Pure.
 */
import type { Column } from '@/charts/types'
import { MIN_GROUP } from '@/data/schema'
import { DASH, fmt, fmtDelta, isNum } from '@/lib/format'
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

/** Formatted rows for the "Key figures" table in view exports (values are text: units differ by row). */
export function kpiRows(kpis: readonly Kpi[]): Record<string, unknown>[] {
  return kpis.map((k) => {
    const change = kpiDeltaText(k)
    return {
      measure: k.label,
      value: kpiValueText(k),
      change: change ?? '',
      comparedWith: change ? (k.deltaLabel ?? '') : '',
      note: k.suppressed ? SUPPRESSED_NOTE : (k.note ?? ''),
    }
  })
}
