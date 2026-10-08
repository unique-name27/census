/**
 * "Pipeline today": one bar per stage of the active candidates, split by next-step state. The
 * three states that need someone to act sit at the left in categorical slots 1-3; scheduled
 * candidates, already in motion, close the bar in gray. A warning diamond at the end of each bar
 * counts the candidates who lack a next step (past the usual time).
 *
 * Every number drills: a segment lists its candidates, the stage name and the count at the end of
 * the bar list everyone at the stage, the diamond count lists those lacking a next step, and the
 * legend counts list a state across all stages.
 */
import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
  useState,
} from 'react'
import {
  glyphPath,
  LEGEND_ATTR,
  type LegendSpec,
  TIP_CLASS,
  type TipContent,
  textWidth,
  useChartTheme,
  useFontsVersion,
} from '@/charts'
import { type DrillSource, drill } from '@/drill'
import { fmt, plural } from '@/lib/format'
import { STATE_NAME } from '../engine/nextStep'
import type { PipelineCell, PipelineStage } from '../engine/pipeline'
import { NEXT_STATES, type NextState } from '../engine/types'
import { DrillLegend } from './DrillLegend'
import { useTip, useWidth } from './hooks'

const ROW = 52
const BAR = 22
const GAP = 2

/** The legend words for the diamond; the state names never use "lack". */
export const LACKS_LABEL = 'Lacks a next step (past the usual time)'

function cellTip(c: PipelineCell, total: number): TipContent {
  return {
    title: `${c.stage} · ${c.label}`,
    rows: [
      { value: fmt(c.candidates, 'int'), label: `of ${fmt(total, 'int')} active at this stage` },
      {
        value: fmt(c.lacking, 'int'),
        label: `${c.lacking === 1 ? 'lacks' : 'lack'} a next step (past the usual time)`,
      },
      {
        value: c.medianDaysWaiting != null ? fmt(Math.round(c.medianDaysWaiting), 'days') : '—',
        label: c.state === 'scheduled' ? 'median days in stage' : 'median days waiting',
      },
    ],
    note: `${c.state === 'scheduled' ? 'In motion: not in the action queue. ' : ''}Click to see the ${plural(c.candidates, 'candidate')}.`,
  }
}

const activate = (e: KeyboardEvent, src: DrillSource) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    drill(src)
  }
}

export interface PipelineBarsProps {
  stages: readonly PipelineStage[]
  /** The candidates behind a segment. */
  cellDrill: (c: PipelineCell) => DrillSource
  /** Everyone at a stage, or only those lacking a next step. */
  stageDrill: (s: PipelineStage, lackingOnly: boolean) => DrillSource
  /** Everyone in a state, all stages (the legend counts). */
  stateDrill: (state: NextState) => DrillSource
  /** Everyone lacking a next step (the diamond's legend count). */
  lackingDrill: DrillSource
}

