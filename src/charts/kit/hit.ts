/**
 * Pure geometry for pointer hit-testing and label placement in the kit (no DOM, unit-tested):
 * which grouped bar, stacked segment or line sits under the pointer, and where a value label
 * must go so a reference rule never runs through it.
 */

/** Grouped bars inside one band: bar size, offset of the first bar from the band start, gap. */
export interface GroupLayout {
  size: number
  start: number
  gap: number
}

/**
 * Lay `n` grouped bars side by side, centered in a band of `step` px, using about `room` px of
 * it; bars are 2 to `max` px thick with a `gap` between them.
 */
export function groupLayout(step: number, n: number, room: number, gap = 2, max = 24): GroupLayout {
  const k = Math.max(1, n)
  const size = Math.max(2, Math.min(max, (room - (k - 1) * gap) / k))
  return { size, start: (step - (k * size + (k - 1) * gap)) / 2, gap }
}

/**
 * Index of the grouped bar at `offset` px into the band (halfway through a gap counts for the
 * nearer bar), or null when the pointer is outside the group by more than `slack` px.
 */
export function groupIndexAt(offset: number, g: GroupLayout, n: number, slack = 4): number | null {
  if (n <= 0 || !Number.isFinite(offset)) return null
  const end = g.start + n * g.size + (n - 1) * g.gap
  if (offset < g.start - slack || offset > end + slack) return null
  const i = Math.floor((offset - g.start + g.gap / 2) / (g.size + g.gap))
  return Math.min(n - 1, Math.max(0, i))
}

/** The segment of category `cat` whose [lo, hi] holds `v` (a value on the stacked axis), or null. */
export function segmentAt<S extends { cat: string; lo: number; hi: number }>(
  segments: readonly S[],
  cat: string,
  v: number,
): S | null {
  if (!Number.isFinite(v)) return null
  return segments.find((s) => s.cat === cat && v >= s.lo && v <= s.hi) ?? null
}

/** The item whose pixel position is nearest `at` (the first on ties), skipping non-finite positions. */
export function nearestBy<I>(items: readonly I[], pos: (item: I) => number, at: number): I | null {
  let best: I | null = null
  let bestD = Number.POSITIVE_INFINITY
  for (const it of items) {
    const p = pos(it)
    if (!Number.isFinite(p)) continue
    const d = Math.abs(p - at)
    if (d < bestD) {
      best = it
      bestD = d
    }
  }
  return best
}

/**
 * Where a label `width` px long that wants to start at `start` must start so that no rule
 * (pixel positions on the same axis) runs through it or within `gap` px of it. The label only
 * moves forward, past each rule it would touch, so it stays beyond the end of its bar.
 */
export function clearOfRules(start: number, width: number, rules: readonly number[], gap = 4): number {
  let s = start
  for (const r of [...rules].filter(Number.isFinite).sort((a, b) => a - b)) {
    if (r >= s - gap && r <= s + width + gap) s = r + gap + 1
  }
  return s
}
