/**
 * Whole-view exports built from the figure registry (exactly the figures on screen, in order):
 *
 * - exportViewWorkbook: a Summary sheet (view, scope, window, as-of and a linked list of figures)
 *   plus one styled sheet per figure, each with its chart embedded beside the table.
 * - exportViewDeck: a 16:9 PowerPoint deck in the Census style (ink on white, Archivo): a title
 *   slide, then one slide per figure with the chart as a crisp 2x image, or a native table for
 *   table-only figures.
 *
 * Both take one tab's figures, or a whole view's figures grouped by tab (`FigureGroup[]`): sheet
 * names are then prefixed with the tab label, the Summary lists figures under their tab, and the
 * deck opens each tab with a divider slide.
 *
 * Images are captured in the light theme so they sit on white slides and sheets.
 */
import type { Workbook } from 'exceljs'
import type PptxGenJS from 'pptxgenjs'
import type { ExportMeta, ExportSection, RegisteredFigure } from '@/charts/types'
import { type DataStandard, STANDARD_LABEL, TIER_LABEL } from '@/data/quality/tier'
import { fmt } from '@/lib/format'
import { cellFormat, columnAlign, columnFormat, sampleRow, sampleValue, visibleColumns } from './columns'
import { definitionsLineFor } from './definitions'
import { downloadBlob, MIME } from './download'
import { pngDataUrl, type RasterImage, svgToPng, withLightTheme } from './image'
import { asOfLabel, fileStem, hasDataContext, metaLine, stampLine, standardLine, viewLine } from './names'
import { exportNote } from './withheld'
import { addTableSheet, newWorkbook, saveWorkbook, uniqueSheetNames, XL } from './xlsx'

export interface ViewExportOptions {
  showPay: boolean
  /** File name without extension; defaults to census-<view>-<tab>-<as-of>. */
  fileName?: string
  /**
   * Chart images captured earlier, by figure id (see `captureFigureImages`), e.g. while figures
   * rendered off screen were still mounted. When given, nothing is captured at export time.
   */
  captured?: ReadonlyMap<string, RasterImage>
}

/** The figures of one tab of a view, for an export of every tab. */
export interface FigureGroup {
  /** Tab key. Figure ids must be unique across groups (prefix them with the tab key). */
  key: string
  /** Tab label: prefixes sheet names and titles the tab's divider slide. */
  label: string
  figures: readonly RegisteredFigure[]
}

/** One tab's figures, or a whole view's figures grouped by tab. */
export type ViewFigures = readonly RegisteredFigure[] | readonly FigureGroup[]

/** A figure in export order, with the tab group it came from (null for a single-tab export). */
export interface ViewEntry {
  figure: RegisteredFigure
  group: FigureGroup | null
}

export function isFigureGroups(figures: ViewFigures): figures is readonly FigureGroup[] {
  return figures.length > 0 && 'figures' in figures[0]
}

/** Figures in export order; groups without figures are left out. */
export function viewEntries(figures: ViewFigures): ViewEntry[] {
  if (!isFigureGroups(figures)) return figures.map((figure) => ({ figure, group: null }))
  return figures.flatMap((group) => group.figures.map((figure) => ({ figure, group })))
}

/**
 * A figure title without its section's name in front, for a sheet name that already says it:
 * "Quality of hire by university" in Quality of hire is "By university".
 */
export function sectionTitle(title: string, section: Pick<ExportSection, 'label'>): string {
  const lead = `${section.label.toLowerCase()} `
  if (!title.toLowerCase().startsWith(lead)) return title
  const rest = title.slice(lead.length).trim()
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : title
}

/**
 * Sheet name before sanitizing: the figure title, prefixed with its tab label in a whole-view
 * export. A figure in a section of a tab (Special analyses: one per analysis) starts with its
 * number on the Summary (`n`), so its sheets never need "(2)" however Excel's 31 characters cut
 * them, then the section's short name in a whole-view export: "23 Quality · By university".
 */
