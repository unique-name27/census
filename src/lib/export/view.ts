/**
 * Whole-view exports built from the figure registry (exactly the figures on screen, in order):
 *
 * - exportViewWorkbook: a Summary sheet (view, scope, window, as-of and a linked list of figures)
 *   plus one styled sheet per figure, each with its chart embedded beside the table.
 * - exportViewDeck: a 16:9 PowerPoint deck in the Census style (ink on white, Archivo): a title
 *   slide, then one slide per figure with the chart as a crisp 2x image, or a native table for
 *   table-only figures.
 *
 * Images are captured in the light theme so they sit on white slides and sheets.
 */
import type { Workbook } from 'exceljs'
import type PptxGenJS from 'pptxgenjs'
import type { ExportMeta, RegisteredFigure } from '@/charts/types'
import { fmt } from '@/lib/format'
import { cellFormat, columnAlign, columnFormat, sampleRow, sampleValue, visibleColumns } from './columns'
import { downloadBlob, MIME } from './download'
import { pngDataUrl, type RasterImage, svgToPng, withLightTheme } from './image'
import { asOfLabel, fileStem, metaLine, stampLine, viewLine } from './names'
import { addTableSheet, newWorkbook, saveWorkbook, uniqueSheetNames, XL } from './xlsx'

export interface ViewExportOptions {
  showPay: boolean
  /** File name without extension; defaults to census-<view>-<tab>-<as-of>. */
  fileName?: string
}

const viewStem = (meta: ExportMeta) => fileStem(meta, meta.tab ?? '')

