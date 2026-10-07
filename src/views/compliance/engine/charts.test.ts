/**
 * The Compliance charts (engine/charts.ts): each recounts from the raw right to work rows and the
 * roster, each mark opens exactly the people it counts, small groups are hidden, and a site's
 * licensed roles filter to the site.
 */
import { describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { siteByLocation } from '@/data/schema'
import { isActiveAt } from '@/data/scope'
import { resolveDrill } from '@/drill/Drill'
import { expectFilterTo } from '@/drill/testing'
import { addDays, businessDaysBetween } from '@/lib/dates'
import { STATUTORY_CALENDAR } from '../reference/calendar'
import { deadlineDrill, licenseSiteCells } from '../ui/drill'
import { compute } from '.'
import { buildBase } from './base'
import { calendarByMonth, i9DayBins, LICENSE_SERIES, licensesBySite, runway } from './charts'
import { expiryDrill, i9Drill, licenseDrill } from './drills'
import { computeI9 } from './i9'
import { USES } from './lineage'
import { emp, fixtureContext, rtw, sampleContext } from './testkit'
import { STATUS_ORDER } from './work'

describe('reverification runway', () => {
  it('puts one dot per listed person, ended ones below zero, grouped in action order', () => {
    const A = emp({ name: 'A' })
    const B = emp({ name: 'B' })
    const C = emp({ name: 'C' })
    const D = emp({ name: 'D' })
    const ctx = fixtureContext({
      employees: [A, B, C, D],
      rightToWork: [
        rtw(A, { expiryDate: '2026-09-15' }),
        rtw(B, { expiryDate: '2026-11-15' }),
        rtw(C, { expiryDate: '2027-02-01', reverificationStartedDate: '2026-09-01' }),
        rtw(D, { expiryDate: '2028-01-01' }),
      ],
    })
    const { dots, groups } = runway(compute(ctx).work)
    expect(dots.map((d) => [d.name, d.daysToExpiry, d.status])).toEqual([
      ['A', -15, 'Expired'],
      ['B', 46, 'Not started'],
      ['C', 124, 'On time'],
    ])
    expect(groups.map((g) => [g.status, g.people])).toEqual([
      ['Expired', 1],
      ['Not started', 1],
      ['On time', 1],
    ])
  })

  it('recounts the sample from the raw rows, and a dot opens that one person', () => {
    const ctx = sampleContext()
    const m = compute(ctx)
    const { dots, groups } = runway(m.work)
    const cfg = m.settings
    const end = addDays(ctx.asOf, cfg.horizonDays)
    const byId = new Map(ctx.data.employees.map((e) => [e.employeeId, e]))
    const raw = ctx.data.rightToWork.filter((r) => {
      const e = byId.get(r.employeeId)
      if (!e || !isActiveAt(e, ctx.asOf) || !r.expiryDate) return false
      const ended = r.expiryDate < ctx.asOf && !r.reverificationStartedDate
      return ended || (r.expiryDate > ctx.asOf && r.expiryDate <= end)
    })
    expect(dots.length).toBe(raw.length)
    expect(dots.length).toBeGreaterThan(5)
    expect(groups.reduce((a, g) => a + g.people, 0)).toBe(dots.length)
    expect(groups.map((g) => g.status)).toEqual(
      STATUS_ORDER.filter((s) => groups.some((g) => g.status === s)),
    )
    for (const d of dots.slice(0, 5)) {
      const spec = expiryDrill(m.scope, [d.x], { title: d.name, uses: USES.reverification })
      expect(spec.rows).toEqual([d.x.r])
      // No authorization type while immigration details are off.
      expect(spec.hide).toContain('authorizationType')
    }
  })
})

describe('business days to I-9 Section 2', () => {
  // Mon 7 Sep 2026 starts: Section 2 on day 0, 1, 2, 3, 5 and 12 business days.
  const starts = [0, 1, 2, 3, 5, 12].map((n, i) => {
    const e = emp({ name: `S${i}`, hireDate: '2026-09-07' })
    const section2 = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-14', '2026-09-23'][i]
    return { e, n, r: rtw(e, { i9Section2Date: section2 }) }
  })
  const late = emp({ name: 'Late', hireDate: '2026-09-07' })
  const ctx = fixtureContext({
    employees: [...starts.map((x) => x.e), late],
    rightToWork: [...starts.map((x) => x.r), rtw(late)],
  })
  const judged = computeI9(buildBase(ctx), ctx.window, ctx.prior).current.judged

  it('bins the starts with Section 2 done by business days, the rest counted apart', () => {
    const { bins, done, missing, shown } = i9DayBins(judged, 3, 5)
    expect(shown).toBe(true)
    expect(done).toBe(6)
    expect(missing).toBe(1)
    expect(bins.map((b) => b.bin)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'])
    expect(bins.map((b) => b.starts)).toEqual([1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 1])
    expect(bins.filter((b) => b.late).map((b) => b.bin)[0]).toBe('4')
  })

  it('hides every bin under the anonymity minimum', () => {
    const { bins, shown } = i9DayBins(judged.slice(0, 4), 3, 5)
    expect(shown).toBe(false)
    expect(bins.every((b) => b.starts === null && !b.rows.length)).toBe(true)
  })

  it('recounts the sample, and each bin opens exactly its starts', () => {
    const sctx = sampleContext()
    const m = compute(sctx)
    const { bins, done } = i9DayBins(m.i9.current.judged, m.settings.i9Days, m.settings.minGroup)
    const byId = new Map(sctx.data.employees.map((e) => [e.employeeId, e]))
    const days = sctx.data.rightToWork.flatMap((r) => {
      const e = byId.get(r.employeeId)
      if (e?.employmentType !== 'Employee') return []
      if (siteByLocation.get(e.location)?.country !== 'United States') return []
      if (e.hireDate < sctx.window.start || e.hireDate > sctx.asOf || !r.i9Section2Date) return []
      return [businessDaysBetween(e.hireDate, r.i9Section2Date)]
    })
    expect(done).toBe(days.length)
    for (const b of bins) {
      const n = days.filter((d) => (b.bin === '10+' ? d >= 10 : d === b.from)).length
      expect(b.starts, b.bin).toBe(n)
      if (n) expect(i9Drill(m.scope, b.rows, { title: b.bin, uses: USES.i9 }).rows).toHaveLength(n)
    }
  })
})

describe('licensed roles by site and status', () => {
  const ctx = sampleContext()
  const rowsOf = (c: AnalyticsContext) => licensesBySite(compute(c).exportControl.required)

  it('recounts the sample from the raw rows, by site and status', () => {
    const rows = rowsOf(ctx)
    const byId = new Map(ctx.data.employees.map((e) => [e.employeeId, e]))
    const raw = ctx.data.rightToWork.filter((r) => {
      const e = byId.get(r.employeeId)
      if (!e || r.exportLicenseRequired !== true) return false
      return isActiveAt(e, ctx.asOf) || (e.hireDate > ctx.asOf && !e.terminationDate)
    })
    expect(rows.reduce((a, r) => a + r.people, 0)).toBe(raw.length)
    expect(raw.length).toBeGreaterThan(5)
    for (const r of rows) {
      const n = raw.filter((x) => byId.get(x.employeeId)?.location === r.location).length
      expect(r.siteRows.length, r.location).toBe(n)
      expect(LICENSE_SERIES).toContain(r.status)
      const spec = licenseDrill(compute(ctx).scope, r.rows, { title: r.status, uses: USES.exportLicense })
      expect(spec.rows).toHaveLength(r.people)
    }
  })

  it('filters a site bar to the site, keeping its count, and a segment keeps its own', () => {
    const bars = (c: AnalyticsContext) => {
      const out = new Map<string, ReturnType<typeof rowsOf>[number]>()
      for (const r of rowsOf(c)) if (!out.has(r.location)) out.set(r.location, r)
      return [...out.values()]
    }
    const cells = (c: AnalyticsContext) => licenseSiteCells(compute(c).scope, USES.exportLicense)
    expectFilterTo(ctx, {
      name: 'licensed roles by site',
      rows: bars,
      key: (r) => r.location,
      value: (r) => r.siteRows.length,
      drill: (r, c) => cells(c).site(r),
    })
    expectFilterTo(ctx, {
      name: 'licensed roles by site and status',
      rows: rowsOf,
      key: (r) => `${r.location} · ${r.status}`,
      value: (r) => r.people,
      drill: (r, c) => cells(c).segment(r),
      kind: 'rate',
    })
    const [first] = rowsOf(ctx)
    expect(resolveDrill(cells(ctx).segment(first))?.rows).toHaveLength(first.people)
    expect(resolveDrill(cells(ctx).site(first))?.filter?.location).toEqual([first.location])
  }, 60_000)
})

describe('statutory calendar by jurisdiction and month', () => {
  /** The months (1-12) an entry falls in, recounted from the calendar's own fields. */
  const inMonth = (e: (typeof STATUTORY_CALENDAR)[number], year: number, month: number) => {
    if (e.years && !e.years.includes(year)) return false
    if (e.oddYears && year % 2 === 0) return false
    if (e.recurrence === 'monthly') return true
    if (e.recurrence === 'quarterly') return (month - e.month + 12) % 3 === 0
    return month === e.month
  }

  it('counts each jurisdiction in scope’s entries in each of the next 12 months', () => {
    const ctx = sampleContext()
    const m = compute(ctx)
    const { months, cells } = calendarByMonth(m.deadlines, ctx.asOf)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-10')
    const ids = m.deadlines.jurisdictions.map((j) => j.jurisdiction.id)
    expect([...new Set(cells.map((c) => c.jurisdictionId))]).toEqual(ids)
    expect(cells).toHaveLength(ids.length * 12)
    for (const c of cells) {
      const y = +c.month.slice(0, 4)
      const mo = +c.month.slice(5, 7)
      const n = STATUTORY_CALENDAR.filter(
        (e) => e.jurisdiction === c.jurisdictionId && inMonth(e, y, mo),
      ).length
      expect(c.entries, `${c.jurisdictionId} ${c.month}`).toBe(n)
      expect(c.items).toHaveLength(c.entries)
      for (const x of c.items) expect(x.start.slice(0, 7)).toBe(c.month)
    }
    expect(cells.some((c) => c.entries > 2)).toBe(true)
  })

  it('opens the employees each entry covers, filtered to the jurisdiction’s sites', () => {
    const ctx = sampleContext()
    const m = compute(ctx)
    const { cells } = calendarByMonth(m.deadlines, ctx.asOf)
    const item = cells.find((c) => c.jurisdictionId === 'us-ca' && c.entries)?.items[0]
    expect(item).toBeTruthy()
    const spec = resolveDrill(deadlineDrill(m.scope, USES.deadlines)(item!))
    expect(spec?.rows).toHaveLength(item!.people.length)
    expect(spec?.filter?.location).toEqual(['San Jose'])
  })

  it('lists no jurisdiction where nobody in scope works', () => {
    const ctx = fixtureContext({ employees: [], rightToWork: [] })
    expect(calendarByMonth(compute(ctx).deadlines, ctx.asOf).cells).toEqual([])
  })
})