export function entrySheetName(e: ViewEntry, n?: number): string {
  const s = e.figure.section
  if (s) {
    const name = `${e.group ? `${s.short} · ` : ''}${sectionTitle(e.figure.title, s)}`
    return n != null ? `${n} ${name}` : name
  }
  return e.group ? `${e.group.label} · ${e.figure.title}` : e.figure.title
}

/**
 * The meta of a section's figures: the tab line names it, and its own window replaces the period.
 * Applying it twice changes nothing.
 */
export function withSection(meta: ExportMeta, s: ExportSection, tab = meta.tab): ExportMeta {
  const named = tab === s.label || !!tab?.endsWith(` · ${s.label}`)
  return {
    ...meta,
    tab: named ? tab : [tab, s.label].filter(Boolean).join(' · '),
    ...(s.window ? { window: s.window } : {}),
  }
}

/** The export meta for one entry: a grouped figure names its own tab, a section figure its section. */
export function entryMeta(meta: ExportMeta, e: ViewEntry): ExportMeta {
  const tab = e.group ? e.group.label : meta.tab
  const s = e.figure.section
  if (s) return withSection(meta, s, tab)
  return e.group ? { ...meta, tab } : meta
}

/** The one section every figure of a one-tab export sits in (the analysis on screen), or null. */
export function onlySection(entries: readonly ViewEntry[]): ExportSection | null {
  const first = entries[0]?.figure.section
  if (!first || entries.some((e) => e.group || e.figure.section?.key !== first.key)) return null
  return first
}

/**
 * The meta of the whole file. One tab whose figures all sit in one section names it in the
 * title, file name and window: "People stats · Special analyses · Quality of hire",
 * census-people-stats-special-analyses-quality-of-hire-2026-09-30.
 */
export function exportMeta(meta: ExportMeta, entries: readonly ViewEntry[]): ExportMeta {
  const s = onlySection(entries)
  return s ? withSection(meta, s) : meta
}

const viewStem = (meta: ExportMeta) => fileStem(meta, meta.tab ?? '')

/** The Summary's heading over a tab's figures, or a section's: "Special analyses · Quality of hire · Hires …". */
const headingOf = (e: ViewEntry): string | null => {
  const s = e.figure.section
  const tab = e.group?.label ?? ''
  if (!s) return tab || null
  return [tab, s.label, s.window].filter(Boolean).join(' · ')
}
const headingKey = (e: ViewEntry) => `${e.group?.key ?? ''}|${e.figure.section?.key ?? ''}`

/**
 * Chart images for view exports, by figure id: each figure's SVG rasterized at 2x in the light
 * theme. Call while the figures are mounted; a chart that fails to render is skipped.
 */
export async function captureFigureImages(
  figures: readonly RegisteredFigure[],
): Promise<Map<string, RasterImage>> {
  const out = new Map<string, RasterImage>()
  await withLightTheme(async () => {
    for (const f of figures) {
      const svg = f.getSvg()
      if (!svg) continue
      try {
        out.set(f.id, await svgToPng(svg, { scale: 2, legend: true }))
      } catch (err) {
        // One chart that fails to rasterize should not sink the export; its data still goes out.
        console.warn(`Could not render the image for "${f.title}"`, err)
      }
    }
  })
  return out
}

/* ───────── Workbook ───────── */

