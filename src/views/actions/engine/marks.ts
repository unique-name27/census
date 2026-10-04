/**
 * Mark handled and Snooze, kept in this browser by item id (`census:actions`). Item ids are
 * stable across recomputes ('<view>:<kind>:<record id>'), so a mark sticks until the item stops
 * being open in its view. A snooze ends on its own at its end time.
 *
 * Pure apart from the storage passed in; every read and write is wrapped, so a blocked or full
 * store only means marks last for this visit.
 */
import { addDays } from '@/lib/dates'

export const STORAGE_KEY = 'census:actions'
const VERSION = 1
/** Marks older than this are dropped when read back, so the store never grows without end. */
const KEEP_DAYS = 365
const MAX_MARKS = 5000

export type Mark =
  | { state: 'handled'; at: string }
  | {
      state: 'snoozed'
      at: string
      /** When the item comes back (ISO date-time). */
      until: string
    }

export type Marks = Readonly<Record<string, Mark>>

export type ItemStatus =
  | { state: 'open' }
  | { state: 'handled'; at: string }
  | { state: 'snoozed'; at: string; until: string }

/** What an item is now: handled, snoozed until a time still ahead, or open. */
export function statusOf(id: string, marks: Marks, now: number): ItemStatus {
  const m = marks[id]
  if (!m) return { state: 'open' }
  if (m.state === 'handled') return m
  return Date.parse(m.until) > now ? m : { state: 'open' }
}

export const isOpen = (id: string, marks: Marks, now: number): boolean =>
  statusOf(id, marks, now).state === 'open'

/** When a snooze set now ends. */
export function snoozeUntil(now: number, days: number): string {
  return new Date(now + days * 86_400_000).toISOString()
}

export function withHandled(marks: Marks, ids: readonly string[], now: number): Marks {
  const at = new Date(now).toISOString()
  const out: Record<string, Mark> = { ...marks }
  for (const id of ids) out[id] = { state: 'handled', at }
  return out
}

export function withSnoozed(marks: Marks, ids: readonly string[], now: number, days: number): Marks {
  const at = new Date(now).toISOString()
  const until = snoozeUntil(now, days)
  const out: Record<string, Mark> = { ...marks }
  for (const id of ids) out[id] = { state: 'snoozed', at, until }
  return out
}

/** Open again: forget the marks. */
export function withReopened(marks: Marks, ids: readonly string[]): Marks {
  const out: Record<string, Mark> = { ...marks }
  for (const id of ids) delete out[id]
  return out
}

/** The marks of these ids as they are now (absent ones as null), for Undo. */
export function snapshotOf(marks: Marks, ids: readonly string[]): Record<string, Mark | null> {
  return Object.fromEntries(ids.map((id) => [id, marks[id] ?? null]))
}

/** Put marks back as a snapshot had them. */
export function withSnapshot(marks: Marks, snap: Readonly<Record<string, Mark | null>>): Marks {
  const out: Record<string, Mark> = { ...marks }
  for (const [id, m] of Object.entries(snap)) {
    if (m) out[id] = m
    else delete out[id]
  }
  return out
}

/* ───────── storage ───────── */

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const isIso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))

function validMark(v: unknown): Mark | null {
  const m = v as { state?: unknown; at?: unknown; until?: unknown } | null
  if (!m || !isIso(m.at)) return null
  if (m.state === 'handled') return { state: 'handled', at: m.at }
  if (m.state === 'snoozed' && isIso(m.until)) return { state: 'snoozed', at: m.at, until: m.until }
  return null
}

/**
 * Marks from a saved value: unknown versions and broken entries are dropped, as are marks older
 * than a year and ended snoozes, newest kept when there are too many.
 */
export function parseMarks(raw: string | null, now: number): Marks {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as { version?: unknown; marks?: unknown }
    if (!v || v.version !== VERSION || typeof v.marks !== 'object' || v.marks === null) return {}
    const oldest = addDays(new Date(now).toISOString().slice(0, 10), -KEEP_DAYS)
    const kept: [string, Mark][] = []
    for (const [id, m] of Object.entries(v.marks as Record<string, unknown>)) {
      const mark = validMark(m)
      if (!mark || mark.at.slice(0, 10) < oldest) continue
      if (mark.state === 'snoozed' && Date.parse(mark.until) <= now) continue
      kept.push([id, mark])
    }
    kept.sort((a, b) => b[1].at.localeCompare(a[1].at))
    return Object.fromEntries(kept.slice(0, MAX_MARKS))
  } catch {
    return {}
  }
}

export function serializeMarks(marks: Marks): string {
  return JSON.stringify({ version: VERSION, marks })
}

export function loadMarks(storage: StorageLike | null, now: number): Marks {
  try {
    return parseMarks(storage?.getItem(STORAGE_KEY) ?? null, now)
  } catch {
    return {}
  }
}

/** Save the marks; false when the browser refused (they then last for this visit). */
export function saveMarks(marks: Marks, storage: StorageLike | null): boolean {
  try {
    if (!storage) return false
    if (Object.keys(marks).length === 0) storage.removeItem(STORAGE_KEY)
    else storage.setItem(STORAGE_KEY, serializeMarks(marks))
    return true
  } catch {
    return false
  }
}
