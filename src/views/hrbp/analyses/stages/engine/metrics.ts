/**
 * Engineering by stage in the metric dictionary (docs/ANALYSES.md, 4.5): its six entries, their
 * calculation settings and the fields each reads. The Special analyses register them with their
 * own (`../../metrics`), so they are People stats metrics owned by People analytics.
 *
 * Plain data, like every view's `metrics.ts`: never React, '@/data/context', '@/data/store' or the
 * '@/metrics' barrel, and nothing from the Special analyses' own `metrics.ts` (it imports this).
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import type { MetricInput } from '@/metrics/define'
import type { SettingRef } from '@/metrics/types'

/** Engineering by stage's metric ids, by role. */
export const SID = {
  capacity: 'hrbp.stages.capacity',
  hiring: 'hrbp.stages.hiring',
  planned: 'hrbp.stages.planned',
  ratios: 'hrbp.stages.ratios',
  mapped: 'hrbp.stages.mapped',
  findings: 'hrbp.stages.findings',
} as const

export type StagesMetricId = (typeof SID)[keyof typeof SID]

const ref = (metricId: StagesMetricId, key: string): SettingRef => ({ metricId, key })

/** Every setting the engine reads (`./settings`), by what it changes. */
export const STAGES_SET = {
  countInterns: ref(SID.capacity, 'countInterns'),
  planMonths: ref(SID.hiring, 'planMonths'),
  ratioContractors: ref(SID.ratios, 'ratioContractors'),
  verificationReference: ref(SID.ratios, 'verificationReference'),
  dftReference: ref(SID.ratios, 'dftReference'),
  physicalReference: ref(SID.ratios, 'physicalReference'),
  postSiliconReference: ref(SID.ratios, 'postSiliconReference'),
  softwareReference: ref(SID.ratios, 'softwareReference'),
  belowBy: ref(SID.findings, 'belowBy'),
  concentration: ref(SID.findings, 'concentration'),
  contractorShare: ref(SID.findings, 'contractorShare'),
  unmappedShare: ref(SID.findings, 'unmappedShare'),
  attritionGap: ref(SID.findings, 'attritionGap'),
} as const

/** Who is in engineering and in which stage: the job architecture and who is active (4.4). */
export const STAGES_USES: readonly FieldRef[] = [
  'employees.jobFamily',
  'employees.jobFunction',
  'employees.employmentType',
  'employees.hireDate',
  'employees.terminationDate',
  'employees.fte',
]

/** Where each stage is staffed: the capacity plus site and business unit. */
export const WHERE_USES: readonly FieldRef[] = [
  ...STAGES_USES,
  'employees.location',
  'employees.businessUnit',
]

/** Open reqs, by the job function their department's employees most often have. */
export const REQ_USES: readonly FieldRef[] = [
  'requisitions.status',
  'requisitions.openings',
  'requisitions.openedDate',
  'requisitions.filledDate',
  'requisitions.closedDate',
  'requisitions.department',
  'employees.department',
  'employees.jobFunction',
]

/** Accepted offers not started and pre-hire rows (Onboarding's upcoming starts). */
export const STARTS_USES: readonly FieldRef[] = [
  'candidates.status',
  'candidates.hiredDate',
  'candidates.startDate',
  'candidates.reqId',
  'requisitions.department',
  'employees.hireDate',
  'employees.jobFunction',
  'employees.department',
]

/** Planned starts with no req: the hiring plan lines and the reqs they could match (4.4). */
export const PLANNED_USES: readonly FieldRef[] = [
  'hiringPlan.period',
  'hiringPlan.plannedHires',
  'hiringPlan.reqId',
  'hiringPlan.department',
  'requisitions.status',
  'requisitions.department',
  'employees.department',
  'employees.jobFunction',
]

const uniq = (...lists: (readonly FieldRef[])[]): FieldRef[] => [...new Set(lists.flat())]

/** Hiring in flight: the three kinds of hiring, never counted twice. */
export const HIRING_USES: readonly FieldRef[] = uniq(STARTS_USES, REQ_USES, PLANNED_USES)

