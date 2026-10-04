import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { computeComp, payAsOfDate } from './model'
import { asOfNote, coverageParts, emptyScope, type NoteInput, note, payNotice } from './notes'
import { DEFAULT_SETTINGS } from './settings'
import { context, dataset, emp, sources, team } from './test-fixtures'

const base: NoteInput = {
  asOf: '2026-09-30',
  payAsOf: '2026-09-30',
  payStale: false,
  pop: { missingComp: 0, noFx: 0 },
}

describe('notes and disclosures', () => {
  it('writes the plain note when coverage is complete', () => {
    expect(note(base, 1450)).toBe('1,450 people · as of 30 Sep 2026')
    expect(note(base, 1)).toBe('1 person · as of 30 Sep 2026')
    expect(note(base, 12, 'proposals')).toBe('12 proposals · as of 30 Sep 2026')
    expect(coverageParts(base)).toEqual([])
  })

  it('discloses missing comp records and pay data from another date', () => {
    const m: NoteInput = {
      asOf: '2025-12-31',
      payAsOf: '2026-09-30',
      payStale: true,
      pop: { missingComp: 114, noFx: 2 },
    }
    expect(note(m, 1240, 'people', true)).toBe(
      '1,240 people · as of 31 Dec 2025 · 2 without an FX rate left out of USD totals · pay data from 30 Sep 2026 · 114 active employees have no comp record',
    )
    expect(asOfNote(m)).toBe(
      'as of 31 Dec 2025 · pay data from 30 Sep 2026 · 114 active employees have no comp record',
    )
    expect(asOfNote(base)).toBe('as of 30 Sep 2026')
    expect(payNotice(m)).toBe(
      'Pay data is a snapshot from 30 Sep 2026 with no history, while people are counted as of 31 Dec 2025. Figures show 30 Sep 2026 pay for the people employed on 31 Dec 2025, and 114 of them have no comp record.',
    )
    expect(
      payNotice({ ...m, asOf: '2027-03-31', payAsOf: '2026-09-30', pop: { missingComp: 0, noFx: 0 } }),
    ).toBe(
      'Pay data was loaded on 30 Sep 2026, while people are counted as of 31 Mar 2027. Pay changes and hires since the upload are not in these figures.',
    )
    expect(payNotice(base)).toBeNull()
  })

  it('dates the pay data from the sample or the upload, and flags a gap over a month', () => {
    const data = dataset({})
    const src = sources(data)
    expect(payAsOfDate({ sources: src })).toBeNull()
    expect(payAsOfDate({ sources: { ...src, comp: { kind: 'sample', rowCount: 1 } } })).toBe('2026-09-30')
    expect(
      payAsOfDate({
        sources: { ...src, comp: { kind: 'upload', rowCount: 1, importedAt: '2026-10-02T08:00:00.000Z' } },
      }),
    ).toBe('2026-10-02')

    const t = team(6, {})
    const d = dataset(t)
    const ctx = (asOfOverride: string, importedAt: string) =>
      buildContext({
        data: d,
        sources: { ...sources(d), comp: { kind: 'upload', rowCount: 6, importedAt } },
        filters: context(d).filters,
        asOfOverride,
        showPay: false,
      })
    expect(computeComp(ctx('2026-09-30', '2026-10-20T00:00:00Z'), DEFAULT_SETTINGS).payStale).toBe(false)
    const stale = computeComp(ctx('2026-06-30', '2026-10-20T00:00:00Z'), DEFAULT_SETTINGS)
    expect(stale.payStale).toBe(true)
    expect(stale.kpis.find((k) => k.id === 'median-compa')!.note).toBe(
      '6 people · as of 30 Jun 2026 · pay data from 20 Oct 2026',
    )
  })

  it('tells an empty filter apart from missing comp data', () => {
    expect(emptyScope({ pop: { missingComp: 0 }, company: { people: [] } }).title).toBe(
      'Upload Compensation to see this',
    )
    const gaps = emptyScope({ pop: { missingComp: 3 }, company: { people: [1] } })
    expect(gaps.title).toBe('No compensation records in this scope')
    expect(gaps.body).toMatch(/^3 active employees have no comp record in this scope\./)
    const none = emptyScope({ pop: { missingComp: 0 }, company: { people: [1] } })
    expect(none).toEqual({
      title: 'No one in this scope',
      body: 'No active employees match these filters. Widen the filters to see compensation.',
      dataRoom: false,
    })
  })

  it('treats a filter that matches nobody as an empty scope, not missing data', () => {
    const sj = team(6, { location: 'San Jose', department: 'Legal' })
    const other = [emp({ location: 'Vancouver', department: 'Software' })]
    const data = dataset({ ...sj, employees: [...sj.employees, ...other] })
    const m = computeComp(
      context(data, { filters: { department: ['Legal'], location: ['Vancouver'] } }),
      DEFAULT_SETTINGS,
    )
    expect(m.pop.people).toHaveLength(0)
    expect(emptyScope(m).title).toBe('No one in this scope')
  })
})
