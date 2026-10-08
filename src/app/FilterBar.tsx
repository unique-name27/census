/**
 * One row of filters above the content: saved views first, then the period, the org filters, and
 * a muted count of who is in scope. Under it, the data standard that applies to every view.
 * Active org filters show as removable chips underneath, with the leader's chain. Each org
 * filter's menu has an Include / Exclude switch at the top (docs/FILTERS.md, part 3), and the
 * changes made while one menu is open are one history entry.
 *
 * The mode shapes the row (docs/ROLES-V2.md 2.5): a scope pins its filter (Manager's leader, an
 * HRBP's business unit or region, with the pin and why on hover) and every option list and count
 * comes from inside the scope; Finance filters by business unit (include only) and period.
 *
 * Widths (docs/DESIGN-REFRESH.md 2.13 and 3.4): from 1280px the data standard folds into the row's
 * right end as a compact menu beside the scope count, so the row is one line. Under 768px the row
 * is the period control and one "Filters (n)" button, which opens a bottom sheet with the saved
 * views, every org filter, the scope count and the data standard; active filters still show as
 * removable chips under the row.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  lockTip,
  orgOf,
  PICKER_COPY,
  peopleInOrg,
  peopleInScope,
  reqsInScope,
  scopeTip,
  WHOLE_ORG,
  WHOLE_REGION,
  WHOLE_REQS,
  WHOLE_UNIT,
} from '@/access/copy'
import { PICK_OF } from '@/access/modes'
import type { ScopeLock } from '@/access/scopes/types'
import {
  FILTER_DIMENSION_LABELS,
  filterChips,
  isFiltered,
  leaderExcludedLabel,
  leaderOrgLabel,
} from '@/components/filterLabels'
import { IconChevronRight, IconClose, IconFilter, IconReset } from '@/components/icons'
import { MultiSelect } from '@/components/MultiSelect'
import { Button } from '@/components/ui'
import { useMinWidth, useNarrow } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import type { Employee } from '@/data/schema'
import { dropIdleModes, type FilterMode, hasOrgFilter, isExcluded, reqMatcher, withMode } from '@/data/scope'
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
  filterRowParts,
  leaderChain,
  leaderOptions,
  offersExclude,
  otherFilters,
  reqDimensionOptions,
  reqsLeaderOptions,
  scopedLeaderOptions,
  tooFewToLeaveOut,
} from './filterOptions'
import { LeaderPicker } from './LeaderPicker'
import { listModeHint, ModeSwitch } from './ModeSwitch'
import { PeriodControl } from './PeriodControl'
import { ViewsMenu } from './SavedViews'
import { NoPickButton, PinnedFilter, RegionSites } from './ScopeControls'
import { StandardControl } from './StandardControl'

/** Who a scope holds, for its option lists and counts: the org, the unit's or the region's people. */
function scopeMembers(scope: ScopeLock | null): ReadonlySet<string> | null {
  if (scope?.kind === 'org') return scope.orgIds
  if (scope?.kind === 'unit' || scope?.kind === 'region') return scope.memberIds
  return null
}

/** The leader picker's words inside a business unit or region: "Whole business unit". */
const SCOPED_LEADER = {
  unit: { clearLabel: WHOLE_UNIT, emptyText: 'Nobody in this business unit leads 3 or more employees.' },
  region: { clearLabel: WHOLE_REGION, emptyText: 'Nobody in this region leads 3 or more employees.' },
} as const

/** Why Exclude greys out some choices (`tooFewToLeaveOut`). */
const tooFewNote = (what: string, min: number) =>
  `${what} of fewer than ${min} people can't be left out. Comparing the scope with and without them would single them out.`

const CHIP =
  'inline-flex h-7 max-w-full items-center gap-1.5 rounded-control bg-sheet pl-2 text-meta shadow-[inset_0_0_0_1px_var(--rule)]'

