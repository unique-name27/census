/**
 * Rows behind the org chart exports: the people currently shown, the flags table, and the reorg
 * scenario workbook (moves plus the resulting roster).
 */
import type { Column } from '@/charts/types'
import type { Employee } from '@/data/schema'
import { FLAG_KINDS, type Flag, type FlagKind } from './flags'
import { describeAction, type ScenarioAction } from './scenario'
import { COMPANY_ROOT, type OrgTree } from './tree'

export interface PersonRow {
  employeeId: string
  name: string
  jobTitle: string
  manager: string
  managerId: string
  level: string
  businessUnit: string
  jobFunction: string
  department: string
  location: string
  workerType: string
  hireDate: string
  directs: number
  totalOrg: number
  flags: string
}

export const PERSON_COLUMNS: Column<PersonRow>[] = [
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'name', label: 'Name' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'manager', label: 'Manager' },
  { key: 'managerId', label: 'Manager ID' },
  { key: 'level', label: 'Level' },
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'jobFunction', label: 'Job function' },
  { key: 'department', label: 'Department' },
  { key: 'location', label: 'Location' },
  { key: 'workerType', label: 'Worker type' },
  { key: 'hireDate', label: 'Hire date', format: 'date' },
  { key: 'directs', label: 'Direct reports', format: 'int' },
  { key: 'totalOrg', label: 'Total org', format: 'int' },
  { key: 'flags', label: 'Flags' },
]

export function personRow(tree: OrgTree, e: Employee, flags?: readonly Flag[]): PersonRow {
  const m = tree.parent.get(e.employeeId) ?? null
  return {
    employeeId: e.employeeId,
    name: e.name,
    jobTitle: e.jobTitle,
    manager: m ? (tree.people.get(m)?.name ?? m) : '',
    managerId: m ?? '',
    level: e.level ?? '',
    businessUnit: e.businessUnit,
    jobFunction: e.jobFunction ?? '',
    department: e.department,
    location: e.location,
    workerType: e.employmentType ?? '',
    hireDate: e.hireDate,
    directs: tree.directs.get(e.employeeId) ?? 0,
    totalOrg: tree.total.get(e.employeeId) ?? 0,
    flags: (flags ?? []).map((f) => f.name).join('; '),
  }
}

/** One row per person card in `ids` (requisition and company cards are skipped). */
export function shownRows(
  tree: OrgTree,
  ids: readonly string[],
  flags: ReadonlyMap<string, readonly Flag[]>,
): PersonRow[] {
  const out: PersonRow[] = []
  for (const id of ids) {
    if (id === COMPANY_ROOT) continue
    const e = tree.people.get(id)
    if (e) out.push(personRow(tree, e, flags.get(id)))
  }
  return out
}

export interface FlagRow {
  /** Flag kind (not exported; the Flag column carries the label). */
  kind: FlagKind
  employeeId: string
  name: string
  jobTitle: string
  department: string
  location: string
  flag: string
  detail: string
  directs: number
  totalOrg: number
}

export const FLAG_COLUMNS: Column<FlagRow>[] = [
  { key: 'flag', label: 'Flag' },
  { key: 'name', label: 'Name' },
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'department', label: 'Department' },
  { key: 'location', label: 'Location' },
  { key: 'directs', label: 'Direct reports', format: 'int' },
  { key: 'totalOrg', label: 'Total org', format: 'int' },
  { key: 'detail', label: 'Detail' },
]

/** One row per (person, flag) among `ids`, for the kinds asked for. */
export function flagRows(
  tree: OrgTree,
  ids: Iterable<string>,
  flags: ReadonlyMap<string, readonly Flag[]>,
  kinds: ReadonlySet<string>,
): FlagRow[] {
  const out: { rank: number; row: FlagRow }[] = []
  for (const id of ids) {
    const e = tree.people.get(id)
    if (!e) continue
    for (const f of flags.get(id) ?? []) {
      if (!kinds.has(f.kind)) continue
      out.push({
        rank: FLAG_KINDS.indexOf(f.kind),
        row: {
          kind: f.kind,
          employeeId: id,
          name: e.name,
          jobTitle: e.jobTitle,
          department: e.department,
          location: e.location,
          flag: f.name,
          detail: f.detail,
          directs: tree.directs.get(id) ?? 0,
          totalOrg: tree.total.get(id) ?? 0,
        },
      })
    }
  }
  return out
    .sort((a, b) => a.rank - b.rank || b.row.directs - a.row.directs || a.row.name.localeCompare(b.row.name))
    .map((x) => x.row)
}

