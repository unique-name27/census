/**
 * StatusSplit: one 100% bar, 12px tall, of how many measures (or items) are in each state, in a
 * fixed order: met, watch, missed, no target, not shown. Status is the subject, so segments are
 * filled in status colors (met good, watch warning, missed critical; no target and not shown in
 * grays), with 2px gaps. Under each segment, never inside it: the status glyph, the count and the
 * word ("4 Met"), so state never relies on color. Each segment drills (`onSelect`). Tooltip and
 * the keyboard layer come from PlotChart; the chart exports as one SVG (`data-chart`).
 *
 *   <StatusSplit
 *     counts={{ met: 4, watch: 7, missed: 10, none: 3 }}
 *     onSelect={(key) => setShown(key)}
 *     ariaLabel="Measures by status"
 *   />
 *
 * Used under the HR home's hero number ("4 of 21 targets met").
 */
import * as Plot from '@observablehq/plot'
import { fmt } from '@/lib/format'
import { glyphForTone, glyphPath, HOVER_CLASS, svgEl } from '../core/marks'
import { textWidth } from '../core/measure'
import type { TipContent } from '../core/tooltip'
import { housePlot, type PlotBuildContext, PlotChart } from '../plot'
import type { ChartTheme } from '../theme'
import {
  type SplitKey,
  type SplitSegment,
  splitLabelPositions,
  splitSegments,
  splitShare,
} from './bulletModel'

export { SPLIT_ORDER, SPLIT_WORD, type SplitKey } from './bulletModel'

export interface StatusSplitProps {
  /** Count per state; zero or missing states are left out. */
  counts: Partial<Record<SplitKey, number>>
  /** Words in place of the defaults ("On watch" for "Watch"). */
  labels?: Partial<Record<SplitKey, string>>
  /** What the counts count, for the tooltip: "measures" (default). */
  unit?: string
  /** Click-to-drill on a segment. */
  onSelect?: (key: SplitKey) => void
  /** Whether a segment opens (default: every segment with a count, when `onSelect` is given). */
  selectable?: (key: SplitKey) => boolean
  /** What selecting a segment does, after "Click to" (default "see the records"). */
  openHint?: string
  ariaLabel?: string
}

const BAR_H = 12
const LABEL_TOP = BAR_H + 10
const HEIGHT = LABEL_TOP + 18

const STATUS_TONE: Partial<Record<SplitKey, 'good' | 'warning' | 'critical'>> = {
  met: 'good',
  watch: 'warning',
  missed: 'critical',
}

function fillOf(t: ChartTheme, key: SplitKey): string {
  const tone = STATUS_TONE[key]
  if (tone) return t.status[tone]
  return key === 'none' ? t.deemph : t.sheet3
}

/** Width of a segment's label under the bar: glyph, count and word. */
function labelWidth(s: SplitSegment): number {
  return 12 + textWidth(fmt(s.count, 'int'), 13, 600) + 4 + textWidth(s.label, 12)
}

