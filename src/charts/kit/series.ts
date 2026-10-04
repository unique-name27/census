/**
 * Series colors for the multi-series kit charts (Columns, HBars, Lines):
 *
 * - categorical identities take the fixed slots s1…s8 in series order (never cycled);
 * - ordered series (ratings 1-5, readiness, quartiles) take steps of the sequential ramp, so
 *   their order reads from light to dark and they never borrow categorical hues;
 * - a residual "Other" / "Other (k)" series is always the de-emphasis gray, takes no slot and is
 *   listed last;
 * - a view can still name colors per series.
 */
import { interpolateLab, piecewise } from 'd3'
import { type ChartTheme, seriesColor } from '../theme'
import { orderedKeys } from './shared'

/** Per-series colors: a map from series name, or a function of the name and its slot (Other excluded). */
export type SeriesColors = Record<string, string> | ((series: string, index: number) => string)

/** 'categorical' (default): fixed slots s1…s8. 'ordinal': `seriesOrder` mapped onto the sequential ramp. */
export type SeriesScheme = 'categorical' | 'ordinal'

/** A folded or residual series: "Other", or "Other (4)" as written by the fold helpers. */
export const isOtherSeries = (name: string): boolean => name === 'Other' || name.startsWith('Other (')

/** Series names with every "Other" series moved to the end (legend and stacking order). */
export function otherLast(names: readonly string[]): string[] {
  return [...names.filter((n) => !isOtherSeries(n)), ...names.filter(isOtherSeries)]
}

/**
 * `n` ordinal steps on the sequential ramp, lowest first. The first step is seq-250, the lightest
 * step that still holds about 2:1 against the sheet (in dark mode the tokens invert, so it is
 * the light theme's seq-600 value); the last is seq-700. Steps are spaced evenly in Lab.
 */
export function ordinalColors(t: ChartTheme, n: number): string[] {
  if (n <= 0) return []
  if (n === 1) return [t.seq[500]]
  const s = t.seq
  const ramp = piecewise(interpolateLab, [s[250], s[300], s[400], s[450], s[500], s[600], s[700]])
  return Array.from({ length: n }, (_, i) => ramp(i / (n - 1)))
}

/**
 * Resolved color per series name, in the order given. Explicit `colors` win (a map entry for any
 * name; the function for non-Other series); then "Other" is gray; then the scheme decides.
 * For 'ordinal', the ramp spans `order` (the declared `seriesOrder`, so a rating keeps its color
 * when a filter drops other ratings) followed by any series it doesn't list.
 */
export function seriesPalette(
  t: ChartTheme,
  names: readonly string[],
  opts: { colors?: SeriesColors; scheme?: SeriesScheme; order?: readonly string[] } = {},
): string[] {
  const { colors, scheme = 'categorical', order } = opts
  const regular = names.filter((n) => !isOtherSeries(n))
  let ordinal: Map<string, string> | null = null
  if (scheme === 'ordinal') {
    const domain = orderedKeys([...(order ?? []), ...regular].filter((n) => !isOtherSeries(n)))
    const steps = ordinalColors(t, domain.length)
    ordinal = new Map(domain.map((n, i) => [n, steps[i]]))
  }
  return names.map((name) => {
    if (colors && typeof colors === 'object' && Object.hasOwn(colors, name) && colors[name])
      return colors[name]
    if (isOtherSeries(name)) return t.deemph
    const i = regular.indexOf(name)
    if (typeof colors === 'function') {
      const c = colors(name, i)
      if (c) return c
    }
    if (ordinal) return ordinal.get(name) ?? t.deemph
    return seriesColor(t, i)
  })
}
