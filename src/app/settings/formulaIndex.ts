/**
 * Settings → Formulas as data: one row per registered metric with its formula, population and
 * window, the settings it calculates with (their values in force), the fields it reads (with
 * their tier) and whether anything behind it differs from the defaults. Rows are grouped by home
 * view in folder-tab order, then by the group in the metric's id; the privacy and data quality
 * rules and the calculation settings get a section of their own. Pure: built from the live
 * dictionary (`ctx.metrics`), so it always shows what Census computes, edits included.
 */
import type { Column, ExportMeta } from '@/charts/types'
import { type FieldRef, isFieldRef } from '@/data/quality/fieldRef'
import { type DataStandard, TIER_LABEL, type Tier } from '@/data/quality/tier'
import type { QualityIndex } from '@/data/quality/types'
import { VIEW_KEYS } from '@/data/schema'
import type { ExportTable } from '@/lib/export/types'
import { targetText } from '@/metrics/overrides'
import { formatParam } from '@/metrics/params'
import { ANONYMITY } from '@/metrics/privacy'
import { fieldLabel, METRIC_VIEW_LABEL, readsNoData } from '@/metrics/registry'
import type { MetricDef, MetricField, MetricsApi, MetricView } from '@/metrics/types'
import { refText, unitText } from '@/views/data/metrics/model'

/* ───────────── sections and groups ───────────── */

/** Where a metric is listed: its home view, or the rules and settings at the end. */
export type FormulaSection = MetricView | 'rules'

/** The groups of the rules section, in this order. */
export type RuleGroup = 'privacy' | 'quality' | 'setting' | 'other'
const RULE_GROUP_ORDER: readonly RuleGroup[] = ['privacy', 'quality', 'setting', 'other']

/** Folder-tab order, then the Action center and the Data room, then the rules. */
export const SECTION_ORDER: readonly FormulaSection[] = [...VIEW_KEYS, 'actions', 'data', 'rules']

export const FORMULA_SECTION_LABEL: Record<FormulaSection, string> = {
  ...METRIC_VIEW_LABEL,
  rules: 'Rules and settings',
}

const RULE_GROUP_LABEL: Record<RuleGroup, string> = {
  privacy: 'Privacy rules',
  quality: 'Data quality rules',
  setting: 'Calculation settings',
  other: 'Other rules',
}

/**
 * Names for the group part of metric ids (`<view>.<group>.<name>`), by view and group. A group
 * not named here reads from its id ("openRoles" → "Open roles").
 */
const GROUP_NAME: Readonly<Record<string, string>> = {
  'scorecard.measures': 'Measures',
  'scorecard.findings': 'Top findings',
  'recruiting.reqs': 'Requisitions',
  'recruiting.hires': 'Hires',
  'recruiting.offers': 'Offers',
  'recruiting.pipeline': 'Pipeline',
  'recruiting.flow': 'Candidate flow',
  'recruiting.recruiters': 'Recruiters',
  'recruiting.sources': 'Sources',
  'recruiting.data': 'Data checks',
  'onboarding.upcoming': 'Upcoming starts',
  'onboarding.first90': 'First 90 days',
  'onboarding.plan': 'Hiring plan',
  'onboarding.readout': 'Readout rules',
  'hrbp.headcount': 'Headcount',
  'hrbp.flow': 'Hires and exits',
  'hrbp.attrition': 'Attrition',
  'hrbp.movement': 'Movement',
  'hrbp.workforce': 'Workforce',
  'hrbp.org': 'Org design',
  'hrbp.scorecard': 'Org scorecard',
  'hrbp.findings': 'Readout rules',
  'org.chart': 'The chart',
  'org.people': 'Key figures',
  'org.managers': 'Key figures',
  'org.span': 'Key figures',
  'org.layers': 'Key figures',
  'org.openRoles': 'Key figures',
  'org.flags': 'Structure flags',
  'org.person': 'Person',
  'org.team': 'Team',
  'org.exit': 'Exit simulation',
  'org.scenario': 'Reorg scenario',
  'services.cases': 'Cases',
  'services.tx': 'Transactions',
  'services.levels': 'Service levels',
  'services.leave': 'Leave and return',
  'services.readout': 'Readout rules',
  'talent.performance': 'Performance',
  'talent.potential': 'Potential',
  'talent.succession': 'Succession',
  'talent.retention': 'Retention',
  'talent.learning': 'Learning',
  'talent.finding': 'Readout rules',
  'comp.compa': 'Compa-ratio',
  'comp.position': 'Range position',
  'comp.compression': 'Compression',
  'comp.merit': 'Merit cycle',
  'comp.bonus': 'Bonus',
  'comp.equity': 'Equity',
  'comp.rewards': 'Total rewards',
  'comp.market': 'Market',
  'compliance.work': 'Right to work',
  'compliance.i9': 'Form I-9',
  'compliance.export': 'Export control',
  'compliance.training': 'Policy training',
  'compliance.deadlines': 'Statutory deadlines',
  'compliance.readout': 'Readout rules',
  'compliance.actions': 'Action center items',
  'listening.score': 'Survey scores',
  'listening.programs': 'Programs',
  'listening.drivers': 'Drivers',
  'listening.candidates': 'Candidates',
  'listening.onboarding': 'Onboarding',
  'listening.stay': 'Stay interviews',
  'listening.exit': 'Exit survey',
  'listening.managers': 'Managers',
  'listening.services': 'HR services',
  'listening.engagement': 'Engagement',
  'actions.items': 'Items',
  'actions.owners': 'Owners',
}

