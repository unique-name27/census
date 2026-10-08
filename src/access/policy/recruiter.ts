/**
 * Recruiter mode (docs/ROLES-V2.md 4.1 and 4.2): one recruiter's reqs (the `reqs` scope, part 2),
 * or every req for a talent acquisition lead ("Every recruiter"). Recruiting, Onboarding's
 * upcoming starts on those reqs and AI in HR; nothing else. A metric allowlist keeps every number
 * to recruiting and starts; the person card opens only for a matched pre-hire. Pure data.
 */
import { DEV_ONLY } from './developer'
import {
  analysesSurfaces,
  articlesFor,
  DATA_ROOM_HOW,
  frameSurfaces,
  TEAM_HOW,
  tabTable,
  toursFor,
} from './kit'
import { type Decision, hidden, limited, type PolicyPlace, type RolePolicy, SHOWN } from './types'

const NAME = 'Recruiter mode'
const notHere = (what: string) =>
  hidden(`${NAME} is one recruiter's reqs and their starts, so ${what} is not shown.`)

const views: Record<PolicyPlace, Decision> = {
  home: SHOWN,
  team: hidden(TEAM_HOW),
  scorecard: hidden(
    "The scorecard judges the whole people function; Recruiter mode is one recruiter's reqs.",
  ),
  recruiting: limited(
    'The reqs only; the hiring plan tile, hiring manager satisfaction and candidate experience are hidden.',
  ),
  onboarding: limited('Upcoming starts on the reqs only, without I-9 tasks.'),
  hrbp: notHere('People stats'),
  org: notHere('the Org chart'),
  services: notHere('HR ops'),
  talent: notHere('Talent'),
  comp: notHere('Compensation'),
  compliance: notHere('Compliance'),
  listening: notHere('Listening'),
  ai: limited('The agent catalog reads only; adding, importing, exporting and resetting are for HR.'),
  actions: limited("Items on the recruiter's reqs and their starts, plus items owned by the recruiter."),
  data: hidden(DATA_ROOM_HOW),
  dev: hidden(DEV_ONLY),
}

const tabs = tabTable(views, {
  recruiting: {
    overview: limited('The "Hires vs plan" tile is hidden.'),
    requisitions: limited(
      "Hiring manager satisfaction is hidden; recruiter load shows the recruiter's own row, because the data is their reqs.",
    ),
    sources: limited('Candidate experience is hidden.'),
  },
  onboarding: {
    upcoming: limited(
      'Starts on the reqs only; I-9 tasks are left out of readiness by task. Background checks and export screening show their state.',
    ),
    first90: hidden('The first 90 days are for HR ops, talent management and managers.'),
    plan: hidden('The hiring plan is a Finance and talent acquisition lead artifact.'),
  },
})

const help = {
  views,
  tabs,
  dataOwner: false,
  privacy: { pay: false, er: false, surveys: false, immigration: false },
}
const noPeopleStats = hidden('People stats is not shown in Recruiter mode.')
const reqs = "the recruiter's reqs"

export const RECRUITER_POLICY: RolePolicy = {
  mode: 'recruiter',
  views,
  tabs,
  hiddenParts: {},
  metrics: {
    // Only recruiting and starts (4.2). The privacy rules go with their articles in the glossary.
    allow: ['recruiting.', 'onboarding.upcoming.', 'actions.', 'ai.', 'privacy.'],
    hidePrefixes: [],
    hide: ['recruiting.data.reqMatch'],
  },
  hiddenFigures: ['recruiting-hiring-manager-survey', 'recruiting-candidate-survey'],
  hiddenFigurePrefixes: [],
  drillKinds: ['requisitions', 'candidates', 'onboardingTasks', 'employees', 'actionItems', 'actionOwners'],
  drillListed: limited(`Rows outside ${reqs} and their starts are left out.`),
  // Employees are read for names (hiring managers, owners) and the matched pre-hires only.
  datasets: ['requisitions', 'candidates', 'onboardingTasks', 'employees'],
  // An I-9 item is an HR ops and Compliance measure, as in Manager mode.
  hiddenItemPrefixes: ['onboarding:i9:'],
  articles: articlesFor(help),
  tours: toursFor(help),
  surfaces: {
    ...frameSurfaces({
      mode: 'recruiter',
      views,
      scope: {
        words: reqs,
        askOff: 'the reqs have fewer candidates than the anonymity minimum',
        button: 'Reads "Recruiter:" and the recruiter\'s name, or "every recruiter".',
        change: 'With "Change recruiter…".',
      },
    }),
    // A pre-hire's card, not the roster (4.12).
    'dataset:employees': hidden(
      'Read for names and the matched pre-hires only, so Ask and the inventory do not list it.',
    ),
    'drill:employees': limited('Matched pre-hires on the reqs only.'),
    'person:inside-org': limited(
      'A card opens only for a matched pre-hire: name, role, start date, hiring manager and readiness.',
    ),
    'person:chain-links': hidden('The pre-hire card has no reporting line.'),
    'person:focus': hidden('Focus on their org needs People stats, which this mode hides.'),
    'person:org-chart': hidden('The Org chart is not shown in this mode.'),
    'person:row-open': limited('Rows open only matched pre-hires on the reqs.'),
    'person:ratings': hidden('Ratings and potential are not part of Recruiter mode.'),
    // Every filter works inside the reqs, as on Recruiting (2.3, 2.5).
    'filter:saved-views': limited('A view whose page this mode hides opens Home.'),
    'filter:in-scope': limited("Counts open reqs and active candidates on the recruiter's reqs."),
    'filter:reset': limited("Returns to the recruiter's whole reqs and the default period."),
    'focus:filter-to': SHOWN,
    'focus:leave-out': SHOWN,
    'focus:leave-out-leader': SHOWN,
    'focus:finding': SHOWN,
    'ask:compare_groups': limited(
      "The same views; by leader lists the hiring managers' orgs inside the reqs.",
    ),
    // Exports (4.11): the link carries the filters, never the reqs.
    'export:link': limited('Carries the filters but not the reqs.'),
    'export:monthly-report': hidden('The monthly people report is not part of Recruiter mode.'),
    'export:org-slide': hidden('The Org chart is not shown in this mode.'),
    'help:report': limited('Adds "Mode: Recruiter (recruiter set, name left out)".'),
    'item:onboarding:i9:': hidden('An I-9 item is an HR ops and Compliance measure.'),
    ...analysesSurfaces({
      quality: noPeopleStats,
      declines: noPeopleStats,
      stages: noPeopleStats,
      pyramid: noPeopleStats,
    }),
  },
}
