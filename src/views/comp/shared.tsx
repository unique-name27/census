/**
 * What every Compensation tab shares: the memoized model, notes, empty-state messages, the empty
 * state for a scope with no one in it and the notice for pay data from another date.
 */
import { useMemo } from 'react'
import { Button, EmptyState, goTo, IconDatabase, IconFilter, IconInfo } from '@/components'
import { useAnalytics } from '@/data/context'
import { type CompModel, computeComp } from './engine/model'
import { emptyScope, payNotice } from './engine/notes'
import { useCycleSettings } from './settingsStore'

export { asOfNote, note } from './engine/notes'

export function useCompModel(): CompModel {
  const ctx = useAnalytics()
  const settings = useCycleSettings((s) => s.settings)
  return useMemo(() => computeComp(ctx, settings), [ctx, settings])
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
  const e = emptyScope(m)
  return (
    <EmptyState
      icon={e.dataRoom ? <IconDatabase /> : <IconFilter />}
      title={e.title}
      body={e.body}
      action={
        e.dataRoom ? (
          <Button size="sm" onClick={() => goTo('data')}>
            Open Data room
          </Button>
        ) : undefined
      }
    />
  )
}

/** Shown above every tab when the pay data describes a different date from the people. */
export function PayNotice({ m }: { m: CompModel }) {
  const text = payNotice(m)
  if (!text) return null
  return (
    <p
      role="note"
      className="mb-4 flex gap-2 rounded-sheet bg-sheet px-4 py-2.5 text-[13px] leading-snug text-ink-2"
    >
      <IconInfo className="mt-px size-4 shrink-0 text-muted" />
      <span>{text}</span>
    </p>
  )
}
