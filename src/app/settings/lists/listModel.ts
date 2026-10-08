/**
 * What Settings > Official lists shows, worked out without React: the picker's entries, the rows
 * of a list's table, the values in the data that are not on it (with the value each most likely
 * means), the additions the data proposes, and the sentences around them.
 */
import { type ListAnalysis, listFromData, listKey, type ValueUse } from '@/data/lists'
import type {
  EffectiveList,
  EffectiveLists,
  ListDef,
  ListId,
  ListPause,
  ListsState,
  ListValue,
} from '@/data/lists/types'
import { type FieldRef, parseFieldRef } from '@/data/quality/fieldRef'
import { categoryOf } from '@/data/reference'
import { CHIP_STAGES, type ChipStageKey, type Datasets, datasetDef } from '@/data/schema'
import { closestValue } from '@/views/data/mapping/engine/conflicts'
import { whenText } from '@/views/data/mapping/engine/edit'
import { fieldLabel } from '@/views/data/mapping/engine/lists'

export const intText = (n: number): string => n.toLocaleString('en-US')
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${intText(n)} ${n === 1 ? one : many}`
export const rowsText = (n: number): string => plural(n, 'row')

/** "A, B and C" */
export const listText = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/* ───────────── the picker ───────────── */

export interface PickerItem {
  id: ListId
  label: string
  official: boolean
  /** Values on the list, retired ones included. */
  values: number
  retired: number
  /** Distinct values in the data that are not on the list. */
  notOnList: number
  notOnListRows: number
}

export function pickerItems(lists: EffectiveLists, analysis: Record<ListId, ListAnalysis>): PickerItem[] {
  return Object.values(lists).map((l) => {
    const a = analysis[l.def.id]
    return {
      id: l.def.id,
      label: l.def.label,
      official: l.status === 'official',
      values: l.values.length,
      retired: l.values.filter((v) => v.retired).length,
      notOnList: new Set(a.notOnList.map((n) => n.value)).size,
      notOnListRows: a.notOnListRows,
    }
  })
}

/** "22 values, 2 retired" */
export const valuesText = (p: Pick<PickerItem, 'values' | 'retired'>): string =>
  `${plural(p.values, 'value')}${p.retired ? `, ${intText(p.retired)} retired` : ''}`

/* ───────────── a list's table ───────────── */

export interface ValueRow {
  value: string
  parent: string | null
  /** Rows across the list's fields. */
  rows: number
  status: string
  /** Departments: the cost centers that name it as their department. */
  costCenters?: string
  /** Attribute columns, keyed `attr:<key>`. */
  [attr: `attr:${string}`]: string | number | null
  /** The value itself, for the editor. */
  item: ListValue
}

export function statusText(v: ListValue): string {
  if (v.retired) return v.replacedBy ? `Retired, now ${v.replacedBy}` : 'Retired'
  return v.added ? 'Active, added by you' : 'Active'
}

const shortList = (xs: readonly string[], max = 3) =>
  xs.length <= max ? xs.join(', ') : `${xs.slice(0, max).join(', ')} +${intText(xs.length - max)}`

/**
 * The one field that holds every row using a value, with those rows, so the Rows count opens
 * exactly the records it counts. Null when the value is used in more than one field (its editor
 * opens each field's rows) or in none.
 */
export function soleField(use: ValueUse | undefined): { ref: FieldRef; rows: readonly number[] } | null {
  if (use?.byRef.size !== 1) return null
  const [[ref, rows]] = [...use.byRef]
  return rows.length === use.total ? { ref, rows } : null
}

export function valueRows(list: EffectiveList, analysis: ListAnalysis, lists: EffectiveLists): ValueRow[] {
  const ccByDept = new Map<string, string[]>()
  if (list.def.id === 'department')
    for (const c of lists.costCenter.values)
      if (c.parent) ccByDept.set(c.parent, [...(ccByDept.get(c.parent) ?? []), c.value])
  return list.values.map((v) => {
    const row: ValueRow = {
      value: v.value,
      parent: v.parent ?? null,
      rows: analysis.uses.get(v.value)?.total ?? 0,
      status: statusText(v),
      item: v,
    }
    for (const a of list.def.attrs) row[`attr:${a.key}`] = v.attrs?.[a.key] ?? null
    if (list.def.id === 'department') row.costCenters = shortList(ccByDept.get(v.value) ?? [])
    return row
  })
}

/** "Proposed: Signoff and tape-out", the Job functions table's stage cell before anyone saves one. */
export const proposedStageText = (stage: ChipStageKey): string =>
  `Proposed: ${CHIP_STAGES.find((s) => s.key === stage)?.label ?? stage}`

/**
 * Job functions with no saved stage show the stage Census proposes from their name, marked
 * Proposed until someone saves it (docs/ANALYSES.md, 4.2), so the readout's "confirm the stage
 * in Settings" lands on a cell that says what is proposed.
 */
export function withProposedStages(
  rows: readonly ValueRow[],
  stageFor: (jobFunction: string) => { stage: ChipStageKey; source: string } | null,
): ValueRow[] {
  return rows.map((r) => {
    if (r['attr:stage'] != null || r.item.retired) return r
    const s = stageFor(r.value)
    return s?.source === 'proposed' ? { ...r, 'attr:stage': proposedStageText(s.stage) } : r
  })
}

/* ───────────── in the data, not on the list ───────────── */

export interface OffListItem {
  value: string
  ref: FieldRef
  /** "Requisitions: Department" */
  field: string
  rows: readonly number[]
  /** The active value it most likely means. */
  suggestion: string | null
  /** Its rows can be mapped to a value on the list (a reference mapping). */
  canMap: boolean
}

export function offListItems(list: EffectiveList, analysis: ListAnalysis): OffListItem[] {
  const active = list.values.filter((v) => !v.retired).map((v) => v.value)
  return analysis.notOnList.map((n) => ({
    value: n.value,
    ref: n.ref,
    field: fieldLabel(n.ref),
    rows: n.rows,
    suggestion: closestValue(n.value, active),
    canMap: !!categoryOf(n.ref),
  }))
}

/**
 * Values the data has that the list does not, as the list would hold them: the parent most rows
 * agree on and (for sites) what the known sites say. Values in the data on a retired spelling
 * count as on the list.
 */
export function proposals(list: EffectiveList, data: Datasets): ListValue[] {
  const known = new Set(list.values.map((v) => v.value.toLowerCase()))
  return listFromData(list.def, data).filter((v) => !known.has(v.value.toLowerCase()))
}

/**
 * For each value on a list with parents that has none, the parent most of its rows name (over
 * half of the rows that name one, as when a list is proposed from data). Values whose rows don't
 * agree are left out, for you to set. Needed after job functions gained a family as their parent.
 */
export function parentFills(list: EffectiveList, data: Datasets): { value: string; parent: string }[] {
  if (!list.def.parent) return []
  const fromData = new Map(listFromData(list.def, data).map((v) => [listKey(v.value), v.parent ?? null]))
  const out: { value: string; parent: string }[] = []
  for (const v of list.values) {
    if (v.parent || v.retired) continue
    const parent = fromData.get(listKey(v.value))
    if (parent) out.push({ value: v.value, parent })
  }
  return out
}

/* ───────────── sentences ───────────── */

const datasetsOf = (def: ListDef) => [
  ...new Set(def.refs.map((r) => parseFieldRef(r)?.dataset).filter((d): d is NonNullable<typeof d> => !!d)),
]

/** "Checks Employees, Requisitions, Job changes and Hiring plan." */
export function checksText(list: EffectiveList): string {
  const names = listText(datasetsOf(list.def).map((d) => datasetDef(d).label))
  if (list.paused === 'sample') return `Checks ${names} while the sample is loaded.`
  if (list.paused === 'yours') return `Checks ${names} while your own data is loaded.`
  return list.validates ? `Checks ${names}.` : `Will check ${names} once official.`
}

/** Where the list came from, and when you last changed it. */
export function originText(list: EffectiveList, saved: ListsState): string {
  const last = saved.log.find((c) => c.lists.includes(list.def.id))
  const when = last ? ` Last changed ${whenText(last.at)} by ${last.by ?? 'you'}.` : ''
  switch (list.source) {
    case 'sample':
      return 'The sample company’s list, official so you can see the checks at work.'
    case 'census':
      return list.def.kind === 'fixed' ? 'Census reads these exact values.' : 'Census’s own list.'
    case 'data':
      return 'Proposed from your data. It checks nothing until you make it official.'
    default: {
      const from =
        list.paused === 'draft'
          ? 'Proposed from your data, with your changes.'
          : list.basis === 'sample'
            ? 'Saved by you, starting from the sample company’s list.'
            : list.basis === 'census'
              ? 'Census’s list with your changes.'
              : list.basis === 'file'
                ? 'Saved by you from a file.'
                : 'Saved by you, starting from your data.'
      return `${from}${when}`
    }
  }
}

/**
 * Why a saved list checks nothing with the data loaded now, for the note above it, or null. A
 * list saved from the sample's while your data is loaded is worth rebuilding from your data.
 */
export function pauseText(list: EffectiveList): string | null {
  switch (list.paused) {
    case 'sample':
      return 'You saved this list while Census showed the sample company, so it checks nothing in your data. Rebuild it from your data, or keep checking your data against it as it is.'
    case 'yours':
      return 'You saved this list for your own data, so it checks nothing in the sample company. It checks your data again once you load it.'
    case 'draft':
      return 'Your changes are kept. The list stays proposed and checks nothing until you make it official.'
    default:
      return null
  }
}

/**
 * What a change says about the list when the list still checks nothing after it: changes to a
 * proposed list never make it official on their own.
 */
export function pausedNote(def: ListDef, pause: ListPause | null | undefined): string | undefined {
  if (!pause) return undefined
  const what = `The ${def.label.toLowerCase()} list stays proposed: it checks nothing`
  return pause === 'draft'
    ? `${what} until you make it official.`
    : `${what} in the data loaded now until you keep checking against it.`
}

/** The note under a list's values table. */
export const valuesNote = (n: number): string =>
  `${plural(n, 'value')}. Rows counts uses across the list's fields (a job change that names a department as both its old and new one counts twice) and opens them when one field holds them all. Choose a row to see the rows in each field, or to rename, move, retire or change it.`

/** What the "In data, not on the list" block says about its values. */
export function offListNote(list: EffectiveList, items: readonly OffListItem[]): string {
  const rows = items.reduce((s, i) => s + i.rows.length, 0)
  const values = new Set(items.map((i) => i.value)).size
  const lead = `${plural(values, 'value')} in ${rowsText(rows)}.`
  if (list.validates)
    return `${lead} They count as not recognized for their field. Map each to the value it means, or add it to the list.`
  return list.paused === 'sample' || list.paused === 'yours'
    ? `${lead} The list checks nothing in the data loaded now, so they do not count as not recognized.`
    : `${lead} Once the list is official they will count as not recognized.`
}
