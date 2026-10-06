/**
 * One row of filters above the content: saved views first, then the period, the org filters, and
 * a muted count of who is in scope. Under it, the data standard that applies to every view.
 * Active org filters show as removable chips underneath, with the leader's chain. Each org
 * filter's menu has an Include / Exclude switch at the top (docs/FILTERS.md, part 3), and the
 * changes made while one menu is open are one history entry.
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  FILTER_DIMENSION_LABELS,
  filterChips,
  isFiltered,
  leaderExcludedLabel,
  leaderOrgLabel,
} from '@/components/filterLabels'
import { IconChevronRight, IconClose, IconReset } from '@/components/icons'
import { MultiSelect } from '@/components/MultiSelect'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { dropIdleModes, type FilterMode, hasOrgFilter, isExcluded, withMode } from '@/data/scope'
import { useCensus } from '@/data/store'
import { fmt, plural } from '@/lib/format'
import { headcountAt } from '@/lib/people'
import { minGroupOf } from '@/metrics/privacy'
import { holdHistory } from './address'
import {
  DIMENSIONS,
  type DimensionKey,
  type DimensionOption,
  dimensionOptions,
  leaderChain,
  leaderOptions,
  otherFilters,
  tooFewToLeaveOut,
} from './filterOptions'
import { LeaderPicker } from './LeaderPicker'
import { listModeHint, ModeSwitch } from './ModeSwitch'
import { PeriodControl } from './PeriodControl'
import { ViewsMenu } from './SavedViews'
import { StandardControl } from './StandardControl'

/** Why Exclude greys out some choices (`tooFewToLeaveOut`). */
const tooFewNote = (what: string, min: number) =>
  `${what} of fewer than ${min} people can't be left out. Comparing the scope with and without them would single them out.`

const CHIP =
  'inline-flex h-7 max-w-full items-center gap-1.5 rounded-control bg-sheet pl-2 text-[12px] shadow-[inset_0_0_0_1px_var(--rule)]'

function RemoveButton({ label, onClick }: { label: string; onClick: (button: HTMLElement) => void }) {
  return (
    <button
      type="button"
      data-chip-remove=""
      aria-label={label}
      onClick={(e) => onClick(e.currentTarget)}
      className="mr-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-[3px] text-muted hover:bg-hover hover:text-ink"
    >
      <IconClose className="size-3" />
    </button>
  )
}

/** The selected leader with the chain above them; earlier links widen the scope to that leader. */
function LeaderCrumbs({ leaderId, onRemove }: { leaderId: string; onRemove: () => void }) {
  const ctx = useAnalytics()
  const setFilters = useCensus((s) => s.setFilters)
  const excluded = useCensus((s) => isExcluded(s.filters, 'leaderId'))
  const chain = leaderChain(ctx.org, leaderId)
  if (excluded) {
    const nameOf = (id: string) => ctx.org.byId.get(id)?.name
    return (
      <span className={CHIP}>
        <span className="text-muted">Leader</span>
        <span className="truncate font-medium text-ink">{leaderExcludedLabel(leaderId, nameOf)}</span>
        <RemoveButton
          label={`Remove leader exclusion ${leaderOrgLabel(leaderId, nameOf)}`}
          onClick={() => {
            onRemove()
            // The exclude mode goes with the leader, as the address does.
            setFilters({
              leaderId: null,
              modes: withMode(useCensus.getState().filters.modes, 'leaderId', 'include'),
            })
          }}
        />
      </span>
    )
  }
  const shown = chain.slice(-4)
  const hidden = chain.length - shown.length
  const leader = chain[chain.length - 1]
  return (
    <span className={CHIP}>
      <span className="text-muted">Leader</span>
      <nav aria-label="Reporting line" className="flex min-w-0 items-center gap-0.5">
        {hidden > 0 && <span className="text-muted">…</span>}
        {shown.slice(0, -1).map((e) => (
          <span key={e.employeeId} className="flex min-w-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setFilters({ leaderId: e.employeeId })}
              title={`Widen to ${e.name}'s org`}
              className="max-w-[120px] truncate rounded-[2px] text-ink-2 hover:text-ink hover:underline"
            >
              {e.name}
            </button>
            <IconChevronRight className="size-3 shrink-0 text-muted" />
          </span>
        ))}
        <span aria-current="true" className="truncate font-medium text-ink">
          {leader ? `${leader.name}'s org` : 'Leader org'}
        </span>
      </nav>
      <RemoveButton
        label="Remove leader filter"
        onClick={() => {
          onRemove()
          setFilters({ leaderId: null })
        }}
      />
    </span>
  )
}

