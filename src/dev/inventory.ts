/**
 * The Developer page's inventory (docs/ROLES.md, 5.3; docs/ROLES-V2.md 5.13): every view, tab, role
 * home, figure, metric, engine function, Ask tool, drill kind, dataset field, storage key, route,
 * setting, shortcut and help article or tour in Census, each as rows for one table-only Figure.
 * Every row carries the decision in each of the eleven modes from the same policy the Access tab
 * and the matrix test read, so the inventory and the Access tab never disagree. Pure: each builder
 * takes what it lists.
 */
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { MATRIX_MODES } from '@/access/matrix'
import {
  HOME_OF,
  MODE_LABEL,
  MODES,
  type Mode,
  type ModePicks,
  PAY_OF,
  type PayView,
  PICK_OF,
} from '@/access/modes'
import type { Access, At, DecideInfo, Decision } from '@/access/policy'
import { decide, routeShown } from '@/access/policy'
import type { FormulaRow } from '@/app/settings/formulaIndex'
import type { Column } from '@/charts/types'
import { TIER_LABEL } from '@/data/quality/tier'
import type { QualityIndex } from '@/data/quality/types'
import { DATASETS, type DatasetDef, type DatasetKey } from '@/data/schema'
import { SECTION_LABEL, type SettingsSection } from '@/data/settings'
import type { DrillKind } from '@/drill/types'
import type { HelpArticle, Tour } from '@/help/types'
import type { MetricsApi } from '@/metrics/types'
import { HOME_FIGURES, SLUG_OF } from '@/views/home/engine/figures'
import { SCORECARD_FIGURES } from '@/views/scorecard/engine/figures'
import { TEAM_FIGURES } from '@/views/team/engine/figures'
import type { ViewDef } from '@/views/types'
import { isHomeRole, PICK_NOUN, pickLabel } from './roles'
import { type FigureScan, figurePlace } from './scanModel'
import type { Shortcut } from './shortcuts'
import type { StorageRow } from './storageKeys'
import type { EngineRun } from './store'
import { DEV_TABS } from './tabs'

export type Row = Record<string, unknown>

/** The lists, in the order the picker shows them. */
export type InventoryList =
  | 'views'
  | 'tabs'
  | 'homes'
  | 'figures'
  | 'metrics'
  | 'engines'
  | 'ask'
  | 'drills'
  | 'datasets'
  | 'storage'
  | 'routes'
  | 'settings'
  | 'shortcuts'
  | 'help'

export const INVENTORY_LISTS: readonly { key: InventoryList; label: string; noun: string }[] = [
  { key: 'views', label: 'Views', noun: 'view' },
  { key: 'tabs', label: 'Tabs', noun: 'tab' },
  { key: 'homes', label: 'Role homes', noun: 'role' },
  { key: 'figures', label: 'Figures', noun: 'figure' },
  { key: 'metrics', label: 'Metrics', noun: 'metric' },
  { key: 'engines', label: 'Engine functions', noun: 'function' },
  { key: 'ask', label: 'Ask tools', noun: 'tool' },
  { key: 'drills', label: 'Drill kinds', noun: 'kind' },
  { key: 'datasets', label: 'Datasets and fields', noun: 'field' },
  { key: 'storage', label: 'Storage keys', noun: 'key' },
  { key: 'routes', label: 'Routes', noun: 'route' },
  { key: 'settings', label: 'Settings', noun: 'setting' },
  { key: 'shortcuts', label: 'Shortcuts', noun: 'shortcut' },
  { key: 'help', label: 'Help', noun: 'entry' },
]

export const isInventoryList = (s: string): s is InventoryList => INVENTORY_LISTS.some((l) => l.key === s)

/**
 * An Inventory sub-address: the list, and what follows a slash (the role a home preview shows:
 * `#dev.inventory:homes/finance`). An unknown list reads as Views.
 */
