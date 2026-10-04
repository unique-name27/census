/**
 * The Metric definitions tab as data: one row per metric for the list (tier, target, changes,
 * a search haystack), the filters, the detail panel's tables (data used with each field's tier
 * and fill rate, settings with defaults, where the metric appears, its change log) and the
 * drafts behind the inline inputs. Pure, so every rule is unit-tested; the UI only renders.
 */
import type { Column } from '@/charts/types'
import { type FieldRef, isFieldRef, parseFieldRef } from '@/data/quality/fieldRef'
import { byWho, pctAgainst, pctText } from '@/data/quality/text'
import { TIER_LABEL, type Tier } from '@/data/quality/tier'
import type { FieldStats, Limiting, QualityIndex } from '@/data/quality/types'
import { type DatasetKey, datasetDef } from '@/data/schema'
import type { Format } from '@/lib/format'
import { canUndo, describeChange, formatFieldValue, targetText } from '@/metrics/overrides'
import {
  allowedText,
  formatParam,
  isNumericParam,
  isShareParam,
  paramFormat,
  parseParamNumber,
} from '@/metrics/params'
import {
  fieldLabel,
  isTextField,
  METRIC_VIEW_LABEL,
  type MetricCatalog,
  readsNoData,
} from '@/metrics/registry'
import type {
  ChangeKind,
  MetricChange,
  MetricDef,
  MetricField,
  MetricsApi,
  MetricsState,
  MetricTarget,
  MetricView,
  ParamDef,
  ParamValue,
  RatingKey,
  TargetComparator,
} from '@/metrics/types'

const intText = (n: number) => n.toLocaleString('en-US')
const plural = (n: number, one: string, many = `${one}s`) => `${intText(n)} ${n === 1 ? one : many}`

/* ───────────── groups ───────────── */

/** Where a metric is listed: its home view, or the privacy and data quality rules. */
export type MetricGroup = MetricView | 'privacy' | 'quality'

export const GROUP_ORDER: readonly MetricGroup[] = [
  'recruiting',
  'hrbp',
  'org',
  'services',
  'talent',
  'comp',
  'ai',
  'data',
  'privacy',
  'quality',
]

export const GROUP_LABEL: Record<MetricGroup, string> = {
  ...METRIC_VIEW_LABEL,
  privacy: 'Privacy rules',
  quality: 'Data quality rules',
}

/** The list a metric sits in: rules by their kind, every other metric under its home view. */
export function groupOf(def: Pick<MetricDef, 'id' | 'views'>): MetricGroup {
  const prefix = def.id.split('.')[0]
  if (prefix === 'privacy' || prefix === 'quality') return prefix
  return def.views[0] ?? 'data'
}

/** A rule (privacy, data quality) rather than a number computed from data. */
export const isRule = (def: Pick<MetricDef, 'id' | 'views'>): boolean => {
  const g = groupOf(def)
  return g === 'privacy' || g === 'quality'
}

/* ───────────── tiers ───────────── */

/** The datasets each view reads; a metric that names no fields takes the tier of its home view's. */
export type ViewDatasets = Partial<Record<MetricView, readonly DatasetKey[]>>

type TierQuality = Pick<QualityIndex, 'limitingOf' | 'explainOf'>

export interface MetricTier {
  /** Null for a rule or a setting, which reads no data. */
  tier: Tier | null
  limiting: Limiting | null
  /** "Silver: … Termination type is 92% filled." */
  explain: string | null
}

const NO_TIER: MetricTier = { tier: null, limiting: null, explain: null }

/** The tier of a metric: the lowest among the fields it uses (docs/DATA-TIERS.md). */
export function metricTier(def: MetricDef, quality: TierQuality, viewDatasets: ViewDatasets): MetricTier {
  // A rule or a calculation setting reads no data: it is never judged by its view's datasets.
  if (isRule(def) || readsNoData(def)) return NO_TIER
  const uses = def.uses.filter(isFieldRef)
  const fallback = viewDatasets[def.views[0]] ?? []
  if (!uses.length && !fallback.length) return NO_TIER
  const limiting = quality.limitingOf(uses, fallback)
  return { tier: limiting.tier, limiting, explain: quality.explainOf(uses, fallback) }
}

