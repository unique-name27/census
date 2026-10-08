/**
 * Building blocks for the six role tables (docs/ROLES-V2.md part 4): every view's tabs in the
 * registry's order, the frame every allowlist mode shares (masthead, page header, settings, tools,
 * help, Ask, filter row, exports, records panel, focus, shortcuts) and the help lists, each limited
 * or hidden decision with its plain sentence. The tables in hrbp.ts, compensation.ts, talent.ts,
 * hrOps.ts, recruiter.ts and finance.ts start from these and name what differs, so every table is
 * still plain data that the Security center can lay overrides on (docs/SECURITY-CENTER.md).
 *
 * The policy never imports the view registry, so the tab lists live here; the matrix test keeps
 * them equal to the registry's. Pure.
 */
import type { DatasetKey } from '@/data/schema'
import type { DrillKind } from '@/drill/types'
import { IMMIGRATION_OF, MODE_NAME, type Mode, PAY_OF } from '../modes'
import { payDecisions } from '../pay'
import { DEV_ONLY } from './developer'
import { type Decision, hidden, limited, type PolicyPlace, type RoleTab, SHOWN } from './types'

/* ───────────── views and tabs ───────────── */

type TabDef = { readonly key: string; readonly label: string }

const t = (key: string, label: string): TabDef => ({ key, label })

/**
 * Every tab of every view, in the registry's order, with the planned ones of this release: Home's
 * one tab and Compensation's Workforce cost (`comp.cost`, after Merit cycle).
 */
export const VIEW_TABS: Readonly<
  Record<Exclude<PolicyPlace, 'actions' | 'data' | 'dev'>, readonly TabDef[]>
> = {
  home: [t('overview', 'Overview')],
  team: [t('overview', 'Overview')],
  scorecard: [t('overview', 'Overview')],
  recruiting: [
    t('overview', 'Overview'),
    t('pipeline', 'Pipeline'),
    t('requisitions', 'Requisitions'),
    t('sources', 'Sources & offers'),
  ],
  onboarding: [t('upcoming', 'Upcoming starts'), t('first90', 'First 90 days'), t('plan', 'Hiring plan')],
  hrbp: [
    t('overview', 'Overview'),
    t('workforce', 'Workforce'),
    t('attrition', 'Attrition'),
    t('movement', 'Movement'),
    t('org', 'Org design'),
    t('analyses', 'Special analyses'),
  ],
  org: [t('chart', 'Chart'), t('sandbox', 'Reorg sandbox')],
  services: [
    t('overview', 'Overview'),
    t('cases', 'Cases'),
    t('transactions', 'HR transactions'),
    t('leave', 'Leave & return'),
    t('levels', 'Service levels'),
  ],
  talent: [
    t('overview', 'Overview'),
    t('performance', 'Performance'),
    t('succession', 'Potential & succession'),
    t('retention', 'Retention risk'),
    t('learning', 'Learning'),
  ],
  comp: [
    t('overview', 'Overview'),
    t('ranges', 'Range position'),
    t('performance', 'Pay for performance'),
    t('market', 'Market'),
    t('cycle', 'Merit cycle'),
    t('cost', 'Workforce cost'),
  ],
  compliance: [
    t('overview', 'Overview'),
    t('work', 'Right to work'),
    t('export', 'Export control'),
    t('deadlines', 'Deadlines'),
  ],
  listening: [
    t('overview', 'Overview'),
    t('candidates', 'Candidates & hiring'),
    t('onboarding', 'Onboarding'),
    t('stay-exit', 'Stay & exit'),
    t('managers', 'Managers'),
    t('services', 'Services & learning'),
    t('engagement', 'Engagement'),
  ],
  ai: [t('agents', 'Agents')],
}

type TabbedPlace = keyof typeof VIEW_TABS

/** Tabs a table names, by view: the decision for each tab that is not plainly shown. */
export type NamedTabs = Partial<Record<TabbedPlace, Readonly<Record<string, Decision>>>>

