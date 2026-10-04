/**
 * The records behind every Compliance number, as specs for the shared drill panel (src/drill).
 * Pure: the UI wraps the calls in thunks so rows are gathered on click.
 *
 * Privacy: the authorization type shows per person only while "Show immigration details" is on
 * (the panel blanks it otherwise, and these specs drop the column), and a count by authorization
 * type opens its people only then. Expiry dates and reverification status are shown per person:
 * they are what people operations acts on.
 */
import type { Column } from '@/charts/types'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Employee, ISODate, LearningRecord, OnboardingTask, RightToWork } from '@/data/schema'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import type { Person } from './base'
import type { DeadlineRow } from './deadlines'
import type { LicenseRow } from './exportControl'
import type { I9Row } from './i9'
import type { PolicyRow } from './training'
import type { ExpiryRow } from './work'

export interface DrillScope {
  asOf: ISODate
  /** The org scope in words. */
  scope: string
  /** The reporting window in words: "1 Oct 2025 – 30 Sep 2026". */
  window: string
  /** The comparison window in words. */
  prior: string
  showImmigration: boolean
}

export const asOfSub = (s: DrillScope): string => `As of ${formatDate(s.asOf)} · ${s.scope}`
export const windowSub = (s: DrillScope): string => `${s.window} · ${s.scope}`

const EXPIRY_COLS = ['expiryDate', 'daysToExpiry', 'reverificationStartedDate']
const I9_COLS = ['i9Section1Date', 'i9Section2Date']
const LICENSE_COLS = ['exportLicenseRequired', 'exportLicenseStatus', 'exportLicenseExpiry']

/** Standard right to work columns to leave out: the other topics, and the type unless immigration details are on. */
function hideFor(s: DrillScope, keep: 'expiry' | 'i9' | 'license' | 'all'): string[] {
  const hide = s.showImmigration ? [] : ['authorizationType']
  if (keep === 'all') return hide
  if (keep !== 'expiry') hide.push(...EXPIRY_COLS)
  if (keep !== 'i9') hide.push(...I9_COLS)
  if (keep !== 'license') hide.push(...LICENSE_COLS)
  return hide
}

const C = (key: string, label: string, format?: Column['format']): Column => ({ key, label, format })

/* ───────────── right to work: expiries and reverification ───────────── */

const EXPIRY_EXTRA: Column[] = [
  C('dueBy', 'Start reverification by', 'date'),
  C('startedAhead', 'Started days ahead', 'days'),
  C('status', 'Reverification'),
  C('businessUnit', 'Business unit'),
]

export function expiryDrill(
  s: DrillScope,
  rows: readonly ExpiryRow[],
  o: { title: string; subtitle?: string; note?: string; uses: readonly FieldRef[] },
): DrillSpec<'rightToWork'> {
  const by = new Map(rows.map((x) => [x.r.employeeId, x]))
  return drillSpec({
    kind: 'rightToWork',
    title: o.title,
    subtitle: o.subtitle ?? asOfSub(s),
    rows: rows.map((x) => x.r),
    hide: hideFor(s, 'expiry'),
    extra: {
      columns: EXPIRY_EXTRA,
      values: (r: RightToWork) => {
        const x = by.get(r.employeeId)
        return {
          dueBy: x?.dueBy ?? null,
          startedAhead: x?.startedAhead ?? null,
          status: x?.status ?? null,
          businessUnit: x?.e.businessUnit ?? null,
        }
      },
    },
    note: o.note,
    uses: o.uses,
  })
}

/** People by authorization category: only while immigration details are on (otherwise null). */
export function mixDrill(
  s: DrillScope,
  rows: readonly Person[],
  type: string,
  uses: readonly FieldRef[],
): DrillSpec<'rightToWork'> | null {
  if (!s.showImmigration || !rows.length) return null
  return drillSpec({
    kind: 'rightToWork',
    title: `Active people, ${type}`,
    subtitle: asOfSub(s),
    rows: rows.map((p) => p.r),
    hide: [...I9_COLS, ...LICENSE_COLS],
    uses,
  })
}

/* ───────────── I-9 ───────────── */

const I9_EXTRA: Column[] = [
  C('hireDate', 'Start date', 'date'),
  C('site', 'Site'),
  C('deadline', 'Section 2 due', 'date'),
  C('businessDays', 'Business days to Section 2', 'int'),
  C('outcome', 'Section 2'),
]

