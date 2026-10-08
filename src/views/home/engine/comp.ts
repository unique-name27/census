/**
 * Compensation's home as data (docs/ROLES-V2.md 5.6; docs/ACTION-CENTER-AUDIT.md 5.2): the hero's
 * range position split, and My list, "People outside range": below the minimum first (largest gap
 * first), then above the maximum, with the facts a comp partner plans a move with. Amount columns
 * are `pay: true` in the UI, so they show only with "Show pay amounts" on. Pure.
 */
import type { CompModel } from '@/views/comp/engine/model'
import { type CompPerson, POSITIONS, type Position } from '@/views/comp/engine/population'
import { aboveMaximum, belowMinimum, type PositionMixRow } from '@/views/comp/engine/ranges'
import type { SplitPaint, SplitPart } from './split'

const PAINT: Record<Position, SplitPaint> = {
  'Below minimum': 'critical',
  Q1: 'seq-250',
  Q2: 'seq-400',
  Q3: 'seq-500',
  Q4: 'seq-600',
  'Above maximum': 'warning',
}

const WORD: Record<Position, string> = {
  'Below minimum': 'Below minimum',
  Q1: 'First quarter',
  Q2: 'Second quarter',
  Q3: 'Third quarter',
  Q4: 'Fourth quarter',
  'Above maximum': 'Above maximum',
}

export interface PositionPart extends SplitPart {
  [key: string]: unknown
  share: number | null
}

/** Everyone with a range by position, below the minimum to above the maximum; shares hidden under the minimum. */
export function positionParts(row: PositionMixRow): PositionPart[] {
  const n = row.members.length
  return POSITIONS.map((pos) => {
    const count = row.members.filter((p) => p.position === pos).length
    return { key: pos, label: WORD[pos], count, paint: PAINT[pos], share: n ? count / n : null }
  })
}

export interface OutsideListRow {
  [key: string]: unknown
  side: 'below' | 'above'
  id: string
  name: string
  job: string
  department: string
  level: string
  location: string
  compa: number | null
  penetration: number | null
  /** Increase to the minimum (below) or overage of the maximum (above), as a share. */
  gapPct: number
  merit: number | null
  lastIncrease: string | null
  promoted: string
  rating: number | null
  baseUsd: number | null
  minUsd: number | null
  maxUsd: number | null
  gapUsd: number | null
  person: CompPerson
}

/** People below their range minimum (largest gap first), then above their maximum (largest overage first). */
export function outsideList(m: Pick<CompModel, 'pop'>): OutsideListRow[] {
  const people = m.pop.people
  const row =
    (side: 'below' | 'above') =>
    (r: ReturnType<typeof belowMinimum>[number]): OutsideListRow => ({
      side,
      id: r.id,
      name: r.name,
      job: r.person.job,
      department: r.department,
      level: r.level,
      location: r.location,
      compa: r.compa,
      penetration: r.person.penetration,
      gapPct: r.gapPct,
      merit: r.person.merit,
      lastIncrease: r.person.record.lastIncreaseDate ?? null,
      promoted: r.promoted,
      rating: r.person.rating,
      baseUsd: r.person.baseUsd,
      minUsd: r.person.minUsd,
      maxUsd: r.person.maxUsd,
      gapUsd: r.gapUsd,
      person: r.person,
    })
  const byGap = (a: OutsideListRow, b: OutsideListRow) => b.gapPct - a.gapPct || a.name.localeCompare(b.name)
  return [
    ...belowMinimum(people).map(row('below')).sort(byGap),
    ...aboveMaximum(people).map(row('above')).sort(byGap),
  ]
}
