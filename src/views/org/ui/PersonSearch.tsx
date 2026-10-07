/**
 * Search field with a ranked result list (the old tool's command palette, inline): type a name,
 * title, department, location, level or ID; arrow keys move, Enter picks. "/" focuses the chart's
 * search from anywhere on the page.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { IconSearch } from '@/components'
import { cx } from '@/components/ui'
import type { Employee } from '@/data/schema'
import { plural } from '@/lib/format'
import { searchPeople } from '../engine'

export interface PersonSearchProps {
  people: ReadonlyMap<string, Employee>
  orgSize: (id: string) => number
  onPick: (id: string) => void
  placeholder?: string
  /** Listen for "/" to focus this field. */
  slashKey?: boolean
  /** Results stay in the page flow (dialogs) instead of floating. */
  inline?: boolean
  /** Extra text after each result (e.g. "Blocked"). */
  hint?: (id: string) => string | null
  autoFocus?: boolean
  className?: string
  label?: string
}

export function PersonSearch({
  people,
  orgSize,
  onPick,
  placeholder = 'Find a person',
  slashKey,
  inline,
  hint,
  autoFocus,
  className,
  label = 'Find a person',
}: PersonSearchProps) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!slashKey) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return
      const t = ev.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]') || t.isContentEditable)) return
      ev.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slashKey])

  const hits = q.trim() ? searchPeople(people.values(), q, { limit: 8, orgSize }) : []
  const show = (open || inline) && q.trim().length > 0

  const pick = (id: string) => {
    onPick(id)
    setQ('')
    setOpen(false)
    setActive(0)
    if (!inline) inputRef.current?.blur()
  }

  const onKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, hits.length - 1))
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (ev.key === 'Enter') {
      const h = hits[active]
      if (h) {
        ev.preventDefault()
        pick(h.id)
      }
    } else if (ev.key === 'Escape') {
      if (q) {
        ev.preventDefault()
        ev.stopPropagation()
        setQ('')
      } else inputRef.current?.blur()
      setOpen(false)
    }
  }

  return (
    <div className={cx('relative', className)}>
      <div className="relative">
        <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label={label}
          aria-expanded={show}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={show && hits[active] ? `${listId}-${active}` : undefined}
          // biome-ignore lint/a11y/noAutofocus: the move dialog opens straight into its search field
          autoFocus={autoFocus}
          value={q}
          placeholder={placeholder}
          onChange={(ev) => {
            setQ(ev.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="h-8 w-full rounded-control bg-sheet pr-8 pl-8 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1px_var(--ink-2)] [&::-webkit-search-cancel-button]:hidden"
        />
        {slashKey && !q && (
          <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-chip px-1.5 font-mono text-label text-muted shadow-[inset_0_0_0_1px_var(--rule-strong)]">
            /
          </kbd>
        )}
      </div>
      {show && (
        <div
          className={cx(
            'z-30 overflow-hidden rounded-control bg-sheet',
            inline
              ? 'mt-2 shadow-[0_0_0_1px_var(--rule)]'
              : 'absolute top-full left-0 mt-1 w-[min(400px,calc(100vw-32px))] shadow-(--shadow-pop)',
          )}
        >
          <div
            id={listId}
            role="listbox"
            aria-label="Matching people"
            className="max-h-80 overflow-y-auto py-1"
          >
            {hits.map((h, i) => {
              const e = people.get(h.id)!
              const note = hint?.(h.id)
              return (
                <div
                  key={h.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  tabIndex={-1}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(h.id)}
                  className={cx(
                    'mx-1 flex cursor-pointer items-center gap-2.5 rounded-chip px-2 py-1.5',
                    i === active && 'bg-hover',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small text-ink">{e.name}</span>
                    <span className="block truncate text-meta text-muted">
                      {e.jobTitle} · {e.department} · {e.location}
                    </span>
                  </span>
                  {note ? (
                    <span className="shrink-0 text-meta text-muted">{note}</span>
                  ) : orgSize(h.id) > 0 ? (
                    <span className="tnum shrink-0 text-meta text-muted">
                      {plural(orgSize(h.id), 'person', 'people')}
                    </span>
                  ) : (
                    <span className="shrink-0 font-mono text-label text-muted">{e.level ?? ''}</span>
                  )}
                </div>
              )
            })}
            {hits.length === 0 && (
              <div className="px-3 py-3 text-small text-muted">No one matches “{q.trim()}”.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
