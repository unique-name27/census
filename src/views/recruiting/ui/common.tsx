/**
 * Shared bits for the Recruiting tabs: empty-state wording, notes and the "no data yet" sheet.
 */
import { Button, EmptyState, goTo, IconFilter, IconUpload } from '@/components'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { formatDate } from '@/lib/dates'

/**
 * A 4- or 5-column figure paired with a 7- or 8-column one takes the full row on tablets too
 * (spans 3-6 go half width there while 7+ go full width, which would leave a hole). The `lg:`
 * span from `spanClass` still applies on desktop.
 */
export const TABLET_FULL = 'md:col-span-12'

export const NEED_CANDIDATES = 'Upload Candidates to see this.'
export const NEED_REQS = 'Upload Requisitions to see this.'

export const asOfNote = (asOf: string): string => `as of ${formatDate(asOf)}`

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
        <Button variant="primary" onClick={() => goTo('data')}>
          Open the Data room
        </Button>
      }
    />
  )
}
