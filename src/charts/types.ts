/**
 * Contracts shared by figures, tables and exports.
 *
 * Money columns (docs/ROLES-V2.md 3.1). Mark every column that holds money with one of two flags:
 *
 * - `pay: true`: one person's amount (base salary, range midpoint, gap to minimum, an item's
 *   `amount`). Shown only while `ctx.showPay` (a switch mode with "Show pay amounts" on).
 * - `cost: true`: a total over a group of people (cost by cost center, merit spend by business
 *   unit, budget cost). Shown while `ctx.showCost` (`showPay`, or Finance mode, where totals show
 *   without the switch under the cost guard). Never set both: a column is one or the other.
 *
 * ```ts
 * const columns: Column<Row>[] = [
 *   { key: 'unit', label: 'Business unit' },
 *   { key: 'people', label: 'People', format: 'int' },
 *   { key: 'targetCashUsd', label: 'Target cash (USD)', format: 'money', cost: true },
 *   { key: 'gapUsd', label: 'Gap to minimum (USD)', format: 'moneyFull', pay: true },
 * ]
 * ```
 *
 * `Figure`, `DataTable`, every export (CSV, Excel, slides, copy, whole-view workbook and deck) and
 * the records panel drop what the context does not allow, through
 * `visibleColumns(columns, moneyShown(ctx))` from `@/lib/export` (`{ pay, cost }`; a plain boolean
 * still means "pay amounts on", which allows both). Ratios (compa-ratio, merit %) carry neither flag.
 */
import type { DataStandard, Tier } from '@/data/quality/tier'
import type { DrillSource } from '@/drill/Drill'
import type { Format } from '@/lib/format'

/** A per-row format, for columns whose unit differs by row (e.g. a "Value" column holding rates and day counts). */
export type RowFormat<T = Record<string, unknown>> = (row: T) => Format

/**
 * A column of the rows behind a figure: drives the table view and every export. The untyped
 * `Column` takes any row so typed columns (`Column<Row>`, whose per-row format reads a `Row`) fit
 * the untyped lists that registries and exports take.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above; only the per-row format's parameter depends on T
export interface Column<T = any> {
  key: Extract<keyof T, string> | string
  label: string
  /** One format for the column, or one per row (`(row) => Format`); Excel gets a per-cell number format. */
  format?: Format | RowFormat<T>
  /** One person's pay amount: hidden from the table and exports unless pay amounts are switched on (`ctx.showPay`). */
  pay?: boolean
  /**
   * A cost total over a group of people (5 or more, under the cost guard): hidden unless cost
   * totals may show (`ctx.showCost`: pay amounts on, or Finance mode). See the note at the top.
   */
  cost?: boolean
  align?: 'left' | 'right'
  /** Optional width hint for tables, in ch. */
  width?: number
  /**
   * Limit the column to one kind of output. 'sheets': tables on screen, Excel, CSV and copy, not
   * slides (units and long series that a slide shows inside the value or has no room for).
   * 'slides': slide tables only (a readable "+4 d" beside the numbers sheets carry).
   */
  only?: 'sheets' | 'slides'
  /**
   * The records behind a cell (usually a count or a rate): the cell becomes a button that opens
   * the drill panel. Return null for cells with nothing behind them. Not used by exports.
   */
  drill?: { bivarianceHack(row: T): DrillSource }['bivarianceHack']
  /**
   * A link for the cell (e.g. the record in its source system): the table shows the value as a
   * link that opens in a new tab. Return null for no link; when it gives one it wins over
   * `drill` for that cell. Only web, mail and same-site links render. Exports keep the plain value.
   */
  href?: { bivarianceHack(row: T): string | null }['bivarianceHack']
  /**
   * What the table sorts the column by, when the value shown does not sort in order (a month
   * shown as "Apr 2026" sorts by "2026-04"). Exports keep the value shown.
   */
  sortValue?: { bivarianceHack(row: T): unknown }['bivarianceHack']
}

