/**
 * Shared preparation for the Compliance engines: right to work rows joined to the roster, the
 * window and the as-of date, and small helpers. Pure: no React, no DOM.
 */
import type { AnalyticsContext } from '@/data/context'
import { type Employee, type ISODate, type RightToWork, siteByLocation } from '@/data/schema'
import { isActiveAt } from '@/data/scope'
import { type ComplianceSettings, readSettings } from './settings'

/** A right to work row with its person from the roster. */
export interface Person {
  r: RightToWork
  e: Employee
}

export interface ComplianceBase {
  asOf: ISODate
  settings: ComplianceSettings
  /** Right to work rows in scope whose person is in the roster. */
  people: Person[]
  /** In scope, active at the as-of date. */
  active: Person[]
  /** In scope, starting after the as-of date (pre-hire records). */
  upcoming: Person[]
  /** Right to work rows in scope whose employee ID is not in the roster (left out of every number). */
  notInRoster: RightToWork[]
  byEmployee: Map<string, RightToWork>
  /** Which optional fields the loaded right to work data carries; a missing one makes its numbers null. */
  has: {
    rightToWork: boolean
    expiry: boolean
    reverification: boolean
    authorizationType: boolean
    i9Section1: boolean
    i9Section2: boolean
    exportLicense: boolean
  }
}

const UNITED_STATES = 'United States'

/** Works at a US site (or, for a site Census does not know, has United States as the country). */
export function isUsPerson(e: Pick<Employee, 'location' | 'country'>): boolean {
  const site = siteByLocation.get(e.location)
  return site ? site.country === UNITED_STATES : e.country === UNITED_STATES
}

/**
 * The Atlas jurisdictions whose rules apply to a person: the site's (US state, or country) and,
 * at a US site, US federal law. A site Census does not know maps by country where it can.
 */
export function jurisdictionsOf(e: Pick<Employee, 'location' | 'country'>): string[] {
  const site = siteByLocation.get(e.location)
  if (site) return site.country === UNITED_STATES ? ['us', site.jurisdiction] : [site.jurisdiction]
  const byCountry = COUNTRY_JURISDICTION[e.country]
  return byCountry ? [byCountry] : []
}

const COUNTRY_JURISDICTION: Record<string, string> = {
  'United States': 'us',
  Canada: 'ca',
  Germany: 'de',
  Israel: 'il',
  India: 'in',
  Taiwan: 'tw',
  China: 'cn',
  Vietnam: 'vn',
}

export function buildBase(ctx: Pick<AnalyticsContext, 'asOf' | 'data' | 'org' | 'metrics'>): ComplianceBase {
  const asOf = ctx.asOf
  const people: Person[] = []
  const notInRoster: RightToWork[] = []
  const byEmployee = new Map<string, RightToWork>()
  for (const r of ctx.data.rightToWork) {
    byEmployee.set(r.employeeId, r)
    const e = ctx.org.byId.get(r.employeeId)
    if (e) people.push({ r, e })
    else notInRoster.push(r)
  }
  const rows = ctx.data.rightToWork
  const any = (pred: (r: RightToWork) => boolean) => rows.some(pred)
  return {
    asOf,
    settings: readSettings(ctx.metrics),
    people,
    active: people.filter((p) => isActiveAt(p.e, asOf)),
    upcoming: people.filter((p) => p.e.hireDate > asOf && !p.e.terminationDate),
    notInRoster,
    byEmployee,
    has: {
      rightToWork: rows.length > 0,
      expiry: any((r) => !!r.expiryDate),
      reverification: any((r) => !!r.reverificationStartedDate),
      authorizationType: any((r) => !!r.authorizationType),
      i9Section1: any((r) => !!r.i9Section1Date),
      i9Section2: any((r) => !!r.i9Section2Date),
      exportLicense: any((r) => r.exportLicenseRequired != null || !!r.exportLicenseStatus),
    },
  }
}

/** k ÷ n, or null when n is under the anonymity minimum (or zero). */
export const rateOf = (k: number, n: number, min: number): number | null => (n > 0 && n >= min ? k / n : null)

/** Group rows by a key, keeping first-seen order. */
export function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = m.get(k)
    if (list) list.push(r)
    else m.set(k, [r])
  }
  return m
}

/** The key with the most rows, ties broken by name; null when empty. */
export function topGroup<T>(rows: readonly T[], key: (r: T) => string): { key: string; rows: T[] } | null {
  let best: { key: string; rows: T[] } | null = null
  for (const [k, list] of groupBy(rows, key)) {
    if (!best || list.length > best.rows.length || (list.length === best.rows.length && k < best.key))
      best = { key: k, rows: list }
  }
  return best
}
