/**
 * "Pipeline today": one bar per stage of the active candidates, split by next-step state. The
 * three states that need someone to act sit at the left in categorical slots 1-3; scheduled
 * candidates, already in motion, close the bar in gray. A warning diamond at the end of each bar
 * counts the candidates who lack a next step (past the usual time). Segments with such candidates
 * open them in the action queue; scheduled segments are never in the queue, so they don't click.
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
import { fmt, plural } from '@/lib/format'
import { STATE_NAME } from '../engine/nextStep'
import type { PipelineCell, PipelineStage } from '../engine/pipeline'
import { NEXT_STATES, type NextState } from '../engine/types'
import { useTip, useWidth } from './hooks'

const ROW = 52
const BAR = 22
const GAP = 2

/** The legend words for the diamond; the state names never use "lack". */
export const LACKS_LABEL = 'Lacks a next step (past the usual time)'

/** Only segments with candidates in the action queue open it (scheduled ones never are). */
const opens = (c: PipelineCell) => c.state !== 'scheduled' && c.lacking > 0

function cellTip(c: PipelineCell, total: number): TipContent {
  return {
    title: `${c.stage} · ${c.label}`,
    rows: [
      { value: fmt(c.candidates, 'int'), label: `of ${fmt(total, 'int')} active at this stage` },
      { value: fmt(c.lacking, 'int'), label: 'lack a next step (past the usual time)' },
      {
        value: c.medianDaysWaiting != null ? fmt(Math.round(c.medianDaysWaiting), 'days') : '—',
        label: c.state === 'scheduled' ? 'median days in stage' : 'median days waiting',
      },
    ],
    note:
      c.state === 'scheduled'
        ? 'In motion: not in the action queue.'
        : opens(c)
          ? `Click to open the ${plural(c.lacking, 'candidate')} who ${c.lacking === 1 ? 'lacks' : 'lack'} a next step in the action queue.`
          : 'None past the usual time: nothing to open in the action queue.',
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
  const legend: LegendSpec = {
    kind: 'swatch',
    items: NEXT_STATES.filter((s) => totals.get(s)).map((s) => ({
      label: `${STATE_NAME[s]} ${fmt(totals.get(s) ?? 0, 'int')}`,
      color: fill[s],
      shape: 'rect' as const,
    })),
  }
  // Exported images get the diamond as a status dot (the shared legend has no diamond swatch).
  const exportLegend: LegendSpec = {
    kind: 'swatch',
    items: [
      ...legend.items,
      ...(lackingTotal
        ? [
            {
              label: `${LACKS_LABEL} ${fmt(lackingTotal, 'int')}`,
              color: t.status.warning,
              shape: 'dot' as const,
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
    if (!opens(c)) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(c.stageIndex, c.state)
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Legend spec={legend} />
        {lackingTotal > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
            <svg aria-hidden="true" width={10} height={10} viewBox="0 0 10 10" className="shrink-0">
              <path d={glyphPath('diamond', 5, 5, 10)} fill={t.status.warning} />
            </svg>
            {LACKS_LABEL} {fmt(lackingTotal, 'int')}
          </span>
        )}
      </div>
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
                      if (!opens(c)) {
                        return (
                          <path
                            key={id}
                            d={d}
                            fill={fill[c.state]}
                            opacity={hover && hover !== id ? 0.5 : 1}
                            aria-label={`${c.stage}, ${c.label}: ${c.candidates} candidates`}
                            onPointerEnter={(e: PointerEvent) => {
                              setHover(id)
                              tip.show(cellTip(c, s.active), e)
                            }}
                            onPointerMove={(e: PointerEvent) => tip.show(cellTip(c, s.active), e)}
                            onPointerLeave={() => {
                              setHover(null)
                              tip.hide()
                            }}
                          />
                        )
                      }
                      return (
                        // biome-ignore lint/a11y/useSemanticElements: SVG marks can't be HTML buttons; the path takes the button role and keys
                        <path
                          key={id}
                          d={d}
                          fill={fill[c.state]}
                          opacity={hover && hover !== id ? 0.5 : 1}
                          role="button"
                          tabIndex={0}
                          aria-label={`${c.stage}, ${c.label}: ${c.candidates} candidates, ${c.lacking} lack a next step. Open them in the action queue.`}
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
