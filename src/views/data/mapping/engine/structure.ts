/**
 * The structure report (`inferStructure`) shaped for the Categories & mapping tab: the mapping
 * diagrams with what each node and ribbon stands for, and the rows of the tables beside them.
 * Counts are active employees on the as-of date (headcount); every part keeps the row indexes of
 * those people so a click can list them. Pure.
 */
import type { JobEdge, OrgEdge, StructureReport, TitleEdge } from '@/data/reference'
import { type Employee, LEVELS, type Level, levelIndex, REGIONS } from '@/data/schema'
import type { DiagramLinkInput, DiagramNodeInput, DiagramSpec } from './diagram'

export const BLANK = {
  businessUnit: '(No business unit)',
  department: '(No department)',
  location: '(No location)',
  country: '(No country)',
  region: '(Region not known)',
  jobFamily: '(No job family)',
  jobFunction: '(No job function)',
  level: '(No level)',
} as const

export const OTHER_TITLES = 'Other titles'

/** Titles shown in a job function's diagram before the rest fold into "Other titles". */
export const MAX_TITLES = 24

/** What a node or ribbon stands for: the people behind it and the lines of its tooltip. */
export interface DiagramPart {
  title: string
  /** Active employees. */
  headcount: number
  /** Indexes into `employees` of the active employees counted. */
  rows: number[]
  lines: { value: string; label: string }[]
  /** Why it is flagged, when it is. */
  flag?: string
}

export interface MappedDiagram {
  spec: DiagramSpec
  parts: Map<string, DiagramPart>
}

const intText = (n: number) => n.toLocaleString('en-US')
const name = (v: string | null, blank: string) => v ?? blank

/** The employees among a list of active workers (contractors and interns are left out). */
export function employeesOnly(rows: readonly number[], employees: readonly Employee[]): number[] {
  return rows.filter((i) => employees[i]?.employmentType === 'Employee')
}

interface Group<T> {
  key: string | null
  headcount: number
  rows: number[]
  items: T[]
}

function groupBy<T extends { headcount: number; rows: number[] }>(
  items: readonly T[],
  keyOf: (t: T) => string | null,
): Map<string | null, Group<T>> {
  const out = new Map<string | null, Group<T>>()
  for (const t of items) {
    const k = keyOf(t)
    let g = out.get(k)
    if (!g) {
      g = { key: k, headcount: 0, rows: [], items: [] }
      out.set(k, g)
    }
    g.headcount += t.headcount
    g.rows.push(...t.rows)
    g.items.push(t)
  }
  return out
}

/** Largest first, blanks last, then by name. */
function bySize<T>(a: Group<T>, b: Group<T>): number {
  if ((a.key == null) !== (b.key == null)) return a.key == null ? 1 : -1
  return b.headcount - a.headcount || (a.key ?? '').localeCompare(b.key ?? '')
}

/** The value a group sits under most (blanks only when there is nothing else). */
function primaryOf<T extends { headcount: number }>(items: readonly T[], keyOf: (t: T) => string | null) {
  let best: T | null = null
  for (const t of items) {
    if (!best) best = t
    else if ((keyOf(best) == null && keyOf(t) != null) || (keyOf(t) != null && t.headcount > best.headcount))
      best = t
  }
  return best ? keyOf(best) : null
}

/* ───────────── org: business unit → department ───────────── */

