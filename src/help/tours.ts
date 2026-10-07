/**
 * Guided tours, as data (docs/HELP.md, Guided tours). Each step points at a stable
 * `[data-tour="..."]` attribute in the components; `figure-<id>` is the Figure with that id.
 * A step with `view` (and `tab`) opens that page first; a step whose element is missing shows as
 * a centered card. Tests check every target exists in the source and every route is real.
 */
import type { RouteView } from '@/data/store'
import type { Tour, TourStep } from './types'

/** The selector for a `data-tour` name. */
export const tourTarget = (name: string): string => `[data-tour="${name}"]`

/** The selector for a Figure by its id. */
export const figureTarget = (id: string): string => tourTarget(`figure-${id}`)

const at = (view: RouteView, tab = '') => ({ view, tab })

const GETTING_STARTED: Tour = {
  id: 'getting-started',
  title: 'Getting started',
  summary: 'Folder tabs, filters, the data standard, key figures, findings, exports and where to find help.',
  length: '2 minutes',
  steps: [
    {
      title: 'Welcome to Census',
      body: 'This tour shows the parts you will use every day. Use Next or the right arrow key to move on, and Esc to stop at any time. When it ends you are back where you started.',
    },
    {
      target: tourTarget('folder-tabs'),
      title: 'Folder tabs and headline numbers',
      body: "Each folder tab is a practice. The number on it is that practice's headline for the current scope, such as open reqs or median compa-ratio. Click a tab to open the view.",
      placement: 'bottom',
    },
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('filter-period'),
      title: 'Pick the period',
      body: 'Most numbers cover a window: the last 12 months by default, or year to date, the last full quarter, the last 6 or 3 months, or a custom range. The view header always states the window and the as-of date.',
      placement: 'bottom',
    },
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('filter-leader'),
      title: 'Focus on a leader or a group',
      body: 'Pick a leader to see their whole organization, or narrow by business unit, department, location and level. Each menu starts with Include and Exclude, so you can also leave a group out. Filters apply to every view, show as chips you can remove, and Back undoes a change. Views, at the start of the row, saves the scope you use often.',
      placement: 'bottom',
    },
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('data-standard'),
      // A control a mode can hide: the tour skips the step there.
      surface: 'settings:data',
      title: 'The data standard',
      body: 'Every number carries a tier: bronze, silver or gold. The data standard sets the lowest tier shown in every view. Pick Production for a leadership meeting to show only certified numbers.',
      placement: 'bottom',
    },
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('kpi-strip'),
      title: 'Key figures',
      body: 'Each tile has the value, the change against the previous window, a trend line and, when it has one, its target. A tile whose label is a link opens the tab that explains it.',
      placement: 'bottom',
    },
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('kpi-info'),
      title: 'What a number means',
      body: 'The info button gives the definition. "Edit definition" opens the metric in Metric definitions, and "Learn more" opens the help article.',
      placement: 'bottom',
    },
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('kpi-tier'),
      title: 'How far to trust it',
      body: 'The tier badge says how far the data behind the number has come. Hover or focus it to see the field holding it back; click it to open that dataset in the Data room.',
      placement: 'bottom',
    },
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('kpi-value'),
      title: 'Click down to the people',
      body: 'A number with a dotted underline opens the records behind it in a panel on the right. Sort, search or download the list, and click a person to open their card with their manager chain, team, rating and history.',
      placement: 'bottom',
    },
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('readout'),
      title: 'The readout',
      body: 'Findings for the view, most serious first. Each one gives the number, where it concentrates and one neutral next step. Names and numbers in a finding open the people behind them.',
      placement: 'right',
    },
    {
      ...at('hrbp', 'overview'),
      target: figureTarget('hrbp-headcount-trend'),
      title: 'Every figure exports',
      body: 'At the top right of each figure: the table button shows the rows behind the chart, the info button lists its definitions, and the download button saves CSV, Excel, PNG or SVG, or copies the table. Export in the view header saves the whole tab as a workbook or a deck.',
      placement: 'top',
    },
    {
      target: tourTarget('masthead-tools'),
      title: 'Tools',
      body: "Tools links to the team's companion tools.",
      placement: 'bottom',
    },
    {
      target: tourTarget('masthead-data'),
      // A control a mode can hide: the tour skips the step there.
      surface: 'masthead:data',
      title: 'The Data room',
      body: 'See what data is loaded and how good it is, load your own exports, read and change the metric definitions, and fix how categories are mapped.',
      placement: 'bottom',
    },
    {
      target: tourTarget('masthead-settings'),
      title: 'Settings',
      body: 'Theme, text size and motion, the data standard and reporting date, an index of every formula, privacy switches such as pay amounts, tool links, and a settings file to move to another computer.',
      placement: 'bottom',
    },
    {
      target: tourTarget('masthead-ask'),
      title: 'Ask a question',
      body: 'Ask Census answers questions in plain words, and every number in an answer opens its records. It uses your own Claude API key, added in Settings. Names, IDs and pay amounts are never sent. Press Alt+A (Option+A on a Mac) to open it.',
      placement: 'bottom',
    },
    {
      target: tourTarget('masthead-help'),
      title: 'Help is always here',
      body: 'Open Help to search articles and every metric definition, take a tour of the page you are on, see keyboard shortcuts, or report a problem. Press ? to open it from anywhere.',
      placement: 'bottom',
    },
  ],
}

