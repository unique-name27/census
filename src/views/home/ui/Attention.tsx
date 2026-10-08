/**
 * Needs attention on a role home (docs/ROLES-V2.md 5.2; CHRO's escalations, 5.4): "Where your items
 * wait" (span 4) beside the most urgent items (span 8). The items are the mode's Needs attention
 * from the Action center's split, so the counts here are the Action center's and the masthead's.
 * Rows are read only: Mark handled and Snooze stay in the Action center, one link away, and
 * "Waiting on others" opens it on that list.
 */
import { type ReactNode, useState } from 'react'
import { type Column, Figure, HBars, useChartTheme } from '@/charts'
import { goTo, Pending, RouteLink, Section } from '@/components'
import { TierBadge } from '@/components/tier/TierBadge'
import { Button, cx, StatusPill } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { Drill, drill } from '@/drill/Drill'
import { openPerson } from '@/drill/store'
import type { DrillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import {
  type DueBucket,
  daysToDue,
  dueBucketLabel,
  dueText,
  EXPORT_COLUMNS,
  itemsDrill,
  lensFor,
  nothingWaiting,
  type OpenAction,
  SEVERITY_WORD,
  settingsOf,
  usesOf,
} from '@/views/actions/engine'
import { M as ACTIONS } from '@/views/actions/metrics'
import { waitingOn } from '@/views/actions/ui/Sheets'
import { useActionFilters } from '@/views/actions/ui/store'
import {
  type AttentionRow,
  attentionRows,
  belowLine,
  OTHER,
  type WaitBy,
  type WaitRow,
  type WaitSegment,
  waitRows,
} from '../engine/attention'
import type { HomeItems } from './useHomeItems'

const LINK = 'text-meta font-medium text-link underline-offset-2 hover:underline'

/** The export's columns: the Action center's list export, plus the legal exposure flag. */
const COLUMNS: Column<AttentionRow>[] = [
  ...EXPORT_COLUMNS.filter((c) => c.key !== 'status').slice(0, 3),
  { key: 'exposure', label: 'Legal exposure' },
  ...EXPORT_COLUMNS.filter((c) => c.key !== 'status').slice(3),
]

/* ───────── where the items wait ───────── */

export function WaitFigure({
  id,
  items,
  by,
  stale,
}: {
  id: string
  items: readonly OpenAction[]
  by: WaitBy
  stale: boolean
}) {
  const ctx = useAnalytics()
  const theme = useChartTheme()
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const w = waitRows(items, ctx, by)
  const all = waitRows(items, ctx, by, Number.POSITIVE_INFINITY)
  const labels = w.buckets
  // Due state is the subject, so the segments carry status colors with the legend's words.
  const colors: Record<string, string> = {
    [labels[0]]: theme.status.critical,
    [labels[1]]: theme.status.warning,
    [labels[2]]: theme.series[0],
    [labels[3]]: theme.deemph,
  }
  const escalations = by === 'practice'
  const name = (r: Pick<WaitRow, 'group' | 'folded'>) =>
    r.group === OTHER && r.folded ? plural(r.folded, escalations ? 'other practice' : 'other kind') : r.group
  const spec = (title: string, list: readonly OpenAction[]): DrillSpec | null =>
    list.length ? itemsDrill(ctx, title, list) : null
  const whole = (rows: readonly WaitRow[]) => (r: Pick<WaitRow, 'group'>) => () => {
    const row = rows.find((x) => x.group === r.group)
    return row ? spec(name(row), row.list) : null
  }
  const segment = (d: WaitSegment) => () => {
    const row = w.rows.find((x) => x.group === d.group)
    return spec(`${row ? name(row) : d.group}: ${d.due.toLowerCase()}`, d.list)
  }
  const inBucket = (bucket: DueBucket) => (r: WaitRow) => {
    const list = r.list.filter((a) => {
      const days = daysToDue(a.item.due, ctx.asOf)
      const b: DueBucket =
        days == null ? 'none' : days < 0 ? 'overdue' : days <= dueSoonDays ? 'soon' : 'later'
      return b === bucket
    })
    return list.length
      ? () => spec(`${name(r)}: ${dueBucketLabel(bucket, dueSoonDays).toLowerCase()}`, list)
      : null
  }
  const columns: Column<WaitRow>[] = [
    { key: 'group', label: escalations ? 'Practice' : 'Kind' },
    { key: 'open', label: escalations ? 'Escalations' : 'Items', format: 'int', drill: whole(all.rows) },
    { key: 'overdue', label: labels[0], format: 'int', drill: inBucket('overdue') },
    { key: 'soon', label: labels[1], format: 'int', drill: inBucket('soon') },
    { key: 'later', label: labels[2], format: 'int', drill: inBucket('later') },
    { key: 'none', label: labels[3], format: 'int', drill: inBucket('none') },
    {
      key: 'critical',
      label: 'Critical',
      format: 'int',
      drill: (r) => {
        const list = r.list.filter((a) => a.item.severity === 'critical')
        return list.length ? () => spec(`${name(r)}: critical`, list) : null
      },
    },
  ]
  return (
    <Figure
      id={id}
      metric={escalations ? ACTIONS.critical : ACTIONS.open}
      uses={usesOf(items)}
      title={escalations ? 'Escalations by practice' : 'Where your items wait'}
      subtitle={`${escalations ? 'Escalations by the practice that raised them' : 'Your open items by kind of work'} and when they fall due, as of ${formatDate(ctx.asOf)}`}
      data={all.rows}
      columns={columns}
      definitions={[
        {
          term: escalations ? 'Practice' : 'Kind',
          text: escalations
            ? 'The view that raised the item. On the chart, practices past the sixth are combined as Other; the table and exports list every one.'
            : 'The kind of work the view that raised the item names. On the chart, kinds past the sixth are combined as Other; the table and exports list every kind.',
        },
        {
          term: 'Due',
          text: `Overdue fell due before the as-of date; due within ${fmt(dueSoonDays, 'days')} counts from it.`,
        },
      ]}
      note={`${plural(items.length, escalations ? 'escalation' : 'item')} · ${plural(all.rows.length, escalations ? 'practice' : 'kind')}`}
      span={4}
      className={stale ? 'opacity-60 transition-opacity' : undefined}
      empty={items.length ? null : escalations ? 'No escalations.' : 'Nothing is waiting on you.'}
      emptyHeight={200}
    >
      <HBars<WaitSegment>
        data={w.segments}
        y="group"
        x="items"
        series="due"
        stack
        seriesOrder={labels}
        yOrder={w.groups}
        colors={colors}
        format="int"
        onSelect={(d) => drill(whole(w.rows)(d))}
        onSelectSegment={(d) => drill(segment(d))}
        ariaLabel={
          escalations
            ? 'Escalations by practice, stacked by due date'
            : 'Your open items by kind, stacked by due date'
        }
      />
    </Figure>
  )
}

/* ───────── the most urgent items ───────── */

function About({ a }: { a: OpenAction }) {
  const label = a.item.subject.label
  if (a.item.drill)
    return (
      <Drill spec={a.item.drill} label={`Show the records behind ${label}`}>
        {label}
      </Drill>
    )
  if (a.personId) {
    const id = a.personId
    return (
      <button
        type="button"
        onClick={() => openPerson(id)}
        title={`Open ${label}`}
        className="cursor-pointer rounded-mark underline decoration-rule-strong decoration-dotted decoration-1 underline-offset-[3px] hover:decoration-ink hover:decoration-solid"
      >
        {label}
      </button>
    )
  }
  return <span>{label}</span>
}

function ItemLine({ a }: { a: OpenAction }) {
  const ctx = useAnalytics()
  const { asOf } = ctx
  const days = daysToDue(a.item.due, asOf)
  const overdue = days != null && days < 0
  return (
    <li className="grid grid-cols-1 gap-x-3 gap-y-1 border-t border-rule py-2.5 sm:grid-cols-[76px_minmax(0,1fr)_auto]">
      <div className="flex flex-wrap items-center gap-1.5 pt-px sm:flex-col sm:items-start">
        <StatusPill severity={a.item.severity} quiet label={SEVERITY_WORD[a.item.severity]} />
        {a.item.exposure && <span className="text-label font-medium text-bad-text">Legal exposure</span>}
      </div>
      <div className="min-w-0">
        <p className="text-small leading-snug text-ink">{a.item.what}</p>
        <p className="mt-0.5 text-meta leading-snug text-ink-2">
          <About a={a} />
          <span aria-hidden="true" className="px-1.5 text-muted">
            ·
          </span>
          <span>{waitingOn(a, lensFor(ctx).me)}</span>
          <span aria-hidden="true" className="px-1.5 text-muted">
            ·
          </span>
          <RouteLink
            view={a.item.view}
            tab={a.item.tab ?? undefined}
            className="rounded-mark text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink hover:decoration-ink"
          >
            {a.from}
          </RouteLink>
        </p>
        {a.below && (
          <div className="mt-1">
            <TierBadge
              tier={a.below.tier}
              compact
              explain={`${a.below.subject} is below your data standard. Workflow items still show.`}
              dataset={a.below.dataset}
            />
          </div>
        )}
      </div>
      <span
        className={`text-meta whitespace-nowrap sm:text-right ${overdue ? 'font-medium text-bad-text' : 'text-ink-2'}`}
      >
        {dueText(a.item.due, asOf)}
      </span>
    </li>
  )
}

/**
 * The most urgent items as a read-only list (severity, what, about, waiting on, from and due), the
 * first `shown` before "Show all"; the export carries every item with the Action center's columns.
 */
export function AttentionList({
  id,
  items,
  escalations = false,
  shown,
  stale,
  empty,
}: {
  id: string
  items: readonly OpenAction[]
  escalations?: boolean
  shown: number
  stale: boolean
  empty: string
}) {
  const ctx = useAnalytics()
  const [all, setAll] = useState(false)
  const rows = attentionRows(items, ctx.asOf)
  const list = all ? items : items.slice(0, shown)
  const more = items.length - list.length
  const below = belowLine(items)
  const overdue = items.filter((a) => (daysToDue(a.item.due, ctx.asOf) ?? 0) < 0).length
  return (
    <Figure
      id={id}
      metric={escalations ? ACTIONS.critical : ACTIONS.open}
      uses={usesOf(items)}
      // Not the section's own title again: the section is "Needs attention" (or "Top risks").
      title={escalations ? 'Escalations' : 'Most urgent'}
      subtitle={
        escalations
          ? 'Legal exposure, critical roles at high risk of loss, exit clusters and critical items long overdue, each with its owner'
          : 'Your most urgent open items: legal exposure first, then severity and days overdue'
      }
      data={rows}
      columns={COLUMNS}
      note={[
        `${plural(items.length, escalations ? 'escalation' : 'item')}${overdue ? ` · ${fmt(overdue, 'int')} overdue` : ''}`,
        below ?? '',
        `as of ${formatDate(ctx.asOf)}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      span={8}
      image={false}
      tableToggle={false}
      // On a phone the list leads its section; the chart of where items wait follows it.
      className={cx('max-md:-order-1', stale && 'opacity-60 transition-opacity')}
      empty={items.length ? null : empty}
      emptyHeight={200}
    >
      <div data-tour="home-attention">
        <ul aria-label={escalations ? 'Escalations' : 'Needs attention'}>
          {list.map((a) => (
            <ItemLine key={a.id} a={a} />
          ))}
        </ul>
        {more > 0 && (
          <div className="border-t border-rule pt-1.5">
            <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
              Show all {fmt(items.length, 'int')}
            </Button>
          </div>
        )}
      </div>
    </Figure>
  )
}

/* ───────── the section ───────── */

/** The Action center on one of the mode's lists. */
function openList(list: 'needs' | 'waiting' | null) {
  useActionFilters.getState().setList(list)
  goTo('actions')
}

export function AttentionSection({
  items,
  escalations = false,
  shown,
  title = 'Needs attention',
  dek,
  children,
}: {
  items: HomeItems | null
  /** CHRO: the escalations by practice (5.4), in a section titled "Top risks". */
  escalations?: boolean
  /** Items listed before "Show all". */
  shown: number
  title?: string
  dek?: ReactNode
  /** More figures in the section (the CHRO's top risks in the data). */
  children?: ReactNode
}) {
  const ctx = useAnalytics()
  const canOpen = ctx.access.can('page:actions')
  const waiting = items?.lists ? items.waiting.length : 0
  const actions = canOpen ? (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {/* A link that would open an empty list is plain text instead. */}
      {!!items?.lists &&
        (waiting > 0 ? (
          <button type="button" className={LINK} onClick={() => openList('waiting')}>
            Waiting on others ({fmt(waiting, 'int')})
          </button>
        ) : (
          <span className="text-meta text-muted">Nothing waiting on others</span>
        ))}
      <button type="button" className={LINK} onClick={() => openList(items?.lists ? 'needs' : null)}>
        Open the Action center
      </button>
    </span>
  ) : undefined
  return (
    <Section title={title} dek={dek} actions={actions}>
      {items ? (
        <>
          <WaitFigure
            id="home-attention-wait"
            items={items.needs}
            by={escalations ? 'practice' : 'kind'}
            stale={items.stale}
          />
          <AttentionList
            id="home-attention"
            items={items.needs}
            escalations={escalations}
            shown={shown}
            stale={items.stale}
            empty={
              escalations
                ? `No escalations ${ctx.isCompany ? 'across the company' : `in ${ctx.scopeLabel}`}.`
                : nothingWaiting(items.ctx)
            }
          />
        </>
      ) : (
        <Pending
          message="Collecting open items from each view."
          frames={[
            {
              title: escalations ? 'Escalations by practice' : 'Where your items wait',
              span: 4,
              height: 240,
            },
            { title: escalations ? 'Escalations' : 'Most urgent', span: 8, height: 240 },
          ]}
        />
      )}
      {children}
    </Section>
  )
}