export function parseInventorySub(sub: string): { list: InventoryList; arg: string } {
  const at = sub.indexOf('/')
  const head = at < 0 ? sub : sub.slice(0, at)
  const arg = at < 0 ? '' : sub.slice(at + 1)
  return isInventoryList(head) ? { list: head, arg } : { list: 'views', arg: '' }
}

/** The sub-address of a list, and of a role home preview on the Role homes list. */
export const inventorySub = (list: InventoryList, arg?: string | null): string =>
  arg ? `${list}/${arg}` : list

export interface InventoryTable {
  columns: Column[]
  rows: Row[]
}

/* ───────────── the decision in each mode ───────────── */

export const ACCESS_WORD: Record<Access, string> = { shown: 'Shown', limited: 'Limited', hidden: 'Hidden' }

/** Each mode's column head: the name people use, short enough for eleven columns side by side. */
export const MODE_COLUMN_LABEL: Readonly<Record<Mode, string>> = {
  developer: 'Developer',
  hr: 'HR',
  chro: 'CHRO',
  'hrbp-unit': 'HRBP unit',
  'hrbp-region': 'HRBP region',
  compensation: 'Comp',
  'talent-management': 'Talent',
  'hr-ops': 'HR ops',
  recruiter: 'Recruiter',
  finance: 'Finance',
  manager: 'Manager',
}

/** A column per mode in the matrix's order (Developer, HR, CHRO … Manager), then how it is limited. */
export const ACCESS_COLUMNS: Column[] = [
  ...MATRIX_MODES.map((m) => ({ key: m, label: MODE_COLUMN_LABEL[m], width: 9 })),
  { key: 'how', label: 'How it is limited', width: 48 },
]

/**
 * How the modes that limit or hide a surface do it, one sentence per group of modes that say the
 * same thing, in the matrix's order: "HR, CHRO: Developer mode only. Manager: Outside the org."
 */
export function howByMode(
  decisions: Readonly<Partial<Record<Mode, Pick<Decision, 'access' | 'how'>>>>,
  modes: readonly Mode[] = MATRIX_MODES,
): string {
  const groups = new Map<string, Mode[]>()
  for (const m of modes) {
    const d = decisions[m]
    if (!d || m === 'developer' || d.access === 'shown' || !d.how) continue
    const list = groups.get(d.how) ?? []
    list.push(m)
    groups.set(d.how, list)
  }
  return [...groups].map(([how, ms]) => `${ms.map((m) => MODE_COLUMN_LABEL[m]).join(', ')}: ${how}`).join(' ')
}

/** The decision for one surface in each mode, as table cells keyed by mode, and how it is limited. */
export function accessCells(surface: string, at?: At, info?: DecideInfo): Row {
  const decisions = {} as Record<Mode, Decision>
  const row: Row = {}
  for (const m of MATRIX_MODES) {
    decisions[m] = decide(m, surface, at, info)
    row[m] = ACCESS_WORD[decisions[m].access]
  }
  row.how = howByMode(decisions)
  return row
}

/** A route's decision in each mode: hidden where the mode redirects it, else its view or tab's decision. */
export function routeCells(view: string, tab: string, surface: string): Row {
  const row = accessCells(surface)
  for (const m of MATRIX_MODES)
    if (!routeShown(m, view, tab)) {
      row[m] = ACCESS_WORD.hidden
      if (!row.how) row.how = 'Opens the mode’s home instead.'
    }
  return row
}

const yes = (b: boolean) => (b ? 'Yes' : 'No')

/* ───────────── views and tabs ───────────── */

export function viewRows(views: readonly ViewDef[]): InventoryTable {
  return {
    columns: [
      { key: 'key', label: 'Key', width: 12 },
      { key: 'label', label: 'Label', width: 14 },
      { key: 'route', label: 'Route', width: 14 },
      { key: 'tabs', label: 'Tabs', width: 40 },
      { key: 'tabCount', label: 'Tab count', format: 'int' },
      { key: 'datasets', label: 'Datasets', width: 40 },
      { key: 'headline', label: 'Headline' },
      { key: 'summary', label: 'Summary' },
      { key: 'actions', label: 'Actions' },
      { key: 'headerActions', label: 'Header actions' },
      ...ACCESS_COLUMNS,
    ],
    rows: views.map((v) => ({
      key: v.key,
      label: v.label,
      route: `#${v.key}`,
      tabs: v.tabs.map((t) => t.label).join(', '),
      tabCount: v.tabs.length,
      datasets: v.datasets.join(', ') || 'None',
      headline: yes(typeof v.headline === 'function'),
      summary: yes(typeof v.summary === 'function'),
      actions: yes(typeof v.actions === 'function'),
      headerActions: yes(!!v.HeaderActions),
      ...accessCells(`view:${v.key}`),
    })),
  }
}

