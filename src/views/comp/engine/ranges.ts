/**
 * Range position: where base pay sits against the salary range (compa-ratio, penetration,
 * position buckets), who is outside the range, and pay compression between new hires and
 * incumbents. Pure functions over the comp population.
 */
import { LEVELS, MIN_GROUP } from '@/data/schema'
import { TENURE_BANDS } from '@/lib/people'
import { behind, groupRows, safeMedian, safeQuantile, safeShare, values } from './groups'
import type { CompPerson, Position } from './population'
import { defaultRules } from './rules'
import type { CycleSettings } from './settings'

/*
 * Statistics take the anonymity minimum as `min` (the model passes the one in force; MIN_GROUP,
 * its floor, is only the default for direct calls). Compression thresholds are settings of
 * 'comp.compression.gap'.
 */

export const inBand = (p: CompPerson, s: CycleSettings): boolean =>
  p.compa != null && p.compa >= s.bandLow && p.compa <= s.bandHigh

export interface PositionMixRow {
  group: string
  n: number
  below: number | null
  q1: number | null
  q2: number | null
  q3: number | null
  q4: number | null
  above: number | null
  /** The placed people behind the shares; empty when the shares are hidden (n < 5). */
  members: CompPerson[]
}

export const POSITION_FIELD: Record<Position, keyof Omit<PositionMixRow, 'group' | 'n' | 'members'>> = {
  'Below minimum': 'below',
  Q1: 'q1',
  Q2: 'q2',
  Q3: 'q3',
  Q4: 'q4',
  'Above maximum': 'above',
}

function mixRow(group: string, rows: readonly CompPerson[], min: number): PositionMixRow {
  const placed = rows.filter((p) => p.position != null)
  const count = (pos: Position) => placed.filter((p) => p.position === pos).length
  const share = (pos: Position) => safeShare(count(pos), placed.length, min)
  return {
    group,
    n: placed.length,
    below: share('Below minimum'),
    q1: share('Q1'),
    q2: share('Q2'),
    q3: share('Q3'),
    q4: share('Q4'),
    above: share('Above maximum'),
    members: behind(placed, placed.length, min),
  }
}

/** Share of people in each position bucket, per group (groups under 5 folded into Other). */
export function positionMix(
  people: readonly CompPerson[],
  key: (p: CompPerson) => string | null,
  order?: readonly string[],
  min = MIN_GROUP,
): PositionMixRow[] {
  const placed = people.filter((p) => p.position != null)
  return groupRows(placed, key, { order, min }).map((g) => mixRow(g.label, g.rows, min))
}

export function positionTotal(people: readonly CompPerson[], label = 'All', min = MIN_GROUP): PositionMixRow {
  return mixRow(label, people, min)
}

export interface CompaGroupRow {
  group: string
  n: number
  median: number | null
  p25: number | null
  p75: number | null
  /** Share inside the healthy band. */
  inBand: number | null
  belowMin: number
  aboveMax: number
  /**
   * The people behind the row (every row given, with or without a compa-ratio); empty when the
   * statistics are hidden (n < 5). Select from it with the helpers in drill.ts.
   */
  members: CompPerson[]
}

export function compaRow(
  group: string,
  rows: readonly CompPerson[],
  s: CycleSettings,
  min = MIN_GROUP,
): CompaGroupRow {
  const xs = values(rows, (p) => p.compa)
  return {
    group,
    n: xs.length,
    median: safeMedian(xs, min),
    p25: safeQuantile(xs, 0.25, min),
    p75: safeQuantile(xs, 0.75, min),
    inBand: safeShare(rows.filter((p) => inBand(p, s)).length, xs.length, min),
    belowMin: rows.filter((p) => p.position === 'Below minimum').length,
    aboveMax: rows.filter((p) => p.position === 'Above maximum').length,
    members: behind(rows, xs.length, min),
  }
}

export function compaBy(
  people: readonly CompPerson[],
  key: (p: CompPerson) => string | null,
  s: CycleSettings,
  order?: readonly string[],
  min = MIN_GROUP,
): CompaGroupRow[] {
  const valued = people.filter((p) => p.compa != null)
  return groupRows(valued, key, { order, min }).map((g) => compaRow(g.label, g.rows, s, min))
}

export interface PenetrationRow {
  level: string
  n: number
  p10: number | null
  q1: number | null
  median: number | null
  q3: number | null
  p90: number | null
  /** The people measured; empty when the percentiles are hidden (n < 5). */
  members: CompPerson[]
}

/** Range penetration quartiles by level, in level order. */
export function penetrationByLevel(people: readonly CompPerson[], min = MIN_GROUP): PenetrationRow[] {
  return groupRows(
    people.filter((p) => p.penetration != null),
    (p) => p.level,
    { order: LEVELS, min },
  ).map((g) => {
    const xs = values(g.rows, (p) => p.penetration)
    return {
      level: g.label,
      n: xs.length,
      p10: safeQuantile(xs, 0.1, min),
      q1: safeQuantile(xs, 0.25, min),
      median: safeMedian(xs, min),
      q3: safeQuantile(xs, 0.75, min),
      p90: safeQuantile(xs, 0.9, min),
      members: behind(g.rows, xs.length, min),
    }
  })
}

