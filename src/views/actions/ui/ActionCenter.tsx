/**
 * The Action center page (docs/VIEWS.md, Action center): every open item from every view's
 * `actions(ctx)`, grouped by who it waits on, for the weekly review with each leader.
 *
 * Header: what it lists, scope and as-of date, counts by severity, the "My team" picker (the
 * leader filter: a manager's items and their team's) and the Excel export of the list. Then the
 * key figures, where items wait (by owner group and due date, and by view), the page's own
 * filters, and one sheet per owner group. Items the data standard holds back are counted, with
 * what holds them back. Handled and snoozed items are kept in this browser and can be reopened.
 */
import { type ReactNode, useMemo } from 'react'
import { leaderOptions } from '@/app/filterOptions'
import { LeaderPicker } from '@/app/LeaderPicker'
import { BarList, Figure, HBars, useChartTheme, useExportMeta } from '@/charts'
import type { Column } from '@/charts/types'
import { EmptyState } from '@/components/EmptyState'
import { IconDownload, IconSearch } from '@/components/icons'
import { KpiStrip } from '@/components/KpiStrip'
import { MultiSelect } from '@/components/MultiSelect'
import { goTo } from '@/components/navigation'
import { Grid, Section } from '@/components/Section'
import { belowStandardText } from '@/components/tier/tierModel'
import { toast } from '@/components/toast'
import type { Severity } from '@/components/types'
import { Button, Segmented, SeverityIcon } from '@/components/ui'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { TIER_LABEL } from '@/data/quality/tier'
import type { ViewKey } from '@/data/schema'
import { useCensus } from '@/data/store'
import { drill } from '@/drill'
import type { DrillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { downloadXlsx } from '@/lib/export/xlsx'
import { fmt, plural } from '@/lib/format'
import { minGroupOf } from '@/metrics/privacy'
import { firstName } from '@/views/hrbp/engine/owners'
import { ACTION_OWNER_LABEL, ACTION_OWNER_ROLES, type ActionOwnerRole } from '@/views/types'
import {
  actionKpis,
  type Collected,
  countActions,
  DUE_BUCKETS,
  type DueBucket,
  dueBucket,
  dueBucketLabel,
  EXPORT_COLUMNS,
  exportRows,
  filterActions,
  groupByOwner,
  type ItemStatus,
  isFiltering,
  itemsDrill,
  type OpenAction,
  type OwnerDueRow,
  type OwnerTableRow,
  ownerDueRows,
  ownerTableRows,
  SEVERITY_ORDER,
  SEVERITY_WORD,
  settingsOf,
  statusOf,
  usesOf,
  type ViewCountRow,
  viewRows,
  type WaitingOn,
} from '../engine'
import { M } from '../metrics'
import { drillItems, OwnerSheet, type StatusFn } from './Sheets'
import { useActionFilters, useActionMarks, useNow } from './store'
import { useCollected } from './useCollected'

const SEVERITIES: readonly Severity[] = SEVERITY_ORDER.filter((s) => s !== 'good')

/* ───────── header ───────── */

function SeverityCounts({ open, ctx }: { open: readonly OpenAction[]; ctx: AnalyticsContext }) {
  const c = countActions(open, ctx)
  const shown = SEVERITIES.filter((s) => c.bySeverity[s] > 0)
  if (!shown.length) return null
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {shown.map((s) => {
        const items = open.filter((a) => a.item.severity === s)
        return (
          <span key={s} className="inline-flex items-center gap-1">
            <SeverityIcon severity={s} />
            <span>{SEVERITY_WORD[s]}</span>
            <button
              type="button"
              onClick={() => drillItems(ctx, `${SEVERITY_WORD[s]} items`, items)}
              aria-label={`Show the ${plural(items.length, `${SEVERITY_WORD[s].toLowerCase()} item`)}`}
              className="tnum cursor-pointer rounded-[2px] font-semibold text-ink underline decoration-rule-strong decoration-dotted underline-offset-[3px] hover:decoration-ink hover:decoration-solid"
            >
              {fmt(items.length, 'int')}
            </button>
          </span>
        )
      })}
    </span>
  )
}

