/**
 * Team shape: four charts under the org chart that follow its root (the focused person, the
 * leader filter, or the manager in Manager mode) and read the same as-of tree (docs/CHARTS.md,
 * Org chart):
 *
 *  - people at each layer, as people managers, individual contributors, and contractors and interns;
 *  - each people manager's span, by layer, with wide and narrow spans called out;
 *  - the size of the org under each direct report of the root, with open roles;
 *  - the tenure mix of each of those orgs.
 *
 * With the business unit, department, location or level filters on, only matching people count
 * (the key figures' rule). Every row keeps the ids (or req IDs) behind its number, so a mark opens
 * exactly what it counts. Pure: no React, no DOM.
 */
import type { FieldRef } from '@/data/quality'
import type { Employee, ISODate, Requisition } from '@/data/schema'
import { groupFilter } from '@/drill/filter'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { fmt, plural } from '@/lib/format'
import { TENURE_BANDS, tenureBand, tenureYears } from '@/lib/people'
import { median } from '@/lib/stats'
import { type DrillScope, peopleDrill, scopeLine } from './drill'
import { layerIn } from './figures'
import type { ReqStub } from './layout'
import { keyFigureUses, type OrgLineage, refs } from './lineage'
import { defaultOrgRules, narrowSpanLabel, type OrgRules, wideSpanLabel } from './rules'
import { type OrgTree, subtreeOf } from './tree'

export const LAYER_ROLES = ['People managers', 'Individual contributors', 'Contractors and interns'] as const
export type LayerRole = (typeof LAYER_ROLES)[number]

export const layerName = (n: number): string => `Layer ${n}`

const isContingent = (e: Employee | undefined) => !!e && e.employmentType !== 'Employee'

/* ───────── people at each layer ───────── */

export interface LayerRow {
  layer: string
  layerNo: number
  role: LayerRole
  people: number
  ids: string[]
}

export interface Layers {
  rows: LayerRow[]
  /** Layer names, top first. */
  layers: string[]
  total: number
}

export function peopleByLayer(
  tree: OrgTree,
  rootId: string,
  matches: ((id: string) => boolean) | null,
): Layers {
  const at = layerIn(tree, rootId)
  const cells = new Map<string, string[]>()
  let deepest = 0
  let total = 0
  for (const id of subtreeOf(tree, rootId)) {
    const e = tree.people.get(id)
    if (!e || (matches && !matches(id))) continue
    const n = at(id)
    deepest = Math.max(deepest, n)
    total++
    const role: LayerRole = isContingent(e)
      ? 'Contractors and interns'
      : (tree.directs.get(id) ?? 0) > 0
        ? 'People managers'
        : 'Individual contributors'
    const k = `${n}|${role}`
    const arr = cells.get(k)
    if (arr) arr.push(id)
    else cells.set(k, [id])
  }
  const rows: LayerRow[] = []
  const layers: string[] = []
  for (let n = 1; n <= deepest; n++) {
    const here = LAYER_ROLES.map((role) => cells.get(`${n}|${role}`) ?? [])
    if (!here.some((ids) => ids.length)) continue
    layers.push(layerName(n))
    LAYER_ROLES.forEach((role, i) => {
      rows.push({ layer: layerName(n), layerNo: n, role, people: here[i].length, ids: here[i] })
    })
  }
  return { rows, layers, total }
}

/* ───────── span of each manager ───────── */

export interface SpanDot {
  id: string
  name: string
  layer: string
  layerNo: number
  directs: number
  /** "Wide span (12+)", "Span of 1", or "" for a span inside both thresholds. */
  flag: string
}

export interface Spans {
  dots: SpanDot[]
  layers: string[]
  median: number | null
  wide: number
  narrow: number
}

