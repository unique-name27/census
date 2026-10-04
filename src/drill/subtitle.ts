/**
 * Drill panel subtitles in one wording on every view: when the records come from (a window or
 * the as-of date) first, then the scope, then any qualifier, joined by " · ".
 *
 * - A window: "1 Oct 2025 – 30 Sep 2026 · Whole company"
 * - A snapshot: "As of 30 Sep 2026 · Allison Carter's org · people matching the filters"
 *
 * Pure; the panel adds the row count in front ("31 people · …").
 */
import { formatDate, formatRange } from '@/lib/dates'

/** A subtitle part; empty ones are left out. */
export type SubtitlePart = string | null | undefined | false

/** The parts that are set, joined by " · ". */
export function subtitleOf(...parts: SubtitlePart[]): string {
  return parts.filter((p): p is string => !!p).join(' · ')
}

/** Records from a window: "1 Oct 2025 – 30 Sep 2026 · Whole company". */
export function windowLine(
  w: { start: string; end: string },
  scope?: SubtitlePart,
  ...more: SubtitlePart[]
): string {
  return subtitleOf(formatRange(w.start, w.end), scope, ...more)
}

/** Records as they stand on one date: "As of 30 Sep 2026 · Whole company". */
export function asOfLine(asOf: string, scope?: SubtitlePart, ...more: SubtitlePart[]): string {
  return subtitleOf(`As of ${formatDate(asOf)}`, scope, ...more)
}
