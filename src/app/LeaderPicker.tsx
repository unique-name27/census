/**
 * Leader filter: search people managers by name or title, largest org first. Selecting a leader
 * scopes every view to them and everyone below them.
 */
import { Combobox } from '@base-ui/react/combobox'
import { type ReactNode, useMemo, useState } from 'react'
import { IconCheck, IconPin, IconSearch } from '@/components/icons'
import { PICKER_ITEM, POPUP_SURFACE, SEARCH_INPUT } from '@/components/styles'
import { Button, cx } from '@/components/ui'
import type { FilterMode } from '@/data/scope'
import { fmt, plural } from '@/lib/format'
import type { LeaderOption } from './filterOptions'
import { leaderModeHint, ModeSwitch } from './ModeSwitch'

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
  mode = 'include',
  onModeChange,
  onOpenChange,
  note,
  pinned,
  youId,
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
  /** Include or exclude the leader's org; with `onModeChange`, the switch shows at the top of the list. */
  mode?: FilterMode
  onModeChange?: (mode: FilterMode) => void
  /** Called when the list opens or closes. */
  onOpenChange?: (open: boolean) => void
  /** A muted line under the list, e.g. why some leaders can't be picked (`LeaderOption.disabled`). */
  note?: ReactNode
  /**
   * Manager mode keeps the filter on one org (docs/ROLES.md, 3.10): the trigger shows a pin and
   * names the org, and this text says why on hover.
   */
  pinned?: string
  /** The option tagged "You" (Manager mode's manager). */
  youId?: string
}) {
  const items = useMemo(
    () => Combobox.createItems(options, { getValue: (o) => o.id, getLabel: (o) => o.name }),
    [options],
  )
  // Controlled so the clear button can close the list as well (picking a leader closes it already).
  const [open, setOpen] = useState(false)
  const excluded = mode === 'exclude'
  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(v) => onChange(v ?? null)}
      filter={matches}
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        onOpenChange?.(o)
      }}
    >
      <Combobox.Trigger
        render={
          <Button
            caret
            data-tour="filter-leader"
            icon={pinned ? <IconPin className="text-muted" /> : undefined}
            title={pinned}
            aria-label={
              value
                ? excluded
                  ? `${label}: everyone except ${currentName ? `${currentName}'s org` : "the leader's org"}`
                  : `${label}: ${currentName ?? value}`
                : label
            }
          >
            {value ? (
              <span className="flex max-w-[220px] min-w-0 items-baseline gap-1">
                <span className="font-normal text-muted">{label}</span>
                {/* Excluding leaves out the leader's whole org, so the trigger names the org. */}
                {excluded && <span className="shrink-0 text-ink">not in</span>}
                <span className="truncate text-ink">
                  {excluded || pinned
                    ? currentName
                      ? `${currentName}'s org`
                      : "the leader's org"
                    : (currentName ?? value)}
                </span>
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
            {onModeChange && (
              <ModeSwitch label={label} value={mode} onChange={onModeChange} hint={leaderModeHint(mode)} />
            )}
            <div className="relative">
              <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
              <Combobox.Input placeholder="Search by name or title" className={SEARCH_INPUT} />
            </div>
            <Combobox.Empty className="text-small text-muted empty:hidden">
              <div className="px-3 py-3">{options.length ? 'No matches.' : emptyText}</div>
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(360px,calc(var(--available-height)-90px))] overflow-y-auto overscroll-contain py-1 empty:p-0">
              {(o: LeaderOption) => (
                <Combobox.Item
                  key={o.id}
                  value={o.id}
                  disabled={o.disabled}
                  className={cx('group', PICKER_ITEM, 'items-start data-[disabled]:text-muted')}
                >
                  <span className="mt-0.5 flex w-4 shrink-0 justify-center">
                    <IconCheck
                      className="size-4 opacity-0 group-data-[selected]:opacity-100"
                      strokeWidth={2.25}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate group-data-[selected]:font-semibold">{o.name}</span>
                      {o.id === youId && <span className="shrink-0 text-meta text-muted">You</span>}
                    </span>
                    {o.title && <span className="block truncate text-meta text-muted">{o.title}</span>}
                  </span>
                  {/* Headcount basis (employees only), like every other count in the filters; the Org
                      chart's own counts include contractors and interns and say "people". Excluding,
                      the org is who would be left out. */}
                  <span className="tnum mt-0.5 shrink-0 text-meta text-muted">
                    {excluded ? `leaves out ${fmt(o.size, 'int')}` : plural(o.size, 'employee')}
                  </span>
                </Combobox.Item>
              )}
            </Combobox.List>
            {note && <p className="border-t border-rule px-3 py-1.5 text-meta text-muted">{note}</p>}
            <div className="flex items-center justify-between border-t border-rule py-1.5 pr-1.5 pl-3">
              <span className="text-meta text-muted">{plural(options.length, noun)}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!value}
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                  onOpenChange?.(false)
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
