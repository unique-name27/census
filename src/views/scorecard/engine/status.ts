/**
 * How the People scorecard judges a measure against its target (docs/VIEWS.md, Scorecard):
 * Met when the value meets the target in force, Watch when it misses by less than the watch
 * margin, Missed beyond it, "No target" when the metric has none, and unknown ("—") when the
 * value is missing, hidden by the data standard or hidden to protect anonymity. Pure.
 */
import type { Severity } from '@/components/types'
import type { Format } from '@/lib/format'
import { targetStatus } from '@/metrics/api'
import type { MetricsApi, MetricTarget } from '@/metrics/types'
import { P } from '../metrics'

export type ScoreStatus = 'met' | 'watch' | 'missed' | 'none' | 'unknown'

/** Status words as the pill and every export print them. */
export const STATUS_WORD: Record<ScoreStatus, string> = {
  met: 'Met',
  watch: 'Watch',
  missed: 'Missed',
  none: 'No target',
  unknown: '—',
}

/** The pill's icon and wash; "No target" and unknown carry no icon. */
export const STATUS_SEVERITY: Record<ScoreStatus, Severity | null> = {
  met: 'good',
  watch: 'warning',
  missed: 'critical',
  none: null,
  unknown: null,
}

/** The watch margin in force: points for shares, a share of the target for every other unit. */
export interface WatchMargins {
  /** A fraction of 1: 0.05 is 5 pts. */
  share: number
  /** A fraction of the target: 0.1 is 10% of it. */
  relative: number
}

export function watchMargins(metrics: Pick<MetricsApi, 'num'>): WatchMargins {
  return {
    share: metrics.num(P.shareMargin.metricId, P.shareMargin.key),
    relative: metrics.num(P.relativeMargin.metricId, P.relativeMargin.key),
  }
}

const SHARES = new Set<Format>(['pct', 'pct0', 'pct2', 'pts', 'pts2'])

/** A share or a difference in points: judged with a margin in points. */
export const isShareFormat = (f: Format): boolean => SHARES.has(f)

/** How far a miss may go and still be Watch, in the value's own unit. */
export function watchMargin(target: MetricTarget, format: Format, m: WatchMargins): number {
  return isShareFormat(format) ? m.share : Math.abs(target.value) * m.relative
}

export interface Judgement {
  status: ScoreStatus
  /** How far the value is on the wrong side of the target, in its own unit; 0 when met; null without one. */
  gap: number | null
  /** The margin it was judged with; null without a target or a value. */
  margin: number | null
}

/**
 * The status of one value against its target. A value exactly on an "under" target (`<`) misses
 * by nothing, so it shows Watch whenever the margin is above zero.
 */
export function judge(
  value: number | null | undefined,
  target: MetricTarget | null | undefined,
  format: Format,
  margins: WatchMargins,
): Judgement {
  if (value == null || !Number.isFinite(value)) return { status: 'unknown', gap: null, margin: null }
  if (!target) return { status: 'none', gap: null, margin: null }
  const margin = watchMargin(target, format, margins)
  if (targetStatus(value, target) === 'met') return { status: 'met', gap: 0, margin }
  const gap = Math.max(0, target.comparator === '>=' ? target.value - value : value - target.value)
  return { status: gap < margin - 1e-12 ? 'watch' : 'missed', gap, margin }
}

/** How far past its watch margin a miss is (for "furthest from target"); Infinity with no margin. */
export function missSeverity(j: Judgement): number {
  if (j.status !== 'missed' || j.gap == null) return 0
  return j.margin ? j.gap / j.margin : Number.POSITIVE_INFINITY
}
