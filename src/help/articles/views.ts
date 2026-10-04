/**
 * Help articles, Each view: what the view answers, how to read each tab, questions to ask in a
 * meeting, and its key definitions (listed from the metric dictionary under "Definitions").
 */
import type { HelpArticle } from '../types'

const MEETING = 'Questions to ask in a meeting'

export const VIEW_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'view-scorecard',
    group: 'views',
    title: 'Scorecard',
    summary: 'How the people function is doing against its targets, and what needs attention first.',
    keywords: [
      'home',
      'targets',
      'status',
      'met',
      'watch',
      'missed',
      'monthly report',
      'people review',
      'chro',
    ],
    route: { view: 'scorecard' },
    tour: 'view-scorecard',
    metrics: [
      'scorecard.measures.status',
      'scorecard.measures.targetsMet',
      'scorecard.findings.missedTargets',
    ],
    body: [
      {
        p: 'The Scorecard is where Census opens. It answers one question for the monthly people review: how is each practice doing against its targets, and what needs attention first?',
      },
      { h: 'People scorecard' },
      {
        p: "One row per measure, two or three for each practice: Recruiting, Onboarding, People stats, HR ops, Talent, Compensation, Compliance and Listening. Each row shows the value, the target, the status, the change, a trend line and the tier badge. The values come from each view's own calculation, so they always match the view.",
      },
      {
        ul: [
          'Met: the value meets its target.',
          'Watch: it misses by less than the watch margin (5 points for shares, 10% of the target for other units).',
          'Missed: it misses by more than that.',
          'No target: the metric has none yet. "Set a target" opens it in Metric definitions.',
        ],
      },
      {
        p: 'Click a value to see its records. Click a practice name to open that view at the tab the measure comes from. The Targets button lists every target with a link to change it in [Metric definitions](route:data.metrics); there is no second place to edit a target.',
      },
      { h: 'Top findings across Census' },
      {
        p: "Up to eight findings from every view's readout, critical first. Each practice's most serious finding comes before any practice's second, so one busy practice never fills the list. Each finding is tagged with its practice and has \"Open in\" to go there.",
      },
      { h: 'Monthly people report' },
      {
        p: "The header button builds the report as a PowerPoint deck or an Excel workbook: the scorecard, the top findings and each practice's lead chart, stamped with the scope, window, as-of date and data standard.",
      },
      { h: MEETING },
      {
        ul: [
          'Which missed measures have an owner and a date to recover?',
          'Is a Watch measure moving toward its target or away from it?',
          'Are the targets still the right ones for this year?',
        ],
      },
      {
        note: 'The folder tab reads "targets met" (for example "9 of 14"), counting only the measures the data standard shows. It shows "—" for a moment while the scorecard is calculated.',
      },
    ],
  },
  {
    id: 'view-recruiting',
    group: 'views',
    title: 'Recruiting',
    summary: 'Are we hiring the people we need, fast enough, and where is the process stuck?',
    keywords: [
      'ta',
      'talent acquisition',
      'reqs',
      'requisitions',
      'candidates',
      'pipeline',
      'time to fill',
      'offers',
      'sources',
      'bottleneck',
      'next step',
    ],
    route: { view: 'recruiting' },
    tour: 'view-recruiting',
    metrics: [
      'recruiting.reqs.open',
      'recruiting.reqs.timeToFill',
      'recruiting.hires.timeToHire',
      'recruiting.offers.acceptance',
      'recruiting.pipeline.lackingNextStep',
      'recruiting.flow.passRate',
      'recruiting.sources.hireRate',
    ],
    body: [
      {
        p: 'Recruiting is for talent acquisition leads preparing the weekly review with hiring leaders. It answers: are we hiring the people we need, fast enough, and where is the process stuck?',
      },
      { h: 'Overview' },
      {
        p: 'Key figures: open reqs, offers accepted, median time to fill, median time to hire, offer acceptance, candidates lacking a next step, and hires against the hiring plan (which opens Onboarding, Hiring plan). The lead chart, Pipeline today, shows active candidates at each stage by their next-step state.',
      },
      { h: 'Pipeline' },
      {
        ul: [
          'Candidate flow: where the applications in the window went, stage by stage, including those rejected, withdrawn or still active.',
          'Stage conversion: pass rates and median days to the next stage. Candidates still active are shown on their own, so they do not drag the rate down.',
          'Waiting time by stage and days per transition by month: where candidates wait, and whether a bottleneck is recent.',
          'Action queue: every candidate who lacks a next step, grouped by who owns it, with "Copy note" for a polite message to each owner.',
        ],
      },
      {
        p: 'A candidate lacks a next step when nothing is pending: no interview scheduled and no decision due. A long time in a stage alone is not the alarm. Interviewed candidates still waiting on a decision belong to the hiring manager first.',
      },
      { h: 'Requisitions' },
      {
        p: 'Open requisitions with their health (Empty funnel, a number lacking a next step, or On track), open req age, reqs opened and filled by month, time to fill by department and recruiter load.',
      },
      { h: 'Sources & offers' },
      {
        p: 'Source effectiveness, applications by source by month, offer acceptance by location, why offers were declined, why candidates left the process, and what candidates say from the candidate experience survey.',
      },
      { h: MEETING },
      {
        ul: [
          'Which stage is the bottleneck this month, and in which department?',
          'Which candidates are waiting on an interview decision, and can the panel decide this week?',
          'Which open reqs have an empty funnel after 30 days?',
          'Is offer acceptance falling anywhere, and what reasons do candidates give?',
        ],
      },
    ],
  },
  {
    id: 'view-onboarding',
    group: 'views',
    title: 'Onboarding',
    summary: 'Who starts in the next 90 days, will they be ready on day one, and are we hiring to plan?',
    keywords: [
      'new hires',
      'starts',
      'day one',
      'readiness',
      'i-9',
      'probation',
      'check-ins',
      'hiring plan',
      'renege',
      'preboarding',
    ],
    route: { view: 'onboarding' },
    tour: 'view-onboarding',
    metrics: [
      'onboarding.upcoming.starts',
      'onboarding.upcoming.readiness',
      'onboarding.first90.dayOneReadiness',
      'onboarding.first90.i9Section2',
      'onboarding.first90.attrition90',
      'onboarding.plan.vsPlan',
      'onboarding.upcoming.renegeRate',
    ],
    body: [
      {
        p: 'Onboarding answers: who starts in the next 90 days, will each of them be ready on day one, are we hiring to plan, and how are the first 90 days going? It reads the Onboarding tasks and Hiring plan datasets when they are loaded, and shows what it can without them.',
      },
      { h: 'Upcoming starts' },
      {
        p: 'Starts in the next 30, 60 and 90 days, day -3 tasks not done, open contingencies (background check or export screening not done), median offer accepted to start and the renege rate. The start calendar shows weekly starts by business unit; the Upcoming starts table lists each person with their readiness ("7 of 9 done") and the item blocking it. Readiness by task and by owner show which teams are behind.',
      },
      {
        p: 'Readiness status: Ready when every day-one task is done, On track when none is past due, Behind when any is past due, and Not ready when the person starts within 3 days with a task still open.',
      },
      { h: 'First 90 days' },
      {
        p: 'Day-one readiness, I-9 Section 2 on time, required training within 30 days, check-ins on time, probation decisions overdue and early voluntary attrition (within 90 days). Day-one readiness by site, check-ins by department, probation decisions due, early leavers by department and hiring manager, and what new starters say in the day-30 pulse.',
      },
      { h: 'Hiring plan' },
      {
        p: 'Plan, actual, committed and forecast starts by month; plan coverage by business unit and department with On plan, Behind or Ahead; planned roles with no open req; and open reqs not in the plan. When several plan versions are loaded, the latest is used and named.',
      },
      { h: MEETING },
      {
        ul: [
          'Who starts next week without a cleared background check or a laptop?',
          'Which owner (IT, Facilities, People operations, Trade compliance or the manager) is behind on day-one tasks?',
          'Which business units are behind plan, and do the missing roles have open reqs?',
          'Are reneges concentrated in one location?',
        ],
      },
      {
        note: 'Without Onboarding tasks, readiness numbers show "—" with "No onboarding tasks loaded", never 0%. Without a Hiring plan, the Hiring plan tab shows how to load one.',
      },
    ],
  },
  {
    id: 'view-hrbp',
    group: 'views',
    title: 'People stats',
    summary:
      "What a leader's organization looks like, how it is changing, and what to raise in the next 1:1.",
    keywords: [
      'hrbp',
      'headcount',
      'attrition',
      'turnover',
      'regretted',
      'first-year',
      'promotions',
      'span',
      'layers',
      'talking points',
      '1:1',
      'workforce',
    ],
    route: { view: 'hrbp' },
    tour: 'view-hrbp',
    metrics: [
      'hrbp.headcount.employees',
      'hrbp.attrition.all',
      'hrbp.attrition.voluntary',
      'hrbp.attrition.regretted',
      'hrbp.attrition.firstYear',
      'hrbp.movement.promotionRate',
      'hrbp.org.span',
    ],
    body: [
      {
        p: 'People stats is for HR business partners preparing for leader 1:1s and org reviews. Pick a leader in the filter row to see their whole organization; the rest of the filters narrow it further.',
      },
      { h: 'Overview' },
      {
        p: "Key figures: headcount, hires, attrition, voluntary, regretted and first-year attrition, and promotion rate. With a leader or org filter on, the changes compare with the whole company. Headcount over time, hires and exits by month, the headcount bridge from 12 months ago to today, and the sub-org scorecard: one row per direct report's org (or per business unit) with cells shaded when they are materially off the company. Click a row to focus on that org.",
      },
      { h: 'Workforce, Attrition, Movement and Org design' },
      {
        ul: [
          'Workforce: headcount by department, location and level, tenure, contractors and interns, growth and engineering share.',
          'Attrition: attrition by quarter, regretted attrition, why people left, what leavers say, exits by tenure, level and last rating, and the regretted leavers.',
          'Movement: promotions by quarter and level, transfers and lateral moves, time since last promotion and internal moves.',
          'Org design: span of control, layers, the manager table with its flags, single-report chains and what teams say about their managers.',
        ],
      },
      { h: 'Copy talking points' },
      {
        p: 'The header button copies five to seven plain-text bullets for a leader 1:1: headcount and change, voluntary attrition against the company with the top reason, where regretted exits cluster, first-year attrition, promotion rate and the top finding.',
      },
      { h: MEETING },
      {
        ul: [
          'Is voluntary attrition above the company, and where does it concentrate?',
          'Are regretted exits clustering under one manager?',
          'Which managers have very wide or very narrow spans, or are new with large teams?',
          'Who has gone longest without a promotion?',
        ],
      },
      {
        note: 'Attrition rates are annualized and count employees only; contractors and interns are reported separately. Groups under five people are hidden.',
      },
    ],
  },
  {
    id: 'view-org',
    group: 'views',
    title: 'Org chart',
    summary: 'Who reports to whom, how each team is shaped, and what a reorganization would change.',
    keywords: [
      'reporting lines',
      'tree',
      'hierarchy',
      'reorg',
      'sandbox',
      'scenario',
      'span',
      'org slides',
      'find a person',
      'manager',
    ],
    route: { view: 'org' },
    tour: 'view-org',
    metrics: [
      'org.chart.reportingLines',
      'org.managers.count',
      'org.span.median',
      'org.layers.count',
      'org.flags.structure',
      'org.scenario.moves',
    ],
    body: [
      {
        p: 'The Org chart shows reporting lines on the as-of date, everyone active including contractors and interns. A leader picked in the filter row becomes the top of the chart. The other filters dim the people who do not match instead of removing them, so reporting lines stay readable.',
      },
      { h: 'Chart' },
      {
        ul: [
          'Find a person: type a name, or press / to jump to the search box.',
          'Expand the chart a set number of levels, or open and close one card at a time.',
          'Color the cards by department, location, level, tenure band or business unit.',
          'Open roles shows open requisitions as placeholder cards under their hiring manager. Flags marks span outliers, single-report chains, new managers with large teams and new hires.',
          'Click a card for the detail panel: facts, manager chain, direct reports, team stats, and links to People stats and Talent.',
          'Drag to pan; Ctrl and scroll, or pinch, to zoom. With the keyboard, the arrow keys move through the tree.',
        ],
      },
      {
        p: 'Flags in this org lists every flag as a table. Org slides builds a PowerPoint slide per leader with their direct org.',
      },
      { h: 'Reorg sandbox' },
      {
        p: 'Try a reorganization without touching the data. Drag a card onto the person who should become their manager, or select a card and use "Move to…". Choose whether a move takes the person\'s whole org or just the person. Every change is listed with Undo and Redo (Ctrl+Z and Ctrl+Shift+Z), and the panel shows who changes manager, which spans change, layers and blocked moves. Moving someone under a person in their own reporting line is blocked. Export scenario writes the moves and the resulting roster to Excel.',
      },
      { h: MEETING },
      {
        ul: [
          'Which managers have one report, or twelve or more?',
          'Where would a move leave a manager with no reports, or add a layer?',
          'Who could step up if a leader left?',
        ],
      },
      { note: 'Scenarios stay in this browser. The datasets are never changed.' },
    ],
  },
  {
    id: 'view-services',
    group: 'views',
    title: 'HR ops',
    summary: 'Are employees getting fast, correct answers, and are HR transactions processed on time?',
    keywords: [
      'cases',
      'help desk',
      'sla',
      'service level',
      'csat',
      'transactions',
      'payroll',
      'final pay',
      'leave',
      'return',
      'atlas',
      'backlog',
    ],
    route: { view: 'services' },
    tour: 'view-services',
    metrics: [
      'services.cases.resolutionSla',
      'services.cases.responseSla',
      'services.cases.timeToResolve',
      'services.cases.backlog',
      'services.tx.onTime',
      'services.tx.finalPay',
      'services.leave.onLeave',
      'services.leave.retention',
    ],
    body: [
      {
        p: 'HR ops is for people operations, payroll, benefits and HRIS leads. Every measure is tied to the Hire-to-Retire Atlas process that governs it, by its process ID (for example PY-05 or OF-05).',
      },
      { h: 'Overview' },
      {
        p: 'Cases opened, open backlog, resolution SLA met (target 90%), first response SLA met, median time to resolve, satisfaction and transactions on time (target 98%). Cases opened by month, resolution SLA by month, cases by category and the open backlog by age.',
      },
      { h: 'Cases' },
      {
        p: 'Resolution SLA and time to resolve by category, when cases arrive by weekday and hour, satisfaction by channel, reopened and escalated cases, team workload and the cases open longest.',
      },
      { h: 'HR transactions' },
      {
        p: 'On time by transaction type, days early or late, final pay on time by jurisdiction with the rule for each, and retro adjustments by month. New hire readiness by site moved to Onboarding.',
      },
      { h: 'Leave & return' },
      {
        p: 'Who is on leave now and why (by category only), leave length, returns in the next 30 days with the LV-03 check that systems are ready, return rate, retention 12 months after return, and the Return to work survey. Leave reasons only ever appear in grouped counts, never next to a named person, and this tab is left out of whole-view exports so it does not reach a leader deck by default.',
      },
      { h: 'Service levels' },
      {
        p: 'One row per measurable Atlas KPI: process, measure, target, actual, status (Met, At risk within 5 points, or Missed), the count and the window, with the gap to target.',
      },
      { h: MEETING },
      {
        ul: [
          'Which case categories miss their resolution target, and how many wait on a third party?',
          'Was final pay late in any jurisdiction?',
          'Who returns from leave next week without systems ready?',
          'Did a volume spike explain a dip in service levels?',
        ],
      },
      {
        note: 'Employee relations cases show as counts and timeliness only. They are never tied to a named person. [Employee relations](article:privacy-er)',
      },
    ],
  },
  {
    id: 'view-talent',
    group: 'views',
    title: 'Talent',
    summary:
      'Is performance assessed fairly, do critical roles have successors, who might we lose, and is training done?',
    keywords: [
      'performance',
      'ratings',
      'calibration',
      '9-box',
      'nine box',
      'potential',
      'succession',
      'flight risk',
      'retention',
      'learning',
      'training',
      'high performers',
    ],
    route: { view: 'talent' },
    tour: 'view-talent',
    metrics: [
      'talent.performance.highPerformers',
      'talent.potential.nineBox',
      'talent.succession.criticalCoverage',
      'talent.retention.flightRisk',
      'talent.retention.backTest',
      'talent.retention.keyTalent',
      'talent.learning.requiredOnTime',
    ],
    body: [
      {
        p: 'Talent is for talent management and calibration owners. The folder tab shows the share of critical roles with a successor ready now.',
      },
      { h: 'Overview' },
      {
        p: 'Rated in the latest cycle, high performers (rated 4 or 5, against a 35% guideline), high potentials, critical roles covered, regretted exits of high performers, required training on time and key talent at risk. The 9-box shows performance against potential; click a cell to see the people in it.',
      },
      { h: 'Performance' },
      {
        p: 'Where ratings run high by department and level, the rating mix by business unit, calibration shift (how far final ratings moved from the pre-calibration ones), average rating by cycle and the exit rate within 12 months by rating.',
      },
      { h: 'Potential & succession' },
      {
        p: "Critical and key roles with their best successor's readiness (Covered, Thin or No successor), bench strength by business unit, and high potentials by level and business unit.",
      },
      { h: 'Retention risk' },
      {
        p: "Each person's flight-risk score from 0 to 100 adds up plain factors: time since last promotion, tenure in the 1 to 3 year peak, a rating drop, a high rating without promotion, attrition in their department, a new manager, peers leaving and a low compa-ratio. Each factor gives points and a reason. The back-test scores everyone as of 12 months ago and shows how many in each band then left, so you can judge whether the model separates leavers from stayers.",
      },
      { h: 'Learning' },
      {
        p: 'Required training on time by course, completions by month, what is overdue today, learning hours per employee and what learners say.',
      },
      { h: MEETING },
      {
        ul: [
          'Is any business unit rating well above the guideline?',
          'Which critical roles have no successor ready now, and is the incumbent at risk?',
          'Which key people at high risk need a stay conversation this month?',
          'Which required courses are overdue, and where?',
        ],
      },
      {
        note: 'The flight-risk score is a prompt for a conversation, not a prediction about a person. Read the reasons, not just the band.',
      },
    ],
  },
  {
    id: 'view-comp',
    group: 'views',
    title: 'Compensation',
    summary:
      'Is pay where policy says, fair against performance and the market, and is the merit cycle on budget?',
    keywords: [
      'pay',
      'salary',
      'compa-ratio',
      'range',
      'penetration',
      'merit',
      'budget',
      'market',
      'compression',
      'bonus',
      'equity',
      'total rewards',
    ],
    route: { view: 'comp' },
    tour: 'view-comp',
    metrics: [
      'comp.compa.median',
      'comp.compa.inBand',
      'comp.position.belowMin',
      'comp.position.penetration',
      'comp.merit.spend',
      'comp.merit.differentiation',
      'comp.market.median',
    ],
    body: [
      {
        p: 'Compensation is for total rewards and comp partners. Ratios (compa-ratio, range penetration, merit %) always show. Pay amounts show only while "Show pay amounts" is on, for this session only. [Pay amounts](article:privacy-pay)',
      },
      { h: 'Overview' },
      {
        p: 'Median compa-ratio, share in the healthy band (0.90 to 1.10 by default), below range minimum, above maximum, merit spend against budget, pay for performance and median market ratio. The compa-ratio distribution, range position by business unit, and median compa-ratio by location, level and department.',
      },
      { h: 'Range position' },
      {
        p: 'Range penetration by level, compa-ratio by tenure, the people below minimum or above maximum (gap amounts only with pay amounts on), and pay compression: new hires against incumbents in the same department and level.',
      },
      { h: 'Pay for performance' },
      {
        p: 'Compa-ratio by rating, merit by rating against the guideline, the merit matrix (rating by range position), differentiation by department (merit for ratings 4 to 5 divided by merit for rating 3), and bonus and equity by rating.',
      },
      { h: 'Market and Merit cycle' },
      {
        ul: [
          'Market: gap to the market median by job family, location and level, and the jobs furthest below market.',
          'Merit cycle: merit spend by business unit against the budget, the merit distribution, guideline exceptions, promotions in this cycle and the total rewards mix by level.',
        ],
      },
      {
        p: 'The merit budget, the healthy band and the merit guideline by rating are settings of the Compensation metrics. The header\'s "Cycle settings" button opens them in Metric definitions.',
      },
      { h: MEETING },
      {
        ul: [
          'Where is the median compa-ratio low, and is attrition there above the company?',
          'How many people are below their range minimum?',
          'Is the merit cycle differentiating enough between strong and solid performers?',
          'Which business units are over the merit budget?',
        ],
      },
    ],
  },
  {
    id: 'view-compliance',
    group: 'views',
    title: 'Compliance',
    summary: 'Is everyone allowed to work, verified on time and licensed for the technology they touch?',
    keywords: [
      'right to work',
      'work authorization',
      'visa',
      'reverification',
      'i-9',
      'export control',
      'license',
      'deadlines',
      'statutory',
      'calendar',
    ],
    route: { view: 'compliance' },
    tour: 'view-compliance',
    metrics: [
      'compliance.work.expiring',
      'compliance.work.reverificationOnTime',
      'compliance.work.reverificationOverdue',
      'compliance.i9.section2OnTime',
      'compliance.export.withoutLicense',
      'compliance.deadlines.upcoming',
    ],
    body: [
      {
        p: 'Compliance is for people operations, global mobility and trade compliance. For a semiconductor company, work authorization and export control carry real risk, so this view lists people by name where a deadline needs action.',
      },
      { h: 'Overview' },
      {
        p: 'Authorizations expiring in 90 days, reverification on time (started at least 90 days before expiry, target 100%), reverification overdue, I-9 Section 2 within 3 business days, people working without an export license in force (should be 0) and required training on time. Expiries by month, reverification by quarter, deadlines in the next 60 days and a training and acknowledgments summary.',
      },
      { h: 'Right to work, Export control and Deadlines' },
      {
        ul: [
          'Right to work: expiring authorizations with days to expiry and reverification status, the authorization mix and I-9 Section 2 on time by site.',
          'Export control: licenses by status, people working without a license in force, and upcoming starts with a license still pending.',
          'Deadlines: the statutory calendar from the Hire-to-Retire Atlas for every jurisdiction where someone in scope works, with its sources.',
        ],
      },
      {
        p: 'Authorization types are broad categories only, and each person\'s type shows only while "Show immigration details" is on for the session. Counts by type always show. [Immigration details](article:privacy-immigration)',
      },
      { h: MEETING },
      {
        ul: [
          'Whose authorization ends in the next 90 days with no reverification started?',
          'Is anyone working, or about to start, without an export license in force?',
          'Which statutory deadlines fall in the next 60 days?',
        ],
      },
      {
        note: 'The statutory calendar is a working draft. Confirm dates and obligations with employment counsel.',
      },
    ],
  },
  {
    id: 'view-listening',
    group: 'views',
    title: 'Listening',
    summary:
      'What candidates, new starters, employees, leavers and service users tell us, tied to the operational numbers.',
    keywords: [
      'survey',
      'surveys',
      'nps',
      'enps',
      'engagement',
      'pulse',
      'exit survey',
      'stay interview',
      'feedback',
      'response rate',
      'waves',
    ],
    route: { view: 'listening' },
    tour: 'view-listening',
    metrics: [
      'listening.programs.responseRate',
      'listening.score.candidateExperience',
      'listening.onboarding.readiness',
      'listening.exit.wouldReturn',
      'listening.drivers.score',
      'listening.managers.upward',
    ],
    body: [
      {
        p: 'Listening brings every survey program together: candidate experience, hiring manager satisfaction, onboarding pulses, stay interviews, exit surveys, upward feedback, HR service, return to work and training evaluation. Findings tie a score to what the operational numbers show, for example a low day-30 score where laptops shipped late.',
      },
      { h: 'Overview' },
      {
        p: 'Survey programs: the latest wave of each, respondents, response rate against target, the headline score, the change since the last wave and its status. The wave calendar shows when each program ran in the last 12 months.',
      },
      { h: 'The area tabs' },
      {
        p: 'Candidates & hiring, Onboarding, Stay & exit, Managers, and Services & learning each show their surveys: score by driver against target, a driver heat table by org, location or tenure, the change since the last wave, and cuts such as candidate NPS by stage, exit reasons by location or upward feedback by manager.',
      },
      {
        p: 'Engagement and eNPS show only when you turn on engagement surveys in [Settings, Privacy](settings:privacy). While it is off, engagement answers are ignored everywhere.',
      },
      { h: 'Privacy' },
      {
        p: 'Every survey number is grouped. A group needs at least five respondents, and a cut by manager needs ten over the last four quarters. Numbers open grouped results, never answers or people, and free-text comments are never imported. [Surveys](article:privacy-surveys)',
      },
      { h: MEETING },
      {
        ul: [
          'Which driver scores lowest against target, and what operational number explains it?',
          'Did the change since the last wave move the right way?',
          'Is the response rate high enough to trust the result?',
        ],
      },
      {
        note: "Each survey's headline also shows as one number in the view it belongs to, with a link back here.",
      },
    ],
  },
  {
    id: 'view-ai',
    group: 'views',
    title: 'AI in HR',
    summary: 'Which AI agents the HR team has, what each one is for, and when not to use it.',
    keywords: ['ai', 'agents', 'glean', 'prompts', 'catalog', 'responsible use', 'guardrails'],
    route: { view: 'ai' },
    tour: 'view-ai',
    body: [
      {
        p: 'AI in HR is a catalog of the Glean agents the HR team can use, grouped by HR area. Agents assist and people decide: no agent makes a hiring, rating or pay decision. Share only the data an agent is approved for, and check what it gives you before you use it.',
      },
      { h: 'Reading an agent' },
      {
        ul: [
          'Its HR area, audience (HR team, managers or employees) and status (Sample, Pilot or Live).',
          'What it does, "Use it for" and "Don\'t use it for".',
          'Example prompts, each with a Copy button.',
          'The data it draws on, its owner team and "Open in Glean", which opens in a new tab. Sample links are marked as such.',
        ],
      },
      { h: 'Finding an agent' },
      {
        p: 'Filter by HR area, audience and status, or search names, descriptions and uses. Search matches the start of words, so "verif" finds "verification". The counts in "Agents by area" filter the list. Each practice view also has a quiet "AI agents for…" link that opens this tab filtered to its area.',
      },
      { h: 'Keeping the catalog' },
      {
        p: 'Add, edit and remove agents in place, import or download the "AI agents" Excel sheet from the Catalog menu, or reset to the sample. The catalog is kept in this browser. Links must be web addresses (http or https).',
      },
      {
        note: 'AI in HR reads no datasets, so it has no filter row, no tiers and no as-of date. Every sample entry is clearly marked.',
      },
    ],
  },
  {
    id: 'view-actions',
    group: 'views',
    title: 'Action center',
    summary: "What is open, who it waits on, and what to raise in this week's review with each leader.",
    keywords: [
      'actions',
      'to do',
      'open items',
      'overdue',
      'follow up',
      'owners',
      'copy note',
      'snooze',
      'handled',
      'my team',
    ],
    route: { view: 'actions' },
    tour: 'view-actions',
    metrics: [
      'actions.items.open',
      'actions.items.overdue',
      'actions.items.dueSoon',
      'actions.items.critical',
      'actions.owners.withOpen',
    ],
    body: [
      {
        p: 'The Action center collects the open items every view raises: candidates waiting on a decision, starts not ready, probation decisions, cases past target, overdue transactions, returns from leave without systems ready, overdue training, reverifications, I-9s and export licenses. Open it from the Actions button in the masthead; the number on the button is the open count.',
      },
      { h: 'My team' },
      {
        p: 'Pick a manager in "My team" (it sets the leader filter) to see items about people in their org and items they or their org own anywhere in the company. "Waiting on" narrows to the leader, their org or others.',
      },
      { h: 'Reading the list' },
      {
        ul: [
          'Key figures: open, overdue, critical, due soon and owners with open items.',
          'Where items wait (by owner group and due date) and where they come from (by view).',
          'One sheet per owner group, such as Managers, Recruiters or People operations, with a block per owner.',
          'Each item: severity, what is open in plain words, who or what it is about, where it comes from, and when it is due ("Due in 3 d", "4 d overdue").',
        ],
      },
      { h: 'Working the list' },
      {
        ul: [
          'Copy note writes one polite message per owner with their items, ready to paste into an email or chat.',
          'Mark handled or Snooze for 7 days once an item is in hand. Undo or Reopen puts it back. These marks are kept in this browser.',
          'Filter by owner group, severity, due date or view, or search for an owner, person or req.',
          'Export list writes the filtered list and a by-owner sheet to Excel.',
        ],
      },
      {
        note: 'Items follow the data standard like any number, and the page says how many are hidden and why. An employee relations item never names a person.',
      },
    ],
  },
]
