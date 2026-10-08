/**
 * The access matrix (docs/ROLES-V2.md 8.3; docs/ROLES.md 3 and 6.8): every surface with its
 * decision in each of the eleven modes, built from an inventory the caller passes (the policy never
 * imports the view registry). The matrix test renders it as two text files and compares them with
 * snapshots, so every change to who sees what shows in review:
 *
 *  - `matrixText`: a one-letter grid, surface then Dev, HR, CHRO, BU, Rgn, Comp, Tal, Rec, Ops,
 *    Fin, Mgr, each S (shown), L (limited) or H (hidden);
 *  - `howText`: for every limited or hidden decision, one line per mode: surface, mode, decision, how.
 *
 * Developer > Access shows the same rows. Pure.
 */
import { MODES, type Mode } from './modes'
import {
  type Access,
  DEVELOPER_ONLY,
  type Decision,
  decide,
  MANAGER_HIDDEN_FIGURE_PREFIXES,
  MANAGER_HIDDEN_FIGURES,
  MANAGER_HIDDEN_ITEM_PREFIXES,
  MANAGER_HIDDEN_METRIC_PREFIXES,
  MANAGER_HIDDEN_METRICS,
  MANAGER_SURFACES,
  ROLE_POLICY,
} from './policy'
import type {
  ExportKind,
  FilterControl,
  MastheadControl,
  OverlayKey,
  PayPart,
  PersonPart,
  ShortcutKey,
} from './surfaces'

/** The views (folder tabs, My team and Home) with their tabs, as the registry lists them. */
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
   * Figures to list with the page and tab they sit on: the role homes' figures (My team, the
   * Scorecard, Home), so the matrix shows each home in each mode.
   */
  figures?: readonly { id: string; view: string; tab?: string }[]
  /** Parts of a tab picked by address (`hrbp.analyses:quality`), listed as `tab:<view>.<tab>:<part>`. */
  parts?: readonly string[]
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
  'ratings',
]
export const PAY_PARTS: readonly PayPart[] = ['switch', 'amounts', 'totals']

/**
 * The matrix's column order: Developer (the baseline), then the Mode menu's order (`MODES`): HR, CHRO,
 * BU, Rgn, Comp, Tal, Rec, Ops, Fin, Mgr. Every list of modes in the Developer page follows it.
 */
export const MATRIX_MODES: readonly Mode[] = ['developer', ...MODES.filter((m) => m !== 'developer')]

/** Each mode's column head in the grid. */
export const MODE_COLUMN: Readonly<Record<Mode, string>> = {
  developer: 'Dev',
  hr: 'HR',
  chro: 'CHRO',
  'hrbp-unit': 'BU',
  'hrbp-region': 'Rgn',
  compensation: 'Comp',
  'talent-management': 'Tal',
  'hr-ops': 'Ops',
  recruiter: 'Rec',
  finance: 'Fin',
  manager: 'Mgr',
}

export interface MatrixRow {
  surface: string
  /** The group the row belongs to: "view", "tab", "masthead", "settings" … */
  kind: string
  /** The decision in every mode. */
  decisions: Readonly<Record<Mode, Decision>>
  /** Shorthands for the three modes Census had first. */
  developer: Decision
  hr: Decision
  manager: Decision
}

