/**
 * The wave calendar: one row per survey program, each wave a thin bar from its first answer to
 * its last, over the 12 months to the as-of date. The latest wave of each program is in slot 1,
 * earlier waves are de-emphasized. Hover names the wave; a click opens it by driver.
 */
import * as Plot from '@observablehq/plot'
import {
  axisX,
  gridX,
  housePlot,
  hoverBand,
  type LegendSpec,
  labelsMark,
  maxTextWidth,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  type PlotPointer,
  scalePos,
  seriesColor,
  type TipContent,
  truncateText,
  useChartTheme,
} from '@/charts'
import { addDays, formatDate, formatMonthShort } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { WaveRow } from '../engine'

const ROW = 30
const BAR = 10
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const isoOf = (d: Date) => d.toISOString().slice(0, 10)

export function WaveCalendar({
  waves,
  programs,
  start,
  end,
  onSelect,
}: {
  waves: readonly WaveRow[]
  /** Row order (program names). */
  programs: readonly string[]
  start: string
  end: string
  onSelect?: (wave: WaveRow) => void
}) {
  const theme = useChartTheme()
  const height = 6 + programs.length * ROW + 28
  const legend: LegendSpec = {
    kind: 'swatch',
    items: [
      { label: 'Latest wave', color: seriesColor(theme, 0) },
      { label: 'Earlier waves', color: theme.deemph },
    ],
  }
  const wavesOf = (name: string) => waves.filter((w) => w.name === name)

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!programs.length) return null
    const shown = programs.map((n) => truncateText(n, Math.max(90, width * 0.3), 12))
    const marginLeft = Math.ceil(maxTextWidth(shown, 12)) + 14
    const months: Date[] = []
    for (let d = `${start.slice(0, 7)}-01`; d <= end; ) {
      if (d >= start) months.push(day(d))
      const [y, m] = [+d.slice(0, 4), +d.slice(5, 7)]
      d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    }
    const every = width < 520 ? 3 : width < 820 ? 2 : 1
    const ticks = months.filter((_, i) => i % every === 0)
    const inset = (ROW - BAR) / 2
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop: 6,
        marginBottom: 28,
        marginLeft,
        marginRight: 12,
        x: { type: 'utc', domain: [day(start), day(addDays(end, 1))] },
        y: { type: 'band', domain: [...programs], padding: 0, round: false, axis: null },
        marks: [
          gridX(t, { ticks: months }),
          hoverBand([...programs], { axis: 'y', value: (n: string) => n, color: t.ink }),
          Plot.rect(waves, {
            x1: (w: WaveRow) => day(w.start),
            x2: (w: WaveRow) => day(addDays(w.end, 1)),
            y: 'name',
            insetTop: inset,
            insetBottom: inset,
            rx: 3,
            fill: (w: WaveRow) => (w.latest ? seriesColor(t, 0) : t.deemph),
          }),
          labelsMark(
            (scales, dims) =>
              programs.map((n, i) => ({
                x: dims.marginLeft - 10,
                y: scalePos(scales, 'y', n),
                anchor: 'end' as const,
                parts: [{ text: shown[i], color: t.ink2, size: 12 }],
                title: shown[i] === n ? undefined : n,
              })),
            'program labels',
          ),
          axisX(t, {
            ticks,
            tickFormat: (d: Date) => {
              const iso = isoOf(d)
              return formatMonthShort(iso, iso.slice(5, 7) === '01' || d.getTime() === ticks[0]?.getTime())
            },
          }),
        ],
      },
    )
  }

  /** The wave under the pointer on the hovered row, within a few px of its bar. */
  const pick = (name: string, at: PlotPointer, plot: PlotElement): string | null => {
    const x = plot.scale('x')
    if (!x) return null
    let best: { wave: string; dist: number } | null = null
    for (const w of wavesOf(name)) {
      const a = Number(x.apply(day(w.start)))
      const b = Number(x.apply(day(addDays(w.end, 1))))
      const dist = at.x < a ? a - at.x : at.x > b ? at.x - b : 0
      if (dist <= 6 && (!best || dist < best.dist)) best = { wave: w.wave, dist }
    }
    return best?.wave ?? null
  }

  const tip = (name: string, part: string | null): TipContent | null => {
    const list = wavesOf(name)
    if (!list.length) return { title: name, rows: [{ value: 'No waves in the last 12 months' }] }
    const w = part ? list.find((x) => x.wave === part) : null
    if (!w)
      return {
        title: name,
        rows: [{ value: fmt(list.length, 'int'), label: list.length === 1 ? 'wave' : 'waves' }],
        note: 'Point at a wave for its dates',
      }
    return {
      title: `${name}, ${w.wave}`,
      rows: [
        { value: `${formatDate(w.start)} – ${formatDate(w.end)}`, label: 'first to last answer' },
        { value: fmt(w.respondents, 'int'), label: 'respondents' },
      ],
    }
  }

  return (
    <PlotChart<string>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      pick={pick}
      selectable={(_, part) => part != null}
      onSelect={
        onSelect
          ? (name, part) => {
              const w = wavesOf(name).find((x) => x.wave === part)
              if (w) onSelect(w)
            }
          : undefined
      }
      ariaLabel="Survey waves by program over the last 12 months"
    />
  )
}