export function i9Outcome(x: I9Row): string {
  if (x.onTime) return 'On time'
  return x.section2 ? 'Late' : x.open ? 'Not done, past due' : 'Not done'
}

export function i9Drill(
  s: DrillScope,
  rows: readonly I9Row[],
  o: { title: string; subtitle?: string; note?: string; uses: readonly FieldRef[] },
): DrillSpec<'rightToWork'> {
  const by = new Map(rows.map((x) => [x.r.employeeId, x]))
  return drillSpec({
    kind: 'rightToWork',
    title: o.title,
    subtitle: o.subtitle ?? windowSub(s),
    rows: rows.map((x) => x.r),
    hide: hideFor(s, 'i9'),
    extra: {
      columns: I9_EXTRA,
      values: (r: RightToWork) => {
        const x = by.get(r.employeeId)
        return {
          hireDate: x?.hireDate ?? null,
          site: x?.site ?? null,
          deadline: x?.deadline ?? null,
          businessDays: x?.businessDays ?? null,
          outcome: x ? i9Outcome(x) : null,
        }
      },
    },
    note: o.note,
    uses: o.uses,
  })
}

/* ───────────── export control ───────────── */

const LICENSE_EXTRA: Column[] = [
  C('startDate', 'Start date', 'date'),
  C('judged', 'License as of the as-of date'),
  C('businessUnit', 'Business unit'),
]

export function licenseDrill(
  s: DrillScope,
  rows: readonly LicenseRow[],
  o: { title: string; note?: string; uses: readonly FieldRef[] },
): DrillSpec<'rightToWork'> {
  const by = new Map(rows.map((x) => [x.r.employeeId, x]))
  return drillSpec({
    kind: 'rightToWork',
    title: o.title,
    subtitle: asOfSub(s),
    rows: rows.map((x) => x.r),
    hide: hideFor(s, 'license'),
    extra: {
      columns: LICENSE_EXTRA,
      values: (r: RightToWork) => {
        const x = by.get(r.employeeId)
        return {
          startDate: x?.startDate ?? null,
          judged: x ? (x.inForce ? 'In force' : x.status) : null,
          businessUnit: x?.e.businessUnit ?? null,
        }
      },
    },
    note: o.note,
    uses: o.uses,
  })
}

/* ───────────── training and acknowledgments ───────────── */

export function trainingDrill(
  s: DrillScope,
  rows: readonly LearningRecord[],
  o: { title: string; note?: string; uses: readonly FieldRef[] },
): DrillSpec<'learning'> {
  return drillSpec({
    kind: 'learning',
    title: o.title,
    subtitle: windowSub(s),
    rows,
    note: o.note,
    uses: o.uses,
  })
}

export function policyDrill(
  s: DrillScope,
  rows: readonly PolicyRow[],
  o: { title: string; note?: string; uses: readonly FieldRef[] },
): DrillSpec<'onboardingTasks'> {
  const by = new Map<OnboardingTask, PolicyRow>(rows.map((x) => [x.task, x]))
  return drillSpec({
    kind: 'onboardingTasks',
    title: o.title,
    subtitle: windowSub(s),
    rows: rows.map((x) => x.task),
    extra: {
      columns: [C('deadline', 'Allowed until', 'date'), C('onTime', 'On time')],
      values: (t: OnboardingTask) => {
        const x = by.get(t)
        return { deadline: x?.deadline ?? null, onTime: x ? (x.onTime ? 'Yes' : 'No') : null }
      },
    },
    note: o.note,
    uses: o.uses,
  })
}

/* ───────────── deadlines ───────────── */

export function jurisdictionPeopleDrill(
  s: DrillScope,
  people: readonly Employee[],
  jurisdiction: string,
  uses: readonly FieldRef[],
): DrillSpec<'employees'> {
  return drillSpec({
    kind: 'employees',
    title: `Active people covered by ${jurisdiction}`,
    subtitle: asOfSub(s),
    rows: people,
    hide: ['terminationDate', 'terminationType', 'terminationReason', 'regrettable'],
    uses,
  })
}

export function deadlinePeopleDrill(s: DrillScope, d: DeadlineRow, uses: readonly FieldRef[]) {
  return jurisdictionPeopleDrill(s, d.people, d.jurisdiction.shortName, uses)
}
