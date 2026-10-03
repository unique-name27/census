/**
 * Shapes every domain engine returns and the shared components render.
 */
import type { Filters } from '@/data/scope'
import type { Format } from '@/lib/format'

/** A headline number. Missing data is `null` (renders "—"), never 0. */
export interface Kpi {
  id: string
  label: string
  value: number | null
  format: Format
  /** Change vs the comparison (prior period or company), in the same unit as value. */
  delta?: number | null
  /** What the delta compares against, e.g. "vs prior 12 months" or "vs company". */
  deltaLabel?: string
  /** Which direction is good; null = neutral (delta shown in gray). */
  goodDirection?: 'up' | 'down' | null
  /** Only color the delta when it clears the materiality gate. */
  deltaMaterial?: boolean
  /** Up to ~12 points, oldest first; the last point is the current period. */
  spark?: (number | null)[]
  /** Short sub-line under the value, e.g. "n = 412 · small sample". */
  note?: string
  /** Shown instead of the value when a group is too small: "Hidden to protect anonymity". */
  suppressed?: boolean
  /** Tab to open when the tile is clicked. */
  tab?: string
  /** Plain-English definition for the info popover. */
  definition?: string
}

export type Severity = 'critical' | 'warning' | 'info' | 'good'

export interface FindingPerson {
  id: string
  name: string
  note?: string
}

/** One generated finding in a view's readout. Wording rules: plain, sentence case, no nagging verbs. */
export interface Finding {
  id: string
  severity: Severity
  /** One sentence headline with the number in it. */
  title: string
  /** One or two sentences of supporting facts. */
  detail?: string
  /** Suggested next step in neutral, professional wording. */
  action?: string
  /** People behind the finding (shown as a short list, max ~50). */
  people?: FindingPerson[]
  /** Rescope the whole app to where the problem concentrates. */
  filter?: Partial<Filters>
  /** Open this tab of the current view. */
  tab?: string
}