function writeSummary(
  wb: Workbook,
  sheetName: string,
  entries: readonly ViewEntry[],
  sheetNames: string[],
  meta: ExportMeta,
  opts: ViewExportOptions,
) {
  const ws = wb.getWorksheet(sheetName)
  if (!ws) return
  ws.views = [{ showGridLines: false }]
  const figures = entries.map((e) => e.figure)
  const tiered = figures.some((f) => f.tier)
  // The figure list; the Tier column is there when the figures carry tiers.
  const listCols: { head: string; width: number; right?: boolean; wrap?: boolean }[] = [
    { head: '#', width: 16 },
    { head: 'Figure', width: 46 },
    ...(tiered ? [{ head: 'Tier', width: 12 }] : []),
    { head: 'What it shows', width: 64, wrap: true },
    { head: 'Rows', width: 9, right: true },
    { head: 'Note', width: 40, wrap: true },
  ]
  listCols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width
  })

  const title = ws.getCell('A1')
  title.value = viewLine(meta) || 'Census'
  title.font = { size: 18, bold: true, color: { argb: XL.ink } }
  ws.getRow(1).height = 26
  const sub = ws.getCell('A2')
  sub.value = [meta.company, 'Census people analytics'].filter(Boolean).join(' · ')
  sub.font = { size: 10, color: { argb: XL.muted } }

  const anyPay = figures.some((f) => f.columns.some((c) => c.pay))
  const changedDefs = definitionsLineFor(meta)
  const tabs = [...new Set(entries.flatMap((e) => (e.group ? [e.group.label] : [])))]
  const facts: [string, string][] = [
    ...(tabs.length ? ([['Tabs', tabs.join(', ')]] as [string, string][]) : []),
    // A view that reads no people data (AI in HR) has no scope, window, as-of date or data source.
    ...(hasDataContext(meta)
      ? ([
          ['Scope', meta.scope],
          ['Window', meta.window],
          ['As of', asOfLabel(meta.asOf)],
          ['Data', meta.isSample ? 'Sample data (fictional company)' : 'Uploaded data'],
        ] as [string, string][])
      : []),
    ...(meta.standard
      ? ([['Data standard', standardLine(meta.standard).replace(/^Data standard: /, '')]] as [
          string,
          string,
        ][])
      : []),
    ...(anyPay ? ([['Pay amounts', opts.showPay ? 'Included' : 'Left out']] as [string, string][]) : []),
    ...(meta.modeLine ? ([['Mode', meta.modeLine]] as [string, string][]) : []),
    // Someone changed a definition, target or setting: the numbers may not use the standard ones.
    ...(changedDefs
      ? ([['Definitions', changedDefs.replace(/^Definitions changed/, 'Changed')]] as [string, string][])
      : []),
    ['Exported', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })],
  ]
  let r = 4
  for (const [k, v] of facts) {
    const kc = ws.getCell(r, 1)
    kc.value = k
    kc.font = { size: 10, bold: true, color: { argb: XL.muted } }
    const vc = ws.getCell(r, 2)
    vc.value = v
    vc.font = { size: 10, color: { argb: XL.ink } }
    r++
  }

  r++
  listCols.forEach((col, i) => {
    const c = ws.getCell(r, i + 1)
    c.value = col.head
    c.font = { size: 10, bold: true, color: { argb: XL.ink } }
    c.border = { bottom: { style: 'thin', color: { argb: XL.ink } } }
    c.alignment = { horizontal: col.right ? 'right' : 'left' }
  })
  const colOf = (head: string) => listCols.findIndex((c) => c.head === head) + 1
  let row = r
  // A single section's export names it in the title already: no heading row then.
  const oneSection = !!onlySection(entries)
  entries.forEach((e, i) => {
    const f = e.figure
    row++
    // In a whole-view export, each tab's figures sit under a heading row with the tab label, and
    // a tab with sections (Special analyses) heads each section with its name and window.
    const heading = oneSection ? null : headingOf(e)
    if (heading && (i === 0 || headingKey(e) !== headingKey(entries[i - 1]))) {
      const g = ws.getCell(row, 2)
      g.value = heading
      g.font = { size: 10, bold: true, color: { argb: XL.ink } }
      g.alignment = { vertical: 'bottom' }
      ws.getRow(row).height = 20
      row++
    }
    ws.getCell(row, 1).value = i + 1
    ws.getCell(row, 1).alignment = { horizontal: 'left' }
    const link = ws.getCell(row, 2)
    link.value = { text: f.title, hyperlink: `#'${sheetNames[i].replace(/'/g, "''")}'!A1` }
    link.font = { size: 10, underline: true, color: { argb: XL.link } }
    if (tiered)
      ws.getCell(row, colOf('Tier')).value = f.tier
        ? `${TIER_LABEL[f.tier]}${f.withheld ? ', not shown' : ''}`
        : ''
    ws.getCell(row, colOf('What it shows')).value = f.subtitle ?? ''
    // A withheld figure exports its reason, not its rows.
    ws.getCell(row, colOf('Rows')).value = f.withheld ? null : f.rows.length
    ws.getCell(row, colOf('Rows')).numFmt = '#,##0'
    // A withheld figure's note could carry the numbers the standard hides.
    ws.getCell(row, colOf('Note')).value = exportNote(f) ?? ''
    listCols.forEach((col, j) => {
      const cell = ws.getCell(row, j + 1)
      if (j !== 1) cell.font = { size: 10, color: { argb: XL.ink2 } }
      cell.border = { bottom: { style: 'hair', color: { argb: XL.rule } } }
      cell.alignment = { ...cell.alignment, vertical: 'top', wrapText: !!col.wrap }
    })
  })
  const foot = ws.getCell(row + 2, 1)
  foot.value = stampLine(meta)
  foot.font = { size: 9, bold: true, color: { argb: XL.muted } }
}

