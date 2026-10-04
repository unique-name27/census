/**
 * Leader filter: search people managers by name or title, largest org first. Selecting a leader
 * scopes every view to them and everyone below them.
 */
import { Combobox } from '@base-ui/react/combobox'
import { useMemo, useState } from 'react'
import { IconCheck, IconSearch } from '@/components/icons'
import { PICKER_ITEM, POPUP_SURFACE, SEARCH_INPUT } from '@/components/styles'
import { Button, cx } from '@/components/ui'
import { plural } from '@/lib/format'
import type { LeaderOption } from './filterOptions'

const matches = (o: LeaderOption, query: string) => {
  const q = query.trim().toLowerCase()
  return !q || o.name.toLowerCase().includes(q) || o.title.toLowerCase().includes(q)
}

export function LeaderPicker({
  options,
  value,
  onChange,
  currentName,
  label = 'Leader',
  emptyText = 'No people managers with 3 or more employees in this data.',
  clearLabel = 'Whole company',
  noun = 'leader',
}: {
  options: LeaderOption[]
  value: string | null
  onChange: (leaderId: string | null) => void
  /** Name of the selected leader, also when they fall outside the option list. */
  currentName?: string
  /** Trigger and list name (the Action center's "My team" picker reuses the filter's leader list). */
  label?: string
  /** Shown when there are no options. */
  emptyText?: string
  /** The button that clears the choice. */
  clearLabel?: string
  /** What the options are, for the count under the list: "12 leaders". */
  noun?: string
}) {
  const items = useMemo(
    () => Combobox.createItems(options, { getValue: (o) => o.id, getLabel: (o) => o.name }),
    [options],
  )
  // Controlled so the clear button can close the list as well (picking a leader closes it already).
  const [open, setOpen] = useState(false)
  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(v) => onChange(v ?? null)}
      filter={matches}
      open={open}
      onOpenChange={(o) => setOpen(o)}
    >
      <Combobox.Trigger
        render={
          <Button
            caret
            data-tour="filter-leader"
            aria-label={value ? `${label}: ${currentName ?? value}` : label}
          >
            {value ? (
              <span className="flex max-w-[200px] min-w-0 items-baseline gap-1">
                <span className="font-normal text-muted">{label}</span>
                <span className="truncate text-ink">{currentName ?? value}</span>
              </span>
            ) : (
              label
            )}
          </Button>
        }
      />
      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={6} className="z-50 outline-none">
          <Combobox.Popup
            aria-label={label}
            className={cx(POPUP_SURFACE, 'w-[360px] max-w-[calc(100vw-32px)]')}
          >
            <div className="relative">
              <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
              <Combobox.Input placeholder="Search by name or title" className={SEARCH_INPUT} />
            </div>
            <Combobox.Empty className="text-[13px] text-muted empty:hidden">
              <div className="px-3 py-3">{options.length ? 'No matches.' : emptyText}</div>
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(360px,calc(var(--available-height)-90px))] overflow-y-auto overscroll-contain py-1 empty:p-0">
              {(o: LeaderOption) => (
                <Combobox.Item key={o.id} value={o.id} className={cx('group', PICKER_ITEM, 'items-start')}>
                  <span className="mt-0.5 flex w-4 shrink-0 justify-center">
                    <IconCheck
                      className="size-4 opacity-0 group-data-[selected]:opacity-100"
                      strokeWidth={2.25}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate group-data-[selected]:font-semibold">{o.name}</span>
                    {o.title && <span className="block truncate text-[12px] text-muted">{o.title}</span>}
                  </span>
                  {/* Headcount basis (employees only), like every other count in the filters; the Org
                      chart's own counts include contractors and interns and say "people". */}
                  <span className="tnum mt-0.5 shrink-0 text-[12px] text-muted">
                    {plural(o.size, 'employee')}
                  </span>
                </Combobox.Item>
              )}
            </Combobox.List>
            <div className="flex items-center justify-between border-t border-rule py-1.5 pr-1.5 pl-3">
              <span className="text-[12px] text-muted">{plural(options.length, noun)}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!value}
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                {clearLabel}
              </Button>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
