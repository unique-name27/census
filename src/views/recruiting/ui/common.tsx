/**
 * Shared bits for the Recruiting tabs: empty-state wording, notes and the "no data yet" sheet.
 */
import type { Definition } from '@/charts'
import { Button, EmptyState, goTo, IconFilter, IconUpload } from '@/components'
import { useRouteShown } from '@/components/RouteLink'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import type { DrillSpec } from '@/drill'
import { formatDate } from '@/lib/dates'
import type { RecruitingBase } from '../engine/base'
import { type MetricDefinitionOptions, metricDefinition } from '../engine/definitions'
import type { RecruitingMetricId } from '../metrics'

/**
 * A figure's definition row from the metric dictionary: your wording when you changed it, with
 * the settings in force. Figures pass the same id as `metric`.
 */
export const defOf = (b: RecruitingBase, id: RecruitingMetricId, o?: MetricDefinitionOptions): Definition =>
  metricDefinition(b.metrics, id, o)

/** What time to fill spans, for subtitles: "opened to offer accepted" (the default clock). */
export const ttfSpan = (b: RecruitingBase): string =>
  b.settings.ttfEnd === 'start' ? 'opened to start date (or offer accepted)' : 'opened to offer accepted'

/**
 * A 4- or 5-column figure paired with a 7- or 8-column one takes the full row on tablets too
 * (spans 3-6 go half width there while 7+ go full width, which would leave a hole). The `lg:`
 * span from `spanClass` still applies on desktop.
 */
export const TABLET_FULL = 'md:col-span-12'

export const NEED_CANDIDATES = 'Upload Candidates to see this.'
export const NEED_REQS = 'Upload Requisitions to see this.'

export const asOfNote = (asOf: string): string => `as of ${formatDate(asOf)}`

/**
 * The drill for a number, only when there are records behind it: a table cell or chart mark with
 * none (0, or hidden under the anonymity minimum) gets no drill, so it never looks clickable and
 * opens nothing.
 */
export function drillIf(
  n: number | boolean | null | undefined,
  spec: () => DrillSpec | null,
): (() => DrillSpec | null) | null {
  return n ? spec : null
}

export function windowText(w: { start: string; end: string }): string {
  return `${formatDate(w.start)} to ${formatDate(w.end)}`
}

/**
 * Shown instead of a tab when neither recruiting dataset has rows in scope: either nothing is
 * loaded, or the filters leave no req (candidates follow their req).
 */
export function NoRecruitingData() {
  const ctx = useAnalytics()
  const resetFilters = useCensus((s) => s.resetFilters)
  const dataRoom = useRouteShown('data')
  if (ctx.all.requisitions.length || ctx.all.candidates.length) {
    return (
      <EmptyState
        icon={<IconFilter />}
        title="No requisitions or candidates in this scope"
        body={`No requisition matches ${ctx.scopeLabel}, and candidates are scoped by their requisition. Widen the filters to see recruiting.`}
        action={<Button onClick={resetFilters}>Reset filters</Button>}
      />
    )
  }
  return (
    <EmptyState
      icon={<IconUpload />}
      title="Upload Requisitions and Candidates to see recruiting"
      body="Recruiting reads two sheets: Requisitions (one row per req, with opened and filled dates) and Candidates (one row per application, with the date each stage was reached). The Data room has templates for both."
      action={
        dataRoom && (
          <Button variant="primary" onClick={() => goTo('data')}>
            Open the Data room
          </Button>
        )
      }
    />
  )
}
