/**
 * One sheet per owner group (Managers, HR business partners, Recruiters …), each a Figure so it
 * exports. Inside, one block per person or team: their counts (each opens the items behind it),
 * a "Copy note" button with a polite message for that owner, and their items. Each item shows
 * its severity, what is open, what it is about (opens its records), the view it comes from
 * (opens that tab), when it is due, and Mark handled and Snooze, both with Undo.
 */
import { useState } from 'react'
import { Figure } from '@/charts'
import { Dialog } from '@/components/Dialog'
import { IconCheck, IconChevronRight, IconCopy, IconReset } from '@/components/icons'
import { goTo, routeHash } from '@/components/navigation'
import { toast } from '@/components/toast'
import { Button, cx, StatusPill } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import type { ViewKey } from '@/data/schema'
import { Drill, openPerson, resolveDrill } from '@/drill'
import { openDrill } from '@/drill/store'
import { writeClipboard } from '@/lib/export/clipboard'
import { fmt, plural } from '@/lib/format'
import {
  composeNote,
  daysToDue,
  dueText,
  EXPORT_COLUMNS,
  exportRows,
  type ItemStatus,
  itemsDrill,
  type OpenAction,
  type OwnerBlock,
  type OwnerGroup,
  SEVERITY_WORD,
  settingsOf,
  statusText,
  usesOf,
} from '../engine'
import { M } from '../metrics'
import { type ListMode, useActionMarks } from './store'

/** Owners listed before "Show all"; items listed per owner before "Show more". */
const OWNERS_SHOWN = 8
const ITEMS_SHOWN = 10
/** Groups this small open every owner block. */
const EXPAND_UP_TO = 12

export type StatusFn = (a: OpenAction) => ItemStatus

/** A small clock: snooze. 16px, 1.5px stroke like the icon set. */
function IconSnooze({ className }: { className?: string }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx="8" cy="8.5" r="5.5" />
      <path d="M8 5.8v2.9l1.8 1.1" />
    </svg>
  )
}

/* ───────── item actions with Undo ───────── */

function useItemActions() {
  const { metrics } = useAnalytics()
  const handle = useActionMarks((s) => s.handle)
  const snooze = useActionMarks((s) => s.snooze)
  const reopen = useActionMarks((s) => s.reopen)
  const restore = useActionMarks((s) => s.restore)
  const { snoozeDays } = settingsOf(metrics)
  const undoable = (message: string, description: string, snap: Parameters<typeof restore>[0]) =>
    toast(message, {
      description,
      action: { label: 'Undo', onClick: () => restore(snap) },
    })
  const savedNote = () =>
    useActionMarks.getState().saved
      ? 'Kept in this browser.'
      : 'This browser did not save it, so it lasts for this visit.'
  return {
    snoozeDays,
    handle: (a: OpenAction) =>
      undoable(`Marked handled: ${a.item.subject.label}`, savedNote(), handle([a.id])),
    snooze: (a: OpenAction) =>
      undoable(
        `Snoozed for ${snoozeDays} d: ${a.item.subject.label}`,
        `It comes back on its own. ${savedNote()}`,
        snooze([a.id], snoozeDays),
      ),
    reopen: (a: OpenAction) => undoable(`Reopened: ${a.item.subject.label}`, savedNote(), reopen([a.id])),
  }
}

/* ───────── one item ───────── */

function SubjectLink({ a }: { a: OpenAction }) {
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
        className="cursor-pointer rounded-[2px] underline decoration-rule-strong decoration-dotted decoration-1 underline-offset-[3px] hover:decoration-ink hover:decoration-solid"
      >
        {label}
      </button>
    )
  }
  return <span>{label}</span>
}

function FromLink({ a }: { a: OpenAction }) {
  const view = a.item.view as ViewKey
  const tab = a.item.tab ?? ''
  return (
    <a
      href={routeHash(view, tab)}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        goTo(view, tab)
      }}
      className="rounded-[2px] text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink hover:decoration-ink"
    >
      {a.from}
    </a>
  )
}

