/**
 * Right to work and export control, one row per employee and intern who is active, starting
 * soon (pre-hires) or left in the last 12 months (Form I-9 records are kept after an exit). No
 * nationality or citizenship exists here: authorization is one of the broad categories in
 * `AUTHORIZATION_TYPES`, and citizens and permanent residents are both "Permanent (no expiry)".
 *
 * Time-limited authorization is common in US engineering (employer-sponsored visas, student and
 * dependent work authorization), in Munich (work permits under the Blue Card) and in Canada, and
 * rare elsewhere. Form I-9 dates exist for US sites only; for people covered by the onboarding
 * checklist they are the dates of its I-9 tasks. Export-control licenses are flagged for a few
 * engineering roles in the US by trade compliance.
 *
 * Planted (README, Compliance):
 *  - 12 authorizations expire in the next 90 days; reverification has not started for 3 of them
 *    and started less than 90 days ahead for 2 more;
 *  - one engineer started in August 2026 while the export license was still pending, and two
 *    pre-hires starting in October are waiting for theirs;
 *  - Form I-9 Section 2 was completed within three business days for 96% of US starts in the last
 *    12 months (the five late ones are the onboarding checklist's).
 */
import { addBusinessDays, addDays } from '@/lib/dates'
import {
  type AuthorizationType,
  type Employee,
  type OnboardingTask,
  type RightToWork,
  siteByLocation,
} from '../schema'
import { AS_OF, iso } from './calendar'
import type { ExportPlants } from './onboarding'
import type { Rng } from './prng'

/** Planted expiries: in the next 90 days, and in the 90 days after that. */
export const EXPIRING_90 = 12
export const EXPIRING_180 = 14
/** Of the 12 expiring in 90 days: reverification not started, and started late (under 90 days ahead). */
export const REVERIFICATION_NOT_STARTED = 3
export const REVERIFICATION_LATE = 2

const T12_FROM = '2025-10-01'
const ENGINEERING_UNITS = new Set(['Silicon Engineering', 'Systems & Software'])

const isUs = (site: string) => siteByLocation.get(site)?.country === 'United States'

/** Who started with a pending export license, and which pre-hires wait for one (by employee ID). */
export function exportPlantsOf(employees: readonly Employee[]): ExportPlants {
  const asOf = iso(AS_OF)
  const eng = (e: Employee) =>
    e.employmentType === 'Employee' && isUs(e.location) && ENGINEERING_UNITS.has(e.businessUnit)
  const started = employees.find(
    (e) =>
      eng(e) &&
      !e.terminationDate &&
      e.hireDate >= '2026-08-01' &&
      e.hireDate <= '2026-08-31' &&
      e.level !== 'L1',
  )
  const upcoming = employees
    .filter((e) => eng(e) && e.hireDate > asOf && e.hireDate >= '2026-10-12')
    .slice(0, 2)
  return { startedPending: started?.employeeId ?? null, upcomingPending: upcoming.map((e) => e.employeeId) }
}

/** A time-limited category for a person, or null for permanent authorization. */
function timeLimited(e: Employee, rng: Rng): AuthorizationType | null {
  const site = e.location
  const eng = ENGINEERING_UNITS.has(e.businessUnit)
  if (e.employmentType === 'Intern')
    return isUs(site) && rng.chance(0.3) ? 'Student work authorization' : null
  if (isUs(site)) {
    const junior = e.level === 'L1' || e.level === 'L2' || e.level === 'L3'
    return rng.pickPair<AuthorizationType | null>([
      ['Employer-sponsored visa', eng ? 12 : 3],
      ['Student work authorization', eng && junior ? 4 : 0.5],
      ['Employment authorization document', 1.5],
      ['Dependent work authorization', 1],
      ['Intra-company transfer', eng ? 0.8 : 0.2],
      [null, eng ? 80 : 94],
    ])
  }
  switch (site) {
    case 'Munich':
      return rng.chance(0.22) ? 'Work permit' : null
    case 'Toronto':
    case 'Vancouver':
      return rng.chance(0.09) ? 'Work permit' : null
    case 'Haifa':
    case 'Hsinchu':
    case 'Shanghai':
    case 'Ho Chi Minh City':
      return rng.chance(0.03) ? (rng.chance(0.3) ? 'Intra-company transfer' : 'Work permit') : null
    default:
      return rng.chance(0.004) ? 'Other time-limited' : null
  }
}

