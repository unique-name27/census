/**
 * Figure: the sheet every chart and exportable table sits on.
 *
 * Header: title and subtitle, the view's own controls, a chart/table toggle, a definitions
 * datasheet and the export menu (CSV, Excel, copy, PNG, SVG, detail rows). Body: the chart
 * (kept mounted while the table view is shown, so it stays exportable), the table, or an empty
 * state. Footer: a muted note. The figure registers with its view so "Export view" includes it.
 *
 * The rows passed as `data` are exactly what the table shows and every export writes. Columns
 * marked `pay: true` are dropped unless pay amounts are switched on.
 */
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import {
  IconChart,
  IconCopy,
  IconDownload,
  IconFile,
  IconImage,
  IconInfo,
  IconTable,
} from '@/components/icons'
import { cx, IconButton, Menu, type MenuItem, Popover } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { copyTable } from '@/lib/export/clipboard'
import { downloadCsv } from '@/lib/export/csv'
import { downloadPng, downloadSvg } from '@/lib/export/image'
import { fileStem, imageFooter } from '@/lib/export/names'
import { downloadXlsx } from '@/lib/export/xlsx'
import { type Span, spanClass } from '@/lib/spans'
import { DataTable, type DataTableProps } from './DataTable'
import { nextFigureOrder, useFigureRegistry } from './registry'
import type { Column, Definition } from './types'
import { useExportMeta } from './useExportMeta'

/** Desktop grid columns; the shared mapping in `@/lib/spans` (also used by Section, Readout, EmptyState). */
export type FigureSpan = Span

/** The rows behind a figure, one level down (e.g. the requisitions behind a time-to-fill bar). */
export interface FigureDetail {
  /** Names the sheet and the menu item, e.g. "Requisitions". */
  label: string
  columns: readonly Column[]
  /** Called only when the detail export is requested. */
  rows: () => readonly object[]
}

export type FigureTableOptions<T extends object> = Pick<
  DataTableProps<T>,
  'maxRows' | 'onRowClick' | 'rowTone' | 'search' | 'defaultSort' | 'maxHeight'
>

export interface FigureProps<T extends object> {
  /** Stable kebab-case id, unique in the app, prefixed with the view key. */
  id: string
  title: string
  subtitle?: string
  /** The rows behind the chart: shown in the table view and written by every export. */
  data: readonly T[]
  columns: readonly Column<T>[]
  definitions?: readonly Definition[]
  /** Muted footnote, e.g. "62 reqs filled · as of 30 Sep 2026". */
  note?: string
  /** Desktop grid columns (default 12). */
  span?: FigureSpan
  /** Extra header controls (segmented toggles and the like). */
  actions?: ReactNode
  /** A message replaces the chart when set (e.g. "No filled reqs in this period."). */
  empty?: string | null | false
  detail?: FigureDetail
  /** Render `data` as a table instead of a chart. */
  tableOnly?: boolean
  /**
   * The body has a chart image to export (default true). Set false for figures whose body is HTML
   * (lists, meters, cards): the PNG and SVG menu items are hidden and view decks use the table.
   */
  image?: boolean
  /**
   * Offer the chart/table toggle (default true). Set false when the body already is a table (or
   * a list that reads as one), so a second table view would only repeat it.
   */
  tableToggle?: boolean
  /** Table view options. */
  table?: FigureTableOptions<T>
  className?: string
  children?: ReactNode
}

type Status = { text: string; tone: 'ok' | 'error' } | null