/* ───────────── list rows ───────────── */

export interface MetricRow {
  id: string
  name: string
  group: MetricGroup
  groupLabel: string
  views: readonly MetricView[]
  /** The fields it reads (its lineage). */
  uses: readonly FieldRef[]
  /** "People stats, Compensation and Talent". */
  viewsText: string
  tier: Tier | null
  /** "Gold", "Bronze", or "Rule" for privacy and quality rules. */
  tierText: string
  /** The field that sets the tier, in words: "Employees: Termination type". */
  limitingText: string | null
  changed: boolean
  /** "Definition, Merit budget". */
  changedText: string | null
  target: MetricTarget | null
  /** "At most 8.0%"; null without a target. */
  targetText: string | null
  settings: number
  owner: string | null
  locked: boolean
  /** Lowercase text the search box matches against. */
  haystack: string
}

const listText = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/** "Employees: Termination type" for a field reference. */
export function refText(ref: string): string {
  const p = parseFieldRef(ref)
  if (!p) return ref
  const ds = datasetDef(p.dataset)
  const f = ds.fields.find((x) => x.key === p.field)
  return `${ds.label}: ${f?.label ?? p.field}`
}

export function metricRow(
  def: MetricDef,
  api: Pick<MetricsApi, 'changedFields' | 'target'>,
  quality: TierQuality,
  viewDatasets: ViewDatasets,
): MetricRow {
  const group = groupOf(def)
  const t = metricTier(def, quality, viewDatasets)
  const fields = api.changedFields(def.id)
  const target = api.target(def.id)
  const views = def.views
  const haystack = [
    def.id,
    def.name,
    def.definition,
    def.formula,
    def.population,
    def.window,
    def.owner,
    GROUP_LABEL[group],
    ...views.map((v) => METRIC_VIEW_LABEL[v]),
    ...def.uses.map(refText),
    ...def.params.flatMap((p) => [p.label, p.key]),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
  return {
    id: def.id,
    name: def.name,
    group,
    groupLabel: GROUP_LABEL[group],
    views,
    uses: def.uses.filter(isFieldRef),
    viewsText: listText(views.map((v) => METRIC_VIEW_LABEL[v] ?? v)),
    tier: t.tier,
    tierText: t.tier ? TIER_LABEL[t.tier] : def.kind === 'setting' ? 'Setting' : 'Rule',
    limitingText: t.limiting?.ref ? refText(t.limiting.ref) : null,
    changed: fields.length > 0,
    changedText: fields.length ? fields.map((f) => fieldLabel(def, f)).join(', ') : null,
    target,
    targetText: target ? targetText(def, target) : null,
    settings: def.params.length,
    owner: def.owner ?? null,
    locked: !!def.locked,
    haystack,
  }
}

/** A row for every metric in the dictionary, in catalog order. */
export function metricRows(
  api: Pick<MetricsApi, 'list' | 'changedFields' | 'target'>,
  quality: TierQuality,
  viewDatasets: ViewDatasets,
): MetricRow[] {
  return api.list.map((d) => metricRow(d, api, quality, viewDatasets))
}

/** The list's table view and export. */
export const LIST_COLUMNS: Column<MetricRow>[] = [
  { key: 'id', label: 'Metric ID' },
  { key: 'name', label: 'Name' },
  { key: 'groupLabel', label: 'Listed under' },
  { key: 'viewsText', label: 'Views' },
  { key: 'tierText', label: 'Tier' },
  { key: 'limitingText', label: 'Limiting field' },
  { key: 'targetText', label: 'Target' },
  { key: 'settings', label: 'Settings', format: 'int' },
  { key: 'changedText', label: 'Changed from default' },
  { key: 'owner', label: 'Owner' },
]

/* ───────────── filters ───────────── */

export interface MetricFilters {
  query: string
  /** Metrics that appear in this view (home or not); 'all' for every view. */
  view: MetricView | 'all'
  tier: Tier | 'all'
  /** Only metrics changed from their defaults. */
  changed: boolean
  /** Only metrics with a target. */
  target: boolean
}

export const NO_FILTERS: MetricFilters = {
  query: '',
  view: 'all',
  tier: 'all',
  changed: false,
  target: false,
}

export const isFiltered = (f: MetricFilters): boolean =>
  !!f.query.trim() || f.view !== 'all' || f.tier !== 'all' || f.changed || f.target

/** Every word of the query appears somewhere in the metric (name, id, wording, fields, settings). */
export function matchesQuery(row: Pick<MetricRow, 'haystack'>, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((w) => row.haystack.includes(w))
}

export function matchesFilters(row: MetricRow, f: MetricFilters): boolean {
  if (f.view !== 'all' && !row.views.includes(f.view)) return false
  if (f.tier !== 'all' && row.tier !== f.tier) return false
  if (f.changed && !row.changed) return false
  if (f.target && !row.target) return false
  return matchesQuery(row, f.query)
}

export const filterRows = (rows: readonly MetricRow[], f: MetricFilters): MetricRow[] =>
  rows.filter((r) => matchesFilters(r, f))

/** Rows grouped by where they are listed, in tab order, rules last; empty groups left out. */
export function groupRows(
  rows: readonly MetricRow[],
): { group: MetricGroup; label: string; rows: MetricRow[] }[] {
  const by = new Map<MetricGroup, MetricRow[]>()
  for (const r of rows) {
    const list = by.get(r.group)
    if (list) list.push(r)
    else by.set(r.group, [r])
  }
  return GROUP_ORDER.flatMap((g) => {
    const list = by.get(g)
    return list?.length ? [{ group: g, label: GROUP_LABEL[g], rows: list }] : []
  })
}

/** "Showing 12 of 140 metrics" or "140 metrics". */
export function countText(shown: number, total: number): string {
  return shown === total ? plural(total, 'metric') : `Showing ${intText(shown)} of ${plural(total, 'metric')}`
}

/** The views a filter can pick: those some metric appears in, in tab order. */
export function viewOptions(rows: readonly Pick<MetricRow, 'views'>[]): MetricView[] {
  const seen = new Set<MetricView>()
  for (const r of rows) for (const v of r.views) seen.add(v)
  return (Object.keys(METRIC_VIEW_LABEL) as MetricView[]).filter((v) => seen.has(v))
}

/* ───────────── detail: data used ───────────── */

export interface FieldRow {
  ref: FieldRef
  dataset: DatasetKey
  datasetLabel: string
  field: string
  tier: Tier
  tierText: string
  /** Filled ÷ rows the field applies to; null when no row applies. */
  coverage: number | null
  /** "92%", or "94.6%" near the fill threshold. */
  fillText: string
  applicable: number
  filled: number
  blank: number
  /** Values not recognized. */
  invalid: number
  /** Values the importer filled with a default. */
  defaulted: number
  /** "Leavers" when only some rows count. */
  scope: string | null
  /** Why the field sits below its dataset's tier. */
  capReason: string | null
  /** This field sets the metric's tier. */
  limiting: boolean
}

type FieldQuality = Pick<QualityIndex, 'fieldStats'> & { rules: Pick<QualityIndex['rules'], 'minCoverage'> }

/** The fill rate in words, judged against the threshold so 94.6% never reads as 95%. */
export function fillText(s: Pick<FieldStats, 'coverage' | 'blankOk'>, minCoverage: number): string {
  if (s.coverage == null) return '—'
  return s.blankOk ? pctText(s.coverage) : pctAgainst(s.coverage, minCoverage, 'min')
}

/** Each field the metric reads, with its tier and fill rate from the quality index. */
export function fieldRows(
  def: MetricDef,
  quality: FieldQuality,
  limiting: FieldRef | null = null,
): FieldRow[] {
  return def.uses.filter(isFieldRef).map((ref) => {
    const s = quality.fieldStats(ref)
    const dataset = parseFieldRef(ref)?.dataset as DatasetKey
    return {
      ref,
      dataset,
      datasetLabel: datasetDef(dataset).label,
      field: s.label,
      tier: s.tier,
      tierText: TIER_LABEL[s.tier],
      coverage: s.coverage,
      fillText: fillText(s, quality.rules.minCoverage),
      applicable: s.applicableRows,
      filled: s.filled,
      blank: s.blank,
      invalid: s.invalid,
      defaulted: s.defaulted,
      scope: s.scope,
      capReason: s.capReason,
      limiting: ref === limiting,
    }
  })
}

export const FIELD_COLUMNS: Column<FieldRow>[] = [
  { key: 'datasetLabel', label: 'Dataset' },
  { key: 'field', label: 'Field' },
  { key: 'ref', label: 'Reference' },
  { key: 'tierText', label: 'Tier' },
  { key: 'coverage', label: 'Filled', format: 'pct' },
  { key: 'applicable', label: 'Rows it applies to', format: 'int' },
  { key: 'blank', label: 'Blank', format: 'int' },
  { key: 'invalid', label: 'Not recognized', format: 'int' },
  { key: 'defaulted', label: 'Defaulted', format: 'int' },
  { key: 'capReason', label: 'Why it is lower' },
]

/* ───────────── detail: settings ───────────── */

export interface SettingRow {
  key: string
  label: string
  description: string
  allowed: string
  defaultText: string
  currentText: string
  changed: boolean
  locked: ParamDef['locked'] | null
}

export function settingRows(def: MetricDef, api: Pick<MetricsApi, 'param' | 'changedFields'>): SettingRow[] {
  const changed = new Set(api.changedFields(def.id))
  return def.params.map((p) => ({
    key: p.key,
    label: p.label,
    description: p.description,
    allowed: allowedText(p),
    defaultText: formatParam(p, p.default),
    currentText: formatParam(p, api.param(def.id, p.key)),
    changed: changed.has(`params.${p.key}`),
    locked: p.locked ?? null,
  }))
}

export const SETTING_COLUMNS: Column<SettingRow>[] = [
  { key: 'label', label: 'Setting' },
  { key: 'key', label: 'Key' },
  { key: 'currentText', label: 'Current value' },
  { key: 'defaultText', label: 'Default' },
  { key: 'allowed', label: 'Allowed values' },
  { key: 'description', label: 'What it changes' },
]

/* ───────────── detail: where it appears ───────────── */

export interface WhereRow {
  view: MetricView
  label: string
  home: boolean
}

/** The views a metric appears in, its home first; privacy and data quality rules belong to no view. */
export const whereRows = (def: Pick<MetricDef, 'id' | 'views'>): WhereRow[] =>
  def.views.map((v, i) => ({ view: v, label: METRIC_VIEW_LABEL[v] ?? v, home: i === 0 && !isRule(def) }))

/* ───────────── change log ───────────── */

export interface ChangeRow {
  id: string
  metricId: string
  /** "Merit budget: 3.5% to 4%". */
  what: string
  field: string
  /** The change is to wording, whose old and new text are worth showing in full. */
  wording: boolean
  from: string
  to: string
  /** ISO date-time. */
  at: string
  by: string
  kind: ChangeKind
  kindText: string
  canUndo: boolean
}

const KIND_TEXT: Record<ChangeKind, string> = {
  edit: 'Edited',
  undo: 'Undone',
  reset: 'Reset',
  import: 'Imported',
  migration: 'Moved from Settings',
}

/** Wording changes show the text itself, shortened: "Employees who left…". */
function valueText(def: MetricDef | undefined, c: MetricChange, v: MetricChange['from']): string {
  const s = formatFieldValue(def, c.field, v)
  return s.length > 140 ? `${s.slice(0, 139).trimEnd()}…` : s
}

/** The change log, newest first; one metric's entries when `metricId` is given. */
export function changeRows(
  state: MetricsState,
  catalog: MetricCatalog,
  metricId?: string | null,
): ChangeRow[] {
  const log = metricId ? state.log.filter((c) => c.metricId === metricId) : state.log
  return log.map((c) => {
    const def = catalog.byId.get(c.metricId)
    return {
      id: c.id,
      metricId: c.metricId,
      what: describeChange(c, catalog),
      field: fieldLabel(def, c.field),
      wording: isTextField(c.field),
      from: valueText(def, c, c.from),
      to: valueText(def, c, c.to),
      at: c.at,
      by: byWho(c.by),
      kind: c.kind,
      kindText: KIND_TEXT[c.kind] ?? c.kind,
      canUndo: canUndo(state, catalog, c.id),
    }
  })
}

export const CHANGE_COLUMNS: Column<ChangeRow>[] = [
  { key: 'at', label: 'When' },
  { key: 'metricId', label: 'Metric ID' },
  { key: 'field', label: 'Field' },
  { key: 'from', label: 'From' },
  { key: 'to', label: 'To' },
  { key: 'kindText', label: 'Kind' },
  { key: 'by', label: 'By' },
]

/** "2 Oct 2026, 14:05" in local time; the ISO text when it can't be read. */
export function whenText(at: string): string {
  const t = new Date(at)
  if (!Number.isFinite(t.getTime())) return at
  const pad = (n: number) => String(n).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${t.getDate()} ${months[t.getMonth()]} ${t.getFullYear()}, ${pad(t.getHours())}:${pad(t.getMinutes())}`
}

/* ───────────── summary ───────────── */

export interface DictionarySummary {
  metrics: number
  settings: number
  targets: number
  changed: number
}

export function dictionarySummary(
  api: Pick<MetricsApi, 'list' | 'changedCount' | 'target'>,
): DictionarySummary {
  let settings = 0
  let targets = 0
  for (const d of api.list) {
    settings += d.params.length
    if (api.target(d.id)) targets++
  }
  return { metrics: api.list.length, settings, targets, changed: api.changedCount }
}

/** "140 metrics with 38 settings and 6 targets. 3 changed from defaults." */
export function summaryText(s: DictionarySummary): string {
  const head = `${plural(s.metrics, 'metric')} with ${plural(s.settings, 'setting')} and ${plural(s.targets, 'target')}.`
  return `${head} ${s.changed ? `${intText(s.changed)} changed from defaults.` : 'All at their defaults.'}`
}

/* ───────────── inline inputs ───────────── */

/** What a number input shows after the box: "%", "d", "months", "×". */
export function inputUnit(def: Pick<ParamDef, 'type' | 'format'>): string {
  if (def.type === 'months') return 'months'
  const f = paramFormat(def)
  if (f === 'pts' || f === 'pts2') return 'pts'
  if (isShareParam(def)) return '%'
  if (f === 'days' || def.type === 'days') return 'd'
  if (f === 'times') return '×'
  if (f === 'hours') return 'h'
  if (f === 'years') return 'yrs'
  return ''
}

const clean = (n: number) => +n.toPrecision(12)

/**
 * A number as it reads in an input, in the unit shown after it: 0.035 → "3.5" (%), 0.9 → "0.90",
 * 0.955 → "0.955" (never rounded, so saving an untouched box changes nothing).
 */
export function numberDraft(def: Pick<ParamDef, 'type' | 'format' | 'step'>, v: number): string {
  if (!Number.isFinite(v)) return ''
  if (isShareParam(def)) return String(clean(v * 100))
  if (paramFormat(def) === 'ratio' || paramFormat(def) === 'num2') {
    const s = String(clean(v))
    const decimals = s.split('.')[1]?.length ?? 0
    return decimals >= 2 ? s : v.toFixed(2)
  }
  return String(clean(v))
}

/** The text an input holds, back as the raw value `parseParamInput` reads ("3.5" → "3.5%"). */
export function numberInput(def: Pick<ParamDef, 'type' | 'format'>, text: string): string {
  const t = text.trim()
  if (!t) return t
  const unit = inputUnit(def)
  if ((unit === '%' || unit === 'pts') && !/(%|pts?)$/i.test(t)) return `${t}${unit === '%' ? '%' : ' pts'}`
  return t
}

/** A setting's draft: one text for numbers and choices, one per rating or range end, a flag. */
export type SettingDraft =
  | { kind: 'text'; text: string }
  | { kind: 'flag'; value: boolean }
  | { kind: 'ratings'; values: Record<RatingKey, string> }
  | { kind: 'range'; values: [string, string] }

export function settingDraft(def: ParamDef, v: ParamValue): SettingDraft {
  switch (def.type) {
    case 'boolean':
      return { kind: 'flag', value: v === true }
    case 'ratingMap': {
      const m = v as Record<RatingKey, number>
      return {
        kind: 'ratings',
        values: {
          5: numberDraft(def, m[5]),
          4: numberDraft(def, m[4]),
          3: numberDraft(def, m[3]),
          2: numberDraft(def, m[2]),
          1: numberDraft(def, m[1]),
        },
      }
    }
    case 'range': {
      const r = v as readonly [number, number]
      return { kind: 'range', values: [numberDraft(def, r[0]), numberDraft(def, r[1])] }
    }
    case 'choice':
      return { kind: 'text', text: String(v) }
    default:
      return { kind: 'text', text: typeof v === 'number' ? numberDraft(def, v) : String(v) }
  }
}

/** The raw value a draft stands for, for `parseParamInput`. */
export function draftValue(def: ParamDef, d: SettingDraft): unknown {
  switch (d.kind) {
    case 'flag':
      return d.value
    case 'ratings': {
      const out: Record<string, string> = {}
      for (const k of [5, 4, 3, 2, 1] as const) out[k] = numberInput(def, d.values[k])
      return out
    }
    case 'range':
      return [numberInput(def, d.values[0]), numberInput(def, d.values[1])]
    default:
      return isNumericParam(def) ? numberInput(def, d.text) : d.text
  }
}

/* ───────────── target ───────────── */

const PCT: ReadonlySet<Format> = new Set(['pct', 'pct0', 'pct2'])

/** The unit typed after a target value: "%" for shares, "d" for days. */
export function targetUnit(def: Pick<MetricDef, 'unit'>): string {
  if (PCT.has(def.unit)) return '%'
  if (def.unit === 'pts' || def.unit === 'pts2') return 'pts'
  return inputUnit({ type: 'number', format: def.unit })
}

export type TargetRule = TargetComparator | 'none'

export interface TargetDraft {
  rule: TargetRule
  text: string
}

export function targetDraft(def: Pick<MetricDef, 'unit'>, t: MetricTarget | null): TargetDraft {
  if (!t) return { rule: 'none', text: '' }
  return { rule: t.comparator, text: numberDraft({ type: 'number', format: def.unit }, t.value) }
}

/**
 * The target a draft asks for (null for "no target"), or why it can't be read. Bounds are the
 * store's to check (`checkTarget`), so the message matches the one an import gives.
 */
export function parseTargetDraft(
  def: Pick<MetricDef, 'unit'>,
  d: TargetDraft,
): { ok: true; value: MetricTarget | null } | { ok: false; error: string } {
  if (d.rule === 'none') return { ok: true, value: null }
  const text = d.text.trim()
  if (!text) return { ok: false, error: 'Enter a number for the target.' }
  const pct = PCT.has(def.unit) || def.unit === 'pts' || def.unit === 'pts2'
  const raw = pct && !/(%|pts?)$/i.test(text) ? `${text}%` : text
  const value = parseParamNumber(raw, { type: 'number', format: def.unit, max: pct ? 1 : undefined })
  if (value == null) return { ok: false, error: `"${text}" is not a number.` }
  return { ok: true, value: { value, comparator: d.rule } }
}

/* ───────────── selection ───────────── */

/**
 * The filters to show a metric that was asked for by address: unchanged when it is already
 * listed, otherwise cleared except a view filter it passes.
 */
export function filtersShowing(f: MetricFilters, row: MetricRow | undefined): MetricFilters {
  if (!row || matchesFilters(row, f)) return f
  const view = f.view !== 'all' && row.views.includes(f.view) ? f.view : 'all'
  return { ...NO_FILTERS, view }
}

/** The fields of a metric that can be edited, in display order; none for a locked rule's wording. */
export function editableText(def: Pick<MetricDef, 'locked'>): MetricField[] {
  return def.locked ? [] : ['definition', 'formula', 'population', 'owner']
}

/* ───────────── wording ───────────── */

const UNIT_TEXT: Partial<Record<Format, string>> = {
  int: 'Count',
  compact: 'Count',
  num1: 'Number',
  num2: 'Number',
  pct: 'Percent (%)',
  pct0: 'Percent (%)',
  pct2: 'Percent (%)',
  pts: 'Percentage points (pts)',
  pts2: 'Percentage points (pts)',
  deltaDays: 'Days (d)',
  deltaPct: 'Percent change (%)',
  money: 'US dollars',
  moneyFull: 'US dollars',
  days: 'Days (d)',
  hours: 'Hours (h)',
  years: 'Years (yrs)',
  ratio: 'Ratio',
  times: 'Multiple (×)',
  date: 'Date',
  text: 'Not a number',
}

/** "Percent (%)", "Days (d)", "Count". */
export const unitText = (unit: Format): string => UNIT_TEXT[unit] ?? unit

/** "Lower is better", "Higher is better", or "Neither: read it in context". */
export function directionText(d: MetricDef['goodDirection']): string {
  return d === 'up' ? 'Higher is better' : d === 'down' ? 'Lower is better' : 'Neither: read it in context'
}

/** The note under "Data used": what sets the tier, or where it comes from when no field is named. */
export function tierNote(def: MetricDef, t: MetricTier, viewDatasets: ViewDatasets): string | null {
  if (isRule(def) || readsNoData(def)) return null
  if (!def.uses.some(isFieldRef)) {
    const ds = viewDatasets[def.views[0]] ?? []
    if (!ds.length) return null
    return `It takes the lowest tier of the datasets ${METRIC_VIEW_LABEL[def.views[0]]} reads: ${listText(ds.map((k) => datasetDef(k).label))}.`
  }
  if (!t.tier || !t.limiting?.ref) return null
  if (t.tier === 'gold') return 'Gold: every field it reads is gold.'
  return `${TIER_LABEL[t.tier]}, set by ${refText(t.limiting.ref)}.`
}

/**
 * What an import would do, before it is applied: "Applying it changes 3 values in 2 metrics.
 * 1 value can’t be applied; it is listed below."
 */
export function previewSummary(r: {
  changed: readonly Pick<MetricChange, 'metricId'>[]
  rejected: readonly unknown[]
  unknown: readonly string[]
}): string {
  const metrics = new Set(r.changed.map((c) => c.metricId)).size
  const parts = [
    r.changed.length
      ? `Applying it changes ${plural(r.changed.length, 'value')} in ${plural(metrics, 'metric')}.`
      : 'Nothing in the file differs from what is in force.',
  ]
  if (r.rejected.length)
    parts.push(
      `${plural(r.rejected.length, 'value')} can’t be applied; ${r.rejected.length === 1 ? 'it is' : 'they are'} listed below.`,
    )
  if (r.unknown.length)
    parts.push(
      `${plural(r.unknown.length, 'metric ID')} in the file ${r.unknown.length === 1 ? 'is' : 'are'} not in Census and will be skipped.`,
    )
  return parts.join(' ')
}