export function tabRows(views: readonly ViewDef[]): InventoryTable {
  return {
    columns: [
      { key: 'view', label: 'View', width: 12 },
      { key: 'tab', label: 'Tab key', width: 14 },
      { key: 'label', label: 'Label', width: 20 },
      { key: 'route', label: 'Route', width: 22 },
      { key: 'feature', label: 'Feature switch' },
      ...ACCESS_COLUMNS,
    ],
    rows: views.flatMap((v) =>
      v.tabs.map((t) => ({
        view: v.label,
        viewKey: v.key,
        tab: t.key,
        label: t.label,
        route: `#${v.key}.${t.key}`,
        feature: t.feature ?? '',
        ...accessCells(`tab:${v.key}.${t.key}`),
      })),
    ),
  }
}

/* ───────────── role homes ───────────── */

const SCOPE_WORDS: Readonly<Record<Mode, string>> = {
  hr: 'Whole company',
  chro: 'Whole company',
  'hrbp-unit': 'One business unit',
  'hrbp-region': 'One region',
  compensation: 'Whole company',
  'talent-management': 'Whole company',
  recruiter: "One recruiter's reqs",
  'hr-ops': 'Whole company',
  finance: 'Whole company, by business unit',
  manager: "One manager's org",
  developer: 'Whole company',
}

const PAY_WORDS: Readonly<Record<PayView, string>> = {
  switch: 'Amounts behind the switch',
  totals: 'Cost totals',
  none: 'Ratios only',
}

const HOME_PAGE: Readonly<Record<string, string>> = {
  home: 'Home',
  scorecard: 'Scorecard',
  team: 'My team',
  dev: 'Developer page',
}

/** What a row of a mode whose home is not the Home view opens. */
const ROW_OPENS: Readonly<Record<string, string>> = {
  scorecard: 'The Scorecard',
  team: 'My team',
  dev: 'This page',
}

/** The figures on a mode's home, by id; null for the Developer page (its Overview is listed elsewhere). */
export function homeFigureCount(mode: Mode): number | null {
  const slug = SLUG_OF[mode]
  if (slug) return HOME_FIGURES[slug].length
  if (HOME_OF[mode] === 'team') return TEAM_FIGURES.length
  if (HOME_OF[mode] === 'scorecard') return SCORECARD_FIGURES.length
  return null
}

/**
 * Every mode's home (docs/ROLES-V2.md 1.1 and 5): the page it opens on, the figures there, the pick
 * it needs and the one it is laid out for here (made on this page, else remembered in this
 * browser), its scope and its pay view. A row of a role with a Home opens its preview on this page.
 */
export function homeRoleRows(input: {
  picks: ModePicks
  managerName?: (id: string) => string | null
}): InventoryTable {
  return {
    columns: [
      { key: 'role', label: 'Role', width: 24 },
      { key: 'home', label: 'Home', width: 14 },
      { key: 'address', label: 'Address', width: 12 },
      { key: 'figures', label: 'Figures on it', format: 'int' },
      { key: 'pick', label: 'Needs a pick', width: 14 },
      { key: 'inUse', label: 'Laid out for', width: 24 },
      { key: 'scope', label: 'Scope', width: 26 },
      { key: 'pay', label: 'Pay', width: 24 },
      { key: 'opens', label: 'A row opens', width: 24 },
    ],
    rows: MODES.map((m) => {
      const kind = PICK_OF[m]
      const home = HOME_OF[m]
      const page = HOME_PAGE[home] ?? home
      return {
        key: m,
        role: MODE_LABEL[m],
        home: page,
        address: `#${home}`,
        figures: homeFigureCount(m),
        pick: kind ? PICK_NOUN[kind] : 'None',
        inUse: kind ? (pickLabel(m, input.picks, input.managerName) ?? 'Not picked yet') : '',
        scope: SCOPE_WORDS[m],
        pay: PAY_WORDS[PAY_OF[m]],
        opens: isHomeRole(m) ? 'A preview of this home' : (ROW_OPENS[home] ?? page),
      }
    }),
  }
}