/**
 * The tab table for a mode: every tab of every view it shows, in order, shown unless `named` says
 * otherwise. A named tab the view does not have throws, so a typo fails at load.
 */
export function tabTable(
  views: Readonly<Record<PolicyPlace, Decision>>,
  named: NamedTabs = {},
): Partial<Record<PolicyPlace, readonly RoleTab[]>> {
  const out: Partial<Record<PolicyPlace, readonly RoleTab[]>> = {}
  for (const [view, defs] of Object.entries(VIEW_TABS) as [TabbedPlace, readonly TabDef[]][]) {
    const given = named[view] ?? {}
    for (const k of Object.keys(given))
      if (!defs.some((d) => d.key === k)) throw new Error(`No tab ${view}.${k}`)
    if (views[view].access === 'hidden') continue
    out[view] = defs.map((d) => ({ key: d.key, label: d.label, decision: given[d.key] ?? SHOWN }))
  }
  return out
}

/** Whether a view and every one of its tabs is shown as in HR mode. */
const fullyShown = (
  views: Readonly<Record<PolicyPlace, Decision>>,
  tabs: Partial<Record<PolicyPlace, readonly RoleTab[]>>,
  view: PolicyPlace,
): boolean => views[view].access === 'shown' && (tabs[view] ?? []).every((x) => x.decision.access === 'shown')

/* ───────────── shared sentences ───────────── */

export const VIEW_NOT_SHOWN = 'Its view is not shown in this mode.'
export const TEAM_HOW = 'My team is the Manager mode home.'
export const DATA_ROOM_HOW = 'The Data room is for the data owners: HR and HR ops.'
export const NO_REORG = 'An exit what-if is a reorg scenario, worked through by HR and the HRBPs.'
export const SKIPPED_STEPS = 'Steps on hidden tabs or controls are skipped.'
/** A view tour with fewer than 3 steps left in a mode is hidden there (the view's article stays). */
export const SHORT_TOUR = hidden(
  "Fewer than 3 of its steps are on what this mode shows; the view's article explains it.",
)
export const ENGAGEMENT_FOLLOWS = 'Follows the saved engagement surveys switch, which is changed in HR mode.'

/** "HRBP mode", "Talent management mode". */
export const modeWords = (mode: Mode): string => `${MODE_NAME[mode]} mode`

/** "Recruiting, Onboarding and People stats". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/* ───────────── help ───────────── */

const START_HERE = [
  'what-census-is',
  'moving-around',
  'reading-a-number',
  'clicking-down',
  'exporting',
  'ask-census',
  'modes',
]
const SUPPORT = ['shortcuts', 'report-problem', 'troubleshooting', 'faq', 'whats-new']
const DATA_ARTICLES = [
  'data-loading',
  'data-mapping',
  'data-categories',
  'data-official-lists',
  'data-tiers',
  'data-certify',
  'data-quality-tab',
  'data-wrong',
]
const PLAIN_PRIVACY = ['privacy-browser', 'privacy-small-groups', 'privacy-sample']
const VIEW_ARTICLES: readonly TabbedPlace[] = [
  'scorecard',
  'recruiting',
  'onboarding',
  'hrbp',
  'org',
  'services',
  'talent',
  'comp',
  'compliance',
  'listening',
  'ai',
]

export interface HelpSpec {
  views: Readonly<Record<PolicyPlace, Decision>>
  tabs: Partial<Record<PolicyPlace, readonly RoleTab[]>>
  /** HR ops: the Data room and its articles and tours. */
  dataOwner: boolean
  /** Which privacy articles the mode shows (the others are hidden, with why). */
  privacy: { pay: boolean; er: boolean; surveys: boolean; immigration: boolean }
  /** Tours to decide otherwise (a view tour with fewer than 3 steps left, say). */
  tours?: Readonly<Record<string, Decision>>
}