export function orgDiagram(r: StructureReport, employees: readonly Employee[]): MappedDiagram {
  const parts = new Map<string, DiagramPart>()
  const several = new Set(r.departmentsUnderSeveralUnits.map((d) => d.department))
  const units = [...groupBy(r.org, (e) => e.businessUnit).values()].sort(bySize)
  const unitRank = new Map(units.map((u, i) => [u.key, i]))
  const depts = [...groupBy(r.org, (e) => e.department).values()]
  const primary = new Map(depts.map((d) => [d.key, primaryOf(d.items, (e) => e.businessUnit)]))
  depts.sort(
    (a, b) =>
      (unitRank.get(primary.get(a.key) ?? null) ?? 99) - (unitRank.get(primary.get(b.key) ?? null) ?? 99) ||
      bySize(a, b),
  )

  const nodes: DiagramNodeInput[] = []
  const links: DiagramLinkInput[] = []
  for (const u of units) {
    const id = `u:${u.key ?? ''}`
    nodes.push({
      id,
      column: 0,
      label: name(u.key, BLANK.businessUnit),
      value: u.headcount,
      flag: u.key == null ? 'warning' : null,
    })
    parts.set(id, {
      title: name(u.key, BLANK.businessUnit),
      headcount: u.headcount,
      rows: employeesOnly(u.rows, employees),
      lines: [
        { value: intText(u.headcount), label: 'headcount' },
        { value: intText(u.items.filter((e) => e.department != null).length), label: 'departments' },
      ],
      flag: u.key == null ? 'These people have no business unit.' : undefined,
    })
  }
  for (const d of depts) {
    const id = `d:${d.key ?? ''}`
    const flagged = d.key == null || several.has(d.key)
    const managers = d.items.reduce((s, e) => s + e.managers, 0)
    nodes.push({
      id,
      column: 1,
      label: name(d.key, BLANK.department),
      value: d.headcount,
      flag: flagged ? 'warning' : null,
    })
    const leader = leaderOf(d.items)
    parts.set(id, {
      title: name(d.key, BLANK.department),
      headcount: d.headcount,
      rows: employeesOnly(d.rows, employees),
      lines: [
        { value: intText(d.headcount), label: 'headcount' },
        { value: intText(managers), label: managers === 1 ? 'manager' : 'managers' },
        ...(leader ? [{ value: leader.name, label: leaderLine(leader) }] : []),
        d.items.length > 1
          ? { value: intText(d.items.length), label: 'business units' }
          : { value: name(d.items[0]?.businessUnit ?? null, BLANK.businessUnit), label: 'business unit' },
      ],
      flag:
        d.key == null
          ? 'These people have no department.'
          : several.has(d.key)
            ? `Appears under ${d.items.filter((e) => e.businessUnit != null).length} business units.`
            : undefined,
    })
    for (const e of d.items) {
      const lid = `u:${e.businessUnit ?? ''}>${id}`
      const minor = several.has(d.key ?? '') && e.businessUnit !== primary.get(d.key)
      links.push({
        id: lid,
        source: `u:${e.businessUnit ?? ''}`,
        target: id,
        value: e.headcount,
        flag: minor || e.businessUnit == null ? 'warning' : null,
      })
      parts.set(lid, {
        title: `${name(e.businessUnit, BLANK.businessUnit)} to ${name(e.department, BLANK.department)}`,
        headcount: e.headcount,
        rows: employeesOnly(e.rows, employees),
        lines: [
          { value: intText(e.headcount), label: 'headcount' },
          ...(d.headcount > 0 && d.items.length > 1
            ? [{ value: pct(e.headcount / d.headcount), label: 'of the department' }]
            : []),
        ],
        flag: minor ? 'The department sits mostly under another business unit.' : undefined,
      })
    }
  }
  return { spec: { columns: ['Business unit', 'Department'], nodes, links }, parts }
}

const pct = (share: number) => `${Math.round(share * 1000) / 10}%`

function leaderOf(edges: readonly OrgEdge[]) {
  let best: OrgEdge['leader'] = null
  for (const e of edges) {
    const l = e.leader
    if (!l) continue
    if (!best || levelIndex(l.level ?? '') > levelIndex(best.level ?? '')) best = l
  }
  return best
}

const leaderLine = (l: NonNullable<OrgEdge['leader']>) =>
  ['most senior', l.level ? `(${l.level})` : null].filter(Boolean).join(' ')

export interface OrgRow {
  businessUnit: string
  department: string
  headcount: number
  managers: number
  leader: string
  leaderId: string | null
  leaderLevel: string
  leaderTitle: string
  costCenters: string
  sites: string
  status: string
  flagged: boolean
  rows: number[]
  managerRows: number[]
}

/** One row per business unit and department pair, in the diagram's order. */
export function orgRows(
  r: StructureReport,
  employees: readonly Employee[],
  managerIds: ReadonlySet<string>,
): OrgRow[] {
  const several = new Set(r.departmentsUnderSeveralUnits.map((d) => d.department))
  return r.org.map((e) => {
    const flagged = e.businessUnit == null || e.department == null || several.has(e.department ?? '')
    return {
      businessUnit: name(e.businessUnit, BLANK.businessUnit),
      department: name(e.department, BLANK.department),
      headcount: e.headcount,
      managers: e.managers,
      leader: e.leader?.name ?? '',
      leaderId: e.leader?.employeeId ?? null,
      leaderLevel: e.leader?.level ?? '',
      leaderTitle: e.leader?.jobTitle ?? '',
      costCenters: e.costCenters.join(', '),
      sites: e.sites.join(', '),
      status:
        e.businessUnit == null
          ? 'No business unit'
          : e.department == null
            ? 'No department'
            : several.has(e.department)
              ? 'Under several business units'
              : '',
      flagged,
      rows: employeesOnly(e.rows, employees),
      managerRows: e.rows.filter((i) => managerIds.has(employees[i]?.employeeId ?? '')),
    }
  })
}