const OWN_DATA: Tour = {
  id: 'own-data',
  title: 'Using your own data',
  summary: 'Load your exports, check the mapping and the issues, apply, then take a dataset to gold.',
  length: '2 minutes',
  route: 'data',
  steps: [
    {
      target: tourTarget('masthead-data'),
      // A control a mode can hide: the tour skips the step there.
      surface: 'masthead:data',
      title: 'Start in the Data room',
      body: 'Everything about the data lives in the Data room. Files you add stay in this browser; Census reads them on this device and never sends them anywhere.',
      placement: 'bottom',
    },
    {
      ...at('data'),
      target: tourTarget('data-dropzone'),
      title: 'Drop a file',
      body: 'Drop one or more Excel or CSV exports here, or use Choose files. Each sheet is matched to a dataset by its columns. Nothing changes until you apply a sheet.',
      placement: 'bottom',
    },
    {
      ...at('data', 'candidates-mapping'),
      target: tourTarget('dataset-panels'),
      title: 'Check the mapping',
      body: 'For each sheet you check which column feeds each field and pick a meaning for values Census does not recognize. Afterwards, the Mapping panel shows the source of every field. Confirm mapping records your review.',
      placement: 'bottom',
    },
    {
      ...at('data', 'candidates-quality'),
      target: tourTarget('dataset-detail'),
      title: 'Read the issues',
      body: "The Quality panel shows each field's fill rate, values that were invalid or defaulted, and checks such as references that do not resolve. Every count opens the rows behind it.",
      placement: 'top',
    },
    {
      ...at('data'),
      title: 'Apply',
      body: 'The last step of an upload shows rows in, skipped and defaulted, with the issues found. Apply replaces that one dataset; the others keep running on the sample. Census remembers your column choices for the next file with the same layout.',
    },
    {
      ...at('data'),
      target: figureTarget('data-manifest'),
      title: 'Tiers',
      body: 'Each dataset carries a tier. An upload starts at bronze. A confirmed mapping with passing checks makes it silver. Open a row for its Raw, Mapping, Quality and Certify panels.',
      placement: 'top',
    },
    {
      ...at('data', 'employees-certify'),
      target: tourTarget('dataset-detail'),
      title: 'Certify for gold',
      body: 'The data owner certifies a version: the checklist must pass, control totals such as headcount must reconcile within 0.5%, and they add their name and a note. Replacing the data ends the certification.',
      placement: 'top',
    },
  ],
}

const QUALITY_DEFINITIONS: Tour = {
  id: 'quality-definitions',
  title: 'Data quality and definitions',
  summary:
    'Tier badges, the data quality switch, the ranked fixes, and how to change a definition or target.',
  length: '2 minutes',
  steps: [
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('kpi-tier'),
      title: 'Tier badges',
      body: 'Every number carries the tier of its data: bronze, silver or gold. Hover or focus the badge for the field holding it back. Click it to open that dataset.',
      placement: 'bottom',
    },
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('quality-lens'),
      // A control a mode can hide: the tour skips the step there.
      surface: 'filter:lens',
      title: 'Show data quality',
      body: 'Turn this on to see, under every number, the field limiting it and the rows used and left out. It is off by default so the dashboard stays clean for meetings.',
      placement: 'bottom',
    },
    {
      ...at('data', 'quality'),
      target: figureTarget('data-quality-datasets'),
      title: 'The Data quality tab',
      body: "The quality story for the whole dashboard: each dataset's tier, mapping, certification, freshness and error rate, then every field's fill rate and every check.",
      placement: 'top',
    },
    {
      ...at('data', 'quality'),
      target: figureTarget('data-quality-fixes'),
      title: 'Fix what matters most',
      body: 'Single fixes ranked by how many metrics each would raise to a higher tier. Start at the top of this list.',
      placement: 'top',
    },
    {
      ...at('data', 'metrics'),
      target: figureTarget('data-metrics-list'),
      title: 'Metric definitions',
      body: 'Every metric Census shows has one entry here. Search or filter by view, tier, "changed from default" or "has a target".',
      placement: 'right',
    },
    {
      ...at('data', 'metrics/hrbp/attrition/voluntary'),
      target: tourTarget('metric-detail'),
      title: 'Change a target or a setting',
      body: 'Edit the wording or the target here, and the settings below it. Every view recalculates at once, and numbers calculated differently from the default carry a "Definition changed" mark.',
      placement: 'left',
    },
    {
      ...at('data', 'metrics/hrbp/attrition/voluntary'),
      target: tourTarget('metric-dictionary-bar'),
      title: 'Undo, reset and share',
      body: 'Every change is in the change log with Undo. Add your name so the log says who made it. Download the whole dictionary to Excel, or reset everything to the defaults.',
      placement: 'bottom',
    },
  ],
}