export function Figure<T extends object>({
  id,
  title,
  subtitle,
  data,
  columns,
  definitions,
  note,
  span = 12,
  actions,
  empty,
  detail,
  tableOnly = false,
  image = true,
  tableToggle = true,
  table,
  className,
  children,
}: FigureProps<T>) {
  const { showPay } = useAnalytics()
  const meta = useExportMeta()
  const registry = useFigureRegistry()
  const [order] = useState(nextFigureOrder)
  const [showTable, setShowTable] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const titleId = useId()

  const rows = data as readonly Record<string, unknown>[]
  const cols = columns as readonly Column[]
  const isEmpty = !!empty
  const hasChart = !tableOnly && !isEmpty

  // Figures with nothing to show stay out of view exports.
  useEffect(() => {
    if (!registry || !rows.length) return
    return registry.register({
      id,
      title,
      subtitle,
      note,
      columns: cols.slice(),
      rows: rows.slice(),
      getSvg: () => (image ? chartSvg(chartRef.current) : null),
      order,
    })
  }, [registry, id, title, subtitle, note, cols, rows, order, image])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const flash = (s: Status) => {
    setStatus(s)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setStatus(null), 2600)
  }

  const run = async (
    task: () => Promise<unknown> | unknown,
    done?: string,
    failed = 'Export failed. Try again.',
  ) => {
    try {
      await task()
      if (done) flash({ text: done, tone: 'ok' })
    } catch (err) {
      console.error(`Export of "${title}" failed`, err)
      flash({ text: failed, tone: 'error' })
    }
  }

  const stem = fileStem(meta, id)
  const exportTable = { name: title, title, subtitle, note, columns: cols, rows }
  const exportImage = (save: (svg: SVGSVGElement) => Promise<void>) => {
    const el = hasChart ? chartSvg(chartRef.current) : null
    if (!el) {
      flash({ text: 'This figure has no chart image', tone: 'error' })
      return
    }
    void run(() => save(el))
  }
  const imageOpts = () => ({ header: { title, subtitle }, footer: imageFooter(meta) })
  const noRows = rows.length === 0

  const items: MenuItem[] = [
    { heading: 'Data' },
    {
      label: 'Download CSV',
      icon: <IconFile />,
      hint: '.csv',
      disabled: noRows,
      onSelect: () => void run(() => downloadCsv(exportTable, meta, { showPay, fileName: stem })),
    },
    {
      label: 'Download Excel',
      icon: <IconTable />,
      hint: '.xlsx',
      disabled: noRows,
      onSelect: () => void run(() => downloadXlsx([exportTable], meta, { showPay, fileName: stem })),
    },
    {
      label: 'Copy table',
      icon: <IconCopy />,
      hint: 'Paste into Excel',
      disabled: noRows,
      onSelect: () =>
        void run(
          () => copyTable(exportTable, { showPay }),
          `Copied ${rows.length.toLocaleString('en-US')} ${rows.length === 1 ? 'row' : 'rows'}`,
          'The browser blocked copying. Download CSV instead.',
        ),
    },
  ]
  if (detail) {
    items.push({
      label: 'Download detail rows (Excel)',
      icon: <IconTable />,
      hint: detail.label,
      onSelect: () =>
        void run(() => {
          const detailRows = detail.rows() as readonly Record<string, unknown>[]
          return downloadXlsx(
            [
              {
                name: detail.label,
                title: `${title}: ${detail.label.toLowerCase()}`,
                subtitle,
                columns: detail.columns,
                rows: detailRows,
              },
            ],
            meta,
            { showPay, fileName: `${stem}-detail` },
          )
        }),
    })
  }
  if (!tableOnly && image) {
    items.push(
      { separator: true },
      { heading: 'Image' },
      {
        label: 'Download PNG',
        icon: <IconImage />,
        hint: 'For slides',
        disabled: !hasChart,
        onSelect: () => exportImage((el) => downloadPng(el, stem, imageOpts())),
      },
      {
        label: 'Download SVG',
        icon: <IconImage />,
        hint: '.svg',
        disabled: !hasChart,
        onSelect: () => exportImage((el) => downloadSvg(el, stem, imageOpts())),
      },
    )
  }

  const tableView = (
    <DataTable
      columns={columns}
      rows={data}
      caption={title}
      maxRows={table?.maxRows ?? (tableOnly ? 15 : 12)}
      onRowClick={table?.onRowClick}
      rowTone={table?.rowTone}
      search={table?.search}
      defaultSort={table?.defaultSort}
      maxHeight={table?.maxHeight}
    />
  )

  return (
    <figure
      aria-labelledby={titleId}
      className={cx('m-0 flex flex-col rounded-sheet bg-sheet', spanClass(span), className)}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 pt-3.5">
        <figcaption className="min-w-0 flex-1 basis-56">
          <h3 id={titleId} className="cut-head text-[15px] leading-snug font-semibold text-ink">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{subtitle}</p>}
        </figcaption>
        <div className="-mt-0.5 -mr-1.5 ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
          <span
            role="status"
            className={cx(
              'text-[12px]',
              status?.tone === 'error' ? 'text-bad-text' : 'text-muted',
              !status && 'sr-only',
            )}
          >
            {status?.text}
          </span>
          {actions && <div className="mr-1 flex items-center gap-2">{actions}</div>}
          {hasChart && tableToggle && (
            <IconButton
              label={showTable ? 'Show chart' : 'Show table'}
              aria-pressed={showTable}
              size="sm"
              onClick={() => setShowTable((v) => !v)}
              className={cx(showTable && 'bg-hover text-ink')}
            >
              {showTable ? <IconChart /> : <IconTable />}
            </IconButton>
          )}
          {definitions && definitions.length > 0 && (
            <Popover
              title="Definitions"
              align="end"
              width={420}
              trigger={
                <IconButton label="Definitions" size="sm">
                  <IconInfo />
                </IconButton>
              }
            >
              <Definitions items={definitions} />
            </Popover>
          )}
          {(!noRows || detail) && (
            <Menu
              width={288}
              trigger={
                <IconButton label={`Export ${title}`} size="sm">
                  <IconDownload />
                </IconButton>
              }
              items={items}
            />
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 px-4 pt-3 pb-4">
        {isEmpty ? (
          <div className="flex min-h-28 items-center rounded-control bg-sheet-2 px-4 py-5 text-[13px] text-ink-2">
            {empty}
          </div>
        ) : tableOnly ? (
          tableView
        ) : (
          <>
            {/* biome-ignore lint/a11y/useSemanticElements: a named group around the chart, not a form fieldset */}
            <div ref={chartRef} hidden={showTable && tableToggle} role="group" aria-label={`${title}, chart`}>
              {children}
            </div>
            {showTable && tableToggle && tableView}
          </>
        )}
      </div>

      {note && <p className="-mt-1 px-4 pb-3.5 text-[12px] leading-snug text-muted">{note}</p>}
    </figure>
  )
}

