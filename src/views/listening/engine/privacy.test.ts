/**
 * Privacy in the engine (docs/VIEWS.md, Listening, Privacy): groups under the minimum have no
 * scores, manager cuts need 10 distinct respondents over four quarters, reason counts hide in a
 * small group, and nothing a drill returns carries a respondent key, a date or a single answer.
 */
import { describe, expect, it } from 'vitest'
import type { SurveyResponse } from '@/data/schema'
import { rateHidden } from '@/lib/surveys'
import { surveyHeadline } from '../api'
import { linkedHeadline } from '../linked'
import { declineCut, exitCut, managerCut, stayCut } from './cuts'
import { driverRowsOf, itemRowsOf } from './drills'
import { compute, surveyKpis } from './index'
import { prepare } from './prepare'
import { answer, answers, emp, fixtureContext, sampleContext, sampleData } from './testkit'

describe('the minimum', () => {
  it('drill rows show the count only for a group under the minimum', () => {
    const rows = [
      ...answers(6, [4]),
      ...answers(3, [1], { driver: 'Slate quality', item: 'HM_SLATE', keyPrefix: 'S' }),
    ]
    const out = driverRowsOf(rows, 'Hiring manager satisfaction', '2026 Q3', 5)
    expect(out.find((r) => r.group === 'Speed')).toMatchObject({ respondents: 6, mean: 4, suppressed: false })
    expect(out.find((r) => r.group === 'Slate quality')).toMatchObject({
      respondents: 3,
      mean: null,
      suppressed: true,
    })
    for (const r of [...out, ...itemRowsOf(rows, 'Hiring manager satisfaction', null, 'Speed', 5)]) {
      expect(Object.keys(r).sort()).toEqual(
        [
          'driver',
          'group',
          'groupBy',
          'item',
          'mean',
          'nps',
          'respondents',
          'responses',
          'scale',
          'suppressed',
          'survey',
          'topBox',
          'wave',
        ].sort(),
      )
    }
  })

  it('never writes a finding about a group under the minimum', () => {
    // Four people in Bengaluru all name pay: a clear story, but too few people to show.
    const people = [
      ...Array.from({ length: 4 }, (_, i) => emp({ employeeId: `B${i}`, location: 'Bengaluru' })),
      ...Array.from({ length: 8 }, (_, i) => emp({ employeeId: `S${i}`, location: 'San Jose' })),
    ]
    const rows: SurveyResponse[] = people.map((e) =>
      answer({
        survey: 'Exit survey',
        respondentKey: e.employeeId,
        item: 'EXIT_PAY',
        driver: 'Pay',
        reason:
          e.location === 'Bengaluru'
            ? 'Base salary'
            : (['Career growth or promotion', 'My manager'][+e.employeeId.slice(1) % 2] ?? null),
      }),
    )
    const ctx = fixtureContext({ employees: people, surveyResponses: rows })
    const cut = exitCut(ctx, prepare(ctx), rows, 5, 0.4)
    expect(cut.locations.map((l) => l.location)).toEqual(['San Jose'])
    expect(cut.flag).toBeNull()
    expect(compute(ctx).findings.some((f) => f.id === 'listening-exit-reason')).toBe(false)
  })

  it('hides reason counts when fewer people than the minimum gave a reason', () => {
    const rows = answers(4, [3], { survey: 'Candidate experience', reason: 'Accepted competing offer' })
    expect(declineCut(rows, 5)).toMatchObject({ total: 4, rows: [], suppressed: true })
    const ctx = fixtureContext({ surveyResponses: rows })
    expect(
      stayCut(prepare(ctx), answers(4, [3], { survey: 'Stay interview', reason: 'Pay' }), 5, 0.5),
    ).toMatchObject({
      suppressed: true,
      reasons: [],
      groups: [],
    })
  })
})

describe('manager cuts', () => {
  const manager = emp({ employeeId: 'M1', name: 'Morgan Lee', level: 'M1' })
  const reports = (n: number) =>
    Array.from({ length: n }, (_, i) => emp({ employeeId: `D${i}`, managerId: 'M1' }))
  const feedback = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      answer({
        survey: 'Manager feedback',
        wave: '2026 H1',
        responseDate: '2026-06-10',
        respondentKey: `D${i}`,
        subjectKey: 'M1',
        item: 'MGR_FEEDBACK',
        driver: 'Feedback',
        score: 2,
      }),
    )
  const s = { minManager: 10, quarters: 4, lowManager: 3 }

  it('shows a manager only with 10 or more distinct respondents', () => {
    const nine = fixtureContext({ employees: [manager, ...reports(9)], surveyResponses: feedback(9) })
    expect(managerCut(nine, feedback(9), s)).toMatchObject({ rows: [], hidden: 1, flags: [] })
    const ten = fixtureContext({ employees: [manager, ...reports(10)], surveyResponses: feedback(10) })
    const cut = managerCut(ten, feedback(10), s)
    expect(cut.rows).toEqual([
      expect.objectContaining({ managerId: 'M1', name: 'Morgan Lee', mean: 2, respondents: 10, low: true }),
    ])
    expect(cut.flags).toHaveLength(1)
  })

  it('pools only the last four quarters', () => {
    const old = feedback(10).map((r) => ({ ...r, responseDate: '2025-06-10', wave: '2025 H1' }))
    const ctx = fixtureContext({ employees: [manager, ...reports(10)], surveyResponses: old })
    expect(managerCut(ctx, old, s).rows).toEqual([])
  })
})

