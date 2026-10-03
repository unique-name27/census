/**
 * Searchable multi-select for filter dimensions: a compact trigger with a count badge, and a popup
 * with a search field, a checkbox list with counts, and a Clear action. Built on Base UI Combobox,
 * so it has listbox semantics, type-to-filter and arrow-key navigation.
 */
import { Combobox } from '@base-ui/react/combobox'
import { useMemo } from 'react'
import { fmt } from '@/lib/format'
import { IconCheck, IconSearch } from './icons'
import { PICKER_ITEM, POPUP_SURFACE, SEARCH_INPUT } from './styles'
import { Button, cx } from './ui'

export interface MultiSelectOption {
  value: string
  /** Display label; defaults to the value. */
  label?: string
  /** Shown muted at the right, e.g. active employees with this value. */
  count?: number
}

export interface MultiSelectProps {
  /** Trigger text and accessible name, e.g. "Location". */
  label: string
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  searchPlaceholder?: string
  /** Popup width in px. */
  width?: number
  size?: 'sm' | 'md'
  disabled?: boolean
}

export function MultiSelect({
  label,
  options,
  value,
  onChange,
  searchPlaceholder,
  width = 300,
  size = 'md',
  disabled,
}: MultiSelectProps) {
  const items = useMemo(
    () => Combobox.createItems(options, { getValue: (o) => o.value, getLabel: (o) => o.label ?? o.value }),
    [options],
  )
  const selected = value.length
  return (
    <Combobox.Root
      items={items}
      multiple
      value={value}
      onValueChange={(v) => onChange(v)}
      disabled={disabled}
    >
      <Combobox.Trigger
        render={
          <Button size={size} caret className={cx(selected > 0 && 'text-ink')}>
            <span>{label}</span>
            {selected > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] bg-ink px-1 text-[11px] font-semibold text-on-ink">
                {selected}
              </span>
            )}
          </Button>
        }
      />
      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={6} className="z-50 outline-none">
          <Combobox.Popup
            aria-label={label}
            className={POPUP_SURFACE}
            style={{ width, maxWidth: 'calc(100vw - 32px)' }}
          >
            <div className="relative">
              <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
              <Combobox.Input
                placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}`}
                className={SEARCH_INPUT}
              />
            </div>
            <Combobox.Empty className="text-[13px] text-muted empty:hidden">
              <div className="px-3 py-3">No matches.</div>
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(320px,calc(var(--available-height)-90px))] overflow-y-auto overscroll-contain py-1 empty:p-0">
              {(o: MultiSelectOption) => (
                <Combobox.Item key={o.value} value={o.value} className={cx('group', PICKER_ITEM)}>
                  <span
                    aria-hidden="true"
                    className="flex size-4 shrink-0 items-center justify-center rounded-[3px] text-on-ink shadow-[inset_0_0_0_1.5px_var(--rule-strong)] group-data-[selected]:bg-ink group-data-[selected]:shadow-none"
                  >
                    <IconCheck
                      className="size-3 opacity-0 group-data-[selected]:opacity-100"
                      strokeWidth={2}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.label ?? o.value}</span>
                  {o.count != null && (
                    <span className="tnum shrink-0 text-[12px] text-muted">{fmt(o.count, 'int')}</span>
                  )}
                </Combobox.Item>
              )}
            </Combobox.List>
            <div className="flex items-center justify-between border-t border-rule py-1.5 pr-1.5 pl-3">
              <span className="text-[12px] text-muted">
                {selected ? `${selected} selected` : 'None selected'}
              </span>
              <Button size="sm" variant="ghost" disabled={!selected} onClick={() => onChange([])}>
                Clear
              </Button>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