function MyTeamPicker() {
  const ctx = useAnalytics()
  const leaderId = useCensus((s) => s.filters.leaderId)
  const setFilters = useCensus((s) => s.setFilters)
  const options = useMemo(() => leaderOptions(ctx.org, ctx.asOf, 1), [ctx.org, ctx.asOf])
  return (
    <LeaderPicker
      label="My team"
      noun="manager"
      clearLabel="Everyone"
      emptyText="No people managers in this data."
      options={options}
      value={leaderId}
      currentName={leaderId ? (ctx.org.byId.get(leaderId)?.name ?? leaderId) : undefined}
      onChange={(id) => setFilters({ leaderId: id })}
    />
  )
}

function ExportListButton({ items, status }: { items: readonly OpenAction[]; status: StatusFn }) {
  const ctx = useAnalytics()
  const meta = useExportMeta()
  const run = async () => {
    try {
      const groups = groupByOwner(items, ctx.asOf)
      const owners = groups.flatMap((g) =>
        g.owners.map((b) => ({
          ownerGroup: g.label,
          owner: b.name,
          items: b.items.length,
          overdue: b.overdue,
          critical: b.critical,
        })),
      )
      const ownerColumns: Column[] = [
        { key: 'ownerGroup', label: 'Owner group' },
        { key: 'owner', label: 'Waiting on' },
        { key: 'items', label: 'Items', format: 'int' },
        { key: 'overdue', label: 'Overdue', format: 'int' },
        { key: 'critical', label: 'Critical', format: 'int' },
      ]
      await downloadXlsx(
        [
          {
            name: 'Items',
            title: 'Action center: items',
            subtitle: 'Items from every view, by who they wait on, most pressing first',
            columns: EXPORT_COLUMNS,
            rows: exportRows(items, ctx.asOf, status),
          },
          { name: 'By owner', title: 'Action center: items by owner', columns: ownerColumns, rows: owners },
        ],
        meta,
        { showPay: ctx.showPay, fileName: 'census-action-center' },
      )
      toast('Action center list downloaded', {
        tone: 'good',
        description: `${plural(items.length, 'item')}.`,
      })
    } catch (err) {
      console.error('Action center export failed', err)
      toast('Export failed. Try again.', { tone: 'critical' })
    }
  }
  return (
    <Button icon={<IconDownload />} disabled={!items.length} onClick={() => void run()}>
      Export list
    </Button>
  )
}

/* ───────── notices ───────── */

function Notices({ collected, stale }: { collected: Collected; stale: boolean }) {
  const ctx = useAnalytics()
  const { hidden, errors, smallScope } = collected
  const lines: ReactNode[] = []
  if (stale) lines.push(<span key="stale">Updating for the new filters.</span>)
  if (hidden.count > 0) {
    const reasons = hidden.reasons
      .slice(0, 3)
      .map((r) => `${r.subject} is ${TIER_LABEL[r.tier]} (${fmt(r.count, 'int')})`)
      .join(', ')
    lines.push(
      <span key="hidden">
        {plural(hidden.count, 'item')} hidden because {hidden.count === 1 ? 'its' : 'their'} data is{' '}
        {ctx.standard === 'bronze' ? 'missing' : belowStandardText(ctx.standard).toLowerCase()}: {reasons}
        {hidden.reasons.length > 3 ? ' and more' : ''}.{' '}
        <button
          type="button"
          onClick={() => goTo('data')}
          className="rounded-[2px] text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
        >
          Open the Data room
        </button>
      </span>,
    )
  }
  if (smallScope)
    lines.push(
      <span key="small">
        Employee relations items are not listed for a scope under {fmt(minGroupOf(ctx.metrics), 'int')}{' '}
        people.
      </span>,
    )
  for (const e of errors)
    lines.push(
      <span key={`err-${e.view}`} className="text-bad-text">
        Items from {e.label} could not be computed. The rest are listed.
      </span>,
    )
  if (!lines.length) return null
  return (
    <div className="col-span-full flex flex-col gap-1 text-[12px] leading-snug text-ink-2" aria-live="polite">
      {lines}
    </div>
  )
}

/* ───────── overview figures ───────── */

type Bucket = DueBucket | 'all' | 'critical'

const ownerTableColumns = (
  soonDays: number,
  spec: (row: OwnerTableRow, bucket: Bucket) => DrillSpec | null,
): Column<OwnerTableRow>[] => {
  const d = (b: Bucket) => (r: OwnerTableRow) => () => spec(r, b)
  return [
    { key: 'group', label: 'Owner group' },
    { key: 'open', label: 'Items', format: 'int', drill: d('all') },
    { key: 'overdue', label: 'Overdue', format: 'int', drill: d('overdue') },
    { key: 'soon', label: dueBucketLabel('soon', soonDays), format: 'int', drill: d('soon') },
    { key: 'later', label: 'Due later', format: 'int', drill: d('later') },
    { key: 'none', label: 'No due date', format: 'int', drill: d('none') },
    { key: 'critical', label: 'Critical', format: 'int', drill: d('critical') },
  ]
}