export function spansByLayer(
  tree: OrgTree,
  rootId: string,
  matches: ((id: string) => boolean) | null,
  rules: OrgRules = defaultOrgRules(),
): Spans {
  const at = layerIn(tree, rootId)
  const dots: SpanDot[] = []
  for (const id of subtreeOf(tree, rootId)) {
    const e = tree.people.get(id)
    const n = tree.directs.get(id) ?? 0
    if (!e || n === 0 || (matches && !matches(id))) continue
    const layerNo = at(id)
    dots.push({
      id,
      name: e.name,
      layer: layerName(layerNo),
      layerNo,
      directs: n,
      flag: n >= rules.wideSpan ? wideSpanLabel(rules) : n <= rules.narrowSpan ? narrowSpanLabel(rules) : '',
    })
  }
  dots.sort((a, b) => a.layerNo - b.layerNo || b.directs - a.directs || a.name.localeCompare(b.name))
  const layers = [...new Set(dots.map((d) => d.layer))]
  return {
    dots,
    layers,
    median: median(dots.map((d) => d.directs)),
    wide: dots.filter((d) => d.directs >= rules.wideSpan).length,
    narrow: dots.filter((d) => d.directs <= rules.narrowSpan).length,
  }
}

/* ───────── the org under each direct report ───────── */

export const TEAM_PARTS = ['Employees', 'Contractors and interns', 'Open roles'] as const
export type TeamPart = (typeof TEAM_PARTS)[number]

export interface TeamRow {
  /** The direct report's name (the row label). */
  team: string
  leaderId: string
  part: TeamPart
  value: number
  /** People ids, or requisition IDs for open roles. */
  ids: string[]
}

export interface Teams {
  rows: TeamRow[]
  /** Leaders in row order: largest org first. */
  leaders: { id: string; name: string; total: number }[]
  /** Direct reports of the root who lead nobody (not drawn). */
  individuals: number
  openRoles: boolean
}

/**
 * Everyone below each direct report of the root (not counting the direct report, as a card's
 * "41 org" does), split by worker type, and the open requisitions whose hiring manager is in that
 * org. Direct reports who lead nobody are counted in the note, not drawn.
 */
export function teamsUnder(
  tree: OrgTree,
  rootId: string,
  matches: ((id: string) => boolean) | null,
  reqs?: ReadonlyMap<string, readonly ReqStub[]>,
): Teams {
  const directs = tree.children.get(rootId) ?? []
  const leaders: Teams['leaders'] = []
  const rows: TeamRow[] = []
  let individuals = 0
  for (const d of directs) {
    const below = subtreeOf(tree, d).filter((id) => id !== d)
    if (!below.length) {
      individuals++
      continue
    }
    const counted = below.filter((id) => !matches || matches(id))
    const emps = counted.filter((id) => !isContingent(tree.people.get(id)))
    const contingent = counted.filter((id) => isContingent(tree.people.get(id)))
    const open = reqs
      ? subtreeOf(tree, d)
          .filter((id) => !matches || matches(id))
          .flatMap((id) => (reqs.get(id) ?? []).map((r) => r.reqId))
      : []
    if (!counted.length && !open.length) continue
    const name = tree.people.get(d)?.name ?? d
    leaders.push({ id: d, name, total: counted.length + open.length })
    rows.push(
      { team: name, leaderId: d, part: 'Employees', value: emps.length, ids: emps },
      { team: name, leaderId: d, part: 'Contractors and interns', value: contingent.length, ids: contingent },
    )
    if (reqs) rows.push({ team: name, leaderId: d, part: 'Open roles', value: open.length, ids: open })
  }
  leaders.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const order = new Map(leaders.map((l, i) => [l.id, i]))
  rows.sort((a, b) => (order.get(a.leaderId) ?? 0) - (order.get(b.leaderId) ?? 0))
  return { rows, leaders, individuals, openRoles: !!reqs }
}

/* ───────── tenure mix of each org under the root ───────── */

export interface TenureMixRow {
  team: string
  /** The direct report whose org the row is; null for the folded "Other (k)" row. */
  leaderId: string | null
  band: string
  people: number
  /** Share of the team; the chart draws the counts as 100% bars. */
  share: number
  ids: string[]
}