export interface OutsideRangeRow {
  id: string
  name: string
  department: string
  level: string
  location: string
  tenure: number
  compa: number | null
  /** Below minimum: increase needed to reach the minimum, (min − base) ÷ base. Above maximum: (base − max) ÷ max. */
  gapPct: number
  /** The same gap in USD (pay amount; null without an FX rate). */
  gapUsd: number | null
  promoted: 'Yes' | 'No'
  /** The person, for the drill-down and the person card. */
  person: CompPerson
}

export function belowMinimum(people: readonly CompPerson[]): OutsideRangeRow[] {
  return people
    .filter((p) => p.position === 'Below minimum' && p.min != null)
    .map((p) => ({
      id: p.id,
      name: p.name,
      department: p.department,
      level: p.level ?? '',
      location: p.location,
      tenure: p.tenure,
      compa: p.compa,
      gapPct: (p.min! - p.base) / p.base,
      gapUsd: p.minUsd != null && p.baseUsd != null ? p.minUsd - p.baseUsd : null,
      promoted: p.promotedRecently ? ('Yes' as const) : ('No' as const),
      person: p,
    }))
    .sort((a, b) => b.gapPct - a.gapPct)
}

export function aboveMaximum(people: readonly CompPerson[]): OutsideRangeRow[] {
  return people
    .filter((p) => p.position === 'Above maximum' && p.max != null)
    .map((p) => ({
      id: p.id,
      name: p.name,
      department: p.department,
      level: p.level ?? '',
      location: p.location,
      tenure: p.tenure,
      compa: p.compa,
      gapPct: (p.base - p.max!) / p.max!,
      gapUsd: p.maxUsd != null && p.baseUsd != null ? p.baseUsd - p.maxUsd : null,
      promoted: p.promotedRecently ? ('Yes' as const) : ('No' as const),
      person: p,
    }))
    .sort((a, b) => b.gapPct - a.gapPct)
}

/** Σ USD to bring everyone below minimum up to it; rows without an FX rate are skipped and counted. */
export function costToMinimum(rows: readonly OutsideRangeRow[]): { usd: number; skipped: number } {
  let usd = 0
  let skipped = 0
  for (const r of rows) {
    if (r.gapUsd == null) skipped++
    else usd += r.gapUsd
  }
  return { usd, skipped }
}

export interface TenureDot {
  id: string
  name: string
  tenureBand: string
  tenure: number
  compa: number
  position: string
}

export function tenureDots(people: readonly CompPerson[]): TenureDot[] {
  return people
    .filter((p) => p.compa != null)
    .map((p) => ({
      id: p.id,
      name: p.name,
      tenureBand: p.tenureBand,
      tenure: p.tenure,
      compa: p.compa!,
      position: p.position ?? '',
    }))
}

export const TENURE_ORDER: readonly string[] = TENURE_BANDS

export interface CompressionRow {
  /** "Design Verification · L3" */
  group: string
  department: string
  level: string
  newN: number
  newMedian: number
  incN: number
  incMedian: number
  /** New-hire median minus incumbent median, in compa-ratio points. */
  gap: number
  low: number
  high: number
  flagged: boolean
  /** The new hires and the incumbents behind the two medians. */
  hires: CompPerson[]
  incumbents: CompPerson[]
}

/**
 * New hires (last 12 months) vs incumbents at the same department and level, where both sides
 * have at least `minN` people (the compression setting, never below the anonymity minimum). A
 * gap of `gap` compa-ratio points or more is flagged. Largest gap first.
 */
export function compression(
  people: readonly CompPerson[],
  minN = defaultRules().compression.minGroup,
  gap = defaultRules().compression.gap,
): CompressionRow[] {
  const cells = new Map<
    string,
    { department: string; level: string; hires: CompPerson[]; inc: CompPerson[] }
  >()
  for (const p of people) {
    if (p.compa == null || !p.level) continue
    const k = `${p.department}\u0000${p.level}`
    let c = cells.get(k)
    if (!c) {
      c = { department: p.department, level: p.level, hires: [], inc: [] }
      cells.set(k, c)
    }
    ;(p.hiredRecently ? c.hires : c.inc).push(p)
  }
  const out: CompressionRow[] = []
  for (const c of cells.values()) {
    if (c.hires.length < minN || c.inc.length < minN) continue
    const newMedian = safeMedian(
      values(c.hires, (p) => p.compa),
      minN,
    )!
    const incMedian = safeMedian(
      values(c.inc, (p) => p.compa),
      minN,
    )!
    const diff = newMedian - incMedian
    out.push({
      group: `${c.department} · ${c.level}`,
      department: c.department,
      level: c.level,
      newN: c.hires.length,
      newMedian,
      incN: c.inc.length,
      incMedian,
      gap: diff,
      low: Math.min(newMedian, incMedian),
      high: Math.max(newMedian, incMedian),
      flagged: diff >= gap - 1e-9,
      hires: c.hires,
      incumbents: c.inc,
    })
  }
  return out.sort((a, b) => b.gap - a.gap || a.group.localeCompare(b.group))
}
