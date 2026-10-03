/** Metric definitions shown in figure datasheets. One wording per term across the view. */
import type { Definition } from '@/charts'

export const DEF = {
  headcount: {
    term: 'Headcount',
    text: 'Employees active on the date: hired on or before it and not yet terminated. Contractors and interns are excluded.',
    formula: 'hireDate ≤ d and (no terminationDate or terminationDate > d)',
  },
  avgHeadcount: {
    term: 'Average headcount',
    text: 'Mean of the month-end headcounts from the day before the period opens to its last day (13 points for 12 months).',
  },
  attrition: {
    term: 'Attrition',
    text: 'Employee exits in the period divided by average headcount, annualized so periods of different length compare.',
    formula: 'exits ÷ average headcount × 12 ÷ months',
  },
  voluntary: {
    term: 'Voluntary attrition',
    text: 'Exits with termination type Voluntary, divided by average headcount, annualized.',
    formula: 'voluntary exits ÷ average headcount × 12 ÷ months',
  },
  regretted: {
    term: 'Regretted attrition',
    text: 'Voluntary exits marked regrettable, divided by average headcount, annualized.',
    formula: 'regretted voluntary exits ÷ average headcount × 12 ÷ months',
  },
  firstYear: {
    term: 'First-year attrition',
    text: 'Of employees hired 12 to 24 months before the as-of date, the share who left within 365 days of their hire date. Hidden when the cohort is under 5.',
    formula: 'left within 365 days ÷ cohort',
  },
  promotionRate: {
    term: 'Promotion rate',
    text: 'Promotion events in the period from Job changes, divided by average headcount, annualized. A person promoted twice counts twice.',
    formula: 'promotions ÷ average headcount × 12 ÷ months',
  },
  mobility: {
    term: 'Internal mobility',
    text: 'People with at least one promotion, transfer or lateral move in the period, divided by average headcount. Each person counts once.',
    formula: 'people who moved ÷ average headcount',
  },
  span: {
    term: 'Span of control',
    text: 'Active direct reports of a manager, counting employees, contractors and interns. A manager is anyone in scope with at least one active direct report.',
  },
  layers: {
    term: 'Layers',
    text: 'Reporting levels from the top of the group to its deepest person. One person alone is 1 layer.',
  },
  newManager: {
    term: 'New manager',
    text: 'Hired, or promoted from an individual level (L) to a manager level (M or E), in the last 12 months.',
  },
  suppressed: {
    term: 'Hidden values',
    text: 'Rates over fewer than 5 people (average headcount) show as a dash to protect anonymity.',
  },
} satisfies Record<string, Definition>
