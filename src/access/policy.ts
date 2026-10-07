/**
 * The access policy (docs/ROLES.md, part 3 and 6.2): one pure function answers, for every surface
 * in every mode, shown, limited or hidden, with one plain sentence for limited and hidden.
 *
 *  1. Developer: shown, always.
 *  2. HR: hidden when the surface is developer-only (`DEVELOPER_ONLY`), else shown.
 *  3. Manager: an explicit table, hidden by default. Views and tabs come from `MANAGER_VIEWS` and
 *     `MANAGER_TABS` (every tab of a shown view has an entry; a missing one is hidden). A figure
 *     is hidden when its id is on `MANAGER_HIDDEN_FIGURES`, starts with a hidden view's key, or
 *     sits on a hidden tab; otherwise it takes its tab's decision. A metric is hidden when it
 *     matches `MANAGER_HIDDEN_METRICS` or `MANAGER_HIDDEN_METRIC_PREFIXES`, or none of the views
 *     it is listed on is shown. Every other surface is in `MANAGER_SURFACES` or a kind rule below.
 *
 * Callers ask through `ctx.access.decide` (the context binds the mode), so an off-screen render
 * with an override gets its own answers. The policy never imports the view registry. Pure.
 */

import { VIEW_LABEL, type ViewKey } from '@/data/schema'
import type { Route, RouteView } from '@/data/store'
import { hiddenPageTitle, hiddenTabTitle, openedInstead, openedTabInstead } from './copy'
import { homeOf, type Mode } from './modes'
import { kindOf, restOf, type SurfaceId } from './surfaces'

export type Access = 'shown' | 'limited' | 'hidden'

export interface Decision {
  access: Access
  /** For limited and hidden: one plain sentence, shown in Developer > Access and the snapshot. */
  how?: string
}

/** Where a surface sits: the view (or page) and tab on screen. */
export interface At {
  view: string
  tab?: string
}

/** What `decide` needs beyond the surface for a few kinds. */
export interface DecideInfo {
  /** The views a metric is listed on (`MetricDef.views`); without it only the hide lists apply. */
  metricViews?: (id: string) => readonly string[] | undefined
  /** For `kpi:<id>`: the tile's metric id. */
  metric?: string
}

export const SHOWN: Decision = Object.freeze({ access: 'shown' })
const limited = (how: string): Decision => ({ access: 'limited', how })
const hidden = (how: string): Decision => ({ access: 'hidden', how })

/* ───────────── HR: the developer surfaces ───────────── */

const DEV_ONLY = 'Developer mode only.'

/** Surfaces HR mode hides (Developer shows them; Manager hides them too). */
export const DEVELOPER_ONLY: readonly string[] = [
  'page:dev',
  'masthead:dev',
  'shortcut:dev-overlays',
  'ask:console',
  'export:drill-spec',
  'ui:error-details',
  'view:team',
  'help:article:view-team',
  'help:article:developer-tools',
  'help:tour:view-team',
  'help:tour:manager-start',
  'help:tour:developer-tools',
]
/**
 * Whole kinds of developer surfaces: every debug overlay, the team view's tabs and figures (My team
 * is Manager mode's home; HR mode does not show it), the Developer page's tabs and figures.
 */
export const DEVELOPER_ONLY_PREFIXES: readonly string[] = [
  'overlay:',
  'tab:team.',
  'figure:team-',
  'tab:dev.',
  'figure:dev-',
]

const DEV_SET = new Set(DEVELOPER_ONLY)

export const isDeveloperOnly = (s: string): boolean =>
  DEV_SET.has(s) || DEVELOPER_ONLY_PREFIXES.some((p) => s.startsWith(p))

/** Pages only Developer mode shows; a surface placed on one is hidden in HR. */
const DEV_PAGES = new Set(['team', 'dev'])

/* ───────────── Manager: views and tabs (3.2) ───────────── */

const N_A = 'Its view is not shown in Manager mode.'

