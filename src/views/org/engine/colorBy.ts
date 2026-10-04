/**
 * Color keys for the cards' top edge. Categories (department, business unit, job function,
 * location) take the categorical slots in a fixed order, largest group first; with more than eight groups the
 * smallest fold into "Other". Ordered dimensions (level, tenure) use the sequential blue ramp.
 *
 * Slots are ranked over the whole as-of roster and reused for any root or focus, so a department
 * keeps its color when you focus on a sub-org; the legend lists only the groups on screen.
 */
import type { Employee, ISODate } from '@/data/schema'
import { TENURE_BANDS, tenureBand, tenureYears } from '@/lib/people'

export type ColorBy = 'department' | 'businessUnit' | 'jobFunction' | 'location' | 'level' | 'tenure' | 'none'

export const COLOR_BY_LABELS: Record<ColorBy, string> = {
  department: 'Department',
  businessUnit: 'Business unit',
  jobFunction: 'Job function',
  location: 'Location',
  level: 'Level',
  tenure: 'Tenure',
  none: 'No color',
}

/** Where a key's color comes from: a categorical slot (0-7), the de-emphasis gray, or a ramp step. */
export type Swatch = { kind: 'series'; index: number } | { kind: 'other' } | { kind: 'seq'; step: SeqStep }
export type SeqStep = 200 | 300 | 400 | 450 | 500 | 600 | 700

export interface ColorKey {
  key: string
  label: string
  swatch: Swatch
  count: number
}

export interface ColorScheme {
  by: ColorBy
  legend: ColorKey[]
  /** Legend key for a person; null when coloring is off. */
  keyOf: (e: Employee) => string | null
  swatchOf: (e: Employee) => Swatch | null
}

export const LEVEL_GROUPS = [
  { key: 'L1-L2', label: 'L1-L2', levels: ['L1', 'L2'] },
  { key: 'L3-L4', label: 'L3-L4', levels: ['L3', 'L4'] },
  { key: 'L5-L6', label: 'L5-L6', levels: ['L5', 'L6'] },
  { key: 'M1', label: 'M1 Manager', levels: ['M1'] },
  { key: 'M2', label: 'M2 Director', levels: ['M2'] },
  { key: 'E', label: 'E1-E3 Executive', levels: ['E1', 'E2', 'E3'] },
] as const
const LEVEL_STEPS: SeqStep[] = [200, 300, 400, 500, 600, 700]
const TENURE_STEPS: SeqStep[] = [200, 300, 450, 600, 700]
const NO_LEVEL = 'No level'

/** The options in menu order. */
export const COLOR_BY_OPTIONS: readonly ColorBy[] = Object.keys(COLOR_BY_LABELS) as ColorBy[]

export const isColorBy = (v: unknown): v is ColorBy =>
  typeof v === 'string' && Object.hasOwn(COLOR_BY_LABELS, v)

export const NO_JOB_FUNCTION = 'No job function'

const CATEGORICAL: Partial<Record<ColorBy, (e: Employee) => string>> = {
  department: (e) => e.department || 'Unknown',
  businessUnit: (e) => e.businessUnit || 'Unknown',
  jobFunction: (e) => e.jobFunction?.trim() || NO_JOB_FUNCTION,
  location: (e) => e.location || 'Unknown',
}

export const OTHER_KEY = '__other__'

/**
 * @param people who the slots are ranked over (the whole as-of roster, so colors stay put)
 * @param shown who is on screen: legend counts, and which keys the legend lists (default `people`)
 */
export function colorScheme(
  by: ColorBy,
  people: readonly Employee[],
  asOf: ISODate,
  shown: readonly Employee[] = people,
): ColorScheme {
  if (by === 'none') return { by, legend: [], keyOf: () => null, swatchOf: () => null }

  const cat = CATEGORICAL[by]
  if (cat) {
    const counts = new Map<string, number>()
    for (const e of people) counts.set(cat(e), (counts.get(cat(e)) ?? 0) + 1)
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    const named = ranked.length > 8 ? ranked.slice(0, 7) : ranked
    const slot = new Map(named.map(([k], i) => [k, i]))
    const onScreen = new Map<string, number>()
    for (const e of shown) onScreen.set(cat(e), (onScreen.get(cat(e)) ?? 0) + 1)
    const legend: ColorKey[] = named
      .filter(([k]) => onScreen.has(k))
      .map(([k]) => ({
        key: k,
        label: k,
        swatch: { kind: 'series', index: slot.get(k)! },
        count: onScreen.get(k)!,
      }))
    const rest = [...onScreen].filter(([k]) => !slot.has(k))
    if (rest.length) {
      legend.push({
        key: OTHER_KEY,
        label: `Other (${rest.length})`,
        swatch: { kind: 'other' },
        count: rest.reduce((s, [, n]) => s + n, 0),
      })
    }
    const keyOf = (e: Employee) => (slot.has(cat(e)) ? cat(e) : OTHER_KEY)
    return {
      by,
      legend,
      keyOf,
      swatchOf: (e) => {
        const i = slot.get(cat(e))
        return i === undefined ? { kind: 'other' } : { kind: 'series', index: i }
      },
    }
  }

  if (by === 'level') {
    const groupOf = (e: Employee) =>
      LEVEL_GROUPS.findIndex((g) => (g.levels as readonly string[]).includes(e.level ?? ''))
    const counts = new Array(LEVEL_GROUPS.length).fill(0)
    let none = 0
    for (const e of shown) {
      const g = groupOf(e)
      if (g < 0) none++
      else counts[g]++
    }
    const legend: ColorKey[] = LEVEL_GROUPS.map((g, i) => ({
      key: g.key,
      label: g.label,
      swatch: { kind: 'seq', step: LEVEL_STEPS[i] } as Swatch,
      count: counts[i],
    })).filter((k) => k.count > 0)
    if (none) legend.push({ key: NO_LEVEL, label: NO_LEVEL, swatch: { kind: 'other' }, count: none })
    return {
      by,
      legend,
      keyOf: (e) => {
        const g = groupOf(e)
        return g < 0 ? NO_LEVEL : LEVEL_GROUPS[g].key
      },
      swatchOf: (e) => {
        const g = groupOf(e)
        return g < 0 ? { kind: 'other' } : { kind: 'seq', step: LEVEL_STEPS[g] }
      },
    }
  }

  // Tenure bands at the as-of date.
  const bandOf = (e: Employee) => tenureBand(tenureYears(e, asOf))
  const counts = new Map<string, number>()
  for (const e of shown) counts.set(bandOf(e), (counts.get(bandOf(e)) ?? 0) + 1)
  const legend: ColorKey[] = TENURE_BANDS.map((b, i) => ({
    key: b,
    label: b,
    swatch: { kind: 'seq', step: TENURE_STEPS[i] } as Swatch,
    count: counts.get(b) ?? 0,
  })).filter((k) => k.count > 0)
  return {
    by,
    legend,
    keyOf: bandOf,
    swatchOf: (e) => ({ kind: 'seq', step: TENURE_STEPS[TENURE_BANDS.indexOf(bandOf(e))] }),
  }
}

/** CSS color for a swatch (follows the theme through the tokens). */
export function swatchCss(s: Swatch | null): string {
  if (!s) return 'var(--rule-strong)'
  if (s.kind === 'series') return `var(--s${s.index + 1})`
  if (s.kind === 'other') return 'var(--deemph)'
  return `var(--seq-${s.step})`
}