function WhereItemsWait({ open, status }: { open: readonly OpenAction[]; status: StatusFn }) {
  const ctx = useAnalytics()
  const theme = useChartTheme()
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const groups = groupByOwner(open, ctx.asOf)
  const byLabel = new Map(groups.map((g) => [g.label, g]))
  const stacked = ownerDueRows(open, ctx)
  const table = ownerTableRows(open, ctx)
  const views = viewRows(open, ctx)
  const uses = usesOf(open)
  const labels = DUE_BUCKETS.map((b) => dueBucketLabel(b, dueSoonDays))
  const colors: Record<string, string> = {
    [labels[0]]: theme.status.critical,
    [labels[1]]: theme.status.warning,
    [labels[2]]: theme.series[0],
    [labels[3]]: theme.deemph,
  }
  const specOf = (title: string, items: readonly OpenAction[]): DrillSpec | null =>
    items.length ? itemsDrill(ctx, title, items, { status }) : null
  const matches = (a: OpenAction, bucket: Bucket) =>
    bucket === 'all'
      ? true
      : bucket === 'critical'
        ? a.item.severity === 'critical'
        : dueBucket(a.item.due, ctx.asOf, dueSoonDays) === bucket
  const bucketWords = (bucket: Bucket) =>
    bucket === 'all'
      ? 'items'
      : bucket === 'critical'
        ? 'critical items'
        : `items ${dueBucketLabel(bucket, dueSoonDays).toLowerCase()}`
  const groupSpec = (label: string, bucket: Bucket) =>
    specOf(
      `${label}: ${bucketWords(bucket)}`,
      (byLabel.get(label)?.items ?? []).filter((a) => matches(a, bucket)),
    )
  const viewSpec = (r: Pick<ViewCountRow, 'view' | 'viewKey'>, bucket: Bucket) =>
    specOf(
      `${r.view}: ${bucketWords(bucket)}`,
      open.filter((a) => a.item.view === r.viewKey && matches(a, bucket)),
    )
  const viewColumns: Column<ViewCountRow>[] = [
    { key: 'view', label: 'From' },
    { key: 'open', label: 'Items', format: 'int', drill: (r) => () => viewSpec(r, 'all') },
    { key: 'overdue', label: 'Overdue', format: 'int', drill: (r) => () => viewSpec(r, 'overdue') },
    { key: 'critical', label: 'Critical', format: 'int', drill: (r) => () => viewSpec(r, 'critical') },
  ]
  return (
    <>
      <Figure
        id="actions-by-owner"
        title="Where items wait"
        subtitle={`Open items by owner group and due date, as of ${formatDate(ctx.asOf)}`}
        data={table}
        columns={ownerTableColumns(dueSoonDays, (r, b) => groupSpec(r.group, b))}
        metric={M.open}
        uses={uses}
        span={7}
        note={`Due within ${dueSoonDays} d counts from the as-of date. Select a bar to see its items.`}
        empty={open.length ? null : 'Nothing is open in this scope.'}
      >
        <HBars<OwnerDueRow>
          data={stacked}
          y="group"
          x="items"
          series="due"
          stack
          seriesOrder={labels}
          yOrder={groups.map((g) => g.label)}
          colors={colors}
          format="int"
          ariaLabel="Open items by owner group, stacked by due date"
          onSelect={(d) => drill(() => groupSpec(d.group, 'all'))}
          onSelectSegment={(d) => drill(() => groupSpec(d.group, d.bucket))}
        />
      </Figure>
      <Figure
        id="actions-by-view"
        title="Where items come from"
        subtitle="Open items by the view that raises them"
        data={views}
        columns={viewColumns}
        metric={M.open}
        uses={uses}
        span={5}
        note="Select a bar to see its items. Each item opens the tab that explains it."
        empty={open.length ? null : 'Nothing is open in this scope.'}
      >
        <BarList<ViewCountRow>
          data={views}
          label="view"
          value="open"
          secondary="secondary"
          format="int"
          sort="none"
          ariaLabel="Open items by source view"
          onSelect={(d) => drill(() => viewSpec(d, 'all'))}
        />
      </Figure>
    </>
  )
}

