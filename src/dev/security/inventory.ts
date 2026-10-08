/**
 * What the Security center edits (docs/SECURITY-CENTER.md, "What it controls"): the rows of the
 * access matrix over the same inventory the matrix test snapshots, the dictionary's metrics, the
 * figures a scan saw, and the catalog the loader checks a policy file's surfaces against. Each row
 * belongs to one of the editor's groups. Pure but for reading the registries.
 */
import { type AccessInventory, accessMatrix } from '@/access/matrix'
import type { SurfaceCatalog } from '@/access/overrides'
import { ANALYSIS_PARTS } from '@/access/overrides'
import type { At, DecideInfo } from '@/access/policy'
import { VIEW_TABS } from '@/access/policy/kit'
import { kindOf, restOf } from '@/access/surfaces'
import { DEFAULT_TOOLS } from '@/app/tools'
import { SCREEN_TOOL_NAMES } from '@/ask/engine/screenTools'
import { ALL_TOOL_NAMES } from '@/ask/engine/tools'
import { DATASET_KEYS, DATASETS, VIEW_LABEL } from '@/data/schema'
import { SECTION_LABEL, SETTINGS_SECTIONS } from '@/data/settings'
import { DRILL_KINDS } from '@/drill/records'
import { ARTICLES } from '@/help/articles'
import { TOURS } from '@/help/tours'
import { METRICS } from '@/metrics/catalog'
import { DATA_TABS, DATASET_PANELS } from '@/views/data/links'
import { HOME_FIGURES } from '@/views/home/engine/figures'
import { VIEWS } from '@/views/registry'
import { SCORECARD_FIGURES } from '@/views/scorecard/engine/figures'
import { TEAM_FIGURES } from '@/views/team/engine/figures'
import type { ScannedFigure } from '../scanModel'

/** The editor's groups, in the order the matrix lists them. */
export type GroupKey =
  | 'views'
  | 'tabs'
  | 'figures'
  | 'metrics'
  | 'data'
  | 'pay'
  | 'ask'
  | 'exports'
  | 'pages'
  | 'frame'

export const GROUPS: readonly { key: GroupKey; label: string; hint: string }[] = [
  { key: 'views', label: 'Views', hint: 'Folder tabs and the role homes.' },
  { key: 'tabs', label: 'Tabs', hint: 'Sub-tabs, and each Special analysis.' },
  { key: 'figures', label: 'Figures', hint: 'Charts and tables, found by id, title or metric.' },
  { key: 'metrics', label: 'Metrics', hint: 'Measures in the dictionary, and whole families of them.' },
  { key: 'data', label: 'Data', hint: 'Datasets a role reads, records it opens, the person card.' },
  { key: 'pay', label: 'Pay', hint: 'The pay switch, amounts per person and cost totals.' },
  { key: 'ask', label: 'Ask', hint: 'Ask itself, each data tool, the screen tools and make_chart.' },
  { key: 'exports', label: 'Exports', hint: 'Figure, view and records exports, the monthly report.' },
  { key: 'pages', label: 'Pages and menus', hint: 'Action center, Data room, Settings, Tools and Help.' },
  { key: 'frame', label: 'Other parts', hint: 'Masthead, filter row, view headers and smaller parts.' },
]

/** One editable row. */
export interface EditRow {
  surface: string
  group: GroupKey
  /** "Recruiting, Pipeline", "Time to fill by department". */
  label: string
  /** Muted detail: the id, a metric, the view a figure is on. */
  detail: string
  /** Where it sits, for decisions that depend on its tab (figures). */
  at?: At
  /** For metrics: the views the dictionary lists it on. */
  info?: DecideInfo
}

type Tabbed = keyof typeof VIEW_TABS
const registry = new Map(VIEWS.map((v) => [v.key as string, v]))

/** The views in folder order with the registry's tabs and the planned ones, as the matrix test lists them. */
const inventoryViews = (Object.keys(VIEW_TABS) as Tabbed[]).map((key) => {
  const v = registry.get(key)
  const tabs = (v?.tabs ?? []).map((t) => ({ key: t.key, label: t.label }))
  for (const p of VIEW_TABS[key]) if (!tabs.some((x) => x.key === p.key)) tabs.push({ ...p })
  return { key: key as string, label: v?.label ?? VIEW_LABEL[key as keyof typeof VIEW_LABEL] ?? key, tabs }
})

const homeFigureIds: readonly string[] = [...new Set(Object.values(HOME_FIGURES).flat())]

