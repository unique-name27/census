/**
 * A list against the data: how many rows use each value, the values in the data that are not on
 * the list (by field, with their rows) and the values on the list that no row uses. Pure; rows
 * are indexes into the datasets given (the mapped data, `ctx.all`).
 */
import { isFilled } from '../quality/applicability'
import { type FieldRef, parseFieldRef } from '../quality/fieldRef'
import type { Datasets } from '../schema'
import type { EffectiveList, EffectiveLists, ListId, ListValue } from './types'

type Row = Record<string, unknown>

export interface ValueUse {
  /** Rows across the list's fields (a job change naming the value twice counts twice). */
  total: number
  /** Row indexes per field. */
  byRef: Map<FieldRef, number[]>
}

export interface NotOnList {
  value: string
  ref: FieldRef
  /** Row indexes into the field's dataset. */
  rows: number[]
}

export interface ListAnalysis {
  id: ListId
  /** Filled rows across the list's fields. */
  filled: number
  /** Every filled value in the data. */
  uses: ReadonlyMap<string, ValueUse>
  /** Values in the data that are not on the list, one entry per field, most rows first. */
  notOnList: NotOnList[]
  /** Rows behind `notOnList`. */
  notOnListRows: number
  /** Active values on the list that no row uses. */
  notInData: ListValue[]
}

export function analyzeList(list: EffectiveList, data: Datasets): ListAnalysis {
  const uses = new Map<string, ValueUse>()
  let filled = 0
  for (const ref of list.def.refs) {
    const p = parseFieldRef(ref)
    if (!p) continue
    const rows = data[p.dataset] as unknown as readonly Row[]
    rows.forEach((r, i) => {
      const v = r[p.field]
      if (!isFilled(v)) return
      filled++
      const s = String(v)
      let u = uses.get(s)
      if (!u) {
        u = { total: 0, byRef: new Map() }
        uses.set(s, u)
      }
      u.total++
      let at = u.byRef.get(ref)
      if (!at) {
        at = []
        u.byRef.set(ref, at)
      }
      at.push(i)
    })
  }
  const known = new Set(list.values.map((v) => v.value))
  const notOnList: NotOnList[] = []
  for (const [value, u] of uses) {
    if (known.has(value)) continue
    for (const [ref, rows] of u.byRef) notOnList.push({ value, ref, rows })
  }
  notOnList.sort((a, b) => b.rows.length - a.rows.length || a.value.localeCompare(b.value))
  return {
    id: list.def.id,
    filled,
    uses,
    notOnList,
    notOnListRows: notOnList.reduce((s, n) => s + n.rows.length, 0),
    notInData: list.values.filter((v) => !v.retired && !uses.has(v.value)),
  }
}

const memo = new WeakMap<EffectiveLists, WeakMap<Datasets, Record<ListId, ListAnalysis>>>()

/** Every list against the data (memoized per lists and data). */
export function analyzeLists(lists: EffectiveLists, data: Datasets): Record<ListId, ListAnalysis> {
  let byData = memo.get(lists)
  if (!byData) {
    byData = new WeakMap()
    memo.set(lists, byData)
  }
  const hit = byData.get(data)
  if (hit) return hit
  const out = {} as Record<ListId, ListAnalysis>
  for (const id of Object.keys(lists) as ListId[]) out[id] = analyzeList(lists[id], data)
  byData.set(data, out)
  return out
}

/** Rows that use a value, per field. */
export const usageOf = (a: ListAnalysis, value: string): number => a.uses.get(value)?.total ?? 0

/**
 * The official parent of each value of a list with parents (department → business unit, job family
 * → function), for values that have one. Empty while the list is only proposed.
 */
export function officialParents(list: EffectiveList): Map<string, string> {
  const out = new Map<string, string>()
  if (!list.validates || !list.def.parent) return out
  for (const v of list.values) if (v.parent) out.set(v.value, v.parent)
  return out
}
