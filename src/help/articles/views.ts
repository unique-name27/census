/**
 * Help articles, Each view: what the view answers, how to read each tab, questions to ask in a
 * meeting, and its key definitions (listed from the metric dictionary under "Definitions").
 */
import type { HelpArticle } from '../types'
import {
  ALL_PRACTICES,
  DATA_ROOM,
  DEVELOPER,
  EVERY_ITEM,
  FINANCE,
  HR,
  HRBP,
  MANAGER,
  NO_DATA_ROOM,
  NO_PAY,
  PAY_SWITCH,
  PAY_TOTALS,
  RECRUITER,
  ROLE_HOME,
  ROLE_LISTS,
  SCOPED,
  SOME_PRACTICES,
} from './when'

const MEETING = 'Questions to ask in a meeting'

/** A role home's Needs attention (docs/ROLES-V2.md 5.2). */
const HOME_NEEDS =
  'Needs attention: your own open items, the most pressing first (legal exposure, then severity, then days overdue), the same items the [Action center](route:actions) lists as yours. "Where your items wait" shows them by kind and due date. "Waiting on others" opens the Action center on the items in your area that someone else holds.'

/** The escalations HR, the CHRO and Developer read on the Scorecard (5.11). */
const ESCALATIONS =
  'Where open items wait, by owner group and due date, and the escalations across every practice: legal exposure, critical roles at high risk of loss, exit clusters and critical items long overdue. [Open the Action center](route:actions) for every item.'

/** Manager and Recruiter mode leave I-9 tasks out of readiness by task (4.2). */
const NO_I9 =
  'In this mode I-9 tasks are left out of readiness: the I-9 is a compliance measure, kept by people operations.'

/** Manager and Finance mode: contingencies by who holds them (4.2). */
const MASKED =
  'In this mode a background check or export screening reads as the team holding it ("With People ops", "With Trade compliance"), never where it stands.'

/** HR, CHRO and Developer: the Action center lists every item. */
const EVERY_ITEM_LIST =
  'This mode lists every open item, grouped by who it waits on, and the number on the Actions button is the open count.'

