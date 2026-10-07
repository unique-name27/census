/**
 * The field quality matrix: one row per dataset, one square per field (in the order the Quality
 * panel lists them: required first), shaded on the sequential ramp by fill rate, so a square far
 * from the 100% end is a hole in the data. A field short of silver on its own carries a ring in
 * the warning color and a dot, so the state never rests on color alone; a slash marks a field
 * whose blanks are normal; a field blank in every row is an empty dashed square. Hovering names the field and its numbers; clicking (or Enter) opens the blank,
 * not recognized or defaulted rows behind it. Arrow keys move between squares.
 */
import { type KeyboardEvent, type PointerEvent, useLayoutEffect, useRef, useState } from 'react'
import { placeTip, renderTip, sequentialScale, TIP_CLASS, truncateText, useChartTheme } from '@/charts'
import { cx } from '@/components/ui'
import { TIER_LABEL, type Tier } from '@/data/quality/tier'
import { type DatasetKey, datasetDef } from '@/data/schema'
import { fmt } from '@/lib/format'
import { cellFillText, type FieldCell } from './engine/summary'

const MAX_CELL = 26
/** Squares never shrink below this; on a phone a 20-field row still fits at about 9 px. */
const MIN_CELL = 6
/** Fill rates at or below this share all take the palest step, so 95% and 100% still differ. */
export const MATRIX_FLOOR = 0.5

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

export interface MatrixRow {
  key: DatasetKey
  cells: readonly FieldCell[]
  /** The dataset's own tier. */
  tier: Tier
}

