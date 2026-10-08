/**
 * `ctx.metrics`: the dictionary as views read it. One object per (state, catalog), built lazily:
 * merged definitions and setting values are worked out on first use and kept, so an unchanged
 * state never recomputes anything and engines memoized on the context stay put.
 */
import type { Definition } from '@/charts/types'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Format } from '@/lib/format'
import { CATALOG } from './catalog'
import { changedFields, currentValue, EMPTY_METRICS } from './overrides'
import { sameParam } from './params'
import { ANONYMITY } from './privacy'
import { type MetricCatalog, paramOf, readsNoData } from './registry'
import type {
  ChangeBehind,
  MetricChange,
  MetricDef,
  MetricField,
  MetricOverride,
  MetricsApi,
  MetricsState,
  MetricTarget,
  NumberRange,
  ParamValue,
  RatingMap,
} from './types'

/** Id prefix of the data quality rules, which set the tier of every number computed from data. */
const QUALITY_PREFIX = 'quality.'

const isSetting = (f: MetricField): boolean => f.startsWith('params.')

/** The registered definition with your wording and target merged over it. */
export function mergeDef(base: MetricDef, o: MetricOverride | undefined): MetricDef {
  if (!o) return base
  const text = (f: 'formula' | 'population' | 'owner') => {
    const v = currentValue(base, o, f)
    return typeof v === 'string' ? v : undefined
  }
  const target = currentValue(base, o, 'target') as MetricTarget | null
  const merged: MetricDef = {
    ...base,
    definition: (currentValue(base, o, 'definition') as string | null) ?? base.definition,
    formula: text('formula'),
    population: text('population'),
    owner: text('owner'),
    target: target ?? undefined,
  }
  for (const k of ['formula', 'population', 'owner', 'target'] as const)
    if (merged[k] === undefined) delete merged[k]
  return merged
}

const freeze = <T>(v: T): T => (v && typeof v === 'object' ? Object.freeze(v) : v)

