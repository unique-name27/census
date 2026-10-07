/**
 * The dictionary's list: a search box, filters (view, tier, changed from default, has a target)
 * and every metric that passes them, grouped by where it is listed. A row opens the metric's
 * detail panel through the address (#data.metrics/…), so Back returns to the previous metric.
 */
import { type MouseEvent, useEffect, useRef } from 'react'
import { Figure } from '@/charts'
import { IconLock, IconSearch } from '@/components/icons'
import { routeHash } from '@/components/navigation'
import { MedalGlyph } from '@/components/tier/TierBadge'
import { Button, cx } from '@/components/ui'
import type { FieldRef } from '@/data/quality/fieldRef'
import { TIER_LABEL, TIERS, type Tier } from '@/data/quality/tier'
import { METRIC_VIEW_LABEL } from '@/metrics/registry'
import type { MetricView } from '@/metrics/types'
import { Select } from '../../ui/Select'
import { metricsTab } from '../links'
import {
  countText,
  groupRows,
  isFiltered,
  LIST_COLUMNS,
  type MetricFilters,
  type MetricRow,
  NO_FILTERS,
  viewOptions,
} from '../model'

const TIER_OPTIONS: Tier[] = [...TIERS].reverse()

/** The fields behind the tiers the list shows. */
const usesOf = (rows: readonly MetricRow[]): FieldRef[] => [...new Set(rows.flatMap((r) => r.uses))]

function FilterToggle({
  pressed,
  onChange,
  children,
}: {
  pressed: boolean
  onChange: (v: boolean) => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cx(
        'inline-flex h-7 items-center rounded-control px-2.5 text-meta font-medium transition-colors',
        pressed
          ? 'bg-ink text-on-ink hover:bg-ink-2'
          : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--rule-strong)] hover:bg-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function Row({
  row,
  selected,
  viewFilter,
  onOpen,
}: {
  row: MetricRow
  selected: boolean
  viewFilter: MetricView | null
  onOpen: (id: string) => void
}) {
  const href = routeHash('data', metricsTab({ view: viewFilter, metric: row.id }))
  const facts = [
    row.targetText,
    row.settings ? `${row.settings} ${row.settings === 1 ? 'setting' : 'settings'}` : null,
  ]
  return (
    <li>
      <a
        href={href}
        aria-current={selected ? 'true' : undefined}
        data-metric={row.id}
        onClick={(e: MouseEvent<HTMLAnchorElement>) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
          e.preventDefault()
          onOpen(row.id)
        }}
        className={cx(
          'flex flex-col gap-0.5 rounded-control px-2 py-1.5 transition-colors',
          selected ? 'bg-sheet-3' : 'hover:bg-hover',
        )}
      >
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-small leading-snug font-semibold text-ink">{row.name}</span>
          {row.tier ? (
            <span className="mt-px inline-flex shrink-0 items-center gap-1 text-label font-medium text-ink-2">
              <MedalGlyph tier={row.tier} className="size-3" />
              {TIER_LABEL[row.tier]}
            </span>
          ) : (
            <span className="mt-px inline-flex shrink-0 items-center gap-1 text-label font-medium text-muted">
              {row.locked && <IconLock className="size-3" />}
              Rule
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-meta leading-snug text-muted">
          <span className="truncate font-mono text-label">{row.id}</span>
          {facts.filter(Boolean).map((f) => (
            <span key={f}>{f}</span>
          ))}
          {row.changed && (
            <span className="inline-flex h-4 items-center rounded-chip bg-warning-wash px-1 text-label font-semibold text-ink">
              Changed
            </span>
          )}
        </span>
      </a>
    </li>
  )
}

export function MetricList({
  rows,
  shown,
  filters,
  setFilters,
  selected,
  onOpen,
  className,
}: {
  /** Every metric. */
  rows: readonly MetricRow[]
  /** The metrics that pass the filters. */
  shown: readonly MetricRow[]
  filters: MetricFilters
  setFilters: (f: MetricFilters) => void
  selected: string | null
  onOpen: (id: string) => void
  className?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const groups = groupRows(shown)
  const views = viewOptions(rows)
  const filtered = isFiltered(filters)
  const viewFilter = filters.view === 'all' ? null : filters.view

  // Keep the open metric in sight in the list (after a link from elsewhere, or Back).
  useEffect(() => {
    if (!selected) return
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>(`[data-metric="${CSS.escape(selected)}"]`)
    if (!list || !el) return
    const top = el.offsetTop - list.offsetTop
    if (top < list.scrollTop || top + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTo({ top: Math.max(0, top - 48) })
  }, [selected])

  return (
    <Figure
      id="data-metrics-list"
      title="Metrics"
      subtitle={countText(shown.length, rows.length)}
      data={shown}
      columns={LIST_COLUMNS}
      image={false}
      tableToggle={false}
      gate={false}
      uses={usesOf(shown)}
      className={className}
    >
      <div className="flex flex-col gap-2">
        <p className="sr-only" aria-live="polite">
          {countText(shown.length, rows.length)}
        </p>
        <label className="relative flex h-8 items-center">
          <IconSearch className="pointer-events-none absolute left-2 size-3.5 text-muted" />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            placeholder="Search names, wording, fields and settings"
            aria-label="Search metrics"
            className="h-8 w-full rounded-control bg-sheet-2 pr-2 pl-7 text-small text-ink outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="View"
            value={filters.view}
            onChange={(v) => setFilters({ ...filters, view: v as MetricFilters['view'] })}
            className="w-[150px]"
          >
            <option value="all">All views</option>
            {views.map((v) => (
              <option key={v} value={v}>
                {METRIC_VIEW_LABEL[v]}
              </option>
            ))}
          </Select>
          <Select
            label="Tier"
            value={filters.tier}
            onChange={(v) => setFilters({ ...filters, tier: v as MetricFilters['tier'] })}
            className="w-[120px]"
          >
            <option value="all">All tiers</option>
            {TIER_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </Select>
          <FilterToggle pressed={filters.changed} onChange={(changed) => setFilters({ ...filters, changed })}>
            Changed
          </FilterToggle>
          <FilterToggle pressed={filters.target} onChange={(target) => setFilters({ ...filters, target })}>
            Has a target
          </FilterToggle>
          {filtered && (
            <Button size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
              Clear
            </Button>
          )}
        </div>
        <div
          ref={listRef}
          className="-mx-2 mt-1 lg:max-h-[calc(100vh-260px)] lg:min-h-[320px] lg:overflow-y-auto"
        >
          {groups.length === 0 ? (
            <p className="px-2 py-6 text-small text-ink-2">
              No metric matches these filters.{' '}
              <button
                type="button"
                onClick={() => setFilters(NO_FILTERS)}
                className="font-medium text-link underline-offset-2 hover:underline"
              >
                Clear the filters
              </button>
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.group} aria-label={g.label} className="pb-2">
                <h3 className="eyebrow sticky top-0 z-[1] bg-sheet px-2 pt-2 pb-1">
                  {g.label} <span className="font-normal text-muted">{g.rows.length}</span>
                </h3>
                <ul>
                  {g.rows.map((r) => (
                    <Row
                      key={r.id}
                      row={r}
                      selected={r.id === selected}
                      viewFilter={viewFilter}
                      onOpen={onOpen}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </Figure>
  )
}