export const MANAGER_VIEWS: Readonly<Record<ViewKey, Decision>> = {
  team: SHOWN,
  scorecard: hidden('It judges the whole people function, including pay, HR ops and compliance.'),
  recruiting: limited('Sources & offers, recruiter load and hiring manager satisfaction are hidden.'),
  onboarding: limited('The hiring plan and I-9 measures are hidden.'),
  hrbp: limited('Survey numbers and Copy talking points are hidden.'),
  org: limited('Rooted at the manager; the Reorg sandbox is hidden.'),
  services: hidden('Cases, transactions and leave are HR ops records.'),
  talent: limited('Retention risk and key talent at risk are hidden.'),
  comp: hidden('Compensation stays with total rewards and HR.'),
  compliance: hidden('Compliance records stay with HR.'),
  listening: hidden('Survey results stay with HR.'),
  ai: hidden('The agent catalog is for the HR team.'),
}

/** One tab of a shown view: its key, its label (for the redirect toast) and Manager mode's decision. */
export interface ManagerTab {
  key: string
  label: string
  decision: Decision
}

const tab = (key: string, label: string, decision: Decision = SHOWN): ManagerTab => ({ key, label, decision })

/** Every tab of every view Manager mode shows, in tab order. A tab missing here is hidden. */
export const MANAGER_TABS: Readonly<Partial<Record<ViewKey, readonly ManagerTab[]>>> = {
  team: [tab('overview', 'Overview')],
  recruiting: [
    tab('overview', 'Overview', limited('The "Hires vs plan" tile is hidden.')),
    tab('pipeline', 'Pipeline'),
    tab(
      'requisitions',
      'Requisitions',
      limited('Recruiter load and hiring manager satisfaction are hidden.'),
    ),
    tab('sources', 'Sources & offers', hidden("Sourcing analytics are TA's.")),
  ],
  onboarding: [
    tab('upcoming', 'Upcoming starts'),
    tab(
      'first90',
      'First 90 days',
      limited('I-9 Section 2 on time, new hires entered by day -3 and the day-30 pulse are hidden.'),
    ),
    tab('plan', 'Hiring plan', hidden('Plan versions are a finance and TA artifact.')),
  ],
  hrbp: [
    tab('overview', 'Overview'),
    tab('workforce', 'Workforce'),
    tab('attrition', 'Attrition', limited('The exit survey number is hidden.')),
    tab('movement', 'Movement'),
    tab('org', 'Org design', limited('Manager feedback (a survey) is hidden.')),
  ],
  org: [
    tab('chart', 'Chart', limited('Rooted at the manager, with nothing above them.')),
    tab('sandbox', 'Reorg sandbox', hidden('Reorg scenarios are worked through with the HRBP.')),
  ],
  talent: [
    tab('overview', 'Overview', limited('The key talent at risk tile, table and finding are hidden.')),
    tab('performance', 'Performance'),
    tab(
      'succession',
      'Potential & succession',
      limited('Successors outside the org show by readiness only.'),
    ),
    tab('retention', 'Retention risk', hidden('Flight-risk scores about named people stay with HR.')),
    tab('learning', 'Learning', limited('Training evaluation (a survey) is hidden.')),
  ],
}

/** The first tab of a view that Manager mode shows (null when the view is hidden). */
export function firstManagerTab(view: string): ManagerTab | null {
  return MANAGER_TABS[view as ViewKey]?.find((t) => t.decision.access !== 'hidden') ?? null
}

/* ───────────── Manager: hide lists inside the shown views (3.3) ───────────── */

/**
 * Metric prefixes Manager mode hides (a test keeps every prefix matching the catalog). The Data
 * room's own `data.` metrics are hidden with its page; a metric listed only on a hidden view is
 * hidden anyway.
 */
export const MANAGER_HIDDEN_METRIC_PREFIXES: readonly string[] = [
  'scorecard.',
  'services.',
  'comp.',
  'compliance.',
  'listening.',
  'ai.',
  'onboarding.plan.',
  'recruiting.sources.',
  // The Reorg sandbox's measures (its tab and Simulate exit are hidden).
  'org.scenario.',
]