/** Active people with at least one active direct report, as the structure report counts managers. */
export function activeManagerIds(employees: readonly Employee[], active: readonly number[]): Set<string> {
  const ids = new Set(active.map((i) => employees[i].employeeId))
  const out = new Set<string>()
  for (const i of active) {
    const m = employees[i].managerId
    if (m && ids.has(m) && m !== employees[i].employeeId) out.add(m)
  }
  return out
}

/* ───────────── locations: location → country → region ───────────── */

export interface LocationRow {
  location: string
  country: string
  region: string
  headcount: number
  status: string
  rows: number[]
}

export function locationDiagram(r: StructureReport, employees: readonly Employee[]): MappedDiagram {
  const parts = new Map<string, DiagramPart>()
  const edges = r.locations.map((l) => ({ ...l, rows: employeesOnly(l.rows, employees) }))
  const regionRank = (v: string | null) => (v == null ? 99 : REGIONS.indexOf(v as (typeof REGIONS)[number]))
  const regions = [...groupBy(edges, (e) => e.region).values()].sort(
    (a, b) => regionRank(a.key) - regionRank(b.key),
  )
  const countries = [...groupBy(edges, (e) => e.country).values()]
  const countryRegion = new Map(countries.map((c) => [c.key, primaryOf(c.items, (e) => e.region)]))
  countries.sort(
    (a, b) =>
      regionRank(countryRegion.get(a.key) ?? null) - regionRank(countryRegion.get(b.key) ?? null) ||
      bySize(a, b),
  )
  const countryRank = new Map(countries.map((c, i) => [c.key, i]))
  const locations = [...groupBy(edges, (e) => e.location).values()]
  const locCountry = new Map(locations.map((l) => [l.key, primaryOf(l.items, (e) => e.country)]))
  locations.sort(
    (a, b) =>
      (countryRank.get(locCountry.get(a.key) ?? null) ?? 99) -
        (countryRank.get(locCountry.get(b.key) ?? null) ?? 99) || bySize(a, b),
  )
  const nodes: DiagramNodeInput[] = []
  const links: DiagramLinkInput[] = []
  const add = (
    id: string,
    column: number,
    label: string,
    g: Group<unknown>,
    flag: string | undefined,
    extra: DiagramPart['lines'] = [],
  ) => {
    nodes.push({ id, column, label, value: g.headcount, flag: flag ? 'warning' : null })
    parts.set(id, {
      title: label,
      headcount: g.headcount,
      rows: g.rows,
      lines: [{ value: intText(g.headcount), label: 'headcount' }, ...extra],
      flag,
    })
  }
  for (const l of locations) {
    const countriesOf = new Set(l.items.map((e) => e.country))
    add(
      `l:${l.key ?? ''}`,
      0,
      name(l.key, BLANK.location),
      l,
      countriesOf.size > 1
        ? `Listed under ${countriesOf.size} countries.`
        : l.key == null
          ? 'These people have no location.'
          : undefined,
    )
  }
  for (const c of countries)
    add(
      `c:${c.key ?? ''}`,
      1,
      name(c.key, BLANK.country),
      c,
      c.key == null ? 'These people have no country.' : undefined,
    )
  for (const g of regions)
    add(
      `r:${g.key ?? ''}`,
      2,
      name(g.key, BLANK.region),
      g,
      g.key == null ? 'Neither the location nor the country is a known site.' : undefined,
    )
  for (const e of edges) {
    const id = `l:${e.location ?? ''}>c:${e.country ?? ''}`
    links.push({ id, source: `l:${e.location ?? ''}`, target: `c:${e.country ?? ''}`, value: e.headcount })
    parts.set(id, {
      title: `${name(e.location, BLANK.location)} in ${name(e.country, BLANK.country)}`,
      headcount: e.headcount,
      rows: e.rows,
      lines: [{ value: intText(e.headcount), label: 'headcount' }],
    })
  }
  for (const [key, g] of groupBy(edges, (e) => `${e.country ?? ''}\u0001${e.region ?? ''}`)) {
    const [country, region] = (key ?? '').split('\u0001')
    const id = `c:${country}>r:${region}`
    links.push({
      id,
      source: `c:${country}`,
      target: `r:${region}`,
      value: g.headcount,
      flag: region ? null : 'warning',
    })
    parts.set(id, {
      title: `${country || BLANK.country} in ${region || BLANK.region}`,
      headcount: g.headcount,
      rows: g.rows,
      lines: [{ value: intText(g.headcount), label: 'headcount' }],
    })
  }
  return { spec: { columns: ['Location', 'Country', 'Region'], nodes, links }, parts }
}

