/**
 * Observable Plot inside React.
 *
 * <PlotChart build={({ width, theme }) => housePlot(ctx, {...})} height={240} /> renders the plot
 * at its container's width, rebuilds it when the width, theme or loaded fonts change, and owns
 * the interaction layer: an HTML tooltip that follows the pointer (fed by Plot's pointer
 * transform through the plot's `value`), the pointer cursor, and click-to-drill (`onSelect`).
 *
 * Colors passed to Plot are resolved values from useChartTheme(), never CSS variables, so the
 * exported PNG/SVG match the screen.
 */
import * as Plot from '@observablehq/plot'
import { type RefObject, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { cx } from '@/components/ui'
import { type Format, fmt, MINUS } from '@/lib/format'
import { LEGEND_ATTR, type LegendSpec } from './core/legend'
import { HOVER_CLASS } from './core/marks'
import { useFontsVersion } from './core/measure'
import { placeTip, renderTip, TIP_CLASS, type TipContent } from './core/tooltip'
import { Legend } from './Legend'
import type { ChartTheme } from './theme'
import { useChartTheme } from './theme'

export interface PlotBuildContext {
  /** Container width in px. */
  width: number
  theme: ChartTheme
}

export type PlotElement = (SVGSVGElement | HTMLElement) & Plot.Plot

/** Plot.plot with the Census house defaults (font, transparent background, class for the house CSS). */
export function housePlot({ width, theme }: PlotBuildContext, options: Plot.PlotOptions): PlotElement {
  const style = typeof options.style === 'object' && options.style ? options.style : {}
  return Plot.plot({
    width,
    className: 'census-plot',
    ...options,
    style: {
      fontFamily: theme.font,
      fontSize: '11px',
      color: theme.ink2,
      background: 'transparent',
      overflow: 'visible',
      ...style,
    },
  })
}

/* ───────── axis, grid and baseline helpers (hairline, muted, no domain line) ───────── */

export function axisX(t: ChartTheme, options: Plot.AxisXOptions = {}): Plot.CompoundMark {
  return Plot.axisX({ tickSize: 0, tickPadding: 8, label: null, color: t.muted, ...options })
}

export function axisY(t: ChartTheme, options: Plot.AxisYOptions = {}): Plot.CompoundMark {
  return Plot.axisY({ tickSize: 0, tickPadding: 8, label: null, color: t.muted, ...options })
}

export function gridX(t: ChartTheme, options: Plot.GridXOptions = {}): Plot.RuleX {
  return Plot.gridX({ stroke: t.grid, strokeOpacity: 1, strokeWidth: 1, ...options })
}

export function gridY(t: ChartTheme, options: Plot.GridYOptions = {}): Plot.RuleY {
  return Plot.gridY({ stroke: t.grid, strokeOpacity: 1, strokeWidth: 1, ...options })
}

/** The one strong axis line: the zero baseline bars grow from. */
export function baseline(t: ChartTheme, axis: 'x' | 'y', value = 0): Plot.RuleX | Plot.RuleY {
  return axis === 'y'
    ? Plot.ruleY([value], { stroke: t.axis, strokeWidth: 1 })
    : Plot.ruleX([value], { stroke: t.axis, strokeWidth: 1 })
}

/** Tick labels in the column's unit, trimmed where the full format is noisy (10% not 10.0%). */
export function tickFormat(format: Format): (v: number) => string {
  return (v) => {
    if (typeof v !== 'number') return String(v)
    if ((format === 'pct' || format === 'pct2') && Math.abs(v * 100 - Math.round(v * 100)) < 1e-9)
      return fmt(v, 'pct0')
    if (format === 'pct2' && Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-9) return fmt(v, 'pct')
    if (format === 'moneyFull') return fmt(v, 'money')
    if (format === 'int' && Math.abs(v) >= 10_000) return fmt(v, 'compact')
    if ((format === 'num1' || format === 'years') && Number.isInteger(v)) {
      const n = `${v < 0 ? MINUS : ''}${Math.abs(v)}`
      return format === 'years' ? `${n} yrs` : n
    }
    if (format === 'times' && Number.isInteger(v)) return `${v < 0 ? MINUS : ''}${Math.abs(v)}×`
    return fmt(v, format)
  }
}

/* ───────── PlotChart ───────── */

function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width)
      // Hidden (table view) containers measure 0; keep the last real width so the chart stays exportable.
      if (w > 0) setWidth(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

export interface PlotChartProps<P> {
  /** Build the plot for a width and theme; return null to render nothing. */
  build: (ctx: PlotBuildContext) => PlotElement | null
  /** Plot height in px, reserved before the first render so the layout doesn't jump. */
  height: number
  /** Tooltip content for the hovered datum (the `value` of the plot's pointer mark). */
  tip?: (d: P) => TipContent | null
  /** Click-to-drill on the hovered datum. */
  onSelect?: (d: P) => void
  /** Legend shown above the plot and drawn into exported images. */
  legend?: LegendSpec | null
  /** Accessible name of the chart image. */
  ariaLabel?: string
  className?: string
}

export function PlotChart<P>({
  build,
  height,
  tip,
  onSelect,
  legend,
  ariaLabel,
  className,
}: PlotChartProps<P>) {
  const boxRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(boxRef)
  const theme = useChartTheme()
  const fontsVersion = useFontsVersion()
  const legendAttr = legend ? JSON.stringify(legend) : null

  const describe = useEffectEvent((value: unknown): TipContent | null => {
    if (value == null || !tip) return null
    const content = tip(value as P)
    // Clickable marks say so, so readers learn every number opens the records behind it.
    return content && onSelect && !content.note ? { ...content, note: 'Click to see the records' } : content
  })
  const canSelect = useEffectEvent(() => onSelect !== undefined)
  const select = useEffectEvent((value: unknown) => {
    if (value != null) onSelect?.(value as P)
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: fontsVersion re-runs layout measured in the old font
  useLayoutEffect(() => {
    const host = plotRef.current
    const box = boxRef.current
    const tipEl = tipRef.current
    if (!host || !box || !tipEl || width <= 0) return
    const node = build({ width, theme })
    if (!node) {
      host.replaceChildren()
      return
    }
    if (legendAttr) node.setAttribute(LEGEND_ATTR, legendAttr)
    if (ariaLabel) {
      node.setAttribute('role', 'img')
      node.setAttribute('aria-label', ariaLabel)
    }
    host.replaceChildren(node)

    let pos = { x: 0, y: 0 }
    let shown = false
    let sticky = false
    let unpinning = false
    const hide = () => {
      shown = false
      tipEl.hidden = true
      box.style.cursor = ''
    }
    const show = () => {
      const content = describe(node.value)
      if (!content) {
        hide()
        box.style.cursor = canSelect() && node.value != null ? 'pointer' : ''
        return
      }
      renderTip(tipEl, content)
      tipEl.hidden = false
      shown = true
      placeTip(tipEl, box, pos.x, pos.y)
      box.style.cursor = canSelect() ? 'pointer' : ''
    }
    const onInput = () => (node.value == null ? hide() : show())
    const onMove = (e: PointerEvent) => {
      const r = box.getBoundingClientRect()
      pos = { x: e.clientX - r.left, y: e.clientY - r.top }
      if (shown && !sticky) placeTip(tipEl, box, pos.x, pos.y)
    }
    // Plot pins the tooltip on click; mirror that so a pinned tooltip stops following the pointer.
    const onDown = (e: PointerEvent) => {
      if (unpinning || e.pointerType !== 'mouse' || node.value == null) return
      const inPointerMark = e.target instanceof Element && e.target.closest(`.${HOVER_CLASS}`) !== null
      sticky = sticky ? inPointerMark : true
    }
    const onClick = () => {
      if (node.value == null || !canSelect()) return
      select(node.value)
      // A click that drills should not leave the tooltip pinned; a second pointerdown unpins it.
      if (sticky) {
        unpinning = true
        node.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true }))
        unpinning = false
        sticky = false
      }
    }
    hide()
    node.addEventListener('input', onInput)
    node.addEventListener('click', onClick)
    box.addEventListener('pointermove', onMove)
    box.addEventListener('pointerdown', onDown, { capture: true })
    return () => {
      node.removeEventListener('input', onInput)
      node.removeEventListener('click', onClick)
      box.removeEventListener('pointermove', onMove)
      box.removeEventListener('pointerdown', onDown, { capture: true })
      node.remove()
      hide()
    }
  }, [build, width, theme, fontsVersion, legendAttr, ariaLabel])

  return (
    <div className={cx('min-w-0', className)}>
      {legend && <Legend spec={legend} className="mb-2" />}
      <div ref={boxRef} className="relative">
        <div ref={plotRef} style={{ minHeight: height }} />
        <div ref={tipRef} className={TIP_CLASS} hidden aria-hidden="true" />
      </div>
    </div>
  )
}
