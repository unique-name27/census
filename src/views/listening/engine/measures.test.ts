/**
 * Exact definitions on hand-built answers: the headline (NPS or mean), the minimum, waves and the
 * change since the last wave, response rates against the invited population, driver targets from
 * the Survey items sheet, the heat table's folding, and the engagement switch.
 */
import { describe, expect, it } from 'vitest'
import type { Requisition } from '@/data/schema'
import { metricsWith } from '@/metrics/testing'
import { scoreMetric } from '../metrics'
import { programOf } from './catalog'
import { compute } from './index'
import { driverTarget, headlineOf, heatOf, inHeatColumn, invitedOf, rateOf } from './measures'
import { prepare } from './prepare'
import { answer, answers, emp, fixtureContext } from './testkit'

describe('headline', () => {
  it('is the mean of the 1-5 answers, or NPS of the 0-10 answers', () => {
    const rows = [...answers(6, [5, 4, 3]), ...answers(6, [10, 9, 6], { scale: '0-10', item: 'NPS' })]
    expect(headlineOf(rows, 'mean', 5)).toMatchObject({ value: 4, respondents: 6, suppressed: false })
    // 4 promoters, 2 detractors of 6: (4 − 2) ÷ 6.
    expect(headlineOf(rows, 'nps', 5).value).toBeCloseTo(((4 - 2) / 6) * 100, 6)
  })

  it('is hidden below the minimum of distinct respondents, however many answers', () => {
    const rows = [...answers(4, [5]), ...answers(4, [5], { item: 'HM_SLATE' })]
    const h = headlineOf(rows, 'mean', 5)
    expect(h).toMatchObject({ value: null, respondents: 4, suppressed: true })
  })

  it('says when there are no answers on its scale, which is not hidden', () => {
    expect(headlineOf(answers(6, [4]), 'nps', 5)).toMatchObject({
      value: null,
      empty: true,
      suppressed: false,
    })
  })
})

describe('waves and change', () => {
  const prior = answers(6, [3], { wave: '2026 Q2', responseDate: '2026-05-10' })
  const latest = answers(6, [4], { wave: '2026 Q3', responseDate: '2026-08-10' })

  it('compares the latest wave with the one before', () => {
    const ctx = fixtureContext({ surveyResponses: [...prior, ...latest] })
    const sm = compute(ctx).surveys.get('Hiring manager satisfaction')!
    expect(sm.latest?.wave).toBe('2026 Q3')
    expect(sm.prior?.wave).toBe('2026 Q2')
    expect(sm.headline.value).toBe(4)
    expect(sm.change).toBe(1)
    expect(sm.material).toBe(true)
    expect(sm.drivers[0]).toMatchObject({ driver: 'Speed', value: 4, prior: 3, delta: 1 })
  })

  it('gives no change when either wave is under the minimum', () => {
    const small = answers(4, [3], { wave: '2026 Q2', responseDate: '2026-05-10' })
    const sm = compute(fixtureContext({ surveyResponses: [...small, ...latest] })).surveys.get(
      'Hiring manager satisfaction',
    )!
    expect(sm.priorHeadline?.suppressed).toBe(true)
    expect(sm.change).toBeNull()
    expect(sm.drivers[0].delta).toBeNull()
  })

  it('ignores answers after the as-of date and a wave that starts after it', () => {
    const later = answers(6, [1], { wave: '2026 Q4', responseDate: '2026-10-05' })
    const sm = compute(fixtureContext({ surveyResponses: [...prior, ...latest, ...later] })).surveys.get(
      'Hiring manager satisfaction',
    )!
    expect(sm.latest?.wave).toBe('2026 Q3')
  })
})