export const MANAGER_HIDDEN_METRICS: readonly string[] = [
  'onboarding.first90.i9Section2',
  'onboarding.first90.newHireEntered',
  'onboarding.first90.pulseReady',
  'recruiting.recruiters.load',
  'recruiting.offers.declineReasons',
  'recruiting.offers.acceptanceByLocation',
  'recruiting.data.reqMatch',
  'talent.retention.flightRisk',
  'talent.retention.keyTalent',
  'talent.retention.riskBands',
  'talent.retention.backTest',
  'talent.retention.riskDrivers',
  'talent.finding.keyTalent',
  // Compares managers with each other (Talent > Performance, calibration).
  'talent.performance.byReviewer',
]

/** Belt and braces for figures that also carry a hidden metric. */
export const MANAGER_HIDDEN_FIGURES: readonly string[] = [
  'recruiting-recruiter-load',
  'recruiting-candidate-survey',
  'recruiting-hiring-manager-survey',
  'onboarding-new-hire-entered',
  'onboarding-pulse',
  'hrbp-exit-survey',
  'hrbp-manager-feedback',
  'talent-key-talent-top',
  'talent-key-talent-at-risk',
  'talent-stay-interviews',
  'talent-training-evaluation',
  'talent-rating-by-manager',
  // Recruiting performance and the First 90 days task analysis are HR's (docs/CHARTS.md).
  'recruiting-time-to-fill-quarter',
  'onboarding-late-tasks-by-region',
  'onboarding-task-timing',
]

/** Drill kinds whose records Manager mode lists (rows outside the org left out). */
export const MANAGER_DRILL_KINDS: readonly string[] = [
  'employees',
  'jobChanges',
  'requisitions',
  'candidates',
  'reviews',
  'succession',
  'learning',
  'onboardingTasks',
  'actionItems',
  'actionOwners',
]

/** Datasets Manager mode reads (Ask, Inventory, provenance). */
export const MANAGER_DATASETS: readonly string[] = [
  'employees',
  'jobChanges',
  'reviews',
  'succession',
  'learning',
  'requisitions',
  'candidates',
  'onboardingTasks',
]

/** Action center items Manager mode leaves out by id (an I-9 item is a Compliance measure). */
export const MANAGER_HIDDEN_ITEM_PREFIXES: readonly string[] = ['onboarding:i9:']

/* ───────────── Manager: help (3.8) ───────────── */

const MANAGER_ARTICLES: Readonly<Record<string, Decision>> = {
  'what-census-is': SHOWN,
  'moving-around': SHOWN,
  'reading-a-number': SHOWN,
  'clicking-down': SHOWN,
  exporting: SHOWN,
  'ask-census': SHOWN,
  modes: SHOWN,
  'view-team': SHOWN,
  'view-recruiting': SHOWN,
  'view-onboarding': SHOWN,
  'view-hrbp': SHOWN,
  'view-org': SHOWN,
  'view-talent': SHOWN,
  'view-actions': SHOWN,
  'definitions-how': limited('Its Data room links read as text.'),
  glossary: limited('Metrics shown in this mode only.'),
  'privacy-browser': SHOWN,
  'privacy-small-groups': SHOWN,
  'privacy-sample': SHOWN,
  shortcuts: SHOWN,
  'report-problem': SHOWN,
  troubleshooting: SHOWN,
  faq: SHOWN,
  'whats-new': SHOWN,
}

const MANAGER_TOURS: Readonly<Record<string, Decision>> = {
  'manager-start': SHOWN,
  'view-team': SHOWN,
  'view-recruiting': limited('Steps on hidden tabs or controls are skipped.'),
  'view-onboarding': limited('Steps on hidden tabs or controls are skipped.'),
  'view-hrbp': limited('Steps on hidden tabs or controls are skipped.'),
  'view-org': limited('Steps on hidden tabs or controls are skipped.'),
  'view-talent': limited('Steps on hidden tabs or controls are skipped.'),
  'view-actions': limited('Steps on hidden tabs or controls are skipped.'),
}

/* ───────────── Manager: every other surface (3.1, 3.4 to 3.14) ───────────── */

const ASK_LIMIT = 'Locked to the org: Manager mode views, datasets and leaders only.'

