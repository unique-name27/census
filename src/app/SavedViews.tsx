/**
 * Saved views (docs/FILTERS.md, part 2): the Views menu at the start of the filter row, the save
 * dialog and Manage views. The filter row shows the active view's name while the scope matches
 * it, and "edited" once something changes; Update saves the change, Save as new keeps both.
 */
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { IconArrowDown, IconArrowUp, IconCheck, IconCopy, IconPencil } from '@/components/icons'
import { currentScope } from '@/components/navigation'
import { toast } from '@/components/toast'
import { Button, IconButton, Menu, type MenuItem, Tag } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { STANDARD_LABEL } from '@/data/quality/tier'
import {
  listedViews,
  matchView,
  nameProblem,
  type SavedView,
  VIEWS_FULL,
  viewScope,
  viewsFull,
} from '@/data/savedViews'
import { PERIOD_LABELS, scopeLabel } from '@/data/scope'
import { type RouteView, useCensus } from '@/data/store'
import { useSavedViews } from '@/data/viewsStore'
import { useQualityLens } from '@/views/data/quality-overview/lens'
import { viewByKey } from '@/views/registry'
import { applySavedView, copyViewLink } from './viewActions'

const INPUT =
  'h-8 w-full min-w-0 rounded-control bg-sheet px-2 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]'

/** "Silicon Engineering · Last 6 months · Production". */
function scopeSummary(
  view: Pick<SavedView, 'filters' | 'standard' | 'lens'>,
  ctx: ReturnType<typeof useAnalytics>,
) {
  const parts = [scopeLabel(view.filters, ctx.org)]
  parts.push(
    view.filters.period === 'custom' && view.filters.customStart && view.filters.customEnd
      ? `${view.filters.customStart} to ${view.filters.customEnd}`
      : PERIOD_LABELS[view.filters.period],
  )
  parts.push(`${STANDARD_LABEL[view.standard]} data standard`)
  if (view.lens) parts.push('data quality shown')
  return parts.join(' · ')
}

/** "People stats, Attrition", the page a view opens on. */
function pageName(page: { view: string; tab: string } | null): string | null {
  if (!page) return null
  if (page.view === 'data') return 'Data room'
  if (page.view === 'actions') return 'Action center'
  const v = viewByKey.get(page.view as never)
  if (!v) return null
  const tab = v.tabs.find((t) => t.key === page.tab)?.label
  return tab && v.tabs.length > 1 ? `${v.label}, ${tab}` : v.label
}

/** The live scope and the saved view it matches (or was applied last and is now edited). */
function useActiveView() {
  const ctx = useAnalytics()
  const filters = useCensus((s) => s.filters)
  const standard = useCensus((s) => s.dataStandard)
  const lens = useQualityLens((s) => s.on)
  const views = useSavedViews((s) => s.views)
  const startupId = useSavedViews((s) => s.startupId)
  const appliedId = useSavedViews((s) => s.appliedId)
  const listed = listedViews({ views, startupId }, ctx.isSample)
  const scope = { filters, standard, lens }
  const active = matchView(listed, scope, appliedId)
  return { ctx, listed, active, scope, views, startupId }
}

export function ViewsMenu() {
  const { ctx, listed, active } = useActiveView()
  const [saving, setSaving] = useState<null | 'new'>(null)
  const [managing, setManaging] = useState(false)
  const update = useSavedViews((s) => s.update)

  const items: MenuItem[] = []
  if (listed.length) {
    items.push({ heading: 'Saved views' })
    for (const v of listed)
      items.push({
        label: v.name,
        icon: active.view?.id === v.id && !active.edited ? <IconCheck strokeWidth={2.25} /> : undefined,
        hint: pageName(v.page) ?? undefined,
        onSelect: () => applySavedView(v, ctx),
      })
    items.push({ separator: true })
  }
  if (active.view && active.edited) {
    const v = active.view
    items.push({
      label: `Update "${v.name}"`,
      onSelect: () => {
        update(v.id, currentScope())
        toast(`Updated "${v.name}"`, { tone: 'good' })
      },
    })
    items.push({ label: 'Save as new…', onSelect: () => setSaving('new') })
  } else items.push({ label: 'Save current view…', onSelect: () => setSaving('new') })
  items.push({ label: 'Manage views…', onSelect: () => setManaging(true), disabled: !listed.length })

  return (
    <>
      <Menu
        align="start"
        width={300}
        trigger={
          <Button
            caret
            data-tour="filter-views"
            aria-label={
              active.view
                ? `Saved view: ${active.view.name}${active.edited ? ', edited' : ''}`
                : 'Saved views'
            }
          >
            {active.view ? (
              <span className="flex max-w-[220px] min-w-0 items-baseline gap-1">
                <span className="truncate text-ink">{active.view.name}</span>
                {active.edited && <span className="shrink-0 font-normal text-muted">edited</span>}
              </span>
            ) : (
              'Views'
            )}
          </Button>
        }
        items={items}
      />
      {saving && <SaveViewDialog onClose={() => setSaving(null)} />}
      {managing && <ManageViewsDialog onClose={() => setManaging(false)} />}
    </>
  )
}

