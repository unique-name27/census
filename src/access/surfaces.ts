/**
 * Surface ids: every thing a mode can show, limit or hide has one (docs/ROLES.md, 6.2; ROLES-V2 8.1). They are
 * plain strings with a kind before the first colon ("view:hrbp", "tab:talent.retention",
 * "figure:hrbp-exit-survey", "metric:talent.retention.flightRisk"), branded so a typo'd literal
 * does not pass where a surface is expected. Build them with `S`. Pure.
 */
import type { DatasetKey, ViewKey } from '@/data/schema'
import type { SettingsSection } from '@/data/settings'
import type { DrillKind } from '@/drill/types'

export type SurfaceId = string & { readonly __surface: true }

/** Make a surface id from its text (for ids that come from data: the inventory, a test). */
export const surface = (id: string): SurfaceId => id as SurfaceId

/** The kind of a surface: the part before the first colon ("view", "help", "ask"). */
export const kindOf = (s: string): string => {
  const i = s.indexOf(':')
  return i < 0 ? s : s.slice(0, i)
}

/** The rest after the kind: "view:hrbp" → "hrbp". */
export const restOf = (s: string): string => {
  const i = s.indexOf(':')
  return i < 0 ? '' : s.slice(i + 1)
}

/** Pages reached from the masthead rather than a folder tab. */
export type PageKey = 'data' | 'actions' | 'dev'

/** Controls in the masthead and the page frame (docs/ROLES.md, 3.1). */
export type MastheadControl =
  | 'wordmark'
  | 'company'
  | 'mode'
  | 'pay-tags'
  | 'tools'
  | 'actions'
  | 'data'
  | 'dev'
  | 'settings'
  | 'ask'
  | 'help'
  | 'skip'

/** Controls in the filter row (3.10). */
export type FilterControl =
  | 'saved-views'
  | 'period'
  | 'leader'
  | 'exclude'
  | 'chain'
  | 'lists'
  | 'in-scope'
  | 'standard'
  | 'lens'
  | 'chips'
  | 'reset'

/** Exports (3.11). */
export type ExportKind =
  | 'figure'
  | 'view'
  | 'link'
  | 'monthly-report'
  | 'org-slide'
  | 'reorg'
  | 'talking-points'
  | 'action-list'
  | 'records'
  | 'drill-spec'
  | 'ask'
  | 'data-room'
  | 'formulas'

/** Parts of the records panel and the person card (3.12, 3.13; ROLES-V2 4.12). */
export type PersonPart =
  | 'inside-org'
  | 'outside-org'
  | 'compa-ratio'
  | 'open-cases'
  | 'chain-links'
  | 'focus'
  | 'org-chart'
  | 'row-open'
  /** Ratings and potential on the person card and the org chart's details panel. */
  | 'ratings'

/** Pay (docs/ROLES-V2.md 3.1): the "Show pay amounts" switch, one person's amounts, cost totals over groups. */
export type PayPart = 'switch' | 'amounts' | 'totals'

export type ShortcutKey = 'help' | 'ask' | 'keys' | 'tabs' | 'org' | 'tour' | 'dev-overlays'

export type OverlayKey = 'figures' | 'tours' | 'metrics'

export const S = {
  view: (key: ViewKey | string) => surface(`view:${key}`),
  tab: (view: ViewKey | string, tab: string) => surface(`tab:${view}.${tab}`),
  figure: (id: string) => surface(`figure:${id}`),
  metric: (id: string) => surface(`metric:${id}`),
  /** A KPI tile by its id; `decide` reads its metric from `info.metric`. */
  kpi: (id: string) => surface(`kpi:${id}`),
  page: (page: PageKey) => surface(`page:${page}`),
  /** A Data room tab ("metrics", "quality"). */
  data: (tab: string) => surface(`data:${tab}`),
  /** A dataset panel in the Data room ("raw", "mapping", "quality", "certify"). */
  dataPanel: (panel: string) => surface(`data-panel:${panel}`),
  settings: (section: SettingsSection | string) => surface(`settings:${section}`),
  /** A link in the masthead's Tools menu, or "edit" for Edit links. */
  tool: (id: string) => surface(`tools:${id}`),
  article: (id: string) => surface(`help:article:${id}`),
  tour: (id: string) => surface(`help:tour:${id}`),
  /** Other parts of Help: "search", "report", "shortcuts", "whats-new", "links", "learn-more". */
  help: (part: string) => surface(`help:${part}`),
  /** Ask itself, or one of its tools ("query_records"), or "console". */
  ask: (tool?: string) => surface(tool ? `ask:${tool}` : 'ask'),
  filter: (control: FilterControl) => surface(`filter:${control}`),
  /** A view's header actions ("Copy talking points" on People stats), or "agents", "about", "scope". */
  header: (what: ViewKey | 'agents' | 'about' | 'scope' | string) => surface(`header:${what}`),
  export: (kind: ExportKind) => surface(`export:${kind}`),
  drill: (kind: DrillKind | string) => surface(`drill:${kind}`),
  /** Filter to and Leave out in the records panel, Focus on on findings and person cards. */
  focus: (what: 'filter-to' | 'leave-out' | 'leave-out-leader' | 'finding') => surface(`focus:${what}`),
  dataset: (key: DatasetKey | string) => surface(`dataset:${key}`),
  person: (part: PersonPart) => surface(`person:${part}`),
  masthead: (control: MastheadControl) => surface(`masthead:${control}`),
  shortcut: (key: ShortcutKey) => surface(`shortcut:${key}`),
  overlay: (key: OverlayKey) => surface(`overlay:${key}`),
  /** Org chart controls: "simulate-exit" (the details panel's exit what-if). */
  org: (part: 'simulate-exit') => surface(`org:${part}`),
  /** Action center items whose id starts with this ("onboarding:i9:"). */
  item: (prefix: string) => surface(`item:${prefix}`),
  /** Pay amounts per person, cost totals, or the "Show pay amounts" switch (`payDecisions` per mode). */
  pay: (part: PayPart) => surface(`pay:${part}`),
  /**
   * Other shared parts: "tier-badge", "edit-definition", "kpi-delta-company", "route-link",
   * "error-details", "attention-lists" (the Action center's Needs attention and Waiting on others).
   */
  ui: (part: string) => surface(`ui:${part}`),
} as const