/** Every surface of the inventory with its decision in each mode, in a stable order. */
export function accessMatrix(inv: AccessInventory): MatrixRow[] {
  const rows: MatrixRow[] = []
  const seen = new Set<string>()
  const add = (kind: string, surface: string, at?: { view: string; tab?: string }) => {
    if (seen.has(surface)) return
    seen.add(surface)
    const decisions = {} as Record<Mode, Decision>
    for (const m of MODES) decisions[m] = decide(m, surface, at)
    rows.push({
      surface,
      kind,
      decisions,
      developer: decisions.developer,
      hr: decisions.hr,
      manager: decisions.manager,
    })
  }
  const tables = Object.values(ROLE_POLICY)
  for (const v of inv.views) add('view', `view:${v.key}`)
  for (const v of inv.views) for (const t of v.tabs) add('tab', `tab:${v.key}.${t.key}`)
  for (const p of inv.parts ?? []) add('tab', `tab:${p}`)
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
  for (const p of PAY_PARTS) add('pay', `pay:${p}`)
  for (const p of PERSON_PARTS) add('person', `person:${p}`)
  for (const f of ['filter-to', 'leave-out', 'leave-out-leader', 'finding']) add('focus', `focus:${f}`)
  for (const s of inv.shortcuts ?? SHORTCUT_KEYS) add('shortcut', `shortcut:${s}`)
  for (const o of OVERLAY_KEYS) add('overlay', `overlay:${o}`)
  add('ui', 'ui:attention-lists')
  for (const f of MANAGER_HIDDEN_FIGURES) add('figure', `figure:${f}`)
  for (const p of MANAGER_HIDDEN_FIGURE_PREFIXES) add('figure', `figure:${p}*`)
  for (const t of tables) for (const f of t.hiddenFigures) add('figure', `figure:${f}`)
  for (const t of tables) for (const p of t.hiddenFigurePrefixes) add('figure', `figure:${p}*`)
  for (const f of inv.figures ?? []) add('figure', `figure:${f.id}`, { view: f.view, tab: f.tab })
  for (const m of MANAGER_HIDDEN_METRICS) add('metric', `metric:${m}`)
  for (const p of MANAGER_HIDDEN_METRIC_PREFIXES) add('metric', `metric:${p}*`)
  for (const t of tables) for (const m of t.metrics.hide) add('metric', `metric:${m}`)
  for (const t of tables) for (const p of t.metrics.hidePrefixes) add('metric', `metric:${p}*`)
  for (const p of MANAGER_HIDDEN_ITEM_PREFIXES) add('item', `item:${p}`)
  for (const t of tables) for (const p of t.hiddenItemPrefixes) add('item', `item:${p}`)
  for (const t of tables) for (const c of t.hiddenColumns ?? []) add('column', `column:${c}`)
  // Everything else a policy names, so no explicit decision is left out of review.
  for (const s of [...DEVELOPER_ONLY, ...Object.keys(MANAGER_SURFACES)]) add(s.split(':')[0], s)
  for (const t of tables) for (const s of Object.keys(t.surfaces)) add(s.split(':')[0], s)
  return rows
}

const LETTER: Record<Access, string> = { shown: 'S', limited: 'L', hidden: 'H' }
const WORD: Record<Access, string> = { shown: 'Shown', limited: 'Limited', hidden: 'Hidden' }

/** The matrix as a fixed-width one-letter grid: surface, then a column per mode in `MATRIX_MODES` order. */
export function matrixText(rows: readonly MatrixRow[]): string {
  const w = Math.max('Surface'.length, ...rows.map((r) => r.surface.length))
  const widths = MATRIX_MODES.map((m) => MODE_COLUMN[m].length)
  const head = `${'Surface'.padEnd(w)}  ${MATRIX_MODES.map((m, i) => MODE_COLUMN[m].padEnd(widths[i])).join('  ')}`
  const lines = rows.map((r) =>
    `${r.surface.padEnd(w)}  ${MATRIX_MODES.map((m, i) => LETTER[r.decisions[m].access].padEnd(widths[i])).join('  ')}`.trimEnd(),
  )
  return `${[head.trimEnd(), '-'.repeat(head.trimEnd().length), ...lines].join('\n')}\n`
}

/** One line per limited or hidden decision: surface, mode, decision, how (the second snapshot file). */
export function howText(rows: readonly MatrixRow[]): string {
  const lines: string[][] = []
  for (const r of rows)
    for (const m of MATRIX_MODES) {
      const d = r.decisions[m]
      if (d.access !== 'shown') lines.push([r.surface, MODE_COLUMN[m], WORD[d.access], d.how ?? ''])
    }
  const w0 = Math.max('Surface'.length, ...lines.map((l) => l[0].length))
  const w1 = Math.max('Mode'.length, ...lines.map((l) => l[1].length))
  const w2 = 'Decision'.length
  const fmt = (l: readonly string[]) =>
    `${l[0].padEnd(w0)}  ${l[1].padEnd(w1)}  ${l[2].padEnd(w2)}  ${l[3]}`.trimEnd()
  const head = fmt(['Surface', 'Mode', 'Decision', 'How'])
  return `${[head, '-'.repeat(head.length), ...lines.map(fmt)].join('\n')}\n`
}

/** One row's "how": the sentence of each mode that limits or hides it ("HR: … Manager: …"). */
export function howOf(r: MatrixRow): string {
  return MATRIX_MODES.filter((m) => m !== 'developer' && r.decisions[m].how)
    .map((m) => `${MODE_COLUMN[m]}: ${r.decisions[m].how}`)
    .join(' ')
}

/** How many surfaces each mode shows, limits and hides (Developer > Overview, State). */
export function matrixCounts(rows: readonly MatrixRow[]): Record<Mode, Record<Access, number>> {
  const out = {} as Record<Mode, Record<Access, number>>
  for (const m of MODES) out[m] = { shown: 0, limited: 0, hidden: 0 }
  for (const r of rows) for (const m of MODES) out[m][r.decisions[m].access]++
  return out
}
