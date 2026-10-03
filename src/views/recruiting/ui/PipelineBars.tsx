/**
 * "Pipeline today": one bar per stage of the active candidates, split by next-step state. The
 * states that need someone to act sit at the left in the series blue (darker = more urgent);
 * scheduled candidates, already in motion, close the bar in gray. A warning mark at the end of
 * each bar counts the candidates who lack a timely next step. Segments open the action queue.
 */
import { color as d3color } from 'd3'
import { type FocusEvent, type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import { glyphPath, Legend, type LegendSpec, textWidth, useChartTheme } from '@/charts'
import { LEGEND_ATTR } from '@/charts/core/legend'
import { useFontsVersion } from '@/charts/core/measure'
import { TIP_CLASS, type TipContent } from '@/charts/core/tooltip'
import { fmt } from '@/lib/format'
import { STATE_NAME } from '../engine/nextStep'
import type { PipelineCell, PipelineStage } from '../engine/pipeline'
import { NEXT_STATES, type NextState } from '../engine/types'
import { useTip, useWidth } from './hooks'

const ROW = 52
const BAR = 22
const GAP = 2

function cellTip(c: PipelineCell, total: number): TipContent {
  return {
    title: `${c.stage} · ${c.label}`,
    rows: [
      { value: fmt(c.candidates, 'int'), label: `of ${fmt(total, 'int')} active at this stage` },
      { value: fmt(c.lacking, 'int'), label: 'lack a timely next step' },
      {
        value: c.medianDaysWaiting != null ? fmt(Math.round(c.medianDaysWaiting), 'days') : '—',
        label: c.state === 'scheduled' ? 'median days in stage' : 'median days waiting',
      },
    ],
    note:
      c.state === 'scheduled'
        ? 'In motion: not in the action queue.'
        : 'Click to open these in the action queue.',
  }
}

export function PipelineBars({
  stages,
  onOpen,
}: {
  stages: readonly PipelineStage[]
  onOpen: (stage: number, state: NextState) => void
}) {
  // Layout reads text widths that change when fonts load; skip compiler memoization so it re-measures.
  'use no memo'
  const t = useChartTheme()
  useFontsVersion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useWidth(wrapRef)
  const tip = useTip()
  const [hover, setHover] = useState<string | null>(null)

  const blue = t.series[0]
  const shade = (o: number) => d3color(blue)?.copy({ opacity: o }).formatRgb() ?? blue
  const fill: Record<NextState, string> = {
    'needs-step': blue,
    'awaiting-feedback': shade(0.62),
    'offer-out': shade(0.34),
    scheduled: t.deemph,
  }
  const totals = new Map<NextState, number>()
  for (const s of stages)
    for (const c of s.cells) totals.set(c.state, (totals.get(c.state) ?? 0) + c.candidates)
  const legend: LegendSpec = {
    kind: 'swatch',
    items: NEXT_STATES.filter((s) => totals.get(s)).map((s) => ({
      label: `${STATE_NAME[s]} ${fmt(totals.get(s) ?? 0, 'int')}`,
      color: fill[s],
      shape: 'rect' as const,
    })),
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
    const long = s.lacking ? `${fmt(s.lacking, 'int')} lack a next step` : ''
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

  const onKey = (e: KeyboardEvent, c: PipelineCell) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(c.stageIndex, c.state)
    }
  }

  return (
    <div>
      <Legend spec={legend} className="mb-3" />
      <div ref={wrapRef} className="min-w-0">
        <div ref={tip.boxRef} className="relative">
          {width > 0 && (
            // biome-ignore lint/a11y/useSemanticElements: an SVG group of interactive marks, not a form fieldset
            <svg
              data-chart=""
              {...{ [LEGEND_ATTR]: JSON.stringify(legend) }}
              width={W}
              height={height}
              viewBox={`0 0 ${W} ${height}`}
              role="group"
              aria-label="Active candidates by stage and next-step state"
              style={{ display: 'block', fontFamily: t.font }}
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
                return (
                  <g key={s.stage}>
                    <text x={0} y={cy - 1} fontSize={13} fontWeight={500} fill={t.ink}>
                      {s.stage}
                    </text>
                    <text x={0} y={cy + 13} fontSize={11} fill={t.muted}>
                      {subLabel(s)}
                    </text>
                    {segs.map(({ c, x: sx, w, last }) => {
                      const id = `${c.stageIndex}-${c.state}`
                      const r = last ? Math.min(4, w / 2) : 0
                      const inner = Math.max(0.5, w - (last ? 0 : GAP))
                      const d = last
                        ? `M${sx},${y}H${sx + inner - r}Q${sx + inner},${y} ${sx + inner},${y + r}V${y + BAR - r}Q${sx + inner},${y + BAR} ${sx + inner - r},${y + BAR}H${sx}Z`
                        : `M${sx},${y}H${sx + inner}V${y + BAR}H${sx}Z`
                      return (
                        // biome-ignore lint/a11y/useSemanticElements: SVG marks can't be HTML buttons; the path takes the button role and keys
                        <path
                          key={id}
                          d={d}
                          fill={fill[c.state]}
                          opacity={hover && hover !== id ? 0.5 : 1}
                          role="button"
                          tabIndex={0}
                          aria-label={`${c.stage}, ${c.label}: ${c.candidates} candidates, ${c.lacking} lack a next step`}
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
                          onClick={() => onOpen(c.stageIndex, c.state)}
                          onKeyDown={(e) => onKey(e, c)}
                        />
                      )
                    })}
                    <text
                      x={end + 8}
                      y={cy + 4.5}
                      fontSize={13}
                      fontWeight={650}
                      fill={t.ink}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {tl.count}
                    </text>
                    {s.lacking > 0 && (
                      <g>
                        <path d={glyphPath('diamond', glyphX, cy, 10)} fill={t.status.warning} />
                        <text x={glyphX + 9} y={cy + 4} fontSize={12} fontWeight={500} fill={t.ink2}>
                          {longFits ? tl.long : tl.short}
                        </text>
                      </g>
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
