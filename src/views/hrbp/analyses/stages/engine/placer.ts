/**
 * Where a person, a req or a plan line counts in Engineering by stage (docs/ANALYSES.md, 4.4), from
 * the job architecture (`ctx.jobs`) and the roster alone, so the analysis and Ask's `chipStage`
 * field put everyone in the same stage. Pure and memoized.
 *
 * A person counts where the job architecture places them (`jobs.engineeringPlace`): a job function
 * with a saved stage, or any function of a job family that counts as engineering (its stage saved,
 * proposed from keywords, or none: Not mapped). When nobody in the roster is placed that way, the
 * engineering departments People stats uses stand in. A req or plan line carries no job function
 * in this change, so it takes the most common job function of its department's active employees,
 * marked "Inferred from department".
 */
import type { JobArchitecture } from '@/data/lists/jobs'
import { proposeEngineering } from '@/data/lists/stages'
import type { ChipStageKey, Employee, ISODate } from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'

export const NOT_MAPPED = 'unmapped' as const
/** A row of the analysis: one of the eleven chip development stages, or Not mapped. */
export type StageKey = ChipStageKey | typeof NOT_MAPPED

/** How a person's (or req's) stage was found. */
export type StageSource = 'Saved' | 'Proposed' | 'Inferred from department' | 'Not mapped'

export interface Placed {
  family: string | null
  jobFunction: string | null
  stage: StageKey
  source: StageSource
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Where people, reqs and plan lines count, from the job architecture and the roster alone. */
export interface StagePlacer {
  /** No job family counts as engineering and no stage is saved: engineering departments stand in. */
  fallback: boolean
  /** Where a person counts, or null when outside engineering. */
  person(e: Employee): Placed | null
  /** The most common job function of a department's active employees, company-wide. */
  functionOfDepartment(department: string | null | undefined): string | null
  /** Where a req or plan line of a department counts, inferred from the department. */
  department(department: string | null | undefined): Placed | null
}

function placeFrom(
  jobs: JobArchitecture,
  fallback: boolean,
  e: Pick<Employee, 'jobFamily' | 'jobFunction' | 'department' | 'businessUnit'>,
): Placed | null {
  if (fallback) {
    // People stats' engineering departments (the same pattern as `isEngineering` in its workforce engine).
    if (!proposeEngineering(e.department ?? '') && !proposeEngineering(e.businessUnit ?? '')) return null
    const fn = text(e.jobFunction)
    const s = fn ? jobs.stageFor(fn) : null
    return {
      family: jobs.familyFor(e),
      jobFunction: fn,
      stage: s?.stage ?? NOT_MAPPED,
      source: s ? (s.source === 'saved' ? 'Saved' : 'Proposed') : 'Not mapped',
    }
  }
  const place = jobs.engineeringPlace(e)
  if (!place) return null
  return {
    family: place.family,
    jobFunction: place.jobFunction,
    stage: place.stage ?? NOT_MAPPED,
    source: place.stage ? (place.source === 'saved' ? 'Saved' : 'Proposed') : 'Not mapped',
  }
}

function buildPlacer(jobs: JobArchitecture, all: readonly Employee[], asOf: ISODate): StagePlacer {
  const fallback = !all.some((e) => jobs.engineeringPlace(e) != null)
  const placed = new WeakMap<Employee, Placed | null>()
  const person = (e: Employee): Placed | null => {
    const got = placed.get(e)
    if (got !== undefined) return got
    const p = placeFrom(jobs, fallback, e)
    placed.set(e, p)
    return p
  }

  // Each department's most common job function among its active employees (ties: name order).
  const byDept = new Map<string, Map<string, number>>()
  for (const e of all) {
    if (!isEmployee(e) || !isActiveAt(e, asOf)) continue
    const dept = text(e.department)
    const fn = text(e.jobFunction)
    if (!dept || !fn) continue
    let c = byDept.get(dept)
    if (!c) {
      c = new Map()
      byDept.set(dept, c)
    }
    c.set(fn, (c.get(fn) ?? 0) + 1)
  }
  const deptFunction = new Map<string, string>()
  for (const [dept, c] of byDept) {
    let best: string | null = null
    let n = 0
    for (const [fn, k] of c)
      if (k > n || (k === n && best != null && fn.localeCompare(best) < 0)) {
        best = fn
        n = k
      }
    if (best) deptFunction.set(dept, best)
  }
  const functionOfDepartment = (d: string | null | undefined) => {
    const dept = text(d)
    return dept ? (deptFunction.get(dept) ?? null) : null
  }
  const deptPlace = new Map<string, Placed | null>()
  const department = (d: string | null | undefined): Placed | null => {
    const dept = text(d)
    if (!dept) return null
    const got = deptPlace.get(dept)
    if (got !== undefined) return got
    const fn = deptFunction.get(dept) ?? null
    const p =
      fn || fallback
        ? placeFrom(jobs, fallback, { jobFamily: null, jobFunction: fn, department: dept, businessUnit: '' })
        : null
    const out = p ? { ...p, source: 'Inferred from department' as const } : null
    deptPlace.set(dept, out)
    return out
  }
  return { fallback, person, functionOfDepartment, department }
}

const placers = new WeakMap<JobArchitecture, WeakMap<readonly Employee[], Map<ISODate, StagePlacer>>>()

/**
 * The placer for a job architecture over a roster on a date, memoized: what the analysis and
 * Ask's `chipStage` field read, so both put a person or a req in the same stage.
 */
export function stagePlacer(jobs: JobArchitecture, all: readonly Employee[], asOf: ISODate): StagePlacer {
  let byRows = placers.get(jobs)
  if (!byRows) {
    byRows = new WeakMap()
    placers.set(jobs, byRows)
  }
  let byDate = byRows.get(all)
  if (!byDate) {
    byDate = new Map()
    byRows.set(all, byDate)
  }
  let hit = byDate.get(asOf)
  if (!hit) {
    hit = buildPlacer(jobs, all, asOf)
    byDate.set(asOf, hit)
  }
  return hit
}
