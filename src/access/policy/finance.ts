/**
 * Finance mode (docs/ROLES-V2.md 4.1, 4.2 and part 3): FP&A partners. Headcount and hiring
 * against plan, the reqs the plan does not cover, contractors, and what the workforce costs as
 * totals over 5 or more people (Compensation, Workforce cost; never one person's pay, no switch).
 * Filters by business unit and period only (2.3), so every cost total covers whole business units.
 * A metric allowlist keeps every number to headcount, flow, the plan, the reqs and cost totals;
 * no Action center item about one person is listed. Pure data.
 */
import { DEV_ONLY } from './developer'
import {
  analysesSurfaces,
  articlesFor,
  DATA_ROOM_HOW,
  frameSurfaces,
  NO_REORG,
  SHORT_TOUR,
  TEAM_HOW,
  tabTable,
  toursFor,
} from './kit'
import { type Decision, hidden, limited, type PolicyPlace, type RolePolicy, SHOWN } from './types'

const NAME = 'Finance mode'
const BU_ONLY = `${NAME} filters by business unit and period only, so every cost total covers whole business units.`
const notHere = (what: string) => hidden(`${what} is not part of ${NAME}.`)

const views: Record<PolicyPlace, Decision> = {
  home: SHOWN,
  team: hidden(TEAM_HOW),
  scorecard: hidden(
    'The scorecard judges the whole people function; Finance mode shows headcount, the plan and cost.',
  ),
  recruiting: limited(
    'Requisitions only, without recruiter load, hiring manager satisfaction or candidate records.',
  ),
  onboarding: limited('Upcoming starts and the hiring plan; contingencies read as the team holding them.'),
  hrbp: limited(
    'Overview, Workforce, attrition rates and counts, Engineering by stage and the Level pyramid only.',
  ),
  org: limited('No Simulate exit; the details panel shows no rating or potential.'),
  services: notHere('HR ops'),
  talent: notHere('Talent'),
  comp: limited("Workforce cost only: cost totals over 5 or more people, never one person's pay."),
  compliance: notHere('Compliance'),
  listening: notHere('Listening'),
  ai: hidden('The agent catalog is for the HR team.'),
  actions: limited('Items from the shown views; none is about one person.'),
  data: hidden(DATA_ROOM_HOW),
  dev: hidden(DEV_ONLY),
}

const payPosition = hidden('Pay position is for Total rewards; Finance mode shows Workforce cost.')

const tabs = tabTable(views, {
  recruiting: {
    overview: hidden('Recruiting analytics are for talent acquisition; Finance mode shows the requisitions.'),
    pipeline: hidden('Candidates are not part of Finance mode.'),
    requisitions: limited(
      'Without recruiter load and hiring manager satisfaction; candidate counts are plain numbers.',
    ),
    sources: hidden('Sourcing analytics are for talent acquisition.'),
  },
  onboarding: {
    upcoming: limited('Contingencies read as the team holding them; readiness by task and owner shown.'),
    first90: hidden('The first 90 days are for HR ops, talent management and managers.'),
  },
  hrbp: {
    attrition: limited(
      'Rates and counts only: exit reasons, regretted leavers and exits by last rating are hidden.',
    ),
    movement: hidden('Promotions and moves are not part of Finance mode.'),
    org: hidden('Org design is for HR and the HRBPs.'),
    analyses: limited(
      'Engineering by stage, with planned hires, and the Level pyramid; their drills open employees without ratings.',
    ),
  },
  org: {
    chart: limited('No Simulate exit; the details panel shows no rating or potential.'),
    sandbox: hidden('Reorg scenarios are worked through by HR and the HRBPs.'),
  },
  comp: {
    overview: payPosition,
    ranges: payPosition,
    performance: payPosition,
    market: payPosition,
    cycle: payPosition,
  },
})

const help = {
  views,
  tabs,
  dataOwner: false,
  privacy: { pay: true, er: false, surveys: false, immigration: false },
  tours: { 'view-recruiting': SHORT_TOUR, 'view-comp': SHORT_TOUR },
}
const analysisTo = { instead: 'analyses:stages', insteadLabel: 'Engineering by stage' }

/** Action center items about one person on the views Finance shows (6.2 check 2). */
const PERSON_ITEMS = [
  'onboarding:task:',
  'onboarding:i9:',
  'onboarding:probation:',
  'hrbp:stay-conversations:',
  'hrbp:span:',
  'org:new-manager:',
  'org:single-report-chain:',
]
/** Items about one person's pay, on tabs Finance hides; left out by id as well. */
const PAY_ITEMS = ['comp:below-minimum:', 'comp:guideline-exception:']
const itemHows = Object.fromEntries([
  ...PERSON_ITEMS.map((p) => [`item:${p}`, hidden('An item about one person; Finance mode lists none.')]),
  ...PAY_ITEMS.map((p) => [`item:${p}`, hidden("An item about people's pay; Finance mode lists none.")]),
]) as Record<string, Decision>

