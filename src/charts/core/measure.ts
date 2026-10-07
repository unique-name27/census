/**
 * Text metrics for laying out charts before Plot draws them: margins that fit the longest
 * category label, value labels that only go inside a bar when they fit, truncation with an
 * ellipsis. Measured with a canvas in the app font; widths are cached and the cache is dropped
 * when web fonts finish loading (charts re-render on that signal).
 */
import { useSyncExternalStore } from 'react'

let ctx: CanvasRenderingContext2D | null | undefined
let family = 'sans-serif'
const cache = new Map<string, number>()

function context(): CanvasRenderingContext2D | null {
  if (ctx === undefined) {
    if (typeof document === 'undefined') {
      ctx = null
    } else {
      ctx = document.createElement('canvas').getContext('2d')
      family = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() || family
    }
  }
  return ctx
}

/** Rendered width in px of `text` at `size` px and `weight` in the app font. */
export function textWidth(text: string, size = 11, weight = 400): number {
  const key = `${size}|${weight}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const c = context()
  let w: number
  if (c) {
    c.font = `${weight} ${size}px ${family}`
    w = c.measureText(text).width
  } else {
    w = text.length * size * 0.56
  }
  if (cache.size > 5000) cache.clear()
  cache.set(key, w)
  return w
}

export function maxTextWidth(texts: Iterable<string>, size = 11, weight = 400): number {
  let max = 0
  for (const t of texts) max = Math.max(max, textWidth(t, size, weight))
  return max
}

/** `text` shortened with an ellipsis so it fits `maxWidth`. */
export function truncateText(text: string, maxWidth: number, size = 11, weight = 400): string {
  if (textWidth(text, size, weight) <= maxWidth) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (textWidth(`${text.slice(0, mid).trimEnd()}…`, size, weight) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return lo > 0 ? `${text.slice(0, lo).trimEnd()}…` : '…'
}

/**
 * `text` broken at spaces into at most `maxLines` lines that each fit `maxWidth`; the last line
 * is shortened with an ellipsis when the rest does not fit. One line when it fits as is.
 *
 *   wrapText('Export control & trade compliance', 120, 12) // ['Export control & trade', 'compliance']
 */
export function wrapText(text: string, maxWidth: number, size = 11, weight = 400, maxLines = 2): string[] {
  const fits = (s: string) => textWidth(s, size, weight) <= maxWidth
  if (fits(text) || maxLines <= 1) return [truncateText(text, maxWidth, size, weight)]
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let k = 0
  while (k < words.length && lines.length < maxLines - 1) {
    let line = words[k++]
    while (k < words.length && fits(`${line} ${words[k]}`)) line = `${line} ${words[k++]}`
    lines.push(truncateText(line, maxWidth, size, weight))
  }
  if (k < words.length) lines.push(truncateText(words.slice(k).join(' '), maxWidth, size, weight))
  return lines
}

/* Font readiness: a version number that bumps whenever a web font finishes loading. */

let fontsVersion = 0
const listeners = new Set<() => void>()
let wired = false

function wire() {
  if (wired || typeof document === 'undefined' || !document.fonts) return
  wired = true
  const bump = () => {
    cache.clear()
    fontsVersion++
    for (const l of listeners) l()
  }
  document.fonts.addEventListener('loadingdone', bump)
  void document.fonts.ready.then(bump)
}

function subscribe(cb: () => void) {
  wire()
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Changes when fonts finish loading, so measured layouts can be redone. */
export function useFontsVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => fontsVersion,
    () => 0,
  )
}
