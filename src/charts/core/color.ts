/**
 * Color jobs for the chart kit, all returning resolved colors from the ChartTheme so SVG
 * attributes and exported images never depend on CSS variables.
 */
import { color as d3color, interpolateLab, piecewise } from 'd3'
import type { ChartTheme } from '../theme'

/** Mark tone: the default series color, de-emphasis gray, or a status color (state only). */
export type Tone = 'default' | 'deemph' | 'good' | 'warning' | 'serious' | 'critical'

export function toneColor(t: ChartTheme, tone: Tone | null | undefined): string {
  switch (tone) {
    case 'deemph':
      return t.deemph
    case 'good':
    case 'warning':
    case 'serious':
    case 'critical':
      return t.status[tone]
    default:
      return t.series[0]
  }
}

/** Status tones carry a glyph beside their value so state never depends on color alone. */
export const isStatusTone = (
  tone: Tone | null | undefined,
): tone is 'good' | 'warning' | 'serious' | 'critical' =>
  tone === 'good' || tone === 'warning' || tone === 'serious' || tone === 'critical'

/** WCAG relative luminance (0 black … 1 white); NaN for unparseable input. */
export function luminance(c: string): number {
  const rgb = d3color(c)?.rgb()
  if (!rgb) return Number.NaN
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** Ink for text set inside a filled mark: whichever of the theme's darkest and lightest inks reads better. */
export function inkOn(t: ChartTheme, fill: string): string {
  const lf = luminance(fill)
  const [dark, light] = luminance(t.ink) < luminance(t.sheet) ? [t.ink, t.sheet] : [t.sheet, t.ink]
  if (!Number.isFinite(lf)) return t.ink
  return contrast(lf, luminance(dark)) >= contrast(lf, luminance(light)) ? dark : light
}

/** Sequential stops, light to dark in light mode (the tokens invert them for dark mode). */
export function seqStops(t: ChartTheme): string[] {
  const s = t.seq
  return [s[100], s[200], s[300], s[400], s[500], s[600], s[700]]
}

/** Map a value in [lo, hi] onto the sequential ramp. */
export function sequentialScale(t: ChartTheme, lo: number, hi: number): (v: number) => string {
  const ramp = piecewise(interpolateLab, seqStops(t))
  const span = hi - lo || 1
  return (v) => ramp(Math.min(1, Math.max(0, (v - lo) / span)))
}

/** Map a value onto the diverging ramp with `mid` on the neutral midpoint; each side scales independently. */
export function divergingScale(t: ChartTheme, lo: number, mid: number, hi: number): (v: number) => string {
  const neg = piecewise(interpolateLab, [t.div[3], t.div[2], t.div[1], t.div[0]])
  const pos = piecewise(interpolateLab, [t.div[3], t.div[4], t.div[5], t.div[6]])
  return (v) => {
    if (v >= mid) return pos(hi === mid ? 0 : Math.min(1, (v - mid) / (hi - mid)))
    return neg(lo === mid ? 0 : Math.min(1, (mid - v) / (mid - lo)))
  }
}