/** Images for an export: none when switched off, the pre-captured ones, or captured now. */
async function exportImages(
  figures: readonly RegisteredFigure[],
  opts: ViewExportOptions & { images?: boolean },
): Promise<ReadonlyMap<string, RasterImage>> {
  if (opts.images === false) return new Map()
  return opts.captured ?? captureFigureImages(figures)
}

/** Build (without downloading) the view workbook: Summary plus a sheet per figure. */
export async function buildViewWorkbook(
  figures: ViewFigures,
  given: ExportMeta,
  opts: ViewExportOptions & { images?: boolean },
): Promise<Workbook> {
  const entries = viewEntries(figures)
  const meta = exportMeta(given, entries)
  const wb = await newWorkbook(meta, viewLine(meta) || 'Census')
  const names = uniqueSheetNames(['Summary', ...entries.map((e, i) => entrySheetName(e, i + 1))])
  wb.addWorksheet(names[0])
  const images = await exportImages(
    entries.map((e) => e.figure),
    opts,
  )

  for (const [i, e] of entries.entries()) {
    const f = e.figure
    const layout = addTableSheet(
      wb,
      names[i + 1],
      {
        name: f.title,
        title: f.title,
        subtitle: f.subtitle,
        note: exportNote(f),
        columns: f.columns,
        rows: f.rows,
        tier: f.tier,
        withheld: f.withheld,
      },
      entryMeta(meta, e),
      opts,
    )
    const img = images.get(f.id)
    if (img) {
      const id = wb.addImage({ base64: await pngDataUrl(img), extension: 'png' })
      const scale = Math.min(1, 760 / img.width)
      layout.ws.addImage(id, {
        tl: { col: layout.columnCount + 1, row: layout.headerRow - 1 },
        ext: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) },
      })
    }
  }
  writeSummary(wb, names[0], entries, names.slice(1), meta, opts)
  return wb
}

/**
 * One workbook for the view: Summary plus a sheet per figure (chart image beside its table).
 * With figures grouped by tab, sheet names start with the tab label.
 */
export async function exportViewWorkbook(
  figures: ViewFigures,
  meta: ExportMeta,
  opts: ViewExportOptions & { images?: boolean },
): Promise<void> {
  const wb = await buildViewWorkbook(figures, meta, opts)
  await saveWorkbook(wb, opts.fileName ?? viewStem(exportMeta(meta, viewEntries(figures))))
}

/* ───────── Deck ───────── */

const W = 13.333
const H = 7.5
const M = 0.6
const FONT = 'Archivo'
const C = {
  ink: '12151A',
  ink2: '475060',
  muted: '616A78',
  rule: 'DDE1E7',
  sheet2: 'F3F4F6',
  sheet3: 'E7E9ED',
}
const TABLE_ROWS = 14

type Slide = PptxGenJS.Slide

function footer(slide: Slide, pptx: PptxGenJS, left: string, right: string) {
  slide.addShape(pptx.ShapeType.line, {
    x: M,
    y: H - 0.62,
    w: W - 2 * M,
    h: 0,
    line: { color: C.rule, width: 0.75 },
  })
  if (left)
    slide.addText(left, {
      x: M,
      y: H - 0.55,
      w: (W - 2 * M) * 0.55,
      h: 0.3,
      fontFace: FONT,
      fontSize: 9,
      color: C.muted,
      margin: 0,
      valign: 'top',
      fit: 'shrink',
    })
  slide.addText(right, {
    x: M + (W - 2 * M) * 0.55,
    y: H - 0.55,
    w: (W - 2 * M) * 0.45,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    color: C.muted,
    align: 'right',
    margin: 0,
    valign: 'top',
  })
}