function RemoveButton({ label, onClick }: { label: string; onClick: (button: HTMLElement) => void }) {
  return (
    <button
      type="button"
      data-chip-remove=""
      aria-label={label}
      onClick={(e) => onClick(e.currentTarget)}
      className="mr-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-chip text-muted hover:bg-hover hover:text-ink"
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
  const lock = ctx.access.lock
  const full = leaderChain(ctx.org, leaderId)
  // Manager mode: the chain starts at the manager, nobody above (docs/ROLES.md, 3.10).
  const from = lock ? full.findIndex((e) => e.employeeId === lock.managerId) : -1
  // Without the chain (a mode that hides `filter:chain`) the chip names the leader alone.
  const chain = !ctx.access.can('filter:chain') ? full.slice(-1) : from > 0 ? full.slice(from) : full
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
              className="max-w-[120px] truncate rounded-mark text-ink-2 hover:text-ink hover:underline"
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
      {/* Manager mode keeps the manager's org: removing a narrower leader goes back to it. */}
      {(!lock || leaderId !== lock.managerId) && (
        <RemoveButton
          label={lock ? `Back to ${orgOf(lock.managerName)}` : 'Remove leader filter'}
          onClick={() => {
            onRemove()
            setFilters({ leaderId: null })
          }}
        />
      )}
    </span>
  )
}

