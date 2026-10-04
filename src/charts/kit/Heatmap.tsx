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
import { HOVER_CLASS, labelsMark, scalePos } from '../core/marks'
import { maxTextWidth, textWidth, truncateText } from '../core/measure'
import type { TipContent } from '../core/tooltip'
import { axisX, housePlot, type PlotBuildContext, PlotChart } from '../plot'
import type { ChartTheme } from '../theme'
import { useChartTheme } from '../theme'
import { extent } from './scale'
import { type ChartBaseProps, HIDDEN_NOTE, type Key, numAt, orderedKeys, textAt } from './shared'

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
  rowHeight = 30,
  onSelect,
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
  const colorFor = (t: ChartTheme) =>
    scheme === 'diverging' ? divergingScale(t, lo, mid, hi) : sequentialScale(t, lo, hi)

  const theme = useChartTheme()
  const legend: LegendSpec = {
    kind: 'ramp',
    colors: scheme === 'diverging' ? theme.div : seqStops(theme),
    labels:
      scheme === 'diverging'
        ? [fmt(lo, format), fmt(mid, format), fmt(hi, format)]
        : [fmt(lo, format), fmt(hi, format)],
  }
  const marginTopFlat = 22

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!cells.length) return null
    const color = colorFor(t)
    const labelMax = Math.max(60, width * 0.3)
    const yShown = ys.map((k) => truncateText(k, labelMax, 12))
    const marginLeft = Math.ceil(maxTextWidth(yShown, 12)) + 12
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
          ys.map((k, i) => ({
            x: dims.marginLeft - 10,
            y: scalePos(scales, 'y', k),
            anchor: 'end' as const,
            parts: [{ text: yShown[i], color: t.ink2, size: 12 }],
            title: yShown[i] === k ? undefined : k,
          })),
        'row labels',
      ),
    ]
    if (showValues && rowHeight >= 18) {
      marks.push(
        labelsMark(
          (scales) =>
            cells.flatMap((c) => {
              const text = c.value == null ? DASH : fmt(c.value, format)
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
    marks.push(
      axisX(t, {
        anchor: 'top',
        tickRotate: rotate ? -40 : 0,
        tickFormat: (k: string) => (rotate ? truncateText(k, xLabelW, 11) : k),
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

  const tip = (c: Cell<T>): TipContent => ({
    title: `${c.y} · ${c.x}`,
    rows: [{ value: fmt(c.value, format), label: c.n != null ? `n = ${fmt(c.n, 'int')}` : undefined }],
    note: c.value == null ? HIDDEN_NOTE : undefined,
  })

  return (
    <PlotChart<Cell<T>>
      build={build}
      height={marginTopFlat + ys.length * rowHeight + 2}
      legend={legend}
      tip={tip}
      onSelect={onSelect ? (c) => onSelect(c.datum) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
