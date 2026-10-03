/**
 * "Candidate flow": the river. Thin ink stage bars, the advancing channel in the series blue,
 * still-active candidates as an open-ended fade, and exits turning down into the band along the
 * bottom. Every ribbon has a tooltip and is a button: clicking it lists those candidates and
 * filters the action queue to that stage.
 */
import { color as d3color } from 'd3'
import { type FocusEvent, type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import { inkOn, Legend, type LegendSpec, textWidth, useChartTheme } from '@/charts'
import { LEGEND_ATTR } from '@/charts/core/legend'
import { useFontsVersion } from '@/charts/core/measure'
import { TIP_CLASS, type TipContent } from '@/charts/core/tooltip'
import { STAGES } from '@/data/schema'
import { fmt } from '@/lib/format'
import { type Flow, flowMembers, topReason } from '../engine/flow'
import { type RibbonKind, riverLayout } from '../engine/river'
import type { App } from '../engine/types'
import type { FlowSelection } from '../state'
import { useTip, useWidth } from './hooks'

const KIND_WORD: Record<RibbonKind, string> = {
  advanced: 'Advanced',
  active: 'Still active',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  declined: 'Offer declined',
}

const pct = (n: number, d: number) => (d > 0 ? fmt(n / d, 'pct') : '—')

function ribbonTip(kind: RibbonKind, stage: number, flow: Flow, cohort: readonly App[]): TipContent {
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
      note: 'Click to list them and see who waits at the next stage.',
    }
  }
  if (kind === 'active') {
    return {
      title: `Still active at ${at.toLowerCase()}`,
      rows: [
        { value: fmt(s.active, 'int'), label: 'candidates in process' },
        { value: pct(s.active, s.entered), label: `of those who reached ${at.toLowerCase()}` },
      ],
      note: 'Click to filter the action queue to this stage.',
    }
  }
  const value = s[kind]
  const reason = topReason(flowMembers(cohort, kind, stage))
  return {
    title: `${KIND_WORD[kind]} at ${at.toLowerCase()}`,
    rows: [
      { value: fmt(value, 'int'), label: 'candidates' },
      { value: pct(value, s.entered), label: `of those who reached ${at.toLowerCase()}` },
      ...(reason ? [{ value: fmt(reason.n, 'int'), label: reason.reason }] : []),
    ],
    note: reason ? 'Most common reason shown. Click to list them.' : 'Click to list them.',
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
  }
}

export function RiverChart({
  flow,
  cohort,
  selected,
  onSelect,
}: {
  flow: Flow
  cohort: readonly App[]
  selected: FlowSelection | null
  onSelect: (sel: FlowSelection | null) => void
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
  const fadeColor = d3color(blue)?.copy({ opacity: 0.4 }).formatRgb() ?? blue
  const fill: Record<RibbonKind, string> = {
    advanced: blue,
    active: blue,
    rejected: t.deemph,
    withdrawn: t.muted,
    declined: t.status.serious,
  }
  const legend: LegendSpec = {
    kind: 'swatch',
    items: [
      { label: `Advanced`, color: blue, shape: 'rect' },
      { label: `Still active ${fmt(flow.active, 'int')}`, color: fadeColor, shape: 'rect' },
      { label: `Rejected ${fmt(flow.left.rejected, 'int')}`, color: t.deemph, shape: 'rect' },
      { label: `Withdrawn ${fmt(flow.left.withdrawn, 'int')}`, color: t.muted, shape: 'rect' },
      ...(flow.left.declined
        ? [
            {
              label: `Offer declined ${fmt(flow.left.declined, 'int')}`,
              color: t.status.serious,
              shape: 'rect' as const,
            },
          ]
        : []),
    ],
  }

  const layout = width > 0 ? riverLayout(flow, STAGES, width, textWidth) : null
  const selId = selected ? `${selected.kind}-${selected.stage}` : null
  const focusId = hover ?? selId
  const isSel = (id: string) => selId === id
  const dim = (id: string) => (focusId && focusId !== id ? 0.38 : 1)
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

  const toggle = (sel: FlowSelection) => {
    const id = `${sel.kind}-${sel.stage}`
    onSelect(selId === id ? null : sel)
  }
  const onKey = (e: KeyboardEvent, sel: FlowSelection) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle(sel)
    }
  }
  const interact = (id: string, sel: FlowSelection, content: () => TipContent, label: string) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    'aria-pressed': isSel(id),
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
    onClick: () => toggle(sel),
    onKeyDown: (e: KeyboardEvent) => onKey(e, sel),
  })

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
              {layout.band && <path d={layout.band.d} fill={t.deemph} opacity={focusId ? 0.6 : 1} />}
              {layout.ribbons.map((rb) => {
                const sel: FlowSelection = { kind: rb.kind, stage: rb.stage }
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
                    stroke={isSel(rb.id) ? t.ink : 'none'}
                    strokeWidth={isSel(rb.id) ? 1.25 : 0}
                    {...interact(rb.id, sel, () => ribbonTip(rb.kind, rb.stage, flow, cohort), label)}
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
                    opacity={focusId && focusId !== id && !focusId.endsWith(`-${nd.stage}`) ? 0.55 : 1}
                    {...interact(
                      id,
                      { kind: 'node', stage: nd.stage },
                      () => nodeTip(nd.stage, flow),
                      `${STAGES[nd.stage]}: ${fmt(nd.value, 'int')}`,
                    )}
                  />
                )
              })}
              <g style={{ pointerEvents: 'none' }}>
                {layout.labels.map((l) => (
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
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      fontStretch: l.role === 'count' ? '84%' : undefined,
                    }}
                  >
                    {l.text}
                  </text>
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