export function locationRows(r: StructureReport, employees: readonly Employee[]): LocationRow[] {
  const countriesOf = new Map<string | null, Set<string | null>>()
  for (const l of r.locations) {
    const s = countriesOf.get(l.location) ?? new Set()
    s.add(l.country)
    countriesOf.set(l.location, s)
  }
  return r.locations.map((l) => ({
    location: name(l.location, BLANK.location),
    country: name(l.country, BLANK.country),
    region: name(l.region, BLANK.region),
    headcount: l.headcount,
    status:
      (countriesOf.get(l.location)?.size ?? 0) > 1
        ? 'Under several countries'
        : l.region == null
          ? 'Region not known'
          : '',
    rows: employeesOnly(l.rows, employees),
  }))
}

/* ───────────── job architecture: job family → job function → job title ───────────── */

/** Job functions ordered under their main family, families largest first: the order of the diagram and heatmap. */
export function functionOrder(r: StructureReport): (string | null)[] {
  const fams = [...groupBy(r.jobs, (e) => e.jobFamily).values()].sort(bySize)
  const famRank = new Map(fams.map((f, i) => [f.key, i]))
  const fns = [...groupBy(r.jobs, (e) => e.jobFunction).values()]
  const primary = new Map(fns.map((f) => [f.key, primaryOf(f.items, (e) => e.jobFamily)]))
  fns.sort(
    (a, b) =>
      (famRank.get(primary.get(a.key) ?? null) ?? 99) - (famRank.get(primary.get(b.key) ?? null) ?? 99) ||
      bySize(a, b),
  )
  return fns.map((f) => f.key)
}

function topTitles(titles: readonly TitleEdge[], n = 4): string {
  const by = new Map<string, number>()
  for (const t of titles) by.set(t.jobTitle, (by.get(t.jobTitle) ?? 0) + t.headcount)
  return [...by.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t)
    .join(', ')
}