function build(state: MetricsState, catalog: MetricCatalog): MetricsApi {
  const merged = new Map<string, MetricDef>()
  const values = new Map<string, ParamValue>()
  const changed = new Map<string, readonly MetricField[]>()
  let list: readonly MetricDef[] | null = null
  let count: number | null = null

  const def = (id: string): MetricDef | undefined => {
    const hit = merged.get(id)
    if (hit) return hit
    const base = catalog.byId.get(id)
    if (!base) return undefined
    let d = mergeDef(base, state.overrides[id])
    // The fields it reads with the settings in force, so its tier and the metric impact ranking
    // count what the screens read (time to fill that stops at the start date reads Employees).
    const fields = usesOf(id)
    if (fields !== base.uses) d = { ...d, uses: fields }
    merged.set(id, d)
    return d
  }

  const param = <T extends ParamValue = ParamValue>(id: string, key: string): T => {
    const k = `${id}\u0000${key}`
    const hit = values.get(k)
    if (hit !== undefined) return hit as T
    const base = catalog.byId.get(id)
    if (!base) throw new Error(`Unknown metric "${id}": register it in its view's metrics.ts.`)
    if (!paramOf(base, key)) throw new Error(`Metric "${id}" has no setting "${key}".`)
    const v = freeze(currentValue(base, state.overrides[id], `params.${key}`) as ParamValue)
    values.set(k, v)
    return v as T
  }

  const typed = <T extends ParamValue>(
    id: string,
    key: string,
    ok: (v: ParamValue) => boolean,
    what: string,
  ): T => {
    const v = param(id, key)
    if (!ok(v)) throw new Error(`Setting "${id}" "${key}" is not ${what}.`)
    return v as T
  }

  const changedOf = (id: string): readonly MetricField[] => {
    let c = changed.get(id)
    if (!c) {
      const base = catalog.byId.get(id)
      c = base ? changedFields(base, state.overrides[id]) : []
      changed.set(id, c)
    }
    return c
  }

  const sources = new Map<string, readonly string[]>()
  const sourcesOf = (id: string): readonly string[] => {
    const hit = sources.get(id)
    if (hit) return hit
    const base = catalog.byId.get(id)
    if (!base) return []
    const out = [id]
    const seen = new Set(out)
    const queue = [...(base.dependsOn ?? [])]
    while (queue.length) {
      const next = queue.shift() as string
      if (seen.has(next)) continue
      seen.add(next)
      const d = catalog.byId.get(next)
      if (!d) continue
      out.push(next)
      queue.push(...(d.dependsOn ?? []))
    }
    if (!readsNoData(base) && !seen.has(ANONYMITY.metricId) && catalog.byId.has(ANONYMITY.metricId))
      out.push(ANONYMITY.metricId)
    sources.set(id, out)
    return out
  }

  let rules: readonly string[] | null = null
  const behind = new Map<string, readonly ChangeBehind[]>()
  const changesBehind = (id: string): readonly ChangeBehind[] => {
    const hit = behind.get(id)
    if (hit) return hit
    const base = catalog.byId.get(id)
    const out: ChangeBehind[] = []
    if (base) {
      const own = changedOf(id)
      if (own.length) out.push({ metricId: id, fields: own, role: 'self' })
      for (const s of sourcesOf(id).slice(1)) {
        const d = catalog.byId.get(s)
        const targetCounts = !!d && (d.targetRequired || d.targetUsed)
        const fields = changedOf(s).filter((f) => isSetting(f) || (targetCounts && f === 'target'))
        if (fields.length) out.push({ metricId: s, fields, role: 'source' })
      }
      if (!readsNoData(base)) {
        rules ??= catalog.list.filter((d) => d.id.startsWith(QUALITY_PREFIX)).map((d) => d.id)
        for (const r of rules) {
          const fields = changedOf(r).filter(isSetting)
          if (fields.length && r !== id) out.push({ metricId: r, fields, role: 'rule' })
        }
      }
    }
    behind.set(id, out)
    return out
  }

  const lineage = new Map<string, readonly FieldRef[]>()
  const usesOf = (id: string): readonly FieldRef[] => {
    const hit = lineage.get(id)
    if (hit) return hit
    const base = catalog.byId.get(id)
    if (!base) return []
    const extra = (base.usesWhen ?? []).filter((w) => {
      const owner = w.setting.metricId ?? id
      const d = catalog.byId.get(owner)
      return !!d && !!paramOf(d, w.setting.key) && sameParam(param(owner, w.setting.key), w.value)
    })
    const more = [...(base.readoutUses ?? []), ...extra.flatMap((w) => w.uses)]
    const out = more.length ? [...new Set([...base.uses, ...more])] : base.uses
    lineage.set(id, out)
    return out
  }

  return {
    get list() {
      list ??= catalog.list.map((d) => def(d.id)!)
      return list
    },
    def,
    defaultDef: (id) => catalog.byId.get(id),
    paramDef: (id, key) => {
      const base = catalog.byId.get(id)
      return base ? paramOf(base, key) : undefined
    },
    param,
    num: (id, key) => typed<number>(id, key, (v) => typeof v === 'number', 'a number'),
    flag: (id, key) => typed<boolean>(id, key, (v) => typeof v === 'boolean', 'on or off'),
    choice: (id, key) => typed<string>(id, key, (v) => typeof v === 'string', 'a choice'),
    ratings: (id, key) =>
      typed<RatingMap>(id, key, (v) => !!v && typeof v === 'object' && !Array.isArray(v), 'a rating map'),
    range: (id, key) => typed<NumberRange>(id, key, (v) => Array.isArray(v), 'a range'),
    target: (id) => def(id)?.target ?? null,
    isChanged: (id) => changedOf(id).length > 0,
    changedFields: changedOf,
    sourcesOf,
    changesBehind,
    usesOf,
    get changedCount() {
      count ??= Object.keys(state.overrides).filter((id) => changedOf(id).length > 0).length
      return count
    },
    get changes(): readonly MetricChange[] {
      return state.log
    },
    state,
  }
}