/** The inventory the access matrix test snapshots. */
export const SECURITY_INVENTORY: AccessInventory = {
  views: inventoryViews,
  dataTabs: DATA_TABS.map((t) => t.route || t.key),
  datasetPanels: DATASET_PANELS,
  settings: SETTINGS_SECTIONS,
  tools: DEFAULT_TOOLS.map((t) => t.id),
  articles: ARTICLES.map((a) => a.id),
  tours: TOURS.map((t) => t.id),
  askTools: ALL_TOOL_NAMES,
  drillKinds: DRILL_KINDS,
  datasets: DATASET_KEYS,
  figures: [
    ...homeFigureIds.map((id) => ({ id, view: 'home', tab: 'overview' })),
    ...TEAM_FIGURES.map((id) => ({ id, view: 'team', tab: 'overview' })),
    ...SCORECARD_FIGURES.map((id) => ({ id, view: 'scorecard', tab: 'overview' })),
  ],
  parts: ANALYSIS_PARTS.map((p) => `hrbp.analyses:${p.key}`),
}

const PAGE_LABEL: Record<string, string> = {
  actions: 'The Action center',
  data: 'The Data room',
  dev: 'The Developer page',
}
const viewLabel = (key: string): string =>
  inventoryViews.find((v) => v.key === key)?.label ?? PAGE_LABEL[key] ?? key
const tabLabel = (view: string, tab: string): string =>
  inventoryViews.find((v) => v.key === view)?.tabs.find((t) => t.key === tab)?.label ?? tab
const articleTitle = new Map(ARTICLES.map((a) => [a.id, a.title]))
const tourTitle = new Map(TOURS.map((t) => [t.id, t.title]))
const metricName = new Map(METRICS.map((m) => [m.id, m.name]))
const metricViews = new Map(METRICS.map((m) => [m.id, m.views as readonly string[]]))
const settingLabel = SECTION_LABEL as Record<string, string>
const toolLabel = new Map(DEFAULT_TOOLS.map((t) => [t.id, t.label]))
const SCREEN_TOOLS = new Set<string>(SCREEN_TOOL_NAMES)
const datasetLabel = new Map<string, string>(DATASETS.map((d) => [d.key, d.label]))
/** The grouped record kinds, which no dataset names. */
const GROUPED_KINDS: Record<string, string> = {
  surveyGroups: 'Survey groups',
  leaveGroups: 'Leave groups',
  actionItems: 'Action items',
  actionOwners: 'Action item owners',
}
const FOCUS_LABEL: Record<string, string> = {
  'filter-to': 'Filter to this',
  'leave-out': 'Leave out',
  'leave-out-leader': 'Leave out a leader',
  finding: 'Focus on from a finding',
}

/** Words for the person card's and records panel's parts. */
const PERSON_LABEL: Record<string, string> = {
  'inside-org': 'Person card',
  'outside-org': 'Person card outside the scope',
  'compa-ratio': 'Compa-ratio on the person card',
  'open-cases': 'Open cases on the person card',
  'chain-links': 'Manager chain links',
  focus: 'Focus on from a person',
  'org-chart': 'Open in the org chart',
  'row-open': 'Open a row',
  ratings: 'Ratings and potential',
}
const PAY_LABEL: Record<string, string> = {
  switch: 'Show pay amounts switch',
  amounts: 'Pay amounts per person',
  totals: 'Cost totals',
}
const EXPORT_LABEL: Record<string, string> = {
  figure: 'Figure exports',
  view: 'Whole-view exports',
  records: 'Records exports',
  'monthly-report': 'Monthly people report',
  link: 'Copy link',
  'org-slide': 'Org slide',
  reorg: 'Reorg scenario export',
  'talking-points': 'Talking points',
  'action-list': 'Action list export',
  'drill-spec': 'Copy drill spec',
  ask: 'Ask answer export',
  'data-room': 'Data room exports',
  formulas: 'Formula list',
}

/** A plain name for a surface, for the editor and the change lists. */
export function surfaceLabel(s: string, figures?: ReadonlyMap<string, ScannedFigure>): string {
  const kind = kindOf(s)
  const rest = restOf(s)
  switch (kind) {
    case 'view':
    case 'page':
      return viewLabel(rest)
    case 'tab': {
      const dot = rest.indexOf('.')
      const view = rest.slice(0, dot)
      const t = rest.slice(dot + 1)
      if (t.includes(':')) {
        const part = t.slice(t.indexOf(':') + 1)
        return `${viewLabel(view)}, ${tabLabel(view, t.split(':')[0])}: ${ANALYSIS_PARTS.find((p) => p.key === part)?.label ?? part}`
      }
      return `${viewLabel(view)}, ${tabLabel(view, t)}`
    }
    case 'figure':
      if (rest.endsWith('*')) return `Figures starting ${rest.slice(0, -1)}`
      return figures?.get(rest)?.title ?? rest
    case 'metric':
      if (rest.endsWith('*')) return `Metrics starting ${rest.slice(0, -1)}`
      return metricName.get(rest) ?? rest
    case 'help':
      if (rest.startsWith('article:'))
        return `Help article: ${articleTitle.get(rest.slice(8)) ?? rest.slice(8)}`
      if (rest.startsWith('tour:')) return `Tour: ${tourTitle.get(rest.slice(5)) ?? rest.slice(5)}`
      return `Help: ${rest}`
    case 'settings':
      return `Settings: ${settingLabel[rest] ?? rest}`
    case 'tools':
      return `Tools: ${toolLabel.get(rest) ?? rest}`
    case 'ask':
      return rest ? `Ask: ${rest}` : 'Ask'
    case 'dataset':
      return `Dataset: ${datasetLabel.get(rest) ?? rest}`
    case 'drill':
      return `Records: ${GROUPED_KINDS[rest] ?? datasetLabel.get(rest) ?? rest}`
    case 'focus':
      return FOCUS_LABEL[rest] ?? s
    case 'data':
      return `Data room: ${rest}`
    case 'data-panel':
      return `Data room panel: ${rest}`
    case 'pay':
      return PAY_LABEL[rest] ?? s
    case 'person':
      return PERSON_LABEL[rest] ?? s
    case 'export':
      return EXPORT_LABEL[rest] ?? s
    case 'item':
      return `Action items starting ${rest}`
    case 'role':
      return rest === 'offered' ? 'Offered in the Mode menu' : 'Opens on'
    default:
      return s
  }
}

