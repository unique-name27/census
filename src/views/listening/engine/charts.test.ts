/**
 * The Listening charts (engine/charts.ts): each recounts from the answers and the roster, each
 * mark opens grouped counts that add up to the number clicked (never one person's answers), and
 * small groups are hidden.
 */
import { describe, expect, it } from 'vitest'
import {
  driverTrend,
  EXIT_SURVEY,
  exitReasonsVsRecord,
  foldedReason,
  HR_RECORD,
  rateBars,
  surveyKeysOf,
  TREND_DRIVERS,
} from './charts'
import { itemRowsOf, rowsBy } from './drills'
import { compute } from './index'
import { invitedDrill, invitedOf } from './measures'
import { prepare } from './prepare'
import { answer, answers, emp, fixtureContext, sampleContext } from './testkit'

describe('response rate by program', () => {
  it('shows the programs whose invited population is known, each rate recounted', () => {
    const ctx = sampleContext()
    const m = compute(ctx)
    const bars = rateBars(m.programs)
    expect(bars.length).toBeGreaterThan(3)
    expect(bars.every((r) => r.rateKnown)).toBe(true)
    for (const r of bars) {
      expect(r.invited, r.survey).toBe(invitedOf(ctx, r.survey, ctx.window)?.size)
      // The bar's invited count is exactly the records its drill opens (one row per person).
      expect(invitedDrill(ctx, r.survey, ctx.window)?.rows.length, r.survey).toBe(r.invited)
      if (r.rate == null) continue
      expect(r.responded).not.toBeNull()
      expect(r.rate).toBeCloseTo((r.responded as number) / r.invited, 10)
      expect(r.invited).toBeGreaterThanOrEqual(m.settings.minOf[r.survey])
    }
  })
})

