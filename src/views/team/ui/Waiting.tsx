/**
 * My team's Needs attention (docs/ROLES-V2.md 5.12): the manager's own open items (interview
 * decisions on their reqs, probation decisions, the training item for their team, stay
 * conversations), the most pressing first, and one switch away the items in their area that
 * someone else holds ("Waiting on others": day-one contingencies held by People operations). The
 * first ten show; the Action center lists every one. Each item opens its own records; an employee
 * relations item never names anyone (the Action center's rule).
 */
import { useState } from 'react'
import { type Column, Figure } from '@/charts'
import { Pending, RouteLink, Section, Segmented } from '@/components'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill'
import { fmt, plural } from '@/lib/format'
import { dueText, lensFor, type OpenAction, SEVERITY_WORD, usesOf } from '@/views/actions/engine'
import { M as ACTIONS } from '@/views/actions/metrics'
import { waitingOn } from '@/views/actions/ui/Sheets'
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

type List = 'needs' | 'waiting'

export function WaitingSection({ items }: { items: TeamItems | null }) {
  const ctx = useAnalytics()
  const [picked, setList] = useState<List>('needs')
  // Where a mode hides the Action center, its items stay off My team too.
  if (!ctx.access.can('page:actions')) return null
  const actions = (
    <RouteLink view="actions" className={LINK}>
      Open the Action center
    </RouteLink>
  )
  const dek =
    'Your own open items, the most pressing first, and the ones in your org that someone else holds.'
  if (!items)
    return (
      <Section title="Needs attention" dek={dek} actions={actions}>
        <Pending title="Your items" span={12} height={200} message="Collecting open items from each view." />
      </Section>
    )
  // With nothing waiting on others there is one list, and no switch to an empty one.
  const list: List = items.waiting.length ? picked : 'needs'
  const shown = list === 'needs' ? items.needs : items.waiting
  // The manager reads "You" for their own items, never their own name.
  const me = lensFor(ctx).me
  const rows: Row[] = shown.map((a) => ({
    severity: SEVERITY_WORD[a.item.severity],
    what: a.item.what,
    owner: waitingOn(a, me)
      .replace(/^Waiting on /, '')
      .replace(/^you$/, 'You'),
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
  // The page lists the first ten; the Action center lists every one.
  const listed = rows.slice(0, WAITING_SHOWN)
  return (
    <Section title="Needs attention" dek={dek} actions={actions}>
      <Figure
        id="team-waiting"
        metric={ACTIONS.open}
        uses={usesOf(shown)}
        // Not the section's title again: the section is "Needs attention".
        title={list === 'needs' ? 'Your items' : 'Waiting on others'}
        subtitle={
          list === 'needs'
            ? 'Your own open items: severity, then the due date'
            : 'Open items in your org that someone else holds'
        }
        data={listed}
        columns={columns}
        note={`${plural(rows.length, 'open item')}${overdue ? ` · ${fmt(overdue, 'int')} overdue` : ''}${rows.length > WAITING_SHOWN ? ` · the first ${WAITING_SHOWN} listed; the Action center lists every one` : ''}`}
        span={12}
        tableOnly
        actions={
          items.waiting.length ? (
            <Segmented<List>
              label="List"
              value={list}
              onChange={setList}
              options={[
                { value: 'needs', label: `Needs attention (${fmt(items.needs.length, 'int')})` },
                { value: 'waiting', label: `Waiting on others (${fmt(items.waiting.length, 'int')})` },
              ]}
            />
          ) : (
            <span className="text-meta text-muted">Nothing waiting on others</span>
          )
        }
        table={{
          onRowClick: (r) => drill(open(r)),
        }}
        className={items.stale ? 'opacity-60 transition-opacity' : undefined}
        empty={
          rows.length
            ? null
            : list === 'needs'
              ? 'Nothing is waiting on you.'
              : 'Nothing in your org waits on someone else.'
        }
      />
    </Section>
  )
}
