/**
 * A small catalog for the dictionary's own tests, independent of what the views register.
 */
import { defineMetrics } from './define'
import { catalogOf } from './registry'
import type { MetricDef } from './types'

export const FIXTURE_DEFS: MetricDef[] = [
  ...defineMetrics('hrbp', [
    {
      id: 'hrbp.attrition.voluntary',
      name: 'Voluntary attrition',
      views: ['comp', 'talent'],
      definition: 'Employees who resigned in the window, as a share of average headcount, annualized.',
      formula: 'voluntary exits ÷ average headcount × (12 ÷ window months)',
      population: 'Employees only; contractors and interns excluded.',
      window: 'The period picker (default last 12 months)',
      unit: 'pct',
      goodDirection: 'down',
      target: { value: 0.08, comparator: '<=' },
      uses: ['employees.hireDate', 'employees.terminationDate', 'employees.terminationType'],
      owner: 'People analytics',
      params: [
        {
          key: 'annualize',
          label: 'Annualize turnover rates',
          description: 'Scale rates to a 12-month equivalent.',
          type: 'boolean',
          default: true,
        },
        {
          key: 'firstYearDays',
          label: 'First-year window',
          description: 'Days after hire that count as the first year.',
          type: 'days',
          default: 365,
          min: 30,
          max: 730,
        },
        {
          key: 'regretted',
          label: 'What counts as regretted',
          description: 'Which exits count as regretted.',
          type: 'choice',
          default: 'flagged',
          choices: [
            { value: 'flagged', label: 'Voluntary and flagged regrettable' },
            { value: 'allVoluntary', label: 'Every voluntary exit' },
          ],
        },
      ],
    },
  ]),
  ...defineMetrics('comp', [
    {
      id: 'comp.merit.spend',
      name: 'Merit spend',
      definition: 'Proposed merit as a share of eligible base.',
      unit: 'pct2',
      goodDirection: null,
      uses: ['comp.meritPct', 'comp.baseSalary'],
      params: [
        {
          key: 'meritBudget',
          label: 'Merit budget',
          description: 'The merit pool as a share of eligible base salary.',
          type: 'percent',
          default: 0.035,
          min: 0,
          max: 0.2,
          format: 'pct2',
        },
        {
          key: 'guideline',
          label: 'Merit guideline by rating',
          description: 'Merit by rating.',
          type: 'ratingMap',
          default: { 5: 0.06, 4: 0.045, 3: 0.03, 2: 0.01, 1: 0 },
          min: 0,
          max: 0.3,
          format: 'pct',
        },
        {
          key: 'healthyBand',
          label: 'Healthy compa-ratio band',
          description: 'Compa-ratios inside count as healthy.',
          type: 'range',
          default: [0.9, 1.1],
          min: 0.5,
          max: 1.5,
          format: 'ratio',
        },
        {
          key: 'reviewMonths',
          label: 'New manager window',
          description: 'Months a manager counts as new.',
          type: 'months',
          default: 12,
          min: 1,
          max: 36,
        },
      ],
    },
  ]),
  {
    id: 'privacy.anonymity',
    name: 'Anonymity minimum',
    views: ['hrbp'],
    definition: 'Groups smaller than this are hidden.',
    unit: 'int',
    goodDirection: null,
    uses: [],
    locked: true,
    params: [
      {
        key: 'minGroup',
        label: 'Smallest group shown',
        description: 'It can be raised, never lowered.',
        type: 'number',
        default: 5,
        min: 5,
        max: 50,
        format: 'int',
        locked: 'raiseOnly',
      },
      {
        key: 'payOptIn',
        label: 'Pay amounts are opt-in',
        description: 'Locked.',
        type: 'boolean',
        default: true,
        locked: true,
      },
    ],
  },
]

export const FIXTURE = catalogOf(FIXTURE_DEFS)