/** A row of the "datasheet" popover that defines a metric. */
export interface Definition {
  term: string
  text: string
  /** Muted formula line, e.g. "hired ÷ (hired + declined)". */
  formula?: string
}

/** What a figure registers with its view so "Export view" can collect it. */
export interface RegisteredFigure {
  id: string
  title: string
  subtitle?: string
  note?: string
  columns: Column[]
  rows: Record<string, unknown>[]
  /** The rendered chart SVG, if the figure has one. */
  getSvg: () => SVGSVGElement | null
  order: number
  /** The figure's data tier; absent when it is not gated (e.g. the Data room). */
  tier?: Tier | null
  /**
   * The data standard hides the figure: `rows` hold the reason instead of its data, and there is
   * no image. A preview shown on screen is never exported.
   */
  withheld?: boolean
  /** The metric dictionary entry the figure shows (`Figure`'s `metric`). */
  metric?: string
  /**
   * The part of a tab the figure belongs to, when one tab holds several (People stats > Special
   * analyses: one per analysis). Set by `FigureSection`; exports name it on the sheets and use its
   * own window.
   */
  section?: ExportSection
}

/** A named part of a tab whose figures export together (`FigureSection` in `@/charts`). */
export interface ExportSection {
  /** Stable key, e.g. 'quality'. */
  key: string
  /** Its name in titles, meta lines and file names: "Quality of hire". */
  label: string
  /** Its name before a sheet name, where Excel allows 31 characters: "Quality". */
  short: string
  /**
   * The window its numbers cover when it is not the period picked ("Hires 1 Oct 2023 to 30 Sep
   * 2025", "As of 30 Sep 2026"); exports state it instead of the period.
   */
  window?: string
}

/** One KPI tile or readout finding, as the Developer page's contract checks read it. */
export interface FigureItemFacts {
  id: string
  metricId?: string
  /** It declares `uses`. */
  uses: boolean
  /** It opens its records. */
  drill: boolean
}

/**
 * What a figure on screen declares, whether or not it has rows (the registry's `track`): the
 * Developer page's figure scan and contract checks read these. Never exported.
 */
export interface FigureFacts {
  id: string
  title: string
  metric?: string
  uses?: readonly string[]
  /** Judged against the data standard (`Figure`'s `gate`); false for figures about the app or the data itself. */
  gated: boolean
  rows: number
  tier?: Tier | null
  withheld?: boolean
  /** It has a chart image to export. */
  image: boolean
  /** 'figure' for a Figure, 'table' for a table-only registration (a KPI strip, a readout). */
  kind: 'figure' | 'table'
  /** A KPI strip's tiles or a readout's findings. */
  items?: { kind: 'kpi' | 'finding'; list: readonly FigureItemFacts[] }
  order: number
}

/** Context stamped on every export (header rows, file names, slide footers). */
export interface ExportMeta {
  /** The view's label, e.g. "People stats". */
  view: string
  /** The view's key ('hrbp'); file names drop it where a figure id repeats it. */
  viewKey?: string
  tab?: string
  scope: string
  window: string
  asOf: string
  isSample: boolean
  company: string
  /** The data standard in force; every sheet, slide and CSV preamble states it. */
  standard?: DataStandard
  /**
   * The mode a whole-view export was made in, when it shapes what is in it: "Made in Manager mode
   * for Priya Raman's org." (docs/ROLES.md, 3.11; docs/ROLES-V2.md 4.11: every mode but HR and
   * Developer). The workbook's cover and every sheet, the deck's title slide, CSV preambles and
   * image footers state it.
   */
  modeLine?: string
  /**
   * Finance mode's pay line, in place of "Pay amounts" (docs/ROLES-V2.md 3.2): "Cost totals cover
   * groups of 5 or more people. Individual pay is left out." Stated with the mode line.
   */
  costLine?: string
}
