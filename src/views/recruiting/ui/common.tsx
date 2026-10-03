/**
 * Shared bits for the Recruiting tabs: empty-state wording, notes and the "no data yet" sheet.
 */
import { Button, EmptyState, goTo, IconUpload } from '@/components'
import { formatDate } from '@/lib/dates'

/**
 * A 5-column figure paired with a 7-column one takes the full row on tablets too (Figure maps
 * span 5 to half width there while span 7 goes full width, which would leave a hole).
 */
export const TABLET_FULL = 'md:col-span-12 lg:col-span-5'

export const NEED_CANDIDATES = 'Upload Candidates to see this.'
export const NEED_REQS = 'Upload Requisitions to see this.'

export const asOfNote = (asOf: string): string => `as of ${formatDate(asOf)}`

export function windowText(w: { start: string; end: string }): string {
  return `${formatDate(w.start)} to ${formatDate(w.end)}`
}

/** Shown instead of a tab when neither recruiting dataset has rows. */
export function NoRecruitingData() {
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
