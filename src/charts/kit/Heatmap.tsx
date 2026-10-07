/**
 * A grid of values: rows by columns, colored on the sequential ramp (magnitude) or the
 * diverging ramp around a midpoint (polarity), with values printed in the cells when they fit,
 * in whichever ink reads on the cell. Cells are separated by the 2px sheet gap; hidden values
 * (small groups) show as a quiet "—" cell.
 */
import * as Plot from '@observablehq/plot'
import { DASH, type Format, fmt } from '@/lib/format'
import { divergingScale, inkOn, seqStops, sequentialScale } from '../core/color'
import type { LegendSpec } from '../core/legend'
import { bandLabel, bandLabelLines, HOVER_CLASS, labelsMark, scalePos } from '../core/marks'
import { maxTextWidth, textWidth, truncateText } from '../core/measure'
import type { TipContent } from '../core/tooltip'
import {
  axisX,
  housePlot,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  plotBand,
  plotPos,
} from '../plot'
import type { ChartTheme } from '../theme'
import { useChartTheme } from '../theme'
import { extent } from './scale'
import { type ChartBaseProps, gateOf, HIDDEN_NOTE, type Key, numAt, orderedKeys, textAt } from './shared'

export interface HeatmapProps<T extends object> extends ChartBaseProps<T> {
  data: readonly T[]
  x: Key<T>
  y: Key<T>
  value: Key<T>
  format?: Format
  scheme?: 'sequential' | 'diverging'
  xOrder?: readonly string[]
  yOrder?: readonly string[]
  /** Print values in cells where they fit (default true). */
  showValues?: boolean
  /** Color domain; diverging domains are made symmetric around `mid`. */
  domain?: [number, number]
  /** Diverging midpoint (default 0). */
  mid?: number
  /** Group size shown in the tooltip ("n = 42"). */
  n?: Key<T>
  /** A second tooltip line for a cell, e.g. "8 started of 12 planned". */
  detail?: (d: T) => string | null | undefined
  /**
   * The text printed in a cell when it is not the colored value, e.g. a count in a grid colored by
   * row share. The tooltip keeps both.
   */
  cellText?: (d: T) => string
  rowHeight?: number
}

interface Cell<T> {
  x: string
  y: string
  value: number | null
  n: number | null
  datum: T
}

function colorDomain(
  values: (number | null)[],
  scheme: 'sequential' | 'diverging',
  mid: number,
  domain?: [number, number],
): [number, number] {
  const ext = domain ?? extent(values) ?? [0, 1]
  if (scheme === 'sequential') return ext[0] === ext[1] ? [ext[0], ext[0] + 1] : ext
  const m = Math.max(Math.abs(ext[0] - mid), Math.abs(ext[1] - mid)) || 1
  return [mid - m, mid + m]
}

