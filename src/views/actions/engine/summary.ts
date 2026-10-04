/**
 * The Action center's numbers: the key figures (open, overdue, critical, due soon, owners) and
 * the rows behind its two figures (open items by owner group and due date, and by the view they
 * come from). Every number drills to the items behind it. Pure.
 */
import type { Kpi, Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { type ActionOwnerRow, type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { M } from '../metrics'
import { type OpenAction, usesOf } from './collect'
import { DUE_BUCKETS, type DueBucket, dueBucket, dueBucketLabel } from './due'
import { groupByOwner, type OwnerBlock, ownerCount } from './group'
import { itemsDrill, SEVERITY_ORDER } from './rows'
import { settingsOf } from './settings'

type Ctx = Pick<AnalyticsContext, 'asOf' | 'scopeLabel' | 'metrics'>

export interface ActionCounts {
  open: OpenAction[]
  overdue: OpenAction[]
  critical: OpenAction[]
  dueSoon: OpenAction[]
  owners: number
  bySeverity: Record<Severity, number>
}

export function countActions(open: readonly OpenAction[], ctx: Ctx): ActionCounts {
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const bySeverity: Record<Severity, number> = { critical: 0, warning: 0, info: 0, good: 0 }
  for (const a of open) bySeverity[a.item.severity]++
  return {
    open: [...open],
    overdue: open.filter((a) => dueBucket(a.item.due, ctx.asOf, dueSoonDays) === 'overdue'),
    critical: open.filter((a) => a.item.severity === 'critical'),
    dueSoon: open.filter((a) => dueBucket(a.item.due, ctx.asOf, dueSoonDays) === 'soon'),
    owners: ownerCount(open),
    bySeverity,
  }
}

const share = (n: number, d: number) => (d ? fmt(n / d, 'pct0') : '—')

/** The key figures over the open items in scope. */
export function actionKpis(open: readonly OpenAction[], ctx: Ctx): Kpi[] {
  const c = countActions(open, ctx)
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const views = new Set(open.map((a) => a.item.view)).size
  const teams = new Set(open.filter((a) => a.isTeam).map((a) => a.ownerKey)).size
  const kpi = (
    id: string,
    metricId: string,
    label: string,
    items: OpenAction[],
    note: string,
    title: string,
    value: number = items.length,
  ): Kpi => ({
    id,
    metricId,
    label,
    value,
    format: 'int',
    note,
    drill: items.length ? () => itemsDrill(ctx, title, items) : undefined,
    uses: usesOf(items.length ? items : open),
  })
  const pct = (n: number) => `${share(n, c.open.length)} of open items`
  return [
    kpi('open', M.open, 'Open items', c.open, `From ${plural(views, 'view')}`, 'Open items'),
    kpi('overdue', M.overdue, 'Overdue', c.overdue, pct(c.overdue.length), 'Overdue items'),
    kpi('critical', M.critical, 'Critical', c.critical, pct(c.critical.length), 'Critical items'),
    kpi(
      'due-soon',
      M.dueSoon,
      'Due soon',
      c.dueSoon,
      `Within ${dueSoonDays} d of ${formatDate(ctx.asOf)}`,
      `Items due within ${dueSoonDays} d`,
    ),
    {
      id: 'owners',
      metricId: M.owners,
      label: 'Owners',
      value: c.owners,
      format: 'int',
      note: `${plural(c.owners - teams, 'person', 'people')}, ${plural(teams, 'team')}`,
      // The owners themselves, one row each; each owner's count opens their items.
      drill: c.owners ? () => ownersDrill(open, ctx) : undefined,
      uses: usesOf(open),
    },
  ]
}

/**
 * One row per owner, a person in two owner groups once (as the Owners count counts them), the
 * most pressing first: critical items, then overdue, then the most items.
 */
export function ownerRows(open: readonly OpenAction[], ctx: Ctx): ActionOwnerRow[] {
  const byOwner = new Map<string, { blocks: OwnerBlock[]; groups: string[] }>()
  for (const g of groupByOwner(open, ctx.asOf))
    for (const b of g.owners) {
      const seen = byOwner.get(b.ownerKey)
      if (seen) {
        seen.blocks.push(b)
        seen.groups.push(g.label)
      } else byOwner.set(b.ownerKey, { blocks: [b], groups: [g.label] })
    }
  return [...byOwner.values()]
    .map(({ blocks, groups }) => {
      const first = blocks[0]
      const items = blocks.flatMap((b) => b.items)
      return {
        owner: first.name,
        ownerGroup: groups.join(', '),
        personId: first.isTeam ? null : first.ownerId,
        items: items.length,
        overdue: blocks.reduce((n, b) => n + b.overdue, 0),
        critical: blocks.reduce((n, b) => n + b.critical, 0),
        itemsDrill: () => itemsDrill(ctx, `Open items waiting on ${first.name}`, items),
      }
    })
    .sort(
      (a, b) =>
        b.critical - a.critical ||
        b.overdue - a.overdue ||
        b.items - a.items ||
        a.owner.localeCompare(b.owner),
    )
}

/** The Owners count's records: the owners, each opening the items that wait on them. */
export function ownersDrill(open: readonly OpenAction[], ctx: Ctx): DrillSpec<'actionOwners'> {
  const uses = usesOf(open)
  return drillSpec({
    kind: 'actionOwners',
    title: 'Owners of open items',
    subtitle: `${ctx.scopeLabel} · as of ${formatDate(ctx.asOf)}`,
    rows: ownerRows(open, ctx),
    note: 'Everyone open items wait on, a person once even when they own items in two groups. Select a count of open items to see them.',
    ...(uses.length ? { uses } : {}),
  })
}

/* ───────── figure rows ───────── */

export interface OwnerDueRow {
  [key: string]: unknown
  group: string
  due: string
  bucket: DueBucket
  items: number
}

/** Open items per owner group, split by due date (stacked bars), in owner-group order. */
export function ownerDueRows(open: readonly OpenAction[], ctx: Ctx): OwnerDueRow[] {
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const out: OwnerDueRow[] = []
  for (const g of groupByOwner(open, ctx.asOf)) {
    for (const b of DUE_BUCKETS) {
      const n = g.items.filter((a) => dueBucket(a.item.due, ctx.asOf, dueSoonDays) === b).length
      if (n) out.push({ group: g.label, due: dueBucketLabel(b, dueSoonDays), bucket: b, items: n })
    }
  }
  return out
}

/** The same items as a table: one row per owner group with each due bucket as a column. */
export interface OwnerTableRow {
  [key: string]: unknown
  group: string
  open: number
  overdue: number
  soon: number
  later: number
  none: number
  critical: number
}

export function ownerTableRows(open: readonly OpenAction[], ctx: Ctx): OwnerTableRow[] {
  const { dueSoonDays } = settingsOf(ctx.metrics)
  return groupByOwner(open, ctx.asOf).map((g) => {
    const n = (b: DueBucket) =>
      g.items.filter((a) => dueBucket(a.item.due, ctx.asOf, dueSoonDays) === b).length
    return {
      group: g.label,
      open: g.items.length,
      overdue: n('overdue'),
      soon: n('soon'),
      later: n('later'),
      none: n('none'),
      critical: g.critical,
    }
  })
}

export interface ViewCountRow {
  [key: string]: unknown
  view: string
  viewKey: string
  open: number
  overdue: number
  critical: number
  secondary: string
}

/** Open items per source view, most first. */
export function viewRows(open: readonly OpenAction[], ctx: Ctx): ViewCountRow[] {
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const by = new Map<string, OpenAction[]>()
  for (const a of open) {
    const list = by.get(a.item.view)
    if (list) list.push(a)
    else by.set(a.item.view, [a])
  }
  return [...by.entries()]
    .map(([viewKey, items]) => {
      const overdue = items.filter((a) => dueBucket(a.item.due, ctx.asOf, dueSoonDays) === 'overdue').length
      return {
        view: items[0].viewLabel,
        viewKey,
        open: items.length,
        overdue,
        critical: items.filter((a) => a.item.severity === 'critical').length,
        secondary: overdue ? `${fmt(overdue, 'int')} overdue` : '',
      }
    })
    .sort((a, b) => b.open - a.open || a.view.localeCompare(b.view))
}

/** "Critical 12 · Watch 80 · Note 30", for the header's counts by severity. */
export function severityLine(c: Pick<ActionCounts, 'bySeverity'>, words: Record<Severity, string>): string {
  return SEVERITY_ORDER.filter((s) => c.bySeverity[s] > 0)
    .map((s) => `${words[s]} ${fmt(c.bySeverity[s], 'int')}`)
    .join(' · ')
}