export const MANAGER_SURFACES: Readonly<Record<string, Decision>> = {
  // Masthead and page frame (3.1)
  'masthead:wordmark': limited('Goes to My team.'),
  'masthead:company': SHOWN,
  'masthead:mode': limited('Reads "Manager:" and the manager\'s name.'),
  'masthead:pay-tags': hidden('Pay amounts and immigration details are off in this mode.'),
  'masthead:tools': limited('Lists only the links shown in this mode; hidden when none is left.'),
  'masthead:actions': limited('Counts the items Manager mode lists.'),
  'masthead:data': hidden("The Data room is HR's."),
  'masthead:dev': hidden(DEV_ONLY),
  'masthead:settings': limited('Lists only the sections shown in this mode.'),
  'masthead:ask': limited(ASK_LIMIT),
  'masthead:help': limited('Lists only the articles and tours shown in this mode.'),
  'masthead:skip': SHOWN,
  'header:scope': limited('The scope line starts with the pin and names the org.'),
  'header:about': limited("Follows the view's article."),
  'header:agents': hidden('AI in HR is not shown in this mode.'),
  'header:hrbp': hidden('Copy talking points is written for an HRBP to use with a leader.'),
  'header:scorecard': hidden(N_A),
  'header:comp': hidden(N_A),
  'header:compliance': hidden(N_A),
  'header:ai': hidden(N_A),
  'ui:tier-badge': limited('Glyph, word and hover explanation; not a button.'),
  'ui:edit-definition': hidden('The metric dictionary is in the Data room.'),
  'ui:error-details': hidden(DEV_ONLY),
  'ui:kpi-delta-company': hidden(
    "A company comparison opens no records: the company's records are not listed.",
  ),
  'ui:route-link': limited('A link to a page this mode hides reads as plain text.'),
  'ui:actions-team': limited(
    'The pinned org replaces the "My team" picker; narrowing to a leader inside it works.',
  ),
  'help:learn-more': limited('Shown when its article is shown in this mode.'),
  // Pages (3.4, 3.5)
  'page:actions': limited('Items from the shown views, for the org.'),
  'page:data': hidden("The Data room is HR's."),
  'page:dev': hidden(DEV_ONLY),
  // Settings (3.6)
  'settings:mode': limited('With "Change manager…".'),
  'settings:display': SHOWN,
  'settings:data': hidden("The data standard and reporting date are HR's."),
  'settings:formulas': limited('Metrics of the shown views only, without links to Metric definitions.'),
  'settings:lists': hidden("The official lists are HR's."),
  'settings:privacy': hidden('The views these switches change are hidden; all three are off.'),
  'settings:ask': SHOWN,
  'settings:compensation': hidden(N_A),
  'settings:tools': hidden("The related tool links are HR's."),
  'settings:device': limited('Clear everything only; settings files are hidden.'),
  'settings:device-files': hidden("Team configuration is HR's."),
  // Tools (3.7)
  'tools:pipeline': hidden("The pipeline dashboard is TA's."),
  'tools:lattice': SHOWN,
  'tools:toolkit': SHOWN,
  'tools:catalog': hidden("The process catalog and Atlas links are HR's."),
  'tools:edit': hidden('Links are edited in Settings, Related tools, which this mode hides.'),
  // Help (3.8)
  'help:search': limited('Covers the shown articles and the glossary of shown metrics.'),
  'help:shortcuts': SHOWN,
  'help:report': limited('Adds "Mode: Manager (manager set, name left out)".'),
  'help:whats-new': SHOWN,
  'help:links': limited('Links to hidden targets read as plain text.'),
  // Ask (3.9)
  ask: limited('Off with a plain reason when the org has fewer than the anonymity minimum of employees.'),
  'ask:get_context': limited(ASK_LIMIT),
  'ask:find_metrics': limited('Metrics of the shown views after the hide lists.'),
  'ask:view_summary': limited('Recruiting, Onboarding, People stats and Talent; hidden figures dropped.'),
  'ask:compare_groups': limited('The same views; by leader lists leaders inside the org only.'),
  'ask:query_records': limited('The eight Manager mode datasets only.'),
  'ask:explain_quality': hidden('Not sent to Claude, and refused if called.'),
  'ask:open_items': limited('The items Manager mode lists.'),
  'ask:console': hidden(DEV_ONLY),
  // Filter row (3.10)
  'filter:saved-views': limited(
    'Every view applies through the pin; one whose page is hidden opens My team.',
  ),
  'filter:period': SHOWN,
  'filter:leader': limited('Pinned to the manager; leaders inside the org can be picked.'),
  'filter:exclude': hidden('The leader filter has no Include / Exclude switch in this mode.'),
  'filter:chain': limited('Starts at the manager; nobody above.'),
  'filter:lists': limited('Values and counts from the org.'),
  'filter:in-scope': limited('Counts people in the org.'),
  'filter:standard': limited('Read only: the saved data standard.'),
  'filter:lens': hidden('The quality lens is off in this mode.'),
  'filter:chips': SHOWN,
  'filter:reset': limited("Returns to the manager's whole org and the default period."),
  // Exports (3.11)
  'export:figure': limited('Shown figures only; no Edit definition.'),
  'export:view': limited('Shown tabs and figures only, with a Manager mode line.'),
  'export:link': SHOWN,
  'export:monthly-report': hidden(N_A),
  'export:org-slide': SHOWN,
  'export:reorg': hidden(N_A),
  'export:talking-points': hidden('Written for an HRBP to use with a leader.'),
  'export:action-list': SHOWN,
  'export:records': limited('The rows the panel lists.'),
  'export:drill-spec': hidden(DEV_ONLY),
  'export:ask': SHOWN,
  'export:data-room': hidden("The Data room is HR's."),
  'export:formulas': limited('The shown metrics only.'),
  // Records panel and person card (3.12)
  'person:inside-org': limited('No compa-ratio; open items show overdue required courses only.'),
  'person:outside-org': limited('Name, title, department and "Outside … org" only, with no actions.'),
  'person:compa-ratio': hidden('Compensation is not part of Manager mode.'),
  'person:open-cases': hidden('HR ops cases are not part of Manager mode.'),
  'person:chain-links': limited('Names above the manager read as plain text.'),
  'person:focus': limited('For people inside the org.'),
  'person:org-chart': limited('For people inside the org.'),
  'person:row-open': limited('Rows open only people inside the org.'),
  // Filter to, findings, Focus on (3.13)
  'focus:filter-to': limited('Offered only when the result stays inside the org.'),
  'focus:leave-out': limited('Offered only when the result stays inside the org.'),
  'focus:leave-out-leader': hidden('Leaving out a leader would leave the org.'),
  'focus:finding': limited('Offered only when the result stays inside the org.'),
  // Shortcuts (3.14)
  'shortcut:help': SHOWN,
  'shortcut:ask': limited('The sheet explains when Ask is off.'),
  'shortcut:keys': SHOWN,
  'shortcut:tabs': limited('Arrows move over the shown tabs only.'),
  'shortcut:org': limited('Inside the org.'),
  'shortcut:tour': SHOWN,
  'shortcut:dev-overlays': hidden(DEV_ONLY),
  // Org chart (3.2): an exit what-if is a reorg scenario, and on the manager it is all about people above them.
  'org:simulate-exit': hidden('An exit what-if is a reorg scenario, worked through with the HRBP.'),
  // Action center items
  'item:onboarding:i9:': hidden('An I-9 item is a Compliance measure.'),
}

