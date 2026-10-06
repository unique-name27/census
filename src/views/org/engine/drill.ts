/**
 * Drill-down specs for the Org chart: the records behind every number on the chart, the detail
 * panel, the flags table and the reorg sandbox. Pure (no React); the UI wraps these in thunks so
 * rows are only gathered on click. Every builder returns null when there is nothing behind the
 * number, so a 0 never opens an empty panel.
 *
 * Records are the raw roster rows (`Employee`) from the as-of tree, so the drill panel shows its
 * standard columns and every row opens the person's card. Org facts the roster does not hold
 * (direct reports, total org, layer, flags, the manager on the chart) ride along as extra columns.
 */
import type { Column } from '@/charts/types'
import type { Employee, ISODate, Requisition } from '@/data/schema'
import { groupFilter } from '@/drill/filter'
import { asOfLine, subtitleOf } from '@/drill/subtitle'
import { type DrillExtra, type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import type { OrgKeyFigures } from './figures'
import { layerIn } from './figures'
import { type Flag, type FlagKind, flagName } from './flags'
import { defaultOrgRules, monthsText, narrowSpanLabel, type OrgRules, wideSpanLabel } from './rules'
import { COMPANY_ROOT, type OrgTree } from './tree'

/** Where the numbers come from, for drill subtitles. */
export interface DrillScope {
  /** "Whole company" or "Sanjay Shetty's org". */
  label: string
  asOf: ISODate
  /** Numbers describe the reorg scenario, not the data. */
  scenario?: boolean
  /** The dimming filters are on and the numbers count only matching people. */
  filtered?: boolean
}

/**
 * A drill subtitle, worded like every other view's (`@/drill/subtitle`): "As of 30 Sep 2026 ·
 * Allison Carter's org", or "Reorg sandbox · what-if on the org as of 30 Sep 2026".
 */
export function scopeLine(s: DrillScope): string {
  const filtered = s.filtered && 'people matching the filters'
  return s.scenario
    ? subtitleOf(s.label, `what-if on the org as of ${formatDate(s.asOf)}`, filtered)
    : asOfLine(s.asOf, s.label, filtered)
}

/** "Whole company" for the top of the tree, else "{name}'s org". */
export function scopeLabel(tree: OrgTree, rootId: string): string {
  if (rootId === COMPANY_ROOT || rootId === tree.rootId) return 'Whole company'
  return `${tree.people.get(rootId)?.name ?? rootId}'s org`
}

/* ───────── people ───────── */

/** Org facts shown next to the roster columns. */
export type OrgColumn = 'directs' | 'totalOrg' | 'layer' | 'flags' | 'manager'

const ORG_COLUMNS: Record<OrgColumn, Column> = {
  directs: { key: 'orgDirects', label: 'Direct reports', format: 'int' },
  totalOrg: { key: 'orgTotal', label: 'Total org', format: 'int' },
  layer: { key: 'orgLayer', label: 'Layer', format: 'int' },
  flags: { key: 'orgFlags', label: 'Flags' },
  manager: { key: 'orgManager', label: 'Manager on the chart' },
}

export interface PeopleDrillOptions {
  title: string
  subtitle?: string
  note?: string
  /** Org facts to add as columns (in this order, after the roster columns). */
  columns?: OrgColumn[]
  /** Layers count from this root (default: the tree's root). */
  rootId?: string
  flags?: ReadonlyMap<string, readonly Flag[]>
  /** Sort the rows by this fact, largest first (default: the order given). */
  sortBy?: 'directs' | 'totalOrg' | 'layer'
  /** More columns for this drill only (e.g. before and after a reorg). */
  more?: DrillExtra<Employee>
  /** Label for the "manager on the chart" column (the sandbox says "Manager in the scenario"). */
  managerLabel?: string
}

/** People in the tree (or roster rows the caller passes) with org facts as extra columns. */
export function peopleDrill(
  tree: OrgTree,
  people: Iterable<string | Employee>,
  o: PeopleDrillOptions,
): DrillSpec<'employees'> | null {
  const rows: Employee[] = []
  for (const p of people) {
    const e = typeof p === 'string' ? tree.people.get(p) : p
    if (e) rows.push(e)
  }
  if (!rows.length) return null
  const layer = layerIn(tree, o.rootId ?? tree.rootId)
  const fact = (e: Employee, k: 'directs' | 'totalOrg' | 'layer') =>
    k === 'directs'
      ? (tree.directs.get(e.employeeId) ?? 0)
      : k === 'totalOrg'
        ? (tree.total.get(e.employeeId) ?? 0)
        : layer(e.employeeId)
  const sortBy = o.sortBy
  if (sortBy) rows.sort((a, b) => fact(b, sortBy) - fact(a, sortBy) || a.name.localeCompare(b.name))
  const cols = (o.columns ?? []).map((k) =>
    k === 'manager' && o.managerLabel ? { ...ORG_COLUMNS[k], label: o.managerLabel } : ORG_COLUMNS[k],
  )
  const wanted = new Set(o.columns ?? [])
  const managerName = (id: string) => {
    const m = tree.parent.get(id) ?? null
    return m ? (tree.people.get(m)?.name ?? m) : 'Top of the chart'
  }
  const extra: DrillExtra<Employee> | undefined =
    cols.length || o.more
      ? {
          columns: [...cols, ...(o.more?.columns ?? [])],
          values: (e) => {
            const v: Record<string, unknown> = {}
            if (wanted.has('directs')) v.orgDirects = fact(e, 'directs')
            if (wanted.has('totalOrg')) v.orgTotal = fact(e, 'totalOrg')
            if (wanted.has('layer')) v.orgLayer = fact(e, 'layer')
            if (wanted.has('flags'))
              v.orgFlags = (o.flags?.get(e.employeeId) ?? []).map((f) => f.name).join('; ') || null
            if (wanted.has('manager')) v.orgManager = managerName(e.employeeId)
            return o.more ? { ...v, ...o.more.values(e) } : v
          },
        }
      : undefined
  return drillSpec({
    kind: 'employees',
    title: o.title,
    subtitle: o.subtitle,
    note: o.note,
    rows,
    extra,
    // Everyone on the chart is active on the as-of date; leavers keep their status column.
    hide: rows.every((e) => tree.people.has(e.employeeId)) ? ['status'] : undefined,
  })
}

const nameIn = (tree: OrgTree, id: string) => tree.people.get(id)?.name ?? id
const isEmployeeRow = (e: Employee | undefined): e is Employee => !!e

const SCENARIO_MANAGER = 'Manager in the scenario'

/**
 * Org facts for a list of people. The roster's own Manager column names the data manager, so the
 * sandbox adds the manager in the scenario.
 */
const withManager = (
  scope: DrillScope,
  cols: OrgColumn[],
): Pick<PeopleDrillOptions, 'columns' | 'managerLabel'> =>
  scope.scenario ? { columns: ['manager', ...cols], managerLabel: SCENARIO_MANAGER } : { columns: cols }

/** A person's direct reports. */
export function directsDrill(tree: OrgTree, id: string, scope: DrillScope): DrillSpec<'employees'> | null {
  return peopleDrill(tree, tree.children.get(id) ?? [], {
    title: `Direct reports of ${nameIn(tree, id)}${scope.scenario ? ' in the scenario' : ''}`,
    subtitle: scopeLine(scope),
    ...withManager(scope, ['directs', 'totalOrg']),
    note: 'Active people of every worker type who report to them on the chart.',
  })
}

/**
 * A person's org as the drill's filter, so the records panel offers "Filter to {name}'s org": the
 * chart then starts at them and their card keeps its count. None for the virtual company root,
 * and none in the reorg sandbox, whose orgs are what-ifs the filters can't reproduce.
 */
export const orgFilter = (id: string, scope: DrillScope) =>
  scope.scenario || id === COMPANY_ROOT ? undefined : groupFilter('leaderId', id)

/** Everyone below a person (their whole org); the whole company for the virtual root. */
export function orgDrill(tree: OrgTree, id: string, scope: DrillScope): DrillSpec<'employees'> | null {
  const below: string[] = []
  const stack = id === COMPANY_ROOT ? [...tree.roots] : [...(tree.children.get(id) ?? [])]
  while (stack.length) {
    const cur = stack.pop()!
    below.push(cur)
    for (const c of tree.children.get(cur) ?? []) stack.push(c)
  }
  const top = id === COMPANY_ROOT
  const spec = peopleDrill(tree, below, {
    title: top
      ? 'Everyone in the company'
      : `Everyone in ${nameIn(tree, id)}'s org${scope.scenario ? ' in the scenario' : ''}`,
    subtitle: scopeLine(scope),
    ...withManager(scope, ['layer', 'directs', 'totalOrg']),
    rootId: id,
    sortBy: 'layer',
    note: top
      ? 'Everyone active on the as-of date, every worker type.'
      : `Everyone below ${nameIn(tree, id)} at every level, contractors and interns included. ${nameIn(tree, id)} is not counted. Layer 2 reports to them directly.`,
  })
  const filter = orgFilter(id, scope)
  return spec && filter ? { ...spec, filter } : spec
}

/* ───────── key figures ───────── */

export interface KeyFigureDrills {
  people: DrillSpec<'employees'> | null
  managers: DrillSpec<'employees'> | null
  medianSpan: DrillSpec<'employees'> | null
  layers: DrillSpec<'employees'> | null
  openRoles: DrillSpec<'requisitions'> | null
  flagged: DrillSpec<'employees'> | null
  /** People below the deep-chain layer (the Layers tile's note). */
  deepChain: DrillSpec<'employees'> | null
}

/** Drill specs for the key figures, one per tile. */
export function keyFigureDrills(
  tree: OrgTree,
  rootId: string,
  k: OrgKeyFigures,
  scope: DrillScope,
  flags: ReadonlyMap<string, readonly Flag[]>,
  reqRecords: ReadonlyMap<string, Requisition>,
  rules: OrgRules = defaultOrgRules(),
): KeyFigureDrills {
  const sub = scopeLine(scope)
  const where = scope.label === 'Whole company' ? 'the company' : scope.label
  const reqs = k.openReqIds.map((id) => reqRecords.get(id)).filter((r): r is Requisition => !!r)
  return {
    people: peopleDrill(tree, k.people, {
      title: scope.filtered ? `People matching the filters in ${where}` : `Everyone in ${where}`,
      subtitle: sub,
      columns: ['layer', 'directs', 'totalOrg'],
      rootId,
      note: scope.filtered
        ? 'Every worker type. Only people matching the filters are counted; the chart dims everyone else.'
        : 'Every worker type, including the leader at the top of the org.',
    }),
    managers: peopleDrill(tree, k.managers, {
      title: `People managers in ${where}`,
      subtitle: sub,
      columns: ['directs', 'totalOrg', 'layer'],
      rootId,
      sortBy: 'totalOrg',
      note: 'Anyone with at least one active direct report of any worker type.',
    }),
    medianSpan: peopleDrill(tree, k.managers, {
      title: `Spans of control in ${where}`,
      subtitle: sub,
      columns: ['directs', 'totalOrg'],
      sortBy: 'directs',
      note:
        k.medianSpan == null
          ? undefined
          : `Median span = ${fmt(k.medianSpan, 'num1')} direct reports across ${plural(k.managers.length, 'manager')}. Direct reports is the measured value.`,
    }),
    layers: peopleDrill(tree, k.people, {
      title: `People by layer in ${where}`,
      subtitle: sub,
      columns: ['layer', 'directs'],
      rootId,
      sortBy: 'layer',
      note: `${plural(k.layers, 'layer')}: the deepest people sit at layer ${fmt(k.layers, 'int')}, counting the top of this org as 1. Deepest first.`,
    }),
    openRoles: reqs.length
      ? drillSpec({
          kind: 'requisitions',
          title: `Open requisitions in ${where}`,
          subtitle: sub,
          rows: reqs,
          hide: ['filledDate'],
          note: 'Open on the as-of date, with a hiring manager in this org.',
        })
      : null,
    flagged: peopleDrill(tree, k.flagged, {
      title: `People with a structure flag in ${where}`,
      subtitle: sub,
      columns: ['flags', 'directs', 'totalOrg'],
      flags,
      sortBy: 'directs',
      note: `${wideSpanLabel(rules)}, ${narrowSpanLabel(rules).toLowerCase()}, single-report chain, or a new manager (under ${monthsText(rules.newManagerMonths)}) with ${rules.largeTeam} or more direct reports.`,
    }),
    deepChain: peopleDrill(tree, k.deep, {
      title: `People below layer ${fmt(k.deepLayer, 'int')} in ${where}`,
      subtitle: sub,
      columns: ['layer', 'directs'],
      rootId,
      sortBy: 'layer',
      note: `Layer 1 is the top of this org. A chain deeper than ${plural(k.deepLayer, 'layer')} is a deep chain. Deepest first.`,
    }),
  }
}

/** People in an org with one flag kind (the flags table's Flag column). */
export function flagKindDrill(
  tree: OrgTree,
  ids: Iterable<string>,
  kind: FlagKind,
  flags: ReadonlyMap<string, readonly Flag[]>,
  scope: DrillScope,
): DrillSpec<'employees'> | null {
  const hit = [...ids].filter((id) => flags.get(id)?.some((f) => f.kind === kind))
  const where = scope.label === 'Whole company' ? 'the company' : scope.label
  // The flags carry their name with the settings they were computed with.
  const name = hit.length ? flags.get(hit[0])!.find((f) => f.kind === kind)!.name : flagName(kind)
  return peopleDrill(tree, hit, {
    title: `${name} in ${where}`,
    subtitle: scopeLine(scope),
    columns: ['directs', 'totalOrg', 'flags'],
    flags,
    sortBy: 'directs',
  })
}

/* ───────── open roles ───────── */

/**
 * The requisition behind one open-role placeholder card (the chart's "Open roles" switch), with
 * the hiring manager named in the note. Null when the req is not on the chart.
 */
export function openRoleDrill(
  tree: OrgTree,
  reqRecords: ReadonlyMap<string, Requisition>,
  reqId: string,
  scope: DrillScope,
): DrillSpec<'requisitions'> | null {
  const r = reqRecords.get(reqId)
  if (!r) return null
  const manager = r.hiringManagerId ? tree.people.get(r.hiringManagerId)?.name : undefined
  return drillSpec({
    kind: 'requisitions',
    title: `Open role: ${r.jobTitle}`,
    subtitle: scopeLine(scope),
    rows: [r],
    hide: ['filledDate'],
    note: manager ? `Open on the as-of date, with ${manager} as hiring manager.` : 'Open on the as-of date.',
  })
}

/* ───────── leavers ───────── */

/** Leavers who reported to a person (raw roster rows, so the exit columns show). */
export function leaversDrill(
  managerName: string,
  rows: readonly Employee[],
  regrettedOnly: boolean,
  scope: DrillScope,
  months: number = defaultOrgRules().exitMonths,
): DrillSpec<'employees'> | null {
  if (!rows.length) return null
  return drillSpec({
    kind: 'employees',
    title: `${regrettedOnly ? 'Regretted leavers' : 'Leavers'} who reported to ${managerName}, last ${monthsText(months)}`,
    subtitle: scopeLine(scope),
    rows: [...rows].sort((a, b) => (b.terminationDate ?? '').localeCompare(a.terminationDate ?? '')),
    hide: ['status'],
    note: regrettedOnly
      ? 'Voluntary exits marked regrettable, with this person as their manager in the data.'
      : `Every exit in the ${monthsText(months)} to the as-of date, with this person as their manager in the data.`,
  })
}

/* ───────── sandbox ───────── */

/** People who change manager in the scenario, with both managers. */
export function reportingChangesDrill(
  after: OrgTree,
  changes: readonly { id: string; from: string; to: string }[],
  scope: DrillScope,
  title = 'People changing manager',
): DrillSpec<'employees'> | null {
  const byId = new Map(changes.map((c) => [c.id, c]))
  return peopleDrill(
    after,
    changes.map((c) => c.id),
    {
      title,
      subtitle: scopeLine(scope),
      more: {
        columns: [
          { key: 'fromManager', label: 'Manager today' },
          { key: 'toManager', label: SCENARIO_MANAGER },
        ],
        values: (e) => ({ fromManager: byId.get(e.employeeId)?.from, toManager: byId.get(e.employeeId)?.to }),
      },
    },
  )
}

/** People who leave in the scenario (exits), as they are in the data today. */
export function removedDrill(
  before: OrgTree,
  removed: readonly { id: string }[],
  scope: DrillScope,
): DrillSpec<'employees'> | null {
  return peopleDrill(
    before,
    removed.map((r) => r.id),
    {
      title: 'People who leave in the scenario',
      subtitle: scopeLine(scope),
      columns: ['manager', 'directs', 'totalOrg'],
      note: 'Their direct reports roll up to their manager. Direct reports and Total org are today.',
    },
  )
}

/** Managers whose span changes, with the before and after counts. */
export function spanChangesDrill(
  before: OrgTree,
  after: OrgTree,
  spans: readonly { id: string; before: number; after: number; change: string }[],
  scope: DrillScope,
): DrillSpec<'employees'> | null {
  const byId = new Map(spans.map((s) => [s.id, s]))
  return peopleDrill(
    after,
    spans.map((s) => after.people.get(s.id) ?? before.people.get(s.id)).filter(isEmployeeRow),
    {
      title: 'Managers whose span changes',
      subtitle: scopeLine(scope),
      more: {
        columns: [
          { key: 'spanBefore', label: 'Direct reports today', format: 'int' },
          { key: 'spanAfter', label: 'In the scenario', format: 'int' },
          { key: 'spanDelta', label: 'Change', format: 'text' },
        ],
        values: (e) => {
          const s = byId.get(e.employeeId)
          return { spanBefore: s?.before, spanAfter: s?.after, spanDelta: s?.change }
        },
      },
    },
  )
}

/** Who joins and leaves one manager's team between today and the scenario. */
export function teamChangeDrill(
  before: OrgTree,
  after: OrgTree,
  managerId: string,
  scope: DrillScope,
): DrillSpec<'employees'> | null {
  const was = new Set(before.children.get(managerId) ?? [])
  const now = new Set(after.people.has(managerId) ? (after.children.get(managerId) ?? []) : [])
  const joined = [...now].filter((id) => !was.has(id))
  const left = [...was].filter((id) => !now.has(id))
  const change = new Map<string, string>([
    ...joined.map((id) => [id, 'Joins the team'] as const),
    ...left.map((id) => [id, after.people.has(id) ? 'Leaves the team' : 'Leaves the company'] as const),
  ])
  const rows = [...joined, ...left]
    .map((id) => after.people.get(id) ?? before.people.get(id))
    .filter(isEmployeeRow)
  return peopleDrill(after, rows, {
    title: `Changes to ${nameIn(before, managerId)}'s team`,
    subtitle: scopeLine(scope),
    columns: ['manager'],
    managerLabel: SCENARIO_MANAGER,
    more: {
      columns: [{ key: 'teamChange', label: 'Change' }],
      values: (e) => ({ teamChange: change.get(e.employeeId) ?? null }),
    },
  })
}

/** A manager's direct reports in one tree (today or the scenario), with the moved ones marked. */
export function teamDrill(
  tree: OrgTree,
  managerId: string,
  title: string,
  scope: DrillScope,
): DrillSpec<'employees'> | null {
  return peopleDrill(tree, tree.children.get(managerId) ?? [], {
    title,
    subtitle: scopeLine(scope),
    ...withManager(scope, ['directs', 'totalOrg']),
  })
}

/** People at one layer, today or in the scenario. */
export function layerDrill(
  tree: OrgTree,
  ids: readonly string[],
  layer: number,
  scope: DrillScope,
): DrillSpec<'employees'> | null {
  return peopleDrill(tree, ids, {
    title: `People in layer ${layer}${scope.scenario ? ', in the scenario' : ', today'}`,
    subtitle: scopeLine(scope),
    ...withManager(scope, ['directs']),
    note: 'Layer 1 is the top of the chart.',
  })
}