export interface TenureMix {
  rows: TenureMixRow[]
  teams: string[]
  /** Orgs under the anonymity minimum folded into "Other (k)". */
  folded: number
  /** People in folded orgs that, together, are still under the minimum (not drawn). */
  hiddenPeople: number
}

export function tenureMixUnder(
  tree: OrgTree,
  rootId: string,
  matches: ((id: string) => boolean) | null,
  asOf: ISODate,
  minGroup: number,
): TenureMix {
  const directs = tree.children.get(rootId) ?? []
  const teams: { name: string; leaderId: string | null; ids: string[] }[] = []
  const small: string[][] = []
  for (const d of directs) {
    const ids = subtreeOf(tree, d).filter((id) => id !== d && (!matches || matches(id)))
    if (!ids.length) continue
    if (ids.length < minGroup) small.push(ids)
    else teams.push({ name: tree.people.get(d)?.name ?? d, leaderId: d, ids })
  }
  teams.sort((a, b) => b.ids.length - a.ids.length || a.name.localeCompare(b.name))
  const smallIds = small.flat()
  let folded = 0
  let hiddenPeople = 0
  if (small.length && smallIds.length >= minGroup) {
    teams.push({ name: `Other (${small.length})`, leaderId: null, ids: smallIds })
    folded = small.length
  } else hiddenPeople = smallIds.length
  const rows: TenureMixRow[] = []
  for (const t of teams) {
    const bands = new Map<string, string[]>()
    for (const id of t.ids) {
      const e = tree.people.get(id)
      if (!e) continue
      const b = tenureBand(tenureYears(e, asOf))
      const arr = bands.get(b)
      if (arr) arr.push(id)
      else bands.set(b, [id])
    }
    for (const band of TENURE_BANDS) {
      const ids = bands.get(band) ?? []
      rows.push({
        team: t.name,
        leaderId: t.leaderId,
        band,
        people: ids.length,
        share: ids.length / t.ids.length,
        ids,
      })
    }
  }
  return { rows, teams: teams.map((t) => t.name), folded, hiddenPeople }
}

/* ───────── drills ───────── */

const where = (scope: DrillScope) => (scope.label === 'Whole company' ? 'the company' : scope.label)

/** People at one layer: one role, or everyone there (`role` null). */
export function layerPeopleDrill(
  tree: OrgTree,
  rootId: string,
  l: Layers,
  layer: string,
  role: LayerRole | null,
  scope: DrillScope,
): DrillSpec<'employees'> | null {
  const ids = l.rows.filter((r) => r.layer === layer && (!role || r.role === role)).flatMap((r) => r.ids)
  return peopleDrill(tree, ids, {
    title: `${role ?? 'Everyone'} at ${layer.toLowerCase()} of ${where(scope)}`,
    subtitle: scopeLine(scope),
    columns: ['layer', 'directs', 'totalOrg'],
    rootId,
    sortBy: 'totalOrg',
    note: `Layer 1 is the top of this org. ${plural(ids.length, 'person', 'people')} active on the as-of date.`,
  })
}

/** A people manager's direct reports, with their span in the note. */
export function spanDrill(tree: OrgTree, dot: SpanDot, scope: DrillScope): DrillSpec<'employees'> | null {
  return peopleDrill(tree, tree.children.get(dot.id) ?? [], {
    title: `Direct reports of ${dot.name}`,
    subtitle: scopeLine(scope),
    columns: ['directs', 'totalOrg'],
    sortBy: 'totalOrg',
    note: `A span of ${fmt(dot.directs, 'int')} at ${dot.layer.toLowerCase()}${dot.flag ? `: ${dot.flag.toLowerCase()}` : ''}. Every worker type counts.`,
  })
}

/** The leader's org as the filter, so "Filter to" starts the chart at them. */
const leaderFilter = (leaderId: string | null, scope: DrillScope) =>
  !leaderId || scope.scenario ? undefined : groupFilter('leaderId', leaderId)

