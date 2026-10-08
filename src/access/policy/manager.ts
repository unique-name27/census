/**
 * Manager mode's table (docs/ROLES.md, part 3), moved unchanged from `policy.ts` into the shape every
 * allowlist mode shares (`RolePolicy`, docs/ROLES-V2.md 8.3). Manager mode is an allowlist: what
 * these tables do not name is hidden. The one addition is the Home view (`home`), hidden: Manager
 * mode keeps My team. Pure data.
 */
import type { DatasetKey, ViewKey } from '@/data/schema'
import type { DrillKind } from '@/drill/types'
import { payDecisions } from '../pay'
import { DEV_ONLY } from './developer'
import { type Decision, hidden, limited, type RolePolicy, type RoleTab, SHOWN } from './types'

/* ───────────── Manager: views and tabs (3.2) ───────────── */

const N_A = 'Its view is not shown in Manager mode.'

export const MANAGER_VIEWS: Readonly<Record<ViewKey, Decision>> = {
  home: hidden('Manager mode opens on My team.'),
  team: SHOWN,
  scorecard: hidden('It judges the whole people function, including pay, HR ops and compliance.'),
  recruiting: limited(
    "Sources & offers, recruiter load, hiring manager satisfaction and candidates' reasons are hidden.",
  ),
  onboarding: limited("The hiring plan, I-9 measures and candidates' reasons for reneging are hidden."),
  hrbp: limited('Survey numbers, regretted exits, exit reasons and Copy talking points are hidden.'),
  org: limited('Rooted at the manager; the Reorg sandbox and regretted exits are hidden.'),
  services: hidden('Cases, transactions and leave are HR ops records.'),
  talent: limited('Retention risk and key talent at risk are hidden.'),
  comp: hidden('Compensation stays with total rewards and HR.'),
  compliance: hidden('Compliance records stay with HR.'),
  listening: hidden('Survey results stay with HR.'),
  ai: hidden('The agent catalog is for the HR team.'),
}