const PRIVACY_HOW = {
  pay: 'This mode shows no pay, so the pay rules article is left out.',
  er: 'This mode shows no HR cases, so the employee relations article is left out.',
  surveys: 'This mode shows no survey results, so the survey article is left out.',
  immigration: 'This mode shows no work authorization records, so the immigration article is left out.',
}

/** Help articles (docs/ROLES-V2.md 4.8): Start here and support always, a view's article with its view. */
export function articlesFor(s: HelpSpec): Record<string, Decision> {
  const out: Record<string, Decision> = {}
  for (const id of [...START_HERE, ...SUPPORT, ...PLAIN_PRIVACY]) out[id] = SHOWN
  out['view-home'] = SHOWN
  out['view-team'] = hidden(TEAM_HOW)
  out['view-actions'] = SHOWN
  for (const v of VIEW_ARTICLES)
    out[`view-${v}`] = s.views[v].access === 'hidden' ? hidden(VIEW_NOT_SHOWN) : SHOWN
  for (const id of DATA_ARTICLES)
    out[id] = s.dataOwner
      ? SHOWN
      : hidden('Your data articles are about the Data room, which this mode hides.')
  out['definitions-how'] = s.dataOwner ? SHOWN : limited('Its Data room links read as text.')
  out.glossary = s.dataOwner ? SHOWN : limited('Metrics shown in this mode only.')
  out['privacy-pay'] = s.privacy.pay ? SHOWN : hidden(PRIVACY_HOW.pay)
  out['privacy-er'] = s.privacy.er ? SHOWN : hidden(PRIVACY_HOW.er)
  out['privacy-surveys'] = s.privacy.surveys ? SHOWN : hidden(PRIVACY_HOW.surveys)
  out['privacy-immigration'] = s.privacy.immigration ? SHOWN : hidden(PRIVACY_HOW.immigration)
  out['developer-tools'] = hidden(DEV_ONLY)
  return out
}

/** Tours (4.8): the home tour, the data tours for the data owner, a view's tour with its view. */
export function toursFor(s: HelpSpec): Record<string, Decision> {
  const out: Record<string, Decision> = {
    'home-start': SHOWN,
    // The Home page's own tour (every step is on the role's home).
    'view-home': SHOWN,
    'getting-started': hidden('"Getting started with your home" takes its place.'),
    'manager-start': hidden('The tour for Manager mode.'),
    'view-team': hidden(TEAM_HOW),
    'developer-tools': hidden(DEV_ONLY),
    'view-actions': limited(SKIPPED_STEPS),
  }
  for (const id of ['own-data', 'quality-definitions'])
    out[id] = s.dataOwner ? SHOWN : hidden('Its steps are in the Data room, which this mode hides.')
  for (const v of VIEW_ARTICLES)
    out[`view-${v}`] =
      s.views[v].access === 'hidden'
        ? hidden(VIEW_NOT_SHOWN)
        : fullyShown(s.views, s.tabs, v)
          ? SHOWN
          : limited(SKIPPED_STEPS)
  return { ...out, ...s.tours }
}

/* ───────────── the frame ───────────── */

export interface FrameSpec {
  mode: Mode
  views: Readonly<Record<PolicyPlace, Decision>>
  /**
   * For the scoped modes: the scope in a sentence ("the business unit", "the region", "the
   * recruiter's reqs"), when Ask is off ("the business unit has fewer employees than the anonymity
   * minimum"), and how the Mode button and Settings > Mode read ('Reads "HRBP:" and the business
   * unit.', 'With "Change business unit…".').
   */
  scope?: { words: string; askOff: string; button: string; change: string }
  /** HR ops: the Data room, settings files, Edit definition and the quality explainer. */
  dataOwner?: boolean
}

