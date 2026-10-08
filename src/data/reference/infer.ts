/**
 * How the categories in the data relate: business unit → department, location → country →
 * region, job family → job function → job title, plus where they disagree, and an inventory of the
 * values of every categorical field. Pure; headcounts are active employees on the as-of date.
 */
import { todayISO } from '@/lib/dates'
import { jobLevelsSwapped, type SwappedJobLevels } from '../import/swap'
import type { ImportIssue } from '../import/types'
import { isFilled } from '../quality/applicability'
import type { FieldRef } from '../quality/fieldRef'
import { parseFieldRef } from '../quality/fieldRef'
import {
  type Datasets,
  type Employee,
  type ISODate,
  LEVELS,
  type Level,
  levelIndex,
  type Region,
  SITES,
  siteByLocation,
} from '../schema'
import { resolveAsOf } from '../scope'
import { CATEGORIES, type CategoryDef } from './categories'

export interface Person {
  employeeId: string
  name: string
  level: Level | null
  jobTitle: string
}

export interface OrgEdge {
  /** Null when blank. */
  businessUnit: string | null
  department: string | null
  /** Active employees. */
  headcount: number
  /** Active workers including contractors and interns. */
  workers: number
  /** Active people with at least one active direct report. */
  managers: number
  /** Most senior active person (highest level, then longest tenure). */
  leader: Person | null
  costCenters: string[]
  sites: string[]
  /** Indexes into `employees` of the active workers on this edge. */
  rows: number[]
}

export interface Split {
  value: string | null
  /** Active employees; equals `rows.length`. */
  headcount: number
  /** Indexes of those employees (contractors and interns are left out). */
  rows: number[]
}

export interface DepartmentConflict {
  department: string
  /** The business units it appears under, largest first. */
  businessUnits: Split[]
  headcount: number
}

export interface ReqDepartmentGap {
  department: string
  businessUnit: string | null
  reqs: number
  openReqs: number
  /** Indexes into `requisitions`. */
  rows: number[]
}

export interface LocationEdge {
  location: string | null
  country: string | null
  /** From the known sites, by location then by country; null when neither is known. */
  region: Region | null
  headcount: number
  rows: number[]
}

/** One job family → job function placement. */
export interface JobEdge {
  jobFamily: string | null
  jobFunction: string | null
  headcount: number
  rows: number[]
}

/** A job function whose rows name more than one job family. */
export interface FunctionConflict {
  jobFunction: string
  /** The families it appears under, largest first (a null value: rows with no family). */
  families: Split[]
  headcount: number
}

export interface TitleEdge {
  jobFamily: string | null
  jobFunction: string | null
  jobTitle: string
  headcount: number
  levels: Partial<Record<Level, number>>
  rows: number[]
}

export interface FunctionLevelCell {
  jobFamily: string | null
  jobFunction: string | null
  level: Level | null
  headcount: number
  rows: number[]
}

export interface LevelOutlier {
  /** The job function the title sits in: the discipline holds the level ladder. */
  jobFunction: string
  jobTitle: string
  /** The title's median level. */
  level: Level
  /** The usual range of the function's other titles on the same track: 10th to 90th percentile. */
  usual: [Level, Level]
  /** Active employees with this title and a level; equals `rows.length`. */
  headcount: number
  rows: number[]
}

export interface CategoryValue {
  value: string
  count: number
  share: number
  /** In the category's known list (true when there is no list). */
  recognized: boolean
  /** Other spellings in the uploaded file that were read as this value. */
  spellings: string[]
}

export interface FieldInventory {
  ref: FieldRef
  category: CategoryDef
  /** Rows in the dataset. */
  total: number
  blank: number
  /** Every value in the data plus any known value not used, most frequent first. */
  values: CategoryValue[]
  /** Values that are not in the known list: in the rows now, or left blank at import. */
  unrecognized: { value: string; count: number; source: 'rows' | 'import' }[]
  /** The list the values were checked against: an official list, the category's own, or none. */
  vocab?: readonly string[] | null
}