function titleSlide(pptx: PptxGenJS, meta: ExportMeta) {
  const s = pptx.addSlide()
  s.background = { color: 'FFFFFF' }
  s.addText('CENSUS  ·  PEOPLE ANALYTICS', {
    x: M,
    y: 0.55,
    w: 8,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10,
    bold: true,
    color: C.muted,
    charSpacing: 2,
    margin: 0,
  })
  s.addShape(pptx.ShapeType.line, { x: M, y: 1.0, w: W - 2 * M, h: 0, line: { color: C.ink, width: 1 } })
  s.addText(meta.view, {
    x: M,
    y: 2.2,
    w: W - 2 * M,
    h: 0.9,
    fontFace: FONT,
    fontSize: 40,
    bold: true,
    color: C.ink,
    margin: 0,
  })
  if (meta.tab)
    s.addText(meta.tab, {
      x: M,
      y: 3.1,
      w: W - 2 * M,
      h: 0.55,
      fontFace: FONT,
      fontSize: 22,
      color: C.ink2,
      margin: 0,
    })
  const context = [
    meta.scope,
    meta.window,
    meta.asOf ? `As of ${asOfLabel(meta.asOf)}` : '',
    meta.standard ? standardLine(meta.standard) : '',
    definitionsLineFor(meta) ?? '',
    meta.modeLine ?? '',
  ].filter(Boolean)
  if (context.length)
    s.addText(
      context.map((text, i) => ({ text, options: { breakLine: i < context.length - 1 } })),
      {
        x: M,
        y: 4.0,
        w: W - 2 * M,
        h: 1.45,
        fontFace: FONT,
        fontSize: 14,
        color: C.ink2,
        margin: 0,
        valign: 'top',
        paraSpaceAfter: 4,
      },
    )
  if (meta.company)
    s.addText(meta.company, {
      x: M,
      y: H - 1.05,
      w: 6,
      h: 0.3,
      fontFace: FONT,
      fontSize: 11,
      color: C.ink,
      bold: true,
      margin: 0,
    })
  if (meta.isSample) {
    s.addText('Sample data', {
      x: M,
      y: H - 0.68,
      w: 1.15,
      h: 0.28,
      fontFace: FONT,
      fontSize: 9,
      bold: true,
      color: C.ink2,
      fill: { color: C.sheet3 },
      align: 'center',
      valign: 'middle',
      margin: 0,
    })
  }
  s.addText('Company confidential', {
    x: W - M - 4,
    y: H - 0.68,
    w: 4,
    h: 0.28,
    fontFace: FONT,
    fontSize: 9,
    color: C.muted,
    align: 'right',
    margin: 0,
    valign: 'middle',
  })
}

/** Opens a tab in a whole-view deck: the view, the tab label and the figures that follow. */
function dividerSlide(pptx: PptxGenJS, meta: ExportMeta, group: FigureGroup, right: string) {
  const s = pptx.addSlide()
  s.background = { color: 'FFFFFF' }
  s.addText(meta.view.toUpperCase(), {
    x: M,
    y: 0.55,
    w: W - 2 * M,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10,
    bold: true,
    color: C.muted,
    charSpacing: 2,
    margin: 0,
  })
  s.addShape(pptx.ShapeType.line, { x: M, y: 1.0, w: W - 2 * M, h: 0, line: { color: C.ink, width: 1 } })
  s.addText(group.label, {
    x: M,
    y: 1.9,
    w: W - 2 * M,
    h: 0.8,
    fontFace: FONT,
    fontSize: 34,
    bold: true,
    color: C.ink,
    margin: 0,
    fit: 'shrink',
  })
  const LIST = 10
  const titles = group.figures.slice(0, LIST).map((f) => f.title)
  const more = group.figures.length - titles.length
  const lines = [...titles, ...(more > 0 ? [`and ${more} more`] : [])]
  s.addText(
    lines.map((text, i) => ({ text, options: { breakLine: i < lines.length - 1 } })),
    {
      x: M,
      y: 2.95,
      w: W - 2 * M,
      h: H - 0.85 - 2.95,
      fontFace: FONT,
      fontSize: 14,
      color: C.ink2,
      margin: 0,
      valign: 'top',
      paraSpaceAfter: 4,
      fit: 'shrink',
    },
  )
  footer(s, pptx, `${group.figures.length} ${group.figures.length === 1 ? 'figure' : 'figures'}`, right)
}