async function captureImages(figures: readonly RegisteredFigure[]): Promise<Map<string, RasterImage>> {
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
  figures: readonly RegisteredFigure[],
  sheetNames: string[],
  meta: ExportMeta,
  opts: ViewExportOptions,
) {
  const ws = wb.getWorksheet(sheetName)
  if (!ws) return
  ws.views = [{ showGridLines: false }]
  ws.getColumn(1).width = 16
  ws.getColumn(2).width = 46
  ws.getColumn(3).width = 64
  ws.getColumn(4).width = 9
  ws.getColumn(5).width = 40

  const title = ws.getCell('A1')
  title.value = viewLine(meta) || 'Census'
  title.font = { size: 18, bold: true, color: { argb: XL.ink } }
  ws.getRow(1).height = 26
  const sub = ws.getCell('A2')
  sub.value = [meta.company, 'Census people analytics'].filter(Boolean).join(' · ')
  sub.font = { size: 10, color: { argb: XL.muted } }

  const anyPay = figures.some((f) => f.columns.some((c) => c.pay))
  const facts: [string, string][] = [
    ['Scope', meta.scope],
    ['Window', meta.window],
    ['As of', asOfLabel(meta.asOf)],
    ['Data', meta.isSample ? 'Sample data (fictional company)' : 'Uploaded data'],
    ...(anyPay ? ([['Pay amounts', opts.showPay ? 'Included' : 'Left out']] as [string, string][]) : []),
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
  const head = ['#', 'Figure', 'What it shows', 'Rows', 'Note']
  head.forEach((h, i) => {
    const c = ws.getCell(r, i + 1)
    c.value = h
    c.font = { size: 10, bold: true, color: { argb: XL.ink } }
    c.border = { bottom: { style: 'thin', color: { argb: XL.ink } } }
    c.alignment = { horizontal: i === 3 ? 'right' : 'left' }
  })
  figures.forEach((f, i) => {
    const row = r + 1 + i
    ws.getCell(row, 1).value = i + 1
    ws.getCell(row, 1).alignment = { horizontal: 'left' }
    const link = ws.getCell(row, 2)
    link.value = { text: f.title, hyperlink: `#'${sheetNames[i].replace(/'/g, "''")}'!A1` }
    link.font = { size: 10, underline: true, color: { argb: XL.link } }
    ws.getCell(row, 3).value = f.subtitle ?? ''
    ws.getCell(row, 4).value = f.rows.length
    ws.getCell(row, 4).numFmt = '#,##0'
    ws.getCell(row, 5).value = f.note ?? ''
    for (const col of [1, 3, 4, 5]) ws.getCell(row, col).font = { size: 10, color: { argb: XL.ink2 } }
    for (let col = 1; col <= 5; col++) {
      ws.getCell(row, col).border = { bottom: { style: 'hair', color: { argb: XL.rule } } }
      ws.getCell(row, col).alignment = {
        ...ws.getCell(row, col).alignment,
        vertical: 'top',
        wrapText: col === 3 || col === 5,
      }
    }
  })
  const foot = ws.getCell(r + figures.length + 2, 1)
  foot.value = stampLine(meta)
  foot.font = { size: 9, bold: true, color: { argb: XL.muted } }
}

/** One workbook for the view: Summary plus a sheet per figure (chart image beside its table). */
export async function exportViewWorkbook(
  figures: readonly RegisteredFigure[],
  meta: ExportMeta,
  opts: ViewExportOptions & { images?: boolean },
): Promise<void> {
  const wb = await newWorkbook(meta, viewLine(meta) || 'Census')
  const names = uniqueSheetNames(['Summary', ...figures.map((f) => f.title)])
  wb.addWorksheet(names[0])
  const images = opts.images === false ? new Map<string, RasterImage>() : await captureImages(figures)

  for (const [i, f] of figures.entries()) {
    const layout = addTableSheet(
      wb,
      names[i + 1],
      { name: f.title, title: f.title, subtitle: f.subtitle, note: f.note, columns: f.columns, rows: f.rows },
      meta,
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
  writeSummary(wb, names[0], figures, names.slice(1), meta, opts)
  await saveWorkbook(wb, opts.fileName ?? viewStem(meta))
}

/* ───────── Deck ───────── */

const W = 13.333
const H = 7.5
const M = 0.6
const FONT = 'Archivo'
const C = {
  ink: '12151A',
  ink2: '475060',
  muted: '737B8A',
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
  s.addText(
    [
      { text: meta.scope, options: { breakLine: true } },
      { text: meta.window, options: { breakLine: true } },
      { text: `As of ${asOfLabel(meta.asOf)}` },
    ],
    {
      x: M,
      y: 4.0,
      w: W - 2 * M,
      h: 1.1,
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
  const cols = visibleColumns(f.columns, showPay)
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

/** A 16:9 deck for the view: title slide, then a slide per figure. */
export async function exportViewDeck(
  figures: readonly RegisteredFigure[],
  meta: ExportMeta,
  opts: ViewExportOptions,
): Promise<void> {
  const [{ default: Pptx }, images] = await Promise.all([import('pptxgenjs'), captureImages(figures)])
  const pptx = new Pptx()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.theme = { headFontFace: FONT, bodyFontFace: 'Arial' }
  pptx.author = 'Census'
  pptx.company = meta.company
  pptx.title = viewLine(meta) || 'Census'
  pptx.subject = metaLine(meta)

  titleSlide(pptx, meta)
  const right = (n: number) =>
    `${viewLine(meta)}  ·  ${meta.scope}  ·  As of ${asOfLabel(meta.asOf)}  ·  ${n}`

  for (const [i, f] of figures.entries()) {
    const s = pptx.addSlide()
    s.background = { color: 'FFFFFF' }
    const top = figureHeader(s, f)
    const boxW = W - 2 * M
    const boxH = H - 0.85 - top
    const img = images.get(f.id)
    if (img) {
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
    footer(s, pptx, f.note ?? '', right(i + 2))
    const notes = [f.subtitle, f.note].filter(Boolean).join('\n')
    if (notes) s.addNotes(notes)
  }

  const blob = (await pptx.write({ outputType: 'blob' })) as Blob
  downloadBlob(new Blob([blob], { type: MIME.pptx }), `${opts.fileName ?? viewStem(meta)}.pptx`)
}
