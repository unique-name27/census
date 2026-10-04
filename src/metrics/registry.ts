/**
 * The catalog as a lookup, field names, and the checks every registered metric must pass. Pure,
 * and free of the views' registries (the assembled catalog is in `./catalog`).
 */
import { isFieldRef } from '@/data/quality/fieldRef'
import { VIEW_LABEL } from '@/data/schema'
import { sameParam, validateParam } from './params'
import type { MetricDef, MetricField, MetricView, ParamDef, TextField } from './types'
import { TEXT_FIELDS } from './types'

export interface MetricCatalog {
  /** Every metric, in catalog order. */
  readonly list: readonly MetricDef[]
  readonly byId: ReadonlyMap<string, MetricDef>
}

/** A lookup over `defs`; the first metric wins when an id repeats (`validateCatalog` reports it). */
export function catalogOf(defs: readonly MetricDef[]): MetricCatalog {
  const byId = new Map<string, MetricDef>()
  for (const d of defs) if (!byId.has(d.id)) byId.set(d.id, d)
  return { list: [...byId.values()], byId }
}

export const paramOf = (def: MetricDef, key: string): ParamDef | undefined =>
  def.params.find((p) => p.key === key)

/** The field name of a setting: 'params.minGroup'. */
export const paramField = (key: string): MetricField => `params.${key}`

/** The setting key of a field, or null when the field is wording or the target. */
export const paramKeyOf = (field: string): string | null =>
  field.startsWith('params.') ? field.slice('params.'.length) : null

export const isTextField = (field: string): field is TextField =>
  (TEXT_FIELDS as readonly string[]).includes(field)

/** A field this metric has: its wording, its target or one of its settings. */
export function isFieldOf(def: MetricDef, field: string): field is MetricField {
  if (isTextField(field) || field === 'target') return true
  const key = paramKeyOf(field)
  return key != null && !!paramOf(def, key)
}

const FIELD_LABEL: Record<TextField | 'target', string> = {
  definition: 'Definition',
  formula: 'Formula',
  population: 'Population',
  owner: 'Owner',
  target: 'Target',
}

/** "Definition", "Target", or the setting's label: "Merit budget". */
export function fieldLabel(def: MetricDef | undefined, field: MetricField): string {
  const key = paramKeyOf(field)
  if (key == null) return FIELD_LABEL[field as TextField | 'target'] ?? field
  return (def && paramOf(def, key)?.label) ?? key
}

/**
 * Add what other code depends on: each required metric that is missing, or the required settings
 * a registered metric with the same id lacks. Keeps the view's own wording when it has the id.
 */
export function withRequired(defs: readonly MetricDef[], required: readonly MetricDef[]): MetricDef[] {
  const out = [...defs]
  for (const r of required) {
    const i = out.findIndex((d) => d.id === r.id)
    if (i < 0) {
      out.push(r)
      continue
    }
    const missing = r.params.filter((p) => !paramOf(out[i], p.key))
    if (missing.length) out[i] = { ...out[i], params: [...out[i].params, ...missing] }
  }
  return out
}

/** Tab labels, for the dictionary page and its export. */
export const METRIC_VIEW_LABEL: Record<MetricView, string> = {
  ...VIEW_LABEL,
  data: 'Data room',
  actions: 'Action center',
}

const VIEWS = Object.keys(METRIC_VIEW_LABEL) as MetricView[]
/** Id prefixes for metrics that belong to no single view. */
const SHARED_PREFIXES = ['privacy', 'quality']

/**
 * A rule or a calculation setting rather than a number computed from data: the privacy and data
 * quality rules, and settings such as the materiality floor. It reads no data, so it has no tier,
 * is never judged by its home view's datasets, and is left out of the metric impact ranking.
 */
export function readsNoData(def: Pick<MetricDef, 'id' | 'uses' | 'kind' | 'locked'>): boolean {
  if (def.kind === 'rule' || def.kind === 'setting') return true
  if (SHARED_PREFIXES.includes(def.id.split('.')[0])) return true
  // A locked entry that names no fields is a privacy rule, wherever it is registered.
  return def.locked === true && def.uses.length === 0
}
const ID_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9-]+)+$/
const KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/

function copyProblems(id: string, field: string, text: string | undefined): string[] {
  if (!text) return []
  const out: string[] = []
  // "—" is only the placeholder for a missing value, never punctuation in a sentence.
  if (/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/.test(text))
    out.push(`${id}: ${field} uses an em dash; write two sentences instead.`)
  if (/!/.test(text)) out.push(`${id}: ${field} has an exclamation mark.`)
  return out
}

