/**
 * Form I-9 timeliness for US starts (Atlas ON-02): Section 2 within the allowed business days of
 * the start date (3 by default), Section 1 by the first day.
 *
 * Population: employees (not contractors or interns) at a US site who started in the window, up
 * to the as-of date, and have a right to work row. A start is judged once its Section 2 deadline
 * has passed or Section 2 is done; a missing Section 2 past its deadline is late. Pure.
 */
import { type ISODate, siteByLocation } from '@/data/schema'
import type { Window } from '@/data/scope'
import { addBusinessDays, businessDaysBetween } from '@/lib/dates'
import { type ComplianceBase, isUsPerson, type Person, rateOf } from './base'

export interface I9Row extends Person {
  site: string
  hireDate: ISODate
  /** Section 2 deadline: start + business days. */
  deadline: ISODate
  section1: ISODate | null
  section2: ISODate | null
  /** Business days from the start to Section 2 (null while it is not done). */
  businessDays: number | null
  section1OnTime: boolean | null
  onTime: boolean
  /** Not done and past the deadline. */
  open: boolean
}

export interface I9Rate {
  judged: I9Row[]
  onTime: I9Row[]
  late: I9Row[]
  rate: number | null
}

export interface SiteRow {
  site: string
  judged: number
  onTime: number
  late: number
  rate: number | null
  rows: I9Row[]
}

export interface I9Model {
  current: I9Rate
  prior: I9Rate
  section1: { judged: I9Row[]; onTime: I9Row[]; rate: number | null }
  bySite: SiteRow[]
  /** US employees who started in the period, are still here, and whose Section 2 is past due and not done. */
  open: I9Row[]
}

export function i9Row(p: Person, asOf: ISODate, days: number): I9Row {
  const hireDate = p.e.hireDate
  const deadline = addBusinessDays(hireDate, days)
  const section1 = p.r.i9Section1Date ?? null
  const section2 = p.r.i9Section2Date ?? null
  return {
    ...p,
    site: siteByLocation.has(p.e.location) ? p.e.location : p.e.location || 'Unknown site',
    hireDate,
    deadline,
    section1,
    section2,
    businessDays: section2 ? businessDaysBetween(hireDate, section2) : null,
    section1OnTime: section1 ? section1 <= hireDate : null,
    onTime: !!section2 && section2 <= deadline,
    open: !section2 && deadline < asOf,
  }
}

/** US employees who started in the window (and by the as-of date), judged at the as-of date. */
export function i9Rate(base: ComplianceBase, w: Pick<Window, 'start' | 'end'>): I9Rate {
  const { asOf, settings: s } = base
  const end = w.end < asOf ? w.end : asOf
  const judged = base.people
    .filter(
      (p) =>
        p.e.employmentType === 'Employee' &&
        isUsPerson(p.e) &&
        p.e.hireDate >= w.start &&
        p.e.hireDate <= end,
    )
    .map((p) => i9Row(p, asOf, s.i9Days))
    .filter((x) => !!x.section2 || x.deadline < asOf)
    .sort((a, b) => Number(a.onTime) - Number(b.onTime) || a.hireDate.localeCompare(b.hireDate))
  const onTime = judged.filter((x) => x.onTime)
  return {
    judged,
    onTime,
    late: judged.filter((x) => !x.onTime),
    rate: rateOf(onTime.length, judged.length, s.minGroup),
  }
}

export function computeI9(base: ComplianceBase, window: Window, prior: Window): I9Model {
  const { asOf, settings: s } = base
  const current = i9Rate(base, window)
  const s1 = current.judged
  const s1OnTime = s1.filter((x) => x.section1OnTime === true)
  const sites = new Map<string, I9Row[]>()
  for (const x of current.judged) sites.set(x.site, [...(sites.get(x.site) ?? []), x])
  const bySite: SiteRow[] = [...sites.entries()]
    .map(([site, rows]) => {
      const ok = rows.filter((x) => x.onTime).length
      return {
        site,
        judged: rows.length,
        onTime: ok,
        late: rows.length - ok,
        rate: rateOf(ok, rows.length, s.minGroup),
        rows,
      }
    })
    .sort((a, b) => b.judged - a.judged || a.site.localeCompare(b.site))
  // Section 2 not done and past its deadline, for people still here: a compliance item.
  const open = base.people
    .filter((p) => p.e.employmentType === 'Employee' && isUsPerson(p.e) && !p.e.terminationDate)
    .filter((p) => p.e.hireDate >= window.start && p.e.hireDate <= asOf)
    .map((p) => i9Row(p, asOf, s.i9Days))
    .filter((x) => x.open)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
  return {
    current,
    prior: i9Rate(base, prior),
    section1: { judged: s1, onTime: s1OnTime, rate: rateOf(s1OnTime.length, s1.length, s.minGroup) },
    bySite,
    open,
  }
}
