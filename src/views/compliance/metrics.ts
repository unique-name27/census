/**
 * The compliance view's metric dictionary entries (docs/METRICS.md), registered with
 * `defineMetrics('compliance', [...])`: one per KPI, figure measure and readout rule. Engines read
 * every threshold through `ctx.metrics` (engine/settings.ts), never as constants, and wording never
 * quotes a number a setting governs: the value in force is added where the number is shown.
 *
 * The catalog imports this file, so keep it to plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or
 * '@/metrics/testing'. From the engine it imports only './engine/lineage' (plain data).
 */
import { defineMetrics } from '@/metrics/define'
import type { MetricDef, ParamDef } from '@/metrics/types'
import { USES, union } from './engine/lineage'

/** Metric ids, by what the view calls them. */
export const M = {
  expiring: 'compliance.work.expiring',
  expired: 'compliance.work.expired',
  reverificationOnTime: 'compliance.work.reverificationOnTime',
  reverificationOverdue: 'compliance.work.reverificationOverdue',
  mix: 'compliance.work.authorizationMix',
  i9Section2: 'compliance.i9.section2OnTime',
  i9Section1: 'compliance.i9.section1OnTime',
  withoutLicense: 'compliance.export.withoutLicense',
  pendingStarts: 'compliance.export.pendingStarts',
  licenseStatus: 'compliance.export.licenseStatus',
  policyAcks: 'compliance.training.policyAcks',
  deadlines: 'compliance.deadlines.upcoming',
  calendar: 'compliance.deadlines.calendar',
  overdueRule: 'compliance.readout.reverificationOverdue',
  i9Rule: 'compliance.readout.i9Late',
  clusterRule: 'compliance.readout.expiryCluster',
  actionItems: 'compliance.actions.items',
} as const

/** Required training on time is the Talent metric: Compliance shows it and links there, never a copy. */
export const TALENT_REQUIRED_TRAINING = 'talent.learning.requiredOnTime'

/** Setting keys, by the metric that holds them. */
export const P = {
  headlineDays: { metricId: M.expiring, key: 'headlineDays' },
  horizonDays: { metricId: M.expiring, key: 'horizonDays' },
  leadDays: { metricId: M.reverificationOnTime, key: 'leadDays' },
  i9Days: { metricId: M.i9Section2, key: 'businessDays' },
  pendingDays: { metricId: M.pendingStarts, key: 'days' },
  policyDays: { metricId: M.policyAcks, key: 'businessDays' },
  deadlineDays: { metricId: M.deadlines, key: 'days' },
  overdueCriticalDays: { metricId: M.overdueRule, key: 'criticalDays' },
  i9CriticalShare: { metricId: M.i9Rule, key: 'criticalShare' },
  clusterMin: { metricId: M.clusterRule, key: 'minPeople' },
  clusterShare: { metricId: M.clusterRule, key: 'minShare' },
  reverifyNotice: { metricId: M.actionItems, key: 'reverificationNoticeDays' },
} as const

/** Today's defaults; engine/settings.ts reads the values in force through the registry. */
export const DEFAULTS = {
  headlineDays: 90,
  horizonDays: 180,
  leadDays: 90,
  i9Days: 3,
  pendingDays: 90,
  policyDays: 5,
  deadlineDays: 60,
  overdueCriticalDays: 30,
  i9CriticalShare: 0.9,
  clusterMin: 5,
  clusterShare: 0.25,
  reverifyNotice: 30,
} as const

const OWNER = {
  mobility: 'Global mobility',
  ops: 'People operations',
  trade: 'Trade compliance',
  legal: 'Legal and people operations',
} as const

const days = (
  key: string,
  label: string,
  description: string,
  value: number,
  min = 1,
  max = 730,
): ParamDef => ({
  key,
  label,
  description,
  type: 'days',
  default: value,
  min,
  max,
  step: 1,
  format: 'days',
})

const share = (key: string, label: string, description: string, value: number): ParamDef => ({
  key,
  label,
  description,
  type: 'percent',
  default: value,
  min: 0,
  max: 1,
  step: 0.01,
  format: 'pct',
})

const AS_OF = 'At the as-of date.'
const NEXT = 'From the day after the as-of date.'