function SaveViewDialog({ onClose }: { onClose: () => void }) {
  const ctx = useAnalytics()
  const route = useCensus((s) => s.route)
  const views = useSavedViews((s) => s.views)
  const startupId = useSavedViews((s) => s.startupId)
  // A name is checked against the views you can see; the list's limit counts every view.
  const listed = listedViews({ views, startupId }, ctx.isSample)
  const full = viewsFull({ views })
  const add = useSavedViews((s) => s.add)
  const [name, setName] = useState('')
  const [onPage, setOnPage] = useState(false)
  const [tried, setTried] = useState(false)
  // The dialog opens to type a name (after the dialog has placed its own focus).
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [])
  const scope = currentScope()
  const problem = full ? VIEWS_FULL : nameProblem({ views: listed }, name)
  const here = pageName(route)
  const save = () => {
    setTried(true)
    if (problem) return
    const v = add({ name, scope, page: onPage ? { view: route.view, tab: route.tab } : null })
    if (!v) return
    toast(`Saved "${v.name}"`, {
      tone: 'good',
      description: 'Pick it from Views at the start of the filter row.',
    })
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Save current view"
      description={scopeSummary(scope, ctx)}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={full}>
            Save view
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label className="text-[12px] text-ink-2">
          Name
          <input
            ref={nameRef}
            value={name}
            maxLength={60}
            placeholder="My org, last quarter"
            onChange={(e) => setName(e.target.value)}
            className={`${INPUT} mt-1`}
            aria-invalid={(tried || full) && !!problem}
            aria-describedby="save-view-problem"
          />
        </label>
        <p id="save-view-problem" role="status" className="-mt-1.5 min-h-4 text-[12px] text-bad-text">
          {tried || full ? problem : ''}
        </p>
        <label className="flex items-start gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={onPage}
            onChange={(e) => setOnPage(e.target.checked)}
            className="mt-1 size-3.5 accent-(--ink)"
          />
          <span>
            Open on this page
            {here && <span className="block text-[12px] text-muted">{here}</span>}
          </span>
        </label>
      </form>
    </Dialog>
  )
}

