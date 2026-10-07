/**
 * One dot per item along a value axis, one row per group (e.g. compa-ratio of every employee by
 * level). Dots are spread vertically by a stable hash of their id so the same person never moves
 * between renders; an optional ink tick marks each row's median.
 */
import * as Plot from '@observablehq/plot'
import { type Format, fmt } from '@/lib/format'
import { median } from '@/lib/stats'
import { toneColor } from '../core/color'
import { HOVER_CLASS, labelsMark, refRule } from '../core/marks'
import { maxTextWidth, truncateText } from '../core/measure'
import type { TipContent } from '../core/tooltip'
import { axisX, gridX, housePlot, type PlotBuildContext, PlotChart, type PlotElement, plotPos } from '../plot'
import { jitter } from './prepare'
import { extent, numericAxis } from './scale'
import { type ChartBaseProps, type Key, numAt, orderedKeys, type RefLine, type Tone, textAt } from './shared'

export interface DotStripProps<T extends object> extends ChartBaseProps<T> {
  data: readonly T[]
  /** Value property (horizontal position). */
  x: Key<T>
  /** Group property (rows). */
  y: Key<T>
  /** Stable id for the jitter (default: row index). */
  id?: Key<T>
  /** Tooltip title, e.g. the person's name or ID. */
  label?: Key<T>
  tone?: (d: T) => Tone
  xFormat?: Format
  yOrder?: readonly string[]
  ref?: RefLine
  /** Ink tick at each row's median. */
  median?: boolean
  xDomain?: [number, number]
  rowHeight?: number
}

interface Dot<T> {
  x: number
  row: number
  y: number
  group: string
  tone: Tone
  label: string
  datum: T
}

export function DotStrip<T extends object>({
  data,
  x,
  y,
  id,
  label,
  tone,
  xFormat = 'num2',
  yOrder,
  ref: refLine,
  median: showMedian = false,
  xDomain,
  rowHeight = 36,
  onSelect,
  ariaLabel,
}: DotStripProps<T>) {
  const groups = orderedKeys(
    data.map((d) => textAt(d, y)),
    yOrder,
  )
  const rowOf = new Map(groups.map((g, i) => [g, i]))
  const dots: Dot<T>[] = data.flatMap((d, i) => {
    const v = numAt(d, x)
    const group = textAt(d, y)
    const row = rowOf.get(group)
    if (v == null || row === undefined) return []
    const key = id ? textAt(d, id) : `${group}|${i}`
    return [
      {
        x: v,
        row,
        y: row + jitter(key) * 0.27,
        group,
        tone: tone?.(d) ?? 'default',
        label: label ? textAt(d, label) : '',
        datum: d,
      },
    ]
  })
  const medians = groups.flatMap((_, row) => {
    const m = median(dots.filter((d) => d.row === row).map((d) => d.x))
    return m == null ? [] : [{ row, m }]
  })
  const marginTop = refLine ? 22 : 6
  const height = marginTop + groups.length * rowHeight + 26

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!dots.length) return null
    const labelMax = Math.max(48, width * 0.3)
    const shown = groups.map((g) => truncateText(g, labelMax, 12))
    const marginLeft = Math.ceil(maxTextWidth(shown, 12)) + 14
    const marginRight = 12
    const ext = extent([...dots.map((d) => d.x), refLine?.value])
    const axis = numericAxis(
      ext?.[0] ?? 0,
      ext?.[1] ?? 1,
      xFormat,
      Math.max(3, Math.floor((width - marginLeft - marginRight) / 80)),
      xDomain,
    )
    const marks: Plot.Markish[] = [
      gridX(t, { ticks: axis.ticks }),
      Plot.ruleY(
        groups.slice(1).map((_, i) => i + 0.5),
        { stroke: t.rule, strokeWidth: 1 },
      ),
      ...(refLine ? refRule(refLine, 'x', t) : []),
      Plot.dot(dots, {
        x: (d) => d.x,
        y: (d) => d.y,
        r: 4,
        fill: (d) => toneColor(t, d.tone),
        fillOpacity: 0.85,
        stroke: t.sheet,
        strokeWidth: 1.5,
      }),
    ]
    if (showMedian) {
      marks.push(
        Plot.ruleX(medians, {
          x: (m) => m.m,
          y1: (m) => m.row - 0.36,
          y2: (m) => m.row + 0.36,
          stroke: t.ink,
          strokeWidth: 2,
        }),
      )
    }
    marks.push(
      Plot.dot(
        dots,
        Plot.pointer({
          x: (d: Dot<T>) => d.x,
          y: (d: Dot<T>) => d.y,
          r: 7,
          fill: 'none',
          stroke: t.ink,
          strokeWidth: 1.5,
          maxRadius: 16,
          className: HOVER_CLASS,
        }),
      ),
      labelsMark(
        (scales, dims) =>
          groups.map((g, i) => ({
            x: dims.marginLeft - 10,
            y: Number(scales.y?.(i)),
            anchor: 'end' as const,
            parts: [{ text: shown[i], color: t.ink2, size: 12 }],
            title: shown[i] === g ? undefined : g,
          })),
        'group labels',
      ),
      axisX(t, { ticks: axis.ticks, tickFormat: axis.format }),
    )
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop,
        marginRight,
        marginBottom: 26,
        marginLeft,
        x: { domain: axis.domain },
        y: { domain: [groups.length - 0.5, -0.5], axis: null },
        marks,
      },
    )
  }

  const tip = (d: Dot<T>): TipContent => {
    const m = medians.find((q) => q.row === d.row)
    return {
      title: d.label || d.group,
      rows: [
        { value: fmt(d.x, xFormat), label: d.label ? d.group : undefined },
        // A median of whole counts can fall halfway (3.5 reports): one decimal, never rounded to 4.
        ...(showMedian && m
          ? [{ value: fmt(m.m, xFormat === 'int' ? 'num1' : xFormat), label: 'group median', strong: false }]
          : []),
      ],
    }
  }

  // Keyboard: one row at a time (Up and Down between rows), dots left to right.
  const keyPoints = (plot: PlotElement) =>
    groups.flatMap((g) =>
      dots
        .filter((d) => d.group === g)
        .sort((a, b) => a.x - b.x)
        .map((d) => ({
          datum: d,
          x: plotPos(plot, 'x', d.x),
          y: plotPos(plot, 'y', d.y),
          w: 8,
          h: 8,
          group: g,
        })),
    )

  return (
    <PlotChart<Dot<T>>
      keyPoints={keyPoints}
      build={build}
      height={height}
      tip={tip}
      onSelect={onSelect ? (d) => onSelect(d.datum) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