function figureHeader(slide: Slide, f: RegisteredFigure): number {
  slide.addText(f.title, {
    x: M,
    y: 0.42,
    w: W - 2 * M,
    h: 0.5,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: C.ink,
    margin: 0,
    valign: 'top',
    fit: 'shrink',
  })
  if (!f.subtitle) return 1.15
  slide.addText(f.subtitle, {
    x: M,
    y: 0.95,
    w: W - 2 * M,
    h: 0.45,
    fontFace: FONT,
    fontSize: 13,
    color: C.ink2,
    margin: 0,
    valign: 'top',
    fit: 'shrink',
  })
  return 1.55
}

function tableRows(
  f: RegisteredFigure,
  showPay: boolean,
): { rows: PptxGenJS.TableRow[]; widths: number[]; more: number } {
  const cols = visibleColumns(f.columns, showPay, 'slides')
  const samples = cols.map((c) => sampleValue(f.rows, c.key))
  const firsts = cols.map((c) => sampleRow(f.rows, c.key))
  const formats = cols.map((c, i) => columnFormat(c, samples[i], firsts[i]))
  const aligns = cols.map((c, i) => columnAlign(c, samples[i], firsts[i]))
  const text = (row: Record<string, unknown>, i: number) =>
    fmt(row[cols[i].key], cellFormat(cols[i], row, formats[i]))
  const shown = f.rows.slice(0, TABLE_ROWS)
  const head: PptxGenJS.TableRow = cols.map((c, i) => ({
    text: c.label,
    options: {
      bold: true,
      color: C.ink,
      fontSize: 10,
      align: aligns[i],
      border: [{ type: 'none' }, { type: 'none' }, { type: 'solid', color: C.ink, pt: 1 }, { type: 'none' }],
    },
  }))
  const body: PptxGenJS.TableRow[] = shown.map((row) =>
    cols.map((_, i) => ({
      text: text(row, i),
      options: {
        color: C.ink,
        fontSize: 10,
        align: aligns[i],
        border: [
          { type: 'none' },
          { type: 'none' },
          { type: 'solid', color: C.rule, pt: 0.5 },
          { type: 'none' },
        ],
      },
    })),
  )
  // Column widths in proportion to their longest text, within the slide's content width.
  const lens = cols.map((c, i) => Math.max(c.label.length, ...shown.map((r) => text(r, i).length), 4))
  const total = lens.reduce((a, b) => a + b, 0)
  const avail = W - 2 * M
  const widths = lens.map((l) => Math.max(0.7, (l / total) * avail))
  const sum = widths.reduce((a, b) => a + b, 0)
  return {
    rows: [head, ...body],
    widths: widths.map((w) => (w / sum) * avail),
    more: f.rows.length - shown.length,
  }
}

/**
 * The left footer of a figure slide: the data standard, the figure's tier, then its note (left
 * out when the standard withholds the figure, since notes carry its numbers).
 */
export function slideFootnote(
  f: Pick<RegisteredFigure, 'tier' | 'withheld' | 'note'>,
  standard?: DataStandard,
): string {
  const tier = f.tier
    ? `Tier: ${TIER_LABEL[f.tier]}${f.withheld ? ', not shown under this standard' : ''}`
    : ''
  const std = standard ? `${STANDARD_LABEL[standard]} standard` : ''
  return [std, tier, exportNote(f) ?? ''].filter(Boolean).join('  ·  ')
}