/* ───────── one tour per view ───────── */

const SCORECARD: Tour = {
  id: 'view-scorecard',
  title: 'Scorecard',
  summary: 'Each practice against its targets, the top findings and the monthly people report.',
  length: '1 minute',
  route: 'scorecard',
  steps: [
    {
      ...at('scorecard'),
      target: figureTarget('scorecard-standing'),
      title: 'Targets met',
      body: 'How many measures with a target meet it, and the bar split by status. Click a part of the bar to list its measures; each value opens its records.',
      placement: 'right',
    },
    {
      ...at('scorecard'),
      target: figureTarget('scorecard-measures'),
      title: 'Measures against target',
      body: 'Every measure on its own scale with its target as a tick. "Furthest from target" puts the biggest misses first. Click a bar for its records, or a name to open its view.',
      placement: 'right',
    },
    {
      ...at('scorecard'),
      target: figureTarget('scorecard-people'),
      title: 'People scorecard',
      body: 'Two or three measures per practice with the value, target, status (Met, Watch or Missed), change, trend and tier: the record behind the charts. Click a value for its records, or a practice name to open that view.',
      placement: 'top',
    },
    {
      ...at('scorecard'),
      target: tourTarget('scorecard-targets'),
      title: 'Targets',
      body: "Every measure's target in one list. Targets live in Metric definitions, so every view judges a measure against the same one.",
      placement: 'bottom',
    },
    {
      ...at('scorecard'),
      target: tourTarget('readout'),
      title: 'Top findings across Census',
      body: 'The most serious finding from each practice first, tagged with where it comes from. "Open in" takes you to the view.',
      placement: 'left',
    },
    {
      ...at('scorecard'),
      target: tourTarget('scorecard-report'),
      title: 'Monthly people report',
      body: "One click builds the report as a PowerPoint deck or an Excel workbook: targets met by practice, the scorecard, the top findings and each practice's lead chart.",
      placement: 'bottom',
    },
  ],
}

const RECRUITING: Tour = {
  id: 'view-recruiting',
  title: 'Recruiting',
  summary: 'The pipeline, where it is stuck, who needs to act and the health of each req.',
  length: '1 minute',
  route: 'recruiting',
  steps: [
    {
      ...at('recruiting', 'overview'),
      target: tourTarget('kpi-strip'),
      title: 'Hiring at a glance',
      body: 'Open reqs, offers accepted, time to fill and to hire, offer acceptance, candidates lacking a next step, and hires against the hiring plan.',
      placement: 'bottom',
    },
    {
      ...at('recruiting', 'overview'),
      target: figureTarget('recruiting-pipeline-today'),
      title: 'Pipeline today',
      body: 'Active candidates at each stage, split by their next-step state. A candidate lacks a next step when nothing is pending, not just when they have waited a while. Click a bar for the candidates.',
      placement: 'top',
    },
    {
      ...at('recruiting', 'overview'),
      target: tourTarget('readout'),
      title: 'Findings',
      body: 'Bottlenecks, candidates waiting on a decision, offers awaiting an answer and sources drying up, each with where it concentrates.',
      placement: 'right',
    },
    {
      ...at('recruiting', 'pipeline'),
      target: figureTarget('recruiting-candidate-flow'),
      title: 'Candidate flow',
      body: 'Where the applications in the window went, stage by stage. Ribbons to the bottom are rejections, withdrawals and declines.',
      placement: 'top',
    },
    {
      ...at('recruiting', 'pipeline'),
      target: figureTarget('recruiting-action-queue'),
      title: 'Action queue',
      body: 'Every candidate lacking a next step, grouped by who owns it. "Copy note" writes a polite message for each owner.',
      placement: 'top',
    },
    {
      ...at('recruiting', 'requisitions'),
      target: figureTarget('recruiting-open-requisitions'),
      title: 'Open requisitions',
      body: 'Each open req with its candidates per stage and its health: Empty funnel, candidates lacking a next step, or On track.',
      placement: 'top',
    },
  ],
}

