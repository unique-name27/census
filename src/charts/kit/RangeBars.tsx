/**
 * Ranges with markers, one row per category. Range mode: a light track from min to max with an
 * ink tick at the midpoint and value dots (e.g. salary range, midpoint and median pay). Quartile
 * mode (q1 and q3 given): a thin whisker from min to max, a box from q1 to q3 and a median tick.
 */
import * as Plot from '@observablehq/plot'
import { type Format, fmt } from '@/lib/format'
import type { LegendSpec } from '../core/legend'
import { hoverBand, labelsMark, scalePos } from '../core/marks'
import { maxTextWidth, truncateText } from '../core/measure'
import type { TipContent, TipRow } from '../core/tooltip'
import { axisX, gridX, housePlot, type PlotBuildContext, PlotChart } from '../plot'
import { seriesColor, useChartTheme } from '../theme'
import { extent, numericAxis } from './scale'
import { type ChartBaseProps, type Key, numAt, textAt } from './shared'

export interface RangeMarker<T> {
  key: Key<T>
  label: string
}

export interface RangeBarsProps<T extends object> extends ChartBaseProps<T> {
  data: readonly T[]
  /** Category property (rows, in data order). */
  y: Key<T>
  min: Key<T>
  max: Key<T>
  /** Midpoint (range mode) or median (quartile mode) tick. */
  mid?: Key<T>
  /** One value dot; use `markers` for several (they get a legend). */
  value?: Key<T>
  markers?: readonly RangeMarker<T>[]
  q1?: Key<T>
  q3?: Key<T>
  format?: Format
  /** Names used in the tooltip. */
  labels?: { min?: string; max?: string; mid?: string; value?: string }
  xDomain?: [number, number]
  rowHeight?: number
}

interface Row<T> {
  key: string
  label: string
  min: number | null
  max: number | null
  mid: number | null
  q1: number | null
  q3: number | null
  marks: (number | null)[]
  datum: T
}