describe('targets and status', () => {
  it('reads the driver target from the Survey items sheet, else the default setting', () => {
    const ctx = fixtureContext({
      surveyResponses: answers(6, [4]),
      surveyItems: [
        {
          item: 'HM_SPEED',
          driver: 'Speed',
          survey: 'Hiring manager satisfaction',
          target: 4.4,
          scale: '1-5',
        },
        {
          item: 'HM_SPEED2',
          driver: 'Speed',
          survey: 'Hiring manager satisfaction',
          target: 4.0,
          scale: '1-5',
        },
      ],
    })
    const p = prepare(ctx)
    expect(driverTarget(p, 'Hiring manager satisfaction', 'Speed', 3.9)).toEqual({
      target: 4.2,
      from: 'items',
    })
    expect(driverTarget(p, 'Hiring manager satisfaction', 'Slate quality', 3.9)).toEqual({
      target: 3.9,
      from: 'default',
    })
  })

  it('marks the headline Met, Watch or Missed against the metric target and the watch margin', () => {
    const status = (score: number) =>
      compute(fixtureContext({ surveyResponses: answers(6, [score]) })).surveys.get(
        'Hiring manager satisfaction',
      )!.status
    expect(status(4)).toBe('met')
    // Target 4.0 with a watch margin of 0.2: 3.8 watches, 3.7 misses.
    expect(
      compute(fixtureContext({ surveyResponses: answers(10, [4, 4, 4, 4, 3]) })).surveys.get(
        'Hiring manager satisfaction',
      )!.status,
    ).toBe('watch')
    expect(status(3)).toBe('missed')
  })

  it('follows an edited target and an edited minimum', () => {
    const p = programOf.get('Hiring manager satisfaction')!
    const metrics = metricsWith({ [scoreMetric(p)]: { minRespondents: 8 } })
    const sm = compute(fixtureContext({ surveyResponses: answers(6, [4]) }, { metrics })).surveys.get(
      'Hiring manager satisfaction',
    )!
    expect(sm.min).toBe(8)
    expect(sm.headline.suppressed).toBe(true)
  })
})

describe('response rate', () => {
  const req = (id: string, hm: string, filledDate: string): Requisition => ({
    reqId: id,
    jobTitle: 'Engineer',
    businessUnit: 'Silicon Engineering',
    department: 'Digital Design',
    location: 'San Jose',
    level: 'L3',
    hiringManagerId: hm,
    openedDate: '2026-01-05',
    filledDate,
    status: 'Filled',
    reqType: 'New',
    priority: 'Standard',
    openings: 1,
  })

  it('divides invited people who answered by everyone invited (hiring managers of reqs filled in the period)', () => {
    const reqs = [
      req('R1', 'H1', '2026-03-01'),
      req('R2', 'H2', '2026-04-01'),
      req('R3', 'H3', '2026-05-01'),
      req('R4', 'H4', '2026-06-01'),
      req('R5', 'H4', '2026-07-01'),
      req('R6', 'H5', '2024-01-01'),
    ]
    const rows = [
      answer({ respondentKey: 'H1' }),
      answer({ respondentKey: 'H2' }),
      answer({ respondentKey: 'H2', item: 'HM_SLATE' }),
      answer({ respondentKey: 'X9' }),
    ]
    const ctx = fixtureContext({ requisitions: reqs, surveyResponses: rows })
    expect([...(invitedOf(ctx, 'Hiring manager satisfaction', ctx.window) ?? [])].sort()).toEqual([
      'H1',
      'H2',
      'H3',
      'H4',
    ])
    expect(rateOf(ctx, prepare(ctx), 'Hiring manager satisfaction', ctx.window)).toMatchObject({
      invited: 4,
      responded: 2,
      rate: 0.5,
      unknown: false,
    })
  })

  it('counts voluntary leavers in the period for the exit survey, and an answer at notice before it', () => {
    const leavers = [
      emp({ employeeId: 'L1', terminationDate: '2025-10-20', terminationType: 'Voluntary' }),
      emp({ employeeId: 'L2', terminationDate: '2026-02-01', terminationType: 'Voluntary' }),
      emp({ employeeId: 'L3', terminationDate: '2026-02-01', terminationType: 'Involuntary' }),
    ]
    const rows = [
      answer({ survey: 'Exit survey', respondentKey: 'L1', responseDate: '2025-09-25', wave: '2025 Q3' }),
    ]
    const ctx = fixtureContext({ employees: leavers, surveyResponses: rows })
    expect(rateOf(ctx, prepare(ctx), 'Exit survey', ctx.window)).toMatchObject({
      invited: 2,
      responded: 1,
      rate: 0.5,
    })
  })

  it('is unknown for programs without an invited population', () => {
    const ctx = fixtureContext({ surveyResponses: answers(6, [4], { survey: 'Stay interview' }) })
    expect(invitedOf(ctx, 'Stay interview', ctx.window)).toBeNull()
    expect(rateOf(ctx, prepare(ctx), 'Stay interview', ctx.window)).toMatchObject({
      rate: null,
      unknown: true,
    })
  })
})

