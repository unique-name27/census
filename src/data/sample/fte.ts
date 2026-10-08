/**
 * FTE on the sample's Employees (docs/ANALYSES.md, 4.10), from its own stream after every other
 * module: everyone works full time (1) except 20 part-time employees (0.5, 0.6 or 0.8: 8 in
 * Munich, 5 in Haifa, 4 in Toronto, 3 in San Jose), 9 of them in engineering stages (design
 * verification 3, RTL design 2, software and firmware 4), and 6 contractors at 0.5. Pure.
 */
import type { Employee, ISODate } from '../schema'
import type { Rng } from './prng'

/** Part-time employees by site. */
export const PART_TIME_SITES: readonly (readonly [string, number])[] = [
  ['Munich', 8],
  ['Haifa', 5],
  ['Toronto', 4],
  ['San Jose', 3],
]

/** Part-timers in engineering stages, by job function. */
export const PART_TIME_ENGINEERING: readonly (readonly [readonly string[], number])[] = [
  [['Design Verification'], 3],
  [['Design RTL'], 2],
  [['Software', 'Firmware'], 4],
]

export const PART_TIME_CONTRACTORS = 6

const SHARES = [0.5, 0.6, 0.8] as const

const ENGINEERING_FAMILIES = new Set(['Silicon Engineering', 'Systems & Software Engineering'])
/** Functions outside the engineering stages: not an engineering family, no stage on the sample's list. */
const STAGED_ELSEWHERE = new Set([
  'Product Engineering',
  'Test Engineering',
  'Quality & Reliability',
  'EDA & CAD Infrastructure',
])
const outsideStages = (e: Employee) =>
  !ENGINEERING_FAMILIES.has(e.jobFamily ?? '') && !STAGED_ELSEWHERE.has(e.jobFunction ?? '')

const activeOn = (e: Employee, d: string) => e.hireDate <= d && (!e.terminationDate || e.terminationDate > d)

/** The part-timers the stream picks: employee ID to FTE. */
export function partTimers(employees: readonly Employee[], asOf: ISODate, rng: Rng): Map<string, number> {
  const out = new Map<string, number>()
  const active = employees.filter((e) => e.employmentType === 'Employee' && activeOn(e, asOf))
  const left = new Map(PART_TIME_SITES)
  const sites = new Set(left.keys())
  const share = () => rng.pick(SHARES)
  for (const [functions, n] of PART_TIME_ENGINEERING) {
    const pool = rng.shuffle(
      active.filter(
        (e) => sites.has(e.location) && functions.includes(e.jobFunction ?? '') && !out.has(e.employeeId),
      ),
    )
    let k = 0
    for (const e of pool) {
      if (k === n) break
      if ((left.get(e.location) ?? 0) <= 0) continue
      out.set(e.employeeId, share())
      left.set(e.location, (left.get(e.location) ?? 0) - 1)
      k++
    }
  }
  for (const [site, n] of left) {
    const pool = rng.sample(
      active.filter((e) => e.location === site && outsideStages(e) && !out.has(e.employeeId)),
      n,
    )
    for (const e of pool) out.set(e.employeeId, share())
  }
  const contractors = rng.sample(
    employees.filter((e) => e.employmentType === 'Contractor' && activeOn(e, asOf)),
    PART_TIME_CONTRACTORS,
  )
  for (const e of contractors) out.set(e.employeeId, 0.5)
  return out
}

/** Employees with FTE: 1 for everyone but the part-timers. */
export function withFte(employees: readonly Employee[], asOf: ISODate, rng: Rng): Employee[] {
  const part = partTimers(employees, asOf, rng)
  return employees.map((e) => ({ ...e, fte: part.get(e.employeeId) ?? 1 }))
}
