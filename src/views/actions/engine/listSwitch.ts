import { fmt } from '@/lib/format'

/** The Action center's lists (`ListMode` in ui/store.ts). */
export type ListKey = 'open' | 'needs' | 'waiting' | 'parked'

export interface ListCounts {
  /** The mode shows Needs attention and Waiting on others. */
  roles: boolean
  needs: number
  waiting: number
  open: number
  parked: number
}

/**
 * The list switch's options. A role mode's three parts are wider than a phone's column at their
 * full names, so under 640px (`wide` false) they use the short words.
 */
export function listSwitchOptions(c: ListCounts, wide: boolean): { value: ListKey; label: string }[] {
  const n = (x: number) => fmt(x, 'int')
  if (!c.roles)
    return [
      { value: 'open', label: `Open ${n(c.open)}` },
      { value: 'parked', label: `${wide ? 'Handled and snoozed' : 'Handled'} ${n(c.parked)}` },
    ]
  return [
    { value: 'needs', label: `Needs attention ${n(c.needs)}` },
    { value: 'waiting', label: `${wide ? 'Waiting on others' : 'Waiting'} ${n(c.waiting)}` },
    { value: 'parked', label: `${wide ? 'Handled and snoozed' : 'Handled'} ${n(c.parked)}` },
  ]
}
