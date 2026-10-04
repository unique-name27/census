/**
 * Owners named in the data by name only (an HR business partner on the roster, a recruiter on a
 * req) resolved to an employee ID, so Action center items carry `ownerId` when the person is on
 * the roster. A name matches only when exactly one person active on the as-of date has it.
 * Pure: no React. Used by the People stats, Org chart, Talent and Recruiting action lists.
 */
import type { Employee, ISODate } from '@/data/schema'
import { isActiveAt } from '@/lib/people'

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

export type OwnerLookup = (name: string | null | undefined) => string | null

const cache = new WeakMap<readonly Employee[], Map<ISODate, OwnerLookup>>()

/** Employee ID by name among people active on `asOf`; null for an unknown or ambiguous name. */
export function ownerLookup(employees: readonly Employee[], asOf: ISODate): OwnerLookup {
  let byDate = cache.get(employees)
  if (!byDate) {
    byDate = new Map()
    cache.set(employees, byDate)
  }
  const hit = byDate.get(asOf)
  if (hit) return hit
  const ids = new Map<string, string | null>()
  for (const e of employees) {
    if (!e.name || !isActiveAt(e, asOf)) continue
    const k = norm(e.name)
    ids.set(k, ids.has(k) ? null : e.employeeId)
  }
  const look: OwnerLookup = (name) => (name ? (ids.get(norm(name)) ?? null) : null)
  byDate.set(asOf, look)
  return look
}

/** The owner shown when a person's HR business partner is not in the data. */
export const HRBP_FALLBACK = 'HR business partner'

/** A person's HR business partner as an action owner: their name and, when on the roster, their ID. */
export function hrbpOwner(
  e: Pick<Employee, 'hrbp'> | null | undefined,
  look: OwnerLookup,
): { ownerName: string; ownerId: string | null } {
  const name = e?.hrbp?.trim()
  return name ? { ownerName: name, ownerId: look(name) } : { ownerName: HRBP_FALLBACK, ownerId: null }
}

/** "Heather" from "Heather Hayes", for a note's greeting or a polite ask. */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name