export function PipelineBars({ stages, cellDrill, stageDrill, stateDrill, lackingDrill }: PipelineBarsProps) {
  // Layout reads text widths that change when fonts load; skip compiler memoization so it re-measures.
  'use no memo'
  const t = useChartTheme()
  useFontsVersion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useWidth(wrapRef)
  const tip = useTip()
  const [hover, setHover] = useState<string | null>(null)
  // Segment ids are "stage-state" ("3-needs-step"); hovering one dims the others.
  const hoverSeg = hover && /^\d/.test(hover) ? hover : null

  // Categorical identities (slots 1-3), not opacity steps of one blue: those blur in dark mode.
  const fill: Record<NextState, string> = {
    'needs-step': t.series[0],
    'awaiting-feedback': t.series[1],
    'offer-out': t.series[2],
    scheduled: t.deemph,
  }
  const totals = new Map<NextState, number>()
  for (const s of stages)
    for (const c of s.cells) totals.set(c.state, (totals.get(c.state) ?? 0) + c.candidates)
  const lackingTotal = stages.reduce((n, s) => n + s.lacking, 0)
  const states = NEXT_STATES.filter((s) => totals.get(s))
  // Exported images draw the same legend, counts included.
  const exportLegend: LegendSpec = {
    kind: 'swatch',
    items: [
      ...states.map((s) => ({
        label: `${STATE_NAME[s]} ${fmt(totals.get(s) ?? 0, 'int')}`,
        color: fill[s],
        shape: 'rect' as const,
      })),
      ...(lackingTotal
        ? [
            {
              label: `${LACKS_LABEL} ${fmt(lackingTotal, 'int')}`,
              color: t.status.warning,
              shape: 'diamond' as const,
            },
          ]
        : []),
    ],
  }

  const W = Math.max(280, width)
  const subLabel = (s: PipelineStage) =>
    s.medianDaysInStage != null ? `median ${fmt(Math.round(s.medianDaysInStage), 'days')} in stage` : ''
  const labelW =
    Math.ceil(
      Math.max(
        ...stages.map((s) => Math.max(textWidth(s.stage, 13, 500), textWidth(subLabel(s), 11, 400))),
        40,
      ),
    ) + 16
  const tail = (s: PipelineStage) => {
    const count = fmt(s.active, 'int')
    const long = s.lacking ? plural(s.lacking, 'lacks a next step', 'lack a next step') : ''
    return { count, long, short: s.lacking ? fmt(s.lacking, 'int') : '' }
  }
  const tailW = (s: PipelineStage, useLong: boolean) => {
    const x = tail(s)
    return (
      textWidth(x.count, 13, 650) + (x.long ? 10 + 14 + textWidth(useLong ? x.long : x.short, 12, 500) : 0)
    )
  }
  const maxActive = Math.max(1, ...stages.map((s) => s.active))
  const longFits = W - labelW - Math.max(...stages.map((s) => tailW(s, true))) - 12 >= W * 0.42
  const tailMax = Math.max(...stages.map((s) => tailW(s, longFits)))
  const barMax = Math.max(40, W - labelW - tailMax - 14)
  const height = stages.length * ROW + 4
  const scale = barMax / maxActive

  /** A number drawn in the SVG that opens its records: underlined on hover and focus. */
  const textButton = (id: string, label: string, src: DrillSource, children: ReactNode) => (
    // biome-ignore lint/a11y/useSemanticElements: SVG text can't be an HTML button; the group takes the button role and keys
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      style={{ cursor: 'pointer', outline: 'none', textDecoration: hover === id ? 'underline' : 'none' }}
      onPointerEnter={() => setHover(id)}
      onPointerLeave={() => setHover(null)}
      onFocus={() => setHover(id)}
      onBlur={() => setHover(null)}
      onClick={() => drill(src)}
      onKeyDown={(e) => activate(e, src)}
    >
      <title>{label}</title>
      {children}
    </g>
  )

  return (
    <div>
      <DrillLegend
        className="mb-3"
        items={[
          ...states.map((s) => ({
            label: STATE_NAME[s],
            count: totals.get(s) ?? 0,
            color: fill[s],
            drill: stateDrill(s),
          })),
          ...(lackingTotal
            ? [
                {
                  label: LACKS_LABEL,
                  count: lackingTotal,
                  color: t.status.warning,
                  shape: 'diamond' as const,
                  drill: lackingDrill,
                },
              ]
            : []),
        ]}
      />
      <div ref={wrapRef} className="min-w-0">
        <div ref={tip.boxRef} className="relative">
          {width > 0 && (
            // biome-ignore lint/a11y/useSemanticElements: an SVG group of interactive marks, not a form fieldset
            <svg
              data-chart=""
              {...{ [LEGEND_ATTR]: JSON.stringify(exportLegend) }}
              width={W}
              height={height}
              viewBox={`0 0 ${W} ${height}`}
              role="group"
              aria-label="Active candidates by stage and next-step state"
              // Shrinks with its sheet until the next measure, so it never pushes the page sideways.
              style={{ display: 'block', fontFamily: t.font, maxWidth: '100%', height: 'auto' }}
            >
              <line x1={labelW} x2={labelW} y1={0} y2={height - 2} stroke={t.axis} strokeWidth={1} />
              {stages.map((s, row) => {
                const y = row * ROW + (ROW - BAR) / 2 + 2
                const cy = y + BAR / 2
                let x = labelW
                const segs = s.cells.map((c, j) => {
                  const w = Math.max(c.candidates * scale, 2)
                  const last = j === s.cells.length - 1
                  const seg = { c, x, w, last }
                  x += w
                  return seg
                })
                const end = x
                const tl = tail(s)
                const glyphX = end + 8 + textWidth(tl.count, 13, 650) + 10 + 6
                const everyone = stageDrill(s, false)
                return (
                  <g key={s.stage}>
                    {s.active > 0 ? (
                      textButton(
                        `stage-${s.stageIndex}`,
                        `${s.stage}: show the ${plural(s.active, 'active candidate')}`,
                        everyone,
                        <>
                          <text x={0} y={cy - 1} fontSize={13} fontWeight={500} fill={t.ink}>
                            {s.stage}
                          </text>
                          <text x={0} y={cy + 13} fontSize={11} fill={t.muted}>
                            {subLabel(s)}
                          </text>
                        </>,
                      )
                    ) : (
                      <text x={0} y={cy - 1} fontSize={13} fontWeight={500} fill={t.ink}>
                        {s.stage}
                      </text>
                    )}
                    {segs.map(({ c, x: sx, w, last }) => {
                      const id = `${c.stageIndex}-${c.state}`
                      const r = last ? Math.min(4, w / 2) : 0
                      const inner = Math.max(0.5, w - (last ? 0 : GAP))
                      const d = last
                        ? `M${sx},${y}H${sx + inner - r}Q${sx + inner},${y} ${sx + inner},${y + r}V${y + BAR - r}Q${sx + inner},${y + BAR} ${sx + inner - r},${y + BAR}H${sx}Z`
                        : `M${sx},${y}H${sx + inner}V${y + BAR}H${sx}Z`
                      const src = cellDrill(c)
                      return (
                        // biome-ignore lint/a11y/useSemanticElements: SVG marks can't be HTML buttons; the path takes the button role and keys
                        <path
                          key={id}
                          d={d}
                          fill={fill[c.state]}
                          opacity={hoverSeg && hoverSeg !== id ? 0.5 : 1}
                          role="button"
                          tabIndex={0}
                          aria-label={`${c.stage}, ${c.label}: ${plural(c.candidates, 'candidate')}, ${plural(c.lacking, 'lacks a next step', 'lack a next step')}. Show them.`}
                          style={{ cursor: 'pointer', outline: 'none' }}
                          onPointerEnter={(e: PointerEvent) => {
                            setHover(id)
                            tip.show(cellTip(c, s.active), e)
                          }}
                          onPointerMove={(e: PointerEvent) => tip.show(cellTip(c, s.active), e)}
                          onPointerLeave={() => {
                            setHover(null)
                            tip.hide()
                          }}
                          onFocus={(e: FocusEvent<SVGElement>) => {
                            setHover(id)
                            tip.showAt(cellTip(c, s.active), e.currentTarget)
                          }}
                          onBlur={() => {
                            setHover(null)
                            tip.hide()
                          }}
                          onClick={() => drill(src)}
                          onKeyDown={(e) => activate(e, src)}
                        />
                      )
                    })}
                    {s.active > 0 &&
                      textButton(
                        `count-${s.stageIndex}`,
                        `Show the ${plural(s.active, 'active candidate')} at ${s.stage.toLowerCase()}`,
                        everyone,
                        <text
                          x={end + 8}
                          y={cy + 4.5}
                          fontSize={13}
                          fontWeight={650}
                          fill={t.ink}
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {tl.count}
                        </text>,
                      )}
                    {s.lacking > 0 &&
                      textButton(
                        `lacking-${s.stageIndex}`,
                        `Show the ${plural(s.lacking, 'candidate')} at ${s.stage.toLowerCase()} who lack a next step`,
                        stageDrill(s, true),
                        <>
                          <path d={glyphPath('diamond', glyphX, cy, 10)} fill={t.status.warning} />
                          <text x={glyphX + 9} y={cy + 4} fontSize={12} fontWeight={500} fill={t.ink2}>
                            {longFits ? tl.long : tl.short}
                          </text>
                        </>,
                      )}
                  </g>
                )
              })}
            </svg>
          )}
          <div ref={tip.tipRef} className={TIP_CLASS} hidden aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