/* ───────────── decide ───────────── */

const METRIC_SET = new Set(MANAGER_HIDDEN_METRICS)
const FIGURE_SET = new Set(MANAGER_HIDDEN_FIGURES)
const DRILL_SET = new Set(MANAGER_DRILL_KINDS)
const DATASET_SET = new Set(MANAGER_DATASETS)

const viewDecision = (key: string): Decision =>
  MANAGER_VIEWS[key as ViewKey] ?? hidden('Not named by the Manager mode policy.')

/** The decision for a page or view key in Manager mode (pages: the Action center, Data room, Developer). */
function managerPlace(view: string): Decision {
  if (view === 'actions' || view === 'data' || view === 'dev') return MANAGER_SURFACES[`page:${view}`]
  return viewDecision(view)
}

/** A tab key without the colon or slash parts some routes carry ("agents:compliance"). */
export const baseTab = (t: string): string => t.split(/[:/]/)[0]

function managerTab(view: string, t: string): Decision {
  const v = managerPlace(view)
  if (v.access === 'hidden') return hidden(N_A)
  const tabs = MANAGER_TABS[view as ViewKey]
  // Pages without a tab table (the Action center) take the page's decision.
  if (!tabs) return v
  if (!t) return tabs[0]?.decision ?? v
  return tabs.find((x) => x.key === baseTab(t))?.decision ?? hidden('Not named by the Manager mode policy.')
}

