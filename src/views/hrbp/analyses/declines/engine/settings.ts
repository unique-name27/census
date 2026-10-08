/**
 * The calculation settings Offer declines reads, from the metric dictionary in force (docs/ANALYSES.md,
 * 3.4): the anonymity minimum, the person minimum (never below the anonymity minimum), the cell size
 * of the expected rate and the readout thresholds. Read once per model. Pure.
 */
import { minGroupOf } from '@/metrics/privacy'
import type { MetricsApi } from '@/metrics/types'
import { DSET } from './metrics'

export interface DeclinesSettings {
  /** Fewest resolved offers behind any rate, median or share (the anonymity minimum, 5). */
  minGroup: number
  /** Fewest resolved offers to show a recruiter or hiring manager on their own (10). */
  minPersonOffers: number
  /** Fewest company offers in a location and level cell (5). */
  minCell: number
  /** Declined median this far below accepted flags a location (0.15). */
  rangeGap: number
  /** Latest quarter this far above the four before flags a rise (0.10). */
  risePts: number
  /** Gap to expected, or slow against quick, that flags (0.10). */
  gapPts: number
  /** Decided after more than this many days is slow (7). */
  slowDecisionDays: number
  /** Fewest resolved offers for a quarter or group to be flagged (20). */
  minResolved: number
}

export function declinesSettings(m: MetricsApi): DeclinesSettings {
  const minGroup = minGroupOf(m)
  const n = (r: { metricId: string; key: string }) => m.num(r.metricId, r.key)
  return {
    minGroup,
    minPersonOffers: Math.max(minGroup, n(DSET.minPersonOffers)),
    minCell: n(DSET.minCell),
    rangeGap: n(DSET.rangeGap),
    risePts: n(DSET.risePts),
    gapPts: n(DSET.gapPts),
    slowDecisionDays: n(DSET.slowDecisionDays),
    minResolved: Math.max(minGroup, n(DSET.minResolved)),
  }
}
