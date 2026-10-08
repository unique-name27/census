/**
 * The access matrix (docs/ROLES.md, 3 and 6.8): every surface in Developer, HR and Manager order,
 * built from an inventory the caller passes (the policy never imports the view registry). The
 * matrix test renders it as text and compares it with a snapshot, so every change to who sees
 * what shows in review; Developer > Access shows the same rows. Pure.
 */
import type { Mode } from './modes'
import {
  DEVELOPER_ONLY,
  type Decision,
  decide,
  MANAGER_HIDDEN_FIGURE_PREFIXES,
  MANAGER_HIDDEN_FIGURES,
  MANAGER_HIDDEN_ITEM_PREFIXES,
  MANAGER_HIDDEN_METRIC_PREFIXES,
  MANAGER_HIDDEN_METRICS,
  MANAGER_SURFACES,
} from './policy'
import type {
  ExportKind,
  FilterControl,
  MastheadControl,
  OverlayKey,
  PersonPart,
  ShortcutKey,
} from './surfaces'

/** The views (folder tabs and My team) with their tabs, as the registry lists them. */
export interface InventoryView {
  key: string
  label: string
  tabs: readonly { key: string; label: string }[]
}

/** Everything the matrix lists. Lists the caller does not have can be left empty. */
export interface AccessInventory {
  views: readonly InventoryView[]
  /** Data room tabs (`DATA_TABS[].route`) and dataset panels (`DATASET_PANELS`). */
  dataTabs: readonly string[]
  datasetPanels: readonly string[]
  settings: readonly string[]
  tools: readonly string[]
  articles: readonly string[]
  tours: readonly string[]
  askTools: readonly string[]
  drillKinds: readonly string[]
  datasets: readonly string[]
  /** Defaults to every control the surface types name. */
  masthead?: readonly MastheadControl[]
  filters?: readonly FilterControl[]
  exports?: readonly ExportKind[]
  shortcuts?: readonly ShortcutKey[]
  /**
   * Figures to list with the page and tab they sit on: the role home pages' figures (My team and
   * the Scorecard), so the matrix shows each home in each mode.
   */
  figures?: readonly { id: string; view: string; tab?: string }[]
}

export const MASTHEAD_CONTROLS: readonly MastheadControl[] = [
  'wordmark',
  'company',
  'mode',
  'pay-tags',
  'tools',
  'actions',
  'data',
  'dev',
  'settings',
  'ask',
  'help',
  'skip',
]
export const FILTER_CONTROLS: readonly FilterControl[] = [
  'saved-views',
  'period',
  'leader',
  'exclude',
  'chain',
  'lists',
  'in-scope',
  'standard',
  'lens',
  'chips',
  'reset',
]
export const EXPORT_KINDS: readonly ExportKind[] = [
  'figure',
  'view',
  'link',
  'monthly-report',
  'org-slide',
  'reorg',
  'talking-points',
  'action-list',
  'records',
  'drill-spec',
  'ask',
  'data-room',
  'formulas',
]
export const SHORTCUT_KEYS: readonly ShortcutKey[] = [
  'help',
  'ask',
  'keys',
  'tabs',
  'org',
  'tour',
  'dev-overlays',
]
export const OVERLAY_KEYS: readonly OverlayKey[] = ['figures', 'tours', 'metrics']
export const PERSON_PARTS: readonly PersonPart[] = [
  'inside-org',
  'outside-org',
  'compa-ratio',
  'open-cases',
  'chain-links',
  'focus',
  'org-chart',
  'row-open',
]

export interface MatrixRow {
  surface: string
  /** The group the row belongs to: "view", "tab", "masthead", "settings" … */
  kind: string
  developer: Decision
  hr: Decision
  manager: Decision
}

const MODES_ORDER: readonly Mode[] = ['developer', 'hr', 'manager']

