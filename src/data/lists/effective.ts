/**
 * The lists in force, and what they hand the rest of Census: the values the quality index checks
 * each field against, and the dropdowns the Data room templates offer. Pure and memoized, so the
 * same saved lists and data give the same objects.
 *
 * Status rules (docs/SETTINGS-LISTS.md):
 * - a list you saved stays as saved. It is official while the loaded data is the kind it was built
 *   for: one saved from the sample company's list checks the sample, one built from your data or a
 *   file checks yours. With the other kind loaded it is proposed and checks nothing, until you keep
 *   checking against it or rebuild it. A draft (changes to a proposed list) checks nothing until
 *   you make it official;
 * - while every dataset a list reads is the sample, the list is the sample company's, official;
 * - once one of them is your own data, and you saved nothing, the list is proposed from your data
 *   (the rows of the datasets you loaded) and checks nothing until you make it official;
 * - Census's own vocabularies (levels, case categories, sources …) are always official. A fixed
 *   list that describes the data (`reads`: the Regions list's HR business partners) is the sample
 *   company's while that data is the sample.
 */
import { parseFieldRef } from '../quality/fieldRef'
import type { VocabOverlay } from '../quality/vocab'
import { cachedSample } from '../sample'
import type { DatasetKey, Datasets } from '../schema'
import { LIST_DEFS, LIST_IDS, listDef } from './defs'
import { censusNames, censusValues, listFromData, sampleListValues } from './seed'
import type {
  EffectiveList,
  EffectiveLists,
  ListDef,
  ListId,
  ListPause,
  ListsState,
  ListValue,
  SavedList,
} from './types'

/** Whether each dataset is the sample or yours (only the kind is read). */
export type SourceKinds = Readonly<Record<DatasetKey, { kind: 'sample' | 'upload' }>>

/** The datasets a list checks, or for a list with no field to check, the ones its values describe. */
const datasetsOf = (def: ListDef): DatasetKey[] =>
  def.refs.length
    ? [...new Set(def.refs.map((r) => parseFieldRef(r)?.dataset).filter((k): k is DatasetKey => !!k))]
    : [...(def.reads ?? [])]

/** Every dataset the list reads is the sample. */
export const onSample = (def: ListDef, sources: SourceKinds): boolean =>
  datasetsOf(def).every((k) => (sources[k]?.kind ?? 'sample') === 'sample')

let sampleCache: Partial<Record<ListId, ListValue[]>> | null = null
/** The sample company's own lists (built once). */
export function sampleLists(): Partial<Record<ListId, ListValue[]>> {
  sampleCache ??= sampleListValues(cachedSample())
  return sampleCache
}

/** A short key of which datasets are yours, for memo keys. */
export const kindsKey = (sources: SourceKinds): string =>
  (Object.keys(sources) as DatasetKey[])
    .filter((k) => sources[k]?.kind === 'upload')
    .sort()
    .join(',')

/**
 * Why a saved list checks nothing with the data loaded now, or null when it checks it: a draft;
 * a list saved from the sample's while your data is loaded; or one built from your data or a file
 * while the sample is loaded. Census's own lists, and lists you keep checking against, always check.
 */
export function savedPause(def: ListDef, s: SavedList, sources: SourceKinds): ListPause | null {
  if (s.draft) return 'draft'
  if (s.always || s.basis === 'census') return null
  // Census's own lists always check; one that describes the data (the Regions list) follows it.
  if (def.kind !== 'org' && !def.reads) return null
  const sample = onSample(def, sources)
  if (s.basis === 'sample') return sample ? null : 'sample'
  return sample ? 'yours' : null
}

/**
 * The lists in force without the data: saved ones (official, or proposed while they check
 * nothing: see `savedPause`), the sample's while the sample is loaded, and Census's own. Your own
 * lists that would be proposed from your data are null here (they need the data; see
 * `effectiveLists`).
 */
export function officialLists(saved: ListsState, sources: SourceKinds): Record<ListId, EffectiveList | null> {
  const out = {} as Record<ListId, EffectiveList | null>
  for (const def of LIST_DEFS) {
    const s = saved.lists[def.id]
    if (s) {
      const paused = savedPause(def, s, sources)
      out[def.id] = {
        def,
        status: paused ? 'proposed' : 'official',
        source: 'saved',
        basis: s.basis,
        values: s.values,
        validates: !paused,
        ...(paused ? { paused } : {}),
      }
      continue
    }
    if (def.kind !== 'org') {
      const sample = def.reads && onSample(def, sources) ? sampleLists()[def.id] : undefined
      out[def.id] = {
        def,
        status: 'official',
        source: sample ? 'sample' : 'census',
        basis: null,
        values: sample ?? censusValues(def.id),
        validates: true,
      }
      continue
    }
    out[def.id] = onSample(def, sources)
      ? {
          def,
          status: 'official',
          source: 'sample',
          basis: null,
          values: sampleLists()[def.id] ?? [],
          validates: true,
        }
      : null
  }
  return out
}

const effectiveMemo = new WeakMap<ListsState, WeakMap<Datasets, Map<string, EffectiveLists>>>()