function ItemRow({ a, mode, status }: { a: OpenAction; mode: ListMode; status: ItemStatus }) {
  const { asOf } = useAnalytics()
  const act = useItemActions()
  const days = daysToDue(a.item.due, asOf)
  const overdue = days != null && days < 0
  return (
    <li className="grid grid-cols-1 gap-x-3 gap-y-1.5 border-t border-rule py-2.5 pr-4 pl-4 sm:grid-cols-[76px_minmax(0,1fr)_auto] sm:pl-10">
      <div className="pt-px">
        <StatusPill severity={a.item.severity} quiet label={SEVERITY_WORD[a.item.severity]} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] leading-snug text-ink">{a.item.what}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-ink-2">
          <SubjectLink a={a} />{' '}
          <span className="whitespace-nowrap">
            <span aria-hidden="true" className="pr-1.5 pl-0.5 text-muted">
              ·
            </span>
            <FromLink a={a} />
          </span>
        </p>
        {a.item.note && <p className="mt-1 text-[12px] leading-snug text-muted">{a.item.note}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-col sm:items-end">
        <span
          className={cx(
            'text-[12px] whitespace-nowrap',
            overdue ? 'font-medium text-bad-text' : 'text-ink-2',
          )}
        >
          {mode === 'open' ? dueText(a.item.due, asOf) : statusText(status)}
        </span>
        <span className="flex gap-1 max-sm:ml-auto">
          {mode === 'open' ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={<IconCheck className="size-3.5" />}
                onClick={() => act.handle(a)}
                aria-label={`Mark handled: ${a.item.subject.label}`}
              >
                Handled
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<IconSnooze className="size-3.5" />}
                onClick={() => act.snooze(a)}
                aria-label={`Snooze ${act.snoozeDays} days: ${a.item.subject.label}`}
              >
                Snooze {act.snoozeDays} d
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              icon={<IconReset className="size-3.5" />}
              onClick={() => act.reopen(a)}
              aria-label={`Reopen: ${a.item.subject.label}`}
            >
              Reopen
            </Button>
          )}
        </span>
      </div>
    </li>
  )
}

/* ───────── one owner ───────── */