const ONBOARDING: Tour = {
  id: 'view-onboarding',
  title: 'Onboarding',
  summary: 'Upcoming starts and their readiness, the first 90 days and the hiring plan.',
  without: [
    {
      surface: 'tab:onboarding.plan',
      summary: 'Upcoming starts and their readiness, and the first 90 days.',
    },
  ],
  length: '1 minute',
  route: 'onboarding',
  steps: [
    {
      ...at('onboarding', 'upcoming'),
      target: tourTarget('kpi-strip'),
      title: 'Who starts soon',
      body: 'Starts in the next 30, 60 and 90 days, day -3 tasks not done, open contingencies, notice periods and reneges.',
      placement: 'bottom',
    },
    {
      ...at('onboarding', 'upcoming'),
      target: figureTarget('onboarding-start-calendar'),
      title: 'Start calendar',
      body: 'Weekly starts for the coming weeks by business unit. Every bar opens the people starting that week.',
      placement: 'top',
    },
    {
      ...at('onboarding', 'upcoming'),
      target: figureTarget('onboarding-upcoming-starts'),
      title: 'Ready for day one',
      body: 'Each person with their readiness ("7 of 9 done"), a status pill and the task blocking them. Click a row for the person.',
      placement: 'top',
    },
    {
      ...at('onboarding', 'first90'),
      target: figureTarget('onboarding-day-one-by-month'),
      title: 'The first 90 days',
      body: 'Day-one readiness against its 95% target, then I-9 timing, check-ins, probation decisions and early leavers on this tab.',
      placement: 'top',
    },
    {
      ...at('onboarding', 'plan'),
      target: figureTarget('onboarding-plan-vs-actual'),
      title: 'Hiring plan',
      body: 'Plan, actual, committed and forecast starts by month, from the Hiring plan dataset.',
      placement: 'top',
    },
    {
      ...at('onboarding', 'plan'),
      target: figureTarget('onboarding-plan-coverage'),
      title: 'Plan coverage',
      body: 'Each business unit and department against plan, with the gap and On plan, Behind or Ahead.',
      placement: 'top',
    },
  ],
}

const PEOPLE_STATS: Tour = {
  id: 'view-hrbp',
  title: 'People stats',
  summary: "A leader's organization, how it is changing and what to raise in the next 1:1.",
  length: '1 minute',
  route: 'hrbp',
  steps: [
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('filter-leader'),
      title: 'Pick a leader',
      body: 'People stats is built for leader conversations. Pick a leader to see their whole organization; the changes then compare with the company.',
      placement: 'bottom',
    },
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('kpi-strip'),
      title: 'Headcount and attrition',
      body: 'Headcount, hires, attrition (all, voluntary, regretted and first-year, annualized) and promotion rate.',
      placement: 'bottom',
    },
    {
      ...at('hrbp', 'overview'),
      target: figureTarget('hrbp-scorecard'),
      title: 'Sub-org scorecard',
      body: 'One row per org under the leader, or per business unit. Shaded cells are materially off the company. Click a row to focus on that org.',
      placement: 'top',
    },
    {
      ...at('hrbp', 'overview'),
      target: tourTarget('hrbp-talking-points'),
      // A control a mode can hide: the tour skips the step there.
      surface: 'header:hrbp',
      title: 'Copy talking points',
      body: 'Five to seven plain bullets for a leader 1:1, ready to paste: headcount, attrition against the company, regretted exits, first-year attrition, promotions and the top finding.',
      placement: 'bottom',
    },
    {
      ...at('hrbp', 'attrition'),
      target: figureTarget('hrbp-exit-reasons'),
      title: 'Why people left',
      body: 'Voluntary exit reasons, then attrition by tenure, level and last rating, and the regretted leavers by name.',
      placement: 'top',
    },
    {
      ...at('hrbp', 'org'),
      target: figureTarget('hrbp-managers'),
      title: 'Managers and spans',
      body: "Each manager's directs, total org, tenure and regretted exits, flagged Overloaded, Heavy, Light, New or Healthy.",
      placement: 'top',
    },
  ],
}

const ORG_CHART: Tour = {
  id: 'view-org',
  title: 'Org chart',
  summary: 'Reporting lines, team shape, flags and the reorg sandbox.',
  without: [{ surface: 'tab:org.sandbox', summary: 'Reporting lines, team shape and flags.' }],
  length: '1 minute',
  route: 'org',
  steps: [
    {
      ...at('org', 'chart'),
      target: figureTarget('org-chart'),
      title: 'The chart',
      body: "Reporting lines on the as-of date. A leader in the filter row becomes the top; other filters dim people instead of removing them. Click a card for the person's details and team.",
      placement: 'top',
    },
    {
      ...at('org', 'chart'),
      target: tourTarget('org-controls'),
      title: 'Find, expand and color',
      body: 'Find a person (or press /), expand a set number of levels, color cards by department, location, level, tenure or business unit, and show open roles and flags.',
      placement: 'bottom',
    },
    {
      ...at('org', 'chart'),
      target: figureTarget('org-flags'),
      title: 'Flags in this org',
      body: 'Span outliers, single-report chains and new managers with large teams. Click a row to find the person on the chart.',
      placement: 'top',
    },
    {
      ...at('org', 'sandbox'),
      target: tourTarget('org-sandbox-toolbar'),
      title: 'Reorg sandbox',
      body: 'Drag a card onto a new manager, with or without their org. Undo, Redo and Reset are here, and Export scenario saves the moves and the resulting roster. The data is never changed.',
      placement: 'bottom',
    },
    {
      ...at('org', 'sandbox'),
      target: figureTarget('org-sandbox'),
      title: 'See what changes',
      body: 'Changed cards are outlined, and the panel shows who changes manager, which spans change, layers and any blocked moves.',
      placement: 'top',
    },
  ],
}

