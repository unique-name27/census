/**
 * Needs attention on a role home (docs/ROLES-V2.md 5.2 and 5.4), as data: the rows of "Where your
 * items wait" (the role's items by kind of work, or the CHRO's escalations by practice, stacked by
 * due state) and of the list beside it (the most urgent items, legal exposure first). The items
 * are the mode's `needs` from the Action center's split (`roleView`), so every count here is the
 * Action center's. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import type { ISODate } from '@/data/schema'
import {
  DUE_BUCKETS,
  type DueBucket,
  dueBucket,
  dueBucketLabel,
  dueText,
  type ExportRow,
  exportRows,
  type OpenAction,
  SEVERITY_WORD,
  settingsOf,
} from '@/views/actions/engine'
import { kindOf } from '@/views/actions/engine/kind'

/** Items a role home lists before "Show all" (5.2); the CHRO's escalations list 10 (5.4). */
export const HOME_SHOWN = 8
export const ESCALATIONS_ON_HOME = 10

/** Kinds (or practices) the chart keeps on their own row; the rest fold into "Other". */
export const WAIT_TOP = 6

export const OTHER = 'Other'

type Ctx = Pick<AnalyticsContext, 'asOf' | 'metrics'>

export interface WaitSegment {
  [key: string]: unknown
  group: string
  /** The due bucket's label ("Overdue", "Due within 7 d"). */
  due: string
  bucket: DueBucket
  items: number
  /** The items in the segment (for the drill panel; not exported). */
  list: OpenAction[]
}

export interface WaitRow {
  [key: string]: unknown
  group: string
  open: number
  overdue: number
  soon: number
  later: number
  none: number
  critical: number
  /** The group's items (for the drill panel; not exported). */
  list: OpenAction[]
  /** For "Other": how many groups it holds. */
  folded?: number
}

export interface WaitRows {
  /** Groups in row order: the most items first, "Other" last. */
  groups: string[]
  segments: WaitSegment[]
  rows: WaitRow[]
  /** Due bucket labels in stacking order. */
  buckets: string[]
}

/** What an item is grouped by: its kind of work (role homes) or the practice that raised it (CHRO). */
export type WaitBy = 'kind' | 'practice'

export const groupOf = (a: OpenAction, by: WaitBy): string =>
  by === 'kind' ? kindOf(a.item, a.viewLabel) : a.viewLabel

/**
 * Items by group and due bucket. The `top` groups with the most items keep their own row (ties by
 * name); the rest fold into "Other" (6 and Other on a home).
 */
export function waitRows(items: readonly OpenAction[], ctx: Ctx, by: WaitBy, top = WAIT_TOP): WaitRows {
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const groups = new Map<string, OpenAction[]>()
  for (const a of items) {
    const g = groupOf(a, by)
    const list = groups.get(g)
    if (list) list.push(a)
    else groups.set(g, [a])
  }
  const ranked = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const fold = ranked.length > top + 1
  const kept = fold ? ranked.slice(0, top) : ranked
  const rest = fold ? ranked.slice(top) : []
  const listed: [string, OpenAction[], number?][] = [
    ...kept,
    ...(rest.length
      ? [[OTHER, rest.flatMap(([, l]) => l), rest.length] as [string, OpenAction[], number]]
      : []),
  ]
  const bucketOf = (a: OpenAction) => dueBucket(a.item.due, ctx.asOf, dueSoonDays)
  const segments: WaitSegment[] = []
  const rows: WaitRow[] = []
  for (const [group, list, folded] of listed) {
    for (const bucket of DUE_BUCKETS) {
      const seg = list.filter((a) => bucketOf(a) === bucket)
      if (seg.length)
        segments.push({
          group,
          due: dueBucketLabel(bucket, dueSoonDays),
          bucket,
          items: seg.length,
          list: seg,
        })
    }
    const n = (b: DueBucket) => list.filter((a) => bucketOf(a) === b).length
    rows.push({
      group,
      open: list.length,
      overdue: n('overdue'),
      soon: n('soon'),
      later: n('later'),
      none: n('none'),
      critical: list.filter((a) => a.item.severity === 'critical').length,
      list,
      ...(folded ? { folded } : {}),
    })
  }
  return {
    groups: listed.map(([g]) => g),
    segments,
    rows,
    buckets: DUE_BUCKETS.map((b) => dueBucketLabel(b, dueSoonDays)),
  }
}

/** One row of the Needs attention list, as the table and its export carry it. */
export interface AttentionRow extends ExportRow {
  /** "Legal exposure", or empty. */
  exposure: string
  /** The item (for its links; not exported). */
  a: OpenAction
}

/** The list's rows, in the order given (most pressing first). */
export function attentionRows(items: readonly OpenAction[], asOf: ISODate): AttentionRow[] {
  const rows = exportRows(items, asOf)
  return rows.map((r, i) => ({ ...r, exposure: items[i].item.exposure ? 'Legal exposure' : '', a: items[i] }))
}

/** "4 d overdue" in the words the list uses, with the severity's word ("Critical"). */
export const severityWord = (a: OpenAction): string => SEVERITY_WORD[a.item.severity]
export const dueWords = (a: OpenAction, asOf: ISODate): string => dueText(a.item.due, asOf)

/** "4 items come from data below your standard", or null when none does. */
export function belowLine(items: readonly OpenAction[]): string | null {
  const n = items.filter((a) => a.below).length
  if (!n) return null
  return n === 1
    ? '1 item comes from data below your standard'
    : `${n} items come from data below your standard`
}