describe('driver scores by wave', () => {
  const wave = (w: string, date: string, scores: number[], driver = 'Speed', prefix = w) =>
    answers(scores.length, scores, {
      wave: w,
      responseDate: date,
      driver,
      item: `HM_${driver}`,
      keyPrefix: prefix,
    })

  it('gives each driver a mean per wave, with a gap under the minimum', () => {
    const rows = [
      ...wave('2026 Q1', '2026-02-10', [4, 4, 4, 4, 4]),
      ...wave('2026 Q2', '2026-05-10', [3, 3, 3, 3, 3]),
      ...wave('2026 Q3', '2026-08-10', [2, 2, 2, 2, 2]),
      ...wave('2026 Q1', '2026-02-10', [4, 4, 4, 4, 4], 'Slate', 'S1'),
      ...wave('2026 Q2', '2026-05-10', [4, 4], 'Slate', 'S2'),
      ...wave('2026 Q3', '2026-08-10', [4, 4, 4, 4, 4], 'Slate', 'S3'),
    ]
    const ctx = fixtureContext({ surveyResponses: rows, employees: [emp()] })
    const m = compute(ctx)
    const sm = m.surveys.get('Hiring manager satisfaction')
    if (!sm) throw new Error('no survey model')
    const t = driverTrend(m.prepared, sm)
    expect(t.waves.map((w) => w.wave)).toEqual(['2026 Q1', '2026 Q2', '2026 Q3'])
    const v = (driver: string) => t.points.filter((p) => p.driver === driver).map((p) => p.value)
    expect(v('Speed')).toEqual([4, 3, 2])
    expect(v('Slate')).toEqual([4, null, 4])
    // Speed fell by 2; Slate did not move.
    expect(t.emphasis).toBe('Speed')
  })

  it('recounts the sample from the prepared answers, and a point opens its items adding up', () => {
    const ctx = sampleContext()
    const m = compute(ctx)
    const p = prepare(ctx)
    let checked = 0
    for (const sm of m.surveys.values()) {
      const t = driverTrend(m.prepared, sm)
      expect(t.waves.length).toBeLessThanOrEqual(4)
      expect(t.drivers.length).toBeLessThanOrEqual(TREND_DRIVERS)
      for (const pt of t.points) {
        const rows = (p.bySurvey.get(sm.survey) ?? []).filter(
          (r) => r.wave === pt.wave && r.scale === '1-5' && (r.driver ?? r.item) === pt.driver,
        )
        const who = new Set(rows.map((r) => r.respondentKey)).size
        expect(pt.respondents).toBe(who)
        if (who < sm.min) expect(pt.value).toBeNull()
        else expect(pt.value).toBeCloseTo(rows.reduce((a, r) => a + r.score, 0) / rows.length, 10)
        const items = itemRowsOf(pt.rows, sm.survey, pt.wave, pt.driver, sm.min)
        expect(items.reduce((a, r) => a + r.responses, 0)).toBe(rows.length)
        // Grouped rows only: no respondent key or date reaches the drill.
        for (const r of items) expect(Object.keys(r)).not.toContain('respondentKey')
        checked++
      }
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('has no trend for a survey about managers in a narrowed scope', () => {
    const ctx = sampleContext({ filters: { location: ['Austin'] } })
    const m = compute(ctx)
    const sm = m.surveys.get('Manager feedback')
    if (sm && !sm.compare) expect(driverTrend(m.prepared, sm).points).toEqual([])
  })
})

describe('exit reasons: survey and HR record', () => {
  it('counts each side apart, once per person, and hides a side under the minimum', () => {
    const leavers = Array.from({ length: 6 }, (_, i) =>
      emp({
        terminationDate: '2026-06-30',
        terminationType: 'Voluntary',
        terminationReason: i < 4 ? 'Career growth or promotion' : 'Base salary',
      }),
    )
    const survey = [
      ...answers(3, [4], { survey: 'Exit survey', wave: '2026 Q2', reason: 'Base salary', keyPrefix: 'X' }),
      // The same person twice: counted once, with their first reason.
      answer({ survey: 'Exit survey', wave: '2026 Q2', respondentKey: 'X1', reason: 'My manager' }),
    ]
    const ctx = fixtureContext({ employees: leavers, surveyResponses: survey })
    const x = exitReasonsVsRecord(ctx, survey, 5)
    expect(x.record).toEqual({ people: 6, hidden: false })
    expect(x.survey).toEqual({ people: 3, hidden: true })
    const record = x.rows.filter((r) => r.source === HR_RECORD)
    expect(record.map((r) => [r.reason, r.count])).toEqual([
      ['Career growth or promotion', 4],
      ['Base salary', 2],
    ])
    expect(x.rows.filter((r) => r.source === EXIT_SURVEY).every((r) => r.count === null)).toBe(true)
    const open = exitReasonsVsRecord(ctx, survey, 3)
    expect(open.rows.find((r) => r.source === EXIT_SURVEY && r.reason === 'Base salary')?.count).toBe(3)
  })

  it('never shows a survey reason under the minimum beside the named leavers with that reason', () => {
    // One respondent says Recognition and one leaver has Recognition in the HR record: showing
    // both, with the record bar opening that leaver, would say how they answered the survey.
    const leavers = [
      ...Array.from({ length: 5 }, () =>
        emp({
          terminationDate: '2026-06-30',
          terminationType: 'Voluntary',
          terminationReason: 'Base salary',
        }),
      ),
      emp({ terminationDate: '2026-06-30', terminationType: 'Voluntary', terminationReason: 'Recognition' }),
    ]
    const survey = [
      ...answers(6, [4], { survey: 'Exit survey', wave: '2026 Q2', reason: 'Base salary', keyPrefix: 'B' }),
      ...answers(1, [4], { survey: 'Exit survey', wave: '2026 Q2', reason: 'Recognition', keyPrefix: 'R' }),
    ]
    const ctx = fixtureContext({ employees: leavers, surveyResponses: survey })
    const x = exitReasonsVsRecord(ctx, survey, 5)
    const row = (source: string, reason: string) =>
      x.rows.find((r) => r.source === source && r.reason === reason)
    // Recognition (1) folds; alone it would be 1 again (7 - 6), so the next smallest reason joins.
    expect(x.folded).toEqual(['Base salary', 'Recognition'])
    expect(x.foldedLabel).toBe(foldedReason(5))
    expect(row(EXIT_SURVEY, 'Recognition')?.count).toBeNull()
    expect(row(EXIT_SURVEY, 'Base salary')?.count).toBeNull()
    expect(row(EXIT_SURVEY, foldedReason(5))).toMatchObject({ count: 7, opens: true })
    // No survey count under the minimum is shown at all.
    for (const r of x.rows.filter((r) => r.source === EXIT_SURVEY))
      expect(r.count == null || r.count === 0 || r.count >= 5).toBe(true)
    // The HR record keeps its counts, but Recognition opens no names; Base salary (6 in the
    // survey) still does.
    expect(row(HR_RECORD, 'Recognition')).toMatchObject({ count: 1, opens: false })
    expect(row(HR_RECORD, 'Base salary')).toMatchObject({ count: 5, opens: true })
    expect(surveyKeysOf(x, foldedReason(5)).size).toBe(7)
  })

  it('folds only the small survey reasons when they add up to the minimum', () => {
    const leavers = Array.from({ length: 6 }, (_, i) =>
      emp({
        terminationDate: '2026-06-30',
        terminationType: 'Voluntary',
        terminationReason: i < 3 ? 'Recognition' : 'My manager',
      }),
    )
    const survey = [
      ...answers(6, [4], { survey: 'Exit survey', wave: '2026 Q2', reason: 'Base salary', keyPrefix: 'B' }),
      ...answers(3, [4], { survey: 'Exit survey', wave: '2026 Q2', reason: 'Recognition', keyPrefix: 'R' }),
      ...answers(2, [4], { survey: 'Exit survey', wave: '2026 Q2', reason: 'My manager', keyPrefix: 'M' }),
    ]
    const ctx = fixtureContext({ employees: leavers, surveyResponses: survey })
    const x = exitReasonsVsRecord(ctx, survey, 5)
    expect(x.folded).toEqual(['My manager', 'Recognition'])
    const surveyRows = x.rows.filter((r) => r.source === EXIT_SURVEY)
    expect(surveyRows.map((r) => [r.reason, r.count])).toEqual([
      ['Base salary', 6],
      ['My manager', null],
      ['Recognition', null],
      [foldedReason(5), 5],
    ])
    expect(surveyRows.reduce((a, r) => a + (r.share ?? 0), 0)).toBeCloseTo(1, 10)
    // Both record reasons are under the minimum in the survey: counted, never listed.
    for (const r of x.rows.filter((r) => r.source === HR_RECORD && r.count)) expect(r.opens).toBe(false)
  })

  it('recounts the sample from the raw rows, and each bar opens exactly its people', () => {
    const ctx = sampleContext()
    const m = compute(ctx)
    const sm = m.surveys.get('Exit survey')
    if (!sm) throw new Error('no exit survey')
    const x = exitReasonsVsRecord(ctx, sm.period, sm.min)
    expect(x.survey.hidden || x.record.hidden).toBe(false)
    const raw = ctx.data.employees.filter(
      (e) =>
        e.employmentType === 'Employee' &&
        e.terminationType === 'Voluntary' &&
        !!e.terminationDate &&
        e.terminationDate >= ctx.window.start &&
        e.terminationDate <= ctx.window.end &&
        !!e.terminationReason,
    )
    expect(x.record.people).toBe(raw.length)
    for (const source of [EXIT_SURVEY, HR_RECORD]) {
      const side = x.rows.filter((r) => r.source === source)
      expect(side.reduce((a, r) => a + (r.share ?? 0), 0)).toBeCloseTo(1, 10)
    }
    for (const r of x.rows) {
      if (!r.count) continue
      if (r.source === HR_RECORD) {
        expect(raw.filter((e) => e.terminationReason === r.reason)).toHaveLength(r.count)
        continue
      }
      expect(r.count).toBeGreaterThanOrEqual(sm.min)
      const who = surveyKeysOf(x, r.reason)
      const grouped = rowsBy(
        sm.period.filter((a) => who.has(a.respondentKey)),
        () => r.reason,
        { survey: sm.survey, wave: null, groupBy: 'Exit reason', min: sm.min },
      )
      expect(grouped.reduce((a, g) => a + g.respondents, 0)).toBe(r.count)
    }
    // The planted story: Bengaluru says base salary in the survey; the record says otherwise.
    const pay = x.rows.find((r) => r.source === EXIT_SURVEY && r.reason === 'Base salary')
    const payRecord = x.rows.find((r) => r.source === HR_RECORD && r.reason === 'Base salary')
    expect((pay?.share ?? 0) > (payRecord?.share ?? 0)).toBe(true)
  })
})