/** The pay and immigration switches a mode has (part 3.1): both, one or neither. */
function switches(mode: Mode): { pay: boolean; immigration: boolean } {
  return { pay: PAY_OF[mode] === 'switch', immigration: IMMIGRATION_OF[mode] }
}

function payTags(mode: Mode): Decision {
  const { pay, immigration } = switches(mode)
  if (pay && immigration) return SHOWN
  if (pay) return limited('The pay amounts tag only, while the switch is on.')
  if (immigration) return limited('The immigration details tag only, while the switch is on.')
  return hidden('Pay amounts and immigration details are off in this mode.')
}

function privacySection(mode: Mode): Decision {
  const { pay, immigration } = switches(mode)
  if (pay && immigration) return SHOWN
  if (pay) return limited('The pay amounts switch only; immigration details are off in this mode.')
  if (immigration) return limited('The immigration details switch only; pay amounts are off in this mode.')
  return hidden('This mode shows no pay amounts or immigration details, so both switches stay off.')
}

/** Views with data that Ask's summaries cover, in folder-tab order, as words. */
const SUMMARY_VIEWS: readonly [TabbedPlace, string][] = [
  ['scorecard', 'the Scorecard'],
  ['recruiting', 'Recruiting'],
  ['onboarding', 'Onboarding'],
  ['hrbp', 'People stats'],
  ['org', 'Org chart'],
  ['services', 'HR ops'],
  ['talent', 'Talent'],
  ['comp', 'Compensation'],
  ['compliance', 'Compliance'],
  ['listening', 'Listening'],
]

/**
 * Every surface an allowlist mode decides beyond views, tabs, metrics, figures, kinds, datasets
 * and help, with the defaults the unscoped HR practice modes share. Scoped modes get the pin,
 * "inside {scope}" and Ask's small-scope rule; the data owner gets the Data room's tools. Tables
 * spread this and override what differs.
 */