/** One tab of a shown view: its key, its label (for the redirect toast) and Manager mode's decision. */
export type ManagerTab = RoleTab

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
      limited('I-9 Section 2 on time, new hires entered by day −3 and the day-30 pulse are hidden.'),
    ),
    tab('plan', 'Hiring plan', hidden('Plan versions are a finance and TA artifact.')),
  ],
  hrbp: [
    tab('overview', 'Overview'),
    tab('workforce', 'Workforce'),
    tab(
      'attrition',
      'Attrition',
      limited(
        'Why people left, regretted exits, the regretted leavers and the exit survey number are hidden.',
      ),
    ),
    tab('movement', 'Movement'),
    tab('org', 'Org design', limited('Manager feedback (a survey) is hidden.')),
    tab(
      'analyses',
      'Special analyses',
      limited(
        'Quality of hire and Why offers are declined are hidden, and planned hires from the hiring plan are left out of Engineering by stage.',
      ),
    ),
  ],
  org: [
    tab(
      'chart',
      'Chart',
      limited(
        'Rooted at the manager, with nothing above them. The details panel counts exits, not regretted exits.',
      ),
    ),
    tab('sandbox', 'Reorg sandbox', hidden('Reorg scenarios are worked through with the HRBP.')),
  ],
  talent: [
    tab(
      'overview',
      'Overview',
      limited(
        'The key talent at risk tile, table and finding, and regretted exits of high performers, are hidden.',
      ),
    ),
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

/**
 * Parts of a shown tab picked in its address with the colon form (`#hrbp.analyses:quality`) that
 * Manager mode hides, each with the part it opens instead. Their decisions are the
 * `tab:<view>.<tab>:<part>` entries of `MANAGER_SURFACES`.
 */
export const MANAGER_HIDDEN_PARTS: Readonly<
  Record<string, { label: string; instead: string; insteadLabel: string }>
> = {
  'hrbp.analyses:quality': {
    label: 'Quality of hire',
    instead: 'analyses:stages',
    insteadLabel: 'Engineering by stage',
  },
  'hrbp.analyses:declines': {
    label: 'Offer declines',
    instead: 'analyses:stages',
    insteadLabel: 'Engineering by stage',
  },
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
  // People stats special analyses (docs/ANALYSES.md, 1.7): education with first ratings is an HR
  // and TA analysis, and offer analytics are TA's.
  'hrbp.quality.',
  'hrbp.declines.',
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
  // Planned hires come from the hiring plan, a finance and TA artifact.
  'hrbp.stages.planned',
  // Managers see exits, not regretted exits: whether an exit was regretted is HR's call about named
  // leavers (docs/ROLES-V2.md, "Decisions made", 7 and 8 Oct 2026). Their records leave out each
  // leaver's exit reason and regrettable flag (`MANAGER_HIDDEN_COLUMNS`).
  'hrbp.attrition.regretted',
  'hrbp.findings.regrettedCluster',
  'talent.retention.regrettedHigh',
  'talent.finding.hipoExits',
  'org.team.regrettedExits',
  // No breakdown of why people left: in a manager's org a reason group points at named leavers.
  'hrbp.attrition.exitReasons',
  'recruiting.flow.exitReasons',
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
  // A survey, on a hidden analysis (docs/ANALYSES.md, 1.7).
  'hrbp-declines-candidate-survey',
  // Regretted exits, and the regretted leavers by name (HR's classification).
  'hrbp-regretted-quarter',
  'hrbp-regretted-leavers',
  'talent-regretted-high-performers',
  // Why people left (and why candidates left): reason breakdowns point at named people in an org.
  'hrbp-exit-reasons',
  'recruiting-exit-reasons',
]

/**
 * Belt and braces for the special analyses Manager mode hides (docs/ANALYSES.md, 1.7): their
 * figures are hidden by id, wherever they are drawn (an Ask chart gates on the id alone).
 */
export const MANAGER_HIDDEN_FIGURE_PREFIXES: readonly string[] = ['hrbp-quality-', 'hrbp-declines-']

/** Drill kinds whose records Manager mode lists (rows outside the org left out). */
export const MANAGER_DRILL_KINDS: readonly DrillKind[] = [
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

/**
 * Columns Manager mode leaves out of every list of their records, the records exports, the person
 * card and Ask's `query_records`: a leaver's exit reason and regrettable flag (whether an exit was
 * regretted is HR's call about named leavers, and a small team's reasons point at people), and a
 * candidate's reason for being rejected, withdrawing, declining or reneging (TA's records). Each
 * column's how is its `column:` entry in `MANAGER_SURFACES`.
 */
export const MANAGER_HIDDEN_COLUMNS: readonly string[] = [
  'employees.terminationReason',
  'employees.regrettable',
  'candidates.rejectionReason',
]

/** Datasets Manager mode reads (Ask, Inventory, provenance). */
export const MANAGER_DATASETS: readonly DatasetKey[] = [
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

export const MANAGER_ARTICLES: Readonly<Record<string, Decision>> = {
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

export const MANAGER_TOURS: Readonly<Record<string, Decision>> = {
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
  'ask:view_summary': limited(
    'Recruiting, Onboarding, People stats and Talent; hidden figures, regretted exits and reasons dropped.',
  ),
  'ask:compare_groups': limited('The same views; by leader lists leaders inside the org only.'),
  'ask:query_records': limited(
    "The eight Manager mode datasets only, without exit reasons, the regrettable flag or candidates' reasons.",
  ),
  'ask:explain_quality': hidden('Not sent to Claude, and refused if called.'),
  'ask:open_items': limited('The items Manager mode lists.'),
  // Ask on the screen (docs/ASK-ACTIONS.md): every action passes the clamp and the route guard.
  'ask:get_screen': limited('The views, tabs and figures Manager mode shows.'),
  'ask:set_filters': limited("Through the clamp: the scope stays inside the manager's org."),
  'ask:reset_filters': limited("Back to the manager's whole org."),
  'ask:open_view': limited('Only the views and tabs Manager mode shows; others are refused with the reason.'),
  'ask:show_figure': limited('Only the figures Manager mode shows.'),
  'ask:open_records': limited('The records panel keeps to the org and the kinds Manager mode lists.'),
  'ask:apply_saved_view': limited('Applied through the clamp; a page this mode hides opens My team.'),
  'ask:make_chart': limited('From the Manager mode tools and the figures it shows.'),
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
  'person:inside-org': limited(
    'No compa-ratio, exit reason or regrettable flag; open items show overdue required courses only.',
  ),
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
  // Columns of records (docs/ROLES-V2.md, Decisions made, 8 Oct 2026): `MANAGER_HIDDEN_COLUMNS`.
  'column:employees.terminationReason': hidden(
    "A leaver's exit reason stays with HR: in a manager's team it points at a named person.",
  ),
  'column:employees.regrettable': hidden(
    "Whether an exit was regretted is HR's call about named leavers; managers see exits.",
  ),
  'column:candidates.rejectionReason': hidden(
    "Why a candidate was rejected, withdrew, declined or reneged stays in TA's records.",
  ),
  // Org chart (3.2): an exit what-if is a reorg scenario, and on the manager it is all about people above them.
  'org:simulate-exit': hidden('An exit what-if is a reorg scenario, worked through with the HRBP.'),
  // Action center items
  'item:onboarding:i9:': hidden('An I-9 item is a Compliance measure.'),
  // People stats > Special analyses, each analysis by its address (docs/ANALYSES.md, 1.7)
  'tab:hrbp.analyses:quality': hidden(
    "Education with first ratings is an HR and TA analysis, and a manager's org makes university groups small enough to point at people.",
  ),
  'tab:hrbp.analyses:declines': hidden("Offer analytics are TA's, as Recruiting's Sources & offers is."),
  'tab:hrbp.analyses:stages': limited('Planned hires from the hiring plan are left out.'),
  'tab:hrbp.analyses:pyramid': limited("Inside the org; the company's shape is an aggregate outline."),
}

/* ───────────── the table ───────────── */

export const MANAGER_POLICY: RolePolicy = {
  mode: 'manager',
  views: {
    ...MANAGER_VIEWS,
    actions: MANAGER_SURFACES['page:actions'],
    data: MANAGER_SURFACES['page:data'],
    dev: MANAGER_SURFACES['page:dev'],
  },
  tabs: MANAGER_TABS,
  hiddenParts: MANAGER_HIDDEN_PARTS,
  metrics: { hidePrefixes: MANAGER_HIDDEN_METRIC_PREFIXES, hide: MANAGER_HIDDEN_METRICS },
  hiddenFigures: MANAGER_HIDDEN_FIGURES,
  hiddenFigurePrefixes: MANAGER_HIDDEN_FIGURE_PREFIXES,
  drillKinds: MANAGER_DRILL_KINDS,
  hiddenColumns: MANAGER_HIDDEN_COLUMNS,
  drillListed: limited('Rows about people outside the org are left out.'),
  datasets: MANAGER_DATASETS,
  hiddenItemPrefixes: MANAGER_HIDDEN_ITEM_PREFIXES,
  articles: MANAGER_ARTICLES,
  tours: MANAGER_TOURS,
  surfaces: {
    ...MANAGER_SURFACES,
    // Surfaces added with the eleven modes (docs/ROLES-V2.md 3.1, 4.4, 4.12).
    ...payDecisions('manager'),
    'person:ratings': limited("The person's final rating only."),
    'ui:attention-lists': SHOWN,
  },
}
