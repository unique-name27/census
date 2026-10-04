/**
 * The 9-box: a 3 × 3 grid of performance (x) against potential (y). Each box shows its count and
 * share and is shaded on the sequential ramp by count, so the eye goes to where people are, not to
 * a traffic-light judgment. Clicking a box (or Enter / Space on it) opens its people in the drill
 * panel, like every other number, and lists them underneath once the panel closes; it opens with
 * no box selected so the grid, not a long list, leads the page. A row of the list opens the person.
 */
import { type KeyboardEvent, type PointerEvent, useLayoutEffect, useRef, useState } from 'react'
import {
  DataTable,
  inkOn,
  placeTip,
  renderTip,
  sequentialScale,
  TIP_CLASS,
  textWidth,
  useChartTheme,
} from '@/charts'
import { cx, IconClose } from '@/components'
import { POTENTIALS } from '@/data/schema'
import { Drill, type DrillSource, drill, openPerson } from '@/drill'
import { fmt, plural } from '@/lib/format'
import { PERF_BAND_LABEL, PERF_BANDS } from '../engine/base'
import { cellKey, type NineBoxCell } from '../engine/ninebox'
import { nineBoxPeopleColumns } from './columns'

const GAP = 4
const BOTTOM = 46

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width)
      if (w > 0) setWidth(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

export function NineBox({
  cells,
  cycle,
  drillFor,
  showRisk = true,
}: {
  cells: readonly NineBoxCell[]
  cycle?: string | null
  /** Draw the high flight-risk overlay (false below the data standard). */
  showRisk?: boolean
  /** The people behind a box, or its high flight-risk people. */
  drillFor?: (cell: NineBoxCell, part: 'all' | 'highRisk') => DrillSource
}) {
  const t = useChartTheme()
  const { ref, width } = useWidth()
  const tipRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)

  const byKey = new Map(cells.map((c) => [cellKey(c.performance, c.potential), c]))
  const max = Math.max(1, ...cells.map((c) => c.count))
  const color = sequentialScale(t, 0, max)
  const left = width < 480 ? 76 : 88
  const gridW = Math.max(0, width - left)
  const cellW = (gridW - 2 * GAP) / 3
  const cellH = Math.round(Math.min(124, Math.max(78, cellW * 0.52)))
  const height = 3 * cellH + 2 * GAP + BOTTOM
  const showLabels = cellW >= 150
  const active = selected ? byKey.get(selected) : undefined
  const rowsTopDown = [...POTENTIALS].reverse()

  const showTip = (c: NineBoxCell, e: PointerEvent<SVGGElement>) => {
    const tip = tipRef.current
    const box = ref.current
    if (!tip || !box) return
    renderTip(tip, {
      title: c.label,
      rows: [
        { value: fmt(c.count), label: c.count === 1 ? 'person' : 'people' },
        { value: fmt(c.share, 'pct'), label: 'of everyone placed' },
        ...(showRisk ? [{ value: fmt(c.highRisk), label: 'in the high flight-risk band' }] : []),
      ],
      note: c.count ? 'Click to see the records' : 'Nobody is in this box',
    })
    tip.hidden = false
    const r = box.getBoundingClientRect()
    placeTip(tip, box, e.clientX - r.left, e.clientY - r.top)
  }
  const hideTip = () => {
    if (tipRef.current) tipRef.current.hidden = true
  }
  /** Select the box (its people list underneath) and open its records. */
  const open = (c: NineBoxCell) => {
    setSelected(cellKey(c.performance, c.potential))
    hideTip()
    if (c.count && drillFor) drill(drillFor(c, 'all'))
  }
  const onKey = (c: NineBoxCell) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open(c)
    }
  }
  const font = { fontFamily: t.font }

  return (
    <div>
      <div ref={ref} className="relative" style={{ minHeight: height }}>
        {width > 0 && (
          // biome-ignore lint/a11y/useSemanticElements: an SVG chart can't be a <fieldset>; the group names the nine box buttons
          <svg
            data-chart="nine-box"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="group"
            aria-label="9-box grid of performance and potential. Select a box to see its people."
            style={{ ...font, overflow: 'visible' }}
          >
            {/* Potential axis */}
            <text
              x={10}
              y={(3 * cellH + 2 * GAP) / 2}
              transform={`rotate(-90 10 ${(3 * cellH + 2 * GAP) / 2})`}
              textAnchor="middle"
              dominantBaseline="central"
              fill={t.ink2}
              fontSize={12}
              fontWeight={600}
            >
              Potential
            </text>
            {rowsTopDown.map((pot, row) => (
              <text
                key={pot}
                x={left - 10}
                y={row * (cellH + GAP) + cellH / 2}
                textAnchor="end"
                dominantBaseline="central"
                fill={t.muted}
                fontSize={11}
              >
                {pot}
              </text>
            ))}
            {/* Performance axis */}
            {PERF_BANDS.map((perf, col) => (
              <text
                key={perf}
                x={left + col * (cellW + GAP) + cellW / 2}
                y={3 * cellH + 2 * GAP + 15}
                textAnchor="middle"
                fill={t.muted}
                fontSize={11}
              >
                {PERF_BAND_LABEL[perf]}
              </text>
            ))}
            <text
              x={left + gridW / 2}
              y={height - 6}
              textAnchor="middle"
              fill={t.ink2}
              fontSize={12}
              fontWeight={600}
            >
              Performance
            </text>
            {rowsTopDown.map((pot, row) =>
              PERF_BANDS.map((perf, col) => {
                const key = cellKey(perf, pot)
                const c = byKey.get(key)
                if (!c) return null
                const x = left + col * (cellW + GAP)
                const y = row * (cellH + GAP)
                const fill = c.count ? color(c.count) : t.sheet2
                const ink = c.count ? inkOn(t, fill) : t.muted
                const isSel = selected === key
                const isHover = hover === key
                const shareText = c.share == null ? '—' : fmt(c.share, 'pct')
                const label = c.label.replace(/^./, (m) => m.toUpperCase())
                const labelFits = showLabels && textWidth(label, 11) <= cellW - 20
                return (
                  // biome-ignore lint/a11y/useSemanticElements: an SVG group can't be a <button>; it carries the button role and keys
                  <g
                    key={key}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSel}
                    aria-label={`${label}: ${plural(c.count, 'person', 'people')}, ${shareText}`}
                    onClick={() => open(c)}
                    onKeyDown={onKey(c)}
                    onPointerEnter={(e) => {
                      setHover(key)
                      showTip(c, e)
                    }}
                    onPointerMove={(e) => showTip(c, e)}
                    onPointerLeave={() => {
                      setHover(null)
                      hideTip()
                    }}
                    onFocus={() => setFocus(key)}
                    onBlur={() => setFocus(null)}
                    style={{ cursor: 'pointer', outline: 'none' }}
                  >
                    <rect x={x} y={y} width={cellW} height={cellH} rx={4} fill={fill} />
                    {(isSel || isHover) && (
                      <rect
                        x={x + 1}
                        y={y + 1}
                        width={cellW - 2}
                        height={cellH - 2}
                        rx={3.5}
                        fill="none"
                        stroke={t.ink}
                        strokeWidth={isSel ? 2 : 1}
                      />
                    )}
                    {focus === key && (
                      <rect
                        x={x - 2}
                        y={y - 2}
                        width={cellW + 4}
                        height={cellH + 4}
                        rx={5}
                        fill="none"
                        stroke="var(--focus)"
                        strokeWidth={2}
                      />
                    )}
                    {labelFits && (
                      <text x={x + 10} y={y + 17} fill={ink} fontSize={11} opacity={0.9}>
                        {label}
                      </text>
                    )}
                    <text
                      x={x + 10}
                      y={y + cellH - (showLabels ? 30 : 26)}
                      fill={ink}
                      fontSize={showLabels ? 24 : 20}
                      fontWeight={600}
                      style={{ fontStretch: '84%' }}
                    >
                      {fmt(c.count)}
                    </text>
                    <text x={x + 10} y={y + cellH - 11} fill={ink} fontSize={12}>
                      {shareText}
                      {showRisk && showLabels && c.highRisk > 0 ? ` · ${fmt(c.highRisk)} high risk` : ''}
                    </text>
                  </g>
                )
              }),
            )}
          </svg>
        )}
        <div ref={tipRef} className={TIP_CLASS} hidden aria-hidden="true" />
      </div>
      {active ? (
        <div className="mt-3 border-t border-rule pt-3">
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-[13px] font-semibold [font-stretch:100%]">
              {active.label.replace(/^./, (m) => m.toUpperCase())}
              <span className="ml-1.5 font-normal text-muted">
                <Drill
                  spec={active.count && drillFor ? drillFor(active, 'all') : null}
                  label={`Show the ${plural(active.count, 'person', 'people')} in this box`}
                >
                  {plural(active.count, 'person', 'people')}
                </Drill>
                {showRisk && active.highRisk > 0 && (
                  <>
                    {' · '}
                    <Drill
                      spec={drillFor ? drillFor(active, 'highRisk') : null}
                      label={`Show the ${fmt(active.highRisk)} in the high flight-risk band`}
                    >
                      {fmt(active.highRisk)} in the high flight-risk band
                    </Drill>
                  </>
                )}
              </span>
            </h4>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="ml-auto inline-flex h-6 items-center gap-1 rounded-control px-1.5 text-[12px] text-ink-2 hover:bg-hover hover:text-ink"
            >
              <IconClose className="size-3.5" />
              Clear
            </button>
          </div>
          <DataTable
            columns={nineBoxPeopleColumns(cycle, showRisk)}
            rows={active.people}
            maxRows={10}
            search={active.people.length > 10 ? 'Search people' : undefined}
            caption={`People in the box ${active.label}`}
            rowKey={(r) => r.employeeId}
            onRowClick={(r) => openPerson(r.employeeId)}
            emptyText="Nobody is in this box."
          />
        </div>
      ) : (
        <p className={cx('mt-2 text-[12px] text-muted')}>Select a box to see the people in it.</p>
      )}
    </div>
  )
}
