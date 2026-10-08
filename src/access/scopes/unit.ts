/**
 * The `unit` scope: HRBP for a business unit (docs/ROLES-V2.md, 2.1 to 2.4). It pins the business
 * unit filter to one unit, include only, so every dataset follows it through `scopeDatasets` as
 * the filter does today. It keys on the business unit field only, never the job family (after the
 * taxonomy flip the sample has both named Silicon Engineering). Pure and memoized.
 */
import type { Employee, ISODate } from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'
import type { UnitScope } from './types'

/** The value a scope pins when its pick is missing or gone: it matches nobody. */
export const NOBODY = 'none'

export interface UnitOptions {
  /** Department → its business unit on the official Departments list (null or missing: not set). */
  departmentParents?: ReadonlyMap<string, string | null> | null
}

const memo = new WeakMap<readonly Employee[], Map<string, UnitScope>>()
const parentsIds = new WeakMap<object, number>()
let nextParents = 1
const parentsKey = (p: object | null | undefined): number => {
  if (!p) return 0
  let k = parentsIds.get(p)
  if (!k) {
    k = nextParents++
    parentsIds.set(p, k)
  }
  return k
}

/** Each department's unit: its official parent when set, else the unit most of its people are in. */
function departmentUnits(
  employees: readonly Employee[],
  parents: ReadonlyMap<string, string | null> | null | undefined,
): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const e of employees) {
    if (!e.department || !e.businessUnit) continue
    let byUnit = counts.get(e.department)
    if (!byUnit) {
      byUnit = new Map()
      counts.set(e.department, byUnit)
    }
    byUnit.set(e.businessUnit, (byUnit.get(e.businessUnit) ?? 0) + 1)
  }
  const out = new Map<string, string>()
  for (const [dept, byUnit] of counts) {
    let best = ''
    let most = 0
    for (const [u, n] of [...byUnit].sort((a, b) => a[0].localeCompare(b[0])))
      if (n > most) {
        best = u
        most = n
      }
    out.set(dept, best)
  }
  for (const [dept, unit] of parents ?? []) if (unit) out.set(dept, unit)
  return out
}

/** The scope for one business unit, memoized per roster, as-of date, unit and parents list. */
export function unitScope(
  employees: readonly Employee[],
  asOf: ISODate,
  unit: string,
  opts: UnitOptions = {},
): UnitScope {
  let byKey = memo.get(employees)
  if (!byKey) {
    byKey = new Map()
    memo.set(employees, byKey)
  }
  const key = `${asOf}|${unit}|${parentsKey(opts.departmentParents)}`
  const hit = byKey.get(key)
  if (hit) return hit
  const byId = new Map<string, Employee>()
  for (const e of employees) byId.set(e.employeeId, e)
  const memberIds = new Set<string>()
  const leaderIds = new Set<string>()
  let size = 0
  for (const e of employees) {
    if (e.businessUnit !== unit) continue
    memberIds.add(e.employeeId)
    if (!isEmployee(e) || !isActiveAt(e, asOf)) continue
    size++
    // The member and everyone above them lead an org that reaches the unit.
    let cur: Employee | undefined = e
    while (cur && !leaderIds.has(cur.employeeId)) {
      leaderIds.add(cur.employeeId)
      cur = cur.managerId && cur.managerId !== cur.employeeId ? byId.get(cur.managerId) : undefined
    }
  }
  const otherDepartments = new Set<string>()
  for (const [dept, u] of departmentUnits(employees, opts.departmentParents))
    if (u !== unit) otherDepartments.add(dept)
  const scope: UnitScope = { kind: 'unit', label: unit, unit, size, memberIds, leaderIds, otherDepartments }
  byKey.set(key, scope)
  return scope
}

/**
 * A unit scope that holds nobody: no unit picked, or the remembered one has no active employees
 * in the loaded data. It pins a value no record has, never the whole company.
 */
export function emptyUnitScope(unit: string | null | undefined): UnitScope {
  const label = unit ?? ''
  let s = emptyUnits.get(label)
  if (!s) {
    s = {
      kind: 'unit',
      label,
      unit: NOBODY,
      size: 0,
      memberIds: new Set(),
      leaderIds: new Set(),
      otherDepartments: new Set(),
    }
    emptyUnits.set(label, s)
  }
  return s
}
const emptyUnits = new Map<string, UnitScope>()