export function RangeBars<T extends object>({
  data,
  y,
  min,
  max,
  mid,
  value,
  markers,
  q1,
  q3,
  format = 'money',
  labels,
  xDomain,
  rowHeight = 32,
  onSelect,
  ariaLabel,
}: RangeBarsProps<T>) {
  const quartiles = !!q1 && !!q3
  const markerDefs: RangeMarker<T>[] =
    markers?.slice() ?? (value ? [{ key: value, label: labels?.value ?? 'Value' }] : [])
  const rows: Row<T>[] = data.map((d, i) => ({
    key: `r${i}`,
    label: textAt(d, y),
    min: numAt(d, min),
    max: numAt(d, max),
    mid: mid ? numAt(d, mid) : null,
    q1: q1 ? numAt(d, q1) : null,
    q3: q3 ? numAt(d, q3) : null,
    marks: markerDefs.map((m) => numAt(d, m.key)),
    datum: d,
  }))
  const height = 6 + rows.length * rowHeight + 26
  const midName = labels?.mid ?? (quartiles ? 'Median' : 'Midpoint')

  const theme = useChartTheme()
  const markerColor = (i: number) => seriesColor(theme, i)
  const legend: LegendSpec | null =
    markerDefs.length > 1 || quartiles
      ? {
          kind: 'swatch',
          items: [
            {
              label: quartiles ? 'Middle 50%' : 'Range',
              color: quartiles ? theme.seq[200] : theme.seq[100],
              shape: 'rect',
            },
            ...(mid ? [{ label: midName, color: theme.ink, shape: 'line' as const }] : []),
            ...markerDefs.map((m, i) => ({ label: m.label, color: markerColor(i), shape: 'dot' as const })),
          ],
        }
      : null

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!rows.length) return null
    const labelMax = Math.max(48, width * 0.3)
    const shown = rows.map((r) => truncateText(r.label, labelMax, 12))
    const marginLeft = Math.ceil(maxTextWidth(shown, 12)) + 14
    const marginRight = 16
    const ext = extent(rows.flatMap((r) => [r.min, r.max, r.mid, r.q1, r.q3, ...r.marks]))
    const axis = numericAxis(
      ext?.[0] ?? 0,
      ext?.[1] ?? 1,
      format,
      Math.max(3, Math.floor((width - marginLeft - marginRight) / 90)),
      xDomain,
    )
    const ranged = rows.filter((r) => r.min != null && r.max != null)
    const inset = (thickness: number) => Math.max(0, (rowHeight - thickness) / 2)
    const marks: Plot.Markish[] = [
      gridX(t, { ticks: axis.ticks }),
      hoverBand(rows, { axis: 'y', value: (r) => r.key, color: t.ink }),
    ]
    if (quartiles) {
      marks.push(
        Plot.ruleY(ranged, {
          y: (r) => r.key,
          x1: (r) => r.min,
          x2: (r) => r.max,
          stroke: t.ink2,
          strokeWidth: 1,
        }),
        Plot.barX(
          rows.filter((r) => r.q1 != null && r.q3 != null),
          {
            y: (r) => r.key,
            x1: (r) => r.q1,
            x2: (r) => r.q3,
            fill: t.seq[200],
            insetTop: inset(14),
            insetBottom: inset(14),
            r: 2,
          },
        ),
      )
    } else {
      marks.push(
        Plot.barX(ranged, {
          y: (r) => r.key,
          x1: (r) => r.min,
          x2: (r) => r.max,
          fill: t.seq[100],
          insetTop: inset(10),
          insetBottom: inset(10),
          r: 3,
        }),
      )
    }
    if (mid) {
      marks.push(
        Plot.tickX(
          rows.filter((r) => r.mid != null),
          {
            y: (r) => r.key,
            x: (r) => r.mid,
            stroke: t.ink,
            strokeWidth: 2,
            insetTop: inset(16),
            insetBottom: inset(16),
          },
        ),
      )
    }
    markerDefs.forEach((_, i) => {
      marks.push(
        Plot.dot(
          rows.filter((r) => r.marks[i] != null),
          {
            y: (r) => r.key,
            x: (r) => r.marks[i],
            r: 4.5,
            fill: seriesColor(t, i),
            stroke: t.sheet,
            strokeWidth: 2,
          },
        ),
      )
    })
    marks.push(
      labelsMark(
        (scales, dims) =>
          rows.map((r, i) => ({
            x: dims.marginLeft - 10,
            y: scalePos(scales, 'y', r.key),
            anchor: 'end' as const,
            parts: [{ text: shown[i], color: t.ink2, size: 12 }],
            title: shown[i] === r.label ? undefined : r.label,
          })),
        'category labels',
      ),
      axisX(t, { ticks: axis.ticks, tickFormat: axis.format }),
    )
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop: 6,
        marginRight,
        marginBottom: 26,
        marginLeft,
        x: { domain: axis.domain },
        y: { type: 'band', domain: rows.map((r) => r.key), padding: 0, round: false, axis: null },
        marks,
      },
    )
  }

  const tip = (r: Row<T>): TipContent => {
    const out: TipRow[] = [
      { value: fmt(r.min, format), label: labels?.min ?? 'Minimum', strong: false },
      ...(quartiles ? [{ value: fmt(r.q1, format), label: '25th percentile', strong: false }] : []),
      ...(mid ? [{ value: fmt(r.mid, format), label: midName }] : []),
      ...(quartiles ? [{ value: fmt(r.q3, format), label: '75th percentile', strong: false }] : []),
      { value: fmt(r.max, format), label: labels?.max ?? 'Maximum', strong: false },
      ...markerDefs.map((m, i) => ({
        value: fmt(r.marks[i], format),
        label: m.label,
        color: markerColor(i),
        shape: 'dot' as const,
      })),
    ]
    return { title: r.label, rows: out }
  }

  return (
    <PlotChart<Row<T>>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      onSelect={onSelect ? (r) => onSelect(r.datum) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
