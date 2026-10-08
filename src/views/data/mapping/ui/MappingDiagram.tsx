/**
 * A column mapping diagram (business unit → department, location → country → region, job family →
 * job function → title): thin ink bars sized by active headcount, ribbons in the series blue, and
 * the parts that disagree in the warning color with a diamond beside their label. Hover shows
 * what a node or ribbon stands for; a click (or Enter on a focused bar) lists the people.
 */
import { type FocusEvent, type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import {
  glyphPath,
  LEGEND_ATTR,
  Legend,
  type LegendSpec,
  TIP_CLASS,
  type TipContent,
  textWidth,
  useChartTheme,
  useFontsVersion,
} from '@/charts'
import { type DrillSource, drill } from '@/drill'
import { type DiagramLayout, FLAG_ROOM, layoutDiagram, type PlacedNode } from '../engine/diagram'
import type { DiagramPart, MappedDiagram } from '../engine/structure'
import { useTip, useWidth } from './hooks'

const intText = (n: number) => n.toLocaleString('en-US')
const people = (n: number) => `${intText(n)} ${n === 1 ? 'person' : 'people'}`

function tipOf(part: DiagramPart | undefined): TipContent | null {
  if (!part) return null
  return {
    title: part.title,
    rows: part.lines.map((l) => ({ value: l.value, label: l.label })),
    note: [part.flag, part.rows.length ? `Click to see the ${people(part.rows.length)}.` : null]
      .filter(Boolean)
      .join(' '),
  }
}

export function MappingDiagram({
  mapped,
  label,
  drillFor,
  maxHeight = 520,
  dense = false,
}: {
  mapped: MappedDiagram
  /** Accessible name of the whole diagram. */
  label: string
  /** The people behind a node or ribbon id. */
  drillFor: (id: string) => DrillSource
  maxHeight?: number
  /** Many nodes in a column: tighter spacing so the diagram stays a readable height. */
  dense?: boolean
}) {
  // Layout reads text widths that change when fonts load; skip compiler memoization so it re-measures.
  'use no memo'
  const t = useChartTheme()
  useFontsVersion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useWidth(wrapRef)
  const tip = useTip()
  const [hover, setHover] = useState<string | null>(null)

  const layout: DiagramLayout | null =
    width > 0
      ? layoutDiagram(mapped.spec, {
          width,
          measure: (s, size, weight) => textWidth(s, size, weight ?? 400),
          maxHeight,
          minNodeHeight: dense ? 15 : width < 520 ? 18 : 16,
          gap: dense ? 4 : 6,
          growth: dense ? 0.12 : 0.25,
        })
      : null

  const blue = t.series[0]
  const warn = t.status.warning
  const flagged = mapped.spec.nodes.some((n) => n.flag) || mapped.spec.links.some((l) => l.flag)
  const legend: LegendSpec = {
    kind: 'swatch',
    items: [
      { label: 'Active headcount', color: blue, shape: 'rect' },
      ...(flagged ? [{ label: 'Disagrees with the rest', color: warn, shape: 'diamond' as const }] : []),
    ],
  }

  // What lights up with the hovered part: a node and its ribbons, or a ribbon and its two ends.
  const lit = new Set<string>()
  if (hover && layout) {
    lit.add(hover)
    for (const l of layout.links) {
      if (l.id === hover) {
        lit.add(l.source)
        lit.add(l.target)
      } else if (l.source === hover || l.target === hover) {
        lit.add(l.id)
        lit.add(l.source)
        lit.add(l.target)
      }
    }
  }
  const dim = (id: string) => hover != null && !lit.has(id)

  const handlers = (id: string) => {
    const content = () => tipOf(mapped.parts.get(id))
    return {
      onPointerEnter: (e: PointerEvent) => {
        setHover(id)
        const c = content()
        if (c) tip.show(c, e)
      },
      onPointerMove: (e: PointerEvent) => {
        const c = content()
        if (c) tip.show(c, e)
      },
      onPointerLeave: () => {
        setHover(null)
        tip.hide()
      },
      onClick: () => drill(drillFor(id)),
    }
  }
  const focusable = (n: PlacedNode) => {
    const part = mapped.parts.get(n.id)
    return {
      role: 'button',
      tabIndex: 0,
      'aria-label': `${n.label}: ${people(part?.rows.length ?? n.value)}${n.flag ? ', disagrees with the rest' : ''}. Show them.`,
      onFocus: (e: FocusEvent<SVGElement>) => {
        setHover(n.id)
        const c = tipOf(part)
        if (c) tip.showAt(c, e.currentTarget)
      },
      onBlur: () => {
        setHover(null)
        tip.hide()
      },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          drill(drillFor(n.id))
        }
      },
    }
  }

  return (
    <div>
      <Legend spec={legend} className="mb-3" />
      <div ref={wrapRef} className="min-w-0">
        <div ref={tip.boxRef} className="relative">
          {layout && (
            // biome-ignore lint/a11y/useSemanticElements: an SVG group of interactive marks, not a form fieldset
            <svg
              data-chart=""
              {...{ [LEGEND_ATTR]: JSON.stringify(legend) }}
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              role="group"
              aria-label={label}
              style={{ display: 'block', fontFamily: t.font, overflow: 'visible' }}
            >
              <g>
                {layout.columns.map((c) => (
                  <text
                    key={c.title}
                    x={c.x}
                    y={11}
                    textAnchor={c.anchor}
                    fontSize={11}
                    fontWeight={600}
                    letterSpacing="0.02em"
                    fill={t.muted}
                  >
                    {c.title}
                  </text>
                ))}
              </g>
              <g>
                {layout.links.map((l) => (
                  <path
                    key={l.id}
                    d={l.d}
                    fill={l.flag ? warn : blue}
                    fillOpacity={hover === l.id ? 0.62 : l.flag ? 0.5 : 0.3}
                    opacity={dim(l.id) ? 0.35 : 1}
                    style={{ cursor: 'pointer' }}
                    {...handlers(l.id)}
                  />
                ))}
              </g>
              <g>
                {layout.nodes.map((n) => (
                  <rect
                    key={n.id}
                    x={n.x}
                    y={n.y}
                    width={n.w}
                    height={Math.max(1, n.h)}
                    rx={1}
                    fill={t.ink}
                    opacity={dim(n.id) ? 0.45 : 1}
                    style={{ cursor: 'pointer', outline: 'none' }}
                    {...handlers(n.id)}
                    {...focusable(n)}
                  />
                ))}
              </g>
              <g>
                {layout.nodes.map((n) => (
                  <NodeCaption
                    key={n.id}
                    node={n}
                    middle={n.column > 0 && n.column < layout.columns.length - 1}
                    dimmed={dim(n.id)}
                    ink={t.ink}
                    ink2={t.ink2}
                    sheet={t.sheet}
                    warn={warn}
                    handlers={handlers(n.id)}
                  />
                ))}
              </g>
            </svg>
          )}
          <div ref={tip.tipRef} className={TIP_CLASS} hidden aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

/** Label, count and (when flagged) a warning diamond beside a node. A pointer shortcut only. */
function NodeCaption({
  node: n,
  middle,
  dimmed,
  ink,
  ink2,
  sheet,
  warn,
  handlers,
}: {
  node: PlacedNode
  middle: boolean
  dimmed: boolean
  ink: string
  ink2: string
  sheet: string
  warn: string
  handlers: {
    onPointerEnter: (e: PointerEvent) => void
    onPointerMove: (e: PointerEvent) => void
    onPointerLeave: () => void
    onClick: () => void
  }
}) {
  const c = n.caption
  const textW = textWidth(c.text, 12) + 5 + textWidth(c.value, 12, 600)
  // The diamond sits on the far side of the label from the bar.
  const gx = c.anchor === 'end' ? c.x - textW - FLAG_ROOM / 2 - 1 : c.x + textW + FLAG_ROOM / 2 + 1
  const halo = middle
    ? { stroke: sheet, strokeWidth: 3, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const }
    : {}
  return (
    // A pointer shortcut to the records its bar already opens by keyboard, so it takes no tab stop.
    <g opacity={dimmed ? 0.45 : 1} style={{ cursor: 'pointer' }} {...handlers}>
      <text
        x={c.x}
        y={c.y}
        dy="0.35em"
        textAnchor={c.anchor}
        fontSize={12}
        style={{ fontVariantNumeric: 'tabular-nums' }}
        {...halo}
      >
        <tspan fill={ink2}>{c.text}</tspan>
        <tspan dx={5} fill={ink} fontWeight={600}>
          {c.value}
        </tspan>
        {n.truncated && <title>{n.label}</title>}
      </text>
      {n.flag && <path d={glyphPath('diamond', gx, c.y, 8)} fill={warn} />}
    </g>
  )
}