/* ───────────── figures (from a scan) ───────────── */

export function figureRows(scan: FigureScan | null): InventoryTable {
  return {
    columns: [
      { key: 'id', label: 'Id', width: 30 },
      { key: 'title', label: 'Title', width: 36 },
      { key: 'view', label: 'View', width: 12 },
      { key: 'tab', label: 'Tab', width: 16 },
      { key: 'metric', label: 'Metric', width: 30 },
      { key: 'rows', label: 'Rows', format: 'int' },
      { key: 'tier', label: 'Tier' },
      { key: 'heldBack', label: 'Held back' },
      { key: 'image', label: 'Image' },
      { key: 'uses', label: 'Fields declared', format: 'int' },
      { key: 'laidOutAs', label: 'Laid out as', width: 16 },
      ...ACCESS_COLUMNS,
    ],
    rows: (scan?.figures ?? [])
      .filter((f) => f.kind === 'figure')
      .map((f) => ({
        id: f.id,
        title: f.title,
        view: f.viewLabel,
        viewKey: f.view,
        tab: f.tabLabel,
        tabKey: f.tab,
        as: f.as ?? null,
        laidOutAs: scan ? MODE_LABEL[f.as ?? scan.mode] : '',
        metric: f.metric ?? '',
        rows: f.rows,
        tier: f.tier ? TIER_LABEL[f.tier] : f.gated ? '' : 'Not gated',
        heldBack: yes(f.withheld),
        image: yes(f.image),
        uses: f.uses?.length ?? 0,
        ...accessCells(`figure:${f.id}`, figurePlace(f)),
      })),
  }
}

/* ───────────── metrics ───────────── */

export function metricRows(rows: readonly FormulaRow[], metrics: Pick<MetricsApi, 'def'>): InventoryTable {
  const metricViews = (id: string) => metrics.def(id)?.views
  return {
    columns: [
      { key: 'id', label: 'Id', width: 34 },
      { key: 'name', label: 'Name', width: 28 },
      { key: 'views', label: 'Views', width: 24 },
      { key: 'unit', label: 'Unit', width: 14 },
      { key: 'target', label: 'Target', width: 18 },
      { key: 'good', label: 'Good direction' },
      { key: 'changed', label: 'Changed from default' },
      { key: 'settings', label: 'Settings', width: 30 },
      { key: 'fields', label: 'Fields it reads', width: 40 },
      ...ACCESS_COLUMNS,
    ],
    rows: rows.map((r) => {
      const good = metrics.def(r.id)?.goodDirection
      return {
        id: r.id,
        name: r.name,
        views: r.viewsText,
        unit: r.unit,
        target: r.target ?? '',
        good: good === 'up' ? 'Up' : good === 'down' ? 'Down' : 'Neither',
        changed: r.changed ? (r.changedText ?? 'Yes') : 'No',
        settings: r.settings.map((s) => `${s.label}: ${s.value}`).join('; '),
        fields: r.fields.map((f) => f.ref).join(', '),
        ...accessCells(`metric:${r.id}`, undefined, { metricViews }),
      }
    }),
  }
}

/* ───────────── engine functions ───────────── */

export type EngineFn = 'headline' | 'summary' | 'actions'
export const ENGINE_FNS: readonly EngineFn[] = ['headline', 'summary', 'actions']

