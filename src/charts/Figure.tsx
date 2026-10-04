/**
 * Figure: the sheet every chart and exportable table sits on.
 *
 * Header: title and subtitle, the tier badge, the view's own controls, a chart/table toggle, a
 * definitions datasheet and the export menu (CSV, Excel, copy, PNG, SVG, detail rows). Body: the
 * chart (kept mounted while the table view is shown, so it stays exportable), the table, or an
 * empty state. Footer: a muted note. The figure registers with its view so "Export view"
 * includes it.
 *
 * The rows passed as `data` are exactly what the table shows and every export writes. Columns
 * marked `pay: true` are dropped unless pay amounts are switched on.
 *
 * Data standard: the figure's tier is the lowest among its `uses` (or the view's datasets). Below
 * the standard the body becomes a note naming what holds it back and how to raise it; "Preview
 * anyway" shows it on screen under a bronze band, and every export carries the reason instead of
 * the data. A held-back figure shows no note either: notes usually carry its numbers.
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
import { TierBadge } from '@/components/tier/TierBadge'
import { heldBack } from '@/components/tier/tierModel'
import { useTierGate } from '@/components/tier/useTierGate'
import { cx, IconButton, Menu, type MenuItem, Popover } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { copyTable } from '@/lib/export/clipboard'
import { downloadCsv } from '@/lib/export/csv'
import { downloadPng, downloadSvg } from '@/lib/export/image'
import { fileStem, imageFooter } from '@/lib/export/names'
import { figureExport } from '@/lib/export/withheld'
import { downloadXlsx } from '@/lib/export/xlsx'
import { type Span, spanClass } from '@/lib/spans'
import { definitionOf, metricIdOf } from '@/metrics/api'
import { DefinitionChangedMark, EditDefinitionLink } from '@/views/data/metrics/ui/EditDefinition'
import { QualityLensLine } from '@/views/data/quality-overview/LensLine'
import { DataTable, type DataTableProps } from './DataTable'
import { HeldBackState, PreviewBar, PreviewFrame } from './FigureGate'
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
  /**
   * The fields the figure is computed from ('employees.terminationDate'). Its tier is the lowest
   * of theirs; without it, the tier of the view's datasets is used.
   */
  uses?: readonly FieldRef[]
  /**
   * The metric dictionary entry the figure shows ('hrbp.attrition.voluntary'). Its definitions
   * panel reads the registry (with your wording) and links to "Edit definition".
   */
  metric?: string
  /**
   * Judge the figure against the data standard (default true). The Data room never gates; set
   * false for figures about the data itself rather than a people number.
   */
  gate?: boolean
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
  uses,
  metric: metricId,
  gate: gated = true,
  className,
  children,
}: FigureProps<T>) {
  const { showPay, quality, metrics } = useAnalytics()
  const meta = useExportMeta()
  const registry = useFigureRegistry()
  const [order] = useState(nextFigureOrder)
  const [showTable, setShowTable] = useState(false)
  const [preview, setPreview] = useState(false)
  // Focus follows the preview toggle, but only once the reader has used it.
  const [toggled, setToggled] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const titleId = useId()
  // The dictionary entry behind the figure: its wording stands in when the figure gives no
  // definitions, and the datasheet links to it ("Edit definition").
  const metric = metricId && metrics.def(metricId) ? metricId : null
  const metricDefinition = metric ? definitionOf(metrics, metric) : null
  const datasheet = definitions?.length ? definitions : metricDefinition ? [metricDefinition] : []

  const gate = useTierGate(uses, gated)
  const held = gate && !gate.shown ? heldBack(gate, quality) : null
  const previewing = !!held && held.canPreview && preview
  // Below the standard every export carries the reason and no note (notes often carry the hidden
  // numbers); an on-screen preview never leaves the page.
  const out = figureExport({ columns: columns as readonly Column[], rows: data, note }, held)
  const { withheld, rows, columns: cols, note: outNote } = out
  const tier = gate?.tier ?? null
  const isEmpty = !!empty
  const showsBody = !held || previewing
  const hasChart = !tableOnly && !isEmpty && showsBody
  const canImage = hasChart && !withheld

  // Figures with nothing to show stay out of view exports; a held-back figure exports its reason.
  useEffect(() => {
    if (!registry || !rows.length) return
    return registry.register({
      id,
      title,
      subtitle,
      note: outNote,
      columns: cols.slice(),
      rows: rows.slice(),
      getSvg: () => (image && !withheld ? chartSvg(chartRef.current) : null),
      order,
      tier,
      withheld,
    })
  }, [registry, id, title, subtitle, outNote, cols, rows, order, image, tier, withheld])

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
  const exportTable = { name: title, title, subtitle, note: outNote, columns: cols, rows, tier, withheld }
  const exportImage = (save: (svg: SVGSVGElement) => Promise<void>) => {
    const el = canImage ? chartSvg(chartRef.current) : null
    if (!el) {
      flash({ text: 'This figure has no chart image', tone: 'error' })
      return
    }
    void run(() => save(el))
  }
  const imageOpts = () => ({ header: { title, subtitle }, footer: imageFooter(meta, tier) })
  const noRows = rows.length === 0

  const items: MenuItem[] = [
    { heading: 'Data' },
    {
      label: 'Download CSV',
      icon: <IconFile />,
      hint: '.csv',
      disabled: noRows,
      onSelect: () =>
        void run(() => downloadCsv(exportTable, meta, { showPay, fileName: stem, preamble: true })),
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
  if (detail && !withheld) {
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
                tier,
              },
            ],
            meta,
            { showPay, fileName: `${stem}-detail` },
          )
        }),
    })
  }
  if (!tableOnly && image && !withheld) {
    items.push(
      { separator: true },
      { heading: 'Image' },
      {
        label: 'Download PNG',
        icon: <IconImage />,
        hint: 'For slides',
        disabled: !canImage,
        onSelect: () => exportImage((el) => downloadPng(el, stem, imageOpts())),
      },
      {
        label: 'Download SVG',
        icon: <IconImage />,
        hint: '.svg',
        disabled: !canImage,
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
        <div
          data-figure-actions
          className="-mt-0.5 -mr-1.5 ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-1"
        >
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
          {gate && (
            <TierBadge
              compact
              tier={gate.tier}
              explain={gate.explain}
              dataset={gate.limiting.dataset}
              className="mr-0.5"
            />
          )}
          {metric && <DefinitionChangedMark metricId={metric} className="mr-0.5" />}
          {actions && (
            <div className="mr-1 flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          )}
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
          {datasheet.length > 0 && (
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
              <Definitions items={datasheet} />
              {/* Rows from the dictionary carry their own link; the figure's metric gets one here otherwise. */}
              {metric && !datasheet.some((d) => metricIdOf(d) === metric) && (
                <div className="mt-1 border-t border-rule pt-2">
                  <EditDefinitionLink metricId={metric} />
                </div>
              )}
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
        {held && gate && !previewing ? (
          <HeldBackState
            held={held}
            tier={gate.tier}
            focusPreview={toggled}
            onPreview={() => {
              setToggled(true)
              setPreview(true)
            }}
          />
        ) : (
          <>
            {held && gate && (
              <PreviewBar
                tier={gate.tier}
                standard={gate.standard}
                focusHide={toggled}
                onHide={() => {
                  setToggled(true)
                  setPreview(false)
                }}
              />
            )}
            <PreviewFrame active={previewing}>
              {isEmpty ? (
                <div className="flex min-h-28 items-center rounded-control bg-sheet-2 px-4 py-5 text-[13px] text-ink-2">
                  {empty}
                </div>
              ) : tableOnly ? (
                tableView
              ) : (
                <>
                  {/* biome-ignore lint/a11y/useSemanticElements: a named group around the chart, not a form fieldset */}
                  <div
                    ref={chartRef}
                    hidden={showTable && tableToggle}
                    role="group"
                    aria-label={`${title}, chart`}
                  >
                    {children}
                  </div>
                  {showTable && tableToggle && tableView}
                </>
              )}
            </PreviewFrame>
          </>
        )}
      </div>

      {note && showsBody && <p className="-mt-1 px-4 pb-3.5 text-[12px] leading-snug text-muted">{note}</p>}
      {/* The quality lens (view header switch): tier, field limiting it, rows used and left out. */}
      {gated && (
        <QualityLensLine
          uses={uses}
          metricId={metric ?? undefined}
          label={title}
          variant="figure"
          showTier
          showChanged={false}
          className="mx-4 mb-3.5 border-t border-rule pt-2"
        />
      )}
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
              {metricIdOf(d) && (
                <div className="mt-1">
                  <EditDefinitionLink metricId={metricIdOf(d) as string} />
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