/* ───────── filters ───────── */

function ListControls({
  items,
  leader,
}: {
  /** The items the controls choose among (open or parked), before the page filters. */
  items: readonly OpenAction[]
  leader: Collected['leader']
}) {
  const ctx = useAnalytics()
  const filters = useActionFilters((s) => s.filters)
  const setFilters = useActionFilters((s) => s.setFilters)
  const resetFilters = useActionFilters((s) => s.resetFilters)
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const count = <K extends string>(key: (a: OpenAction) => K) => {
    const m = new Map<K, number>()
    for (const a of items) m.set(key(a), (m.get(key(a)) ?? 0) + 1)
    return m
  }
  const roles = count((a) => a.role)
  const sev = count((a) => a.item.severity)
  const due = count((a) => dueBucket(a.item.due, ctx.asOf, dueSoonDays))
  const views = count((a) => a.item.view)
  const viewLabel = new Map(items.map((a) => [a.item.view, a.viewLabel]))
  const roleOptions = ACTION_OWNER_ROLES.filter((r) => roles.has(r) || filters.roles.includes(r)).map(
    (r) => ({
      value: r,
      label: ACTION_OWNER_LABEL[r],
      count: roles.get(r) ?? 0,
    }),
  )
  const team = (t: WaitingOn) => items.filter((a) => t === 'all' || a.team === t).length
  return (
    <div className="col-span-full flex flex-wrap items-center gap-2">
      <MultiSelect
        label="Owner group"
        options={roleOptions}
        value={[...filters.roles]}
        onChange={(v) => setFilters({ roles: v as ActionOwnerRole[] })}
      />
      <MultiSelect
        label="Severity"
        width={220}
        options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_WORD[s], count: sev.get(s) ?? 0 }))}
        value={[...filters.severities]}
        onChange={(v) => setFilters({ severities: v as Severity[] })}
      />
      <MultiSelect
        label="Due"
        width={240}
        options={DUE_BUCKETS.map((b) => ({
          value: b,
          label: dueBucketLabel(b, dueSoonDays),
          count: due.get(b) ?? 0,
        }))}
        value={[...filters.due]}
        onChange={(v) => setFilters({ due: v as DueBucket[] })}
      />
      <MultiSelect
        label="From"
        width={260}
        options={[...views.entries()].map(([k, n]) => ({ value: k, label: viewLabel.get(k) ?? k, count: n }))}
        value={[...filters.views]}
        onChange={(v) => setFilters({ views: v as ViewKey[] })}
      />
      <label className="relative flex h-8 min-w-0 flex-1 basis-48 items-center sm:max-w-[280px]">
        <span className="sr-only">Search items</span>
        <IconSearch className="pointer-events-none absolute left-2.5 size-3.5 text-muted" />
        <input
          type="search"
          value={filters.query}
          onChange={(e) => setFilters({ query: e.currentTarget.value })}
          placeholder="Search owner, person or req"
          className="h-8 w-full rounded-control bg-sheet pr-2 pl-8 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none placeholder:text-muted"
        />
      </label>
      {leader && (
        <Segmented<WaitingOn>
          label="Waiting on"
          value={filters.waitingOn}
          onChange={(v) => setFilters({ waitingOn: v })}
          options={[
            { value: 'all', label: `All ${fmt(team('all'), 'int')}` },
            { value: 'leader', label: `${firstName(leader.name)} ${fmt(team('leader'), 'int')}` },
            { value: 'org', label: `Their org ${fmt(team('org'), 'int')}` },
            { value: 'other', label: `Others ${fmt(team('other'), 'int')}` },
          ]}
        />
      )}
      {isFiltering(filters) && (
        <Button size="sm" variant="ghost" onClick={resetFilters}>
          Clear filters
        </Button>
      )}
    </div>
  )
}

/* ───────── page ───────── */

function Loading() {
  return (
    <p className="rounded-sheet bg-sheet px-4 py-3.5 text-[13px] text-ink-2" aria-live="polite">
      Collecting open items from every view.
    </p>
  )
}