const HR_OPS: Tour = {
  id: 'view-services',
  title: 'HR ops',
  summary: 'Cases, transactions, leave and return, and the Atlas service levels.',
  length: '1 minute',
  route: 'services',
  steps: [
    {
      ...at('services', 'overview'),
      target: tourTarget('kpi-strip'),
      title: 'Service at a glance',
      body: 'Cases opened, the open backlog, resolution and first response SLA, time to resolve, satisfaction and transactions on time.',
      placement: 'bottom',
    },
    {
      ...at('services', 'overview'),
      target: figureTarget('services-cases-by-month'),
      title: 'Cases by month',
      body: 'Volume by category over two years. A spike often explains a dip in service levels.',
      placement: 'top',
    },
    {
      ...at('services', 'cases'),
      target: figureTarget('services-sla-by-category'),
      title: 'Where cases miss target',
      body: 'Resolution SLA by category against target, then timing, channels, reopened cases and the oldest open cases on this tab.',
      placement: 'top',
    },
    {
      ...at('services', 'transactions'),
      target: figureTarget('services-final-pay'),
      title: 'Final pay',
      body: 'Final pay on time by jurisdiction, with the rule that applies in each.',
      placement: 'top',
    },
    {
      ...at('services', 'leave'),
      target: figureTarget('services-leave-on-leave'),
      title: 'Leave & return',
      body: 'Who is on leave by reason category, returns coming up and whether systems are ready, return rate and retention after return. Reasons only appear in grouped counts.',
      placement: 'top',
    },
    {
      ...at('services', 'levels'),
      target: figureTarget('services-scorecard'),
      title: 'Service levels',
      body: 'Every measurable Hire-to-Retire Atlas KPI with its process ID, target, actual and status.',
      placement: 'top',
    },
  ],
}

const TALENT: Tour = {
  id: 'view-talent',
  title: 'Talent',
  summary: 'Ratings, the 9-box, succession, flight risk and required training.',
  without: [
    { surface: 'tab:talent.retention', summary: 'Ratings, the 9-box, succession and required training.' },
  ],
  length: '1 minute',
  route: 'talent',
  steps: [
    {
      ...at('talent', 'overview'),
      target: tourTarget('kpi-strip'),
      title: 'Talent at a glance',
      body: 'Rating coverage, high performers against the 35% guideline, high potentials, critical roles covered, regretted high performers, training and key talent at risk.',
      placement: 'bottom',
    },
    {
      ...at('talent', 'overview'),
      target: figureTarget('talent-nine-box'),
      title: 'Performance and potential',
      body: 'The 9-box from the latest annual cycle. Click a cell to see the people in it.',
      placement: 'top',
    },
    {
      ...at('talent', 'succession'),
      target: figureTarget('talent-critical-roles'),
      title: 'Critical roles',
      body: 'Each critical and key role with its incumbent, risk of loss and the readiness of its best successor: Covered, Thin or No successor.',
      placement: 'top',
    },
    {
      ...at('talent', 'retention'),
      target: figureTarget('talent-risk-back-test'),
      title: 'Is the risk score any good?',
      body: 'Everyone scored as of 12 months ago, and how many in each band then left. If the high band left far more often, the score separates leavers from stayers.',
      placement: 'top',
    },
    {
      ...at('talent', 'retention'),
      target: figureTarget('talent-risk-factors'),
      title: 'How the score works',
      body: "Each factor, the points it adds and its evidence. Read a person's reasons, not just their band.",
      placement: 'top',
    },
    {
      ...at('talent', 'learning'),
      target: figureTarget('talent-training-on-time-by-course'),
      title: 'Required training',
      body: 'Required training on time by course against the 95% target, then what is overdue today.',
      placement: 'top',
    },
  ],
}