export function rightToWorkRows(
  employees: readonly Employee[],
  tasks: readonly OnboardingTask[],
  plants: ExportPlants,
  rng: Rng,
): RightToWork[] {
  const asOf = iso(AS_OF)
  const people = employees.filter(
    (e) =>
      (e.employmentType === 'Employee' || e.employmentType === 'Intern') &&
      (!e.terminationDate || e.terminationDate >= T12_FROM),
  )
  // I-9 dates from the onboarding checklist, where it covers the person.
  const i9 = new Map<string, { s1?: string | null; s2?: string | null }>()
  for (const t of tasks) {
    if (!t.employeeId || (t.task !== 'I-9 Section 1' && t.task !== 'I-9 Section 2')) continue
    const v = i9.get(t.employeeId) ?? {}
    if (t.task === 'I-9 Section 1') v.s1 = t.completedDate ?? null
    else v.s2 = t.completedDate ?? null
    i9.set(t.employeeId, v)
  }

  const rows: RightToWork[] = people.map((e) => {
    const type = timeLimited(e, rng)
    const covered = i9.get(e.employeeId)
    const us = isUs(e.location)
    return {
      employeeId: e.employeeId,
      authorizationType: type ?? 'Permanent (no expiry)',
      // Expiries beyond the next 180 days; the planted ones are set below.
      expiryDate: type
        ? addDays(asOf, rng.int(200, type === 'Student work authorization' ? 700 : 1100))
        : null,
      reverificationStartedDate: null,
      i9Section1Date: !us
        ? null
        : covered
          ? (covered.s1 ?? null)
          : e.hireDate > asOf
            ? null
            : addDays(e.hireDate, -rng.int(0, 7)),
      i9Section2Date: !us
        ? null
        : covered
          ? (covered.s2 ?? null)
          : e.hireDate > asOf
            ? null
            : addBusinessDays(e.hireDate, rng.int(0, 3)),
      exportLicenseRequired: false,
      exportLicenseStatus: 'Not needed',
      exportLicenseExpiry: null,
    }
  })
  const byId = new Map(employees.map((e) => [e.employeeId, e]))

  // Expiries in the next 180 days, for people who are here now.
  const limited = rows.filter((r) => {
    const e = byId.get(r.employeeId)!
    return r.expiryDate && !e.terminationDate && e.hireDate <= asOf && e.employmentType === 'Employee'
  })
  const soon = rng.sample(limited, EXPIRING_90 + EXPIRING_180)
  soon.forEach((r, i) => {
    const in90 = i < EXPIRING_90
    const late =
      in90 && i >= REVERIFICATION_NOT_STARTED && i < REVERIFICATION_NOT_STARTED + REVERIFICATION_LATE
    const expiry = addDays(asOf, late ? rng.int(25, 60) : in90 ? rng.int(8, 88) : rng.int(95, 175))
    r.expiryDate = expiry
    if (in90) {
      if (i < REVERIFICATION_NOT_STARTED) return
      // Started late: under 90 days ahead (and before the as-of date); on time: 95 to 150 days ahead.
      const started = late ? addDays(expiry, -rng.int(26, 50)) : addDays(expiry, -rng.int(95, 150))
      r.reverificationStartedDate = started <= asOf ? started : addDays(asOf, -rng.int(1, 6))
    } else {
      const started = addDays(expiry, -rng.int(95, 130))
      if (started <= asOf) r.reverificationStartedDate = started
    }
  })

  // Export-control licenses: a few US engineering roles, the planted pending ones among them.
  for (const r of rows) {
    const e = byId.get(r.employeeId)!
    const planted = r.employeeId === plants.startedPending || plants.upcomingPending.includes(r.employeeId)
    const eng =
      e.employmentType === 'Employee' &&
      isUs(e.location) &&
      ENGINEERING_UNITS.has(e.businessUnit) &&
      e.level !== 'L1'
    if (planted) {
      r.exportLicenseRequired = true
      r.exportLicenseStatus = 'Pending'
    } else if (eng && !e.terminationDate && e.hireDate <= asOf && rng.chance(0.06)) {
      r.exportLicenseRequired = true
      r.exportLicenseStatus = 'Approved'
      r.exportLicenseExpiry = addDays(asOf, rng.int(150, 1300))
    }
  }
  return rows
}
