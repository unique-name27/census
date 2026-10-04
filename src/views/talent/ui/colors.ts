/** Resolved series colors for Talent charts whose series are ordered states. */
import { type ChartTheme, ordinalColors, seriesColor } from '@/charts'
import { READINESS } from '@/data/schema'

/**
 * Successor readiness is ordinal, so it takes the sequential ramp (ready now darkest); "No
 * successor" is a state, so it takes the critical status color and keeps its label in the legend.
 */
export function readinessColors(t: ChartTheme): Record<string, string> {
  const steps = ordinalColors(t, READINESS.length)
  const out: Record<string, string> = { 'No successor': t.status.critical }
  READINESS.forEach((r, i) => {
    out[r] = steps[READINESS.length - 1 - i]
  })
  return out
}

/** The scope in the series color, the company it is compared with in gray. */
export function scopeColors(t: ChartTheme): Record<string, string> {
  return { 'This scope': seriesColor(t, 0), Company: t.deemph }
}