const COMPENSATION: Tour = {
  id: 'view-comp',
  title: 'Compensation',
  summary: 'Pay positioning, pay for performance, the market, the merit cycle and pay privacy.',
  length: '1 minute',
  route: 'comp',
  steps: [
    {
      ...at('comp', 'overview'),
      target: tourTarget('comp-pay-switch'),
      title: 'Pay amounts stay private',
      body: 'Ratios such as compa-ratio always show. Salaries and other amounts show only while this switch is on, for this session only, and the masthead says so on every page.',
      placement: 'bottom',
    },
    {
      ...at('comp', 'overview'),
      target: tourTarget('kpi-strip'),
      title: 'Pay at a glance',
      body: 'Median compa-ratio, the share in the healthy band, below minimum and above maximum, merit spend against budget, pay for performance and the market ratio.',
      placement: 'bottom',
    },
    {
      ...at('comp', 'overview'),
      target: figureTarget('comp-compa-distribution'),
      title: 'Compa-ratio distribution',
      body: 'Base salary divided by range midpoint for everyone in scope, with the healthy band shaded.',
      placement: 'top',
    },
    {
      ...at('comp', 'ranges'),
      target: figureTarget('comp-below-minimum'),
      title: 'Below the range minimum',
      body: 'Who is paid below their range minimum and by how much, in percent. The amounts appear only with pay amounts on.',
      placement: 'top',
    },
    {
      ...at('comp', 'performance'),
      target: figureTarget('comp-merit-matrix'),
      title: 'Merit matrix',
      body: 'Average merit against the guideline by rating and range position: blue above the guideline, red below.',
      placement: 'top',
    },
    {
      ...at('comp', 'cycle'),
      target: figureTarget('comp-spend-by-bu'),
      title: 'Merit cycle',
      body: 'Merit spend by business unit against the budget. The budget, healthy band and merit guideline are settings in Metric definitions, a click away with "Cycle settings".',
      placement: 'top',
    },
  ],
}

const COMPLIANCE: Tour = {
  id: 'view-compliance',
  title: 'Compliance',
  summary: 'Right to work, reverification, Form I-9, export control and statutory deadlines.',
  length: '1 minute',
  route: 'compliance',
  steps: [
    {
      ...at('compliance', 'overview'),
      target: tourTarget('kpi-strip'),
      title: 'Compliance at a glance',
      body: 'Authorizations expiring, reverification on time and overdue, I-9 Section 2 within 3 business days, and anyone working without an export license in force.',
      placement: 'bottom',
    },
    {
      ...at('compliance', 'overview'),
      target: figureTarget('compliance-expiries-by-month'),
      title: 'Expiries by month',
      body: 'Work authorizations ending over the next six months by business unit. Every bar opens the people.',
      placement: 'top',
    },
    {
      ...at('compliance', 'overview'),
      target: tourTarget('compliance-immigration-switch'),
      title: 'Immigration details',
      body: "Each person's authorization type shows only while this is on, for this session. Counts by type always show.",
      placement: 'bottom',
    },
    {
      ...at('compliance', 'work'),
      target: figureTarget('compliance-expiring-authorizations'),
      title: 'Expiring authorizations',
      body: 'Each person with the expiry date, days to go and whether reverification has started.',
      placement: 'top',
    },
    {
      ...at('compliance', 'export'),
      target: figureTarget('compliance-without-license'),
      title: 'Export control',
      body: 'Active people whose role needs a license that is pending, denied or expired. This should always be empty.',
      placement: 'top',
    },
    {
      ...at('compliance', 'deadlines'),
      target: figureTarget('compliance-statutory-calendar'),
      title: 'Statutory deadlines',
      body: 'The Hire-to-Retire Atlas calendar for every jurisdiction where someone in scope works. Confirm dates with employment counsel.',
      placement: 'top',
    },
  ],
}

const LISTENING: Tour = {
  id: 'view-listening',
  title: 'Listening',
  summary: 'Every survey program, its scores by driver, and how survey privacy works.',
  length: '1 minute',
  route: 'listening',
  steps: [
    {
      ...at('listening', 'overview'),
      target: figureTarget('listening-programs'),
      title: 'Survey programs',
      body: "Each program's latest wave, respondents, response rate, headline score, change since the last wave and status.",
      placement: 'top',
    },
    {
      ...at('listening', 'overview'),
      target: figureTarget('listening-waves'),
      title: 'Wave calendar',
      body: 'When each program ran in the last 12 months.',
      placement: 'top',
    },
    {
      ...at('listening', 'overview'),
      target: tourTarget('view-tabs'),
      title: 'One tab per area',
      body: 'Candidates & hiring, Onboarding, Stay & exit, Managers, and Services & learning each show their surveys by driver, by org and against the last wave.',
      placement: 'bottom',
    },
    {
      ...at('listening', 'onboarding'),
      target: figureTarget('listening-d30-readiness'),
      title: 'Scores tied to operations',
      body: 'Day-30 readiness by region next to late laptops: survey results sit beside the operational number that explains them.',
      placement: 'top',
    },
    {
      ...at('listening', 'overview'),
      title: 'Grouped, never individual',
      body: 'Every survey number needs at least five respondents, and a cut by manager needs ten. Numbers open grouped results, never answers or people.',
    },
  ],
}

