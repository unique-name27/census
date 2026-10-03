/**
 * Leader filter: search people managers by name or title, largest org first. Selecting a leader
 * scopes every view to them and everyone below them.
 */
import { Combobox } from '@base-ui/react/combobox'
import { useMemo } from 'react'
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
}: {
  options: LeaderOption[]
  value: string | null
  onChange: (leaderId: string | null) => void
  /** Name of the selected leader, also when they fall outside the option list. */
  currentName?: string
}) {
  const items = useMemo(
    () => Combobox.createItems(options, { getValue: (o) => o.id, getLabel: (o) => o.name }),
    [options],
  )
  return (
    <Combobox.Root items={items} value={value} onValueChange={(v) => onChange(v ?? null)} filter={matches}>
      <Combobox.Trigger
        render={
          <Button caret aria-label={value ? `Leader: ${currentName ?? value}` : 'Leader'}>
            {value ? (
              <span className="flex max-w-[200px] min-w-0 items-baseline gap-1">
                <span className="font-normal text-muted">Leader</span>
                <span className="truncate text-ink">{currentName ?? value}</span>
              </span>
            ) : (
              'Leader'
            )}
          </Button>
        }
      />
      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={6} className="z-50 outline-none">
          <Combobox.Popup
            aria-label="Leader"
            className={cx(POPUP_SURFACE, 'w-[360px] max-w-[calc(100vw-32px)]')}
          >
            <div className="relative">
              <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
              <Combobox.Input placeholder="Search by name or title" className={SEARCH_INPUT} />
            </div>
            <Combobox.Empty className="text-[13px] text-muted empty:hidden">
              <div className="px-3 py-3">
                {options.length ? 'No matches.' : 'No people managers with 3 or more people in this data.'}
              </div>
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
                  <span className="tnum mt-0.5 shrink-0 text-[12px] text-muted">
                    {plural(o.size, 'person', 'people')}
                  </span>
                </Combobox.Item>
              )}
            </Combobox.List>
            <div className="flex items-center justify-between border-t border-rule py-1.5 pr-1.5 pl-3">
              <span className="text-[12px] text-muted">{plural(options.length, 'leader')}</span>
              <Button size="sm" variant="ghost" disabled={!value} onClick={() => onChange(null)}>
                Whole company
              </Button>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
