/** Prop shapes and accessors shared by the chart kit. Accessors are property names of the datum. */
import { isNum } from '@/lib/format'

export type { Tone } from '../core/color'
export type { RefLine } from '../core/marks'

/** A string property name of T. */
export type Key<T> = Extract<keyof T, string>

export interface ChartBaseProps<T> {
  /** Click-to-drill on a datum. */
  onSelect?: (d: T) => void
  /**
   * Whether this datum opens its records (pass the view's drill gate). It gates the click, the
   * pointer cursor and the tooltip's "Click to see the records". A datum without a value (hidden
   * or missing) never opens, whatever this returns.
   */
  selectable?: (d: T) => boolean
  /** Tooltip note for a datum that has a value but doesn't open, e.g. "Fewer than 5 people". */
  lockedNote?: (d: T) => string | null | undefined
  /** Accessible name of the chart image (the Figure title is the visible one). */
  ariaLabel?: string
}

/**
 * The click gate for a datum: it has a value and the view's own gate (when given) lets it open.
 * `has` says whether the datum carries a value.
 */
export function gateOf<T>(
  has: (d: T) => boolean,
  selectable: ((d: T) => boolean) | undefined,
): (d: T) => boolean {
  return (d) => has(d) && (selectable ? selectable(d) : true)
}

/** Numeric property value, or null when missing, suppressed or not a finite number. */
export function numAt(d: object, key: string): number | null {
  const v = (d as Record<string, unknown>)[key]
  return isNum(v) ? v : null
}

export function textAt(d: object, key: string): string {
  const v = (d as Record<string, unknown>)[key]
  return v == null ? '' : String(v)
}

/** Distinct values in first-seen order, optionally ordered by `order` (unknown values keep first-seen order after it). */
export function orderedKeys(values: Iterable<string>, order?: readonly string[]): string[] {
  const seen: string[] = []
  const set = new Set<string>()
  for (const v of values) {
    if (!set.has(v)) {
      set.add(v)
      seen.push(v)
    }
  }
  if (!order) return seen
  const head = order.filter((k) => set.has(k))
  const rest = seen.filter((k) => !order.includes(k))
  return [...head, ...rest]
}

export const HIDDEN_NOTE = 'Hidden to protect anonymity (n < 5)'

/** Bar thickness and the inset that centers it in a band (bars never exceed 24px). */
export function barInset(band: number, max = 24, fill = 0.62): { thickness: number; inset: number } {
  const thickness = Math.max(2, Math.min(max, band * fill))
  return { thickness, inset: Math.max(0, (band - thickness) / 2) }
}