/** A hidden view's figures start with its key ("comp-…"); so do the Data room's and the Developer page's. */
const HIDDEN_FIGURE_PREFIXES = [
  ...Object.entries(MANAGER_VIEWS)
    .filter(([, d]) => d.access === 'hidden')
    .map(([k]) => `${k}-`),
  'data-',
  'dev-',
]

function managerFigure(id: string, at?: At): Decision {
  if (FIGURE_SET.has(id)) return hidden('On the Manager mode figure list.')
  if (HIDDEN_FIGURE_PREFIXES.some((p) => id.startsWith(p))) return hidden(N_A)
  if (!at) return SHOWN
  const d = at.tab != null ? managerTab(at.view, at.tab) : managerPlace(at.view)
  return d.access === 'hidden' ? hidden('Its tab is not shown in Manager mode.') : d
}

/** Whether a metric id is on the Manager hide lists (by id or prefix). */
export const managerHidesMetricId = (id: string): boolean =>
  METRIC_SET.has(id) || MANAGER_HIDDEN_METRIC_PREFIXES.some((p) => id.startsWith(p))

function managerMetric(id: string, info?: DecideInfo): Decision {
  if (managerHidesMetricId(id)) return hidden('On the Manager mode metric list.')
  const views = info?.metricViews?.(id)
  if (views?.length && !views.some((v) => managerPlace(v).access !== 'hidden'))
    return hidden('None of the views it is on is shown in Manager mode.')
  return SHOWN
}

function decideManager(s: string, at?: At, info?: DecideInfo): Decision {
  const exact = MANAGER_SURFACES[s]
  if (exact) return exact
  const kind = kindOf(s)
  const rest = restOf(s)
  switch (kind) {
    case 'view':
      return viewDecision(rest)
    case 'tab': {
      const dot = rest.indexOf('.')
      return dot < 0 ? managerTab(rest, '') : managerTab(rest.slice(0, dot), rest.slice(dot + 1))
    }
    case 'figure':
      return managerFigure(rest, at)
    case 'metric':
      return managerMetric(rest, info)
    case 'kpi': {
      if (info?.metric) return managerMetric(info.metric, info)
      const place = at ? (at.tab != null ? managerTab(at.view, at.tab) : managerPlace(at.view)) : SHOWN
      return place.access === 'hidden' ? hidden('Its tab is not shown in Manager mode.') : SHOWN
    }
    case 'page':
      return managerPlace(rest)
    case 'data':
    case 'data-panel':
      return hidden('The Data room is not shown in Manager mode.')
    case 'drill':
      return DRILL_SET.has(rest)
        ? limited('Rows about people outside the org are left out.')
        : hidden('These records are not shown in Manager mode.')
    case 'dataset':
      return DATASET_SET.has(rest) ? SHOWN : hidden('Not one of the datasets Manager mode reads.')
    case 'help': {
      if (rest.startsWith('article:'))
        return MANAGER_ARTICLES[rest.slice(8)] ?? hidden('Not shown in Manager mode.')
      if (rest.startsWith('tour:'))
        return MANAGER_TOURS[rest.slice(5)] ?? hidden('Not shown in Manager mode.')
      return hidden('Not named by the Manager mode policy.')
    }
    case 'overlay':
      return hidden(DEV_ONLY)
    case 'item':
      return MANAGER_HIDDEN_ITEM_PREFIXES.some((p) => rest.startsWith(p))
        ? hidden('An I-9 item is a Compliance measure.')
        : SHOWN
    case 'header':
      // A view's own header actions follow the view (the ones Manager mode hides are listed above).
      if (!MANAGER_VIEWS[rest as ViewKey]) return hidden('Not named by the Manager mode policy.')
      return viewDecision(rest).access === 'hidden' ? hidden(N_A) : SHOWN
    default:
      return hidden('Not named by the Manager mode policy.')
  }
}