/** The functions a view has, as "<view>.<fn>" ids. */
export const engineIds = (views: readonly ViewDef[]): string[] =>
  views.flatMap((v) => ENGINE_FNS.filter((fn) => typeof v[fn] === 'function').map((fn) => `${v.key}.${fn}`))

export function engineRows(
  views: readonly ViewDef[],
  runs: Readonly<Record<string, EngineRun>>,
): InventoryTable {
  return {
    columns: [
      { key: 'view', label: 'View', width: 12 },
      { key: 'fn', label: 'Function', width: 10 },
      { key: 'id', label: 'Id', width: 20 },
      { key: 'ms', label: 'Last ms (warm)', format: 'num1' },
      { key: 'coldMs', label: 'Last ms (cold)', format: 'num1' },
      { key: 'returned', label: 'Returned', width: 24 },
      { key: 'error', label: 'Error', width: 30 },
      ...ACCESS_COLUMNS,
    ],
    rows: views.flatMap((v) =>
      ENGINE_FNS.filter((fn) => typeof v[fn] === 'function').map((fn) => {
        const id = `${v.key}.${fn}`
        const run = runs[id]
        return {
          view: v.label,
          viewKey: v.key,
          fn,
          id,
          ms: run ? run.ms : null,
          coldMs: run?.coldMs ?? null,
          returned: run?.returned ?? '',
          error: run?.error ?? '',
          ...accessCells(`view:${v.key}`),
        }
      }),
    ),
  }
}

/* ───────────── Ask tools ───────────── */

export function askToolRows(tools: readonly BetaTool[]): InventoryTable {
  return {
    columns: [
      { key: 'name', label: 'Name', width: 16 },
      { key: 'description', label: 'Description', width: 60 },
      { key: 'inputs', label: 'Inputs', width: 30 },
      { key: 'schema', label: 'Input schema', width: 60, only: 'sheets' },
      ...ACCESS_COLUMNS,
    ],
    rows: tools.map((t) => {
      const props = (t.input_schema?.properties ?? {}) as Record<string, unknown>
      return {
        name: t.name,
        description: t.description ?? '',
        inputs: Object.keys(props).join(', ') || 'None',
        schema: JSON.stringify(t.input_schema),
        ...accessCells(`ask:${t.name}`),
      }
    }),
  }
}

/* ───────────── drill kinds ───────────── */

export function drillRows(
  kinds: readonly DrillKind[],
  facts: (k: DrillKind) => { columns: readonly Column[]; noun: readonly [string, string]; rowOpens: string },
  datasetOf: (k: DrillKind) => DatasetKey,
): InventoryTable {
  return {
    columns: [
      { key: 'kind', label: 'Kind', width: 16 },
      { key: 'dataset', label: 'Dataset', width: 16 },
      { key: 'noun', label: 'A row is', width: 14 },
      { key: 'columns', label: 'Standard columns', width: 60 },
      { key: 'rowOpens', label: 'What a row opens', width: 40 },
      ...ACCESS_COLUMNS,
    ],
    rows: kinds.map((k) => {
      const f = facts(k)
      return {
        kind: k,
        dataset: datasetOf(k),
        noun: f.noun[0],
        columns: f.columns.map((c) => c.label).join(', '),
        rowOpens: f.rowOpens || 'Nothing',
        ...accessCells(`drill:${k}`),
      }
    }),
  }
}

/* ───────────── datasets and fields ───────────── */