function paramProblems(def: MetricDef, p: ParamDef): string[] {
  const at = `${def.id} setting ${p.key}`
  const out: string[] = []
  if (!KEY_PATTERN.test(p.key)) out.push(`${at}: the key must be camelCase.`)
  if (!p.label?.trim()) out.push(`${at}: needs a label.`)
  if (!p.description?.trim()) out.push(`${at}: needs a description.`)
  if (p.min != null && p.max != null && p.min > p.max) out.push(`${at}: min is above max.`)
  if (p.type === 'choice' && !p.choices?.length) out.push(`${at}: a choice needs choices.`)
  if (p.locked === 'raiseOnly' && !['number', 'percent', 'days', 'months'].includes(p.type))
    out.push(`${at}: only numbers can be raise-only.`)
  const check = validateParam(p, p.default, { ignoreLock: true })
  if (!check.ok) out.push(`${at}: the default is not valid (${check.error})`)
  else if (!sameParam(check.value, p.default)) out.push(`${at}: the default is not on its step.`)
  out.push(...copyProblems(at, 'description', p.description))
  return out
}

/**
 * Everything wrong with a list of metrics, one sentence each; empty when every entry is sound:
 * unique ids shaped `<view>.<group>.<name>` (or `privacy.` / `quality.`), a name and a definition,
 * known views, `uses` that name schema fields, valid settings with defaults inside their bounds,
 * a valid target, and copy without em dashes or exclamation marks.
 */
export function validateCatalog(defs: readonly MetricDef[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  // References to another view's metrics are checked when that view is in the list (the whole
  // catalog), so one view's entries can be checked on their own.
  const prefixes = new Set(defs.map((d) => d.id.split('.')[0]))
  const checkable = (ref: string) => prefixes.has(ref.split('.')[0])
  for (const d of defs) {
    const id = d.id
    if (seen.has(id)) out.push(`${id}: the id is registered twice.`)
    seen.add(id)
    if (!ID_PATTERN.test(id)) out.push(`${id}: the id must look like view.group.name.`)
    const prefix = id.split('.')[0]
    if (!SHARED_PREFIXES.includes(prefix) && prefix !== d.views[0])
      out.push(`${id}: the id must start with its home view (${d.views[0]}).`)
    if (!d.name?.trim()) out.push(`${id}: needs a name.`)
    if (!d.definition?.trim()) out.push(`${id}: needs a definition.`)
    if (!d.views.length) out.push(`${id}: needs at least one view.`)
    for (const v of d.views) if (!VIEWS.includes(v)) out.push(`${id}: unknown view ${v}.`)
    for (const ref of d.uses)
      if (!isFieldRef(ref)) out.push(`${id}: uses ${ref}, which is not in the schema.`)
    for (const ref of d.requires ?? [])
      if (!d.uses.includes(ref)) out.push(`${id}: requires ${ref}, which it does not list in uses.`)
    const keys = new Set<string>()
    for (const p of d.params) {
      if (keys.has(p.key)) out.push(`${id}: the setting ${p.key} is registered twice.`)
      keys.add(p.key)
      out.push(...paramProblems(d, p))
    }
    if (d.target && (!Number.isFinite(d.target.value) || !['>=', '<=', '<'].includes(d.target.comparator)))
      out.push(`${id}: the target is not valid.`)
    if (d.targetRequired && !d.target) out.push(`${id}: a required target needs a default.`)
    for (const ref of d.readoutUses ?? [])
      if (!isFieldRef(ref)) out.push(`${id}: its readout uses ${ref}, which is not in the schema.`)
    for (const w of d.usesWhen ?? []) {
      for (const ref of w.uses)
        if (!isFieldRef(ref)) out.push(`${id}: uses ${ref} for a setting, which is not in the schema.`)
      const ownerId = w.setting.metricId ?? id
      const owner = defs.find((x) => x.id === ownerId)
      const p = owner && paramOf(owner, w.setting.key)
      if (!p) {
        if (checkable(ownerId))
          out.push(`${id}: its lineage follows ${ownerId} ${w.setting.key}, which is not a setting.`)
      } else if (!validateParam(p, w.value, { ignoreLock: true }).ok)
        out.push(`${id}: its lineage follows a value ${w.setting.key} can't take.`)
    }
    for (const dep of d.dependsOn ?? []) {
      if (dep === id) out.push(`${id}: depends on itself.`)
      else if (checkable(dep) && !defs.some((x) => x.id === dep))
        out.push(`${id}: depends on ${dep}, which is not registered.`)
    }
    for (const f of ['definition', 'formula', 'population', 'window'] as const)
      out.push(...copyProblems(id, f, d[f]))
  }
  return out
}