export const metrics: MetricDef[] = defineMetrics('compliance', [
  {
    id: M.expiring,
    name: 'Work authorizations expiring',
    definition:
      'Active people whose work authorization ends after the as-of date and within the headline window (90 days by default). The note counts the longer planning window (180 days by default).',
    formula: 'active people with as-of date < expiry date ≤ as-of date + window',
    population:
      'Employees and interns in the roster and active at the as-of date with a right to work row. Authorization with no expiry is never counted.',
    window: NEXT,
    unit: 'int',
    goodDirection: null,
    uses: USES.expiringByUnit,
    owner: OWNER.mobility,
    params: [
      days(
        'headlineDays',
        'Headline window',
        'Days after the as-of date counted in the headline number and the folder tab.',
        DEFAULTS.headlineDays,
        7,
        365,
      ),
      days(
        'horizonDays',
        'Planning window',
        'Days after the as-of date shown in the expiry chart, the list of expiring authorizations and the reverification rate.',
        DEFAULTS.horizonDays,
        30,
        730,
      ),
    ],
  },
  {
    id: M.expired,
    name: 'Working on an expired authorization',
    definition:
      'Active people whose work authorization ended before the as-of date. When an authorization is renewed, the right to work row should carry the new expiry date.',
    formula: 'active people with expiry date < as-of date',
    population: 'Employees and interns active at the as-of date with a right to work row.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    target: { value: 0, comparator: '<=' },
    uses: USES.expiring,
    owner: OWNER.mobility,
  },
  {
    id: M.reverificationOnTime,
    name: 'Reverification on time',
    definition:
      'Of the authorizations that ended in the period or end within the planning window, the share whose reverification started at least the lead time before the expiry date (90 days by default). An authorization counts once its lead-time mark has passed or its reverification has started.',
    formula: 'started ≥ lead time before expiry ÷ authorizations judged',
    population:
      'People employed when the authorization ends (or at the as-of date, for one that ends later). Hidden when fewer people than the anonymity minimum are judged.',
    window: 'The period picker for past expiries, plus the planning window ahead.',
    unit: 'pct',
    goodDirection: 'up',
    target: { value: 1, comparator: '>=' },
    targetRequired: true,
    dependsOn: [M.expiring],
    uses: USES.reverification,
    readoutUses: ['employees.businessUnit'],
    owner: OWNER.mobility,
    params: [
      days(
        'leadDays',
        'Reverification lead time',
        'How many days before the expiry date reverification should start. Also sets when a missing start becomes overdue.',
        DEFAULTS.leadDays,
        14,
        365,
      ),
    ],
  },
  {
    id: M.reverificationOverdue,
    name: 'Reverification overdue',
    definition:
      'Active people whose work authorization ends within the reverification lead time (90 days by default) and whose reverification has not started.',
    formula: 'active people with expiry ≤ as-of date + lead time and no reverification start',
    population: 'Employees and interns active at the as-of date with a right to work row.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    target: { value: 0, comparator: '<=' },
    dependsOn: [M.reverificationOnTime],
    uses: USES.reverification,
    owner: OWNER.mobility,
  },
  {
    id: M.mix,
    name: 'Authorization mix',
    definition:
      'Active employees by broad authorization category (contractors and interns are reported separately). Citizens and permanent residents are both "Permanent (no expiry)"; nationality and citizenship are never held. Categories with fewer people than the anonymity minimum fold into Other, and the people behind a count open only while "Show immigration details" is on.',
    formula: 'active employees with a right to work row, by authorization category ÷ all of them',
    population:
      'Employees active at the as-of date with a right to work row. Interns are reported separately.',
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: USES.mix,
    owner: OWNER.mobility,
  },
  {
    id: M.i9Section2,
    name: 'I-9 Section 2 on time',
    definition:
      'US employees who started in the period whose Form I-9 Section 2 was completed within the allowed business days of the start date (3 by default, Atlas ON-02). A start counts once its deadline has passed or Section 2 is done.',
    formula: 'Section 2 date ≤ start date + business days ÷ US starts judged',
    population:
      'Employees at a US site (or with United States as the country) who started in the period and have a right to work row. Contractors and interns are not counted. Business days are Monday to Friday, without holidays.',
    window: 'The period picker (default last 12 months).',
    unit: 'pct',
    goodDirection: 'up',
    target: { value: 1, comparator: '>=' },
    targetRequired: true,
    uses: USES.i9,
    owner: OWNER.ops,
    params: [
      days(
        'businessDays',
        'Business days allowed',
        'Business days after the start date by which Section 2 must be complete.',
        DEFAULTS.i9Days,
        1,
        10,
      ),
    ],
  },
  {
    id: M.i9Section1,
    name: 'I-9 Section 1 by the first day',
    definition:
      'US employees who started in the period whose Form I-9 Section 1 was completed on or before the start date.',
    formula: 'Section 1 date ≤ start date ÷ US starts',
    population: 'Employees at a US site who started in the period and have a right to work row.',
    window: 'The period picker (default last 12 months).',
    unit: 'pct',
    goodDirection: 'up',
    target: { value: 1, comparator: '>=' },
    uses: USES.i9Section1,
    owner: OWNER.ops,
  },
  {
    id: M.withoutLicense,
    name: 'Working without an export license in force',
    definition:
      'Active people whose role needs an export-control license and whose license is Pending, Denied or Expired, or whose license expiry date is before the as-of date. People who started while a license was still pending are among them until it is approved.',
    formula: 'active, license required, and status Pending, Denied or Expired (or license expired)',
    population: 'Employees and interns active at the as-of date. The license flag never records nationality.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    target: { value: 0, comparator: '<=' },
    uses: USES.exportLicense,
    owner: OWNER.trade,
  },
  {
    id: M.pendingStarts,
    name: 'Upcoming starts with a license pending',
    definition:
      'People in the roster with a start date after the as-of date and within the look-ahead (90 days by default) whose role needs an export-control license that is not yet in force.',
    formula: 'pre-hires starting in the look-ahead, license required and not in force',
    population: 'Pre-hire records in Employees (hire date after the as-of date).',
    window: NEXT,
    unit: 'int',
    goodDirection: 'down',
    uses: USES.exportLicense,
    owner: OWNER.trade,
    params: [
      days(
        'days',
        'Look-ahead',
        'Days after the as-of date in which a start with a pending license is listed for trade compliance.',
        DEFAULTS.pendingDays,
        7,
        365,
      ),
    ],
  },
  {
    id: M.licenseStatus,
    name: 'Export licenses by status',
    definition:
      'People whose role needs an export-control license, active or starting soon, by license status. A license past its expiry date counts as Expired, unless it was Denied.',
    formula:
      'active people and pre-hires whose role needs a license, by status; a license past its expiry date reads Expired, unless it was Denied',
    population: 'Employees and interns active at the as-of date, and pre-hires.',
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: USES.exportLicense,
    owner: OWNER.trade,
  },
  {
    id: M.policyAcks,
    name: 'Policy acknowledgments on time',
    definition:
      'New starts whose policy acknowledgments task was completed within the allowed business days of the start date (5 by default, Atlas ON-04), for tasks due in the period. The task due date is used when the start date is unknown.',
    formula: 'completed ≤ start date + business days ÷ acknowledgment tasks due',
    population: 'Onboarding tasks named Policy acknowledgments, except those marked Not needed.',
    window: 'The period picker (default last 12 months).',
    unit: 'pct',
    goodDirection: 'up',
    target: { value: 0.95, comparator: '>=' },
    uses: USES.policyAcks,
    owner: OWNER.ops,
    params: [
      days(
        'businessDays',
        'Business days allowed',
        'Business days after the start date by which the acknowledgments must be complete.',
        DEFAULTS.policyDays,
        1,
        30,
      ),
    ],
  },
  {
    id: M.deadlines,
    name: 'Statutory deadlines coming up',
    definition:
      'Entries of the Atlas statutory calendar that fall after the as-of date and within the look-ahead (60 days by default), for the jurisdictions where someone in scope works. US federal entries apply wherever someone works at a US site. An entry without a named day counts for its whole month.',
    formula:
      'calendar entries dated in (as-of date, as-of date + look-ahead], jurisdictions with active people',
    population:
      'Jurisdictions of the sites of employees active at the as-of date (contractors and interns are reported separately).',
    window: NEXT,
    unit: 'int',
    goodDirection: null,
    uses: USES.deadlines,
    owner: OWNER.legal,
    params: [
      days(
        'days',
        'Look-ahead',
        'Days after the as-of date for which statutory deadlines are listed.',
        DEFAULTS.deadlineDays,
        7,
        366,
      ),
    ],
  },
  {
    id: M.calendar,
    name: 'Statutory calendar by month',
    definition:
      'Entries of the Atlas statutory calendar in each of the next 12 months, for each jurisdiction where someone in scope works, so payroll and people operations can see the heavy months ahead. Monthly entries count in every month; an entry without a named day counts in its month.',
    formula: 'calendar entries falling in the month, per jurisdiction with active people',
    population:
      'Jurisdictions of the sites of employees active at the as-of date (contractors and interns are reported separately). US federal entries apply wherever someone works at a US site.',
    window: 'The 12 calendar months after the as-of month.',
    unit: 'int',
    goodDirection: null,
    uses: USES.deadlines,
    owner: OWNER.legal,
  },
  {
    id: M.overdueRule,
    name: 'Readout: reverification overdue',
    definition:
      'Raised when any active person is inside the reverification lead time without a start, naming the business unit with the most such people. Critical when one of the authorizations ends within a set number of days (30 by default).',
    formula:
      'raised when reverification overdue > 0; critical when expiry date − as-of date ≤ critical within for any of them',
    population:
      'As Reverification overdue: employees and interns active at the as-of date with a right to work row.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    dependsOn: [M.reverificationOverdue],
    uses: union(USES.reverificationByUnit),
    owner: OWNER.mobility,
    params: [
      days(
        'criticalDays',
        'Critical within',
        'An overdue reverification is critical when the authorization ends within this many days.',
        DEFAULTS.overdueCriticalDays,
        1,
        180,
      ),
    ],
  },
  {
    id: M.i9Rule,
    name: 'Readout: I-9 Section 2 late',
    definition:
      'Raised when I-9 Section 2 on time misses its target, naming the site with the most late starts. Critical when the on-time share is below a set share (90% by default).',
    formula:
      'raised when I-9 Section 2 on time < its target with late starts; critical when on time < critical below',
    population:
      'As I-9 Section 2 on time: employees at a US site who started in the period and have a right to work row.',
    window: 'The period picker (default last 12 months).',
    unit: 'pct',
    goodDirection: 'up',
    dependsOn: [M.i9Section2],
    uses: USES.i9,
    owner: OWNER.ops,
    params: [
      share(
        'criticalShare',
        'Critical below',
        'The finding is critical when the on-time share is below this.',
        DEFAULTS.i9CriticalShare,
      ),
    ],
  },
  {
    id: M.clusterRule,
    name: 'Readout: expiries cluster in one month',
    definition:
      'Raised when one month of the planning window holds at least a set number of expiring authorizations (5 by default) and at least a set share of them (25% by default), so reverification can be planned as a batch.',
    formula:
      "busiest month's expiries ≥ smallest cluster, and busiest month ÷ expiries in the planning window ≥ share of the window",
    population:
      'As Work authorizations expiring: employees and interns active at the as-of date whose authorization ends in the planning window.',
    window:
      'The planning window (180 days by default) from the day after the as-of date, by month of the expiry date.',
    unit: 'int',
    goodDirection: null,
    dependsOn: [M.expiring],
    uses: USES.expiring,
    owner: OWNER.mobility,
    params: [
      {
        key: 'minPeople',
        label: 'Smallest cluster',
        description: 'A month needs at least this many expiring authorizations.',
        type: 'number',
        default: DEFAULTS.clusterMin,
        min: 2,
        max: 100,
        step: 1,
        format: 'int',
      },
      share(
        'minShare',
        'Share of the window',
        'A month needs at least this share of the authorizations expiring in the planning window.',
        DEFAULTS.clusterShare,
      ),
    ],
  },
  {
    id: M.actionItems,
    name: 'Compliance items in the Action center',
    views: ['actions'],
    definition:
      'Open compliance items handed to the Action center: reverification to start (Global mobility), I-9 Section 2 past due and not complete (People operations) and export licenses not in force for someone working or starting (Trade compliance). Reverification items also show a set number of days before they fall due.',
    formula:
      'reverifications ended, overdue or due to start within the reverification notice + I-9 Section 2 past due + licenses not in force for people working or starting',
    population:
      'Employees and interns active at the as-of date with a right to work row (reverification), US employees still employed who started in the period (I-9), and active people and pre-hires whose role needs an export license.',
    window:
      'At the as-of date. I-9 items cover starts in the period; upcoming license items use the look-ahead of Upcoming starts with a license pending.',
    unit: 'int',
    goodDirection: 'down',
    dependsOn: [M.reverificationOnTime, M.i9Section2, M.pendingStarts],
    uses: union(USES.reverification, USES.i9, USES.exportLicense),
    owner: OWNER.ops,
    params: [
      days(
        'reverificationNoticeDays',
        'Reverification notice',
        'Days before the reverification lead-time mark that an item appears for Global mobility.',
        DEFAULTS.reverifyNotice,
        0,
        180,
      ),
    ],
  },
])