export function datasetFieldRows(args: {
  datasets?: readonly DatasetDef[]
  /** Field names Ask may read, by dataset (`QUERY_DATASETS`). */
  askFields: (key: DatasetKey) => readonly string[]
  quality: Pick<QualityIndex, 'fieldStats'> | null
}): InventoryTable {
  const defs = args.datasets ?? DATASETS
  return {
    columns: [
      { key: 'dataset', label: 'Dataset', width: 16 },
      { key: 'field', label: 'Field', width: 22 },
      { key: 'label', label: 'Label', width: 24 },
      { key: 'type', label: 'Type' },
      { key: 'need', label: 'Required or recommended' },
      { key: 'pay', label: 'Pay amount' },
      { key: 'ask', label: 'Ask allowlisted' },
      { key: 'tier', label: 'Tier' },
      { key: 'coverage', label: 'Coverage', format: 'pct' },
      ...ACCESS_COLUMNS,
    ],
    rows: defs.flatMap((d) => {
      const ask = new Set(args.askFields(d.key))
      return d.fields.map((f) => {
        const ref = `${d.key}.${f.key}`
        let tier = ''
        let coverage: number | null = null
        try {
          const st = args.quality?.fieldStats(ref as never)
          if (st) {
            tier = TIER_LABEL[st.tier]
            coverage = st.coverage
          }
        } catch {
          /* a field the index does not know */
        }
        return {
          dataset: d.label,
          datasetKey: d.key,
          field: f.key,
          label: f.label,
          type: f.type,
          need: f.required ? 'Required' : f.recommended ? 'Recommended' : 'Optional',
          pay: yes(!!f.pay),
          ask: yes(ask.has(f.key)),
          tier,
          coverage,
          ...accessCells(`dataset:${d.key}`),
        }
      })
    }),
  }
}

/** How many fields the schema defines (the datasets list's row count). */
export const schemaFieldCount = (defs: readonly DatasetDef[] = DATASETS): number =>
  defs.reduce((n, d) => n + d.fields.length, 0)

/* ───────────── storage keys ───────────── */

export function storageKeyRows(rows: readonly StorageRow[] | null): InventoryTable {
  return {
    columns: [
      { key: 'key', label: 'Key', width: 34 },
      { key: 'where', label: 'Where', width: 14 },
      { key: 'bytes', label: 'Bytes', format: 'int' },
      { key: 'holds', label: 'What it holds', width: 50 },
      { key: 'inFile', label: 'In the settings file' },
    ],
    rows: (rows ?? []).map((r) => ({
      key: r.key,
      where: r.where,
      bytes: r.bytes,
      holds: r.holds,
      inFile: yes(r.inSettingsFile),
    })),
  }
}

/* ───────────── routes ───────────── */

export interface RouteInput {
  views: readonly ViewDef[]
  dataTabs: readonly { key: string; label: string; route: string }[]
  datasetPanels: readonly string[]
  datasetKeys: readonly string[]
}

export function routeRows(input: RouteInput): InventoryTable {
  const rows: Row[] = []
  for (const v of input.views) {
    rows.push({ address: `#${v.key}`, page: v.label, tab: '', ...routeCells(v.key, '', `view:${v.key}`) })
    for (const t of v.tabs)
      rows.push({
        address: `#${v.key}.${t.key}`,
        page: v.label,
        tab: t.label,
        ...routeCells(v.key, t.key, `tab:${v.key}.${t.key}`),
      })
  }
  rows.push({
    address: '#actions',
    page: 'Action center',
    tab: '',
    ...routeCells('actions', '', 'page:actions'),
  })
  for (const t of input.dataTabs)
    rows.push({
      address: t.route ? `#data.${t.route}` : '#data',
      page: 'Data room',
      tab: t.label,
      ...routeCells('data', t.route, `data:${t.route || t.key}`),
    })
  for (const d of input.datasetKeys)
    for (const p of input.datasetPanels)
      rows.push({
        address: `#data.${d}-${p}`,
        page: 'Data room',
        tab: `Datasets, ${d} ${p} panel`,
        ...routeCells('data', `${d}-${p}`, `data-panel:${p}`),
      })
  rows.push({
    address: '#data.metrics/<view>/<group>/<name>',
    page: 'Data room',
    tab: 'Metric definitions, one metric',
    ...routeCells('data', 'metrics', 'data:metrics'),
  })
  for (const t of DEV_TABS)
    rows.push({
      address: t.key === 'overview' ? '#dev' : `#dev.${t.key}`,
      page: 'Developer',
      tab: t.label,
      ...routeCells('dev', t.key === 'overview' ? '' : t.key, `tab:dev.${t.key}`),
    })
  return {
    columns: [
      { key: 'address', label: 'Address', width: 36 },
      { key: 'page', label: 'Page', width: 14 },
      { key: 'tab', label: 'Tab', width: 30 },
      ...ACCESS_COLUMNS,
    ],
    rows,
  }
}