export function FilterBar() {
  const ctx = useAnalytics()
  const filters = useCensus((s) => s.filters)
  const setFilters = useCensus((s) => s.setFilters)
  const resetFilters = useCensus((s) => s.resetFilters)
  const { mode, scope } = ctx.access
  // Manager mode pins the leader to the manager's org; an HRBP mode pins the business unit or the
  // region. The options and counts come from inside the scope.
  const lock = scope?.kind === 'org' ? scope : null
  // A scoped mode with nothing usable picked: the row says so instead of naming an empty scope.
  const unset = ctx.access.unset
  const pickKind = PICK_OF[mode]
  const all = ctx.all.employees
  const employees = useMemo(() => {
    const members = scopeMembers(scope)
    return members ? all.filter((e) => members.has(e.employeeId)) : all
  }, [all, scope])
  // Recruiter mode reads reqs, not people (docs/ROLES-V2.md 2.5): the menus list what is on the
  // recruiter's reqs (every req with "every recruiter") and count open reqs, never headcount.
  const byReqs = mode === 'recruiter'
  const reqs = useMemo(() => {
    if (!byReqs) return []
    const ids = scope?.kind === 'reqs' ? scope.reqIds : null
    return ids ? ctx.all.requisitions.filter((r) => ids.has(r.reqId)) : ctx.all.requisitions
  }, [byReqs, scope, ctx.all.requisitions])
  // What this mode's row offers, each part by its `filter:*` decision (Finance: the saved views,
  // the period and the business unit, include only).
  const parts = filterRowParts(ctx.access)
  const showLeader = parts.leader
  const shownDims = parts.dims

  // Each dimension counts within the rest of the row, so a count is who would be in scope.
  const options = useMemo(
    () =>
      Object.fromEntries(
        DIMENSIONS.map((k) => [
          k,
          byReqs
            ? reqDimensionOptions(reqs, k, filters[k], reqMatcher({ ...filters, [k]: [] }, ctx.org))
            : dimensionOptions(
                employees,
                ctx.asOf,
                k,
                filters[k],
                hasOrgFilter(filters) ? otherFilters(filters, ctx.org, k) : undefined,
              ),
        ]),
      ) as Record<DimensionKey, DimensionOption[]>,
    [byReqs, reqs, employees, ctx.asOf, ctx.org, filters],
  )
  // Leader sizes count within the other filters (exclusions included): who would be in scope.
  const leaders = useMemo(() => {
    // Recruiter mode: the hiring managers of the reqs and those above them, counted in open reqs.
    if (byReqs)
      return reqsLeaderOptions(ctx.org, ctx.asOf, reqs, reqMatcher({ ...filters, leaderId: null }, ctx.org))
    const within = hasOrgFilter({ ...filters, leaderId: null })
      ? otherFilters(filters, ctx.org, 'leaderId')
      : undefined
    // A business unit or region: leaders with 3 or more people inside it.
    if (scope?.kind === 'unit' || scope?.kind === 'region') {
      const members = scope.memberIds
      return scopedLeaderOptions(ctx.org, ctx.asOf, (e: Employee) => members.has(e.employeeId), 3, within)
    }
    const list = leaderOptions(ctx.org, ctx.asOf, 3, within)
    // Manager mode: the manager and the leaders inside their org.
    return lock ? list.filter((o) => lock.orgIds.has(o.id) || o.id === lock.managerId) : list
  }, [byReqs, reqs, ctx.org, ctx.asOf, filters, lock, scope])
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
  // Recruiter mode counts its reqs and their active candidates inside the row's filters.
  const openReqs = useMemo(
    () => ctx.data.requisitions.filter((r) => r.status === 'Open').length,
    [ctx.data.requisitions],
  )
  const activeCandidates = useMemo(
    () => ctx.data.candidates.filter((c) => c.status === 'Active').length,
    [ctx.data.candidates],
  )

  const nameOf = (id: string) => ctx.org.byId.get(id)?.name
  // The region's whole set of sites is the scope, not a filter (a subset of them is).
  const wholeRegion = scope?.kind === 'region' && scope.sites.every((l) => filters.location.includes(l))
  const chips = filterChips(filters, nameOf).filter(
    (c) =>
      c.key !== 'leaderId' &&
      !(scope?.kind === 'unit' && c.key === 'businessUnit') &&
      !(wholeRegion && c.key === 'location'),
  )
  // A scope is not a filter: Manager's own org, an HRBP's business unit or whole region. The scope
  // line carries its pin, so it gets no chip, and with nothing else set there is nothing to reset.
  const lockedLeader = !!lock && filters.leaderId === lock.managerId
  const leaderChip = !!filters.leaderId && !unset && !lockedLeader
  const showChips = parts.chips && isFiltered(filters) && (chips.length > 0 || leaderChip)
  // A read-only data standard (Finance and Manager mode) is one short label at the row's end at
  // every width; a mode that hides it shows none.
  const standardFixed = parts.standard === 'read-only'
  const standardShown = parts.standard !== 'hidden'

  // A chip's remove button and Reset take themselves away: focus moves to the chip that took the
  // removed one's place (or the one before it), and to the leader picker when no chip is left
  // (the Views menu in Finance mode, which has no leader filter).
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
      fieldset.current?.querySelector<HTMLElement>('[data-tour="filter-leader"]') ??
      fieldset.current?.querySelector<HTMLElement>('[data-tour="filter-views"]')
    next?.focus()
  })
  const removedAt = (el: HTMLElement) => {
    const all = [...(chipRow.current?.querySelectorAll<HTMLElement>('[data-chip-remove]') ?? [])]
    refocus.current = Math.max(0, all.indexOf(el))
  }

  const narrow = useNarrow()
  const wide = useMinWidth(1280)
  const [sheetOpen, setSheetOpen] = useState(false)
  const activeCount = chips.length + (leaderChip ? 1 : 0)
  const tip = scope && !unset ? scopeTip(mode, scope.label) : ''
  // The region's sites in list order, with who the rest of the row lets through at each.
  const sites = useMemo(() => {
    if (scope?.kind !== 'region') return []
    const counts = new Map(options.location.map((o) => [o.value, o.count]))
    return scope.sites.map((value) => ({ value, count: counts.get(value) ?? 0 }))
  }, [scope, options.location])

  const leaderControl = !showLeader ? null : unset && pickKind === 'manager' ? (
    <NoPickButton kind="manager" />
  ) : (
    <LeaderPicker
      options={leaderChoices}
      value={filters.leaderId}
      currentName={filters.leaderId ? nameOf(filters.leaderId) : undefined}
      onChange={(leaderId) => setFilters({ leaderId })}
      mode={leaderExcluded ? 'exclude' : 'include'}
      onModeChange={lock || !parts.leaderExclude ? undefined : (m) => setMode('leaderId', m)}
      onOpenChange={onMenu}
      {...(lock && {
        clearLabel: WHOLE_ORG,
        pinned: lockTip(lock.managerName),
        youId: lock.managerId,
        emptyText: 'Nobody in this org leads 3 or more employees.',
      })}
      {...((scope?.kind === 'unit' || scope?.kind === 'region') && SCOPED_LEADER[scope.kind])}
      {...(byReqs && {
        unit: 'open req' as const,
        emptyText: 'None of these reqs has a hiring manager on the roster.',
        ...(scope?.kind === 'reqs' && { clearLabel: WHOLE_REQS }),
      })}
      note={leaderChoices.some((o) => o.disabled) ? tooFewNote('Orgs', min) : undefined}
    />
  )
  const orgFilters = (
    <>
      {/* Recruiter mode before its pick: the reqs it will show are named first. */}
      {unset && pickKind === 'recruiter' && <NoPickButton kind="recruiter" />}
      {leaderControl}
      {shownDims.map((k) => {
        if (scope?.kind === 'unit' && k === 'businessUnit')
          return unset ? (
            <NoPickButton key={k} kind="unit" />
          ) : (
            <PinnedFilter
              key={k}
              kind="unit"
              label={FILTER_DIMENSION_LABELS[k]}
              value={scope.unit}
              tip={tip}
            />
          )
        if (scope?.kind === 'region' && k === 'location')
          return unset ? (
            <NoPickButton key={k} kind="region" />
          ) : (
            <RegionSites
              key={k}
              region={scope.region}
              sites={sites}
              value={filters.location}
              onChange={(location) => setFilters({ location })}
              onOpenChange={onMenu}
              tip={tip}
            />
          )
        const listMode: FilterMode = isExcluded(filters, k) ? 'exclude' : 'include'
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
            excluded={listMode === 'exclude'}
            onOpenChange={onMenu}
            header={
              // Finance's business unit is include only: its totals cover whole business units.
              offersExclude(mode, k) ? (
                <ModeSwitch
                  label={FILTER_DIMENSION_LABELS[k]}
                  value={listMode}
                  onChange={(m) => setMode(k, m)}
                  hint={listModeHint(listMode)}
                />
              ) : undefined
            }
          />
        )
      })}
    </>
  )
  const scopeCount =
    unset && pickKind
      ? PICKER_COPY[pickKind].none
      : lock
        ? peopleInOrg(fmt(inScope, 'int'), plural(total, 'person', 'people'), lock.managerName)
        : scope?.kind === 'unit' || scope?.kind === 'region'
          ? peopleInScope(fmt(inScope, 'int'), plural(total, 'person', 'people'), scope.label)
          : scope?.kind === 'reqs'
            ? reqsInScope(openReqs, activeCandidates, scope.label)
            : ctx.isCompany
              ? `${plural(inScope, 'person', 'people')} in scope`
              : `${fmt(inScope, 'int')} of ${plural(total, 'person', 'people')} in scope`

  return (
    <div className="pt-4 pb-1">
      <fieldset ref={fieldset} data-tour="filter-row" className="flex min-w-0 flex-wrap items-center gap-2">
        <legend className="sr-only">Filters</legend>
        {narrow ? (
          <>
            {parts.period && <PeriodControl />}
            <BDialog.Root open={sheetOpen} onOpenChange={(o) => setSheetOpen(o)}>
              <BDialog.Trigger
                render={
                  <Button
                    icon={<IconFilter />}
                    aria-label={`Filters${activeCount ? `, ${activeCount} active` : ''}`}
                  >
                    Filters{activeCount ? ` (${activeCount})` : ''}
                  </Button>
                }
              />
              <BDialog.Portal>
                <BDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
                <BDialog.Popup className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col rounded-t-sheet bg-sheet text-ink shadow-(--shadow-pop) outline-none transition-transform duration-200 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
                  <div className="flex items-center gap-3 border-b border-rule px-4 pt-4 pb-3">
                    <div className="min-w-0 flex-1">
                      <BDialog.Title className="cut-head text-section font-semibold">Filters</BDialog.Title>
                      {parts.inScope && (
                        <BDialog.Description className="mt-0.5 text-meta text-muted">
                          {scopeCount}
                        </BDialog.Description>
                      )}
                    </div>
                    <BDialog.Close
                      aria-label="Close"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink"
                    >
                      <IconClose />
                    </BDialog.Close>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {parts.views && <ViewsMenu />}
                      {orgFilters}
                    </div>
                    {standardShown && (
                      <div className="mt-4 border-t border-rule pt-4">
                        <StandardControl />
                      </div>
                    )}
                  </div>
                </BDialog.Popup>
              </BDialog.Portal>
            </BDialog.Root>
          </>
        ) : (
          <>
            {parts.views && (
              <>
                <ViewsMenu />
                <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-rule-strong sm:block" />
              </>
            )}
            {parts.period && (
              <>
                <PeriodControl />
                <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-rule-strong sm:block" />
              </>
            )}
            {orgFilters}
          </>
        )}
        {parts.inScope && (
          <p
            aria-live="polite"
            className="ml-auto pl-2 text-meta whitespace-nowrap text-muted max-md:sr-only"
          >
            {scopeCount}
          </p>
        )}
        {standardShown && (wide || (standardFixed && !narrow)) && <StandardControl compact />}
      </fieldset>
      {standardShown && !wide && !narrow && !standardFixed && (
        <div className="mt-2.5">
          <StandardControl />
        </div>
      )}
      {showChips && (
        <div ref={chipRow} className="mt-2 flex flex-wrap items-center gap-1.5">
          {leaderChip && filters.leaderId && (
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
          {parts.reset && (
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
          )}
        </div>
      )}
    </div>
  )
}