export function Heatmap<T extends object>({
  data,
  x,
  y,
  value,
  format = 'pct',
  scheme = 'sequential',
  xOrder,
  yOrder,
  showValues = true,
  domain,
  mid = 0,
  n,
  detail,
  cellText,
  rowHeight = 30,
  onSelect,
  selectable,
  lockedNote,
  ariaLabel,
}: HeatmapProps<T>) {
  const cells: Cell<T>[] = data.map((d) => ({
    x: textAt(d, x),
    y: textAt(d, y),
    value: numAt(d, value),
    n: n ? numAt(d, n) : null,
    datum: d,
  }))
  const xs = orderedKeys(
    cells.map((c) => c.x),
    xOrder,
  )
  const ys = orderedKeys(
    cells.map((c) => c.y),
    yOrder,
  )
  const [lo, hi] = colorDomain(
    cells.map((c) => c.value),
    scheme,
    mid,
    domain,
  )
  // Cells larger than 48 x 48px stop the ramp at --seq-600, so one big cell never outweighs the page.
  const BIG = 48
  const capped = (cellW: number) => cellW > BIG && rowHeight > BIG
  const colorFor = (t: ChartTheme, cellW = 0) =>
    scheme === 'diverging'
      ? divergingScale(t, lo, mid, hi)
      : sequentialScale(t, lo, hi, capped(cellW) ? 600 : 700)

  const theme = useChartTheme()
  // A ramp with nothing on it would label made-up end values: no legend when every cell is hidden.
  const legend: LegendSpec | null = cells.some((c) => c.value != null)
    ? {
        kind: 'ramp',
        colors: scheme === 'diverging' ? theme.div : seqStops(theme, rowHeight > BIG ? 600 : 700),
        labels:
          scheme === 'diverging'
            ? [fmt(lo, format), fmt(mid, format), fmt(hi, format)]
            : [fmt(lo, format), fmt(hi, format)],
      }
    : null
  const marginTopFlat = 22

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!cells.length) return null
    const labelMax = Math.max(60, width * 0.3)
    // A row label that would be cut breaks onto two lines instead (rows of 26px or more).
    const band = bandLabelLines(ys, labelMax, rowHeight)
    const marginLeft = Math.ceil(band.width) + 12
    const cols = Math.max(1, xs.length)
    const xWidest = maxTextWidth(xs, 11)
    const rotate = xWidest > (width - marginLeft - 4) / cols - 6
    const xLabelW = Math.min(120, xWidest)
    const rad = (40 * Math.PI) / 180
    // Rotated labels lean right from their cell centers: reserve room so the last ones end inside
    // the chart (label i reaches cos 40° x its width past its center, n - i - 1/2 cells from the edge).
    let marginRight = 4
    if (rotate) {
      const reach = xs.map((k) => Math.cos(rad) * textWidth(truncateText(k, xLabelW, 11), 11))
      for (let pass = 0; pass < 3; pass++) {
        const cell = (width - marginLeft - marginRight) / cols
        const need = Math.max(...reach.map((r, i) => r - (cols - i - 0.5) * cell)) + 4
        marginRight = Math.max(4, Math.min(Math.ceil(need), Math.floor(width * 0.4)))
      }
    }
    const cellW = (width - marginLeft - marginRight) / cols
    const color = colorFor(t, cellW)
    const marginTop = rotate ? Math.ceil(Math.sin(rad) * xLabelW + 18) : marginTopFlat
    const height = marginTop + ys.length * rowHeight + 2

    const fillOf = (c: Cell<T>) => (c.value == null ? t.sheet2 : color(c.value))
    const marks: Plot.Markish[] = [
      Plot.cell(cells, { x: (c) => c.x, y: (c) => c.y, fill: fillOf, inset: 1, r: 2 }),
      Plot.cell(
        cells,
        Plot.pointer({
          x: (c: Cell<T>) => c.x,
          y: (c: Cell<T>) => c.y,
          fill: 'none',
          stroke: t.ink,
          strokeWidth: 1.5,
          inset: 0.75,
          r: 3,
          maxRadius: Math.max(cellW, rowHeight),
          className: HOVER_CLASS,
        }),
      ),
      labelsMark(
        (scales, dims) =>
          ys.flatMap((k, i) =>
            bandLabel(k, band.lines[i], dims.marginLeft - 10, scalePos(scales, 'y', k), t.ink2),
          ),
        'row labels',
      ),
    ]
    if (showValues && rowHeight >= 18) {
      marks.push(
        labelsMark(
          (scales) =>
            cells.flatMap((c) => {
              const text = c.value == null ? DASH : (cellText?.(c.datum) ?? fmt(c.value, format))
              if (textWidth(text, 11, 500) > cellW - 8) return []
              return [
                {
                  x: scalePos(scales, 'x', c.x),
                  y: scalePos(scales, 'y', c.y),
                  anchor: 'middle' as const,
                  parts: [
                    { text, color: c.value == null ? t.muted : inkOn(t, fillOf(c)), size: 11, weight: 500 },
                  ],
                },
              ]
            }),
          'values',
        ),
      )
    }
    // Rotated labels closer than 18px apart (12 months on a phone) label every other column; the
    // tooltip names each one.
    const every = rotate && cellW * Math.sin(rad) < 18 ? 2 : 1
    marks.push(
      axisX(t, {
        anchor: 'top',
        tickRotate: rotate ? -40 : 0,
        tickFormat: (k: string) => (xs.indexOf(k) % every ? '' : rotate ? truncateText(k, xLabelW, 11) : k),
      }),
    )
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop,
        marginRight,
        marginBottom: 2,
        marginLeft,
        x: { type: 'band', domain: xs, padding: 0, round: false },
        y: { type: 'band', domain: ys, padding: 0, round: false, axis: null },
        marks,
      },
    )
  }

  // A hidden cell never opens; the view's gate decides the rest.
  const open = gateOf<Cell<T>>((c) => c.value != null, selectable ? (c) => selectable(c.datum) : undefined)
  const tip = (c: Cell<T>): TipContent => {
    const more = c.value != null ? detail?.(c.datum) : null
    return {
      title: `${c.y} · ${c.x}`,
      rows: [
        { value: fmt(c.value, format), label: c.n != null ? `n = ${fmt(c.n, 'int')}` : undefined },
        ...(more ? [{ value: more, strong: false }] : []),
      ],
      // Read aloud value first: "3 Meets · 4 Exceeds. 23.4%, n = 117".
      spoken: `${c.y} · ${c.x}. ${fmt(c.value, format)}${c.n != null ? `, n = ${fmt(c.n, 'int')}` : ''}${more ? `. ${more}` : ''}`,
      note:
        c.value == null
          ? HIDDEN_NOTE
          : onSelect && !open(c)
            ? (lockedNote?.(c.datum) ?? undefined)
            : undefined,
    }
  }

  // Keyboard: row by row (Up and Down between rows), left to right within a row.
  const keyPoints = (plot: PlotElement) => {
    const w = plotBand(plot, 'x')
    const h = plotBand(plot, 'y')
    return ys.flatMap((yk) =>
      cells
        .filter((c) => c.y === yk)
        .sort((a, b) => xs.indexOf(a.x) - xs.indexOf(b.x))
        .map((c) => ({
          datum: c,
          x: plotPos(plot, 'x', c.x),
          y: plotPos(plot, 'y', c.y),
          w: w - 2,
          h: h - 2,
          group: yk,
        })),
    )
  }

  return (
    <PlotChart<Cell<T>>
      keyPoints={keyPoints}
      build={build}
      height={marginTopFlat + ys.length * rowHeight + 2}
      legend={legend}
      tip={tip}
      selectable={open}
      onSelect={onSelect ? (c) => onSelect(c.datum) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