/**
 * The chart image of a figure body: a kit chart (Plot) or an SVG marked `data-chart`; otherwise
 * the body's only top-level SVG. Bodies with several unmarked SVGs (e.g. a list of meters) have
 * no single image and export as tables.
 */
function chartSvg(body: HTMLElement | null): SVGSVGElement | null {
  if (!body) return null
  const marked = body.querySelector<SVGSVGElement>('svg.census-plot, svg[data-chart]')
  if (marked) return marked
  const top = [...body.querySelectorAll('svg')].filter((el) => !el.parentElement?.closest('svg'))
  return top.length === 1 ? top[0] : null
}

/** Datasheet-style definitions: term, plain definition, muted formula. */
function Definitions({ items }: { items: readonly Definition[] }) {
  return (
    <table className="w-full border-separate border-spacing-0 text-[12px] leading-snug">
      <thead className="sr-only">
        <tr>
          <th scope="col">Term</th>
          <th scope="col">Definition</th>
        </tr>
      </thead>
      <tbody>
        {items.map((d) => (
          <tr key={d.term} className="align-top [&:first-child>*]:border-t-0">
            <th
              scope="row"
              className="w-[34%] border-t border-rule py-2 pr-3 text-left font-semibold text-ink"
            >
              {d.term}
            </th>
            <td className="border-t border-rule py-2 text-ink-2">
              {d.text}
              {d.formula && <div className="mt-1 font-mono text-[11px] text-muted">{d.formula}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