/** Job family → job function; with `fn`, the families that function sits under → the function → its titles. */
export function jobDiagram(
  r: StructureReport,
  employees: readonly Employee[],
  fn?: { value: string | null } | null,
): MappedDiagram {
  const parts = new Map<string, DiagramPart>()
  const severalFams = new Set(r.functionsUnderSeveralFamilies.map((f) => f.jobFunction))
  const edges: JobEdge[] = (fn ? r.jobs.filter((e) => e.jobFunction === fn.value) : r.jobs).map((e) => ({
    ...e,
    rows: employeesOnly(e.rows, employees),
  }))
  const fams = [...groupBy(edges, (e) => e.jobFamily).values()].sort(bySize)
  const order = functionOrder(r)
  const fns = [...groupBy(edges, (e) => e.jobFunction).values()].sort(
    (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
  )
  const primary = new Map(fns.map((f) => [f.key, primaryOf(f.items, (e) => e.jobFamily)]))
  const titlesOf = (f: string | null) => r.titles.filter((t) => t.jobFunction === f)
  const nodes: DiagramNodeInput[] = []
  const links: DiagramLinkInput[] = []
  for (const f of fams) {
    const id = `f:${f.key ?? ''}`
    nodes.push({
      id,
      column: 0,
      label: name(f.key, BLANK.jobFamily),
      value: f.headcount,
      flag: f.key == null ? 'warning' : null,
    })
    parts.set(id, {
      title: name(f.key, BLANK.jobFamily),
      headcount: f.headcount,
      rows: f.rows,
      lines: [
        { value: intText(f.headcount), label: 'headcount' },
        { value: intText(f.items.filter((e) => e.jobFunction != null).length), label: 'job functions' },
      ],
      flag: f.key == null ? 'These people have no job family.' : undefined,
    })
  }
  for (const g of fns) {
    const id = `j:${g.key ?? ''}`
    const flagged = g.key == null || severalFams.has(g.key)
    nodes.push({
      id,
      column: 1,
      label: name(g.key, BLANK.jobFunction),
      value: g.headcount,
      flag: flagged ? 'warning' : null,
    })
    const titles = titlesOf(g.key)
    parts.set(id, {
      title: name(g.key, BLANK.jobFunction),
      headcount: g.headcount,
      rows: g.rows,
      lines: [
        { value: intText(g.headcount), label: 'headcount' },
        { value: intText(new Set(titles.map((t) => t.jobTitle)).size), label: 'job titles' },
        ...(titles.length ? [{ value: 'Largest', label: topTitles(titles) }] : []),
      ],
      flag:
        g.key == null
          ? 'These people have no job function.'
          : severalFams.has(g.key)
            ? `Appears under ${new Set(r.jobs.filter((e) => e.jobFunction === g.key).map((e) => e.jobFamily)).size} job families.`
            : undefined,
    })
    for (const e of g.items) {
      const lid = `f:${e.jobFamily ?? ''}>${id}`
      const minor = g.key != null && severalFams.has(g.key) && e.jobFamily !== primary.get(g.key)
      links.push({
        id: lid,
        source: `f:${e.jobFamily ?? ''}`,
        target: id,
        value: e.headcount,
        flag: minor || e.jobFamily == null ? 'warning' : null,
      })
      parts.set(lid, {
        title: `${name(e.jobFamily, BLANK.jobFamily)} to ${name(e.jobFunction, BLANK.jobFunction)}`,
        headcount: e.headcount,
        rows: e.rows,
        lines: [{ value: intText(e.headcount), label: 'headcount' }],
        flag: minor ? 'The job function sits mostly under another family.' : undefined,
      })
    }
  }
  if (!fn) return { spec: { columns: ['Job family', 'Job function'], nodes, links }, parts }

  // The function's titles, largest first; the rest fold into one node.
  const fnId = `j:${fn.value ?? ''}`
  const byTitle = new Map<
    string,
    { headcount: number; rows: number[]; levels: Partial<Record<Level, number>> }
  >()
  for (const t of titlesOf(fn.value)) {
    const g = byTitle.get(t.jobTitle) ?? { headcount: 0, rows: [], levels: {} }
    g.headcount += t.headcount
    g.rows.push(...employeesOnly(t.rows, employees))
    for (const [l, n] of Object.entries(t.levels) as [Level, number][]) g.levels[l] = (g.levels[l] ?? 0) + n
    byTitle.set(t.jobTitle, g)
  }
  const sorted = [...byTitle.entries()].sort(
    (a, b) => b[1].headcount - a[1].headcount || a[0].localeCompare(b[0]),
  )
  const shown = sorted.length > MAX_TITLES ? sorted.slice(0, MAX_TITLES - 1) : sorted
  const rest = sorted.slice(shown.length)
  const titleNode = (
    key: string,
    label: string,
    g: { headcount: number; rows: number[]; levels: Partial<Record<Level, number>> },
    extra?: string,
  ) => {
    const id = `t:${key}`
    nodes.push({ id, column: 2, label, value: g.headcount })
    parts.set(id, {
      title: label,
      headcount: g.headcount,
      rows: g.rows,
      lines: [
        { value: intText(g.headcount), label: 'headcount' },
        ...(levelText(g.levels) ? [{ value: 'Levels', label: levelText(g.levels) }] : []),
        ...(extra ? [{ value: '', label: extra }] : []),
      ],
    })
    const lid = `${fnId}>${id}`
    links.push({ id: lid, source: fnId, target: id, value: g.headcount })
    parts.set(lid, { ...parts.get(id)!, title: `${name(fn.value, BLANK.jobFunction)}: ${label}` })
  }
  for (const [t, g] of shown) titleNode(t, t, g)
  if (rest.length) {
    const g = { headcount: 0, rows: [] as number[], levels: {} as Partial<Record<Level, number>> }
    for (const [, x] of rest) {
      g.headcount += x.headcount
      g.rows.push(...x.rows)
      for (const [l, n] of Object.entries(x.levels) as [Level, number][]) g.levels[l] = (g.levels[l] ?? 0) + n
    }
    titleNode('\u0000other', `${OTHER_TITLES} (${rest.length})`, g, `${rest.length} smaller titles`)
  }
  return { spec: { columns: ['Job family', 'Job function', 'Job title'], nodes, links }, parts }
}

/** "L3 12 · L4 8" in level order. */
export function levelText(levels: Partial<Record<Level, number>>): string {
  return LEVELS.filter((l) => levels[l])
    .map((l) => `${l} ${intText(levels[l]!)}`)
    .join(' · ')
}

export interface JobRow {
  jobFamily: string
  jobFunction: string
  headcount: number
  titles: number
  levels: string
  status: string
  flagged: boolean
  rows: number[]
}

/** One row per job family and job function placement, in the diagram order. */
export function jobRows(r: StructureReport, employees: readonly Employee[]): JobRow[] {
  const several = new Set(r.functionsUnderSeveralFamilies.map((f) => f.jobFunction))
  const order = functionOrder(r)
  const rank = (f: string | null) => order.indexOf(f)
  return [...r.jobs]
    .sort((a, b) => rank(a.jobFunction) - rank(b.jobFunction) || b.headcount - a.headcount)
    .map((e) => {
      const titles = r.titles.filter((t) => t.jobFamily === e.jobFamily && t.jobFunction === e.jobFunction)
      const span = levelSpan(titles)
      return {
        jobFamily: name(e.jobFamily, BLANK.jobFamily),
        jobFunction: name(e.jobFunction, BLANK.jobFunction),
        headcount: e.headcount,
        titles: new Set(titles.map((t) => t.jobTitle)).size,
        levels: span,
        status:
          e.jobFunction == null
            ? 'No job function'
            : several.has(e.jobFunction)
              ? 'Under several families'
              : e.jobFamily == null
                ? 'No job family'
                : '',
        flagged: e.jobFamily == null || e.jobFunction == null || several.has(e.jobFunction),
        rows: employeesOnly(e.rows, employees),
      }
    })
}

/** "L2 to M1": the lowest and highest level among titles. */
function levelSpan(titles: readonly TitleEdge[]): string {
  const idx = titles.flatMap((t) => (Object.keys(t.levels) as Level[]).map(levelIndex)).filter((i) => i >= 0)
  if (!idx.length) return ''
  const lo = LEVELS[Math.min(...idx)]
  const hi = LEVELS[Math.max(...idx)]
  return lo === hi ? lo : `${lo} to ${hi}`
}

export interface TitleRow {
  jobFamily: string
  jobFunction: string
  jobTitle: string
  headcount: number
  levels: string
  rows: number[]
}

export function titleRows(r: StructureReport, employees: readonly Employee[]): TitleRow[] {
  return r.titles.map((t) => ({
    jobFamily: name(t.jobFamily, BLANK.jobFamily),
    jobFunction: name(t.jobFunction, BLANK.jobFunction),
    jobTitle: t.jobTitle,
    headcount: t.headcount,
    levels: levelText(t.levels),
    rows: employeesOnly(t.rows, employees),
  }))
}

export interface HeatCell {
  jobFunction: string
  level: string
  headcount: number
  rows: number[]
}

/** Job function × level headcount, functions in diagram order, levels in ladder order. */
export function functionLevelCells(
  r: StructureReport,
  employees: readonly Employee[],
): { cells: HeatCell[]; functions: string[]; levels: string[] } {
  const order = functionOrder(r)
  // A function under several families is one row: its cells add up across them.
  const byKey = new Map<string, HeatCell>()
  for (const c of r.functionLevels) {
    const fn = name(c.jobFunction, BLANK.jobFunction)
    const level = c.level ?? BLANK.level
    const key = `${fn}\u0001${level}`
    const cell = byKey.get(key) ?? { jobFunction: fn, level, headcount: 0, rows: [] }
    cell.headcount += c.headcount
    cell.rows.push(...employeesOnly(c.rows, employees))
    byKey.set(key, cell)
  }
  const cells = [...byKey.values()].filter((c) => c.headcount > 0)
  const present = new Set(cells.map((c) => c.level))
  const levels: string[] = [
    ...LEVELS.filter((l) => present.has(l)),
    ...(present.has(BLANK.level) ? [BLANK.level] : []),
  ]
  const fnSet = new Set(cells.map((c) => c.jobFunction))
  const functions = order.map((f) => name(f, BLANK.jobFunction)).filter((f) => fnSet.has(f))
  const rank = new Map(functions.map((f, i) => [f, i]))
  const lrank = new Map(levels.map((l, i) => [l, i]))
  cells.sort(
    (a, b) =>
      (rank.get(a.jobFunction) ?? 0) - (rank.get(b.jobFunction) ?? 0) ||
      (lrank.get(a.level) ?? 0) - (lrank.get(b.level) ?? 0),
  )
  return { cells, functions, levels }
}