/* ───────── scenario workbook ───────── */

export interface MoveRow {
  step: number
  change: string
  type: string
  employeeId: string
  name: string
  fromManager: string
  toManager: string
  peopleMoving: number
}

export const MOVE_COLUMNS: Column<MoveRow>[] = [
  { key: 'step', label: 'Step', format: 'int' },
  { key: 'change', label: 'Change' },
  { key: 'type', label: 'Type' },
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'name', label: 'Name' },
  { key: 'fromManager', label: 'From manager' },
  { key: 'toManager', label: 'To manager' },
  { key: 'peopleMoving', label: 'People moving', format: 'int' },
]

const ACTION_TYPE = { person: 'Move person', team: 'Move with org', exit: 'Exit' } as const

/**
 * Rows for the list of moves. `trees[i]` is the scenario tree before action i (trees.length ===
 * actions.length + 1 is not required; only the before-state of each action is read).
 */
export function moveRows(trees: readonly OrgTree[], actions: readonly ScenarioAction[]): MoveRow[] {
  return actions.map((a, i) => {
    const t = trees[i]
    const e = t.people.get(a.personId)
    const from = t.parent.get(a.personId) ?? null
    const name = (id: string | null) => (id ? (t.people.get(id)?.name ?? id) : 'Top level')
    return {
      step: i + 1,
      change: describeAction(t, a),
      type: a.kind === 'exit' ? ACTION_TYPE.exit : ACTION_TYPE[a.mode],
      employeeId: a.personId,
      name: e?.name ?? a.personId,
      fromManager: name(from),
      toManager: a.kind === 'exit' ? '' : name(a.toManagerId),
      peopleMoving: a.kind === 'move' && a.mode === 'team' ? 1 + (t.total.get(a.personId) ?? 0) : 1,
    }
  })
}

export interface RosterRow {
  employeeId: string
  name: string
  jobTitle: string
  level: string
  department: string
  location: string
  currentManager: string
  scenarioManager: string
  scenarioManagerId: string
  changed: string
  directsBefore: number
  directsAfter: number
}

export const ROSTER_COLUMNS: Column<RosterRow>[] = [
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'name', label: 'Name' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'level', label: 'Level' },
  { key: 'department', label: 'Department' },
  { key: 'location', label: 'Location' },
  { key: 'currentManager', label: 'Current manager' },
  { key: 'scenarioManager', label: 'Scenario manager' },
  { key: 'scenarioManagerId', label: 'Scenario manager ID' },
  { key: 'changed', label: 'Change' },
  { key: 'directsBefore', label: 'Direct reports now', format: 'int' },
  { key: 'directsAfter', label: 'Direct reports in scenario', format: 'int' },
]

/** The roster under the scenario: everyone in the as-of tree, with their current and scenario manager. */
export function rosterRows(before: OrgTree, after: OrgTree, ids?: Iterable<string>): RosterRow[] {
  const out: RosterRow[] = []
  const name = (t: OrgTree, id: string | null) => (id ? (t.people.get(id)?.name ?? id) : '')
  for (const id of ids ?? before.people.keys()) {
    const e = before.people.get(id)
    if (!e) continue
    const gone = !after.people.has(id)
    const from = before.parent.get(id) ?? null
    const to = gone ? null : (after.parent.get(id) ?? null)
    out.push({
      employeeId: id,
      name: e.name,
      jobTitle: e.jobTitle,
      level: e.level ?? '',
      department: e.department,
      location: e.location,
      currentManager: name(before, from),
      scenarioManager: gone ? '' : name(after, to) || name(before, to),
      scenarioManagerId: to ?? '',
      changed: gone ? 'Leaves' : from !== to ? 'New manager' : '',
      directsBefore: before.directs.get(id) ?? 0,
      directsAfter: gone ? 0 : (after.directs.get(id) ?? 0),
    })
  }
  return out
}