export const FINANCE_POLICY: RolePolicy = {
  mode: 'finance',
  views,
  tabs,
  hiddenParts: {
    'hrbp.analyses:quality': { label: 'Quality of hire', ...analysisTo },
    'hrbp.analyses:declines': { label: 'Offer declines', ...analysisTo },
  },
  metrics: {
    // 4.2's list, plus the privacy rules (they go with their articles in the glossary).
    allow: [
      'hrbp.headcount.',
      'hrbp.flow.',
      'hrbp.workforce.',
      'hrbp.attrition.',
      'hrbp.findings.rapidGrowth',
      'hrbp.findings.unevenGrowth',
      'hrbp.stages.',
      'hrbp.pyramid.',
      'recruiting.reqs.',
      'onboarding.upcoming.',
      'onboarding.plan.',
      'comp.cost.',
      'org.chart.',
      'org.people.',
      'org.managers.',
      'org.layers.',
      'org.openRoles.',
      'actions.',
      'privacy.',
    ],
    hidePrefixes: [],
    hide: ['hrbp.attrition.exitReasons'],
  },
  hiddenFigures: [
    'hrbp-exit-reasons',
    'hrbp-regretted-leavers',
    'hrbp-exits-rating',
    'hrbp-exit-survey',
    'recruiting-recruiter-load',
    'recruiting-hiring-manager-survey',
  ],
  hiddenFigurePrefixes: ['hrbp-quality-', 'hrbp-declines-'],
  drillKinds: ['employees', 'requisitions', 'hiringPlan', 'budget', 'actionItems', 'actionOwners'],
  drillListed: SHOWN,
  // Compensation rows are read for cost totals only (part 3.2); the budget for actual against budget.
  datasets: ['employees', 'requisitions', 'hiringPlan', 'comp', 'budget'],
  // No item about one person (6.2 check 2): day-one tasks, I-9s, probation, a manager's span or
  // team, and anyone's pay.
  hiddenItemPrefixes: [...PERSON_ITEMS, ...PAY_ITEMS],
  articles: articlesFor(help),
  tours: toursFor(help),
  surfaces: {
    ...frameSurfaces({ mode: 'finance', views }),
    'dataset:comp': hidden(
      'Read only for cost totals over 5 or more people, so Ask and the inventory never list it.',
    ),
    'drill:employees': limited('Without ratings, potential or pay.'),
    'ask:query_records': limited(
      'Employees, requisitions, the hiring plan and budgeted headcount; never pay or cost.',
    ),
    'ask:view_summary': limited(
      'Summaries of Recruiting, Onboarding, People stats, Org chart and Compensation; cost totals are never sent.',
    ),
    // Business unit and period only (2.3).
    'filter:saved-views': limited('Every view applies through the business unit and period filter.'),
    'filter:leader': hidden(BU_ONLY),
    'filter:exclude': hidden(BU_ONLY),
    'filter:chain': hidden(BU_ONLY),
    'filter:lists': limited('Business unit values only, include only.'),
    'filter:standard': limited('Read only: the saved data standard.'),
    'filter:lens': hidden('The quality lens is off in this mode.'),
    'focus:filter-to': limited('Offered only for business unit groups.'),
    'focus:leave-out': hidden(BU_ONLY),
    'focus:leave-out-leader': hidden(BU_ONLY),
    'focus:finding': limited('Offered only for business unit groups.'),
    // Person card (4.12): the facts a headcount drill needs, never ratings, cases or pay.
    'person:inside-org': limited(
      'Name, title, department, level, location, cost center, hire date and reporting line.',
    ),
    'person:ratings': hidden('Ratings and potential are not part of Finance mode.'),
    // Exports (4.11)
    'export:view': limited(
      'Shown tabs and figures only, with a line naming Finance mode and one saying that cost totals cover groups of 5 or more people.',
    ),
    'export:monthly-report': hidden('The monthly people report is for HR.'),
    'export:records': limited('The rows the panel lists, without amounts.'),
    // No tool link is for Finance (4.7), so the Tools button usually hides.
    'tools:pipeline': hidden("The pipeline dashboard is talent acquisition's."),
    'tools:lattice': hidden('The career lattice is for employees and managers.'),
    'tools:toolkit': hidden('The manager toolkit is for managers.'),
    'tools:catalog': hidden("The process catalog and Atlas links are HR's."),
    'help:report': SHOWN,
    'org:simulate-exit': hidden(NO_REORG),
    ...itemHows,
    ...analysesSurfaces({
      quality: hidden('Quality of hire is an HR and talent management analysis.'),
      declines: hidden("Offer analytics are talent acquisition's."),
      stages: SHOWN,
      pyramid: SHOWN,
    }),
  },
}