export interface StructureReport {
  asOf: ISODate
  org: OrgEdge[]
  departmentsUnderSeveralUnits: DepartmentConflict[]
  departmentsWithoutUnit: Split[]
  reqDepartmentsNotInRoster: ReqDepartmentGap[]
  locations: LocationEdge[]
  /** Job family → job function placements, families in name order, then largest first. */
  jobs: JobEdge[]
  functionsUnderSeveralFamilies: FunctionConflict[]
  titles: TitleEdge[]
  functionLevels: FunctionLevelCell[]
  levelOutliers: LevelOutlier[]
  /** Active employees with no job function (counted only when some Employees row has one). */
  peopleWithoutFunction: { headcount: number; rows: number[] }
  /** Some Employees row has a job function. */
  hasJobFunction: boolean
  /** The two job columns look swapped: families sit inside functions (`jobLevelsSwapped`). */
  swapped: SwappedJobLevels | null
  categories: FieldInventory[]
}

/** A raw spelling from an uploaded file and what the importer read it as (null = not recognized). */
export interface RawSpelling {
  raw: string
  value: string | null
  count: number
}

export interface InferOptions {
  asOf?: ISODate
  /** Raw spellings per field (from `rawSpellings` on each version's stored sheet). */
  spellings?: Partial<Record<FieldRef, readonly RawSpelling[]>>
  /** Import logs, for values that were not recognized and left blank. */
  issues?: Partial<Record<string, readonly ImportIssue[]>>
  /** Which categories to inventory (default: all). */
  categories?: readonly string[]
  /**
   * Known values by category id, in place of the category's own list: the official lists
   * (Settings > Official lists). A category not named keeps its own list.
   */
  vocab?: Readonly<Partial<Record<string, readonly string[]>>>
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const isActive = (e: Employee, d: ISODate) =>
  !!e.hireDate && e.hireDate <= d && (!e.terminationDate || e.terminationDate > d)
const SEP = '\u0001'

function bucket<T>(map: Map<string, T>, key: string, make: () => T): T {
  let v = map.get(key)
  if (!v) {
    v = make()
    map.set(key, v)
  }
  return v
}

const bySize = (a: { headcount: number }, b: { headcount: number }) => b.headcount - a.headcount

function seniority(a: Employee, b: Employee): number {
  return (
    levelIndex(b.level ?? '') - levelIndex(a.level ?? '') ||
    (a.hireDate < b.hireDate ? -1 : a.hireDate > b.hireDate ? 1 : 0)
  )
}

function splits(groups: Map<string | null, { headcount: number; rows: number[] }>): Split[] {
  return [...groups.entries()].map(([value, g]) => ({ value, ...g })).sort(bySize)
}

function quantileLevel(sortedIdx: number[], q: number): number {
  if (!sortedIdx.length) return -1
  const at = Math.min(sortedIdx.length - 1, Math.max(0, Math.floor(q * (sortedIdx.length - 1))))
  return sortedIdx[at]
}

/** Career track of a level index: individual contributor (L), manager (M) or executive (E). */
const trackOf = (li: number) => LEVELS[li][0]

/** People in the same track with other titles needed before a title can be called an outlier. */
const MIN_OTHERS = 10
/** Rungs beyond the function's other titles before a title is flagged (2 = a rung left empty). */
const OUTLIER_RUNGS = 2

/**
 * Titles whose median level sits 2 or more rungs beyond every level held by the job function's
 * other titles on the same track, so at least one rung between them is empty. Comparing within a track
 * and against the other titles means the ends of a ladder (an entry-level associate, a principal
 * above a thin staff rung, a director over managers) are not flagged. `usual` reports the other
 * titles' 10th to 90th percentile.
 */
function findLevelOutliers(
  fnTitles: ReadonlyMap<string, ReadonlyMap<string, { levels: number[]; rows: number[] }>>,
): LevelOutlier[] {
  const out: LevelOutlier[] = []
  for (const [fn, byTitle] of fnTitles) {
    for (const [title, g] of byTitle) {
      const sorted = g.levels.slice().sort((a, b) => a - b)
      const med = sorted[Math.floor((sorted.length - 1) / 2)]
      const track = trackOf(med)
      const others: number[] = []
      for (const [t, o] of byTitle) {
        if (t === title) continue
        for (const li of o.levels) if (trackOf(li) === track) others.push(li)
      }
      if (others.length < MIN_OTHERS) continue
      others.sort((a, b) => a - b)
      if (med > others[0] - OUTLIER_RUNGS && med < others[others.length - 1] + OUTLIER_RUNGS) continue
      const lo = quantileLevel(others, 0.1)
      const hi = quantileLevel(others, 0.9)
      out.push({
        jobFunction: fn,
        jobTitle: title,
        level: LEVELS[med],
        usual: [LEVELS[lo], LEVELS[hi]],
        headcount: g.rows.length,
        rows: g.rows,
      })
    }
  }
  return out.sort(bySize)
}

export function inferStructure(datasets: Datasets, opts: InferOptions = {}): StructureReport {
  const asOf = opts.asOf ?? resolveAsOf(datasets, todayISO())
  const emps = datasets.employees
  const active: number[] = []
  emps.forEach((e, i) => {
    if (isActive(e, asOf)) active.push(i)
  })
  const isEmp = (i: number) => emps[i].employmentType === 'Employee'

  // Direct reports among active people.
  const activeIds = new Set(active.map((i) => emps[i].employeeId))
  const hasReports = new Set<string>()
  for (const i of active) {
    const m = emps[i].managerId
    if (m && activeIds.has(m) && m !== emps[i].employeeId) hasReports.add(m)
  }

  /* org: business unit → department */
  const org = new Map<string, OrgEdge>()
  for (const i of active) {
    const e = emps[i]
    const bu = str(e.businessUnit)
    const dept = str(e.department)
    const edge = bucket(org, `${bu}${SEP}${dept}`, () => ({
      businessUnit: bu,
      department: dept,
      headcount: 0,
      workers: 0,
      managers: 0,
      leader: null,
      costCenters: [],
      sites: [],
      rows: [],
    }))
    edge.workers++
    edge.rows.push(i)
    if (isEmp(i)) edge.headcount++
    if (hasReports.has(e.employeeId)) edge.managers++
    if (e.costCenter && !edge.costCenters.includes(e.costCenter)) edge.costCenters.push(e.costCenter)
    if (e.location && !edge.sites.includes(e.location)) edge.sites.push(e.location)
  }
  const orgEdges: OrgEdge[] = [...org.values()].map((edge) => {
    const top = edge.rows.map((i) => emps[i]).sort(seniority)[0]
    return {
      ...edge,
      leader: top
        ? { employeeId: top.employeeId, name: top.name, level: top.level, jobTitle: top.jobTitle }
        : null,
      costCenters: edge.costCenters.sort(),
      sites: edge.sites.sort(),
    }
  })
  orgEdges.sort((a, b) => (a.businessUnit ?? '￿').localeCompare(b.businessUnit ?? '￿') || bySize(a, b))

  // Conflicts count active employees, like every diagram and table: a placement held only by
  // contractors or interns is not a conflict, and the rows behind a split are its employees.
  const deptUnits = new Map<string, Map<string | null, { headcount: number; rows: number[] }>>()
  const noUnit = new Map<string | null, { headcount: number; rows: number[] }>()
  for (const edge of orgEdges) {
    if (edge.department == null || !edge.headcount) continue
    const split = { headcount: edge.headcount, rows: edge.rows.filter(isEmp) }
    bucket(deptUnits, edge.department, () => new Map()).set(edge.businessUnit, split)
    if (edge.businessUnit == null) noUnit.set(edge.department, split)
  }
  const departmentsUnderSeveralUnits: DepartmentConflict[] = [...deptUnits.entries()]
    .filter(([, m]) => [...m.keys()].filter((k) => k != null).length > 1)
    .map(([department, m]) => {
      const businessUnits = splits(new Map([...m.entries()].filter(([k]) => k != null)))
      return { department, businessUnits, headcount: businessUnits.reduce((a, s) => a + s.headcount, 0) }
    })
    .sort(bySize)
  const departmentsWithoutUnit = splits(noUnit)

  /* requisition departments not in the roster */
  const rosterDepts = new Set(active.map((i) => str(emps[i].department)).filter((d): d is string => !!d))
  const gaps = new Map<string, ReqDepartmentGap>()
  datasets.requisitions.forEach((r, i) => {
    const d = str(r.department)
    if (!d || rosterDepts.has(d)) return
    const g = bucket(gaps, `${d}${SEP}${r.businessUnit ?? ''}`, () => ({
      department: d,
      businessUnit: str(r.businessUnit),
      reqs: 0,
      openReqs: 0,
      rows: [] as number[],
    }))
    g.reqs++
    if (r.status === 'Open') g.openReqs++
    g.rows.push(i)
  })
  const reqDepartmentsNotInRoster = [...gaps.values()].sort((a, b) => b.reqs - a.reqs)

  /* locations: location → country → region */
  const regionByCountry = new Map(SITES.map((s) => [s.country, s.region]))
  const locs = new Map<string, LocationEdge>()
  for (const i of active) {
    const e = emps[i]
    const location = str(e.location)
    const country = str(e.country)
    const region =
      (location ? siteByLocation.get(location)?.region : undefined) ??
      (country ? regionByCountry.get(country) : undefined) ??
      null
    const edge = bucket(locs, `${location}${SEP}${country}`, () => ({
      location,
      country,
      region,
      headcount: 0,
      rows: [] as number[],
    }))
    if (isEmp(i)) edge.headcount++
    edge.rows.push(i)
  }
  const locations = [...locs.values()].sort(bySize)

  /* job architecture: job family → job function → title */
  const jobs = new Map<string, JobEdge>()
  const titles = new Map<string, TitleEdge>()
  const cells = new Map<string, FunctionLevelCell>()
  /** Per function, the level indexes of its employees by title (employees with a level only). */
  const fnTitles = new Map<string, Map<string, { levels: number[]; rows: number[] }>>()
  const noFunction: number[] = []
  for (const i of active) {
    const e = emps[i]
    const fam = str(e.jobFamily)
    const fn = str(e.jobFunction)
    const title = str(e.jobTitle) ?? '(No title)'
    const emp = isEmp(i)
    const j = bucket(jobs, `${fam}${SEP}${fn}`, () => ({
      jobFamily: fam,
      jobFunction: fn,
      headcount: 0,
      rows: [] as number[],
    }))
    j.rows.push(i)
    const t = bucket(
      titles,
      `${fam}${SEP}${fn}${SEP}${title}`,
      (): TitleEdge => ({
        jobFamily: fam,
        jobFunction: fn,
        jobTitle: title,
        headcount: 0,
        levels: {},
        rows: [],
      }),
    )
    t.rows.push(i)
    const c = bucket(cells, `${fam}${SEP}${fn}${SEP}${e.level}`, () => ({
      jobFamily: fam,
      jobFunction: fn,
      level: e.level,
      headcount: 0,
      rows: [] as number[],
    }))
    c.rows.push(i)
    if (!emp) continue
    j.headcount++
    t.headcount++
    c.headcount++
    if (e.level) t.levels[e.level] = (t.levels[e.level] ?? 0) + 1
    if (!fn) noFunction.push(i)
    const li = levelIndex(e.level ?? '')
    if (fn && li >= 0) {
      const g = bucket(
        bucket(fnTitles, fn, () => new Map()),
        title,
        () => ({
          levels: [] as number[],
          rows: [] as number[],
        }),
      )
      g.levels.push(li)
      g.rows.push(i)
    }
  }
  const jobEdges = [...jobs.values()].sort(
    (a, b) => (a.jobFamily ?? '￿').localeCompare(b.jobFamily ?? '￿') || bySize(a, b),
  )
  const fnFams = new Map<string, Map<string | null, { headcount: number; rows: number[] }>>()
  for (const edge of jobEdges) {
    if (!edge.jobFunction || !edge.headcount) continue
    bucket(fnFams, edge.jobFunction, () => new Map()).set(edge.jobFamily, {
      headcount: edge.headcount,
      rows: edge.rows.filter(isEmp),
    })
  }
  const functionsUnderSeveralFamilies: FunctionConflict[] = [...fnFams.entries()]
    .filter(([, m]) => m.size > 1)
    .map(([jobFunction, m]) => {
      const families = splits(m)
      return { jobFunction, families, headcount: families.reduce((a, s) => a + s.headcount, 0) }
    })
    .sort(bySize)

  const levelOutliers = findLevelOutliers(fnTitles)
  const hasJobFunction = emps.some((e) => !!str(e.jobFunction))

  return {
    asOf,
    org: orgEdges,
    departmentsUnderSeveralUnits,
    departmentsWithoutUnit,
    reqDepartmentsNotInRoster,
    locations,
    jobs: jobEdges,
    functionsUnderSeveralFamilies,
    titles: [...titles.values()].sort(bySize),
    functionLevels: [...cells.values()].sort(
      (a, b) =>
        (a.jobFamily ?? '￿').localeCompare(b.jobFamily ?? '￿') ||
        (a.jobFunction ?? '￿').localeCompare(b.jobFunction ?? '￿') ||
        levelIndex(a.level ?? '') - levelIndex(b.level ?? ''),
    ),
    levelOutliers,
    peopleWithoutFunction: hasJobFunction
      ? { headcount: noFunction.length, rows: noFunction }
      : { headcount: 0, rows: [] },
    hasJobFunction,
    swapped: jobLevelsSwapped(emps),
    categories: inventory(datasets, opts),
  }
}

/** Values of every categorical field (or the categories asked for), with spellings and gaps. */
export function inventory(datasets: Datasets, opts: InferOptions = {}): FieldInventory[] {
  const wanted = opts.categories ? new Set(opts.categories) : null
  const out: FieldInventory[] = []
  for (const category of CATEGORIES) {
    if (wanted && !wanted.has(category.id)) continue
    const list = opts.vocab?.[category.id] ?? category.vocab
    const known = list ? new Set(list) : null
    for (const ref of category.refs) {
      const p = parseFieldRef(ref)
      if (!p) continue
      const rows = datasets[p.dataset] as unknown as Record<string, unknown>[]
      const counts = new Map<string, number>()
      let blank = 0
      for (const r of rows) {
        const v = r[p.field]
        if (!isFilled(v)) {
          blank++
          continue
        }
        const s = String(v)
        counts.set(s, (counts.get(s) ?? 0) + 1)
      }
      const filled = rows.length - blank
      const spell = new Map<string, string[]>()
      const importUnknown = new Map<string, number>()
      for (const s of opts.spellings?.[ref] ?? []) {
        if (s.value == null) importUnknown.set(s.raw, (importUnknown.get(s.raw) ?? 0) + s.count)
        else if (s.raw !== s.value) bucket(spell, s.value, () => []).push(s.raw)
      }
      for (const i of opts.issues?.[p.dataset] ?? []) {
        if (i.field !== p.field || i.code !== 'unknown-value' || !i.value || i.row === 0) continue
        if (!opts.spellings?.[ref]) importUnknown.set(i.value, (importUnknown.get(i.value) ?? 0) + 1)
      }
      const values: CategoryValue[] = [...counts.entries()].map(([value, count]) => ({
        value,
        count,
        share: filled ? count / filled : 0,
        recognized: !known || known.has(value),
        spellings: spell.get(value) ?? [],
      }))
      if (known)
        for (const v of known)
          if (!counts.has(v))
            values.push({ value: v, count: 0, share: 0, recognized: true, spellings: spell.get(v) ?? [] })
      values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      out.push({
        ref,
        category,
        vocab: list,
        total: rows.length,
        blank,
        values,
        unrecognized: [
          ...values
            .filter((v) => !v.recognized)
            .map((v) => ({ value: v.value, count: v.count, source: 'rows' as const })),
          ...[...importUnknown.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([value, count]) => ({ value, count, source: 'import' as const })),
        ],
      })
    }
  }
  return out
}