export function frameSurfaces(s: FrameSpec): Record<string, Decision> {
  const name = modeWords(s.mode)
  const sc = s.scope
  const inside = sc ? `inside ${sc.words}` : ''
  const owner = !!s.dataOwner
  const shown = (v: PolicyPlace) => s.views[v].access !== 'hidden'
  const summaries = SUMMARY_VIEWS.filter(([v]) => shown(v)).map(([, w]) => w)
  const { pay, immigration } = switches(s.mode)
  const out: Record<string, Decision> = {
    // Masthead and page frame (4.3)
    'masthead:wordmark': limited('Goes to Home.'),
    'masthead:company': SHOWN,
    'masthead:mode': sc ? limited(sc.button) : SHOWN,
    'masthead:pay-tags': payTags(s.mode),
    'masthead:tools': limited('Lists only the links shown in this mode; hidden when none is left.'),
    'masthead:actions': limited("Counts this mode's Needs attention items."),
    'masthead:data': owner ? SHOWN : hidden(DATA_ROOM_HOW),
    'masthead:dev': hidden(DEV_ONLY),
    'masthead:settings': limited('Lists only the sections shown in this mode.'),
    'masthead:ask': limited(`Answers from what ${name} shows.`),
    'masthead:help': limited('Lists only the articles and tours shown in this mode.'),
    'masthead:skip': SHOWN,
    'header:scope': sc ? limited(`The scope line starts with the pin and names ${sc.words}.`) : SHOWN,
    'header:about': limited("Follows the view's article."),
    'header:agents': shown('ai') ? SHOWN : hidden('AI in HR is not shown in this mode.'),
    'ui:tier-badge': owner ? SHOWN : limited('Glyph, word and hover explanation; not a button.'),
    'ui:edit-definition': owner ? SHOWN : hidden('The metric dictionary is in the Data room.'),
    'ui:error-details': hidden(DEV_ONLY),
    'ui:kpi-delta-company': sc
      ? hidden("A company comparison opens no records: the company's records are not listed.")
      : SHOWN,
    'ui:route-link': limited('A link to a page this mode hides reads as plain text.'),
    'ui:actions-team': hidden(
      sc
        ? `The pin on ${sc.words} replaces the "My team" picker.`
        : 'Needs attention and Waiting on others replace the "My team" picker.',
    ),
    'ui:attention-lists': SHOWN,
    'help:learn-more': limited('Shown when its article is shown in this mode.'),
    // Settings (4.6)
    'settings:mode': sc ? limited(sc.change) : SHOWN,
    'settings:display': SHOWN,
    'settings:data': owner ? SHOWN : hidden('The data standard and reporting date are set by HR and HR ops.'),
    'settings:formulas': owner
      ? SHOWN
      : limited('Metrics of the shown views only, without links to Metric definitions.'),
    'settings:lists': owner ? SHOWN : hidden('The official lists are kept by HR and HR ops.'),
    'settings:privacy': privacySection(s.mode),
    'settings:ask': SHOWN,
    'settings:compensation': hidden('Cycle settings are kept by Total rewards.'),
    'settings:tools': hidden('The related tool links are kept by HR.'),
    'settings:device': owner ? SHOWN : limited('Clear everything only; settings files are hidden.'),
    'settings:device-files': owner
      ? SHOWN
      : hidden('Settings files carry team configuration, kept by HR and HR ops.'),
    // Tools (4.7)
    'tools:pipeline': SHOWN,
    'tools:lattice': SHOWN,
    'tools:toolkit': SHOWN,
    'tools:catalog': SHOWN,
    'tools:edit': hidden('Links are edited in Settings, Related tools, which this mode hides.'),
    // Help (4.8)
    'help:search': limited('Covers the shown articles and the glossary of shown metrics.'),
    'help:shortcuts': SHOWN,
    'help:report': sc ? limited(`Adds the mode line, which names ${sc.words}.`) : SHOWN,
    'help:whats-new': SHOWN,
    'help:links': limited('Links to hidden targets read as plain text.'),
    // Ask (4.9, part 7)
    ask: sc
      ? limited(`Off with a plain reason when ${sc.askOff}.`)
      : limited(`Answers from the views, metrics and datasets ${name} shows.`),
    'ask:get_context': limited(
      sc ? `Scoped to ${sc.words}: ${name} views and datasets only.` : `${name} views and datasets only.`,
    ),
    'ask:find_metrics': limited('Metrics of the shown views after the hide lists.'),
    'ask:view_summary': limited(`Summaries of ${listWords(summaries)}; hidden figures dropped.`),
    'ask:compare_groups': limited(
      sc ? `The views ${name} shows, with groups ${inside}.` : `The views ${name} shows.`,
    ),
    'ask:query_records': limited(
      sc ? `The datasets ${name} reads, ${inside}.` : `The datasets ${name} reads.`,
    ),
    'ask:explain_quality': owner ? SHOWN : hidden('Not sent to Claude, and refused if called.'),
    'ask:open_items': limited(`The items ${name} lists: Needs attention and Waiting on others.`),
    'ask:get_screen': limited(`The views, tabs and figures ${name} shows.`),
    'ask:set_filters': limited(
      sc ? `Through the clamp: the filters stay ${inside}.` : 'Through the same clamp as the filter row.',
    ),
    'ask:reset_filters': limited('Works as Reset does in the filter row.'),
    'ask:open_view': limited(`Only the views and tabs ${name} shows; others are refused with the reason.`),
    'ask:show_figure': limited(`Only the figures ${name} shows.`),
    'ask:open_records': limited(
      sc
        ? `The records panel keeps to ${sc.words} and the kinds ${name} lists.`
        : `The records panel keeps to the kinds ${name} lists.`,
    ),
    'ask:apply_saved_view': limited('Applied through the clamp; a page this mode hides opens Home.'),
    'ask:make_chart': limited(`From the tools and figures ${name} shows.`),
    'ask:console': hidden(DEV_ONLY),
    // Filter row (2.5, 4.10)
    'filter:saved-views': sc
      ? limited(`Every view applies through the pin on ${sc.words}; one whose page is hidden opens Home.`)
      : limited('A view whose page this mode hides opens Home.'),
    'filter:period': SHOWN,
    'filter:leader': SHOWN,
    'filter:exclude': SHOWN,
    'filter:chain': SHOWN,
    'filter:lists': SHOWN,
    'filter:in-scope': SHOWN,
    'filter:standard': SHOWN,
    'filter:lens': SHOWN,
    'filter:chips': SHOWN,
    'filter:reset': SHOWN,
    // Exports (4.11)
    'export:figure': limited(
      owner
        ? 'Shown figures only, with columns per the pay rules.'
        : 'Shown figures only, with columns per the pay rules; no Edit definition.',
    ),
    'export:view': limited(
      sc
        ? `Shown tabs and figures only, with a line naming ${name} and ${sc.words}.`
        : `Shown tabs and figures only, with a line naming ${name}.`,
    ),
    'export:link': SHOWN,
    'export:monthly-report': SHOWN,
    'export:org-slide': SHOWN,
    'export:reorg': hidden('The Reorg sandbox is not shown in this mode.'),
    'export:talking-points': hidden('Written for an HRBP to use with a leader.'),
    'export:action-list': SHOWN,
    'export:records': sc ? limited('The rows the panel lists.') : SHOWN,
    'export:drill-spec': hidden(DEV_ONLY),
    'export:ask': SHOWN,
    'export:data-room': owner ? SHOWN : hidden('The Data room is not shown in this mode.'),
    'export:formulas': owner ? SHOWN : limited('The shown metrics only.'),
    // Records panel and person card (4.12)
    'person:inside-org': SHOWN,
    'person:outside-org': sc
      ? limited(`Name, title, department and "Outside ${sc.words}" only, with no actions.`)
      : SHOWN,
    'person:compa-ratio': hidden('Compensation is not part of this mode.'),
    'person:open-cases': hidden('HR ops cases are not part of this mode.'),
    'person:chain-links': SHOWN,
    'person:focus': sc ? limited(`For people ${inside}.`) : SHOWN,
    'person:org-chart': sc ? limited(`For people ${inside}.`) : SHOWN,
    'person:row-open': sc ? limited(`Rows open only people ${inside}.`) : SHOWN,
    'person:ratings': SHOWN,
    // Filter to, findings, Focus on (2.3)
    'focus:filter-to': sc ? limited(`Offered only when the result stays ${inside}.`) : SHOWN,
    'focus:leave-out': sc ? limited(`Offered only when the result stays ${inside}.`) : SHOWN,
    'focus:leave-out-leader': sc ? limited(`Offered only when the result stays ${inside}.`) : SHOWN,
    'focus:finding': sc ? limited(`Offered only when the result stays ${inside}.`) : SHOWN,
    // Shortcuts
    'shortcut:help': SHOWN,
    'shortcut:ask': sc ? limited('The sheet explains when Ask is off.') : SHOWN,
    'shortcut:keys': SHOWN,
    'shortcut:tabs': limited('Arrows move over the shown tabs only.'),
    'shortcut:org': shown('org')
      ? sc
        ? limited(`Search finds people ${inside}.`)
        : SHOWN
      : hidden('The Org chart is not shown in this mode.'),
    'shortcut:tour': SHOWN,
    'shortcut:dev-overlays': hidden(DEV_ONLY),
    // Org chart
    'org:simulate-exit': hidden(NO_REORG),
    // Pay (3.1): from the mode's pay view.
    ...payDecisions(s.mode),
  }
  // A view's header actions (4.3). A view the mode hides takes its view's sentence by default.
  if (shown('hrbp'))
    out['header:hrbp'] = hidden('Copy talking points is written for an HRBP to use with a leader.')
  if (shown('comp') && !pay)
    out['header:comp'] = hidden('The pay switch and Cycle settings are for modes that show pay amounts.')
  if (shown('compliance') && !immigration)
    out['header:compliance'] = hidden('The immigration details switch is hidden and off in this mode.')
  if (shown('ai')) out['header:ai'] = hidden('Adding, importing, exporting and resetting agents are for HR.')
  return out
}

