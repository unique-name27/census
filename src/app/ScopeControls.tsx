/**
 * The filter row's controls for a scope (docs/ROLES-V2.md 2.5): the business unit an HRBP mode
 * keeps (the pin, "Business unit: Silicon Engineering", no menu: it opens "Choose a business
 * unit"), the region's sites (the pin, "Location: APAC", a menu of the region's sites with "Whole
 * region" at the top and no Exclude switch), and the button a scoped mode shows before its pick is
 * made ("Business unit: No business unit picked"), which opens the pick dialog.
 */
import { Combobox } from '@base-ui/react/combobox'
import { useMemo } from 'react'
import { PICKER_COPY, WHOLE_REGION } from '@/access/copy'
import type { PickKind } from '@/access/modes'
import { openPicker } from '@/access/store'
import { IconCheck, IconPin, IconSearch } from '@/components/icons'
import { PICKER_ITEM, POPUP_SURFACE, SEARCH_INPUT } from '@/components/styles'
import { Button, cx, Tip } from '@/components/ui'
import { fmt, plural } from '@/lib/format'

/** The filter each pick kind holds Census to, by its filter-row name. */
const PICK_FILTER: Readonly<Record<PickKind, string>> = {
  manager: 'Leader',
  unit: 'Business unit',
  region: 'Location',
  recruiter: 'Recruiter',
}

/** "A, B" for up to two values, else "A +2" (the scope line's rule). */
const listText = (xs: readonly string[]) => (xs.length <= 2 ? xs.join(', ') : `${xs[0]} +${xs.length - 1}`)

/**
 * A filter the mode keeps fixed, with no menu: the pin, its name and value, and why on hover and
 * focus ("HRBP mode keeps Census on Silicon Engineering. Change it with Mode."). Pressing it opens
 * the pick dialog, the same as the Mode menu's "Change…".
 */
export function PinnedFilter({
  kind,
  label,
  value,
  tip,
}: {
  kind: PickKind
  label: string
  value: string
  tip: string
}) {
  return (
    <Tip content={tip}>
      <Button
        icon={<IconPin className="text-muted" />}
        aria-label={`${label}: ${value}. ${PICKER_COPY[kind].change}`}
        onClick={() => openPicker(kind)}
      >
        <span className="flex max-w-[240px] min-w-0 items-baseline gap-1">
          <span className="font-normal text-muted">{label}</span>
          <span className="truncate text-ink">{value}</span>
        </span>
      </Button>
    </Tip>
  )
}

/** A scoped mode before its pick: the pinned filter reads "No region picked" and opens the dialog. */
export function NoPickButton({ kind }: { kind: PickKind }) {
  const label = PICK_FILTER[kind]
  const none = PICKER_COPY[kind].none
  return (
    <Button
      data-tour={kind === 'manager' ? 'filter-leader' : undefined}
      icon={<IconPin className="text-muted" />}
      aria-label={`${label}: ${none}. ${PICKER_COPY[kind].title}`}
      onClick={() => openPicker(kind)}
    >
      <span className="flex items-baseline gap-1">
        <span className="font-normal text-muted">{label}</span>
        <span className="text-ink">{none}</span>
      </span>
    </Button>
  )
}

export interface SiteOption {
  value: string
  /** Active employees at the site that the rest of the filter row lets through. */
  count: number
}

/**
 * HRBP for a region: the location filter holds a non-empty subset of the region's sites. The
 * menu lists the sites as checkboxes, "Whole region" at the top; taking the last one off is the
 * whole region again (the clamp's rule).
 */
export function RegionSites({
  region,
  sites,
  value,
  onChange,
  onOpenChange,
  tip,
}: {
  region: string
  /** The region's sites in list order, with counts. */
  sites: readonly SiteOption[]
  value: readonly string[]
  onChange: (value: string[]) => void
  onOpenChange?: (open: boolean) => void
  tip: string
}) {
  const all = useMemo(() => sites.map((s) => s.value), [sites])
  const items = useMemo(
    () => Combobox.createItems([...sites], { getValue: (o) => o.value, getLabel: (o) => o.value }),
    [sites],
  )
  const whole = all.length > 0 && all.every((s) => value.includes(s))
  const shown = whole ? region : `${region}: ${listText(value)}`
  return (
    <Combobox.Root
      items={items}
      multiple
      value={[...value]}
      onValueChange={(v) => onChange(v.length ? v : all)}
      onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined}
    >
      <Combobox.Trigger
        render={
          <Button
            caret
            icon={<IconPin className="text-muted" />}
            title={tip}
            aria-label={`Location: ${whole ? `${region}, every site` : shown}`}
          >
            <span className="flex max-w-[240px] min-w-0 items-baseline gap-1">
              <span className="font-normal text-muted">Location</span>
              <span className="truncate text-ink">{shown}</span>
            </span>
          </Button>
        }
      />
      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={6} className="z-50 outline-none">
          <Combobox.Popup
            aria-label={`Locations in ${region}`}
            className={cx(POPUP_SURFACE, 'w-[300px] max-w-[calc(100vw-32px)]')}
          >
            <div className="border-b border-rule py-1">
              <button
                type="button"
                onClick={() => onChange(all)}
                aria-pressed={whole}
                className={cx(PICKER_ITEM, 'w-[calc(100%-8px)] text-left hover:bg-hover')}
              >
                <span className="flex w-4 shrink-0 justify-center">
                  <IconCheck className={cx('size-4', !whole && 'opacity-0')} strokeWidth={2.25} />
                </span>
                <span className={cx('min-w-0 flex-1 truncate', whole && 'font-semibold')}>
                  {WHOLE_REGION}
                </span>
              </button>
            </div>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
              <Combobox.Input placeholder="Search locations" className={SEARCH_INPUT} />
            </div>
            <Combobox.Empty className="text-small text-muted empty:hidden">
              <div className="px-3 py-3">No matches.</div>
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(320px,calc(var(--available-height)-130px))] overflow-y-auto overscroll-contain py-1 empty:p-0">
              {(o: SiteOption) => (
                <Combobox.Item key={o.value} value={o.value} className={cx('group', PICKER_ITEM)}>
                  <span
                    aria-hidden="true"
                    className="flex size-4 shrink-0 items-center justify-center rounded-chip text-on-ink shadow-[inset_0_0_0_1.5px_var(--rule-strong)] group-data-[selected]:bg-ink group-data-[selected]:shadow-none"
                  >
                    <IconCheck
                      className="size-3 opacity-0 group-data-[selected]:opacity-100"
                      strokeWidth={2}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.value}</span>
                  <span className="tnum shrink-0 text-meta text-muted">{fmt(o.count, 'int')}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
            <p className="border-t border-rule px-3 py-2 text-meta text-muted">
              {whole
                ? `Every site in ${region}`
                : `${fmt(value.length, 'int')} of ${plural(all.length, 'site')} in ${region}`}
            </p>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