const AI_IN_HR: Tour = {
  id: 'view-ai',
  title: 'AI in HR',
  summary: 'The agent catalog, how to find an agent and how to keep the catalog current.',
  length: '1 minute',
  route: 'ai',
  steps: [
    {
      ...at('ai', 'agents'),
      target: tourTarget('ai-use-note'),
      title: 'Using agents well',
      body: 'Agents assist and people decide: no agent makes a hiring, rating or pay decision. Share only the data an agent is approved for.',
      placement: 'bottom',
    },
    {
      ...at('ai', 'agents'),
      target: figureTarget('ai-agents-by-area'),
      title: 'Agents by area',
      body: 'How many agents each HR area has. Click a count to show only that area.',
      placement: 'bottom',
    },
    {
      ...at('ai', 'agents'),
      target: tourTarget('ai-filters'),
      title: 'Find an agent',
      body: 'Filter by area, audience and status, or search names, descriptions and uses.',
      placement: 'bottom',
    },
    {
      ...at('ai', 'agents'),
      target: tourTarget('ai-agent-card'),
      title: 'Read an agent',
      body: 'What it is for and not for, example prompts to copy, the data it draws on, its owner, and a link to open it in Glean.',
      placement: 'right',
    },
    {
      ...at('ai', 'agents'),
      target: tourTarget('view-controls'),
      title: 'Keep the catalog current',
      body: 'Add an agent, or use the Catalog menu to import or download the AI agents sheet, or reset to the sample. Changes stay in this browser.',
      placement: 'bottom',
    },
  ],
}

const ACTION_CENTER: Tour = {
  id: 'view-actions',
  title: 'Action center',
  summary: 'Open items from every view, who they wait on, and how to follow up politely.',
  length: '1 minute',
  route: 'actions',
  steps: [
    {
      ...at('actions'),
      target: tourTarget('actions-header'),
      title: 'Everything open, in one place',
      body: 'Items every view raises: decisions, tasks, deadlines and follow-ups, with counts by severity that open the items.',
      placement: 'bottom',
    },
    {
      ...at('actions'),
      target: tourTarget('actions-my-team'),
      title: 'My team',
      body: 'Pick a manager to see items about their org and items they or their team own anywhere in the company. Export list saves the list to Excel.',
      placement: 'bottom',
    },
    {
      ...at('actions'),
      target: figureTarget('actions-by-owner'),
      title: 'Where items wait',
      body: 'Open items by owner group and due date, with overdue and due soon marked.',
      placement: 'top',
    },
    {
      ...at('actions'),
      target: tourTarget('actions-list-controls'),
      title: 'Narrow the list',
      body: 'Filter by owner group, severity, due date or the view an item comes from, or search for an owner, person or req.',
      placement: 'bottom',
    },
    {
      ...at('actions'),
      target: tourTarget('actions-owner-sheet'),
      title: 'One sheet per owner group',
      body: "Each owner's items with what is open, who it is about, where it comes from and when it is due. Mark an item handled or snooze it for 7 days once it is in hand.",
      placement: 'top',
    },
    {
      ...at('actions'),
      target: tourTarget('actions-copy-note'),
      title: 'Copy a note',
      body: 'One polite message per owner listing their items, ready to paste into an email or chat.',
      placement: 'bottom',
    },
  ],
}

/** Manager mode's first tour (docs/ROLES.md, 3.8): the Mode button, My team, the pinned org, a drill and the Action center. */
const MANAGER_START: Tour = {
  id: 'manager-start',
  title: 'Getting started as a manager',
  summary: "Your org on one page, how Census keeps to it, and where your team's open items wait.",
  length: '1 minute',
  steps: [
    {
      ...at('team'),
      target: tourTarget('masthead-mode'),
      title: 'The mode',
      body: "Census is in Manager mode for one manager's org. Switch modes here, or pick another manager.",
      placement: 'bottom',
    },
    {
      ...at('team'),
      target: tourTarget('kpi-strip'),
      title: 'Your org at a glance',
      body: 'Headcount, attrition against the company, open reqs, starts in the next 30 days, required training on time and the open items your org owns.',
      placement: 'bottom',
    },
    {
      ...at('team'),
      target: tourTarget('filter-leader'),
      title: 'Your org, pinned',
      body: 'Every view shows your org. Pick a leader inside it to narrow the page; Whole org goes back to all of it.',
      placement: 'bottom',
    },
    {
      ...at('team'),
      target: tourTarget('kpi-value'),
      title: 'Down to the people',
      body: 'Every number opens the people and records behind it. Company numbers are comparisons and open no records.',
      placement: 'bottom',
    },
    {
      ...at('team'),
      target: tourTarget('masthead-actions'),
      // A control a mode can hide: the tour skips the step there.
      surface: 'masthead:actions',
      title: 'Waiting on your team',
      body: 'The Action center lists the open items about your org and the ones your team owns, with a polite note to copy for each owner.',
      placement: 'bottom',
    },
  ],
}

