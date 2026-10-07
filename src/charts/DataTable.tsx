/**
 * The datasheet table used for every figure's table view and for table-only figures: sortable
 * columns (aria-sort), right-aligned tabular numbers, a sticky header, hairline rows, optional
 * search, paging ("Show all N rows"), clickable rows and a status cell (icon + hidden word) per row.
 * Cells open the records behind them (`Column.drill`) or a link in a new tab (`Column.href`).
 * Pay-amount columns are dropped unless pay amounts are switched on.
 *
 * One table style everywhere (docs/DESIGN-REFRESH.md 2.8): sentence-case headers in text-meta
 * 500 ink-2 over a rule-strong hairline; rows 36px (32px with `density="compact"`, the drill
 * panel) divided by hairlines, no zebra; numbers right-aligned with tabular figures; text cells
 * clamp at two lines with the full value in a tooltip, so a long job title never makes a row
 * three lines tall. On phones the first column stays pinned while the table scrolls sideways
 * inside its sheet (`pinFirst`, default true).
 */
import { type KeyboardEvent, useState } from 'react'
import { IconArrowDown, IconArrowUp, IconSearch } from '@/components/icons'
import type { Severity } from '@/components/types'
import { cx, SeverityIcon } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { Drill } from '@/drill/Drill'
import {
  cellFormat,
  columnAlign,
  columnFormat,
  isNumericFormat,
  sampleRow,
  sampleValue,
  visibleColumns,
} from '@/lib/export/columns'
import { fmt } from '@/lib/format'
import { cellAction } from './cells'
import type { Column } from './types'

export interface SortState {
  key: string
  dir: 'asc' | 'desc'
}

export interface DataTableProps<T extends object> {
  columns: readonly Column<T>[]
  rows: readonly T[]
  /** Click a header to sort (default true). */
  sortable?: boolean
  defaultSort?: SortState
  /** Show the first N rows with a "Show all" button (and "Show 1,000 more" when many are left). */
  maxRows?: number
  onRowClick?: (row: T) => void
  /**
   * Which rows `onRowClick` applies to (default: every row). Only those get the pointer, the
   * focus stop and the click, so a row that opens nothing never looks like it does.
   */
  rowClickable?: (row: T) => boolean
  /** Status shown as an icon cell at the left of the row. */
  rowTone?: (row: T) => Severity | null | undefined
  /** A search box over the visible columns; a string sets its placeholder. */
  search?: boolean | string
  /** Accessible caption (visually hidden). */
  caption?: string
  /** Scroll inside the table past this height (px) so the header stays put; long tables (over 20 rows on screen) default to 520. */
  maxHeight?: number
  rowKey?: (row: T, index: number) => string
  emptyText?: string
  /** Row height: 36px (default) or 32px ('compact', for dense lists such as the drill panel). */
  density?: 'default' | 'compact'
  /** Keep the first column in view while the table scrolls sideways on phones (default true). */
  pinFirst?: boolean
  className?: string
}

/**
 * The narrowest a text cell may get: long text keeps about half its length per line, so two
 * lines show most of it ("What is open", "Blocking item"); short text stays compact. In a compact
 * table (the drill panel) names, departments and managers stay on one line and only long values
 * such as job titles may take two, so rows stay 32px; the table scrolls sideways instead.
 */
export function textMinWidth(value: string, compact = false): string {
  if (compact) return value.length <= 32 ? 'whitespace-nowrap' : 'min-w-[30ch]'
  if (value.length > 48) return 'min-w-[26ch]'
  if (value.length > 24) return 'min-w-[16ch]'
  return 'min-w-[6ch]'
}

/** Text longer than this gets its full value as a tooltip (it may be clamped at two lines). */
const CLAMP_TITLE = 24

const SEVERITY_WORD: Record<Severity, string> = {
  critical: 'Critical',
  warning: 'Watch',
  info: 'Note',
  good: 'Good',
}

const isBlank = (v: unknown) => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))

/** Ascending comparison; blanks are handled by the caller so they always sort last. */
function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' })
}

const isIdColumn = (key: string) => /(^id$|Id$|_id$)/.test(key)

/** Rows added per "Show more" when a long list is paged. */
export const PAGE_STEP = 1000