/** "openRoles" → "Open roles", "first90" → "First 90". */
export function humanize(key: string): string {
  const words = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : key
}

type Placed = Pick<MetricDef, 'id' | 'views' | 'kind' | 'uses' | 'locked'>

/**
 * The kind of rule an entry is, or null for a number computed from data. Only privacy.* ids are
 * privacy rules; any other rule, or entry that reads no data, is listed under Other rules.
 */
export function ruleGroupOf(def: Placed): RuleGroup | null {
  const prefix = def.id.split('.')[0]
  if (prefix === 'quality') return 'quality'
  if (prefix === 'privacy') return 'privacy'
  if (def.kind === 'setting') return 'setting'
  if (def.kind === 'rule' || readsNoData(def)) return 'other'
  return null
}

/** The section and group a metric is listed under. */
export function placeOf(def: Placed): {
  section: FormulaSection
  group: string
  groupLabel: string
} {
  const rule = ruleGroupOf(def)
  if (rule) return { section: 'rules', group: rule, groupLabel: RULE_GROUP_LABEL[rule] }
  const home = def.views[0] ?? 'data'
  const part = def.id.split('.')[1] ?? ''
  const label = GROUP_NAME[`${home}.${part}`] ?? humanize(part)
  // Groups with the same name in one view (the Org chart's key figures) are one group.
  return { section: home, group: label, groupLabel: label }
}

/* ───────────── rows ───────────── */

export interface FormulaSetting {
  /** The metric that holds the setting. */
  metricId: string
  key: string
  label: string
  /** The value in force, in words: "365 d", "On". */
  value: string
  defaultValue: string
  changed: boolean
  /** Held by another metric whose settings change this one: that metric's name. */
  from: string | null
}

export interface FormulaField {
  ref: FieldRef
  /** "Employees: Termination date". */
  label: string
  tier: Tier
  tierText: string
}

export interface FormulaRow {
  id: string
  name: string
  /** Null when someone cleared it in Metric definitions. */
  formula: string | null
  population: string | null
  window: string | null
  section: FormulaSection
  sectionLabel: string
  group: string
  groupLabel: string
  views: readonly MetricView[]
  /** "People stats, Compensation and Talent". */
  viewsText: string
  /** "Percent (%)". */
  unit: string
  /** "At most 10.0%"; null without a target. */
  target: string | null
  settings: FormulaSetting[]
  /** The fields it reads with the settings in force; empty for a rule. */
  fields: FormulaField[]
  /** A rule or a calculation setting: it reads no data. */
  readsNoData: boolean
  /** Its wording, target or settings, or the settings of a metric it depends on, differ from the defaults. */
  changed: boolean
  /** "Formula, Target, Count contractors in headcount (Headcount)"; null when nothing changed. */
  changedText: string | null
  /** Lowercase text the search matches against. */
  haystack: string
}

export type FormulaApi = Pick<
  MetricsApi,
  'list' | 'def' | 'param' | 'target' | 'changedFields' | 'sourcesOf' | 'changesBehind'
>

const listText = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

function settingsOf(def: MetricDef, api: FormulaApi): FormulaSetting[] {
  const own = (d: MetricDef, from: string | null): FormulaSetting[] => {
    const changed = new Set<MetricField>(api.changedFields(d.id))
    return d.params.map((p) => ({
      metricId: d.id,
      key: p.key,
      label: p.label,
      value: formatParam(p, api.param(d.id, p.key)),
      defaultValue: formatParam(p, p.default),
      changed: changed.has(`params.${p.key}`),
      from,
    }))
  }
  // The anonymity minimum applies to every number computed from data, so it is listed only on its own row.
  const sources = api
    .sourcesOf(def.id)
    .slice(1)
    .filter((id) => id !== ANONYMITY.metricId)
    .flatMap((id) => {
      const d = api.def(id)
      return d ? [d] : []
    })
  return [...own(def, null), ...sources.flatMap((d) => own(d, d.name))]
}

