/**
 * SplitBar: one 100% bar, 12px tall, under a role home's hero number (docs/DESIGN-REFRESH.md 2.6):
 * how the hero's population splits, in a fixed order the caller gives (range position from below
 * the minimum to above the maximum, successor readiness, case SLA state, next step). It is the
 * Scorecard's StatusSplit for any set of states: a state segment is filled in its status color and
 * carries its glyph, an ordered one takes a step of the blue ramp, a remainder is gray. Under the
 * bar, never inside it, each segment's count and word, so the split never relies on color. Each
 * segment drills; the tooltip and the keyboard come from PlotChart (one tab stop, arrows move,
 * Enter opens). The bar exports as one SVG (`data-chart`).
 */
import * as Plot from '@observablehq/plot'
import { type ChartTheme, glyphForTone, glyphPath, HOVER_CLASS, housePlot, PlotChart } from '@/charts'
import { svgEl } from '@/charts/core/marks'
import type { TipContent } from '@/charts/core/tooltip'
import { fmt } from '@/lib/format'
import type { SplitPaint, SplitPart, SplitTone } from '../engine/split'

export type { SplitPaint, SplitPart, SplitTone }

const STATUS: readonly string[] = ['good', 'warning', 'serious', 'critical']
const isTone = (p: SplitPaint): p is SplitTone => STATUS.includes(p)

export function paintOf(t: ChartTheme, p: SplitPaint): string {
  if (isTone(p)) return t.status[p]
  switch (p) {
    case 'seq-250':
      return t.seq[250]
    case 'seq-400':
      return t.seq[400]
    case 'seq-500':
      return t.seq[500]
    case 'seq-600':
      return t.seq[600]
    case 'series':
      return t.series[0]
    case 'deemph':
      return t.deemph
    default:
      return t.sheet3
  }
}

export interface SplitSeg extends SplitPart {
  x: number
  w: number
  share: number
}

/** Segment positions for a width: parts with a count only, 2px gaps, in the order given. */
export function splitLayout(parts: readonly SplitPart[], width: number, gap = 2): SplitSeg[] {
  const present = parts.filter((p) => p.count > 0)
  const total = present.reduce((s, p) => s + p.count, 0)
  if (!total) return []
  const room = Math.max(0, width - gap * (present.length - 1))
  let x = 0
  return present.map((p) => {
    const share = p.count / total
    const seg = { ...p, x, w: room * share, share }
    x += seg.w + gap
    return seg
  })
}

const BAR_H = 12
const HEIGHT = BAR_H + 4

function Swatch({ paint, theme }: { paint: SplitPaint; theme: ChartTheme }) {
  const color = paintOf(theme, paint)
  if (isTone(paint))
    return (
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
        <path d={glyphPath(glyphForTone(paint), 5, 5)} style={{ fill: color }} />
      </svg>
    )
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2 shrink-0 rounded-mark border border-rule-strong"
      style={{ background: color }}
    />
  )
}

export function SplitBar({
  parts,
  unit,
  onSelect,
  selectable,
  ariaLabel,
  theme,
  className,
}: {
  /** In the order the bar draws them; parts with no count are left out. */
  parts: readonly SplitPart[]
  /** What the counts count, for the tooltip: "people", "roles", "cases". */
  unit: string
  onSelect?: (key: string) => void
  /** Whether a segment opens (default: every segment with a count, when `onSelect` is given). */
  selectable?: (key: string) => boolean
  ariaLabel: string
  /** The chart theme, for the labels under the bar (the bar reads its own). */
  theme: ChartTheme
  className?: string
}) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.count), 0)
  const build = ({ width, theme: t }: { width: number; theme: ChartTheme }) => {
    const segs = splitLayout(parts, width)
    if (!segs.length) return null
    const draw: Plot.RenderFunction = (_i, _s, _v, _d, context) => {
      const doc = context.document
      const g = svgEl(doc, 'g', { 'aria-label': ariaLabel })
      segs.forEach((s, i) => {
        const first = i === 0
        const last = i === segs.length - 1
        const r = 2
        const w = Math.max(1, s.w)
        // Square inner edges, 2px rounded outer ends of the bar.
        const d = `M${s.x + (first ? r : 0)},2H${s.x + w - (last ? r : 0)}${last ? `a${r},${r} 0 0 1 ${r},${r}V${2 + BAR_H - r}a${r},${r} 0 0 1 ${-r},${r}` : `V${2 + BAR_H}`}H${s.x + (first ? r : 0)}${first ? `a${r},${r} 0 0 1 ${-r},${-r}V${2 + r}a${r},${r} 0 0 1 ${r},${-r}` : 'V2'}Z`
        const seg = svgEl(doc, 'path', { d })
        seg.style.fill = paintOf(t, s.paint)
        if (s.paint === 'empty') {
          seg.style.stroke = t.axis
          seg.style.strokeWidth = '1px'
        }
        g.append(seg)
      })
      return g
    }
    const hover: Plot.RenderFunction = (index, _s, _v, _d, context) => {
      const g = svgEl(context.document, 'g', { class: HOVER_CLASS })
      const i = index[0]
      if (i === undefined) return g
      const s = segs[i]
      const ring = svgEl(context.document, 'rect', {
        x: s.x - 1,
        y: 0,
        width: s.w + 2,
        height: BAR_H + 4,
        rx: 3,
      })
      ring.style.fill = 'none'
      ring.style.stroke = t.ink
      ring.style.strokeWidth = '1.5px'
      g.append(ring)
      return g
    }
    const node = housePlot(
      { width, theme: t },
      {
        width,
        height: HEIGHT,
        margin: 0,
        x: { type: 'identity', axis: null },
        y: { type: 'identity', axis: null },
        marks: [
          draw,
          Plot.ruleX(
            segs,
            Plot.pointerX({ x: (s: SplitSeg) => s.x + s.w / 2, maxRadius: width, render: hover }),
          ),
        ],
      },
    )
    node.setAttribute('data-chart', '')
    return node
  }
  const share = (n: number) => fmt(total ? n / total : null, 'pct')
  const tip = (s: SplitSeg): TipContent => ({
    title: s.label,
    rows: [
      { value: fmt(s.count, 'int'), label: unit },
      { value: share(s.count), label: `of ${fmt(total, 'int')}` },
    ],
    spoken: `${s.label}: ${fmt(s.count, 'int')} ${unit}, ${share(s.count)} of ${fmt(total, 'int')}`,
  })
  const widthOf = (plot: Element): number => {
    const svg = plot instanceof SVGSVGElement ? plot : plot.querySelector('svg')
    return Number(svg?.getAttribute('width')) || 0
  }
  const shown = parts.filter((p) => p.count > 0)
  return (
    <div className={className}>
      <PlotChart<SplitSeg>
        build={build}
        height={HEIGHT + 2}
        tip={tip}
        selectable={(s) => !!onSelect && s.count > 0 && (selectable?.(s.key) ?? true)}
        onSelect={onSelect ? (s) => onSelect(s.key) : undefined}
        keyPoints={(plot) =>
          splitLayout(parts, widthOf(plot)).map((s) => ({
            datum: s,
            x: s.x + s.w / 2,
            y: 2 + BAR_H / 2,
            w: s.w,
            h: BAR_H,
          }))
        }
        ariaLabel={`${ariaLabel}: ${shown.map((p) => `${fmt(p.count, 'int')} ${p.label}`).join(', ')}`}
      />
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-hidden="true">
        {shown.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5 text-meta text-ink-2">
            <Swatch paint={p.paint} theme={theme} />
            <span className="font-semibold text-ink">{fmt(p.count, 'int')}</span>
            <span>{p.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