export function DataTable<T extends object>({
  columns,
  rows,
  sortable = true,
  defaultSort,
  maxRows,
  onRowClick,
  rowClickable,
  rowTone,
  search,
  caption,
  maxHeight,
  rowKey,
  emptyText = 'No rows to show.',
  density = 'default',
  pinFirst = true,
  className,
}: DataTableProps<T>) {
  const { showPay } = useAnalytics()
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null)
  // Extra rows revealed past maxRows; Infinity once "Show all" is chosen.
  const [extra, setExtra] = useState(0)
  const [query, setQuery] = useState('')

  const cols = visibleColumns(columns, showPay)
  const records = rows as readonly Record<string, unknown>[]
  const samples = cols.map((c) => sampleValue(records, c.key))
  const firsts = cols.map((c) => sampleRow(records, c.key))
  const formats = cols.map((c, i) => columnFormat(c, samples[i], firsts[i]))
  const aligns = cols.map((c, i) => columnAlign(c, samples[i], firsts[i]))
  const text = (row: T, i: number) => {
    const v = (row as Record<string, unknown>)[cols[i].key]
    const f = cellFormat(cols[i], row, formats[i])
    return f === 'text' && typeof v !== 'number' ? (v == null || v === '' ? '—' : String(v)) : fmt(v, f)
  }

  const q = query.trim().toLowerCase()
  let list = rows.map((row, index) => ({ row, index }))
  if (q) list = list.filter(({ row }) => cols.some((_, i) => text(row, i).toLowerCase().includes(q)))
  if (sort) {
    const dir = sort.dir === 'asc' ? 1 : -1
    const by = cols.find((c) => c.key === sort.key)?.sortValue
    const sortOf = (row: T) => (by ? by(row) : (row as Record<string, unknown>)[sort.key])
    list = list.slice().sort((a, b) => {
      const av = sortOf(a.row)
      const bv = sortOf(b.row)
      if (isBlank(av)) return isBlank(bv) ? a.index - b.index : 1
      if (isBlank(bv)) return -1
      return compareValues(av, bv) * dir || a.index - b.index
    })
  }
  const limit = maxRows !== undefined ? maxRows + extra : list.length
  const shown = list.slice(0, limit)
  const hidden = list.length - shown.length
  const scrollHeight = maxHeight ?? (shown.length > 20 ? 520 : undefined)

  const toggleSort = (key: string, numeric: boolean) => {
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: numeric ? 'desc' : 'asc' },
    )
  }

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    // Keys on a link or drill button inside the row belong to that control.
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onRowClick?.(row)
    }
  }

  const th =
    'sticky top-0 z-[1] border-b border-rule-strong bg-sheet py-1.5 px-2 first:pl-0 last:pr-0 align-bottom'
  const td = cx(
    'border-b border-rule px-2 first:pl-0 last:pr-0 align-middle',
    density === 'compact' ? 'h-8 py-1' : 'h-9 py-1.5',
  )
  // Phones: the first column stays put (with the sheet behind it) while the rest scroll. With a
  // status cell, both stay: the status icon at the left edge and the first column beside it.
  const pin = pinFirst ? 'max-md:sticky max-md:left-0 max-md:bg-sheet' : ''
  const pinNext = pinFirst ? 'max-md:sticky max-md:left-6 max-md:bg-sheet' : ''
  const pinHead = pinFirst ? 'max-md:z-[2]' : ''
  const firstPin = rowTone ? pinNext : pin

  return (
    <div className={cx('min-w-0', className)}>
      {search && (
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <label className="relative flex h-7 w-64 max-w-full items-center">
            <IconSearch size={14} className="pointer-events-none absolute left-2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setExtra(0)
              }}
              placeholder={typeof search === 'string' ? search : 'Search rows'}
              aria-label={typeof search === 'string' ? search : 'Search rows'}
              className="h-7 w-full rounded-control bg-sheet-2 pr-2 pl-7 text-small text-ink outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_1px_var(--rule-strong)]"
            />
          </label>
          {q && (
            <span className="tnum text-meta text-muted" aria-live="polite">
              {list.length.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} rows
            </span>
          )}
        </div>
      )}
      <div
        className={cx('scroll-x relative', scrollHeight !== undefined && 'overflow-y-auto')}
        style={scrollHeight ? { maxHeight: scrollHeight } : undefined}
      >
        <table
          className={cx(
            'w-full border-separate border-spacing-0 leading-snug',
            density === 'compact' ? 'text-meta' : 'text-small',
          )}
        >
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {rowTone && (
                <th
                  scope="col"
                  className={cx(th, 'w-6 min-w-6 text-meta font-medium text-ink-2', pin, pinHead)}
                >
                  <span className="sr-only">Status</span>
                </th>
              )}
              {cols.map((c, i) => {
                const active = sort?.key === c.key
                const numeric = isNumericFormat(formats[i])
                const right = aligns[i] === 'right'
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cx(
                      th,
                      'text-meta font-medium whitespace-nowrap text-ink-2',
                      right ? 'text-right' : 'text-left',
                      i === 0 && cx(firstPin, pinHead),
                    )}
                    style={c.width ? { width: `${c.width}ch` } : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key, numeric)}
                        className={cx(
                          'group inline-flex items-center gap-1 rounded-mark hover:text-ink',
                          right && 'flex-row-reverse',
                          active && 'text-ink',
                        )}
                      >
                        {c.label}
                        <span
                          className={cx(
                            'inline-flex',
                            active ? 'text-ink' : 'text-muted opacity-0 group-hover:opacity-100',
                          )}
                        >
                          {active && sort.dir === 'asc' ? (
                            <IconArrowUp size={12} />
                          ) : (
                            <IconArrowDown size={12} />
                          )}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ row, index }) => {
              const tone = rowTone?.(row)
              const clickable = !!onRowClick && (!rowClickable || rowClickable(row))
              return (
                <tr
                  key={rowKey ? rowKey(row, index) : index}
                  onClick={clickable ? () => onRowClick?.(row) : undefined}
                  onKeyDown={clickable ? (e) => onRowKey(e, row) : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  className={cx(clickable && 'cursor-pointer hover:bg-hover focus-visible:bg-hover')}
                >
                  {rowTone && (
                    <td className={cx(td, 'min-w-6', pin)}>
                      {tone && (
                        <span className="inline-flex align-middle">
                          <SeverityIcon severity={tone} />
                          <span className="sr-only">{SEVERITY_WORD[tone]}</span>
                        </span>
                      )}
                    </td>
                  )}
                  {cols.map((c, i) => {
                    const value = text(row, i)
                    const right = aligns[i] === 'right'
                    const id = isIdColumn(c.key) && formats[i] === 'text'
                    const body =
                      c.drill || c.href ? (
                        <ActionCell column={c} row={row} clamp={!right && !id}>
                          {value}
                        </ActionCell>
                      ) : (
                        value
                      )
                    return (
                      <td
                        key={c.key}
                        className={cx(
                          td,
                          right ? 'tnum text-right whitespace-nowrap' : 'text-left',
                          id ? 'font-mono text-meta whitespace-nowrap text-ink-2' : 'text-ink',
                          i === 0 && firstPin,
                        )}
                      >
                        {right || id ? (
                          body
                        ) : (
                          // Text clamps at two lines (left-aligned, a drill button too); the full
                          // value is in the tooltip. Long text keeps a readable width, since the
                          // table scrolls sideways rather than squeeze it into a tall column.
                          <span
                            className={cx(
                              'line-clamp-2 max-w-[40ch]',
                              textMinWidth(value, density === 'compact'),
                            )}
                            title={value.length > CLAMP_TITLE ? value : undefined}
                          >
                            {body}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {!shown.length && (
              <tr>
                <td colSpan={cols.length + (rowTone ? 1 : 0)} className="py-4 text-small text-muted">
                  {q ? 'No rows match your search.' : emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {hidden > PAGE_STEP && (
            <button
              type="button"
              onClick={() => setExtra((n) => n + PAGE_STEP)}
              className="rounded-mark text-small font-medium text-link hover:underline"
            >
              Show {PAGE_STEP.toLocaleString('en-US')} more
            </button>
          )}
          <button
            type="button"
            onClick={() => setExtra(Number.POSITIVE_INFINITY)}
            className="rounded-mark text-small font-medium text-link hover:underline"
          >
            Show all {list.length.toLocaleString('en-US')} rows
          </button>
          {hidden > PAGE_STEP && (
            <span className="tnum text-meta text-muted">
              Showing {shown.length.toLocaleString('en-US')} of {list.length.toLocaleString('en-US')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A cell whose value opens a link in a new tab (`href`, which wins) or the records behind it
 * (`drill`); plain text when it has neither for this row.
 */
function ActionCell<T extends object>({
  column,
  row,
  clamp,
  children,
}: {
  column: Column<T>
  row: T
  /** A text cell: the drill button clamps at two lines and starts at the left like the text. */
  clamp?: boolean
  children: string
}) {
  const action = cellAction(column, row, children)
  if (action?.kind === 'link') {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-link hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    )
  }
  if (action?.kind === 'drill') {
    return (
      <Drill
        spec={action.source}
        label={`${column.label}: ${children}. Show the records`}
        className={clamp ? 'line-clamp-2 text-left' : undefined}
      >
        {children}
      </Drill>
    )
  }
  return <>{children}</>
}
