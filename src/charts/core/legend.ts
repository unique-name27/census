/**
 * Legend description shared by the on-screen legend (HTML above the plot) and image exports,
 * which read it back from the chart SVG's `data-legend` attribute and draw it into the picture.
 */
export type LegendShape = 'rect' | 'line' | 'dot'

export interface LegendSwatch {
  label: string
  /** Resolved color. */
  color: string
  /** Mirrors the mark: rect for bars and areas, line for lines, dot for points. */
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