/** One part of the org under a direct report: its employees, its contractors and interns, or its open roles. */
export function teamPartDrill(
  tree: OrgTree,
  t: Teams,
  row: Pick<TeamRow, 'leaderId' | 'part'> | { leaderId: string; part: null },
  reqRecords: ReadonlyMap<string, Requisition>,
  scope: DrillScope,
): DrillSpec | null {
  const name = tree.people.get(row.leaderId)?.name ?? row.leaderId
  const mine = t.rows.filter((r) => r.leaderId === row.leaderId)
  const filter = leaderFilter(row.leaderId, scope)
  if (row.part === 'Open roles') {
    const reqs = (mine.find((r) => r.part === 'Open roles')?.ids ?? [])
      .map((id) => reqRecords.get(id))
      .filter((r): r is Requisition => !!r)
    if (!reqs.length) return null
    return drillSpec({
      kind: 'requisitions',
      title: `Open requisitions in ${name}'s org`,
      subtitle: scopeLine(scope),
      rows: reqs,
      hide: ['filledDate'],
      note: `Open on the as-of date, with a hiring manager in ${name}'s org.`,
      ...(filter ? { filter } : {}),
    })
  }
  const ids = mine
    .filter((r) => r.part !== 'Open roles' && (!row.part || r.part === row.part))
    .flatMap((r) => r.ids)
  const spec = peopleDrill(tree, ids, {
    title: `${row.part ?? 'Everyone'} in ${name}'s org`,
    subtitle: scopeLine(scope),
    columns: ['layer', 'directs', 'totalOrg'],
    rootId: row.leaderId,
    sortBy: 'layer',
    note: `Everyone below ${name}, at every level. ${name} is not counted.`,
  })
  return spec && filter ? { ...spec, filter } : spec
}

/** One tenure band in a team (or the whole team, `band` null). */
export function tenureMixDrill(
  tree: OrgTree,
  mix: TenureMix,
  team: string,
  band: string | null,
  scope: DrillScope,
): DrillSpec<'employees'> | null {
  const rows = mix.rows.filter((r) => r.team === team && (!band || r.band === band))
  const ids = rows.flatMap((r) => r.ids)
  const leaderId = rows[0]?.leaderId ?? null
  const spec = peopleDrill(tree, ids, {
    title: `${band ? `${band} of tenure` : 'Everyone'} in ${leaderId ? `${team}'s org` : team}`,
    subtitle: scopeLine(scope),
    columns: ['layer', 'directs'],
    sortBy: 'layer',
    note: band
      ? `${plural(ids.length, 'person', 'people')} with ${band.toLowerCase()} since their hire date.`
      : 'Everyone below the leader, at every level.',
  })
  const filter = leaderFilter(leaderId, scope)
  return spec && filter ? { ...spec, filter } : spec
}

/* ───────── together ───────── */

export interface TeamShape {
  layers: Layers
  spans: Spans
  teams: Teams
  tenure: TenureMix
}

export function teamShape(
  m: {
    tree: OrgTree
    rules?: OrgRules
  },
  rootId: string,
  matches: ((id: string) => boolean) | null,
  reqs?: ReadonlyMap<string, readonly ReqStub[]>,
): TeamShape {
  const rules = m.rules ?? defaultOrgRules()
  return {
    layers: peopleByLayer(m.tree, rootId, matches),
    spans: spansByLayer(m.tree, rootId, matches, rules),
    teams: teamsUnder(m.tree, rootId, matches, reqs),
    tenure: tenureMixUnder(m.tree, rootId, matches, m.tree.asOf, rules.minGroup),
  }
}

/* ───────── lineage ───────── */

/** The fields each Team shape figure reads: the key figures' population, plus what it splits by. */
export function teamShapeUses(
  l: OrgLineage,
  openRoles: boolean,
): Record<'layers' | 'spans' | 'teams' | 'tenure', FieldRef[]> {
  const k = keyFigureUses(l)
  const type: FieldRef[] = ['employees.employmentType']
  return {
    layers: refs(k.layers, type),
    spans: refs(k.medianSpan),
    teams: refs(k.layers, type, openRoles ? k.openRoles : []),
    tenure: refs(k.layers, ['employees.hireDate']),
  }
}
