/**
 * Wording helpers for the figures. Metric definitions themselves come from the metric dictionary
 * (`Prep.defs` / `Prep.text`, registered in `../metrics.ts`), so an edited definition shows in
 * every figure and tile.
 */
import { ANONYMITY } from '@/metrics/privacy'

export { ID } from '../metrics'

/** The anonymity minimum's dictionary entry, listed under figures that hide small groups. */
export const ANONYMITY_ID = ANONYMITY.metricId

/** A gap in points with as few decimals as it needs: "1 pt", "2.5 pts". */
export function ptsText(v: number): string {
  const n = +(Math.abs(v) * 100).toFixed(2)
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'pt' : 'pts'}`
}

/** A plain number with up to two decimals: "0.5", "12". */
export const plain = (v: number): string => (+v.toFixed(2)).toLocaleString('en-US')