function Body({ collected, stale }: { collected: Collected; stale: boolean }) {
  const ctx = useAnalytics()
  const marks = useActionMarks((s) => s.marks)
  const now = useNow()
  const filters = useActionFilters((s) => s.filters)
  const mode = useActionFilters((s) => s.mode)
  const setMode = useActionFilters((s) => s.setMode)
  const resetFilters = useActionFilters((s) => s.resetFilters)
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const status = (a: OpenAction): ItemStatus => statusOf(a.id, marks, now)
  const open = collected.items.filter((a) => status(a).state === 'open')
  const parked = collected.items.filter((a) => status(a).state !== 'open')
  const base = mode === 'open' ? open : parked
  const listed = filterActions(base, filters, ctx.asOf, dueSoonDays)
  const groups = groupByOwner(listed, ctx.asOf)
  const kpis = actionKpis(open, ctx)
  const leader = collected.leader
  return (
    <>
      <Grid className="mt-5">
        <Notices collected={collected} stale={stale} />
        <KpiStrip kpis={kpis} />
        <WhereItemsWait open={open} status={status} />
      </Grid>
      <Section
        className="mt-10"
        title={mode === 'open' ? 'Waiting on' : 'Handled and snoozed'}
        dek={
          mode === 'open'
            ? leader
              ? `Items waiting on ${leader.name} or someone in their org anywhere in the company, and items about people in their org waiting on others. Copy a note to send each owner their list.`
              : 'One sheet per owner group, the most pressing owner first. Copy a note to send each owner their list; mark an item handled or snooze it once it is in hand.'
            : 'Items marked handled or snoozed in this browser. A snooze ends on its own; reopen an item to list it again.'
        }
        actions={
          <Segmented<'open' | 'parked'>
            label="Show"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'open', label: `Open ${fmt(open.length, 'int')}` },
              { value: 'parked', label: `Handled and snoozed ${fmt(parked.length, 'int')}` },
            ]}
          />
        }
      >
        <ListControls items={base} leader={leader} />
        {groups.length ? (
          groups.map((g) => <OwnerSheet key={`${mode}-${g.role}`} group={g} mode={mode} statusOf={status} />)
        ) : base.length ? (
          <EmptyState
            title="No items match these filters"
            body="Clear a filter, or search for another name."
            action={
              <Button size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            }
          />
        ) : mode === 'open' ? (
          <EmptyState
            title="Nothing is open"
            body="No view has an item waiting on someone in this scope. Items show here when a decision, a task or a deadline waits on a person or a team."
          />
        ) : (
          <EmptyState
            title="Nothing is handled or snoozed"
            body="Items you mark handled or snooze in this browser show here, so you can reopen them."
          />
        )}
      </Section>
    </>
  )
}

export function ActionCenter() {
  const ctx = useAnalytics()
  const state = useCollected()
  const marks = useActionMarks((s) => s.marks)
  const now = useNow()
  const status = (a: OpenAction): ItemStatus => statusOf(a.id, marks, now)
  const items = state?.value.items ?? []
  const open = items.filter((a) => status(a).state === 'open')
  const filters = useActionFilters((s) => s.filters)
  const mode = useActionFilters((s) => s.mode)
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const exportable = filterActions(
    items.filter((a) => (status(a).state === 'open') === (mode === 'open')),
    filters,
    ctx.asOf,
    dueSoonDays,
  )
  const leader = state?.value.leader ?? null
  return (
    <div>
      <div className="pt-5">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-[420px]">
            <h1 className="cut-head text-[28px] leading-[1.1] font-[650] tracking-[-0.01em]">
              Action center
            </h1>
            <p className="mt-1.5 max-w-[72ch] text-[13px] text-ink-2">
              {leader
                ? `${leader.name}'s items and their team's, from every view, grouped by who they wait on.`
                : 'Open items from every view, grouped by who they wait on: decisions, tasks, deadlines and follow-ups to raise in each leader review.'}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-2">
              <span>{ctx.scopeLabel}</span>
              <span aria-hidden="true" className="text-muted">
                ·
              </span>
              <span>as of {formatDate(ctx.asOf)}</span>
              {state && open.length > 0 && (
                <>
                  <span aria-hidden="true" className="text-muted">
                    ·
                  </span>
                  <SeverityCounts open={open} ctx={ctx} />
                </>
              )}
            </div>
          </div>
          <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
            <MyTeamPicker />
            <ExportListButton items={exportable} status={status} />
          </div>
        </div>
        <div className="mt-4 border-b border-rule" />
      </div>
      {state ? (
        <Body collected={state.value} stale={state.stale} />
      ) : (
        <div className="mt-5">
          <Loading />
        </div>
      )}
    </div>
  )
}