export function FieldMatrix({
  rows,
  minCoverage,
  focus,
  onOpen,
}: {
  rows: readonly MatrixRow[]
  minCoverage: number
  /** A dataset to highlight. */
  focus?: DatasetKey | null
  /** Open the problem rows behind a cell; nothing happens for a cell without any. */
  onOpen: (cell: FieldCell) => void
}) {
  const t = useChartTheme()
  const { ref, width } = useWidth()
  const tipRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  // The focus ring shows while a square has keyboard focus.
  const [focused, setFocused] = useState(false)
  const cellRefs = useRef(new Map<string, SVGGElement>())

  const narrow = width < 520
  const labelW = narrow ? 80 : 148
  const GAP = narrow ? 2 : 3
  const most = Math.max(1, ...rows.map((r) => r.cells.length))
  // The widest row fills the width: every square fits without scrolling sideways.
  const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor((width - labelW - 4) / most - GAP)))
  const rowH = Math.max(cell + GAP + 6, 18)
  const height = rows.length * rowH
  const color = sequentialScale(t, MATRIX_FLOOR, 1)
  const font = { fontFamily: t.font }

  const showTip = (row: MatrixRow, c: FieldCell, x: number, y: number) => {
    const tip = tipRef.current
    const box = ref.current
    if (!tip || !box) return
    // Distinct rows with a gap, as the drill opens them.
    const problems = c.problems
    renderTip(tip, {
      title: `${datasetDef(row.key).label} · ${c.field}`,
      rows: [
        { value: c.coverage == null ? '—' : cellFillText(c, minCoverage).split(' ')[0], label: 'filled' },
        { value: fmt(c.blank, 'int'), label: c.blankOk ? 'blank, which is normal here' : 'blank' },
        {
          value: fmt(c.invalid, 'int'),
          label: c.invalidBlank
            ? `not recognized (${fmt(c.invalidBlank, 'int')} left blank at import, so also blank)`
            : 'not recognized',
        },
        ...(c.defaulted ? [{ value: fmt(c.defaulted, 'int'), label: 'filled by a default' }] : []),
        { value: TIER_LABEL[c.tier], label: 'tier' },
      ],
      note:
        c.why ||
        (c.scope ? `Counts ${c.scope.charAt(0).toLowerCase()}${c.scope.slice(1)}. ` : '') +
          (problems ? 'Click to see the rows.' : 'No gaps to show.'),
    })
    tip.hidden = false
    placeTip(tip, box, x, y)
  }
  const onPointer = (row: MatrixRow, c: FieldCell) => (e: PointerEvent<SVGGElement>) => {
    const box = ref.current
    if (!box) return
    const r = box.getBoundingClientRect()
    showTip(row, c, e.clientX - r.left, e.clientY - r.top)
  }
  const hideTip = () => {
    if (tipRef.current) tipRef.current.hidden = true
  }

  const move = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(rows.length - 1, r))
    const cc = Math.max(0, Math.min(rows[rr].cells.length - 1, c))
    setActive({ r: rr, c: cc })
    cellRefs.current.get(`${rr}:${cc}`)?.focus()
  }
  const onKey = (ri: number, ci: number) => (e: KeyboardEvent<SVGGElement>) => {
    const row = rows[ri]
    const c = row.cells[ci]
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      hideTip()
      onOpen(c)
      return
    }
    const step: Record<string, [number, number]> = {
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
    }
    const d = step[e.key]
    const to: [number, number] | null =
      e.key === 'Home'
        ? [ri, 0]
        : e.key === 'End'
          ? [ri, row.cells.length - 1]
          : d
            ? [ri + d[0], ci + d[1]]
            : null
    if (!to) return
    e.preventDefault()
    move(to[0], to[1])
  }

  return (
    <div>
      <div ref={ref} className="relative" style={{ minHeight: height }}>
        {width > 0 && (
          // biome-ignore lint/a11y/useSemanticElements: an SVG chart can't be a <fieldset>; the group names the field squares
          <svg
            data-chart="field-matrix"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="group"
            aria-label="Field quality matrix: one row per dataset, one square per field, shaded by fill rate. Select a square to see its blank or invalid rows."
            style={{ ...font, overflow: 'visible' }}
            onPointerLeave={hideTip}
          >
            {rows.map((row, ri) => {
              const y = ri * rowH
              const isFocus = focus === row.key
              const label = datasetDef(row.key).label
              return (
                <g key={row.key}>
                  {isFocus && <rect x={0} y={y - 2} width={width} height={cell + 4} rx={3} fill={t.sheet2} />}
                  <text
                    x={0}
                    y={y + cell / 2}
                    dominantBaseline="central"
                    fill={isFocus ? t.ink : t.ink2}
                    fontSize={12}
                    fontWeight={isFocus ? 600 : 400}
                  >
                    {truncateText(label, labelW - 10, 12)}
                    {label.length > 0 && <title>{label}</title>}
                  </text>
                  {row.cells.map((c, ci) => {
                    const x = labelW + ci * (cell + GAP)
                    const none = c.tier === 'none'
                    const na = c.coverage == null
                    const fill = none || na ? t.sheet2 : color(c.coverage as number)
                    const ring = c.short
                    const isActive = active.r === ri && active.c === ci
                    const problems = c.problems
                    const name = `${label}, ${c.field}: ${na ? 'applies to no row' : cellFillText(c, minCoverage)}, ${TIER_LABEL[c.tier]}${problems ? `. Show the ${fmt(problems, 'int')} rows with a gap` : ''}`
                    return (
                      // biome-ignore lint/a11y/useSemanticElements: an SVG square can't be a <button>
                      <g
                        key={c.ref}
                        ref={(el) => {
                          if (el) cellRefs.current.set(`${ri}:${ci}`, el)
                          else cellRefs.current.delete(`${ri}:${ci}`)
                        }}
                        role="button"
                        tabIndex={isActive ? 0 : -1}
                        aria-label={name}
                        className={cx('outline-none', problems ? 'cursor-pointer' : 'cursor-default')}
                        onPointerMove={onPointer(row, c)}
                        onFocus={() => {
                          setActive({ r: ri, c: ci })
                          setFocused(true)
                          showTip(row, c, x + cell, y + cell)
                        }}
                        onBlur={() => {
                          setFocused(false)
                          hideTip()
                        }}
                        onClick={() => {
                          setActive({ r: ri, c: ci })
                          hideTip()
                          onOpen(c)
                        }}
                        onKeyDown={onKey(ri, ci)}
                      >
                        <rect
                          x={x}
                          y={y}
                          width={cell}
                          height={cell}
                          rx={2}
                          fill={fill}
                          stroke={none ? t.muted : ring ? t.status.warning : na ? t.grid : 'none'}
                          strokeWidth={none || na ? 1 : ring ? 1.5 : 0}
                          strokeDasharray={none ? '2 2' : undefined}
                        />
                        {/* A slash: blanks are normal here, so a low fill is not a gap. */}
                        {c.blankOk && !none && !na && (
                          <path
                            d={`M${x + 2} ${y + cell - 2}L${x + cell - 2} ${y + 2}`}
                            stroke={t.sheet}
                            strokeWidth={1.5}
                            strokeLinecap="round"
                          />
                        )}
                        {ring && cell >= 12 && (
                          <circle
                            cx={x + cell / 2}
                            cy={y + cell / 2}
                            r={Math.max(1.5, cell / 9)}
                            fill={t.status.warning}
                          />
                        )}
                        {isActive && focused && (
                          <rect
                            x={x - 2}
                            y={y - 2}
                            width={cell + 4}
                            height={cell + 4}
                            rx={3}
                            fill="none"
                            stroke={t.ink}
                            strokeWidth={1.5}
                          />
                        )}
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </svg>
        )}
        <div ref={tipRef} hidden className={TIP_CLASS} />
      </div>
      <MatrixLegend />
    </div>
  )
}

/** The ramp from the floor to 100% filled and each mark on a square, in words. */
function MatrixLegend() {
  const t = useChartTheme()
  const color = sequentialScale(t, MATRIX_FLOOR, 1)
  const stops = [0.5, 0.625, 0.75, 0.875, 1]
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-meta text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <span className="tnum text-muted">{`≤${fmt(MATRIX_FLOOR, 'pct0')}`}</span>
        <span className="inline-flex" aria-hidden="true">
          {stops.map((s) => (
            <span key={s} className="h-3 w-5" style={{ background: color(s) }} />
          ))}
        </span>
        <span className="tnum text-muted">100% filled</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect
            x="1"
            y="1"
            width="12"
            height="12"
            rx="2"
            fill={color(0.9)}
            stroke={t.status.warning}
            strokeWidth="1.5"
          />
          <circle cx="7" cy="7" r="1.6" fill={t.status.warning} />
        </svg>
        Short of silver on its own
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="1" y="1" width="12" height="12" rx="2" fill={color(0.7)} />
          <path d="M3 11L11 3" stroke={t.sheet} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Blanks are normal
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="1.5" y="1.5" width="11" height="11" rx="2" fill={t.sheet2} stroke={t.grid} />
        </svg>
        Applies to no row
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect
            x="1"
            y="1"
            width="12"
            height="12"
            rx="2"
            fill={t.sheet2}
            stroke={t.muted}
            strokeDasharray="2 2"
          />
        </svg>
        Blank in every row
      </span>
    </div>
  )
}