describe('driver heat table', () => {
  it('keeps groups at the minimum, folds the rest into Other, and hides small cells', () => {
    const people = [
      ...Array.from({ length: 6 }, (_, i) => emp({ employeeId: `A${i}`, location: 'San Jose' })),
      ...Array.from({ length: 3 }, (_, i) => emp({ employeeId: `B${i}`, location: 'Austin' })),
      ...Array.from({ length: 3 }, (_, i) => emp({ employeeId: `C${i}`, location: 'Raleigh' })),
    ]
    const rows = people.map((e) =>
      answer({ respondentKey: e.employeeId, score: e.location === 'San Jose' ? 5 : 3 }),
    )
    const ctx = fixtureContext({ employees: people, surveyResponses: rows })
    const heat = heatOf(prepare(ctx), 'Hiring manager satisfaction', rows, 'location', 5)
    expect(heat.groups).toEqual(['San Jose', 'Other (2)'])
    expect(heat.folded).toBe(2)
    const cell = (g: string) => heat.cells.find((c) => c.group === g)!
    expect(cell('San Jose')).toMatchObject({ value: 5, respondents: 6, suppressed: false })
    expect(cell('Other (2)')).toMatchObject({ value: 3, respondents: 6, suppressed: false })
    expect(inHeatColumn(heat, 'Austin', 'Other (2)')).toBe(true)
    expect(inHeatColumn(heat, 'San Jose', 'Other (2)')).toBe(false)
  })
})

describe('engagement switch', () => {
  const rows = answers(6, [9], { survey: 'Engagement', scale: '0-10', item: 'ENG_ENPS', driver: 'eNPS' })

  it('leaves engagement answers out entirely while the switch is off', () => {
    const m = compute(fixtureContext({ surveyResponses: rows }))
    expect(m.surveys.has('Engagement')).toBe(false)
    expect(m.programs.map((r) => r.survey)).not.toContain('Engagement')
    expect(m.engagementHidden).toBe(6)
    expect(m.respondents).toBe(0)
  })

  it('shows them, with eNPS by business unit, when it is on', () => {
    const people = Array.from({ length: 6 }, (_, i) => emp({ employeeId: `R${i + 1}` }))
    const m = compute(
      fixtureContext({ employees: people, surveyResponses: rows }, { features: { engagementSurveys: true } }),
    )
    expect(m.surveys.get('Engagement')?.headline.value).toBe(100)
    expect(m.engagementByOrg?.groups[0]).toMatchObject({ group: 'Silicon Engineering', nps: 100 })
  })
})

describe('empty data', () => {
  it('shows dashes, never zeros, without survey answers', () => {
    const m = compute(fixtureContext({}))
    expect(m.surveys.size).toBe(0)
    const byId = new Map(m.kpis.map((k) => [k.id, k.value]))
    expect(byId.get('programs')).toBeNull()
    expect(byId.get('respondents')).toBeNull()
    expect(byId.get('response-rate')).toBeNull()
    expect(byId.get('readiness')).toBeNull()
    expect(m.findings).toEqual([])
  })
})
