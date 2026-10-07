/**
 * Legend description shared by the on-screen legend (HTML above the plot) and image exports,
 * which read it back from the chart SVG's `data-legend` attribute and draw it into the picture.
 */
/** `medal`: the tier medal glyph (a disc on a ribbon), for tier-coded charts. */
export type LegendShape = 'rect' | 'line' | 'dot' | 'diamond' | 'medal'

export interface LegendSwatch {
  label: string
  /** Resolved color. */
  color: string
  /**
   * Mirrors the mark: rect for bars and areas, line for lines, dot for points, diamond for diamond
   * markers, medal for tier-coded marks (with the tier colors from `theme.tier`).
   */
  shape?: LegendShape
}

export type LegendSpec =
  | { kind: 'swatch'; items: LegendSwatch[] }
  /** Continuous ramp; `labels` are spread evenly under the ramp (min, [mid,] max). */
  | { kind: 'ramp'; colors: string[]; labels: string[]; title?: string }

export const LEGEND_ATTR = 'data-legend'

export function readLegend(svg: Element): LegendSpec | null {
  const raw = svg.getAttribute(LEGEND_ATTR)
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as LegendSpec
    return v && (v.kind === 'swatch' || v.kind === 'ramp') ? v : null
  } catch {
    return null
  }
}

/** An SVG element (tag and attributes, fill excluded) that draws a swatch. */
export interface SwatchSvg {
  tag: 'rect' | 'circle' | 'path'
  attrs: Record<string, number | string>
}

/**
 * The swatch for `shape` drawn from `x` (left edge) around the center line `cy`, as image
 * exports draw it: a 10px rounded square, a 14x2 line, an 8px dot, a 10px diamond, or a medal
 * (an 8px disc under a two-strap ribbon, as the tier badge draws it).
 */
export function swatchSvg(shape: LegendShape | undefined, x: number, cy: number): SwatchSvg {
  switch (shape) {
    case 'line':
      return { tag: 'rect', attrs: { x, y: cy - 1, width: 14, height: 2, rx: 1 } }
    case 'dot':
      return { tag: 'circle', attrs: { cx: x + 4, cy, r: 4 } }
    case 'diamond':
      return {
        tag: 'path',
        attrs: { d: `M${x + 5},${cy - 5}L${x + 10},${cy}L${x + 5},${cy + 5}L${x},${cy}Z` },
      }
    case 'medal':
      return { tag: 'path', attrs: { d: medalPath(x, cy) } }
    default:
      return { tag: 'rect', attrs: { x, y: cy - 5, width: 10, height: 10, rx: 2 } }
  }
}

/** The medal swatch as one filled path in a 10 x 12 box from `x`, centered on `cy`. */
export function medalPath(x: number, cy: number): string {
  const disc = `M${x + 1},${cy + 1.5}a4,4 0 1,0 8,0a4,4 0 1,0 -8,0Z`
  const left = `M${x + 1.6},${cy - 5.5}L${x + 3.2},${cy - 5.5}L${x + 5.4},${cy - 2.2}L${x + 3.8},${cy - 2.2}Z`
  const right = `M${x + 8.4},${cy - 5.5}L${x + 6.8},${cy - 5.5}L${x + 4.6},${cy - 2.2}L${x + 6.2},${cy - 2.2}Z`
  return `${disc}${left}${right}`
}
