/**
 * The pick dialog (docs/ROLES-V2.md 1.3; docs/ROLES.md 1.3): "Choose a manager", "Choose a
 * business unit", "Choose a region" or "Choose a recruiter", one component with a config per kind.
 * Title, dek, a search field, an inline list (largest first), a foot line, a primary button that
 * is disabled until a row is picked, and Cancel, which keeps the mode Census was in. Mounted once
 * by the shell; opened by choosing a mode that has no pick yet, by "Change…", or by a remembered
 * pick that is gone from the data (with the note at the top).
 */
import { type KeyboardEvent, useId, useMemo, useRef, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { IconCheck, IconSearch } from '@/components/icons'
import { PICKER_ITEM, SEARCH_INPUT } from '@/components/styles'
import { Button, cx } from '@/components/ui'
import { noRegionPeople, PICKER_COPY } from '../copy'
import type { PickKind } from '../modes'
import { picksOfState, useMode } from '../store'
import { confirmLabel, currentRowKey, LIST_LABEL, type PickRow, rowMatches, SEARCH_LABEL } from './pickModel'
import { usePickRows } from './usePickRows'

function PickerBody({ kind, onDone }: { kind: PickKind; onDone: () => void }) {
  const { rows, noRegionPeople: unplaced } = usePickRows(kind)
  const stored = useMode((s) => s.picks)
  const managerId = useMode((s) => s.managerId)
  const note = useMode((s) => s.pickNote)
  const choose = useMode((s) => s.choose)
  const copy = PICKER_COPY[kind]
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(() =>
    currentRowKey(kind, picksOfState({ picks: stored, managerId }), rows),
  )
  const [active, setActive] = useState(0)
  const list = useMemo(() => rows.filter((r) => rowMatches(r, query)), [rows, query])
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const at = Math.min(active, Math.max(0, list.length - 1))
  const pickedRow = rows.find((r) => r.key === picked && r.pickable)

  const enter = (row: PickRow | undefined) => {
    if (!row?.pickable) return
    choose(row.pick)
    onDone()
  }
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
      // Enter in the search picks the highlighted row and shows Census for it, like a double click.
      e.preventDefault()
      enter(list[at])
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {note && <p className="rounded-control bg-sheet-2 px-3 py-2 text-small text-ink">{note}</p>}
      <div className="rounded-control shadow-[inset_0_0_0_1px_var(--rule-strong)]">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <input
            // biome-ignore lint/a11y/noAutofocus: the dialog opens to pick one row; the search is where that starts
            autoFocus
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={list[at] ? `${listId}-${at}` : undefined}
            aria-label={SEARCH_LABEL[kind]}
            placeholder={SEARCH_LABEL[kind]}
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
          aria-label={LIST_LABEL[kind]}
          className="max-h-[min(360px,45dvh)] overflow-y-auto overscroll-contain py-1"
        >
          {list.length === 0 && (
            <div className="px-3 py-3 text-small text-muted">
              {rows.length ? 'No matches.' : copy.disabled}
            </div>
          )}
          {list.map((r, i) => {
            const selected = r.key === picked
            return (
              <div
                key={r.key}
                id={`${listId}-${i}`}
                role="option"
                tabIndex={-1}
                aria-selected={selected}
                aria-disabled={r.pickable ? undefined : true}
                data-index={i}
                data-highlighted={i === at ? '' : undefined}
                onMouseMove={() => i !== at && setActive(i)}
                onClick={() => r.pickable && setPicked(r.key)}
                onDoubleClick={() => enter(r)}
                className={cx(
                  PICKER_ITEM,
                  'items-start',
                  r.pickable ? 'cursor-pointer' : 'cursor-default text-muted',
                )}
              >
                <span className="mt-0.5 flex w-4 shrink-0 justify-center">
                  <IconCheck className={cx('size-4', !selected && 'opacity-0')} strokeWidth={2.25} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('block truncate', selected && 'font-semibold')}>{r.name}</span>
                  {r.line && <span className="block text-meta leading-snug text-muted">{r.line}</span>}
                </span>
                {r.aside && <span className="tnum mt-0.5 shrink-0 text-meta text-muted">{r.aside}</span>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-meta text-muted">{copy.foot}</p>
        {kind === 'region' && unplaced > 0 && (
          <p className="text-meta text-muted">{noRegionPeople(unplaced)}</p>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-rule pt-3">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!pickedRow} onClick={() => enter(pickedRow)}>
          {confirmLabel(kind, pickedRow?.key ?? null)}
        </Button>
      </div>
    </div>
  )
}

export function ScopePicker() {
  const picking = useMode((s) => s.picking)
  const cancel = useMode((s) => s.cancelPick)
  // The dialog keeps the last kind's words while it closes, so its title does not change mid-fade.
  const [shown, setShown] = useState<PickKind>(picking ?? 'manager')
  if (picking && picking !== shown) setShown(picking)
  const copy = PICKER_COPY[picking ?? shown]
  return (
    <Dialog
      title={copy.title}
      description={copy.dek}
      open={!!picking}
      onOpenChange={(o) => {
        if (!o) cancel()
      }}
      width={520}
    >
      {picking && <PickerBody key={picking} kind={picking} onDone={cancel} />}
    </Dialog>
  )
}
