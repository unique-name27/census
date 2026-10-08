/**
 * The job architecture the analyses read (`ctx.jobs`, docs/TAXONOMY.md section 7): job families
 * with their job functions, each function's family and chip development stage. A job family is
 * the broad group (Silicon Engineering) and contains job functions (Design RTL).
 *
 * The official Job functions list says which family each function belongs to and its stage.
 * Where it is not official (your own data, no list saved yet), or names no family for a function,
 * the family most of the function's rows name is used. A function with no saved stage gets one
 * proposed from keywords on its name and commonest title (`./stages`), marked as proposed; a
 * family with no saved Engineering answer gets one proposed from its name. Nothing is written
 * back to the rows. Pure and memoized: the same lists and employees give the same object.
 */

import type { ChipStageKey, Employee, ISODate } from '../schema'
import { isActiveAt, isEmployee } from '../scope'
import type { SourceKinds } from './effective'
import { officialLists } from './effective'
import { proposeEngineering, proposeStage, savedEngineering, savedStageKey, stageOrder } from './stages'
import type { EffectiveList, ListsState } from './types'

/** Saved on the official list, or proposed by Census until someone saves it. */
export type AttrSource = 'saved' | 'proposed'

export interface StageOfFunction {
  stage: ChipStageKey
  source: AttrSource
}

export interface JobFunctionEntry {
  name: string
  /**
   * Position of its chip development stage in the flow, 1 (Architecture and spec) to 11 (Shared
   * engineering), saved or proposed; null when it has none.
   */
  stage: number | null
}

export interface JobFamilyEntry {
  name: string
  /** Its functions by stage, then the rest by active headcount. */
  functions: readonly JobFunctionEntry[]
}

/** Where a person sits for Engineering by stage (docs/ANALYSES.md, 4.4). */
export interface EngineeringPlace {
  family: string | null
  jobFunction: string | null
  /** Null: an engineering person whose function has no stage, saved or proposed (Not mapped). */
  stage: ChipStageKey | null
  source: AttrSource | null
}

export interface JobArchitecture {
  /** Families by active headcount; each family's functions by stage, then the rest by active headcount. */
  families: readonly JobFamilyEntry[]
  /** The official family of a function, else the family most of its rows name, else null. */
  familyOf(jobFunction: string): string | null
  /** The position of the function's stage (saved or proposed) in the flow, 1 to 11; null when none. */
  stageOf(jobFunction: string): number | null
  /** The function's chip development stage: saved on the list, else proposed from keywords; null when none. */
  stageFor(jobFunction: string): StageOfFunction | null
  /** Whether a family counts as engineering: its saved Engineering answer, else proposed from its name. */
  engineeringOf(family: string): { engineering: boolean; source: AttrSource }
  /**
   * Where a person counts in Engineering by stage, or null when outside it. In: a function with a
   * saved stage (whatever its family), or any function of a family that counts as engineering
   * (its stage saved, proposed, or none: Not mapped). Proposals apply inside engineering
   * families only, so a stray keyword in Corporate never pulls people in.
   */
  engineeringPlace(e: Pick<Employee, 'jobFamily' | 'jobFunction'>): EngineeringPlace | null
  /**
   * The family a person counts under: the row's own job family, else its function's family
   * (`familyOf`), else null. Never written back to the row.
   */
  familyFor(e: Pick<Employee, 'jobFamily' | 'jobFunction'>): string | null
  /** Where the shape came from: the official lists, or the data alone. */
  source: 'official' | 'data'
}