/** How many routes `routeRows` lists for these inputs. */
export const routeCount = (input: RouteInput): number =>
  input.views.reduce((n, v) => n + 1 + v.tabs.length, 0) +
  1 +
  input.dataTabs.length +
  input.datasetKeys.length * input.datasetPanels.length +
  1 +
  DEV_TABS.length

/* ───────────── settings ───────────── */

export interface SettingFact {
  setting: string
  section: SettingsSection | 'session' | 'mode'
  value: string
  defaultValue: string
  where: string
  inFile: boolean
  /** The access surface that decides it, when not its Settings section ("overlay:figures"). */
  surface?: string
}

export function settingRows(facts: readonly SettingFact[]): InventoryTable {
  return {
    columns: [
      { key: 'setting', label: 'Setting', width: 28 },
      { key: 'section', label: 'Settings section', width: 18 },
      { key: 'value', label: 'Current value', width: 24 },
      { key: 'defaultValue', label: 'Default', width: 18 },
      { key: 'where', label: 'Where it is kept', width: 30 },
      { key: 'inFile', label: 'In the settings file' },
      ...ACCESS_COLUMNS,
    ],
    rows: facts.map((f) => {
      const section =
        f.section === 'session'
          ? 'Session switch'
          : f.section === 'mode'
            ? SECTION_LABEL.mode
            : SECTION_LABEL[f.section]
      const surface = f.surface ?? (f.section === 'session' ? 'settings:privacy' : `settings:${f.section}`)
      const { surface: _surface, ...shown } = f
      return { ...shown, section, inFile: yes(f.inFile), ...accessCells(surface) }
    }),
  }
}

/* ───────────── shortcuts ───────────── */

export function shortcutRows(list: readonly Shortcut[]): InventoryTable {
  return {
    columns: [
      { key: 'keys', label: 'Keys', width: 26 },
      { key: 'where', label: 'Where', width: 28 },
      { key: 'what', label: 'What it does', width: 50 },
      ...ACCESS_COLUMNS,
    ],
    rows: list.map((s) => ({
      keys: s.keys,
      where: s.where,
      what: s.what,
      ...accessCells(`shortcut:${s.surface}`),
    })),
  }
}

/* ───────────── help ───────────── */

export function helpRows(articles: readonly HelpArticle[], tours: readonly Tour[]): InventoryTable {
  return {
    columns: [
      { key: 'kind', label: 'Kind' },
      { key: 'id', label: 'Id', width: 24 },
      { key: 'title', label: 'Title', width: 36 },
      { key: 'group', label: 'Group or length', width: 16 },
      { key: 'route', label: 'Route', width: 18 },
      { key: 'steps', label: 'Steps', format: 'int' },
      ...ACCESS_COLUMNS,
    ],
    rows: [
      ...articles.map((a) => ({
        kind: 'Article',
        id: a.id,
        title: a.title,
        group: a.group,
        route: a.route ? `#${a.route.view}${a.route.tab ? `.${a.route.tab}` : ''}` : '',
        steps: null,
        ...accessCells(`help:article:${a.id}`),
      })),
      ...tours.map((t) => ({
        kind: 'Tour',
        id: t.id,
        title: t.title,
        group: t.length,
        route: t.route ? `#${t.route}` : '',
        steps: t.steps.length,
        ...accessCells(`help:tour:${t.id}`),
      })),
    ],
  }
}

/* ───────────── search ───────────── */

/** Rows whose cells contain every word of the query (case-insensitive). */
export function searchRows(rows: readonly Row[], query: string): Row[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return [...rows]
  return rows.filter((r) => {
    const text = Object.values(r)
      .filter((v) => v != null && typeof v !== 'object')
      .join(' ')
      .toLowerCase()
    return words.every((w) => text.includes(w))
  })
}
