/**
 * "Candidate flow": the river. Thin ink stage bars, the advancing channel in the series blue,
 * still-active candidates as an open-ended fade, and exits turning down into the band along the
 * bottom. Every ribbon, stage bar, count label, the band and the legend counts open the
 * applications behind them in the drill panel.
 */
import { color as d3color } from 'd3'
import { type FocusEvent, type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import {
  inkOn,
  LEGEND_ATTR,
  type LegendSpec,
  TIP_CLASS,
  type TipContent,
  textWidth,
  useChartTheme,
  useFontsVersion,
} from '@/charts'
import { STAGES } from '@/data/schema'
import { type DrillSource, drill } from '@/drill'
import { fmt, plural } from '@/lib/format'
import type { RecruitingBase } from '../engine/base'
import { flowDrill, leftDrill, outcomeDrill } from '../engine/drills'
import { type Flow, type FlowKind, flowMembers, topReason } from '../engine/flow'
import { type LabelTarget, type RibbonKind, riverLayout } from '../engine/river'
import type { App } from '../engine/types'
import { DrillLegend } from './DrillLegend'
import { useTip, useWidth } from './hooks'

const KIND_WORD: Record<RibbonKind, string> = {
  advanced: 'Advanced',
  active: 'Still active',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  declined: 'Offer declined',
}

const pct = (n: number, d: number) => (d > 0 ? fmt(n / d, 'pct') : '—')

/** `reasons`: the mode shows candidates' reasons (not Manager mode), so the tip names the most common one. */
function ribbonTip(
  kind: RibbonKind,
  stage: number,
  flow: Flow,
  cohort: readonly App[],
  reasons: boolean,
): TipContent {
  const s = flow.stages[stage]
  const at = STAGES[stage]
  if (kind === 'advanced') {
    return {
      title: `${at} to ${STAGES[stage + 1].toLowerCase()}`,
      rows: [
        { value: fmt(s.advanced, 'int'), label: 'advanced' },
        { value: fmt(s.pass, 'pct'), label: 'pass rate' },
        {
          value: s.medianDays != null ? fmt(Math.round(s.medianDays), 'days') : '—',
          label: 'median time to advance',
        },
      ],
      note: `Click to see the ${plural(s.advanced, 'candidate')}.`,
    }
  }
  if (kind === 'active') {
    return {
      title: `Still active at ${at.toLowerCase()}`,
      rows: [
        { value: fmt(s.active, 'int'), label: 'candidates in process' },
        { value: pct(s.active, s.entered), label: `of those who reached ${at.toLowerCase()}` },
      ],
      note: `Click to see the ${plural(s.active, 'candidate')} with their next step and owner.`,
    }
  }
  const value = s[kind]
  const reason = reasons ? topReason(flowMembers(cohort, kind, stage)) : null
  return {
    title: `${KIND_WORD[kind]} at ${at.toLowerCase()}`,
    rows: [
      { value: fmt(value, 'int'), label: 'candidates' },
      { value: pct(value, s.entered), label: `of those who reached ${at.toLowerCase()}` },
      ...(reason ? [{ value: fmt(reason.n, 'int'), label: reason.reason }] : []),
    ],
    note: `${reason ? 'Most common reason shown. ' : ''}Click to see the ${plural(value, 'candidate')}.`,
  }
}

function nodeTip(stage: number, flow: Flow): TipContent {
  const value = stage === 5 ? flow.hired : flow.stages[stage].entered
  return {
    title: STAGES[stage],
    rows: [
      { value: fmt(value, 'int'), label: stage === 0 ? 'applications' : 'reached this stage' },
      { value: pct(value, flow.total), label: 'of applications' },
    ],
    note: value ? `Click to see the ${plural(value, 'application')}.` : undefined,
  }
}

/** The element id a label's target highlights (a ribbon or a stage bar). */
const targetId = (t: LabelTarget): string | null =>
  t.kind === 'node' ? `node-${t.stage}` : t.kind === 'left' ? null : `${t.kind}-${t.stage}`

export function RiverChart({ base: b }: { base: RecruitingBase }) {
  // Layout reads text widths that change when fonts load; skip compiler memoization so it re-measures.
  'use no memo'
  const t = useChartTheme()
  useFontsVersion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useWidth(wrapRef)
  const tip = useTip()
  const [hover, setHover] = useState<string | null>(null)
  const flow = b.flow
  const cohort = b.cohort
  const reasons = b.showCandidateReasons !== false

  const blue = t.series[0]
  const fadeColor = d3color(blue)?.copy({ opacity: 0.4 }).formatRgb() ?? blue
  const fill: Record<RibbonKind, string> = {
    advanced: blue,
    active: blue,
    rejected: t.deemph,
    withdrawn: t.muted,
    declined: t.status.serious,
  }
  const legendItems = [
    { label: 'Advanced', color: blue },
    { label: 'Still active', count: flow.active, color: fadeColor, drill: () => outcomeDrill(b, 'active') },
    {
      label: 'Rejected',
      count: flow.left.rejected,
      color: t.deemph,
      drill: () => outcomeDrill(b, 'rejected'),
    },
    {
      label: 'Withdrawn',
      count: flow.left.withdrawn,
      color: t.muted,
      drill: () => outcomeDrill(b, 'withdrawn'),
    },
    ...(flow.left.declined
      ? [
          {
            label: 'Offer declined',
            count: flow.left.declined,
            color: t.status.serious,
            drill: () => outcomeDrill(b, 'declined'),
          },
        ]
      : []),
  ]
  const legend: LegendSpec = {
    kind: 'swatch',
    items: legendItems.map((it) => ({
      label: it.count != null ? `${it.label} ${fmt(it.count, 'int')}` : it.label,
      color: it.color,
      shape: 'rect' as const,
    })),
  }

  const layout = width > 0 ? riverLayout(flow, STAGES, width, textWidth) : null
  const dim = (id: string) => (hover && hover !== id ? 0.38 : 1)
  const labelFill: Record<string, string> = {
    kicker: t.muted,
    count: t.ink,
    flow: t.ink2,
    flowSub: t.muted,
    onFlow: inkOn(t, blue),
    onFlowSub: inkOn(t, blue),
    exit: t.ink2,
    note: t.muted,
  }

  const open =
    (kind: FlowKind, stage: number): DrillSource =>
    () =>
      flowDrill(b, kind, stage)
  const onKey = (e: KeyboardEvent, src: DrillSource) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      drill(src)
    }
  }
  const interact = (id: string, src: DrillSource, content: () => TipContent, label: string) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    style: { cursor: 'pointer', outline: 'none' },
    onPointerEnter: (e: PointerEvent) => {
      setHover(id)
      tip.show(content(), e)
    },
    onPointerMove: (e: PointerEvent) => tip.show(content(), e),
    onPointerLeave: () => {
      setHover(null)
      tip.hide()
    },
    onFocus: (e: FocusEvent<SVGElement>) => {
      setHover(id)
      tip.showAt(content(), e.currentTarget)
    },
    onBlur: () => {
      setHover(null)
      tip.hide()
    },
    onClick: () => drill(src),
    onKeyDown: (e: KeyboardEvent) => onKey(e, src),
  })
  const leftTotal = flow.left.rejected + flow.left.withdrawn + flow.left.declined
  const labelTip = (lt: LabelTarget): TipContent | null =>
    lt.kind === 'node'
      ? nodeTip(lt.stage, flow)
      : lt.kind === 'left'
        ? null
        : ribbonTip(lt.kind, lt.stage, flow, cohort, reasons)

  return (
    <div>
      <DrillLegend items={legendItems} className="mb-3" />
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
              aria-label={`Candidate flow: ${fmt(flow.total, 'int')} applications, ${fmt(flow.hired, 'int')} hired`}
              style={{ display: 'block', fontFamily: t.font, overflow: 'visible' }}
            >
              <defs>
                {layout.fades.map((f) => (
                  <linearGradient
                    key={f.id}
                    id={`rec-fade-${f.id}`}
                    gradientUnits="userSpaceOnUse"
                    x1={f.x0}
                    x2={f.x1}
                    y1={0}
                    y2={0}
                  >
                    <stop offset="0%" stopColor={blue} stopOpacity={0.42} />
                    <stop offset="100%" stopColor={blue} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              {layout.band && (
                <path
                  d={layout.band.d}
                  fill={t.deemph}
                  opacity={hover && hover !== 'band' ? 0.6 : 1}
                  {...interact(
                    'band',
                    () => leftDrill(b),
                    () => ({
                      title: 'Left the process',
                      rows: [
                        { value: fmt(leftTotal, 'int'), label: 'rejected, withdrew or declined' },
                        { value: pct(leftTotal, flow.total), label: 'of applications' },
                      ],
                      note: `Click to see the ${plural(leftTotal, 'candidate')}.`,
                    }),
                    `Left the process: ${fmt(leftTotal, 'int')}`,
                  )}
                />
              )}
              {layout.ribbons.map((rb) => {
                const label =
                  rb.kind === 'advanced'
                    ? `${STAGES[rb.stage]} to ${STAGES[rb.stage + 1]}: ${fmt(rb.value, 'int')} advanced`
                    : `${KIND_WORD[rb.kind]} at ${STAGES[rb.stage]}: ${fmt(rb.value, 'int')}`
                return (
                  <path
                    key={rb.id}
                    d={rb.d}
                    fill={rb.kind === 'active' ? `url(#rec-fade-${rb.id})` : fill[rb.kind]}
                    fillOpacity={rb.kind === 'advanced' ? 0.86 : 1}
                    opacity={dim(rb.id)}
                    stroke={hover === rb.id ? t.ink : 'none'}
                    strokeWidth={hover === rb.id ? 1.25 : 0}
                    {...interact(
                      rb.id,
                      open(rb.kind, rb.stage),
                      () => ribbonTip(rb.kind, rb.stage, flow, cohort, reasons),
                      `${label}. Show them.`,
                    )}
                  />
                )
              })}
              {layout.nodes.map((nd) => {
                const id = `node-${nd.stage}`
                return (
                  <rect
                    key={id}
                    x={nd.x}
                    y={nd.y}
                    width={nd.w}
                    height={Math.max(nd.h, 1)}
                    rx={1}
                    fill={t.ink}
                    opacity={hover && hover !== id && !hover.endsWith(`-${nd.stage}`) ? 0.55 : 1}
                    {...interact(
                      id,
                      open('node', nd.stage),
                      () => nodeTip(nd.stage, flow),
                      `${STAGES[nd.stage]}: ${fmt(nd.value, 'int')}. Show them.`,
                    )}
                  />
                )
              })}
              <g>
                {layout.labels.map((l) => {
                  const target = l.target
                  const hot = target ? targetId(target) : null
                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut to the records its ribbon or stage bar already opens by keyboard
                    <text
                      key={l.id}
                      x={l.x}
                      y={l.y}
                      textAnchor={l.anchor}
                      fontSize={l.size}
                      fontWeight={l.weight}
                      letterSpacing={l.tracking}
                      fill={labelFill[l.role]}
                      fillOpacity={l.role === 'onFlowSub' ? 0.86 : 1}
                      // Numbers click through to their part of the flow; keyboard users reach the
                      // same records from the ribbon or stage bar, so labels take no tab stop.
                      onClick={target ? () => drill(open(target.kind, target.stage)) : undefined}
                      onPointerEnter={
                        target
                          ? (e: PointerEvent) => {
                              setHover(hot)
                              const c = labelTip(target)
                              if (c) tip.show(c, e)
                            }
                          : undefined
                      }
                      onPointerMove={
                        target
                          ? (e: PointerEvent) => {
                              const c = labelTip(target)
                              if (c) tip.show(c, e)
                            }
                          : undefined
                      }
                      onPointerLeave={
                        target
                          ? () => {
                              setHover(null)
                              tip.hide()
                            }
                          : undefined
                      }
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        fontStretch: l.role === 'count' ? '84%' : undefined,
                        cursor: target ? 'pointer' : undefined,
                        pointerEvents: target ? 'auto' : 'none',
                      }}
                    >
                      {l.text}
                    </text>
                  )
                })}
              </g>
            </svg>
          )}
          <div ref={tip.tipRef} className={TIP_CLASS} hidden aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