/** A figure the data standard holds back: the reason in place of the chart (rows hold it). */
function withheldBody(slide: Slide, f: RegisteredFigure, top: number) {
  const r = f.rows[0] ?? {}
  const lines = [String(r.status ?? 'Not shown under the data standard'), String(r.reason ?? '')].filter(
    Boolean,
  )
  slide.addText(
    lines.map((text, i) => ({
      text,
      options: { breakLine: i < lines.length - 1, bold: i === 0, color: i === 0 ? C.ink : C.ink2 },
    })),
    {
      x: M,
      y: top + 0.2,
      w: W - 2 * M,
      h: 1.6,
      fontFace: FONT,
      fontSize: 14,
      margin: 0.2,
      valign: 'top',
      fill: { color: C.sheet2 },
      paraSpaceAfter: 6,
    },
  )
}

/**
 * A 16:9 deck for the view: title slide, then a slide per figure. With figures grouped by tab,
 * each tab opens with a divider slide.
 */
export async function exportViewDeck(
  figures: ViewFigures,
  given: ExportMeta,
  opts: ViewExportOptions,
): Promise<void> {
  const entries = viewEntries(figures)
  const meta = exportMeta(given, entries)
  const [{ default: Pptx }, images] = await Promise.all([
    import('pptxgenjs'),
    exportImages(
      entries.map((e) => e.figure),
      opts,
    ),
  ])
  const pptx = new Pptx()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.theme = { headFontFace: FONT, bodyFontFace: 'Arial' }
  pptx.author = 'Census'
  pptx.company = meta.company
  pptx.title = viewLine(meta) || 'Census'
  pptx.subject = metaLine(meta)

  titleSlide(pptx, meta)
  const right = (m: ExportMeta, n: number) =>
    [viewLine(m), m.scope, m.asOf ? `As of ${asOfLabel(m.asOf)}` : '', String(n)]
      .filter(Boolean)
      .join('  ·  ')

  let slideNo = 1
  for (const [i, e] of entries.entries()) {
    const f = e.figure
    const m = entryMeta(meta, e)
    if (e.group && e.group !== entries[i - 1]?.group) dividerSlide(pptx, meta, e.group, right(m, ++slideNo))
    const s = pptx.addSlide()
    s.background = { color: 'FFFFFF' }
    const top = figureHeader(s, f)
    const boxW = W - 2 * M
    const boxH = H - 0.85 - top
    const img = f.withheld ? undefined : images.get(f.id)
    if (f.withheld) withheldBody(s, f, top)
    else if (img) {
      const inW = img.width / 96
      const inH = img.height / 96
      const k = Math.min(boxW / inW, boxH / inH, 2)
      s.addImage({ data: await pngDataUrl(img), x: M, y: top, w: inW * k, h: inH * k, altText: f.title })
    } else if (f.rows.length) {
      const { rows, widths, more } = tableRows(f, opts.showPay)
      s.addTable(rows, {
        x: M,
        y: top,
        w: boxW,
        colW: widths,
        fontFace: FONT,
        rowH: 0.3,
        valign: 'middle',
        margin: [0.04, 0.08, 0.04, 0.08],
        autoPage: false,
      })
      if (more > 0)
        s.addText(`And ${more.toLocaleString('en-US')} more rows in the Excel export.`, {
          x: M,
          y: Math.min(H - 1.15, top + 0.3 * (rows.length + 0.4)),
          w: boxW,
          h: 0.3,
          fontFace: FONT,
          fontSize: 10,
          color: C.muted,
          margin: 0,
        })
    } else {
      s.addText('No rows for this figure in the current scope.', {
        x: M,
        y: top,
        w: boxW,
        h: 0.4,
        fontFace: FONT,
        fontSize: 12,
        color: C.muted,
        margin: 0,
      })
    }
    footer(s, pptx, slideFootnote(f, meta.standard), right(m, ++slideNo))
    const notes = [f.subtitle, exportNote(f)].filter(Boolean).join('\n')
    if (notes) s.addNotes(notes)
  }

  const blob = (await pptx.write({ outputType: 'blob' })) as Blob
  downloadBlob(new Blob([blob], { type: MIME.pptx }), `${opts.fileName ?? viewStem(meta)}.pptx`)
}