export function FilterBar() {
  const ctx = useAnalytics()
  const filters = useCensus((s) => s.filters)
  const setFilters = useCensus((s) => s.setFilters)
  const resetFilters = useCensus((s) => s.resetFilters)
  const employees = ctx.all.employees

  // Each dimension counts within the rest of the row, so a count is who would be in scope.
  const options = useMemo(
    () =>
      Object.fromEntries(
        DIMENSIONS.map((k) => [
          k,
          dimensionOptions(
            employees,
            ctx.asOf,
            k,
            filters[k],
            hasOrgFilter(filters) ? otherFilters(filters, ctx.org, k) : undefined,
          ),
        ]),
      ) as Record<DimensionKey, DimensionOption[]>,
    [employees, ctx.asOf, ctx.org, filters],
  )
  // Leader sizes count within the other filters (exclusions included): who would be in scope.
  const leaders = useMemo(
    () =>
      leaderOptions(
        ctx.org,
        ctx.asOf,
        3,
        hasOrgFilter({ ...filters, leaderId: null }) ? otherFilters(filters, ctx.org, 'leaderId') : undefined,
      ),
    [ctx.org, ctx.asOf, filters],
  )
  // Excluding, a choice that would leave out 1 to min - 1 people can't be picked (the anonymity
  // rule Ask and the records panel apply); one already picked stays, so it can be taken off.
  const min = minGroupOf(ctx.metrics)
  const leaderExcluded = isExcluded(filters, 'leaderId')
  const leaderChoices = leaderExcluded
    ? leaders.map((o) =>
        o.id !== filters.leaderId && tooFewToLeaveOut(o.size, min) ? { ...o, disabled: true } : o,
      )
    : leaders
  const choices = (k: DimensionKey): DimensionOption[] =>
    isExcluded(filters, k)
      ? options[k].map((o) =>
          !filters[k].includes(o.value) && tooFewToLeaveOut(o.count, min) ? { ...o, disabled: true } : o,
        )
      : options[k]
  const setMode = (k: DimensionKey | 'leaderId', mode: FilterMode) =>
    setFilters({ modes: withMode(filters.modes, k, mode) })
  // Everything changed while one filter menu is open is one history entry. An exclude switch left
  // on without values only lasts while its menu is open (the address never carries one).
  const held = useRef<(() => void) | null>(null)
  const onMenu = (open: boolean) => {
    if (!open) {
      const now = useCensus.getState().filters
      const clean = dropIdleModes(now)
      if (clean !== now) setFilters({ modes: clean.modes })
    }
    held.current?.()
    held.current = open ? holdHistory() : null
  }
  useEffect(() => () => held.current?.(), [])
  const inScope = useMemo(() => headcountAt(ctx.data.employees, ctx.asOf), [ctx.data.employees, ctx.asOf])
  const total = useMemo(() => headcountAt(employees, ctx.asOf), [employees, ctx.asOf])

  const nameOf = (id: string) => ctx.org.byId.get(id)?.name
  const chips = filterChips(filters, nameOf).filter((c) => c.key !== 'leaderId')
  const showChips = isFiltered(filters)

  // A chip's remove button and Reset take themselves away: focus moves to the chip that took the
  // removed one's place (or the one before it), and to the leader picker when no chip is left.
  const chipRow = useRef<HTMLDivElement>(null)
  const fieldset = useRef<HTMLFieldSetElement>(null)
  const refocus = useRef<number | null>(null)
  useEffect(() => {
    const at = refocus.current
    if (at == null) return
    refocus.current = null
    const left = chipRow.current?.querySelectorAll<HTMLElement>('[data-chip-remove]') ?? []
    const next =
      left[Math.min(at, left.length - 1)] ??
      fieldset.current?.querySelector<HTMLElement>('[data-tour="filter-leader"]')
    next?.focus()
  })
  const removedAt = (el: HTMLElement) => {
    const all = [...(chipRow.current?.querySelectorAll<HTMLElement>('[data-chip-remove]') ?? [])]
    refocus.current = Math.max(0, all.indexOf(el))
  }

  return (
    <div className="pt-4 pb-1">
      <fieldset ref={fieldset} data-tour="filter-row" className="flex min-w-0 flex-wrap items-center gap-2">
        <legend className="sr-only">Filters</legend>
        <ViewsMenu />
        <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-rule-strong sm:block" />
        <PeriodControl />
        <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-rule-strong sm:block" />
        <LeaderPicker
          options={leaderChoices}
          value={filters.leaderId}
          currentName={filters.leaderId ? nameOf(filters.leaderId) : undefined}
          onChange={(leaderId) => setFilters({ leaderId })}
          mode={leaderExcluded ? 'exclude' : 'include'}
          onModeChange={(m) => setMode('leaderId', m)}
          onOpenChange={onMenu}
          note={leaderChoices.some((o) => o.disabled) ? tooFewNote('Orgs', min) : undefined}
        />
        {DIMENSIONS.map((k) => {
          const mode: FilterMode = isExcluded(filters, k) ? 'exclude' : 'include'
          const list = choices(k)
          return (
            <MultiSelect
              key={k}
              label={FILTER_DIMENSION_LABELS[k]}
              options={list}
              note={list.some((o) => o.disabled) ? tooFewNote('Groups', min) : undefined}
              value={filters[k]}
              onChange={(v) => setFilters({ [k]: v })}
              width={k === 'department' ? 340 : 300}
              excluded={mode === 'exclude'}
              onOpenChange={onMenu}
              header={
                <ModeSwitch
                  label={FILTER_DIMENSION_LABELS[k]}
                  value={mode}
                  onChange={(m) => setMode(k, m)}
                  hint={listModeHint(mode)}
                />
              }
            />
          )
        })}
        <p aria-live="polite" className="ml-auto pl-2 text-[12px] whitespace-nowrap text-muted">
          {ctx.isCompany
            ? `${plural(inScope, 'person', 'people')} in scope`
            : `${fmt(inScope, 'int')} of ${plural(total, 'person', 'people')} in scope`}
        </p>
      </fieldset>
      <div className="mt-2.5">
        <StandardControl />
      </div>
      {showChips && (
        <div ref={chipRow} className="mt-2 flex flex-wrap items-center gap-1.5">
          {filters.leaderId && (
            <LeaderCrumbs
              leaderId={filters.leaderId}
              onRemove={() => {
                refocus.current = 0
              }}
            />
          )}
          {chips.map((c) => (
            <span key={c.id} className={CHIP}>
              <span className="text-muted">{c.dimension}</span>
              <span className="truncate font-medium text-ink">{c.label}</span>
              <RemoveButton
                label={`Remove ${c.dimension.toLowerCase()}${c.excluded ? ' exclusion' : ''} ${c.value}`}
                onClick={(button) => {
                  removedAt(button)
                  setFilters(c.remove)
                }}
              />
            </span>
          ))}
          <Button
            size="sm"
            variant="ghost"
            icon={<IconReset className="size-3.5" />}
            onClick={() => {
              refocus.current = Number.MAX_SAFE_INTEGER
              resetFilters()
            }}
            className="ml-0.5"
          >
            Reset
          </Button>
        </div>
      )}
    </div>
  )
}
