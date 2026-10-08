/**
 * Manager mode's stay conversation items read nothing of the regrettable flag (docs/ROLES-V2.md,
 * "Decisions made", 8 Oct 2026). Raised from regretted exits, whether a manager had the item (2
 * regretted exits by default), whether it was critical (3) and its fingerprint (which reopens a
 * handled item) each told the manager which of the team's exits were regretted: on the sample,
 * hashing subsets of the leavers an item lists found the fingerprint, and so named the regretted
 * leavers, for all 13 teams with an item. In Manager mode the item is now raised from the exits
 * the rule could count (voluntary ones by default), with the same settings.
 */
import { describe, expect, it } from 'vitest'
import { sampleCtx, sampleData } from '@/ask/engine/testkit'
import type { Datasets, Employee } from '@/data/schema'
import { resolveDrill } from '@/drill/Drill'
import { hrbpActions } from './actions'
import { fingerprintOf } from './places'

const STAY = 'hrbp:stay-conversations:'

/** The sample with every leaver's regrettable flag set by `flag`. */
const flagged = (
  data: Datasets,
  flag: (i: number, was: boolean | null | undefined) => boolean,
): Datasets => ({
  ...data,
  employees: data.employees.map((e, i) =>
    e.terminationDate ? { ...e, regrettable: flag(i, e.regrettable) } : e,
  ),
})

const stayItems = (data: Datasets, managerId?: string) =>
  hrbpActions(sampleCtx({ data, ...(managerId ? { access: { mode: 'manager', managerId } } : {}) })).filter(
    (i) => i.id.startsWith(STAY),
  )

/** What a manager's Action center shows of their stay conversation items, and what a mark keeps. */
const shown = (data: Datasets, managerId: string) =>
  stayItems(data, managerId).map((i) => ({
    id: i.id,
    severity: i.severity,
    what: i.what,
    note: i.note,
    due: i.due,
    forOwner: i.forOwner,
    fingerprint: i.fingerprint,
    leavers: ((resolveDrill(i.drill)?.rows ?? []) as Employee[]).map((e) => e.employeeId).sort(),
  }))

describe("Manager mode's stay conversation items", () => {
  const data = sampleData()
  const hrItems = stayItems(data)
  const managers = [...new Set(hrItems.map((i) => i.id.slice(STAY.length)))]

  it('say the same whichever exits were regretted', () => {
    expect(managers.length).toBeGreaterThan(5)
    const variants = [
      flagged(data, () => true),
      flagged(data, () => false),
      flagged(data, (i) => i % 2 === 0),
      flagged(data, (_, was) => !was),
    ]
    for (const id of managers) {
      const mine = shown(data, id)
      expect(mine.length, id).toBeGreaterThan(0)
      for (const v of variants) expect(shown(v, id), id).toEqual(mine)
      // A mark keeps the fingerprint of the leavers the item lists, so it reopens when anyone leaves.
      for (const i of mine) expect(i.fingerprint).toBe(fingerprintOf(i.leavers))
    }
  })

  it("flag every team HR's rule flags, never less severe", () => {
    for (const hr of hrItems) {
      const id = hr.id.slice(STAY.length)
      const mine = stayItems(data, id).find((i) => i.id === hr.id)
      expect(mine, hr.id).toBeDefined()
      if (hr.severity === 'critical') expect(mine?.severity, hr.id).toBe('critical')
    }
  })
})
