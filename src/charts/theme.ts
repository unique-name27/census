/**
 * Resolved chart colors for the current theme. SVG presentation attributes can't read CSS
 * variables, and exported PNGs need literal colors, so charts read concrete values from the
 * tokens and re-render when the theme flips (OS setting or the in-app toggle).
 */
import { useSyncExternalStore } from 'react'

export interface ChartTheme {
  /** Categorical series, fixed order. */
  series: string[]
  deemph: string
  seq: {
    100: string
    200: string
    250: string
    300: string
    400: string
    450: string
    500: string
    600: string
    700: string
  }
  /** Diverging ramp, negative to positive: [neg3, neg2, neg1, mid, pos1, pos2, pos3]. */
  div: string[]
  status: { good: string; warning: string; serious: string; critical: string }
  /** Tier medal colors for SVG glyphs (always paired with the word). */
  tier: { gold: string; silver: string; bronze: string }
  goodText: string
  badText: string
  ink: string
  ink2: string
  muted: string
  grid: string
  axis: string
  rule: string
  sheet: string
  sheet2: string
  /** The third sheet tone: tracks and wells inside a sheet (bullet tracks). */
  sheet3: string
  page: string
  font: string
  dark: boolean
}

let version = 0
const listeners = new Set<() => void>()
// Retained so the change listener isn't garbage-collected.
let media: MediaQueryList | null = null
let observer: MutationObserver | null = null
let cached: { v: number; theme: ChartTheme } | null = null

function wire() {
  if (observer || typeof window === 'undefined') return
  const bump = () => {
    version++
    for (const l of listeners) l()
  }
  media = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
  media?.addEventListener?.('change', bump)
  observer = new MutationObserver(bump)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}

function subscribe(cb: () => void) {
  wire()
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function readChartTheme(): ChartTheme {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string) => cs.getPropertyValue(name).trim()
  return {
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--s${i}`)),
    deemph: v('--deemph'),
    seq: {
      100: v('--seq-100'),
      200: v('--seq-200'),
      250: v('--seq-250'),
      300: v('--seq-300'),
      400: v('--seq-400'),
      450: v('--seq-450'),
      500: v('--seq-500'),
      600: v('--seq-600'),
      700: v('--seq-700'),
    },
    div: [
      '--div-neg-3',
      '--div-neg-2',
      '--div-neg-1',
      '--div-mid',
      '--div-pos-1',
      '--div-pos-2',
      '--div-pos-3',
    ].map(v),
    status: {
      good: v('--good'),
      warning: v('--warning'),
      serious: v('--serious'),
      critical: v('--critical'),
    },
    tier: { gold: v('--tier-gold'), silver: v('--tier-silver'), bronze: v('--tier-bronze') },
    goodText: v('--good-text'),
    badText: v('--bad-text'),
    ink: v('--ink'),
    ink2: v('--ink-2'),
    muted: v('--muted'),
    grid: v('--grid'),
    axis: v('--axis'),
    rule: v('--rule'),
    sheet: v('--sheet'),
    sheet2: v('--sheet-2'),
    sheet3: v('--sheet-3'),
    page: v('--page'),
    font: v('--font-sans'),
    dark: cs.colorScheme.includes('dark'),
  }
}

/** Resolved theme for a version; recomputed only when the version moves. */
export function themeAt(v: number): ChartTheme {
  if (!cached || cached.v !== v) cached = { v, theme: readChartTheme() }
  return cached.theme
}

/**
 * Theme-aware resolved colors; the component re-renders when the theme changes. The version is
 * passed through themeAt (not a useMemo dependency) so the React Compiler can't cache a stale read.
 */
export function useChartTheme(): ChartTheme {
  const v = useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  )
  return themeAt(v)
}

/** Series color by index (0-based), never cycled: index ≥ 8 returns the de-emphasis gray. */
export function seriesColor(t: ChartTheme, i: number): string {
  return i >= 0 && i < t.series.length ? t.series[i] : t.deemph
}
