/**
 * "Choose a manager" (docs/ROLES.md, 1.3): a dialog with a search over the leader filter's own list
 * (people who lead 3 or more employees, largest org first), rendered inline. "Show their org" is
 * disabled until a row is picked; Cancel keeps the mode Census was in. Mounted once by the shell;
 * opened by `setMode('manager')` without a manager, "Change manager…", or a manager who is no
 * longer in the data (with the note at the top).
 */
import { type KeyboardEvent, useId, useMemo, useRef, useState } from 'react'
import type { LeaderOption } from '@/app/filterOptions'
import { Dialog } from '@/components/Dialog'
import { IconCheck, IconSearch } from '@/components/icons'
import { PICKER_ITEM, SEARCH_INPUT } from '@/components/styles'
import { Button, cx } from '@/components/ui'
import { plural } from '@/lib/format'
import { PICKER_CONFIRM, PICKER_DEK, PICKER_FOOT, PICKER_TITLE } from '../copy'
import { useMode } from '../store'
import { useManagers } from './useManagers'

const matches = (o: LeaderOption, q: string) => {
  const s = q.trim().toLowerCase()
  return !s || o.name.toLowerCase().includes(s) || o.title.toLowerCase().includes(s)
}

function PickerBody({ onDone }: { onDone: () => void }) {
  const managers = useManagers()
  const current = useMode((s) => s.managerId)
  const note = useMode((s) => s.pickNote)
  const chooseManager = useMode((s) => s.chooseManager)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(() =>
    current && managers.some((m) => m.id === current) ? current : null,
  )
  const [active, setActive] = useState(0)
  const list = useMemo(() => managers.filter((m) => matches(m, query)), [managers, query])
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const at = Math.min(active, Math.max(0, list.length - 1))

  const move = (i: number) => {
    setActive(i)
    listRef.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.scrollIntoView({ block: 'nearest' })
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && list.length) {
      e.preventDefault()
      move(Math.min(list.length - 1, at + 1))
    } else if (e.key === 'ArrowUp' && list.length) {
      e.preventDefault()
      move(Math.max(0, at - 1))
    } else if (e.key === 'Enter' && list[at]) {
      // Enter in the search picks the highlighted manager and shows their org, like a double click.
      e.preventDefault()
      chooseManager(list[at].id)
      onDone()
    }
  }
  const confirm = () => {
    if (!picked) return
    chooseManager(picked)
    onDone()
  }
  return (
    <div className="flex flex-col gap-3">
      {note && <p className="rounded-control bg-sheet-2 px-3 py-2 text-small text-ink">{note}</p>}
      <div className="rounded-control shadow-[inset_0_0_0_1px_var(--rule-strong)]">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <input
            // biome-ignore lint/a11y/noAutofocus: the dialog opens to pick a name; the search is where that starts
            autoFocus
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={list[at] ? `${listId}-${list[at].id}` : undefined}
            aria-label="Search by name or title"
            placeholder="Search by name or title"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKey}
            className={SEARCH_INPUT}
          />
        </div>
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Managers"
          className="max-h-[min(360px,45dvh)] overflow-y-auto overscroll-contain py-1"
        >
          {list.length === 0 && (
            <div className="px-3 py-3 text-small text-muted">
              {managers.length ? 'No matches.' : 'No people managers with 3 or more employees in this data.'}
            </div>
          )}
          {list.map((o, i) => {
            const selected = o.id === picked
            return (
              <div
                key={o.id}
                id={`${listId}-${o.id}`}
                role="option"
                tabIndex={-1}
                aria-selected={selected}
                data-index={i}
                data-highlighted={i === at ? '' : undefined}
                onMouseMove={() => i !== at && setActive(i)}
                onClick={() => setPicked(o.id)}
                onDoubleClick={() => {
                  chooseManager(o.id)
                  onDone()
                }}
                className={cx(PICKER_ITEM, 'cursor-pointer items-start')}
              >
                <span className="mt-0.5 flex w-4 shrink-0 justify-center">
                  <IconCheck className={cx('size-4', !selected && 'opacity-0')} strokeWidth={2.25} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('block truncate', selected && 'font-semibold')}>{o.name}</span>
                  {o.title && <span className="block truncate text-meta text-muted">{o.title}</span>}
                </span>
                <span className="tnum mt-0.5 shrink-0 text-meta text-muted">
                  {plural(o.size, 'employee')}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-meta text-muted">{PICKER_FOOT}</p>
      <div className="flex flex-wrap justify-end gap-2 border-t border-rule pt-3">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!picked} onClick={confirm}>
          {PICKER_CONFIRM}
        </Button>
      </div>
    </div>
  )
}

export function ManagerPicker() {
  const picking = useMode((s) => s.picking)
  const cancel = useMode((s) => s.cancelPick)
  return (
    <Dialog
      title={PICKER_TITLE}
      description={PICKER_DEK}
      open={picking}
      onOpenChange={(o) => {
        if (!o) cancel()
      }}
      width={520}
    >
      {picking && <PickerBody onDone={cancel} />}
    </Dialog>
  )
}
