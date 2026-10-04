/**
 * Privacy in the engine (docs/VIEWS.md, Listening, Privacy): groups under the minimum have no
 * scores, manager cuts need 10 distinct respondents over four quarters, reason counts hide in a
 * small group, and nothing a drill returns carries a respondent key, a date or a single answer.
 */
import { describe, expect, it } from 'vitest'
import type { SurveyResponse } from '@/data/schema'
import { declineCut, exitCut, managerCut, stayCut } from './cuts'
import { driverRowsOf, itemRowsOf } from './drills'
import { compute } from './index'
import { prepare } from './prepare'
import { answer, answers, emp, fixtureContext } from './testkit'

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
