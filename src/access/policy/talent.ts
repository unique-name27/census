/**
 * Talent management mode (docs/ROLES-V2.md 4.1 and 4.2): performance, calibration, succession,
 * retention risk, learning and the first 90 days, for the whole company. Every Talent tab; the
 * Scorecard; People stats and the Org chart; Onboarding's First 90 days without the I-9 and new
 * hire entry measures (they are HR ops and Compliance measures); Listening without candidate
 * surveys. Recruiting, HR ops, Compensation (the person card has no compa-ratio, and the
 * flight-risk model shows it as a plain reason, never the value), Compliance and the Data room
 * are hidden. Pure data.
 */
import { DEV_ONLY } from './developer'
import {
  analysesSurfaces,
  articlesFor,
  DATA_ROOM_HOW,
  ENGAGEMENT_FOLLOWS,
  frameSurfaces,
  listeningHides,
  NO_REORG,
  SHORT_TOUR,
  TEAM_HOW,
  tabTable,
  toursFor,
} from './kit'
import { type Decision, hidden, limited, type PolicyPlace, type RolePolicy, SHOWN } from './types'

const NAME = 'Talent management mode'

const views: Record<PolicyPlace, Decision> = {
  home: SHOWN,
  team: hidden(TEAM_HOW),
  scorecard: SHOWN,
  recruiting: hidden(`Hiring is not part of ${NAME}.`),
  onboarding: limited('First 90 days only, without the I-9 and new hire entry measures.'),
  hrbp: limited('Offer declines is hidden, and Engineering by stage leaves out planned hires.'),
  org: limited('No Simulate exit and no Reorg sandbox.'),
  services: hidden(`HR ops records are not part of ${NAME}.`),
  talent: SHOWN,
  comp: hidden('Pay stays with Total rewards and HR; the flight-risk model names low pay as a reason only.'),
  compliance: hidden(`Compliance records are not part of ${NAME}.`),
  listening: limited('Candidates & hiring is hidden; Engagement follows the saved switch.'),
  ai: limited('The agent catalog reads only; adding, importing, exporting and resetting are for HR.'),
  actions: limited('Items from the shown views, in Needs attention and Waiting on others.'),
  data: hidden(DATA_ROOM_HOW),
  dev: hidden(DEV_ONLY),
}

const tabs = tabTable(views, {
  onboarding: {
    upcoming: hidden('Upcoming starts are for HR ops, recruiters and managers.'),
    first90: limited(
      'I-9 Section 2 on time and new hires entered by day −3 are hidden: they are HR ops and Compliance measures.',
    ),
    plan: hidden('The hiring plan is a Finance and talent acquisition artifact.'),
  },
  hrbp: {
    analyses: limited(
      'Offer declines is hidden, and Engineering by stage leaves out planned hires from the hiring plan.',
    ),
  },
  org: {
    chart: limited('No Simulate exit.'),
    sandbox: hidden('Reorg scenarios are worked through by HR and the HRBPs.'),
  },
  listening: {
    candidates: hidden('Candidate surveys are for talent acquisition.'),
    engagement: limited(ENGAGEMENT_FOLLOWS),
  },
})

const listening = listeningHides(['candidates'])
const help = {
  views,
  tabs,
  dataOwner: false,
  privacy: { pay: false, er: false, surveys: true, immigration: false },
  tours: { 'view-onboarding': SHORT_TOUR },
}

export const TALENT_POLICY: RolePolicy = {
  mode: 'talent-management',
  views,
  tabs,
  hiddenParts: {
    'hrbp.analyses:declines': {
      label: 'Offer declines',
      instead: 'analyses:stages',
      insteadLabel: 'Engineering by stage',
    },
  },
  metrics: {
    hidePrefixes: [
      'recruiting.',
      'services.',
      'comp.',
      'compliance.',
      'onboarding.upcoming.',
      'onboarding.plan.',
      'org.scenario.',
      'hrbp.declines.',
      ...listening.prefixes,
    ],
    hide: [
      'onboarding.first90.i9Section2',
      'onboarding.first90.newHireEntered',
      // Planned hires come from the hiring plan, a Finance and talent acquisition artifact.
      'hrbp.stages.planned',
      ...listening.ids,
    ],
  },
  hiddenFigures: ['onboarding-new-hire-entered'],
  hiddenFigurePrefixes: ['hrbp-declines-'],
  drillKinds: [
    'employees',
    'jobChanges',
    'reviews',
    'succession',
    'learning',
    'onboardingTasks',
    'requisitions',
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
    'succession',
    'learning',
    'onboardingTasks',
    'requisitions',
    'surveyResponses',
    'surveyItems',
  ],
  // An I-9 item is an HR ops and Compliance measure, as in Manager mode.
  hiddenItemPrefixes: ['onboarding:i9:'],
  articles: articlesFor(help),
  tours: toursFor(help),
  surfaces: {
    ...frameSurfaces({ mode: 'talent-management', views }),
    'tools:pipeline': hidden("The pipeline dashboard is talent acquisition's."),
    'person:compa-ratio': hidden(
      'Compensation is not part of this mode; the flight-risk reason says "Paid low in range".',
    ),
    'org:simulate-exit': hidden(NO_REORG),
    'item:onboarding:i9:': hidden('An I-9 item is an HR ops and Compliance measure.'),
    ...analysesSurfaces({
      quality: SHOWN,
      declines: hidden("Offer analytics are talent acquisition's, as Recruiting is."),
      stages: limited('Planned hires from the hiring plan are left out.'),
      pyramid: SHOWN,
    }),
  },
}