function CopyNoteButton({ block }: { block: OwnerBlock }) {
  const { asOf } = useAnalytics()
  const [fallback, setFallback] = useState<string | null>(null)
  const copy = async () => {
    const text = composeNote({ name: block.name, isTeam: block.isTeam }, block.items, asOf)
    if (!text) return
    try {
      await writeClipboard(text)
      toast(`Note for ${block.name} copied`, {
        tone: 'good',
        description: `${plural(block.items.length, 'item')}, ready to paste into email or chat.`,
      })
    } catch {
      setFallback(text)
    }
  }
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={<IconCopy className="size-3.5" />}
        onClick={() => void copy()}
        aria-label={`Copy note for ${block.name}`}
      >
        Copy note
      </Button>
      <Dialog
        open={fallback != null}
        onOpenChange={(o) => !o && setFallback(null)}
        title={`Note for ${block.name}`}
        description="The browser blocked copying. Select the text and copy it from here."
        footer={
          <Button variant="primary" onClick={() => setFallback(null)}>
            Done
          </Button>
        }
      >
        <textarea
          readOnly
          value={fallback ?? ''}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Note for ${block.name}`}
          className="h-[320px] w-full resize-none rounded-control bg-sheet-2 p-3 font-[inherit] text-[13px] leading-snug text-ink outline-none"
        />
      </Dialog>
    </>
  )
}

function OwnerRow({
  block,
  open,
  onToggle,
  mode,
  statusOf,
}: {
  block: OwnerBlock
  open: boolean
  onToggle: () => void
  mode: ListMode
  statusOf: StatusFn
}) {
  const ctx = useAnalytics()
  const [all, setAll] = useState(false)
  const shown = all ? block.items : block.items.slice(0, ITEMS_SHOWN)
  const more = block.items.length - shown.length
  const overdueItems = block.items.filter((a) => (daysToDue(a.item.due, ctx.asOf) ?? 0) < 0)
  const listId = `actions-owner-${block.key.replace(/[^a-zA-Z0-9-]/g, '-')}`
  return (
    <li className="border-t border-rule first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 sm:flex-nowrap">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={onToggle}
          className="flex min-w-0 flex-1 basis-48 items-center gap-2 rounded-control px-2 py-1 text-left hover:bg-hover"
        >
          <IconChevronRight
            className={cx(
              'size-3.5 shrink-0 text-muted transition-transform duration-100',
              open && 'rotate-90',
            )}
          />
          <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{block.name}</span>
        </button>
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-2">
          {block.critical > 0 && (
            <>
              <StatusPill severity="critical" quiet label={`${fmt(block.critical, 'int')} critical`} />
              <span aria-hidden="true" className="text-muted">
                ·
              </span>
            </>
          )}
          <Drill
            spec={() => itemsDrill(ctx, `Items waiting on ${block.name}`, block.items, { status: statusOf })}
            label={`Show the ${plural(block.items.length, 'item')} waiting on ${block.name}`}
            className="tnum"
          >
            {plural(block.items.length, 'item')}
          </Drill>
          {overdueItems.length > 0 && (
            <>
              <span aria-hidden="true" className="text-muted">
                ·
              </span>
              <Drill
                spec={() =>
                  itemsDrill(ctx, `Overdue items waiting on ${block.name}`, overdueItems, {
                    status: statusOf,
                  })
                }
                label={`Show the ${plural(overdueItems.length, 'overdue item')} waiting on ${block.name}`}
                className="tnum"
              >
                {fmt(overdueItems.length, 'int')} overdue
              </Drill>
            </>
          )}
        </span>
        {mode === 'open' && <CopyNoteButton block={block} />}
      </div>
      {open && (
        <ul id={listId} aria-label={`Items waiting on ${block.name}`}>
          {shown.map((a) => (
            <ItemRow key={a.id} a={a} mode={mode} status={statusOf(a)} />
          ))}
          {more > 0 && (
            <li className="border-t border-rule py-1.5 pl-4 sm:pl-10">
              <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
                Show {fmt(more, 'int')} more
              </Button>
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

/* ───────── one owner group ───────── */

export function OwnerSheet({
  group,
  mode,
  statusOf,
}: {
  group: OwnerGroup
  mode: ListMode
  statusOf: StatusFn
}) {
  const ctx = useAnalytics()
  const small = group.items.length <= EXPAND_UP_TO
  // The reader's own choices per owner; owners they have not touched follow the group's size.
  const [chosen, setChosen] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [allOwners, setAllOwners] = useState(false)
  const isOpen = (b: OwnerBlock) => chosen.get(b.key) ?? small
  const toggle = (b: OwnerBlock) => setChosen(new Map(chosen).set(b.key, !isOpen(b)))
  const everyOpen = group.owners.every(isOpen)
  const setEvery = (open: boolean) => setChosen(new Map(group.owners.map((b) => [b.key, open])))
  const owners = allOwners ? group.owners : group.owners.slice(0, OWNERS_SHOWN)
  const hiddenOwners = group.owners.length - owners.length
  const overdue = group.items.filter((a) => (daysToDue(a.item.due, ctx.asOf) ?? 0) < 0)
  const critical = group.items.filter((a) => a.item.severity === 'critical')
  const rows = exportRows(group.items, ctx.asOf, statusOf)
  const verb = mode === 'open' ? 'open' : 'handled or snoozed'
  return (
    <Figure
      id={`actions-${group.role}`}
      title={group.label}
      subtitle={`${plural(group.owners.length, 'owner')}, the most pressing first`}
      data={rows}
      columns={EXPORT_COLUMNS}
      image={false}
      tableToggle={false}
      metric={M.open}
      uses={usesOf(group.items)}
      actions={
        group.owners.length > 1 ? (
          <Button size="sm" variant="ghost" onClick={() => setEvery(!everyOpen)} aria-expanded={everyOpen}>
            {everyOpen ? 'Collapse all' : 'Expand all'}
          </Button>
        ) : undefined
      }
    >
      <div className="-mx-4 -mt-1 -mb-4">
        <p className="px-4 pb-2 text-[12px] text-ink-2">
          <Drill
            spec={() => itemsDrill(ctx, `${group.label}: ${verb} items`, group.items, { status: statusOf })}
            label={`Show the ${plural(group.items.length, 'item')} for ${group.label}`}
            className="tnum font-semibold text-ink"
          >
            {plural(group.items.length, `${verb} item`)}
          </Drill>
          {overdue.length > 0 && (
            <>
              <span aria-hidden="true" className="px-1.5 text-muted">
                ·
              </span>
              <Drill
                spec={() => itemsDrill(ctx, `${group.label}: overdue items`, overdue, { status: statusOf })}
                label={`Show the ${plural(overdue.length, 'overdue item')} for ${group.label}`}
                className="tnum"
              >
                {fmt(overdue.length, 'int')} overdue
              </Drill>
            </>
          )}
          {critical.length > 0 && (
            <>
              <span aria-hidden="true" className="px-1.5 text-muted">
                ·
              </span>
              <Drill
                spec={() => itemsDrill(ctx, `${group.label}: critical items`, critical, { status: statusOf })}
                label={`Show the ${plural(critical.length, 'critical item')} for ${group.label}`}
                className="tnum"
              >
                {fmt(critical.length, 'int')} critical
              </Drill>
            </>
          )}
        </p>
        <ul aria-label={`Owners in ${group.label}`} className="border-t border-rule">
          {owners.map((b) => (
            <OwnerRow
              key={b.key}
              block={b}
              open={isOpen(b)}
              onToggle={() => toggle(b)}
              mode={mode}
              statusOf={statusOf}
            />
          ))}
        </ul>
        {hiddenOwners > 0 && (
          <div className="border-t border-rule px-2 py-1.5">
            <Button size="sm" variant="ghost" onClick={() => setAllOwners(true)}>
              Show all {fmt(group.owners.length, 'int')} owners
            </Button>
          </div>
        )}
      </div>
    </Figure>
  )
}

/** Open the items behind a count from an event handler (charts' onSelect). */
export function drillItems(
  ctx: Parameters<typeof itemsDrill>[0],
  title: string,
  items: readonly OpenAction[],
  status?: StatusFn,
): void {
  if (!items.length) return
  const spec = resolveDrill(() => itemsDrill(ctx, title, items, { status }))
  if (spec) openDrill(spec)
}