/** The group a matrix row belongs to in the editor. */
export function groupOf(surface: string): GroupKey {
  const kind = kindOf(surface)
  switch (kind) {
    case 'view':
      return 'views'
    case 'tab':
      return 'tabs'
    case 'figure':
      return 'figures'
    case 'metric':
      return 'metrics'
    case 'dataset':
    case 'drill':
    case 'person':
    case 'focus':
      return 'data'
    case 'pay':
      return 'pay'
    case 'ask':
      return 'ask'
    case 'export':
      return 'exports'
    case 'page':
    case 'data':
    case 'data-panel':
    case 'settings':
    case 'tools':
    case 'help':
      return 'pages'
    default:
      return 'frame'
  }
}

/** Kinds the editor leaves to Developer > Access: they are fixed (overlays) or not decided per role. */
const NOT_EDITED = new Set(['overlay', 'shortcut'])

/**
 * Every row the editor offers: the matrix rows (with each home figure's place), then the
 * dictionary's metrics and the scanned figures not already listed.
 */
export function editRows(scanned: readonly ScannedFigure[] = []): EditRow[] {
  const figures = new Map(scanned.map((f) => [f.id, f]))
  const at = new Map(
    (SECURITY_INVENTORY.figures ?? []).map((f) => [`figure:${f.id}`, { view: f.view, tab: f.tab }]),
  )
  const out: EditRow[] = []
  const seen = new Set<string>()
  const push = (r: EditRow) => {
    if (seen.has(r.surface)) return
    seen.add(r.surface)
    out.push(r)
  }
  for (const r of accessMatrix(SECURITY_INVENTORY)) {
    if (NOT_EDITED.has(r.kind)) continue
    const kind = kindOf(r.surface)
    const rest = restOf(r.surface)
    const fig = kind === 'figure' ? figures.get(rest) : undefined
    push({
      surface: r.surface,
      group: groupOf(r.surface),
      label: surfaceLabel(r.surface, figures),
      detail:
        kind === 'ask' && SCREEN_TOOLS.has(rest)
          ? `${r.surface} · screen tool`
          : fig
            ? `${r.surface} · ${fig.viewLabel}, ${fig.tabLabel}`
            : r.surface,
      at: fig ? { view: fig.view, tab: fig.tab } : at.get(r.surface),
      info:
        kind === 'metric' && !rest.endsWith('*') ? { metricViews: (id) => metricViews.get(id) } : undefined,
    })
  }
  for (const f of scanned)
    push({
      surface: `figure:${f.id}`,
      group: 'figures',
      label: f.title || f.id,
      detail: [`figure:${f.id}`, `${f.viewLabel}, ${f.tabLabel}`, f.metric].filter(Boolean).join(' · '),
      at: { view: f.view, tab: f.tab },
    })
  for (const m of METRICS)
    push({
      surface: `metric:${m.id}`,
      group: 'metrics',
      label: m.name,
      detail: `metric:${m.id}`,
      info: { metricViews: (id) => metricViews.get(id) },
    })
  return out
}

/** What the loader checks a policy file's surfaces against. */
export function surfaceCatalog(scanned: readonly ScannedFigure[] = []): SurfaceCatalog {
  const rows = accessMatrix(SECURITY_INVENTORY)
  const surfaces = new Set(rows.map((r) => r.surface))
  for (const p of SECURITY_INVENTORY.parts ?? []) surfaces.add(`tab:${p}`)
  return {
    surfaces,
    metrics: new Set(METRICS.map((m) => m.id)),
    figures: new Set([...scanned.map((f) => f.id), ...(SECURITY_INVENTORY.figures ?? []).map((f) => f.id)]),
    views: inventoryViews.map((v) => v.key),
  }
}