function ManageViewsDialog({ onClose }: { onClose: () => void }) {
  const ctx = useAnalytics()
  const views = useSavedViews((s) => s.views)
  const startupId = useSavedViews((s) => s.startupId)
  const listed = listedViews({ views, startupId }, ctx.isSample)
  const [editing, setEditing] = useState<string | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const done = useRef<HTMLButtonElement>(null)
  // A deleted row takes its More button with it: focus moves to the row that took its place (or
  // the one before it), and to Done once no view is left. The More menu also returns focus to its
  // own trigger as it closes, which is gone, so this runs again once the menu has closed.
  const deleted = (index: number) => {
    const move = () => {
      const more = [...(list.current?.querySelectorAll<HTMLElement>('[data-view-more]') ?? [])]
      ;(more[Math.min(index, more.length - 1)] ?? done.current)?.focus()
    }
    setTimeout(move, 0)
    setTimeout(() => {
      const a = document.activeElement
      if (!(a instanceof HTMLElement) || !(list.current?.contains(a) || a === done.current)) move()
    }, 300)
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Manage views"
      description="Rename, reorder or delete your saved views, copy a link to one, or choose the view Census opens with."
      width={620}
      footer={
        <Button ref={done} variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {listed.length ? (
        <ul ref={list} className="flex flex-col">
          {listed.map((v, i) => (
            <ViewRow
              key={v.id}
              view={v}
              first={i === 0}
              last={i === listed.length - 1}
              startup={startupId === v.id}
              editing={editing === v.id}
              onEdit={(on) => setEditing(on ? v.id : null)}
              onDeleted={() => deleted(i)}
            />
          ))}
        </ul>
      ) : (
        <p className="py-4 text-[13px] text-muted">
          No saved views. Use Save current view in the Views menu.
        </p>
      )}
    </Dialog>
  )
}

function ViewRow({
  view,
  first,
  last,
  startup,
  editing,
  onEdit,
  onDeleted,
}: {
  view: SavedView
  first: boolean
  last: boolean
  startup: boolean
  editing: boolean
  onEdit: (on: boolean) => void
  /** After the row's view was deleted (the row is about to go). */
  onDeleted: () => void
}) {
  const ctx = useAnalytics()
  const { rename, move, remove, restore, setStartup } = useSavedViews.getState()
  const views = useSavedViews((s) => s.views)
  const state = { views: listedViews({ views, startupId: null }, ctx.isSample) }
  const [draft, setDraft] = useState(view.name)
  // Renaming starts in the field.
  const draftRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) draftRef.current?.focus()
  }, [editing])
  const problem = nameProblem(state, draft, view.id)
  const page = pageName(view.page)
  const commit = () => {
    if (problem) return
    rename(view.id, draft)
    onEdit(false)
  }
  const del = () => {
    const removed = remove(view.id)
    if (!removed) return
    onDeleted()
    toast(`Deleted "${view.name}"`, {
      action: { label: 'Undo', onClick: () => restore(removed) },
    })
  }
  const items: MenuItem[] = [
    {
      label: 'Copy link',
      icon: <IconCopy />,
      onSelect: () =>
        void copyViewLink({
          scope: viewScope(view),
          route: view.page ? { view: view.page.view as RouteView, tab: view.page.tab } : undefined,
          what: `"${view.name}"`,
        }),
    },
    {
      label: 'Open Census with this view',
      icon: startup ? <IconCheck strokeWidth={2.25} /> : undefined,
      onSelect: () => setStartup(startup ? null : view.id),
    },
    { label: 'Rename', icon: <IconPencil />, onSelect: () => onEdit(true) },
    { separator: true },
    { label: 'Delete', onSelect: del },
  ]
  return (
    <li className="flex items-start gap-2 border-t border-rule py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              commit()
            }}
          >
            <input
              ref={draftRef}
              aria-label={`New name for ${view.name}`}
              value={draft}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setDraft(view.name)
                  onEdit(false)
                }
              }}
              className={`${INPUT} max-w-[320px] flex-1`}
            />
            <Button size="sm" variant="primary" type="submit" disabled={!!problem}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(view.name)
                onEdit(false)
              }}
            >
              Cancel
            </Button>
            {problem && <span className="w-full text-[12px] text-bad-text">{problem}</span>}
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[14px] font-medium text-ink">{view.name}</span>
            {startup && <Tag>Opens Census</Tag>}
            {view.example && <Tag tone="outline">Example</Tag>}
          </div>
        )}
        <p className="mt-0.5 text-[12px] text-muted">
          {scopeSummary(view, ctx)}
          {page ? ` · opens ${page}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton
          label={`Move ${view.name} up`}
          size="sm"
          variant="ghost"
          disabled={first}
          onClick={() => move(view.id, -1)}
        >
          <IconArrowUp className="size-3.5" />
        </IconButton>
        <IconButton
          label={`Move ${view.name} down`}
          size="sm"
          variant="ghost"
          disabled={last}
          onClick={() => move(view.id, 1)}
        >
          <IconArrowDown className="size-3.5" />
        </IconButton>
        <Menu
          width={250}
          trigger={
            <Button size="sm" variant="ghost" caret data-view-more="" aria-label={`More for ${view.name}`}>
              More
            </Button>
          }
          items={items}
        />
      </div>
    </li>
  )
}
