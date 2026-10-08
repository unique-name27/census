/**
 * Compensation mode (docs/ROLES-V2.md 4.1 and 4.2): total rewards for the whole company. Every
 * Compensation tab, with individual amounts and cost totals behind "Show pay amounts" (part 3);
 * the Scorecard; People stats, the Org chart and Talent's Performance (ratings feed merit); and
 * Listening's exit and stay results. Recruiting, Onboarding, HR ops, Compliance, the Data room
 * and talent risk are hidden. Pure data.
 */
import { DEV_ONLY } from './developer'
import {
  analysesSurfaces,
  articlesFor,
  DATA_ROOM_HOW,
  frameSurfaces,
  listeningHides,
  NO_REORG,
  SHORT_TOUR,
  TEAM_HOW,
  tabTable,
  toursFor,
} from './kit'
import { type Decision, hidden, limited, type PolicyPlace, type RolePolicy, SHOWN } from './types'

const NAME = 'Compensation mode'

const views: Record<PolicyPlace, Decision> = {
  home: SHOWN,
  team: hidden(TEAM_HOW),
  scorecard: SHOWN,
  recruiting: hidden(`Hiring is not part of ${NAME}; offer declines are in People stats, Special analyses.`),
  onboarding: hidden(`Starts and the first 90 days are not part of ${NAME}.`),
  hrbp: limited(
    'Manager feedback is hidden, and Special analyses shows Offer declines and the Level pyramid only.',
  ),
  org: limited('No Simulate exit and no Reorg sandbox.'),
  services: hidden(`HR ops records are not part of ${NAME}.`),
  talent: limited(
    'Performance in full; key talent at risk, succession, retention risk and learning are hidden.',
  ),
  comp: SHOWN,
  compliance: hidden(`Compliance records are not part of ${NAME}.`),
  listening: limited("Listening's overview and the stay and exit results only."),
  ai: limited('The agent catalog reads only; adding, importing, exporting and resetting are for HR.'),
  actions: limited('Items from the shown views, in Needs attention and Waiting on others.'),
  data: hidden(DATA_ROOM_HOW),
  dev: hidden(DEV_ONLY),
}

const LISTENING_HIDDEN = ['candidates', 'onboarding', 'managers', 'services', 'engagement']
const notListening = hidden(`${NAME} shows Listening's overview and the stay and exit results only.`)

const tabs = tabTable(views, {
  hrbp: {
    org: limited('Manager feedback is hidden: its Listening tab is not shown in this mode.'),
    analyses: limited(
      'Quality of hire and Engineering by stage are hidden; Offer declines leaves out the candidate survey.',
    ),
  },
  org: {
    chart: limited('No Simulate exit.'),
    sandbox: hidden('Reorg scenarios are worked through by HR and the HRBPs.'),
  },
  talent: {
    overview: limited(
      'The key talent at risk tile, table and finding and the 9-box flight-risk overlay are hidden.',
    ),
    succession: hidden('Succession plans are for talent management, HR and the HRBPs.'),
    retention: hidden('Flight-risk scores about named people stay with talent management and HR.'),
    learning: hidden('Learning is for talent management, HR and the HRBPs.'),
  },
  listening: Object.fromEntries(LISTENING_HIDDEN.map((k) => [k, notListening])),
})

const listening = listeningHides(LISTENING_HIDDEN)
const help = {
  views,
  tabs,
  dataOwner: false,
  privacy: { pay: true, er: false, surveys: true, immigration: false },
  tours: { 'view-talent': SHORT_TOUR },
}

export const COMPENSATION_POLICY: RolePolicy = {
  mode: 'compensation',
  views,
  tabs,
  hiddenParts: {
    'hrbp.analyses:quality': {
      label: 'Quality of hire',
      instead: 'analyses:declines',
      insteadLabel: 'Offer declines',
    },
    'hrbp.analyses:stages': {
      label: 'Engineering by stage',
      instead: 'analyses:declines',
      insteadLabel: 'Offer declines',
    },
  },
  metrics: {
    hidePrefixes: [
      'talent.retention.',
      'talent.succession.',
      'talent.learning.',
      // Onboarding and Recruiting are hidden; the offer declines analysis keeps its own measures
      // (offer acceptance, decline reasons and renege rate), so the rest is hidden by part.
      'onboarding.first90.',
      'onboarding.plan.',
      'onboarding.readout.',
      'recruiting.reqs.',
      'recruiting.hires.',
      'recruiting.pipeline.',
      'recruiting.flow.',
      'recruiting.recruiters.',
      'recruiting.sources.',
      'recruiting.data.',
      'org.scenario.',
      'hrbp.quality.',
      'hrbp.stages.',
      'services.',
      'compliance.',
      ...listening.prefixes,
    ],
    hide: [
      'talent.finding.keyTalent',
      'talent.finding.criticalNotReady',
      'talent.finding.successionExposed',
      'talent.finding.trainingOverdue',
      'talent.finding.goodSuccession',
      'talent.finding.goodTraining',
      'recruiting.offers.acceptanceByLocation',
      'recruiting.offers.acceptanceDrop',
      'recruiting.offers.waiting',
      'onboarding.upcoming.starts',
      'onboarding.upcoming.dayMinus3',
      'onboarding.upcoming.contingencies',
      'onboarding.upcoming.acceptToStart',
      'onboarding.upcoming.readiness',
      'onboarding.upcoming.readinessByTask',
      'onboarding.upcoming.readinessByOwner',
      'onboarding.upcoming.calendar',
      ...listening.ids,
    ],
  },
  hiddenFigures: [
    'hrbp-manager-feedback',
    'hrbp-declines-candidate-survey',
    'talent-key-talent-top',
    'talent-key-talent-at-risk',
  ],
  hiddenFigurePrefixes: ['hrbp-quality-', 'hrbp-stages-'],
  drillKinds: [
    'employees',
    'jobChanges',
    'reviews',
    'comp',
    'budget',
    'requisitions',
    'candidates',
    'surveyGroups',
    'surveyItems',
    'actionItems',
    'actionOwners',
  ],
  drillListed: SHOWN,
  datasets: [
    'employees',
    'jobChanges',
    'reviews',
    'comp',
    'budget',
    // The org chart's open roles, and the offer declines analysis's candidates.
    'requisitions',
    'candidates',
    'surveyResponses',
    'surveyItems',
  ],
  hiddenItemPrefixes: [],
  articles: articlesFor(help),
  tours: toursFor(help),
  surfaces: {
    ...frameSurfaces({ mode: 'compensation', views }),
    // Total rewards' own tools (4.3, 4.6): the pay switch, Cycle settings and the merit cycle.
    'settings:compensation': SHOWN,
    'tools:pipeline': hidden("The pipeline dashboard is talent acquisition's."),
    'person:compa-ratio': SHOWN,
    'org:simulate-exit': hidden(NO_REORG),
    ...analysesSurfaces({
      quality: hidden('Education with first ratings is an HR and talent management analysis.'),
      declines: limited(
        'Without the candidate survey: Listening, Candidates & hiring is not shown in this mode.',
      ),
      stages: hidden('Engineering by stage is a workforce planning analysis for HR, the HRBPs and Finance.'),
      pyramid: SHOWN,
    }),
  },
}
