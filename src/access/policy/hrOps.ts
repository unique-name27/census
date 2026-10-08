/**
 * HR ops mode (docs/ROLES-V2.md 4.1, 4.2 and 4.5): people operations, payroll, benefits, HRIS and
 * global mobility, for the whole company. HR ops, Compliance (with "Show immigration details") and
 * Onboarding's starts and first 90 days; the Scorecard, People stats and the Org chart; Listening's
 * onboarding and service surveys; and the Data room, because HR ops owns the data in this company.
 * Recruiting, Talent, Compensation and the hiring plan are hidden, and no pay amount shows (the
 * Data room's raw grids follow the pay switch, which this mode does not have). Pure data.
 */
import { DEV_ONLY } from './developer'
import {
  analysesSurfaces,
  articlesFor,
  frameSurfaces,
  listeningHides,
  NO_REORG,
  TEAM_HOW,
  tabTable,
  toursFor,
} from './kit'
import { type Decision, hidden, limited, type PolicyPlace, type RolePolicy, SHOWN } from './types'

const NAME = 'HR ops mode'

const views: Record<PolicyPlace, Decision> = {
  home: SHOWN,
  team: hidden(TEAM_HOW),
  scorecard: SHOWN,
  recruiting: hidden(`Hiring is for talent acquisition; ${NAME} sees the starts in Onboarding.`),
  onboarding: limited('The hiring plan is hidden.'),
  hrbp: limited('The exit survey and manager feedback numbers and Special analyses are hidden.'),
  org: limited('No Simulate exit and no Reorg sandbox.'),
  services: SHOWN,
  talent: hidden(`Talent records are not part of ${NAME}.`),
  comp: hidden('Pay stays with Total rewards and HR.'),
  compliance: SHOWN,
  listening: limited("Listening's overview and the onboarding and service surveys only."),
  ai: limited('The agent catalog reads only; adding, importing, exporting and resetting are for HR.'),
  actions: limited('Items from the shown views, in Needs attention and Waiting on others.'),
  // HR ops is the data owner in this company (4.5).
  data: SHOWN,
  dev: hidden(DEV_ONLY),
}

const LISTENING_HIDDEN = ['candidates', 'stay-exit', 'managers', 'engagement']
const notListening = hidden(`${NAME} shows Listening's overview and the onboarding and service surveys only.`)

const tabs = tabTable(views, {
  onboarding: { plan: hidden('The hiring plan is a Finance and talent acquisition artifact.') },
  hrbp: {
    attrition: limited('The exit survey number is hidden: its Listening tab is not shown in this mode.'),
    org: limited('Manager feedback is hidden: its Listening tab is not shown in this mode.'),
    analyses: hidden(
      'Special analyses are workforce and talent analyses for HR, the HRBPs and the practices that use them.',
    ),
  },
  org: {
    chart: limited('No Simulate exit.'),
    sandbox: hidden('Reorg scenarios are worked through by HR and the HRBPs.'),
  },
  listening: Object.fromEntries(LISTENING_HIDDEN.map((k) => [k, notListening])),
})

const listening = listeningHides(LISTENING_HIDDEN)
const help = {
  views,
  tabs,
  dataOwner: true,
  privacy: { pay: false, er: true, surveys: true, immigration: true },
}
const noAnalyses = hidden('Special analyses are not shown in HR ops mode.')

export const HR_OPS_POLICY: RolePolicy = {
  mode: 'hr-ops',
  views,
  tabs,
  hiddenParts: {},
  metrics: {
    hidePrefixes: [
      'recruiting.',
      'talent.',
      'comp.',
      'onboarding.plan.',
      'org.scenario.',
      'hrbp.quality.',
      'hrbp.declines.',
      'hrbp.stages.',
      'hrbp.pyramid.',
      ...listening.prefixes,
    ],
    hide: [...listening.ids],
  },
  hiddenFigures: ['hrbp-exit-survey', 'hrbp-manager-feedback'],
  hiddenFigurePrefixes: ['hrbp-quality-', 'hrbp-declines-', 'hrbp-stages-', 'hrbp-pyramid-'],
  drillKinds: [
    'employees',
    'jobChanges',
    'requisitions',
    'candidates',
    'cases',
    'transactions',
    'learning',
    'onboardingTasks',
    'rightToWork',
    'leaveGroups',
    'surveyGroups',
    'surveyItems',
    'surveyResponses',
    'actionItems',
    'actionOwners',
  ],
  drillListed: SHOWN,
  // What HR ops reads on its views and in Ask; every dataset still loads through the Data room.
  datasets: [
    'employees',
    'jobChanges',
    'requisitions',
    'candidates',
    'cases',
    'transactions',
    'learning',
    'onboardingTasks',
    'rightToWork',
    'surveyResponses',
    'surveyItems',
  ],
  hiddenItemPrefixes: [],
  articles: articlesFor(help),
  tours: toursFor(help),
  surfaces: {
    ...frameSurfaces({ mode: 'hr-ops', views, dataOwner: true }),
    'tools:pipeline': hidden("The pipeline dashboard is talent acquisition's."),
    'person:open-cases': SHOWN,
    'person:ratings': hidden('Ratings and potential are not part of HR ops mode.'),
    'org:simulate-exit': hidden(NO_REORG),
    ...analysesSurfaces({
      quality: noAnalyses,
      declines: noAnalyses,
      stages: noAnalyses,
      pyramid: noAnalyses,
    }),
  },
}
