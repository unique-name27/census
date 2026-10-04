import { describe, expect, it } from 'vitest'
import { SITES } from '@/data/schema'
import { ATLAS_JURISDICTIONS, type CalendarEntry, STATUTORY_CALENDAR } from '../reference/calendar'
import { computeDeadlines, nextOccurrence } from './deadlines'
import { emp } from './testkit'

const entry = (p: Partial<CalendarEntry>): CalendarEntry => ({
  jurisdiction: 'us',
  month: 10,
  title: 'T',
  detail: 'D',
  recurrence: 'annual',
  ...p,
})
const FROM = '2026-09-30'
const UNTIL = '2026-11-29'

describe('next occurrence in the look-ahead', () => {
  it('places an entry with a day on that day, and one without across its month', () => {
    expect(nextOccurrence(entry({ day: 31 }), FROM, UNTIL)).toEqual({
      start: '2026-10-31',
      end: '2026-10-31',
    })
    expect(nextOccurrence(entry({ month: 11 }), FROM, UNTIL)).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    })
  })

  it('starts after the as-of date', () => {
    expect(nextOccurrence(entry({ month: 9, day: 30 }), FROM, UNTIL)).toBeNull()
    expect(nextOccurrence(entry({ month: 9 }), FROM, UNTIL)).toBeNull()
    expect(nextOccurrence(entry({ month: 12, day: 1 }), FROM, UNTIL)).toBeNull()
  })

  it('repeats monthly and quarterly entries', () => {
    expect(nextOccurrence(entry({ month: 1, recurrence: 'monthly' }), FROM, UNTIL)?.start).toBe('2026-10-01')
    expect(nextOccurrence(entry({ month: 1, recurrence: 'quarterly' }), FROM, UNTIL)?.start).toBe(
      '2026-10-01',
    )
    expect(nextOccurrence(entry({ month: 3, recurrence: 'quarterly' }), FROM, UNTIL)).toBeNull()
  })

  it('keeps one-off and odd-year entries to their years', () => {
    expect(nextOccurrence(entry({ years: [2027] }), FROM, UNTIL)).toBeNull()
    expect(nextOccurrence(entry({ years: [2026] }), FROM, UNTIL)?.start).toBe('2026-10-01')
    expect(nextOccurrence(entry({ oddYears: true }), FROM, UNTIL)).toBeNull()
    expect(nextOccurrence(entry({ oddYears: true }), '2027-09-30', '2027-11-29')?.start).toBe('2027-10-01')
  })

  it('clamps a day past the end of a short month and crosses the year end', () => {
    expect(nextOccurrence(entry({ month: 11, day: 31 }), FROM, '2026-12-31')?.start).toBe('2026-11-30')
    expect(nextOccurrence(entry({ month: 1, day: 31 }), '2026-12-15', '2027-02-13')?.start).toBe('2027-01-31')
  })
})

describe('deadlines for the jurisdictions with people', () => {
  const sj = emp({ location: 'San Jose' })
  const mu = emp({ location: 'Munich', country: 'Germany' })
  const left = emp({ location: 'Bengaluru', country: 'India', terminationDate: '2026-01-31' })
  const m = computeDeadlines({ asOf: FROM, employees: [sj, mu, left] }, 60)

  it('covers each active person’s site jurisdiction, plus US federal at US sites', () => {
    expect(m.jurisdictions.map((j) => [j.jurisdiction.id, j.people.length])).toEqual([
      ['us', 1],
      ['us-ca', 1],
      ['de', 1],
    ])
  })

  it('lists entries in the next 60 days only for those jurisdictions, soonest first', () => {
    expect(m.until).toBe('2026-11-29')
    expect(m.upcoming.length).toBeGreaterThan(0)
    expect(new Set(m.upcoming.map((d) => d.jurisdiction.id))).toEqual(new Set(['us', 'us-ca', 'de']))
    for (const d of m.upcoming) {
      expect(d.end > FROM, d.entry.title).toBe(true)
      expect(d.start <= m.until, d.entry.title).toBe(true)
    }
    const starts = m.upcoming.map((d) => d.start)
    expect(starts).toEqual([...starts].sort())
    // The Medicare Part D notice is due 15 Oct under US federal law.
    expect(m.upcoming.find((d) => d.entry.title.startsWith('H-1B cap start date'))?.when).toBe('15 Oct 2026')
  })

  it('says when an entry falls and how it recurs', () => {
    const monthly = m.upcoming.find((d) => d.entry.recurrence === 'monthly')
    expect(monthly?.when).toBe('Every month (next Oct 2026)')
    expect(monthly?.recurrence).toBe('Every month')
    const inMonth = m.upcoming.find((d) => !d.entry.day && d.entry.recurrence === 'annual')
    expect(inMonth?.when).toMatch(/^During (Oct|Nov) 2026$/)
  })

  it('shows nothing when nobody is active', () => {
    const none = computeDeadlines({ asOf: FROM, employees: [left] }, 60)
    expect(none.jurisdictions).toEqual([])
    expect(none.upcoming).toEqual([])
  })
})

describe('the bundled Atlas calendar', () => {
  const ids = new Set(ATLAS_JURISDICTIONS.map((j) => j.id))

  it('covers US federal law and every site jurisdiction', () => {
    expect(ids.has('us')).toBe(true)
    for (const s of SITES) expect(ids.has(s.jurisdiction), s.location).toBe(true)
  })

  it('holds well-formed entries, each in a known jurisdiction', () => {
    expect(STATUTORY_CALENDAR.length).toBeGreaterThan(100)
    for (const e of STATUTORY_CALENDAR) {
      expect(ids.has(e.jurisdiction), e.title).toBe(true)
      expect(e.month >= 1 && e.month <= 12, e.title).toBe(true)
      if (e.day != null) expect(e.day >= 1 && e.day <= 31, e.title).toBe(true)
      expect(['annual', 'quarterly', 'monthly']).toContain(e.recurrence)
      expect(e.title.trim().length, e.title).toBeGreaterThan(0)
      expect(e.detail.trim().length, e.title).toBeGreaterThan(0)
    }
    for (const j of ATLAS_JURISDICTIONS)
      expect(
        STATUTORY_CALENDAR.some((e) => e.jurisdiction === j.id),
        j.id,
      ).toBe(true)
  })

  it('cites sources for every jurisdiction, with web links and a verification month', () => {
    for (const j of ATLAS_JURISDICTIONS) {
      expect(j.sources.length, j.id).toBeGreaterThan(0)
      expect(j.lastVerified, j.id).toMatch(/^\d{4}-\d{2}$/)
      expect(j.file, j.id).toBe(`data/country-${j.id}.json`)
      for (const s of j.sources) expect(s.url, s.title).toMatch(/^https?:\/\//)
    }
  })

  it('follows the copy rules: no em dash inside a sentence', () => {
    const texts = [
      ...STATUTORY_CALENDAR.flatMap((e) => [e.title, e.detail]),
      ...ATLAS_JURISDICTIONS.flatMap((j) => [j.name, j.shortName, ...j.sources.map((s) => s.title)]),
    ]
    for (const t of texts) expect(t, t).not.toMatch(/—/)
  })
})