export const VIEW_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'view-home',
    group: 'views',
    title: 'Home',
    summary:
      "Your role's first page: the number you are judged on, what needs attention and the records you work on.",
    keywords: [
      'home',
      'my home',
      'executive home',
      'chro',
      'hrbp',
      'needs attention',
      'my list',
      'waiting on others',
      'escalations',
      'role',
    ],
    route: { view: 'home' },
    tour: 'view-home',
    metrics: ['actions.items.open', 'actions.items.critical'],
    body: [
      {
        p: "Home is your mode's first page, shaped for your role. Every number on it is the producing view's own number for the scope on screen, so it matches that view, and every number opens the records behind it.",
        ...ROLE_HOME,
      },
      {
        p: 'Home is the first page of the CHRO, HRBP, Compensation, Talent management, HR ops, Recruiter and Finance modes. Each mode draws its own home; switch to one with Mode to see it. The sections below describe each one.',
        ...DEVELOPER,
      },
      { h: 'Every home has three parts' },
      {
        ul: [
          'At the top, the one number the role is judged on, with how it splits under it, beside the key figures and the lead charts.',
        ],
      },
      { ul: [HOME_NEEDS], unless: 'figure:home-chro-standing' },
      { ul: [HOME_NEEDS], ...DEVELOPER },
      {
        ul: [
          'Top risks: the escalations across every practice, each with who holds it, then the risks the data shows. "Escalations by practice" shows where they come from and when they fall due.',
        ],
        surface: 'figure:home-chro-standing',
      },
      {
        ul: [
          'My list: one table of the records you work on, sortable, with every row in its export. Where there are two or three lists, a switch above the table picks one.',
          'Each section shows its first rows; "Show all" lists the rest.',
        ],
      },
      { h: 'Executive home (CHRO)', surface: 'figure:home-chro-standing' },
      {
        ul: [
          'Targets met, the key figures (headcount, voluntary and regretted attrition, open reqs and critical open items) and every measure against its target, by practice.',
          'Escalations: every item with legal exposure (an export license, an I-9, a work authorization, final pay), critical roles with no successor and the incumbent at high risk of loss, three or more regretted exits from one team in 12 months, and critical items more than 14 days overdue.',
          'Top risks in the data: the critical and warning findings across every practice, each practice\'s most serious first, with "Open in" to go to the view.',
          "My list, Leaders' orgs: each direct report of the top leader, with headcount, voluntary and regretted attrition against the company, open reqs, critical items, critical roles covered and their HR business partner. A row focuses every view on that org.",
          'Headcount over time, and voluntary attrition by business unit against the company.',
          '"Monthly people report", in the header, builds the deck or workbook for the monthly people review.',
        ],
      },
      { h: 'HR business partner', surface: 'figure:home-hrbp-standing' },
      {
        ul: [
          'Targets met and every measure against its target for your business unit or region, with headcount and attrition against the company, open reqs and starts in the next 30 days.',
          'What to raise: up to six findings from People stats, Recruiting, Onboarding and Talent for your scope.',
          'Needs attention holds your own kinds of item: spans of control, single-report chains, new managers with large teams, promotions to review, low upward feedback, exit survey reasons and stay conversations whose manager has left. Hiring steps, day-one tasks, probation decisions, training, compliance and HR ops items in your scope are Waiting on others. Employee relations cases are counted, never listed, and left out in a scope under 5 people.',
          "My list: the unit's leaders, or the region's sites, and the key talent at risk. A leader's row focuses every view on their org, ready for Copy talking points on People stats; a site's row filters to the site.",
          'Voluntary attrition by department or by site and over the last 12 months, open reqs by age and candidates past the screen, and the pipeline today.',
          'Company numbers are comparisons only and open no records. "Monthly people report", in the header, covers your scope.',
        ],
      },
      { h: 'Compensation', surface: 'figure:home-comp-in-band' },
      {
        ul: [
          "The share of people in the healthy band, over everyone's position in their range, then median compa-ratio, below minimum, above maximum, merit spend against budget, proposals entered and pay for performance.",
          'The compa-ratio distribution, merit cycle progress by business unit, median compa-ratio by location and level, and who is below the range minimum by location and cause.',
          "Needs attention: one item for everyone paid below their range minimum, merit outside the guideline, merit spend over budget, high performers paid low in range and merit proposals missing, by business unit. They fall due on the cycle close date set in [Settings, Compensation cycle](settings:compensation); amounts never sit in an item's text.",
          'My list: the people below their range minimum or above their maximum. Amounts show only while "Show pay amounts" is on.',
        ],
      },
      { h: 'Talent management', surface: 'figure:home-talent-coverage' },
      {
        ul: [
          'Succession coverage of critical roles by best successor readiness, then rating coverage, high performers, high potentials, key talent at risk, required training on time and regretted exits of high performers.',
          'Succession exposure, required training overdue by month, rating coverage by business unit and the rating mix against the guideline.',
          "Needs attention: critical roles without a ready successor, required courses below their on-time target, ratings missing in the latest cycle, stay conversations and training with no manager on record. Training overdue for one manager's team is that manager's item.",
          'My list: the critical roles and their bench, or the high potentials.',
        ],
      },
      { h: 'HR ops', surface: 'figure:home-ops-sla' },
      {
        ul: [
          'Resolution SLA met, over where every open case stands against its target, then the backlog, transactions on time, final pay on time, returns in the next 30 days, day -3 tasks and I-9 Section 2 on time.',
          'The open backlog by age, resolution SLA by month, on time by transaction type and day-one readiness by owner.',
          'Needs attention: cases past target, transactions past due, returns from leave without systems ready, I-9 Section 2, work authorizations to reverify, export licenses and day-one tasks that are overdue, blocked or not started. Probation decisions and day-30 readiness are Waiting on others.',
          'My list: the open case queue, transactions in flight, or returns from leave in the next 30 days (never the leave reason). Employee relations cases are counted under the list, never listed.',
        ],
      },
      { h: 'Recruiter', surface: 'figure:home-rec-next-step' },
      {
        ul: [
          'Candidates lacking a next step, by what they wait on, then open reqs, active candidates, offers out, hires, and time to fill and offer acceptance against all reqs.',
          'The pipeline today, waiting time by stage, open reqs by age and candidates past the screen, and the countdown to day one for your starts.',
          "Needs attention: applications to review, offers to send, offers waiting on an answer, empty funnels, reqs past their time-to-fill target and interviews to schedule where the req has no coordinator. Interview decisions are the hiring manager's, under Waiting on others, with a note to copy. No item sits on a req on hold, cancelled, filled or closed.",
          'My list: your open reqs with their pipeline, or your candidates in the queue.',
        ],
      },
      { h: 'Finance', surface: 'figure:home-fin-vs-plan' },
      {
        ul: [
          'Headcount against the budget, by month and by business unit, with the monthly cost against budget. With no budget loaded, starts against the hiring plan instead.',
          "Net change, open reqs, open reqs not in the plan, contractors and interns, and target cash cost, then open reqs against the plan, the workforce mix and cost by cost center. Cost totals cover groups of 5 or more people; no number is one person's pay.",
          'Needs attention: open reqs not in the plan, hiring behind plan by business unit and department, and planned roles with no open req. None of them is about one person.',
          'My list: the departments behind the hiring plan, or the cost centers.',
        ],
      },
      { h: MEETING },
      {
        ul: [
          'Which of my items is overdue, and who holds the ones waiting on others?',
          'Which number on my home missed its target this month, and where does the miss sit?',
        ],
      },
      {
        note: 'A business unit, region or set of reqs with fewer than 5 people (5 candidates, for reqs) shows counts and lists, with every rate hidden to protect anonymity.',
        ...SCOPED,
      },
    ],
  },
  {
    id: 'view-team',
    group: 'views',
    title: 'My team',
    summary: "One manager's org on one page: people, hiring, starts, talent and what waits on them.",
    keywords: [
      'manager',
      'my org',
      'my team',
      'team page',
      'direct reports',
      'manager mode',
      'span',
      'starts',
      'successors',
      'overdue training',
    ],
    route: { view: 'team' },
    tour: 'view-team',
    metrics: [
      'hrbp.headcount.employees',
      'hrbp.attrition.voluntary',
      'hrbp.attrition.regretted',
      'hrbp.attrition.firstYear',
      'hrbp.workforce.tenure',
      'hrbp.org.span',
      'recruiting.reqs.open',
      'recruiting.pipeline.activeCandidates',
      'onboarding.upcoming.starts',
      'onboarding.upcoming.readiness',
      'talent.performance.ratingDistribution',
      'talent.succession.criticalCoverage',
      'talent.learning.requiredOnTime',
      'talent.learning.overdue',
      'actions.items.open',
    ],
    body: [
      {
        p: "My team is Manager mode's home: one manager's org on one page. Every number is the producing view's own, for the org, so it matches People stats, Recruiting, Onboarding and Talent, and every number opens the people and records behind it.",
      },
      { h: 'Key figures and what needs attention' },
      {
        ul: [
          'Key figures: headcount, voluntary and regretted attrition against the company, open reqs, starts in the next 30 days, required training on time, and your open items. Each tile opens the tab that explains it.',
          "Needs attention: your own open items (interview decisions, probation decisions, your team's training, stay conversations), the most pressing first, and one switch away the items in your org that someone else holds, such as day-one tasks with People operations.",
          'What the data shows: up to six findings from People stats, Recruiting, Onboarding and Talent for the org, critical first, each tagged with its view and "Open in" to go there.',
          'Headcount over time: employees at each month end for two years, the year before in gray.',
        ],
      },
      { h: 'People' },
      {
        ul: [
          'Hires and exits by month, and attrition against the company: voluntary, regretted and first-year. Company bars are a comparison only and open no records.',
          'Tenure, people by level, and direct reports per manager, against the company median span. A glyph and a word mark an Overloaded, Heavy or Light span.',
        ],
      },
      { h: 'Hiring' },
      {
        ul: [
          "Pipeline today: active candidates on the org's reqs by stage and next step, as on [Recruiting, Pipeline](route:recruiting.pipeline).",
          'Starts by week: who starts in each of the next weeks, by day-one readiness (Ready, On track, Behind, Not ready).',
          'Open reqs and upcoming starts, one row each, with their health or readiness.',
        ],
      },
      { h: 'Talent' },
      {
        ul: [
          'Ratings in the latest cycle against the guideline.',
          "Critical roles by their best successor's readiness, and each critical role with its bench. A successor outside the org shows by readiness only.",
          'Required training on time by course, and every overdue assignment.',
        ],
      },
      { h: 'My list' },
      {
        p: 'Everyone in your org, your direct reports first: their start date, whether they are in their first 90 days, a probation decision still open, overdue required courses and the open reqs they own. A row opens the person.',
      },
      { h: 'The Action center', surface: 'page:actions' },
      {
        p: 'The [Action center](route:actions) lists every item in Needs attention and Waiting on others, with Mark handled, Snooze and a note to copy for each owner.',
        surface: 'page:actions',
      },
      { h: MEETING },
      {
        ul: [
          'Which manager has the most direct reports, and is anyone carrying too many?',
          'Who starts in the next two weeks without their day-one tasks done?',
          'Which critical role has no successor ready, and who could be developed for it?',
        ],
      },
      {
        note: 'An org of fewer than 5 employees shows counts and lists, but rates are hidden to protect anonymity. My team shows no pay, survey results, HR cases, compliance details, exit reasons or flight-risk scores.',
      },
    ],
  },
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
        ...HR,
      },
      {
        p: 'The Scorecard answers one question for the monthly people review: how is each practice doing against its targets, and what needs attention first?',
        surface: 'view:home',
      },
      {
        p: 'In HRBP mode it is the scorecard of your business unit or region: every measure, finding and chart counts the people in it, and the company is a comparison only.',
        ...HRBP,
      },
      { h: 'At the top' },
      {
        ul: [
          'Targets met: how many measures with a target meet it, and a bar split into Met, Watch, Missed, No target and Not shown. Click a part of the bar to list its measures; each value opens its records.',
        ],
      },
      {
        ul: [
          'Key figures: headcount, voluntary attrition, open reqs and critical open items, each opening the tab that explains it.',
        ],
        surface: 'view:recruiting',
      },
      {
        ul: [
          'Key figures: headcount, voluntary attrition and critical open items, each opening the tab that explains it.',
        ],
        unless: 'view:recruiting',
      },
      {
        ul: [
          'Measures against target: every measure as a bar on its own scale with its target as a tick. "Furthest from target" puts the biggest misses first. Click a bar for its records, or a measure name to open its view.',
        ],
      },
      { h: 'How the workforce is moving and where the pressure is' },
      {
        ul: [
          'Headcount over time, hires and exits by month, and voluntary and regretted attrition by quarter.',
          'Voluntary attrition by business unit against the company.',
        ],
      },
      { ul: ['The pipeline today, by stage and next step.'], surface: 'view:recruiting' },
      { h: 'Needs attention' },
      { p: ESCALATIONS, ...EVERY_ITEM },
      { p: ESCALATIONS, ...DEVELOPER },
      {
        p: 'Where your items wait, and your own open items, the most pressing first: the same Needs attention as your home and the [Action center](route:actions).',
        ...ROLE_LISTS,
      },
      { h: 'People scorecard' },
      {
        p: "One row per measure, two or three for each practice: Recruiting, Onboarding, People stats, HR ops, Talent, Compensation, Compliance and Listening. Each row shows the value, the target, the status, the change, a trend line and the tier badge. The values come from each view's own calculation, so they always match the view.",
        ...ALL_PRACTICES,
      },
      {
        p: "One row per measure, two or three for each practice this mode shows. Each row shows the value, the target, the status, the change, a trend line and the tier badge. The values come from each view's own calculation, so they always match the view.",
        ...SOME_PRACTICES,
      },
      {
        ul: [
          'Met: the value meets its target.',
          'Watch: it misses by less than the watch margin (5 points for shares, 10% of the target for other units).',
          'Missed: it misses by more than that.',
        ],
      },
      {
        ul: ['No target: the metric has none yet. "Set a target" opens it in Metric definitions.'],
        ...DATA_ROOM,
      },
      { ul: ['No target: the metric has none yet.'], ...NO_DATA_ROOM },
      {
        p: 'Click a value to see its records. Click a practice name to open that view at the tab the measure comes from. The Targets button lists every target with a link to change it in [Metric definitions](route:data.metrics); there is no second place to edit a target.',
        ...DATA_ROOM,
      },
      {
        p: 'Click a value to see its records. Click a practice name to open that view at the tab the measure comes from. The Targets button lists every target; HR keeps them in one place, so every view judges a measure against the same one.',
        ...NO_DATA_ROOM,
      },
      { h: 'Top findings across Census' },
      {
        p: "Up to eight findings from every view's readout, critical first. Each practice's most serious finding comes before any practice's second, so one busy practice never fills the list. Each finding is tagged with its practice and has \"Open in\" to go there.",
      },
      { h: 'Monthly people report', surface: 'export:monthly-report' },
      {
        p: "The header button builds the report as a PowerPoint deck or an Excel workbook: targets met by practice, the scorecard, the top findings and each practice's lead chart, stamped with the scope, window, as-of date and data standard.",
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
      'bottleneck',
      'next step',
    ],
    keywordsWhere: [{ surface: 'tab:recruiting.sources', words: ['sources', 'decline reasons'] }],
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
      {
        p: 'In Recruiter mode every tab keeps to your reqs. Time to fill, offer acceptance and days waiting compare with all reqs ("vs all reqs"), as comparisons that open no records.',
        ...RECRUITER,
      },
      {
        p: 'In Finance mode Recruiting shows the Requisitions tab: the open reqs, how old they are and how fast they fill.',
        ...FINANCE,
      },
      { h: 'Overview', surface: 'tab:recruiting.overview' },
      {
        p: 'Key figures: open reqs, offers accepted, median time to fill, median time to hire, offer acceptance and candidates lacking a next step. The lead chart, Pipeline today, shows active candidates at each stage by their next-step state.',
      },
      {
        p: 'Hires vs plan compares hires with the hiring plan and opens Onboarding, Hiring plan.',
        surface: 'tab:onboarding.plan',
      },
      { h: 'Pipeline', surface: 'tab:recruiting.pipeline' },
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
        p: 'Open requisitions with their health (Empty funnel, a number lacking a next step, or On track), open req age, reqs opened and filled by month and time to fill by department.',
      },
      {
        p: 'Recruiter load shows the open reqs and active candidates each recruiter holds.',
        surface: ['figure:recruiting-recruiter-load', 'view:hrbp'],
      },
      {
        p: 'Recruiter load shows your own open reqs and active candidates.',
        surface: ['figure:recruiting-recruiter-load', 'view:recruiting'],
        unless: 'view:hrbp',
      },
      { h: 'Sources & offers', surface: 'tab:recruiting.sources' },
      {
        p: 'Source effectiveness, applications by source by month, offer acceptance by location, why offers were declined and why candidates left the process.',
      },
      {
        p: 'What candidates say shows one number from the candidate experience survey.',
        surface: 'tab:listening.candidates',
      },
      { h: MEETING },
      {
        ul: [
          'Which stage is the bottleneck this month, and in which department?',
          'Which candidates are waiting on an interview decision, and can the panel decide this week?',
        ],
        surface: 'tab:recruiting.pipeline',
      },
      { ul: ['Which open reqs have an empty funnel after 30 days?'] },
      {
        ul: ['Which business units have the most open reqs, and how long have they been open?'],
        ...FINANCE,
      },
      {
        ul: ['Is offer acceptance falling anywhere, and what reasons do candidates give?'],
        surface: 'tab:recruiting.sources',
      },
    ],
  },
  {
    id: 'view-onboarding',
    group: 'views',
    title: 'Onboarding',
    summary: 'Who starts in the next 90 days, will they be ready on day one, and are we hiring to plan?',
    without: [
      {
        surface: 'tab:onboarding.upcoming',
        summary:
          'How the first 90 days are going: day-one readiness, check-ins, probation decisions and early leavers.',
      },
      { when: RECRUITER, summary: 'Who starts in the next 90 days, and will they be ready on day one?' },
      {
        surface: 'tab:onboarding.first90',
        summary: 'Who starts in the next 90 days, will they be ready on day one, and are we hiring to plan?',
      },
      {
        surface: 'tab:onboarding.plan',
        summary:
          'Who starts in the next 90 days, will they be ready on day one, and how are the first 90 days going?',
      },
    ],
    keywords: [
      'new hires',
      'starts',
      'day one',
      'readiness',
      'probation',
      'check-ins',
      'renege',
      'preboarding',
    ],
    keywordsWhere: [
      { surface: 'tab:onboarding.plan', words: ['hiring plan'] },
      { surface: 'metric:onboarding.first90.i9Section2', words: ['i-9'] },
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
        p: 'Onboarding answers: who starts in the next 90 days, will each of them be ready on day one, and how are the first 90 days going? It reads the Onboarding tasks dataset when it is loaded, and shows what it can without it.',
        surface: ['tab:onboarding.upcoming', 'tab:onboarding.first90'],
      },
      {
        p: 'Onboarding answers: who starts in the next 90 days, and will each of them be ready on day one? It reads the Onboarding tasks dataset when it is loaded, and shows what it can without it.',
        surface: 'tab:onboarding.upcoming',
        unless: 'tab:onboarding.first90',
      },
      {
        p: "Onboarding answers how new starters' first 90 days are going: day-one readiness, required training, check-ins, probation decisions and early leavers.",
        unless: 'tab:onboarding.upcoming',
      },
      {
        p: 'The Hiring plan tab answers whether hiring is on plan, from the Hiring plan dataset.',
        surface: 'tab:onboarding.plan',
      },
      { h: 'Upcoming starts', surface: 'tab:onboarding.upcoming' },
      {
        p: 'Starts in the next 30, 60 and 90 days, day -3 tasks not done, open contingencies (background check or export screening not done), median offer accepted to start and the renege rate. The start calendar shows weekly starts by business unit; the Upcoming starts table lists each person with their readiness ("7 of 9 done") and the item blocking it. Readiness by task and by owner show which teams are behind.',
      },
      {
        p: 'Readiness status: Ready when every day-one task is done, On track when none is past due, Behind when any is past due, and Not ready when the person starts within 3 days with a task still open.',
      },
      { p: NO_I9, ...MANAGER },
      { p: NO_I9, ...RECRUITER },
      { p: MASKED, ...MANAGER },
      { p: MASKED, ...FINANCE },
      { h: 'First 90 days', surface: 'tab:onboarding.first90' },
      {
        p: 'Day-one readiness, required training within 30 days, check-ins on time, probation decisions overdue and early voluntary attrition (within 90 days). Day-one readiness by site, check-ins by department, probation decisions due, and early leavers by department and hiring manager.',
      },
      {
        p: 'I-9 Section 2 on time is the share of US starts whose Section 2 was completed by its deadline.',
        surface: 'metric:onboarding.first90.i9Section2',
      },
      {
        p: 'What new starters say shows one number from the day-30 onboarding pulse, by region.',
        surface: 'figure:onboarding-pulse',
      },
      { h: 'Hiring plan', surface: 'tab:onboarding.plan' },
      {
        p: 'Plan, actual, committed and forecast starts by month; plan coverage by business unit and department with On plan, Behind or Ahead; planned roles with no open req; and open reqs not in the plan. When several plan versions are loaded, the latest is used and named.',
      },
      { h: MEETING },
      {
        ul: [
          'Who starts next week without a cleared background check or a laptop?',
          'Which owner (IT, Facilities, People operations, Trade compliance or the manager) is behind on day-one tasks?',
          'Are reneges concentrated in one location?',
        ],
        surface: 'tab:onboarding.upcoming',
      },
      {
        ul: ['Which departments miss their check-ins, and which probation decisions are overdue?'],
        surface: 'tab:onboarding.first90',
        unless: 'tab:onboarding.upcoming',
      },
      {
        ul: ['Which business units are behind plan, and do the missing roles have open reqs?'],
        surface: 'tab:onboarding.plan',
      },
      {
        note: 'Without Onboarding tasks, readiness numbers show "—" with "No onboarding tasks loaded", never 0%.',
      },
      {
        note: 'Without a Hiring plan, the Hiring plan tab shows how to load one.',
        surface: 'tab:onboarding.plan',
      },
    ],
  },
  {
    id: 'view-hrbp',
    group: 'views',
    title: 'People stats',
    summary:
      "What a leader's organization looks like, how it is changing, and what to raise in the next 1:1.",
    without: [
      {
        when: FINANCE,
        summary: 'What the workforce looks like, how it is changing, and where it is growing.',
      },
    ],
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
    keywordsWhere: [
      {
        surface: 'tab:hrbp.analyses:quality',
        words: ['quality of hire', 'university', 'degree', 'field of study'],
      },
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
        surface: 'filter:leader',
      },
      {
        p: 'People stats shows what the workforce looks like and how it is changing. Pick a business unit in the filter row to see one on its own.',
        ...FINANCE,
      },
      { h: 'Overview' },
      {
        p: "Key figures: headcount, hires, attrition, voluntary, regretted and first-year attrition, and promotion rate. With a leader or org filter on, the changes compare with the whole company. Headcount over time, hires and exits by month, the headcount bridge from 12 months ago to today, and the sub-org scorecard: one row per direct report's org (or per business unit) with cells shaded when they are materially off the company. Click a row to focus on that org.",
        surface: 'metric:hrbp.scorecard.offCompany',
      },
      {
        p: 'Key figures: headcount, hires, and attrition, voluntary, regretted and first-year. Headcount over time, hires and exits by month, and the headcount bridge from 12 months ago to today.',
        unless: 'metric:hrbp.scorecard.offCompany',
      },
      { h: 'Workforce and Attrition' },
      {
        ul: [
          'Workforce: headcount by department, location and level, tenure, contractors and interns, growth and engineering share.',
        ],
      },
      {
        ul: [
          'Attrition: attrition by quarter, regretted attrition, why people left, exits by tenure, level and last rating, and the regretted leavers.',
        ],
        surface: 'metric:hrbp.attrition.exitReasons',
      },
      {
        ul: [
          'Attrition: attrition by quarter and regretted attrition, by tenure and level, as rates and counts.',
        ],
        unless: 'metric:hrbp.attrition.exitReasons',
      },
      {
        ul: ['What leavers say in the exit survey, beside the exit reasons.'],
        surface: 'tab:listening.stay-exit',
      },
      { h: 'Movement', surface: 'tab:hrbp.movement' },
      {
        p: 'Promotions by quarter and level, transfers and lateral moves, time since last promotion and internal moves.',
      },
      { h: 'Org design', surface: 'tab:hrbp.org' },
      {
        p: 'Span of control, layers, the manager table with its flags and single-report chains.',
      },
      { p: 'What teams say about their managers, from upward feedback.', surface: 'tab:listening.managers' },
      { h: 'Special analyses', surface: 'tab:hrbp.analyses' },
      {
        p: 'Analyses for a readout, picked at the top of the tab. They are not measures the practice is judged on, so no scorecard counts them.',
      },
      {
        ul: ['Quality of hire: how hires from each university, degree and field of study do.'],
        surface: 'tab:hrbp.analyses:quality',
      },
      { ul: ['Offer declines: why candidates say no.'], surface: 'tab:hrbp.analyses:declines' },
      {
        ul: ['Engineering by stage: engineering people across the stages of chip development.'],
        surface: 'tab:hrbp.analyses:stages',
      },
      { ul: ['Level pyramid: the shape of the workforce by level.'], surface: 'tab:hrbp.analyses:pyramid' },
      { h: 'Quality of hire', surface: 'tab:hrbp.analyses:quality' },
      {
        p: "Quality of hire compares groups of hires from the 24 months that ended a year ago, so every hire's first year is known. The first full review after hire becomes a score from 0 to 100 (Meets is 50), staying a year scores 100 and leaving before then scores 0, and quality of hire weighs the two half each. A hire who left before a first review scores 0; one still employed without a first review is not scored.",
      },
      { p: 'The weights and windows are settings in Metric definitions.', ...DATA_ROOM },
      { p: 'The weights and windows are settings HR keeps with the metric.', ...NO_DATA_ROOM },
      {
        ul: [
          'The bar is the interval: how sure the comparison is. Few hires make a wide bar, and a bar that crosses the company line is not clearly different from the company.',
          "The tick is the expected score: what the group would score if its hires did like the company's hires at the same site and level. A dot on its own tick tells you about the site and level, not the school.",
          'Universities with fewer than 10 scored hires fold into Other universities; hires with no university recorded show as Not recorded.',
        ],
      },
      {
        note: 'Census compares groups, never people: nobody has a quality of hire score of their own on screen, in the records or in an export, and universities sort by number of hires, not by score. Graduation year is never read, and education stays out of the filters, the person card and hiring. Where someone studied can stand in for where they grew up or their family income, so the readout is about programs, onboarding and retention, never about choosing or avoiding a school.',
      },
      { h: 'Copy talking points', surface: 'header:hrbp' },
      {
        p: 'The header button copies five to seven plain-text bullets for a leader 1:1: headcount and change, voluntary attrition against the company with the top reason, where regretted exits cluster, first-year attrition, promotion rate and the top finding.',
      },
      { h: MEETING },
      { ul: ['Is voluntary attrition above the company, and where does it concentrate?'] },
      {
        ul: ['Are regretted exits clustering under one manager?'],
        surface: ['filter:leader', 'metric:hrbp.attrition.exitReasons'],
      },
      {
        ul: ['Which managers have very wide or very narrow spans, or are new with large teams?'],
        surface: 'tab:hrbp.org',
      },
      { ul: ['Who has gone longest without a promotion?'], surface: 'tab:hrbp.movement' },
      { ul: ['Which business units are growing fastest, and is it employees or contractors?'], ...FINANCE },
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
    without: [{ surface: 'tab:org.sandbox', summary: 'Who reports to whom and how each team is shaped.' }],
    keywords: ['reporting lines', 'tree', 'hierarchy', 'span', 'org slides', 'find a person', 'manager'],
    keywordsWhere: [{ surface: 'tab:org.sandbox', words: ['reorg', 'sandbox', 'scenario', 'simulate exit'] }],
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
        surface: 'filter:leader',
      },
      {
        p: 'The Org chart shows reporting lines on the as-of date, everyone active including contractors and interns. A business unit picked in the filter row dims the people outside it instead of removing them, so reporting lines stay readable.',
        ...FINANCE,
      },
      {
        p: 'The chart keeps the whole tree so reporting lines stay readable, and dims the cards outside your business unit or region. Search finds people inside it, and a dimmed card opens a short card that says the person is outside.',
        ...HRBP,
      },
      { h: 'Chart' },
      {
        ul: [
          'Find a person: type a name, or press / to jump to the search box.',
          'Expand the chart a set number of levels, or open and close one card at a time.',
          'Color the cards by department, location, level, tenure band or business unit.',
          'Open roles shows open requisitions as placeholder cards under their hiring manager.',
        ],
      },
      {
        ul: ['Flags marks span outliers, single-report chains, new managers with large teams and new hires.'],
        surface: 'metric:org.flags.structure',
      },
      {
        ul: [
          'Click a card for the detail panel: facts, manager chain, direct reports and team stats, with links to the views that go deeper.',
          'Drag to pan; Ctrl and scroll, or pinch, to zoom. With the keyboard, the arrow keys move through the tree.',
        ],
      },
      { p: 'Flags in this org lists every flag as a table.', surface: 'metric:org.flags.structure' },
      {
        p: 'Org slides builds a PowerPoint slide per leader with their direct org.',
        surface: 'export:org-slide',
      },
      { h: 'Reorg sandbox', surface: 'tab:org.sandbox' },
      {
        p: 'Try a reorganization without touching the data. Drag a card onto the person who should become their manager, or select a card and use "Move to…". Choose whether a move takes the person\'s whole org or just the person. Every change is listed with Undo and Redo (Ctrl+Z and Ctrl+Shift+Z), and the panel shows who changes manager, which spans change, layers and blocked moves. Moving someone under a person in their own reporting line is blocked. Export scenario writes the moves and the resulting roster to Excel.',
      },
      { h: MEETING },
      { ul: ['Which managers have one report, or twelve or more?'], surface: 'metric:org.flags.structure' },
      { ul: ['Who could step up if a leader left?'], surface: 'tab:talent.succession' },
      {
        ul: ['Where would a move leave a manager with no reports, or add a layer?'],
        surface: 'tab:org.sandbox',
      },
      { note: 'Scenarios stay in this browser. The datasets are never changed.', surface: 'tab:org.sandbox' },
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
    without: [
      {
        surface: 'tab:talent.succession',
        summary: 'Is performance assessed fairly, and how do ratings sit against the guideline?',
      },
      {
        surface: 'tab:talent.retention',
        summary: 'Is performance assessed fairly, do critical roles have successors, and is training done?',
      },
    ],
    keywords: [
      'performance',
      'ratings',
      'calibration',
      '9-box',
      'nine box',
      'potential',
      'succession',
      'learning',
      'training',
      'high performers',
    ],
    keywordsWhere: [{ surface: 'tab:talent.retention', words: ['flight risk', 'retention'] }],
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
      { p: 'Talent is for talent management and calibration owners.' },
      {
        p: 'The folder tab shows the share of critical roles with a successor ready now.',
        surface: 'tab:talent.succession',
      },
      { h: 'Overview' },
      { p: 'Key figures:' },
      {
        ul: [
          'Rated in the latest cycle, high performers (rated 4 or 5, against a 35% guideline) and high potentials.',
        ],
      },
      { ul: ['Critical roles covered by a successor ready now.'], surface: 'tab:talent.succession' },
      {
        ul: ['Regretted exits of high performers.'],
        surface: 'metric:talent.retention.regrettedHigh',
      },
      { ul: ['Required training on time.'], surface: 'tab:talent.learning' },
      { p: 'The 9-box shows performance against potential; click a cell to see the people in it.' },
      {
        p: 'Key talent at risk counts the people rated 4 or 5 whose flight-risk score is in the high band, and the 9-box marks how many of each box are in that band.',
        surface: 'tab:talent.retention',
      },
      { h: 'Performance' },
      {
        p: 'Where ratings run high by department and level, the rating mix by business unit, calibration shift (how far final ratings moved from the pre-calibration ones), average rating by cycle and the exit rate within 12 months by rating.',
      },
      { h: 'Potential & succession', surface: 'tab:talent.succession' },
      {
        p: "Critical and key roles with their best successor's readiness (Covered, Thin or No successor), bench strength by business unit, and high potentials by level and business unit.",
      },
      {
        p: 'A successor outside your business unit or region shows by name and readiness, as plain text that does not open.',
        ...HRBP,
      },
      { p: 'A successor outside your org shows by readiness only.', ...MANAGER },
      { h: 'Retention risk', surface: 'tab:talent.retention' },
      {
        p: "Each person's flight-risk score from 0 to 100 adds up plain factors: time since last promotion, tenure in the 1 to 3 year peak, a rating drop, a high rating without promotion, attrition in their department, a new manager, peers leaving and a low compa-ratio. Each factor gives points and a reason. The back-test scores everyone as of 12 months ago and shows how many in each band then left, so you can judge whether the model separates leavers from stayers.",
      },
      { h: 'Learning', surface: 'tab:talent.learning' },
      {
        p: 'Required training on time by course, completions by month, what is overdue today and learning hours per employee.',
      },
      { p: 'What learners say, from the training evaluation survey.', surface: 'tab:listening.services' },
      { h: MEETING },
      { ul: ['Is any business unit rating well above the guideline?'] },
      {
        ul: ['Which critical roles have no successor ready now, and is the incumbent at risk?'],
        surface: 'tab:talent.succession',
      },
      { ul: ['Which required courses are overdue, and where?'], surface: 'tab:talent.learning' },
      {
        ul: ['Which key people at high risk need a stay conversation this month?'],
        surface: 'tab:talent.retention',
      },
      {
        ul: ['Are high performers paid fairly against the rest, and does merit follow the rating?'],
        surface: 'view:comp',
        unless: 'tab:talent.succession',
      },
      {
        note: 'The flight-risk score is a prompt for a conversation, not a prediction about a person. Read the reasons, not just the band.',
        surface: 'tab:talent.retention',
      },
    ],
  },
  {
    id: 'view-comp',
    group: 'views',
    title: 'Compensation',
    summary:
      'Is pay where policy says, fair against performance and the market, and is the merit cycle on budget?',
    without: [
      {
        surface: 'tab:comp.overview',
        summary:
          'What the workforce costs, by cost center, business unit, level and site, and against the budget.',
      },
    ],
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
    keywordsWhere: [
      {
        surface: 'tab:comp.cost',
        words: ['workforce cost', 'cost center', 'cost totals', 'headcount budget'],
      },
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
      'comp.cost.targetCash',
      'comp.cost.headcountVsBudget',
    ],
    body: [
      {
        p: 'Compensation is for total rewards and comp partners. Ratios (compa-ratio, range penetration, merit %) always show. Pay amounts show only while "Show pay amounts" is on, for this session only. [Pay amounts](article:privacy-pay)',
        ...PAY_SWITCH,
      },
      {
        p: 'Compensation is for total rewards and comp partners. This mode shows pay as ratios (compa-ratio, range penetration, merit %), never as an amount. [Pay amounts](article:privacy-pay)',
        ...NO_PAY,
      },
      {
        p: "In Finance mode Compensation shows one tab, Workforce cost: what the workforce costs, as totals over groups of 5 or more people, never one person's pay. [Pay amounts](article:privacy-pay)",
        ...PAY_TOTALS,
      },
      { h: 'Overview', surface: 'tab:comp.overview' },
      {
        p: 'Median compa-ratio, share in the healthy band (0.90 to 1.10 by default), below range minimum, above maximum, merit spend against budget, pay for performance and median market ratio. The compa-ratio distribution, range position by business unit, and median compa-ratio by location, level and department.',
      },
      { h: 'Range position', surface: 'tab:comp.ranges' },
      {
        p: 'Range penetration by level, compa-ratio by tenure, the people below minimum or above maximum (gap amounts only with pay amounts on), and pay compression: new hires against incumbents in the same department and level.',
        ...PAY_SWITCH,
      },
      {
        p: 'Range penetration by level, compa-ratio by tenure, the people below minimum or above maximum (the gap in percent), and pay compression: new hires against incumbents in the same department and level.',
        ...NO_PAY,
      },
      { h: 'Pay for performance', surface: 'tab:comp.performance' },
      {
        p: 'Compa-ratio by rating, merit by rating against the guideline, the merit matrix (rating by range position), differentiation by department (merit for ratings 4 to 5 divided by merit for rating 3), and bonus and equity by rating.',
      },
      { h: 'Market and Merit cycle', surface: 'tab:comp.cycle' },
      {
        ul: [
          'Market: gap to the market median by job function, location and level, and the jobs furthest below market.',
          'Merit cycle: merit spend by business unit against the budget, the merit distribution, guideline exceptions, promotions in this cycle and the total rewards mix by level.',
        ],
      },
      {
        p: 'The merit budget, the healthy band and the merit guideline by rating are settings of the Compensation metrics. The header\'s "Cycle settings" button opens them in Metric definitions. The cycle\'s open, calibration, close and effective dates are in [Settings, Compensation cycle](settings:compensation).',
        surface: ['header:comp', 'page:data'],
      },
      {
        p: 'The header\'s "Cycle settings" button opens [Settings, Compensation cycle](settings:compensation): the cycle\'s open, calibration, close and effective dates. The close date is when your Needs attention items fall due.',
        surface: 'header:comp',
        unless: 'page:data',
      },
      { h: 'Workforce cost', surface: 'tab:comp.cost' },
      {
        p: 'What the workforce costs, as totals: target cash, annual base, annualized equity, people costed and target cash per employee, by cost center, business unit, level and site, with contractors and interns counted beside it. Merit spend by business unit and open reqs at their range midpoint (an estimate) follow.',
      },
      {
        p: 'Against the budget: headcount and cost against the Headcount and cost budget, by month and by cost center. With no budget loaded, the tab shows hires against the hiring plan instead.',
      },
      {
        p: "Every total covers 5 or more costed people. Groups under 5 fold into Other, and Other always holds 5 or more, so no one's pay can be worked out by subtracting. Amounts are converted to USD at each row's exchange rate.",
      },
      {
        p: 'The tab shows its totals while "Show pay amounts" is on, and a total opens the people it counts with their amounts.',
        ...PAY_SWITCH,
      },
      {
        p: 'Finance mode shows the totals at all times. A total opens the people it counts, without amounts, and exports say that individual pay is left out.',
        ...PAY_TOTALS,
      },
      { h: MEETING },
      {
        ul: [
          'Where is the median compa-ratio low, and is attrition there above the company?',
          'How many people are below their range minimum?',
          'Is the merit cycle differentiating enough between strong and solid performers?',
          'Which business units are over the merit budget?',
        ],
        surface: 'tab:comp.overview',
      },
      {
        ul: [
          'Which cost centers are over budget on headcount or cost, and since when?',
          'Where is headcount ahead of the budget, and where is cost?',
        ],
        surface: 'tab:comp.cost',
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
        surface: 'header:compliance',
      },
      {
        p: 'Authorization types are broad categories only. This mode shows them as counts by type, never by person. [Immigration details](article:privacy-immigration)',
        unless: 'header:compliance',
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
    without: [
      {
        when: {
          unless: [
            'tab:listening.candidates',
            'tab:listening.onboarding',
            'tab:listening.stay-exit',
            'tab:listening.managers',
            'tab:listening.services',
          ],
        },
        summary: 'What people tell us in the surveys this mode shows, tied to the operational numbers.',
      },
    ],
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
        surface: [
          'tab:listening.candidates',
          'tab:listening.onboarding',
          'tab:listening.stay-exit',
          'tab:listening.managers',
          'tab:listening.services',
        ],
      },
      {
        p: 'Listening brings together the survey programs this mode shows. Findings tie a score to what the operational numbers show, such as a low score where a process ran late.',
        unless: [
          'tab:listening.candidates',
          'tab:listening.onboarding',
          'tab:listening.stay-exit',
          'tab:listening.managers',
          'tab:listening.services',
        ],
      },
      { h: 'Overview' },
      {
        p: 'Survey programs: the latest wave of each, respondents, response rate against target, the headline score, the change since the last wave and its status. The wave calendar shows when each program ran in the last 12 months.',
      },
      { h: 'The area tabs' },
      {
        p: 'Candidates & hiring, Onboarding, Stay & exit, Managers, and Services & learning each show their surveys: score by driver against target, a driver heat table by org, location or tenure, the change since the last wave, and cuts such as candidate NPS by stage, exit reasons by location or upward feedback by manager.',
        surface: [
          'tab:listening.candidates',
          'tab:listening.onboarding',
          'tab:listening.stay-exit',
          'tab:listening.managers',
          'tab:listening.services',
        ],
      },
      {
        p: 'Each area tab this mode shows has its surveys: score by driver against target, a driver heat table by org, location or tenure, and the change since the last wave.',
        unless: [
          'tab:listening.candidates',
          'tab:listening.onboarding',
          'tab:listening.stay-exit',
          'tab:listening.managers',
          'tab:listening.services',
        ],
      },
      {
        p: 'Engagement and eNPS show only when you turn on engagement surveys in [Settings, Privacy](settings:privacy). While it is off, engagement answers are ignored everywhere.',
        surface: ['tab:listening.engagement', 'pay:switch', 'header:compliance'],
      },
      {
        p: 'Engagement and eNPS show only while HR has engagement surveys turned on. While they are off, engagement answers are ignored everywhere.',
        surface: 'tab:listening.engagement',
        unless: ['pay:switch', 'header:compliance'],
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
      { h: 'Keeping the catalog', surface: 'header:ai' },
      {
        p: 'Add, edit and remove agents in place, import or download the "AI agents" Excel sheet from the Catalog menu, or reset to the sample. The catalog is kept in this browser. Links must be web addresses (http or https).',
      },
      { h: 'Keeping the catalog', unless: 'header:ai' },
      { p: 'The HR team keeps the catalog in HR mode. It is kept in this browser.' },
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
        p: 'The Action center collects the open items every view raises: candidates waiting on a decision, starts not ready, probation decisions, cases past target, overdue transactions, returns from leave without systems ready, overdue training, reverifications, I-9s and export licenses. Open it from the Actions button in the masthead. Items with legal exposure (an I-9, an export license, a work authorization, final pay) come first, then the most severe and the most overdue.',
        ...ALL_PRACTICES,
      },
      {
        p: 'The Action center collects the open items the views this mode shows raise. Open it from the Actions button in the masthead. Items with legal exposure come first, then the most severe and the most overdue.',
        ...SOME_PRACTICES,
      },
      { p: EVERY_ITEM_LIST, ...EVERY_ITEM },
      { p: EVERY_ITEM_LIST, ...DEVELOPER },
      { h: 'Your two lists', ...ROLE_LISTS },
      {
        p: 'Each mode shows its own two lists. Needs attention holds the items that are yours: owned by your practice, its queues, or you. Waiting on others holds the items in your area that someone else owns, grouped by owner with a note to copy for each. The number on the Actions button counts Needs attention, and the key figures and charts count the list you pick. Your home shows the same Needs attention.',
      },
      { h: 'My team', surface: 'ui:actions-team' },
      {
        p: 'Pick a manager in "My team" (it sets the leader filter) to see items about people in their org and items they or their org own anywhere in the company. "Waiting on" narrows to the leader, their org or others.',
        surface: 'ui:actions-team',
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
          'Mark handled or Snooze for 7 days once an item is in hand. Undo or Reopen puts it back. A roll-up that changes after you marked it, such as a new overdue course, opens again.',
          'Marks are kept in this browser, with the name you add under Handled and snoozed. Settings, This device saves them to a file for a teammate, or loads theirs.',
          'Filter by owner group, severity, due date or view, or search for an owner, person or req.',
          'Export list writes the filtered list and a by-owner sheet to Excel.',
        ],
      },
      {
        note: 'Items from data below your data standard still show, tagged with their tier, and the page counts them: the work is real whatever the data. The same matter raised by two views, such as an export license, shows once. An item never carries a pay amount in its text, and an employee relations item never names a person.',
      },
    ],
  },
]