const NOT_IN_HR = 'HR mode leaves out the developer surfaces and My team.'

function decideHr(s: string, at?: At): Decision {
  if (isDeveloperOnly(s)) return hidden(NOT_IN_HR)
  if (at && DEV_PAGES.has(at.view)) return hidden(NOT_IN_HR)
  return SHOWN
}

/** Shown, limited or hidden: the one answer for a surface in a mode. */
export function decide(mode: Mode, surface: SurfaceId | string, at?: At, info?: DecideInfo): Decision {
  if (mode === 'developer') return SHOWN
  if (mode === 'hr') return decideHr(surface, at)
  return decideManager(surface, at, info)
}

/** Anything but hidden. */
export const can = (mode: Mode, surface: SurfaceId | string, at?: At, info?: DecideInfo): boolean =>
  decide(mode, surface, at, info).access !== 'hidden'

/* ───────────── routes (3.15) ───────────── */

/** Page names for the redirect toast: "The Data room is not shown in Manager mode". */
const PLACE_LABEL: Readonly<Record<string, string>> = {
  data: 'The Data room',
  actions: 'The Action center',
  dev: 'The Developer page',
}

export const placeLabel = (view: string): string =>
  PLACE_LABEL[view] ?? (VIEW_LABEL as Record<string, string>)[view] ?? view

export interface RouteDecision {
  route: Route
  redirected: boolean
  /** For a redirect: the toast's title and description. */
  reason?: { title: string; description: string }
}

/** Whether a route (a view or page, and a tab) is shown in a mode. */
export function routeShown(mode: Mode, view: string, t = ''): boolean {
  if (mode === 'developer') return true
  if (mode === 'hr') return !DEV_PAGES.has(view)
  if (managerPlace(view).access === 'hidden') return false
  if (!t) return true
  // A tab the policy does not name is left for the view to resolve (it opens its first shown tab).
  const named = MANAGER_TABS[view as ViewKey]?.find((x) => x.key === baseTab(t))
  return named?.decision.access !== 'hidden'
}

/**
 * Where a route goes in a mode: unchanged when it is shown; a hidden view or page goes to the
 * mode's home; a hidden tab of a shown view goes to the view's first shown tab. A tab the policy
 * does not know is left for the view to resolve (it opens its first shown tab).
 */
export function routeDecision(mode: Mode, route: Route): RouteDecision {
  const same: RouteDecision = { route, redirected: false }
  if (mode === 'developer') return same
  if (mode === 'hr') {
    if (!DEV_PAGES.has(route.view)) return same
    return {
      route: homeOf('hr'),
      redirected: true,
      reason: { title: hiddenPageTitle(placeLabel(route.view), mode), description: openedInstead(mode) },
    }
  }
  if (managerPlace(route.view).access === 'hidden')
    return {
      route: homeOf('manager'),
      redirected: true,
      reason: { title: hiddenPageTitle(placeLabel(route.view), mode), description: openedInstead(mode) },
    }
  const tabs = MANAGER_TABS[route.view as ViewKey]
  const named = route.tab ? tabs?.find((x) => x.key === baseTab(route.tab)) : undefined
  if (named?.decision.access !== 'hidden') return same
  const first = firstManagerTab(route.view)
  return {
    route: { view: route.view as RouteView, tab: first?.key ?? '' },
    redirected: true,
    reason: {
      title: hiddenTabTitle(placeLabel(route.view), named.label, mode),
      description: openedTabInstead(first?.label ?? placeLabel(route.view)),
    },
  }
}
