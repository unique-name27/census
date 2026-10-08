/**
 * HRBP for a business unit and HRBP for a region (docs/ROLES-V2.md 4.1 and 4.2): one table, two
 * ids. An HR business partner sees every HR view inside the scope (the `unit` or `region` scope
 * pins the filters, part 2): the scorecard, people, hiring, onboarding, HR ops, talent,
 * compliance and listening, with pay as ratios only (the pay switch, Cycle settings, every amount
 * and Workforce cost hidden) and immigration details off. The Data room, settings files and the
 * Developer page are hidden. The two tables differ only in how they name the scope. Pure data.
 */
import { DEV_ONLY } from './developer'
import {
  ALL_DATASETS,
  ALL_DRILL_KINDS,
  analysesSurfaces,
  articlesFor,
  DATA_ROOM_HOW,
  ENGAGEMENT_FOLLOWS,
  frameSurfaces,
  type NamedTabs,
  TEAM_HOW,
  tabTable,
  toursFor,
} from './kit'
import { type Decision, hidden, limited, type PolicyPlace, type RolePolicy, SHOWN } from './types'

type HrbpMode = 'hrbp-unit' | 'hrbp-region'

/** How each HRBP mode names its scope in a sentence. */
const SCOPE: Readonly<Record<HrbpMode, { words: string; button: string; change: string; site: string }>> = {
  'hrbp-unit': {
    words: 'the business unit',
    button: 'Reads "HRBP:" and the business unit.',
    change: 'With "Change business unit…".',
    site: 'business unit',
  },
  'hrbp-region': {
    words: 'the region',
    button: 'Reads "HRBP:" and the region.',
    change: 'With "Change region…".',
    site: 'region',
  },
}

/**
 * Datasets the HRBP modes leave out: every dataset is read inside the scope except the budget,
 * which only Workforce cost reads (hidden here) and whose lines carry cost.
 */
const NOT_READ = new Set(['budget'])

function hrbpPolicy(mode: HrbpMode): RolePolicy {
  const sc = SCOPE[mode]
  const outside = `outside ${sc.words}`
  const views: Record<PolicyPlace, Decision> = {
    home: SHOWN,
    team: hidden(TEAM_HOW),
    scorecard: SHOWN,
    recruiting: SHOWN,
    onboarding: SHOWN,
    hrbp: SHOWN,
    org: limited(`Cards ${outside} are dimmed and open the limited card.`),
    services: SHOWN,
    talent: limited(`Successors ${outside} show by name and readiness, not openable.`),
    comp: limited('Ratios only: the pay switch, Cycle settings, every amount and Workforce cost are hidden.'),
    compliance: limited(
      'The immigration details switch is hidden and off, so authorization types never show per person.',
    ),
    listening: SHOWN,
    ai: limited('The agent catalog reads only; adding, importing, exporting and resetting are for HR.'),
    actions: limited(`Items in ${sc.words}, plus items owned by someone in it.`),
    data: hidden(DATA_ROOM_HOW),
    dev: hidden(DEV_ONLY),
  }
  const ratios = limited('Ratios only: amount columns are hidden.')
  const work = limited('Authorization types never show per person; counts by type still show.')
  const named: NamedTabs = {
    org: { chart: views.org },
    talent: { succession: views.talent },
    comp: {
      overview: ratios,
      ranges: ratios,
      performance: ratios,
      market: ratios,
      cycle: ratios,
      cost: hidden('Cost totals are for Total rewards and Finance; HRBP mode shows ratios.'),
    },
    compliance: { overview: work, work, export: work, deadlines: work },
    listening: { engagement: limited(ENGAGEMENT_FOLLOWS) },
  }
  const tabs = tabTable(views, named)
  return {
    mode,
    views,
    tabs,
    hiddenParts: {},
    metrics: {
      // Workforce cost's totals; every other metric of the shown views shows inside the scope.
      hidePrefixes: ['comp.cost.'],
      hide: [],
    },
    hiddenFigures: [],
    hiddenFigurePrefixes: [],
    // Every kind but survey answers (Data room only) and budget lines (Workforce cost only).
    drillKinds: ALL_DRILL_KINDS.filter((k) => k !== 'surveyResponses' && k !== 'budget'),
    drillListed: limited(`Rows ${outside} are left out.`),
    datasets: ALL_DATASETS.filter((d) => !NOT_READ.has(d)),
    hiddenItemPrefixes: [],
    articles: articlesFor({
      views,
      tabs,
      dataOwner: false,
      privacy: { pay: true, er: true, surveys: true, immigration: true },
    }),
    tours: toursFor({
      views,
      tabs,
      dataOwner: false,
      privacy: { pay: true, er: true, surveys: true, immigration: true },
    }),
    surfaces: {
      ...frameSurfaces({
        mode,
        views,
        scope: {
          words: sc.words,
          askOff: `${sc.words} has fewer employees than the anonymity minimum`,
          button: sc.button,
          change: sc.change,
        },
      }),
      // The HRBP's own tools (4.3, 4.11): talking points for a leader 1:1 and the Reorg sandbox.
      'header:hrbp': SHOWN,
      'export:talking-points': SHOWN,
      'export:reorg': SHOWN,
      'org:simulate-exit': SHOWN,
      // Filter row inside the scope (2.5).
      'filter:leader': limited(
        mode === 'hrbp-unit'
          ? 'Include or exclude inside the business unit; "Whole company" reads "Whole business unit".'
          : 'Include or exclude inside the region; "Whole company" reads "Whole region".',
      ),
      'filter:chain': limited(`Widening keeps the pin on ${sc.words}.`),
      'filter:lists': limited(
        mode === 'hrbp-unit'
          ? 'Values and counts from the business unit; the business unit control is pinned.'
          : "Values and counts from the region; the location menu lists the region's sites, with no Exclude switch.",
      ),
      'filter:in-scope': limited(`Counts people in ${sc.words}.`),
      'filter:reset': limited(`Returns to the whole ${sc.site} and the default period.`),
      // Person card (4.12): compa-ratio, ratings and open cases inside the scope.
      'person:compa-ratio': SHOWN,
      'person:open-cases': SHOWN,
      'person:chain-links': limited(`Names ${outside} read as plain text with their business unit or site.`),
      // Special analyses (4.2): all four, inside the scope.
      ...analysesSurfaces({ quality: SHOWN, declines: SHOWN, stages: SHOWN, pyramid: SHOWN }),
    },
  }
}

export const HRBP_UNIT_POLICY: RolePolicy = hrbpPolicy('hrbp-unit')
export const HRBP_REGION_POLICY: RolePolicy = hrbpPolicy('hrbp-region')
