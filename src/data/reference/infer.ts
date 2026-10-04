/**
 * How the categories in the data relate: business unit → department, location → country →
 * region, function → job family → job title, plus where they disagree, and an inventory of the
 * values of every categorical field. Pure; headcounts are active employees on the as-of date.
 */
import { todayISO } from '@/lib/dates'
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

export interface FunctionEdge {
  jobFunction: string | null
  jobFamily: string | null
  headcount: number
  rows: number[]
}

export interface FamilyConflict {
  jobFamily: string
  functions: Split[]
  headcount: number
}

export interface TitleEdge {
  jobFunction: string | null
  jobFamily: string | null
  jobTitle: string
  headcount: number
  levels: Partial<Record<Level, number>>
  rows: number[]
}

export interface FamilyLevelCell {
  jobFamily: string | null
  level: Level | null
  headcount: number
  rows: number[]
}

export interface LevelOutlier {
  jobFamily: string
  jobTitle: string
  /** The title's median level. */
  level: Level
  /** The usual range of the family's other titles on the same track: 10th to 90th percentile. */
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
  functions: FunctionEdge[]
  familiesUnderSeveralFunctions: FamilyConflict[]
  titles: TitleEdge[]
  familyLevels: FamilyLevelCell[]
  levelOutliers: LevelOutlier[]
  peopleWithoutFamily: { headcount: number; rows: number[] }
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
/** Rungs beyond the family's other titles before a title is flagged (2 = a rung left empty). */
const OUTLIER_RUNGS = 2

/**
 * Titles whose median level sits 2 or more rungs beyond every level held by the family's other
 * titles on the same track, so at least one rung between them is empty. Comparing within a track
 * and against the other titles means the ends of a ladder (an entry-level associate, a principal
 * above a thin staff rung, a director over managers) are not flagged. `usual` reports the other
 * titles' 10th to 90th percentile.
 */
function findLevelOutliers(
  famTitles: ReadonlyMap<string, ReadonlyMap<string, { levels: number[]; rows: number[] }>>,
): LevelOutlier[] {
  const out: LevelOutlier[] = []
  for (const [fam, byTitle] of famTitles) {
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
        jobFamily: fam,
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

  /* job architecture: function → family → title */
  const fns = new Map<string, FunctionEdge>()
  const titles = new Map<string, TitleEdge>()
  const cells = new Map<string, FamilyLevelCell>()
  /** Per family, the level indexes of its employees by title (employees with a level only). */
  const famTitles = new Map<string, Map<string, { levels: number[]; rows: number[] }>>()
  const noFamily: number[] = []
  for (const i of active) {
    const e = emps[i]
    const fn = str(e.jobFunction)
    const fam = str(e.jobFamily)
    const title = str(e.jobTitle) ?? '(No title)'
    const emp = isEmp(i)
    const f = bucket(fns, `${fn}${SEP}${fam}`, () => ({
      jobFunction: fn,
      jobFamily: fam,
      headcount: 0,
      rows: [] as number[],
    }))
    f.rows.push(i)
    const t = bucket(
      titles,
      `${fn}${SEP}${fam}${SEP}${title}`,
      (): TitleEdge => ({
        jobFunction: fn,
        jobFamily: fam,
        jobTitle: title,
        headcount: 0,
        levels: {},
        rows: [],
      }),
    )
    t.rows.push(i)
    const c = bucket(cells, `${fam}${SEP}${e.level}`, () => ({
      jobFamily: fam,
      level: e.level,
      headcount: 0,
      rows: [] as number[],
    }))
    c.rows.push(i)
    if (!emp) continue
    f.headcount++
    t.headcount++
    c.headcount++
    if (e.level) t.levels[e.level] = (t.levels[e.level] ?? 0) + 1
    if (!fam) noFamily.push(i)
    const li = levelIndex(e.level ?? '')
    if (fam && li >= 0) {
      const g = bucket(
        bucket(famTitles, fam, () => new Map()),
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
  const functions = [...fns.values()].sort(
    (a, b) => (a.jobFunction ?? '￿').localeCompare(b.jobFunction ?? '￿') || bySize(a, b),
  )
  const famFns = new Map<string, Map<string | null, { headcount: number; rows: number[] }>>()
  for (const edge of functions) {
    if (!edge.jobFamily || !edge.headcount) continue
    bucket(famFns, edge.jobFamily, () => new Map()).set(edge.jobFunction, {
      headcount: edge.headcount,
      rows: edge.rows.filter(isEmp),
    })
  }
  const familiesUnderSeveralFunctions: FamilyConflict[] = [...famFns.entries()]
    .filter(([, m]) => m.size > 1)
    .map(([jobFamily, m]) => {
      const fs = splits(m)
      return { jobFamily, functions: fs, headcount: fs.reduce((a, s) => a + s.headcount, 0) }
    })
    .sort(bySize)

  const levelOutliers = findLevelOutliers(famTitles)

  return {
    asOf,
    org: orgEdges,
    departmentsUnderSeveralUnits,
    departmentsWithoutUnit,
    reqDepartmentsNotInRoster,
    locations,
    functions,
    familiesUnderSeveralFunctions,
    titles: [...titles.values()].sort(bySize),
    familyLevels: [...cells.values()].sort(
      (a, b) =>
        (a.jobFamily ?? '￿').localeCompare(b.jobFamily ?? '￿') ||
        levelIndex(a.level ?? '') - levelIndex(b.level ?? ''),
    ),
    levelOutliers,
    peopleWithoutFamily: { headcount: noFamily.length, rows: noFamily },
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