/** The four Special analyses in their addresses (docs/ANALYSES.md 1.7), decided per mode. */
export type AnalysisDecisions = Readonly<Record<'quality' | 'declines' | 'stages' | 'pyramid', Decision>>

export const analysesSurfaces = (d: AnalysisDecisions): Record<string, Decision> => ({
  'tab:hrbp.analyses:quality': d.quality,
  'tab:hrbp.analyses:declines': d.declines,
  'tab:hrbp.analyses:stages': d.stages,
  'tab:hrbp.analyses:pyramid': d.pyramid,
})

/* ───────────── kinds and datasets ───────────── */

/** Every drill kind (src/drill/records.ts `DRILL_KINDS`; the matrix test keeps them equal). */
export const ALL_DRILL_KINDS: readonly DrillKind[] = [
  'employees',
  'jobChanges',
  'requisitions',
  'candidates',
  'cases',
  'transactions',
  'reviews',
  'succession',
  'learning',
  'comp',
  'hiringPlan',
  'onboardingTasks',
  'rightToWork',
  'surveyResponses',
  'surveyItems',
  'budget',
  'surveyGroups',
  'leaveGroups',
  'actionItems',
  'actionOwners',
]

/** Every dataset (`DATASET_KEYS`; the matrix test keeps them equal). */
export const ALL_DATASETS: readonly DatasetKey[] = [
  'employees',
  'jobChanges',
  'requisitions',
  'candidates',
  'cases',
  'transactions',
  'reviews',
  'succession',
  'learning',
  'comp',
  'hiringPlan',
  'onboardingTasks',
  'rightToWork',
  'surveyResponses',
  'surveyItems',
  'budget',
]