/** The two lists the architecture reads; either may be missing or only proposed. */
export interface JobLists {
  jobFamily?: EffectiveList | null
  jobFunction?: EffectiveList | null
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** The most common value, ties to the first in name order; null for none. */
function most(counts: ReadonlyMap<string, number> | undefined): string | null {
  if (!counts) return null
  let best: string | null = null
  let n = 0
  for (const [v, k] of counts)
    if (k > n || (k === n && best != null && v.localeCompare(best) < 0)) {
      best = v
      n = k
    }
  return best
}

function bump<K>(m: Map<K, number>, k: K, by = 1) {
  m.set(k, (m.get(k) ?? 0) + by)
}

function tally(m: Map<string, Map<string, number>>, key: string, value: string) {
  let c = m.get(key)
  if (!c) {
    c = new Map()
    m.set(key, c)
  }
  bump(c, value)
}

function build(lists: JobLists, employees: readonly Employee[], asOf: ISODate | undefined): JobArchitecture {
  const fnList = lists.jobFunction?.validates ? lists.jobFunction : null
  const famList = lists.jobFamily?.validates ? lists.jobFamily : null
  const officialFamily = new Map<string, string>()
  const savedStage = new Map<string, ChipStageKey>()
  const officialFunctions: string[] = []
  for (const v of fnList?.values ?? []) {
    if (v.parent) officialFamily.set(v.value, v.parent)
    const stage = savedStageKey(v.attrs?.stage)
    if (stage) savedStage.set(v.value, stage)
    if (!v.retired) officialFunctions.push(v.value)
  }
  const savedEngineeringOf = new Map<string, boolean>()
  for (const v of famList?.values ?? []) {
    const yes = savedEngineering(v.attrs?.engineering)
    if (yes != null) savedEngineeringOf.set(v.value, yes)
  }

  // From the rows: the families each function's rows name (every row, current and former), and
  // its job titles for stage proposals.
  const rowFamilies = new Map<string, Map<string, number>>()
  const titles = new Map<string, Map<string, number>>()
  const dataFunctions = new Set<string>()
  const dataFamilies = new Set<string>()
  for (const e of employees) {
    const fn = text(e.jobFunction)
    const fam = text(e.jobFamily)
    if (fam) dataFamilies.add(fam)
    if (!fn) continue
    dataFunctions.add(fn)
    const title = text(e.jobTitle)
    if (title) tally(titles, fn, title)
    if (fam) tally(rowFamilies, fn, fam)
  }

  const familyOf = (jobFunction: string): string | null => {
    const fn = text(jobFunction)
    if (!fn) return null
    return officialFamily.get(fn) ?? most(rowFamilies.get(fn))
  }
  const stageMemo = new Map<string, StageOfFunction | null>()
  const stageFor = (jobFunction: string): StageOfFunction | null => {
    const fn = text(jobFunction)
    if (!fn) return null
    const hit = stageMemo.get(fn)
    if (hit !== undefined) return hit
    const saved = savedStage.get(fn)
    const proposed = saved ? null : proposeStage(fn, most(titles.get(fn)))
    const out: StageOfFunction | null = saved
      ? { stage: saved, source: 'saved' }
      : proposed
        ? { stage: proposed, source: 'proposed' }
        : null
    stageMemo.set(fn, out)
    return out
  }
  const stageOf = (jobFunction: string): number | null => {
    const s = stageFor(jobFunction)
    return s ? stageOrder(s.stage) : null
  }
  const engineeringOf = (family: string): { engineering: boolean; source: AttrSource } => {
    const saved = savedEngineeringOf.get(family.trim())
    return saved != null
      ? { engineering: saved, source: 'saved' }
      : { engineering: proposeEngineering(family), source: 'proposed' }
  }
  const familyFor = (e: Pick<Employee, 'jobFamily' | 'jobFunction'>): string | null =>
    text(e.jobFamily) ?? (text(e.jobFunction) ? familyOf(e.jobFunction as string) : null)
  const engineeringPlace = (e: Pick<Employee, 'jobFamily' | 'jobFunction'>): EngineeringPlace | null => {
    const family = familyFor(e)
    const fn = text(e.jobFunction)
    const saved = fn ? savedStage.get(fn) : undefined
    if (saved) return { family, jobFunction: fn, stage: saved, source: 'saved' }
    if (!family || !engineeringOf(family).engineering) return null
    const s = fn ? stageFor(fn) : null
    return { family, jobFunction: fn, stage: s?.stage ?? null, source: s?.source ?? null }
  }

  // Active headcount (employees only) per function and per family.
  const fnCount = new Map<string, number>()
  const famCount = new Map<string, number>()
  for (const e of employees) {
    if (!isEmployee(e)) continue
    if (asOf ? !isActiveAt(e, asOf) : e.terminationDate) continue
    const fn = text(e.jobFunction)
    if (fn) bump(fnCount, fn)
    const fam = familyFor(e)
    if (fam) bump(famCount, fam)
  }

  const byFamily = new Map<string, string[]>()
  const place = (fn: string) => {
    const fam = familyOf(fn)
    if (!fam) return
    const arr = byFamily.get(fam)
    if (!arr) byFamily.set(fam, [fn])
    else if (!arr.includes(fn)) arr.push(fn)
  }
  for (const fn of officialFunctions) place(fn)
  for (const fn of dataFunctions) place(fn)
  const familyNames = new Set<string>([...byFamily.keys(), ...dataFamilies])
  for (const v of famList?.values ?? []) if (!v.retired) familyNames.add(v.value)

  const byCount = (counts: Map<string, number>) => (a: string, b: string) =>
    (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b)
  const families: JobFamilyEntry[] = [...familyNames].sort(byCount(famCount)).map((name) => {
    const fns = byFamily.get(name) ?? []
    const counts = byCount(fnCount)
    const staged = fns
      .filter((f) => stageOf(f) != null)
      .sort((a, b) => (stageOf(a) ?? 0) - (stageOf(b) ?? 0) || counts(a, b))
    const rest = fns.filter((f) => stageOf(f) == null).sort(counts)
    return {
      name,
      functions: [...staged, ...rest].map((f) => ({ name: f, stage: stageOf(f) })),
    }
  })

  return {
    families,
    familyOf,
    stageOf,
    stageFor,
    engineeringOf,
    engineeringPlace,
    familyFor,
    source: fnList ? 'official' : 'data',
  }
}

const memo = new WeakMap<JobLists, WeakMap<readonly Employee[], Map<string, JobArchitecture>>>()

/**
 * The job architecture from the lists in force and the Employees rows. Active headcount is on
 * `asOf` (without it: everyone with no termination date). Memoized on the lists object, the
 * rows and the date, like `officialParentMaps`.
 */
export function jobArchitecture(
  lists: JobLists,
  employees: readonly Employee[],
  asOf?: ISODate,
): JobArchitecture {
  let byRows = memo.get(lists)
  if (!byRows) {
    byRows = new WeakMap()
    memo.set(lists, byRows)
  }
  let byDate = byRows.get(employees)
  if (!byDate) {
    byDate = new Map()
    byRows.set(employees, byDate)
  }
  const key = asOf ?? ''
  let hit = byDate.get(key)
  if (!hit) {
    hit = build(lists, employees, asOf)
    byDate.set(key, hit)
  }
  return hit
}

const kindsKey = (sources: SourceKinds): string =>
  Object.keys(sources)
    .filter((k) => sources[k as keyof SourceKinds]?.kind === 'upload')
    .sort()
    .join(',')

const contextMemo = new WeakMap<ListsState, Map<string, JobLists>>()

/**
 * The architecture the analytics context carries: the official lists for the saved state and the
 * kind of data loaded (the sample's lists while the sample is loaded), over the mapped Employees.
 */
export function contextJobs(
  saved: ListsState,
  sources: SourceKinds,
  employees: readonly Employee[],
  asOf: ISODate,
): JobArchitecture {
  const key = kindsKey(sources)
  let byKey = contextMemo.get(saved)
  if (!byKey) {
    byKey = new Map()
    contextMemo.set(saved, byKey)
  }
  let lists = byKey.get(key)
  if (!lists) {
    const official = officialLists(saved, sources)
    lists = { jobFamily: official.jobFamily, jobFunction: official.jobFunction }
    byKey.set(key, lists)
  }
  return jobArchitecture(lists, employees, asOf)
}
