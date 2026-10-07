/**
 * The rows behind the Action center's three charts from the design refresh (docs/CHARTS.md,
 * Action center): when open items fall due (by due band and severity), who has the most waiting
 * (by owner), and what is waiting (by kind and due bucket). Each row keeps the items it counts, so
 * a mark opens exactly them. Pure.
 */
import type { Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { OpenAction } from './collect'
import {
  DUE_BAND_LABEL,
  DUE_BANDS,
  DUE_BUCKETS,
  type DueBand,
  type DueBucket,
  dueBand,
  dueBucket,
  dueBucketLabel,
} from './due'
import { kindOf } from './kind'
import { SEVERITY_ORDER, SEVERITY_WORD } from './rows'
import { settingsOf } from './settings'

type Ctx = Pick<AnalyticsContext, 'asOf' | 'metrics'>

/** The folded row of a ranked chart (no filter can name it). */
export const OTHER = 'Other'

/* ───────── when items fall due ───────── */

export interface DueTimelineRow {
  [key: string]: unknown
  band: DueBand
  bandLabel: string
  severity: Severity
  /** "Critical", "Watch", "Note". */
  severityLabel: string
  items: number
  /** The items in the segment (for the drill panel; not exported). */
  list: OpenAction[]
}

export interface DueTimelineTableRow {
  [key: string]: unknown
  band: DueBand
  bandLabel: string
  open: number
  critical: number
  watch: number
  note: number
  /** The band's items (for the drill panel; not exported). */
  list: OpenAction[]
}

export interface DueTimeline {
  /**
   * One row per band and severity with any item, stalest band first, the most severe first. A
   * time band with no item keeps one zero row, so the axis keeps every band in its place.
   */
  rows: DueTimelineRow[]
  /** One row per time band (zeros too), and "No due date" when any item has none, for the table view. */
  table: DueTimelineTableRow[]
  /** Severity words in stacking order (those present). */
  severities: string[]
}

/**
 * Open items by due band (8+ weeks overdue to no due date) and severity. The bands are a time
 * axis, so every one from 8+ weeks overdue to later keeps its place even with no item in it (a
 * zero row in the first severity present); "No due date" shows only when an item has none.
 */
export function dueTimeline(open: readonly OpenAction[], asOf: string): DueTimeline {
  const by = new Map<DueBand, OpenAction[]>()
  for (const a of open) {
    const band = dueBand(a.item.due, asOf)
    const list = by.get(band)
    if (list) list.push(a)
    else by.set(band, [a])
  }
  const rows: DueTimelineRow[] = []
  const table: DueTimelineTableRow[] = []
  const present = new Set<Severity>(open.map((a) => a.item.severity))
  const first = SEVERITY_ORDER.find((sv) => present.has(sv))
  for (const band of DUE_BANDS) {
    const list = by.get(band) ?? []
    if (!first || (!list.length && band === 'none')) continue
    if (!list.length) {
      rows.push({
        band,
        bandLabel: DUE_BAND_LABEL[band],
        severity: first,
        severityLabel: SEVERITY_WORD[first],
        items: 0,
        list: [],
      })
      table.push({ band, bandLabel: DUE_BAND_LABEL[band], open: 0, critical: 0, watch: 0, note: 0, list })
      continue
    }
    for (const severity of SEVERITY_ORDER) {
      const seg = list.filter((a) => a.item.severity === severity)
      if (!seg.length) continue
      rows.push({
        band,
        bandLabel: DUE_BAND_LABEL[band],
        severity,
        severityLabel: SEVERITY_WORD[severity],
        items: seg.length,
        list: seg,
      })
    }
    const n = (s: Severity) => list.filter((a) => a.item.severity === s).length
    table.push({
      band,
      bandLabel: DUE_BAND_LABEL[band],
      open: list.length,
      critical: n('critical'),
      watch: n('warning'),
      note: n('info') + n('good'),
      list,
    })
  }
  return {
    rows,
    table,
    severities: SEVERITY_ORDER.filter((s) => present.has(s)).map((s) => SEVERITY_WORD[s]),
  }
}

/* ───────── who has the most waiting ───────── */

export interface TopOwnerRow {
  [key: string]: unknown
  owner: string
  /** The owner groups they appear in ("Managers, Recruiters"). */
  ownerGroup: string
  /** The person, when the owner is one on the roster; null for a team. */
  personId: string | null
  isTeam: boolean
  items: number
  overdue: number
  critical: number
  /** The owner's open items (for the drill panel; not exported). */
  list: OpenAction[]
}

/** Open items per owner (a person once across owner groups), the most items first. */
export function topOwners(open: readonly OpenAction[], ctx: Ctx): TopOwnerRow[] {
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const by = new Map<string, OpenAction[]>()
  for (const a of open) {
    const list = by.get(a.ownerKey)
    if (list) list.push(a)
    else by.set(a.ownerKey, [a])
  }
  return [...by.values()]
    .map((list) => {
      const first = list[0]
      return {
        owner: first.ownerName,
        ownerGroup: [...new Set(list.map((a) => a.roleLabel))].join(', '),
        personId: first.isTeam ? null : first.ownerId,
        isTeam: first.isTeam,
        items: list.length,
        overdue: list.filter((a) => dueBucket(a.item.due, ctx.asOf, dueSoonDays) === 'overdue').length,
        critical: list.filter((a) => a.item.severity === 'critical').length,
        list,
      }
    })
    .sort(
      (a, b) =>
        b.items - a.items ||
        b.critical - a.critical ||
        b.overdue - a.overdue ||
        a.owner.localeCompare(b.owner),
    )
}

/* ───────── what is waiting, by kind ───────── */

export interface KindDueRow {
  [key: string]: unknown
  kind: string
  /** The due bucket's label ("Overdue", "Due within 7 d"). */
  due: string
  bucket: DueBucket
  items: number
  /** The items in the segment (for the drill panel; not exported). */
  list: OpenAction[]
}

export interface KindTableRow {
  [key: string]: unknown
  kind: string
  /** The views the kind comes from ("Recruiting"). */
  from: string
  open: number
  overdue: number
  soon: number
  later: number
  none: number
  /** The kind's items (for the drill panel; not exported). */
  list: OpenAction[]
  /** For "Other": how many kinds it holds. */
  folded?: number
}

export interface KindRows {
  /** Kinds in row order: the most items first, "Other" last. */
  kinds: string[]
  rows: KindDueRow[]
  table: KindTableRow[]
  /** Due bucket labels in stacking order. */
  buckets: string[]
}

/**
 * Open items by kind of work and due bucket (overdue, due soon, due later, no due date). The
 * `top` kinds with the most items keep their own row; the rest fold into "Other".
 */
export function kindRows(open: readonly OpenAction[], ctx: Ctx, top = 12): KindRows {
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const by = new Map<string, OpenAction[]>()
  for (const a of open) {
    const k = kindOf(a.item, a.viewLabel)
    const list = by.get(k)
    if (list) list.push(a)
    else by.set(k, [a])
  }
  const ranked = [...by].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const fold = ranked.length > top
  const kept = fold ? ranked.slice(0, top - 1) : ranked
  const rest = fold ? ranked.slice(top - 1) : []
  const groups: [string, OpenAction[], number?][] = [
    ...kept,
    ...(rest.length
      ? [[OTHER, rest.flatMap(([, l]) => l), rest.length] as [string, OpenAction[], number]]
      : []),
  ]
  const bucketOf = (a: OpenAction) => dueBucket(a.item.due, ctx.asOf, dueSoonDays)
  const rows: KindDueRow[] = []
  const table: KindTableRow[] = []
  for (const [kind, list, folded] of groups) {
    for (const bucket of DUE_BUCKETS) {
      const seg = list.filter((a) => bucketOf(a) === bucket)
      if (seg.length)
        rows.push({ kind, due: dueBucketLabel(bucket, dueSoonDays), bucket, items: seg.length, list: seg })
    }
    const n = (b: DueBucket) => list.filter((a) => bucketOf(a) === b).length
    table.push({
      kind,
      from: [...new Set(list.map((a) => a.viewLabel))].join(', '),
      open: list.length,
      overdue: n('overdue'),
      soon: n('soon'),
      later: n('later'),
      none: n('none'),
      list,
      ...(folded ? { folded } : {}),
    })
  }
  return {
    kinds: groups.map(([k]) => k),
    rows,
    table,
    buckets: DUE_BUCKETS.map((b) => dueBucketLabel(b, dueSoonDays)),
  }
}
