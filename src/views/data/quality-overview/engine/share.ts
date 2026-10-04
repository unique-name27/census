/**
 * One way to show a share across the Data quality tab, its drills, the quality lens and the
 * "Data quality report" workbook, so the same share reads the same everywhere.
 *
 * Whole percents by default ("72%"), the house style of the tier explanations. A share is never
 * rounded across the line it is judged by, and a gap is never rounded away:
 * - within 1 pt of a threshold it keeps one decimal, rounded toward the side it is on (94.6%
 *   filled reads "94.6%" against a 95% bar, never "95%");
 * - above 0 and below 100 it never reads "0%" or "100%": 3 blanks in 694 rows read "99.5%"
 *   filled (one decimal, rounded down), 5 rows of 10,984 read "99.9%" filled and "0.05%" with an
 *   issue (two decimals, rounded up, under 0.1%);
 * - under 1% it keeps one decimal, as the Datasets tab writes an import error share: 3 rows of
 *   597 read "0.5%", 3 of 312 "1.0%", on both tabs.
 *
 * `shareCell` gives the number and the format a table cell or an Excel cell needs to show exactly
 * the same text as `shareText`. Pure.
 */
import { type Format, fmt } from '@/lib/format'

/** The line a share is judged against: 'min' when it must reach it, 'max' when it must not pass it. */
export interface ShareAgainst {
  threshold: number
  side: 'min' | 'max'
}

export interface ShareCell {
  /** The value to store, adjusted so the format shows exactly `shareText`; null for no share. */
  value: number | null
  format: Format
}

const EPS = 1e-9

/** The value and format that show a share the tab's way, in a table, an export or a sentence. */
export function shareCell(share: number | null | undefined, against?: ShareAgainst | null): ShareCell {
  if (share == null || !Number.isFinite(share)) return { value: null, format: 'pct0' }
  if (share >= 1) return { value: 1, format: 'pct0' }
  if (share <= 0) return { value: 0, format: 'pct0' }
  if (against && Math.abs(share - against.threshold) < 0.01) {
    const tenths = against.side === 'min' ? Math.floor(share * 1000 + EPS) : Math.ceil(share * 1000 - EPS)
    if (tenths > 0 && tenths < 1000) return { value: tenths / 1000, format: 'pct' }
  }
  const whole = Math.round(share * 100)
  if (share >= 0.01 && whole <= 99) return { value: share, format: 'pct0' }
  if (whole >= 100) {
    // Short of 100%: one decimal rounded down, or two when even that reads 100.0%.
    const tenths = Math.floor(share * 1000 + EPS)
    if (tenths < 1000) return { value: tenths / 1000, format: 'pct' }
    return { value: Math.min(9999, Math.floor(share * 10_000 + EPS)) / 10_000, format: 'pct2' }
  }
  // Above 0% and under 1%: one decimal, or two (rounded up) under 0.1%.
  if (share >= 0.001) return { value: Math.round(share * 1000) / 1000, format: 'pct' }
  return { value: Math.max(1, Math.ceil(share * 10_000 - EPS)) / 10_000, format: 'pct2' }
}

/** A share as the tab writes it: "72%", "94.6%", "99.95%", "0.05%"; "—" for no share. */
export function shareText(share: number | null | undefined, against?: ShareAgainst | null): string {
  const c = shareCell(share, against)
  return c.value == null ? '—' : fmt(c.value, c.format)
}

/** The hidden row key that carries a share column's format (`<column>Format`). */
export const shareFormatKey = (column: string): string => `${column}Format`

/**
 * A column format that reads each row's share format, set by `withShare`. Rows without one fall
 * back to whole percents.
 */
export const shareFormat =
  (column: string) =>
  (row: Record<string, unknown>): Format =>
    (row[shareFormatKey(column)] as Format | undefined) ?? 'pct0'

/** The row fields for one share column: the adjusted value and its format. */
export function withShare(
  column: string,
  share: number | null | undefined,
  against?: ShareAgainst | null,
): Record<string, unknown> {
  const c = shareCell(share, against)
  return { [column]: c.value, [shareFormatKey(column)]: c.format }
}