describe('response rates over a named invited list', () => {
  it('hides a rate that would say who answered, and keeps the invited count', () => {
    // Vancouver: 4 starters invited to the day-30 pulse who all answered, 1 leaver invited to the
    // exit survey who didn't. The invited lists name them, so neither rate may show.
    const ctx = sampleContext({ filters: { location: ['Vancouver'] } })
    const m = compute(ctx)
    const known = m.programs.filter((r) => r.rateKnown && r.invited > 0)
    expect(known.length).toBeGreaterThan(0)
    for (const r of known) {
      const min = m.settings.minOf[r.survey]
      if (r.rateSuppressed) {
        expect(r.rate, r.survey).toBeNull()
        expect(r.responded, r.survey).toBeNull()
      } else {
        expect(r.responded, r.survey).not.toBeNull()
        expect(rateHidden(r.invited, r.responded as number, min), r.survey).toBe(false)
      }
    }
    const exit = m.programs.find((r) => r.survey === 'Exit survey')
    expect(exit).toMatchObject({ rate: null, rateSuppressed: true })
    expect(exit?.invited).toBeGreaterThan(0)
    // The survey's own rate tile says it is hidden, not 0%.
    for (const sm of m.surveys.values()) {
      const tile = surveyKpis(ctx, m, sm).find((k) => k.id === `rate-${sm.program.key}`)
      if (sm.rate.suppressed) expect(tile).toMatchObject({ value: null, suppressed: true })
      // A named list shorter than the minimum is never opened.
      if (!sm.rate.unknown && sm.rate.invited < sm.min) expect(tile?.drill, sm.survey).toBeUndefined()
    }
    // The pooled rate leaves hidden programs out, so it can't be worked back to one of them.
    const shown = known.filter((r) => !r.rateSuppressed)
    expect(m.pooledRate.invited).toBe(shown.reduce((a, r) => a + r.invited, 0))
  })

  it('shows every rate for the whole company', () => {
    const m = compute(sampleContext())
    for (const r of m.programs.filter((x) => x.rateKnown && x.invited > 0))
      expect(r.rate, r.survey).not.toBeNull()
  })
})

describe('manager feedback in a narrowed scope', () => {
  const manager = emp({ employeeId: 'MG1', name: 'Riley Shaw', level: 'M1' })
  const team = Array.from({ length: 7 }, (_, i) => emp({ employeeId: `T${i}`, managerId: 'MG1' }))
  const wave = (name: string, date: string, score: number) =>
    team.map((e) =>
      answer({
        survey: 'Manager feedback',
        wave: name,
        responseDate: date,
        respondentKey: e.employeeId,
        subjectKey: 'MG1',
        item: 'MGR_CLARITY',
        driver: 'Clarity',
        score,
      }),
    )
  const rows = [...wave('2025 H2', '2025-12-10', 2), ...wave('2026 H1', '2026-06-10', 3)]
  const company = fixtureContext({ employees: [manager, ...team], surveyResponses: rows })
  // The same answers with a leader filter on: the scope can be this one manager's team.
  const narrowed = { ...company, isCompany: false }

  it('shows 7 respondents for the whole company, with the change since the last wave', () => {
    const sm = compute(company).surveys.get('Manager feedback')
    expect(sm?.headline).toMatchObject({ value: 3, respondents: 7, suppressed: false })
    expect(sm?.change).toBe(1)
    expect(sm?.drivers[0]).toMatchObject({ value: 3, delta: 1 })
  })

  it('needs 10 respondents for every number and drops the change', () => {
    const m = compute(narrowed)
    const sm = m.surveys.get('Manager feedback')
    expect(sm?.min).toBe(10)
    expect(sm?.compare).toBe(false)
    expect(sm?.headline).toMatchObject({ value: null, suppressed: true })
    expect(sm?.change).toBeNull()
    for (const d of sm?.drivers ?? []) expect(d).toMatchObject({ value: null, prior: null, delta: null })
    for (const h of Object.values(sm?.heat ?? {})) for (const c of h.cells) expect(c.value).toBeNull()
    expect(m.programs.find((r) => r.survey === 'Manager feedback')).toMatchObject({
      value: null,
      change: null,
    })
    expect(surveyHeadline(narrowed, 'Manager feedback')).toMatchObject({ value: null, change: null })
    expect(linkedHeadline(narrowed, 'Manager feedback')).toMatchObject({ value: null, change: null })
  })

  it('applies to the sample when a leader filter narrows it to one team', () => {
    const lead = sampleData().employees.find((e) => e.name === 'Heather Hayes')
    if (!lead) return
    const sm = compute(sampleContext({ filters: { leaderId: lead.employeeId } })).surveys.get(
      'Manager feedback',
    )
    for (const d of sm?.drivers ?? []) {
      expect(d.delta).toBeNull()
      if (d.respondents < 10) expect(d.value).toBeNull()
    }
    expect(sm?.change ?? null).toBeNull()
  })
})