const cache = new WeakMap<MetricsState, WeakMap<MetricCatalog, MetricsApi>>()

/** The dictionary API for a state; the same state and catalog always give the same object. */
export function metricsApi(state: MetricsState, catalog: MetricCatalog = CATALOG): MetricsApi {
  let byCatalog = cache.get(state)
  if (!byCatalog) {
    byCatalog = new WeakMap()
    cache.set(state, byCatalog)
  }
  let api = byCatalog.get(catalog)
  if (!api) {
    api = build(state, catalog)
    byCatalog.set(catalog, api)
  }
  return api
}

/** Every metric at its defaults (engine tests, and contexts built without the store). */
export const defaultMetrics = (catalog: MetricCatalog = CATALOG): MetricsApi =>
  metricsApi(EMPTY_METRICS, catalog)

/* ───────────── small helpers for the shared UI ───────────── */

/** A Figure "Definitions" row that came from the dictionary, so the datasheet can link to it. */
export type MetricDefinition = Definition & { readonly metricId: string }

/** The dictionary entry a datasheet row came from, or null for a row written by hand. */
export const metricIdOf = (d: Definition): string | null => {
  const id = (d as Partial<MetricDefinition>).metricId
  return typeof id === 'string' ? id : null
}

/**
 * A metric's wording as a Figure "Definitions" row, from the registry with your changes; null when
 * the id is not registered. The row carries its metric id, for its own "Edit definition" link.
 */
export function definitionOf(m: Pick<MetricsApi, 'def'>, id: string): MetricDefinition | null {
  const d = m.def(id)
  if (!d) return null
  return d.formula
    ? { term: d.name, text: d.definition, formula: d.formula, metricId: id }
    : { term: d.name, text: d.definition, metricId: id }
}

/** "Definitions changed from defaults: 3 (see Metric definitions)" for export stamps; null when none changed. */
export function definitionsStamp(m: Pick<MetricsApi, 'changedCount'>): string | null {
  const n = m.changedCount
  return n ? `Definitions changed from defaults: ${n.toLocaleString('en-US')} (see Metric definitions)` : null
}

/** Whether a value meets a target: 'met', 'missed', or null when there is no value or no target. */
export function targetStatus(
  value: number | null | undefined,
  target: MetricTarget | null | undefined,
): 'met' | 'missed' | null {
  if (value == null || !Number.isFinite(value) || !target) return null
  const met =
    target.comparator === '>='
      ? value >= target.value - 1e-12
      : target.comparator === '<'
        ? value < target.value - 1e-12
        : value <= target.value + 1e-12
  return met ? 'met' : 'missed'
}

/** The kind of quantity a format shows, so a value is only judged against a target in its own unit. */
function unitFamily(f: Format): string {
  switch (f) {
    case 'pct':
    case 'pct0':
    case 'pct2':
      return 'share'
    case 'pts':
    case 'pts2':
      return 'points'
    case 'int':
    case 'compact':
      return 'count'
    case 'ratio':
    case 'num1':
    case 'num2':
      return 'number'
    case 'money':
    case 'moneyFull':
    case 'moneyM':
      return 'money'
    default:
      return f
  }
}

/**
 * A KPI against its metric's target: the target and whether the value meets it. Null when the
 * metric has no target, the tile shows no value, or the tile's number is in another unit than the
 * metric (a count shown for a rate metric is never judged against the rate's target).
 */
export function kpiTarget(
  m: Pick<MetricsApi, 'def' | 'target'>,
  metricId: string | null | undefined,
  value: number | null | undefined,
  format: Format,
): { target: MetricTarget; status: 'met' | 'missed' } | null {
  if (!metricId) return null
  const def = m.def(metricId)
  const target = m.target(metricId)
  if (!def || !target || def.unit === 'text' || unitFamily(def.unit) !== unitFamily(format)) return null
  const status = targetStatus(value, target)
  return status ? { target, status } : null
}
