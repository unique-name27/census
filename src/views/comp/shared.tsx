/**
 * What every Compensation tab shares: the memoized model, notes, empty-state messages and the
 * empty state that names the missing dataset.
 */
import { useMemo } from 'react'
import { Button, EmptyState, goTo, IconDatabase } from '@/components'
import { useAnalytics } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { type CompModel, computeComp } from './engine/model'
import { useCycleSettings } from './settingsStore'

export function useCompModel(): CompModel {
  const ctx = useAnalytics()
  const settings = useCycleSettings((s) => s.settings)
  return useMemo(() => computeComp(ctx, settings), [ctx, settings])
}

/** "1,450 people · as of 30 Sep 2026", plus the FX caveat when it applies to amount totals. */
export function note(m: CompModel, n: number, unit = 'people', fx = false): string {
  const parts = [
    `${fmt(n, 'int')} ${n === 1 && unit === 'people' ? 'person' : unit}`,
    `as of ${formatDate(m.asOf)}`,
  ]
  if (fx && m.pop.noFx > 0) parts.push(`${fmt(m.pop.noFx, 'int')} without an FX rate left out of USD totals`)
  return parts.join(' · ')
}

/** Empty-state text for a figure whose input is missing: names the dataset or column. */
export const MISSING = {
  comp: 'Upload Compensation to see this.',
  ranges: 'Add range minimum and maximum to the Compensation upload to see this.',
  reviews: 'Upload Reviews to see this.',
  merit: 'Add the Merit % column to the Compensation upload to see this.',
  market: 'Add the Market median column to the Compensation upload to see this.',
  bonus: 'Add Bonus payout % of target to the Compensation upload to see this.',
  equity: 'Add Annual equity (USD) to the Compensation upload to see this.',
  promotion: 'No promotion increases in this cycle.',
  bonusTarget: 'Add Target bonus % to the Compensation upload to see this.',
} as const

/** Message when there is no row to show: the missing input first, else a plain "none here". */
export function emptyIf(rows: readonly unknown[], missing: string | null, none: string): string | null {
  if (missing) return missing
  return rows.length ? null : none
}

export function NoCompData({ m }: { m: CompModel }) {
  const reason =
    m.pop.missingComp > 0
      ? `${fmt(m.pop.missingComp, 'int')} active employees in this scope have no compensation record.`
      : 'There are no active employees with a compensation record in this scope.'
  return (
    <EmptyState
      icon={<IconDatabase />}
      title="Upload Compensation to see this"
      body={`${reason} Load a Compensation sheet in the Data room, or widen the filters.`}
      action={
        <Button size="sm" onClick={() => goTo('data')}>
          Open Data room
        </Button>
      }
    />
  )
}