/** Every list as Census uses it now, proposing your own lists from `data` where nothing is saved. */
export function effectiveLists(saved: ListsState, data: Datasets, sources: SourceKinds): EffectiveLists {
  const key = kindsKey(sources)
  let byData = effectiveMemo.get(saved)
  if (!byData) {
    byData = new WeakMap()
    effectiveMemo.set(saved, byData)
  }
  let byKey = byData.get(data)
  if (!byKey) {
    byKey = new Map()
    byData.set(data, byKey)
  }
  const hit = byKey.get(key)
  if (hit) return hit
  const official = officialLists(saved, sources)
  const out = {} as Record<ListId, EffectiveList>
  for (const id of LIST_IDS) {
    const o = official[id]
    if (o) {
      out[id] = o
      continue
    }
    const def = listDef(id)
    out[id] = {
      def,
      status: 'proposed',
      source: 'data',
      basis: null,
      values: listFromData(def, data, (k) => sources[k]?.kind === 'upload'),
      validates: false,
    }
  }
  byKey.set(key, out)
  return out
}

/* ───────────── what the quality index checks ───────────── */

let overlayVersion = 0
const overlayMemo = new WeakMap<ListsState, Map<string, VocabOverlay>>()

/**
 * The values each field is checked against while its list is official: every value on the list,
 * retired ones included (older rows keep them). Census's vocabularies keep their own values too,
 * so a value you add is recognized and none of Census's is ever lost.
 */
export function validationVocab(saved: ListsState, sources: SourceKinds): VocabOverlay {
  const key = kindsKey(sources)
  let byKey = overlayMemo.get(saved)
  if (!byKey) {
    byKey = new Map()
    overlayMemo.set(saved, byKey)
  }
  const hit = byKey.get(key)
  if (hit) return hit
  const refs = new Map<string, ReadonlySet<string>>()
  for (const list of Object.values(officialLists(saved, sources))) {
    // Fixed lists only retire values, and a retired value is still recognized: nothing changes.
    if (!list?.validates || list.def.kind === 'fixed') continue
    const allowed = new Set(list.values.map((v) => v.value))
    if (list.def.kind === 'vocab') for (const v of censusNames(list.def.id)) allowed.add(v)
    for (const ref of list.def.refs) refs.set(ref, allowed)
  }
  const overlay: VocabOverlay = { version: `lists-${++overlayVersion}`, refs }
  byKey.set(key, overlay)
  return overlay
}

/* ───────────── what the templates offer ───────────── */

/** A dropdown list for template columns: the workbook name and the active values. */
export interface TemplateList {
  /** Workbook defined name, e.g. "Departments". */
  name: string
  /** "Departments" */
  label: string
  values: readonly string[]
}

/**
 * The active (not retired) values of every official list, by the field they fill, for the Data
 * room templates' dropdowns. Proposed lists offer nothing until they are official.
 */
export function templateLists(saved: ListsState, sources: SourceKinds): Record<string, TemplateList> {
  const out: Record<string, TemplateList> = {}
  for (const list of Object.values(officialLists(saved, sources))) {
    if (!list?.validates) continue
    const values = list.values.filter((v) => !v.retired).map((v) => v.value)
    if (!values.length) continue
    const entry: TemplateList = { name: list.def.name, label: list.def.label, values }
    for (const ref of list.def.refs) out[ref] = entry
  }
  return out
}

/* ───────────── what Categories & mapping reads ───────────── */

const inventoryMemo = new WeakMap<EffectiveLists, Partial<Record<ListId, readonly string[]>>>()

/**
 * The known values of each official list by its id (the same ids as the categories of
 * Categories & mapping), so that tab marks values off the official lists as not in the list.
 * Fixed lists are left out: their values are the field's own.
 */
export function inventoryVocab(lists: EffectiveLists): Partial<Record<ListId, readonly string[]>> {
  let hit = inventoryMemo.get(lists)
  if (!hit) {
    hit = {}
    for (const l of Object.values(lists))
      if (l.validates && l.def.kind !== 'fixed') {
        // Active values first, so a suggestion lands on a current value before a retired one.
        const values = [...l.values.filter((v) => !v.retired), ...l.values.filter((v) => v.retired)].map(
          (v) => v.value,
        )
        hit[l.def.id] = l.def.kind === 'vocab' ? [...new Set([...values, ...censusNames(l.def.id)])] : values
      }
    inventoryMemo.set(lists, hit)
  }
  return hit
}

const parentsMemo = new WeakMap<
  EffectiveLists,
  { department: ReadonlyMap<string, string>; jobFunction: ReadonlyMap<string, string> }
>()

/** The official business unit of each department and family of each job function (official lists only). */
export function officialParentMaps(lists: EffectiveLists): {
  department: ReadonlyMap<string, string>
  jobFunction: ReadonlyMap<string, string>
} {
  let hit = parentsMemo.get(lists)
  if (!hit) {
    const of = (l: EffectiveList) => {
      const m = new Map<string, string>()
      if (l.validates) for (const v of l.values) if (v.parent) m.set(v.value, v.parent)
      return m
    }
    hit = { department: of(lists.department), jobFunction: of(lists.jobFunction) }
    parentsMemo.set(lists, hit)
  }
  return hit
}
