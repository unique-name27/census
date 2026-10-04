/**
 * The datasheet table used for every figure's table view and for table-only figures: sortable
 * columns (aria-sort), right-aligned tabular numbers, a sticky header, hairline rows, optional
 * search, paging ("Show all N rows"), clickable rows and a status cell (icon + hidden word) per row.
 * Cells open the records behind them (`Column.drill`) or a link in a new tab (`Column.href`).
 * Pay-amount columns are dropped unless pay amounts are switched on.
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
  className?: string
}

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
    list = list.slice().sort((a, b) => {
      const av = (a.row as Record<string, unknown>)[sort.key]
      const bv = (b.row as Record<string, unknown>)[sort.key]
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
  const td = 'border-b border-rule py-1.5 px-2 first:pl-0 last:pr-0 align-middle'

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
              className="h-7 w-full rounded-control bg-sheet-2 pr-2 pl-7 text-[13px] text-ink outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_1px_var(--rule-strong)]"
            />
          </label>
          {q && (
            <span className="tnum text-[12px] text-muted" aria-live="polite">
              {list.length.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} rows
            </span>
          )}
        </div>
      )}
      <div
        className={cx('scroll-x relative', scrollHeight !== undefined && 'overflow-y-auto')}
        style={scrollHeight ? { maxHeight: scrollHeight } : undefined}
      >
        <table className="w-full border-separate border-spacing-0 text-[13px] leading-snug">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {rowTone && (
                <th scope="col" className={cx(th, 'w-6')}>
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
                      'cut-head text-[12px] font-semibold whitespace-nowrap text-ink-2',
                      right ? 'text-right' : 'text-left',
                    )}
                    style={c.width ? { width: `${c.width}ch` } : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key, numeric)}
                        className={cx(
                          'group inline-flex items-center gap-1 rounded-[2px] hover:text-ink',
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
                    <td className={td}>
                      {tone && (
                        <span className="inline-flex align-middle">
                          <SeverityIcon severity={tone} />
                          <span className="sr-only">{SEVERITY_WORD[tone]}</span>
                        </span>
                      )}
                    </td>
                  )}
                  {cols.map((c, i) => (
                    <td
                      key={c.key}
                      className={cx(
                        td,
                        aligns[i] === 'right' ? 'tnum text-right whitespace-nowrap' : 'text-left',
                        isIdColumn(c.key) && formats[i] === 'text'
                          ? 'font-mono text-[12px] whitespace-nowrap text-ink-2'
                          : 'text-ink',
                      )}
                    >
                      {c.drill || c.href ? (
                        <ActionCell column={c} row={row}>
                          {text(row, i)}
                        </ActionCell>
                      ) : (
                        text(row, i)
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
            {!shown.length && (
              <tr>
                <td colSpan={cols.length + (rowTone ? 1 : 0)} className="py-4 text-[13px] text-muted">
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
              className="rounded-[2px] text-[13px] font-medium text-link hover:underline"
            >
              Show {PAGE_STEP.toLocaleString('en-US')} more
            </button>
          )}
          <button
            type="button"
            onClick={() => setExtra(Number.POSITIVE_INFINITY)}
            className="rounded-[2px] text-[13px] font-medium text-link hover:underline"
          >
            Show all {list.length.toLocaleString('en-US')} rows
          </button>
          {hidden > PAGE_STEP && (
            <span className="tnum text-[12px] text-muted">
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
  children,
}: {
  column: Column<T>
  row: T
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
      <Drill spec={action.source} label={`${column.label}: ${children}. Show the records`}>
        {children}
      </Drill>
    )
  }
  return <>{children}</>
}
