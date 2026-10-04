/**
 * Apply one change to the dictionary from the detail panel: validated by the store against the
 * metric's definition, logged with your name, and confirmed with a toast that can undo it.
 */
import { toast } from '@/components/toast'
import { useCensus } from '@/data/store'
import type { MetricEdit } from '@/metrics/types'

/** Returns `apply(edit, done)`: null when it applied (or changed nothing), otherwise the reason. */
export function useMetricEdit(by: string): (edit: MetricEdit, done: string) => string | null {
  const editMetric = useCensus((s) => s.editMetric)
  const undo = useCensus((s) => s.undoMetricChange)
  return (edit, done) => {
    const r = editMetric(edit, by)
    if (!r.ok) return r.error
    const change = r.change
    if (change)
      toast(done, {
        tone: 'good',
        description: 'Every view uses it now. The change is in the change log.',
        action: { label: 'Undo', onClick: () => undo(change.id, by) },
      })
    return null
  }
}