export function StatusSplit({
  counts,
  labels,
  unit = 'measures',
  onSelect,
  selectable,
  openHint,
  ariaLabel,
}: StatusSplitProps) {
  const build = ({ width, theme: t }: PlotBuildContext) => {
    const { segments } = splitSegments(counts, width, { labels })
    if (!segments.length) return null
    const lx = splitLabelPositions(segments, labelWidth, width)
    const draw: Plot.RenderFunction = (_i, _s, _v, _d, context) => {
      const doc = context.document
      const g = svgEl(doc, 'g', { 'aria-label': 'status split' })
      segments.forEach((s, i) => {
        const first = i === 0
        const last = i === segments.length - 1
        const r = 2
        const w = Math.max(1, s.w)
        // Square inner edges, 2px rounded outer ends of the bar.
        const d = `M${s.x + (first ? r : 0)},0H${s.x + w - (last ? r : 0)}${last ? `a${r},${r} 0 0 1 ${r},${r}V${BAR_H - r}a${r},${r} 0 0 1 ${-r},${r}` : `V${BAR_H}`}H${s.x + (first ? r : 0)}${first ? `a${r},${r} 0 0 1 ${-r},${-r}V${r}a${r},${r} 0 0 1 ${r},${-r}` : `V0`}Z`
        const seg = svgEl(doc, 'path', { d })
        seg.style.fill = fillOf(t, s.key)
        if (s.key === 'hidden') {
          seg.style.stroke = t.axis
          seg.style.strokeWidth = '1px'
        }
        g.append(seg)
        // Under the segment: glyph (or a gray swatch), count, word.
        const x = lx[i]
        const cy = LABEL_TOP + 7
        const tone = STATUS_TONE[s.key]
        const mark = tone
          ? svgEl(doc, 'path', { d: glyphPath(glyphForTone(tone), x + 4, cy) })
          : svgEl(doc, 'rect', { x: x + 0.5, y: cy - 3.5, width: 7, height: 7, rx: 1 })
        mark.style.fill = tone ? t.status[tone] : fillOf(t, s.key)
        if (!tone) {
          mark.style.stroke = t.axis
          mark.style.strokeWidth = '1px'
        }
        g.append(mark)
        const text = svgEl(doc, 'text', { x: x + 12, y: cy, dy: '0.32em', 'text-anchor': 'start' })
        const count = svgEl(doc, 'tspan')
        count.textContent = fmt(s.count, 'int')
        count.style.fill = t.ink
        count.style.fontSize = '13px'
        count.style.fontWeight = '600'
        const word = svgEl(doc, 'tspan', { dx: 4 })
        word.textContent = s.label
        word.style.fill = t.ink2
        word.style.fontSize = '12px'
        text.append(count, word)
        g.append(text)
      })
      return g
    }
    const hover: Plot.RenderFunction = (index, _s, _v, _d, context) => {
      const g = svgEl(context.document, 'g', { class: HOVER_CLASS })
      const i = index[0]
      if (i === undefined) return g
      const s = segments[i]
      const ring = svgEl(context.document, 'rect', {
        x: s.x - 1,
        y: -2,
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
            segments,
            Plot.pointerX({ x: (s: SplitSegment) => s.x + s.w / 2, maxRadius: width, render: hover }),
          ),
        ],
      },
    )
    node.setAttribute('data-chart', '')
    return node
  }

  const segmentsAt = (width: number) => splitSegments(counts, width, { labels }).segments
  // Met, watch and missed are shares of the measures judged against a target (the hero's "4 of
  // 21"); no target and not shown are counts only.
  const tip = (s: SplitSegment): TipContent => {
    const of = splitShare(counts, s.key)
    const count = `${fmt(s.count, 'int')} ${unit}`
    return {
      title: s.label,
      rows: [
        { value: fmt(s.count, 'int'), label: unit },
        ...(of ? [{ value: fmt(of.share, 'pct'), label: `of ${fmt(of.judged, 'int')} with a target` }] : []),
      ],
      spoken: `${s.label}: ${count}${of ? `, ${fmt(of.share, 'pct')} of the ${fmt(of.judged, 'int')} with a target` : ''}`,
    }
  }
  const canOpen = (s: SplitSegment) => !!onSelect && s.count > 0 && (selectable?.(s.key) ?? true)

  return (
    <PlotChart<SplitSegment>
      build={build}
      height={HEIGHT + 2}
      tip={tip}
      openHint={openHint}
      selectable={canOpen}
      onSelect={onSelect ? (s) => onSelect(s.key) : undefined}
      keyPoints={(plot) => {
        const svg = plot instanceof SVGSVGElement ? plot : plot.querySelector('svg')
        const w = Number(svg?.getAttribute('width')) || 0
        return segmentsAt(w).map((s) => ({ datum: s, x: s.x + s.w / 2, y: BAR_H / 2, w: s.w, h: BAR_H }))
      }}
      ariaLabel={
        ariaLabel ??
        `Status split: ${segmentsAt(100)
          .map((s) => `${s.count} ${s.label}`)
          .join(', ')}`
      }
    />
  )
}
