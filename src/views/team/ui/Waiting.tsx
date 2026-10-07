/**
 * My team, Waiting on this org: the Action center's open items that the leader or someone in their
 * org owns, the leader's own first, at most ten, with the Action center one link away. Each item
 * opens its own records; an employee relations item never names anyone (the Action center's rule).
 */
import { type Column, Figure } from '@/charts'
import { Pending, RouteLink, Section } from '@/components'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill'
import { fmt, plural } from '@/lib/format'
import { dueText, type OpenAction, SEVERITY_WORD, usesOf } from '@/views/actions/engine'
import { M as ACTIONS } from '@/views/actions/metrics'
import { WAITING_SHOWN } from '../engine'
import type { TeamItems } from './useTeamItems'

const LINK = 'text-small font-medium text-link underline-offset-2 hover:underline'

interface Row {
  severity: string
  what: string
  owner: string
  about: string
  due: string
  from: string
  a: OpenAction
}

export function WaitingSection({ items }: { items: TeamItems | null }) {
  const ctx = useAnalytics()
  const actions = (
    <RouteLink view="actions" className={LINK}>
      Open the Action center
    </RouteLink>
  )
  const dek = 'Open items that the leader or someone in their org owns, anywhere in the company.'
  if (!items)
    return (
      <Section title="Waiting on this org" dek={dek} actions={actions}>
        <Pending title="Open items" span={12} height={200} message="Collecting open items from each view." />
      </Section>
    )
  const rows: Row[] = items.items.map((a) => ({
    severity: SEVERITY_WORD[a.item.severity],
    what: a.item.what,
    owner: a.ownerName,
    about: a.item.subject.label,
    due: dueText(a.item.due, ctx.asOf),
    from: a.from,
    a,
  }))
  const open = (r: Row) => r.a.item.drill ?? null
  // Severity is a column (so exports carry it), not also a status icon on the row.
  const columns: Column<Row>[] = [
    { key: 'severity', label: 'Severity' },
    { key: 'what', label: 'What is open', drill: open },
    { key: 'owner', label: 'Waiting on' },
    { key: 'about', label: 'About', drill: open },
    { key: 'due', label: 'Due' },
    { key: 'from', label: 'From' },
  ]
  const overdue = rows.filter((r) => r.a.item.due && r.a.item.due < ctx.asOf).length
  // The page lists the first ten (ROLES.md 2.2); the Action center lists every one.
  const listed = rows.slice(0, WAITING_SHOWN)
  return (
    <Section title="Waiting on this org" dek={dek} actions={actions}>
      <Figure
        id="team-waiting"
        metric={ACTIONS.open}
        uses={usesOf(items.items)}
        title="Open items"
        subtitle="The leader's own items first, then by severity and due date"
        data={listed}
        columns={columns}
        note={`${plural(rows.length, 'open item')}${overdue ? ` · ${fmt(overdue, 'int')} overdue` : ''}${rows.length > WAITING_SHOWN ? ` · the first ${WAITING_SHOWN} listed; the Action center lists every one` : ''}`}
        span={12}
        tableOnly
        table={{
          onRowClick: (r) => drill(open(r)),
        }}
        className={items.stale ? 'opacity-60 transition-opacity' : undefined}
        empty={rows.length ? null : 'Nothing that this org owns is open.'}
      />
    </Section>
  )
}