/** A stage concentrated at a site: where people work, and the site's voluntary attrition. */
export const CONCENTRATION_USES: readonly FieldRef[] = uniq(WHERE_USES, ['employees.terminationType'])

/** The job functions table: people, open openings and planned starts (no candidates). */
export const FUNCTIONS_USES: readonly FieldRef[] = uniq(STAGES_USES, REQ_USES, PLANNED_USES)

/** The readout also cites each site's voluntary attrition (People stats, last 12 months). */
export const FINDINGS_USES: readonly FieldRef[] = uniq(WHERE_USES, HIRING_USES, ['employees.terminationType'])

const OWNER = 'People analytics'
const AS_OF = 'The as-of date.'

/** A ratio's reference: a number of people in one stage per person in another; 0 means none. */
const reference = (key: string, label: string, def: number, description: string) => ({
  key,
  label,
  description,
  type: 'number' as const,
  default: def,
  min: 0,
  max: 10,
  step: 0.05,
  format: 'num2' as const,
})

const share = (key: string, label: string, def: number, description: string) => ({
  key,
  label,
  description,
  type: 'percent' as const,
  default: def,
  min: 0,
  max: 1,
  step: 0.01,
  format: 'pct' as const,
})

export const STAGES_METRICS: readonly MetricInput[] = [
  {
    id: SID.capacity,
    name: 'Engineering capacity by stage',
    definition:
      'Engineering employees, contractors and FTE in each stage of chip development on the as-of date. A person counts in the stage of their job function. Contractors are always their own series.',
    formula: 'active people per stage, employees and contractors apart; FTE = sum of FTE (blank counts as 1)',
    population:
      'Active people whose job family is marked engineering, or whose job function has a saved stage. Interns are listed in the table only, unless counted with employees.',
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: STAGES_USES,
    requires: ['employees.jobFunction'],
    owner: OWNER,
    params: [
      {
        key: 'countInterns',
        label: 'Count interns with employees',
        description:
          'Interns count with employees in each stage, its FTE and every ratio. Off by default: interns are listed in the table only.',
        type: 'boolean',
        default: false,
      },
    ],
  },
  {
    id: SID.hiring,
    name: 'Hiring in flight by stage',
    definition:
      'People hired but not started, open openings, and planned starts with no req yet, in the stage of their job function. Nothing is counted twice.',
    formula: 'accepted offers not started + open openings + planned starts with no req, per stage',
    population:
      'Upcoming starts from Onboarding (accepted offers and pre-hire rows, matched so a person counts once), openings of open reqs (on hold left out), and hiring plan lines with no req. A req takes the most common job function of its department’s active employees.',
    window:
      'Upcoming starts after the as-of date; open reqs on the as-of date; plan starts in the planned starts window (6 months by default).',
    unit: 'int',
    goodDirection: null,
    uses: HIRING_USES,
    dependsOn: [SID.capacity],
    owner: OWNER,
    params: [
      {
        key: 'planMonths',
        label: 'Planned starts window',
        description:
          'How many months of hiring plan starts count as planned, from the month after the as-of date.',
        type: 'months',
        default: 6,
        min: 1,
        max: 18,
        step: 1,
      },
    ],
  },
  {
    id: SID.planned,
    name: 'Planned starts with no req',
    definition:
      'Hiring plan starts in the planned starts window whose plan line has no req, so no open req covers them, by stage.',
    formula:
      'planned hires on plan lines with no req, starting in the planned starts window (6 months by default)',
    population:
      'Hiring plan lines of the latest plan version; a line takes the most common job function of its department’s active employees.',
    window: 'The planned starts window: the 6 months after the as-of date by default.',
    unit: 'int',
    goodDirection: 'down',
    uses: PLANNED_USES,
    requires: ['hiringPlan.period', 'hiringPlan.plannedHires'],
    dependsOn: [SID.hiring],
    owner: OWNER,
  },
  {
    id: SID.ratios,
    name: 'Stage ratios',
    definition:
      'People in one stage for each person in another, such as design verification engineers per RTL designer, against a reference you set. A reference, not a target.',
    formula: 'people in stage A ÷ people in stage B (heads, never FTE)',
    population:
      'Engineering employees, plus contractors while contractors count in ratios (off by default, as industry references count employees). Hidden when the stage below the line has fewer people than the anonymity minimum.',
    window: AS_OF,
    unit: 'num2',
    goodDirection: null,
    uses: STAGES_USES,
    dependsOn: [SID.capacity],
    owner: OWNER,
    params: [
      {
        key: 'ratioContractors',
        label: 'Count contractors in ratios',
        description:
          'Contractors count in both stages of every ratio. Off by default: industry references count employees, and the readout still gives the ratio with contractors.',
        type: 'boolean',
        default: false,
      },
      reference(
        'verificationReference',
        'Verification per RTL designer reference',
        1.5,
        'Industry surveys put the average around one verification engineer per designer, with two or more per designer common on large SoCs. A reference, not a target. 0 means no reference.',
      ),
      reference(
        'dftReference',
        'DFT per RTL designer reference',
        0,
        'No common reference exists, so set your own. 0 means no reference.',
      ),
      reference(
        'physicalReference',
        'Physical design and signoff per RTL designer reference',
        0,
        'No common reference exists, so set your own. 0 means no reference.',
      ),
      reference(
        'postSiliconReference',
        'Post-silicon per pre-silicon reference',
        0,
        'Post-silicon validation and product and test engineering for each person in the seven pre-silicon stages. 0 means no reference.',
      ),
      reference(
        'softwareReference',
        'Software and firmware per silicon engineer reference',
        0,
        'Software and firmware for each person in the nine lifecycle stages. 0 means no reference.',
      ),
    ],
  },
  {
    id: SID.mapped,
    name: 'Stage recorded',
    definition:
      'The share of engineering employees whose job function has a stage saved on the Job functions list. The rest count in a proposed stage or in Not mapped.',
    formula: 'engineering employees in a job function with a saved stage ÷ engineering employees',
    population: 'Active engineering employees (and interns while they count with employees).',
    window: AS_OF,
    unit: 'pct',
    goodDirection: 'up',
    uses: STAGES_USES,
    dependsOn: [SID.capacity],
    owner: OWNER,
  },
  {
    id: SID.findings,
    name: 'Engineering by stage readout',
    definition:
      'Flags a ratio below its reference, a stage concentrated at a site whose voluntary attrition is above the company, the stages with the most planned starts and no req, a stage carried by contractors, and engineers whose job function has no saved stage. A group under the anonymity minimum is never flagged.',
    formula:
      'ratio ≤ reference × (1 − below by); stage share at one site ≥ concentration and site voluntary attrition − company ≥ attrition gap; contractors ÷ stage ≥ contractor share; not mapped ÷ engineering > unmapped share, or any stage only proposed',
    population:
      'Engineering people in scope on the as-of date; attrition is People stats voluntary attrition.',
    window: 'The as-of date; site attrition over the last 12 months.',
    unit: 'int',
    goodDirection: null,
    uses: FINDINGS_USES,
    dependsOn: [SID.capacity, SID.ratios, SID.hiring, 'hrbp.attrition.voluntary'],
    owner: OWNER,
    params: [
      share(
        'belowBy',
        'Below reference by',
        0.15,
        'A ratio this far below its reference, as a share of the reference, is flagged.',
      ),
      share(
        'concentration',
        'Concentrated at one site',
        0.4,
        'A stage with at least this share of its people at one site is checked against that site’s attrition.',
      ),
      share(
        'contractorShare',
        'Contractor-heavy stage',
        0.15,
        'A stage where contractors are at least this share of its people is noted.',
      ),
      share(
        'unmappedShare',
        'Not mapped share',
        0.05,
        'Engineering employees in a job function with no stage, above this share, are noted.',
      ),
      {
        key: 'attritionGap',
        label: 'Site attrition above the company by',
        description:
          'A concentrated stage is flagged when its site’s voluntary attrition is at least this many points above the company’s.',
        type: 'percent',
        default: 0.03,
        min: 0,
        max: 0.5,
        step: 0.005,
        format: 'pts',
      },
    ],
  },
]