/** Every surface of the inventory with its decision in each mode, in a stable order. */
export function accessMatrix(inv: AccessInventory): MatrixRow[] {
  const rows: MatrixRow[] = []
  const seen = new Set<string>()
  const add = (kind: string, surface: string, at?: { view: string; tab?: string }) => {
    if (seen.has(surface)) return
    seen.add(surface)
    const [developer, hr, manager] = MODES_ORDER.map((m) => decide(m, surface, at))
    rows.push({ surface, kind, developer, hr, manager })
  }
  for (const v of inv.views) add('view', `view:${v.key}`)
  for (const v of inv.views) for (const t of v.tabs) add('tab', `tab:${v.key}.${t.key}`)
  for (const p of ['actions', 'data', 'dev']) add('page', `page:${p}`)
  for (const t of inv.dataTabs) add('data', `data:${t}`)
  for (const p of inv.datasetPanels) add('data-panel', `data-panel:${p}`)
  for (const c of inv.masthead ?? MASTHEAD_CONTROLS) add('masthead', `masthead:${c}`)
  for (const v of inv.views) add('header', `header:${v.key}`)
  for (const h of ['scope', 'about', 'agents']) add('header', `header:${h}`)
  for (const s of inv.settings) add('settings', `settings:${s}`)
  add('settings', 'settings:device-files')
  for (const t of inv.tools) add('tools', `tools:${t}`)
  add('tools', 'tools:edit')
  for (const a of inv.articles) add('help', `help:article:${a}`)
  for (const t of inv.tours) add('help', `help:tour:${t}`)
  for (const h of ['search', 'shortcuts', 'report', 'whats-new', 'links', 'learn-more'])
    add('help', `help:${h}`)
  add('ask', 'ask')
  for (const t of inv.askTools) add('ask', `ask:${t}`)
  add('ask', 'ask:console')
  for (const c of inv.filters ?? FILTER_CONTROLS) add('filter', `filter:${c}`)
  for (const e of inv.exports ?? EXPORT_KINDS) add('export', `export:${e}`)
  for (const k of inv.drillKinds) add('drill', `drill:${k}`)
  for (const d of inv.datasets) add('dataset', `dataset:${d}`)
  for (const p of PERSON_PARTS) add('person', `person:${p}`)
  for (const f of ['filter-to', 'leave-out', 'leave-out-leader', 'finding']) add('focus', `focus:${f}`)
  for (const s of inv.shortcuts ?? SHORTCUT_KEYS) add('shortcut', `shortcut:${s}`)
  for (const o of OVERLAY_KEYS) add('overlay', `overlay:${o}`)
  for (const f of MANAGER_HIDDEN_FIGURES) add('figure', `figure:${f}`)
  for (const p of MANAGER_HIDDEN_FIGURE_PREFIXES) add('figure', `figure:${p}*`)
  for (const f of inv.figures ?? []) add('figure', `figure:${f.id}`, { view: f.view, tab: f.tab })
  for (const m of MANAGER_HIDDEN_METRICS) add('metric', `metric:${m}`)
  for (const p of MANAGER_HIDDEN_METRIC_PREFIXES) add('metric', `metric:${p}*`)
  for (const p of MANAGER_HIDDEN_ITEM_PREFIXES) add('item', `item:${p}`)
  // Everything else the policy names, so no explicit decision is left out of review.
  for (const s of [...DEVELOPER_ONLY, ...Object.keys(MANAGER_SURFACES)]) add(s.split(':')[0], s)
  return rows
}

const WORD: Record<Decision['access'], string> = { shown: 'Shown', limited: 'Limited', hidden: 'Hidden' }

/** One row's "how": the sentence of each mode that limits or hides it ("HR: … Manager: …"). */
export function howOf(r: MatrixRow): string {
  return [r.hr.how && `HR: ${r.hr.how}`, r.manager.how && `Manager: ${r.manager.how}`]
    .filter(Boolean)
    .join(' ')
}

/** The matrix as a fixed-width text table: surface, Developer, HR, Manager, how. */
export function matrixText(rows: readonly MatrixRow[]): string {
  const w = Math.max('Surface'.length, ...rows.map((r) => r.surface.length))
  const col = (s: string) => s.padEnd(8)
  const head = `${'Surface'.padEnd(w)}  ${col('Dev')}  ${col('HR')}  ${col('Manager')}  How`
  const lines = rows.map((r) =>
    `${r.surface.padEnd(w)}  ${col(WORD[r.developer.access])}  ${col(WORD[r.hr.access])}  ${col(WORD[r.manager.access])}  ${howOf(r)}`.trimEnd(),
  )
  return `${[head, '-'.repeat(head.length), ...lines].join('\n')}\n`
}

/** How many surfaces each mode shows, limits and hides (Developer > Overview, State). */
export function matrixCounts(rows: readonly MatrixRow[]): Record<Mode, Record<Decision['access'], number>> {
  const zero = () => ({ shown: 0, limited: 0, hidden: 0 })
  const out: Record<Mode, Record<Decision['access'], number>> = {
    developer: zero(),
    hr: zero(),
    manager: zero(),
  }
  for (const r of rows) {
    out.developer[r.developer.access]++
    out.hr[r.hr.access]++
    out.manager[r.manager.access]++
  }
  return out
}