function fieldsOf(def: MetricDef, quality: Pick<QualityIndex, 'fieldStats'> | null): FormulaField[] {
  return def.uses.filter(isFieldRef).map((ref) => {
    const tier = quality ? quality.fieldStats(ref).tier : 'none'
    return { ref, label: refText(ref), tier, tierText: TIER_LABEL[tier] }
  })
}

/** What differs from the defaults behind the metric, in words; the data quality rules are left out. */
function changedTextOf(def: MetricDef, api: FormulaApi): string | null {
  const parts: string[] = []
  for (const c of api.changesBehind(def.id)) {
    if (c.role === 'rule') continue
    const d = c.role === 'self' ? def : api.def(c.metricId)
    for (const f of c.fields) {
      const label = fieldLabel(d, f)
      parts.push(c.role === 'self' ? label : `${label} (${d?.name ?? c.metricId})`)
    }
  }
  return parts.length ? parts.join(', ') : null
}

export function formulaRow(
  def: MetricDef,
  api: FormulaApi,
  quality: Pick<QualityIndex, 'fieldStats'> | null,
): FormulaRow {
  const place = placeOf(def)
  const target = api.target(def.id)
  const settings = settingsOf(def, api)
  const fields = fieldsOf(def, quality)
  const changedText = changedTextOf(def, api)
  const sectionLabel = FORMULA_SECTION_LABEL[place.section]
  const views = def.views
  const haystack = [
    def.id,
    def.name,
    def.formula,
    def.population,
    def.window,
    sectionLabel,
    place.groupLabel,
    ...views.map((v) => METRIC_VIEW_LABEL[v]),
    ...fields.flatMap((f) => [f.ref, f.label]),
    ...settings.flatMap((s) => [s.label, s.key]),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
  return {
    id: def.id,
    name: def.name,
    formula: def.formula?.trim() || null,
    population: def.population?.trim() || null,
    window: def.window?.trim() || null,
    section: place.section,
    sectionLabel,
    group: place.group,
    groupLabel: place.groupLabel,
    views,
    viewsText: listText(views.map((v) => METRIC_VIEW_LABEL[v] ?? v)),
    unit: unitText(def.unit),
    target: target ? targetText(def, target) : null,
    settings,
    fields,
    readsNoData: readsNoData(def),
    changed: changedText != null,
    changedText,
    haystack,
  }
}

/** A row for every metric in the dictionary, in catalog order. */
export function formulaRows(api: FormulaApi, quality: Pick<QualityIndex, 'fieldStats'> | null): FormulaRow[] {
  return api.list.map((d) => formulaRow(d, api, quality))
}

/* ───────────── filters ───────────── */

export interface FormulaFilters {
  query: string
  /** Metrics that appear in this view (home or not); 'all' for every view. */
  view: MetricView | 'all'
  /** Only metrics with something changed from the defaults behind them. */
  changed: boolean
  /** Only metrics with a target. */
  target: boolean
}

export const NO_FORMULA_FILTERS: FormulaFilters = { query: '', view: 'all', changed: false, target: false }

export const isFiltered = (f: FormulaFilters): boolean =>
  !!f.query.trim() || f.view !== 'all' || f.changed || f.target

/** Every word of the query appears somewhere: name, id, formula, population, window, fields, settings. */
export function matchesQuery(row: Pick<FormulaRow, 'haystack'>, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((w) => row.haystack.includes(w))
}

export function matchesFilters(row: FormulaRow, f: FormulaFilters): boolean {
  if (f.view !== 'all' && !row.views.includes(f.view)) return false
  if (f.changed && !row.changed) return false
  if (f.target && !row.target) return false
  return matchesQuery(row, f.query)
}

export const filterRows = (rows: readonly FormulaRow[], f: FormulaFilters): FormulaRow[] =>
  rows.filter((r) => matchesFilters(r, f))

/** The views the filter can pick: those some metric appears in, in folder-tab order. */
export function viewOptions(rows: readonly Pick<FormulaRow, 'views'>[]): MetricView[] {
  const seen = new Set<MetricView>()
  for (const r of rows) for (const v of r.views) seen.add(v)
  return SECTION_ORDER.filter((s): s is MetricView => s !== 'rules' && seen.has(s))
}

const intText = (n: number) => n.toLocaleString('en-US')
const metricsText = (n: number) => `${intText(n)} ${n === 1 ? 'metric' : 'metrics'}`

/** "Showing 41 of 309 metrics", or "309 metrics" when nothing is filtered out. */
export function countText(shown: number, total: number): string {
  return shown === total ? metricsText(total) : `Showing ${intText(shown)} of ${metricsText(total)}`
}

/* ───────────── grouping ───────────── */

export interface FormulaGroup {
  key: string
  label: string
  rows: FormulaRow[]
}

export interface FormulaSectionRows {
  key: FormulaSection
  label: string
  count: number
  groups: FormulaGroup[]
}

/**
 * Rows by section in folder-tab order (rules last), then by group in the order the catalog first
 * lists them; empty sections are left out.
 */
export function groupFormulaRows(rows: readonly FormulaRow[]): FormulaSectionRows[] {
  const bySection = new Map<FormulaSection, Map<string, FormulaGroup>>()
  for (const r of rows) {
    let groups = bySection.get(r.section)
    if (!groups) {
      groups = new Map()
      bySection.set(r.section, groups)
    }
    const g = groups.get(r.group)
    if (g) g.rows.push(r)
    else groups.set(r.group, { key: r.group, label: r.groupLabel, rows: [r] })
  }
  const order = [...SECTION_ORDER, ...[...bySection.keys()].filter((k) => !SECTION_ORDER.includes(k))]
  return order.flatMap((key) => {
    const groups = bySection.get(key)
    if (!groups) return []
    const list = key === 'rules' ? RULE_GROUP_ORDER.flatMap((k) => groups.get(k) ?? []) : [...groups.values()]
    return [
      {
        key,
        label: FORMULA_SECTION_LABEL[key] ?? key,
        count: list.reduce((n, g) => n + g.rows.length, 0),
        groups: list,
      },
    ]
  })
}

/* ───────────── copy and export ───────────── */

/** One formula as plain text: "Voluntary attrition: voluntary exits ÷ average headcount …". */
export function formulaText(row: Pick<FormulaRow, 'name' | 'formula'>): string {
  return `${row.name}: ${row.formula ?? 'no formula recorded'}`
}

/** "First-year window: 180 d (default 365 d)", "Count contractors in headcount (Headcount): Off". */
export function settingText(s: FormulaSetting): string {
  const name = s.from ? `${s.label} (${s.from})` : s.label
  return `${name}: ${s.value}${s.changed ? ` (default ${s.defaultValue})` : ''}`
}

/** "Employees: Termination date (Gold)". */
export const fieldText = (f: FormulaField): string => `${f.label} (${f.tierText})`

export type FormulaExportRow = {
  view: string
  group: string
  metric: string
  id: string
  formula: string
  population: string
  window: string
  unit: string
  target: string
  settings: string
  fields: string
  changed: string
}

export const EXPORT_COLUMNS: Column<FormulaExportRow>[] = [
  { key: 'view', label: 'View' },
  { key: 'group', label: 'Group' },
  { key: 'metric', label: 'Metric' },
  { key: 'id', label: 'ID' },
  { key: 'formula', label: 'Formula' },
  { key: 'population', label: 'Population' },
  { key: 'window', label: 'Window' },
  { key: 'unit', label: 'Unit' },
  { key: 'target', label: 'Target' },
  { key: 'settings', label: 'Settings' },
  { key: 'fields', label: 'Fields read' },
  { key: 'changed', label: 'Changed from default' },
]

/** The rows of the "Formula index" export, in index order (sections, then groups). */
export function exportRows(rows: readonly FormulaRow[]): FormulaExportRow[] {
  return groupFormulaRows(rows).flatMap((s) =>
    s.groups.flatMap((g) =>
      g.rows.map((r) => ({
        view: s.label,
        group: g.label,
        metric: r.name,
        id: r.id,
        formula: r.formula ?? '',
        population: r.population ?? '',
        window: r.window ?? '',
        unit: r.unit,
        target: r.target ?? 'No target',
        settings: r.settings.map(settingText).join('; '),
        fields: r.readsNoData ? 'Reads no data' : r.fields.map(fieldText).join('; '),
        changed: r.changedText ? `Yes: ${r.changedText}` : 'No',
      })),
    ),
  )
}

export const EXPORT_NAME = 'Formula index'

/** The whole index as one export table (formulas are not people data: nothing is withheld). */
export function formulaIndexTable(rows: readonly FormulaRow[]): ExportTable {
  return {
    name: EXPORT_NAME,
    title: EXPORT_NAME,
    subtitle:
      'Every metric Census calculates: its formula, population and window, the settings in force and the fields it reads.',
    note: `${metricsText(rows.length)}. Edit definitions in the Data room, Metric definitions.`,
    columns: EXPORT_COLUMNS,
    rows: exportRows(rows),
  }
}

/**
 * Export context for the index: Settings, Formulas, the as-of date and the data standard (the
 * field tiers depend on them), and no scope or window, since formulas do not depend on the
 * filters.
 */
export function formulaIndexMeta(ctx: {
  asOf: string
  isSample: boolean
  company: string
  standard?: DataStandard
}): ExportMeta {
  return {
    view: 'Settings',
    viewKey: 'settings',
    tab: 'Formulas',
    scope: '',
    window: '',
    asOf: ctx.asOf,
    isSample: ctx.isSample,
    company: ctx.company,
    ...(ctx.standard ? { standard: ctx.standard } : {}),
  }
}