/** My team, Manager mode's home (docs/ROLES.md, 2.2). */
const MY_TEAM: Tour = {
  id: 'view-team',
  title: 'My team',
  summary: "One manager's org on one page: people, hiring, starts, talent and what waits on them.",
  length: '1 minute',
  route: 'team',
  steps: [
    {
      ...at('team'),
      target: tourTarget('kpi-strip'),
      title: 'Your org at a glance',
      body: 'Headcount, attrition against the company, open reqs, starts in the next 30 days, required training on time and the open items your org owns. Each tile opens the tab that explains it.',
      placement: 'bottom',
    },
    {
      ...at('team'),
      target: tourTarget('readout'),
      title: 'What needs attention',
      body: 'The most serious findings from People stats, Recruiting, Onboarding and Talent for your org, each with the view that explains it.',
      placement: 'right',
    },
    {
      ...at('team'),
      target: figureTarget('team-attrition-vs-company'),
      title: 'Against the company',
      body: 'Your attrition beside the company. Your bars open your leavers; company bars are a comparison only and open no records.',
      placement: 'top',
    },
    {
      ...at('team'),
      target: figureTarget('team-start-calendar'),
      title: 'Who starts soon',
      body: 'Starts in each of the next weeks by day-one readiness. Click a week for the people and their open tasks.',
      placement: 'top',
    },
    {
      ...at('team'),
      target: tourTarget('filter-leader'),
      title: 'Your org, pinned',
      body: 'The page keeps to your org. Pick a leader inside it to narrow every view.',
      placement: 'bottom',
    },
    {
      ...at('team'),
      target: tourTarget('view-export'),
      title: 'Take it to a meeting',
      body: 'Export writes the page as an Excel workbook or PowerPoint slides, with a line saying it was made in Manager mode.',
      placement: 'bottom',
    },
  ],
}

/** Developer mode only (docs/ROLES.md, 3.8): the Developer page and the debug overlays. */
const DEVELOPER_TOOLS: Tour = {
  id: 'developer-tools',
  title: 'Developer tools',
  summary:
    'The Developer page: the inventory, the Ask tools console, the state behind the screen and the debug overlays.',
  length: '1 minute',
  route: 'dev',
  steps: [
    {
      ...at('dev'),
      target: tourTarget('masthead-dev'),
      title: 'A page for developers',
      body: 'Developer mode adds this page: whether the data, the metric dictionary, the view contracts and the runtime are healthy. Nothing on it is sent anywhere.',
      placement: 'bottom',
    },
    {
      ...at('dev', 'inventory'),
      target: tourTarget('dev-inventory-list'),
      title: 'Everything Census has',
      body: 'Every view, tab, figure, metric, engine function, Ask tool, drill kind, field, storage key, route, setting, shortcut and help entry, with what each mode shows. Search a list or export it.',
      placement: 'bottom',
    },
    {
      ...at('dev', 'ask'),
      target: tourTarget('dev-ask-console'),
      title: 'Run a tool here',
      body: 'Run one tool on the live context and see the exact JSON Claude would get, without sending anything.',
      placement: 'bottom',
    },
    {
      ...at('dev', 'state'),
      target: tourTarget('dev-state'),
      title: 'The state behind the screen',
      body: 'Route, scope, mode, switches, quality index, saved views, panels and storage, each copyable as JSON.',
      placement: 'top',
    },
    {
      ...at('dev'),
      target: tourTarget('dev-overlays'),
      title: 'Debug overlays',
      body: 'Figure ids, tour targets and metric ids on hover. Alt+Shift+D switches them all.',
      placement: 'bottom',
    },
  ],
}

export const TOURS: readonly Tour[] = [
  GETTING_STARTED,
  MANAGER_START,
  MY_TEAM,
  OWN_DATA,
  QUALITY_DEFINITIONS,
  SCORECARD,
  RECRUITING,
  ONBOARDING,
  PEOPLE_STATS,
  ORG_CHART,
  HR_OPS,
  TALENT,
  COMPENSATION,
  COMPLIANCE,
  LISTENING,
  AI_IN_HR,
  ACTION_CENTER,
  DEVELOPER_TOOLS,
]

const BY_ID = new Map(TOURS.map((t) => [t.id, t]))

export const tourById = (id: string | null | undefined): Tour | null => (id ? (BY_ID.get(id) ?? null) : null)

/** The tour for a page ("Tour this page"), or null when the page has none. */
export const tourForRoute = (view: RouteView): Tour | null => TOURS.find((t) => t.route === view) ?? null

/** Every step's target name: `[data-tour="kpi-strip"]` → "kpi-strip". */
export function targetName(step: TourStep): string | null {
  const m = step.target?.match(/^\[data-tour="([^"]+)"\]$/)
  return m ? m[1] : null
}
