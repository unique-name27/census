/**
 * The Action center's charts from the design refresh (docs/CHARTS.md, Action center), shown in
 * every mode over the items the mode lists:
 *
 *  - When items fall due: open items by due band, stacked by severity, so one chart says how stale
 *    the backlog is and which weeks are coming. A segment opens its items, a column the band's.
 *  - Who has the most waiting: the owners with the most open items, overdue and critical counts
 *    beside them, the glyph marking any critical (or overdue) item. A bar opens the owner's items.
 *  - What is waiting, by kind: kinds of work (interview decisions, day-one tasks, required
 *    training …) stacked by due bucket in the colors of "Where items wait".
 *
 * Due bands, owners and kinds are not filter dimensions, so nothing offers "Filter to". Employee
 * relations items keep their rules: counted, never named (their owner is a team, their kind
 * "Case past target").
 */
import { BarList, type Column, Columns, Figure, HBars, useChartTheme } from '@/charts'
import type { Severity } from '@/components/types'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill'
import type { DrillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import {
  DUE_BUCKETS,
  dueBucket,
  dueBucketLabel,
  itemsDrill,
  type OpenAction,
  SEVERITY_WORD,
  settingsOf,
  usesOf,
} from '../engine'
import {
  type DueTimelineRow,
  type DueTimelineTableRow,
  dueTimeline,
  type KindDueRow,
  type KindRows,
  type KindTableRow,
  kindRows,
  OTHER,
  type TopOwnerRow,
  topOwners,
} from '../engine/charts'
import { M } from '../metrics'
import type { StatusFn } from './Sheets'

/** Owners named on the chart; the rest fold into "Other". */
const TOP_OWNERS = 12

type Props = { open: readonly OpenAction[]; status: StatusFn }

const EMPTY = 'Nothing is open in this scope.'

/** When open items fall due, by due band and severity. */
export function DueTimeline({ open, status }: Props) {
  const ctx = useAnalytics()
  const theme = useChartTheme()
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const t = dueTimeline(open, ctx.asOf)
  const spec = (title: string, items: readonly OpenAction[]): DrillSpec | null =>
    items.length ? itemsDrill(ctx, title, items, { status }) : null
  const colors: Record<string, string> = {
    [SEVERITY_WORD.critical]: theme.status.critical,
    [SEVERITY_WORD.warning]: theme.status.warning,
    [SEVERITY_WORD.info]: theme.deemph,
    [SEVERITY_WORD.good]: theme.status.good,
  }
  const sevWord = (s: Severity) => SEVERITY_WORD[s].toLowerCase()
  const segment = (r: DueTimelineRow) => () => spec(`${r.bandLabel}: ${sevWord(r.severity)} items`, r.list)
  const band = (r: Pick<DueTimelineTableRow, 'band' | 'bandLabel'>) => () =>
    spec(`${r.bandLabel}: open items`, t.table.find((x) => x.band === r.band)?.list ?? [])
  const bySeverity = (s: Severity) => (r: DueTimelineTableRow) =>
    r.list.some((a) => a.item.severity === s || (s === 'info' && a.item.severity === 'good'))
      ? () =>
          spec(
            `${r.bandLabel}: ${sevWord(s)} items`,
            r.list.filter((a) => a.item.severity === s || (s === 'info' && a.item.severity === 'good')),
          )
      : null
  const columns: Column<DueTimelineTableRow>[] = [
    { key: 'bandLabel', label: 'Due' },
    { key: 'open', label: 'Open items', format: 'int', drill: band },
    { key: 'critical', label: 'Critical', format: 'int', drill: bySeverity('critical') },
    { key: 'watch', label: 'Watch', format: 'int', drill: bySeverity('warning') },
    { key: 'note', label: 'Note', format: 'int', drill: bySeverity('info') },
  ]
  const overdue = t.table.filter((r) => r.band.startsWith('over')).reduce((n, r) => n + r.open, 0)
  return (
    <Figure
      id="actions-due-timeline"
      title="When items fall due"
      subtitle={`Open items by how long ago or how soon they fall due, and their severity, as of ${formatDate(ctx.asOf)}`}
      data={t.table}
      columns={columns}
      metric={M.overdue}
      uses={usesOf(open)}
      span={7}
      definitions={[
        {
          term: 'Due',
          text: 'Days from the as-of date to the item’s due date, in weeks once it is a week or more away. Overdue items fell due before the as-of date.',
        },
        {
          term: 'Severity',
          text: 'Critical and Watch come from the view that raised the item; Note is for awareness.',
        },
        {
          term: 'Due soon',
          text: `The key figure Due soon counts items due within ${fmt(dueSoonDays, 'days')} of the as-of date.`,
        },
      ]}
      note={`${fmt(overdue, 'int')} of ${plural(open.length, 'open item')} overdue`}
      empty={open.length ? null : EMPTY}
      emptyHeight={240}
    >
      <Columns<DueTimelineRow>
        data={t.rows}
        x="bandLabel"
        y="items"
        series="severityLabel"
        stack
        seriesOrder={t.severities}
        xOrder={t.table.map((r) => r.bandLabel)}
        colors={colors}
        format="int"
        selectable={(d, seg) => (seg ? d.items > 0 : (t.table.find((x) => x.band === d.band)?.open ?? 0) > 0)}
        onSelect={(d) => drill(band(d))}
        onSelectSegment={(d) => drill(segment(d))}
        ariaLabel="Open items by when they fall due, stacked by severity"
      />
    </Figure>
  )
}

/** The owners with the most open items. */
export function TopOwners({ open, status }: Props) {
  const ctx = useAnalytics()
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const rows = topOwners(open, ctx)
  const spec = (title: string, items: readonly OpenAction[]): DrillSpec | null =>
    items.length ? itemsDrill(ctx, title, items, { status }) : null
  const one = (r: TopOwnerRow) => () => spec(`Open items waiting on ${r.owner}`, r.list)
  const only = (which: 'overdue' | 'critical') => (r: TopOwnerRow) => {
    const list = r.list.filter((a) =>
      which === 'critical'
        ? a.item.severity === 'critical'
        : dueBucket(a.item.due, ctx.asOf, dueSoonDays) === 'overdue',
    )
    return list.length
      ? () => spec(`${which === 'critical' ? 'Critical' : 'Overdue'} items waiting on ${r.owner}`, list)
      : null
  }
  const columns: Column<TopOwnerRow>[] = [
    { key: 'owner', label: 'Waiting on' },
    { key: 'ownerGroup', label: 'Owner group' },
    { key: 'items', label: 'Open items', format: 'int', drill: one },
    { key: 'overdue', label: 'Overdue', format: 'int', drill: only('overdue') },
    { key: 'critical', label: 'Critical', format: 'int', drill: only('critical') },
  ]
  return (
    <Figure
      id="actions-top-owners"
      title="Who has the most waiting"
      subtitle="Open items by who they wait on, a person once across owner groups"
      data={rows}
      columns={columns}
      metric={M.owners}
      uses={usesOf(open)}
      span={5}
      table={{ maxRows: 15 }}
      definitions={[
        {
          term: 'Glyph',
          text: 'A triangle marks an owner with a critical item; a diamond, an owner with an overdue item.',
        },
        {
          term: 'Teams',
          text: 'Items waiting on a team or a queue (IT, People operations) count under the team. Employee relations items always wait on a team and never name the person.',
        },
      ]}
      note={`${plural(rows.length, 'owner')} · ${fmt(rows.filter((r) => r.isTeam).length, 'int')} of them teams`}
      empty={open.length ? null : EMPTY}
      emptyHeight={240}
    >
      <BarList<TopOwnerRow>
        data={rows}
        label="owner"
        value="items"
        unit="items"
        format="int"
        top={TOP_OWNERS}
        secondary={(d) =>
          [
            d.overdue ? `${fmt(d.overdue, 'int')} overdue` : null,
            d.critical ? `${fmt(d.critical, 'int')} critical` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        }
        glyphTone={(d) => (d.critical ? 'critical' : d.overdue ? 'warning' : 'default')}
        onSelect={(d) => drill(one(d))}
        onSelectOther={(rest) =>
          drill(() =>
            spec(
              `Open items waiting on ${plural(rest.length, 'other owner')}`,
              rest.flatMap((r) => r.list),
            ),
          )
        }
        ariaLabel="Open items by owner, the most first"
      />
    </Figure>
  )
}

/** What is waiting, by kind of work and due date. */
export function ByKind({ open, status }: Props) {
  const ctx = useAnalytics()
  const theme = useChartTheme()
  const { dueSoonDays } = settingsOf(ctx.metrics)
  // The chart folds kinds past the eleventh into Other; the table and exports list every kind.
  const k = kindRows(open, ctx)
  const all = kindRows(open, ctx, Number.POSITIVE_INFINITY)
  const labels = DUE_BUCKETS.map((b) => dueBucketLabel(b, dueSoonDays))
  const colors: Record<string, string> = {
    [labels[0]]: theme.status.critical,
    [labels[1]]: theme.status.warning,
    [labels[2]]: theme.series[0],
    [labels[3]]: theme.deemph,
  }
  const spec = (title: string, items: readonly OpenAction[]): DrillSpec | null =>
    items.length ? itemsDrill(ctx, title, items, { status }) : null
  const kindName = (kind: string, folded?: number) =>
    kind === OTHER && folded ? `${plural(folded, 'other kind')}` : kind
  const segmentOf = (m: KindRows) => (r: KindDueRow) => () => {
    const t = m.table.find((x) => x.kind === r.kind)
    return spec(`${kindName(r.kind, t?.folded)}: ${r.due.toLowerCase()}`, r.list)
  }
  const wholeOf = (m: KindRows) => (r: Pick<KindTableRow, 'kind'>) => () => {
    const t = m.table.find((x) => x.kind === r.kind)
    return spec(kindName(r.kind, t?.folded), t?.list ?? [])
  }
  const segment = segmentOf(k)
  const whole = wholeOf(k)
  const inBucket = (bucket: (typeof DUE_BUCKETS)[number]) => (r: KindTableRow) => {
    const seg = all.rows.find((x) => x.kind === r.kind && x.bucket === bucket)
    return seg ? segmentOf(all)(seg) : null
  }
  const columns: Column<KindTableRow>[] = [
    { key: 'kind', label: 'Kind' },
    { key: 'from', label: 'From' },
    { key: 'open', label: 'Open items', format: 'int', drill: wholeOf(all) },
    { key: 'overdue', label: labels[0], format: 'int', drill: inBucket('overdue') },
    { key: 'soon', label: labels[1], format: 'int', drill: inBucket('soon') },
    { key: 'later', label: labels[2], format: 'int', drill: inBucket('later') },
    { key: 'none', label: labels[3], format: 'int', drill: inBucket('none') },
  ]
  return (
    <Figure
      id="actions-by-kind"
      title="What is waiting, by kind"
      subtitle={`Open items by the kind of work and when they fall due, as of ${formatDate(ctx.asOf)}`}
      data={all.table}
      columns={columns}
      metric={M.open}
      uses={usesOf(open)}
      span={7}
      definitions={[
        {
          term: 'Kind',
          text: 'The kind of work the view that raised the item names: an interview decision, a day-one task, required training overdue, a case past target. On the chart, kinds past the eleventh are combined as Other; the table and exports list every kind.',
        },
        {
          term: 'Due',
          text: `Overdue fell due before the as-of date; due within ${fmt(dueSoonDays, 'days')} counts from it.`,
        },
      ]}
      note={`${plural(all.table.length, 'kind')} · ${plural(open.length, 'open item')}`}
      empty={open.length ? null : EMPTY}
      emptyHeight={240}
    >
      <HBars<KindDueRow>
        data={k.rows}
        y="kind"
        x="items"
        series="due"
        stack
        seriesOrder={k.buckets}
        yOrder={k.kinds}
        colors={colors}
        format="int"
        onSelect={(d) => drill(whole(d))}
        onSelectSegment={(d) => drill(segment(d))}
        ariaLabel="Open items by kind, stacked by due date"
      />
    </Figure>
  )
}