/* ───────────── metrics of Listening's tabs ───────────── */

/**
 * The metrics each Listening tab shows (src/views/listening/metrics.ts): its own prefix and the
 * headline scores of the surveys on it. A mode that hides a tab hides these, so a survey number
 * never shows outside the tab that explains it (docs/ROLES-V2.md 4.2).
 */
const LISTENING_TAB_METRICS: Readonly<Record<string, { prefixes: string[]; ids: string[] }>> = {
  candidates: {
    prefixes: ['listening.candidates.'],
    ids: ['listening.score.candidateExperience', 'listening.score.hiringManager'],
  },
  onboarding: {
    prefixes: ['listening.onboarding.'],
    ids: ['listening.score.onboardingDay30', 'listening.score.onboardingDay90'],
  },
  'stay-exit': {
    prefixes: ['listening.stay.', 'listening.exit.'],
    ids: ['listening.score.stayInterview', 'listening.score.exitSurvey'],
  },
  managers: { prefixes: ['listening.managers.'], ids: ['listening.score.managerFeedback'] },
  services: {
    prefixes: ['listening.services.'],
    ids: ['listening.score.hrService', 'listening.score.returnToWork', 'listening.score.training'],
  },
  engagement: { prefixes: ['listening.engagement.'], ids: ['listening.score.engagement'] },
}

/** The metric prefixes and ids of the Listening tabs a mode hides. */
export function listeningHides(tabs: readonly string[]): { prefixes: string[]; ids: string[] } {
  const prefixes: string[] = []
  const ids: string[] = []
  for (const tab of tabs) {
    const m = LISTENING_TAB_METRICS[tab]
    if (!m) throw new Error(`No Listening tab ${tab}`)
    prefixes.push(...m.prefixes)
    ids.push(...m.ids)
  }
  return { prefixes, ids }
}
