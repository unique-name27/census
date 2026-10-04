/**
 * The public API other views call: one linked survey number per program, and its KPI tile.
 */
import { describe, expect, it } from 'vitest'
import { invalidRefs } from '@/data/quality'
import { SURVEY_TYPES } from '@/data/schema'
import { resolveDrill } from '@/drill/Drill'
import { CATALOG } from '@/metrics/catalog'
import { surveyHeadline, surveyKpi } from './api'
import { compute } from './engine'
import { answers, fixtureContext, sampleContext } from './engine/testkit'

describe('surveyHeadline', () => {
  const ctx = sampleContext()
  const m = compute(ctx)

  it('matches the Listening overview for every program, links to its tab and drills to groups', () => {
    for (const survey of SURVEY_TYPES.filter((s) => s !== 'Engagement')) {
      const h = surveyHeadline(ctx, survey)
      const row = m.programs.find((r) => r.survey === survey)!
      expect(h, survey).not.toBeNull()
      expect(h?.value, survey).toBe(row.value)
      expect(h?.wave, survey).toBe(row.latestWave)
      expect(h?.tab, survey).toBe(row.tab)
      expect(h?.href, survey).toBe(`#listening.${row.tab}`)
      expect(CATALOG.byId.has(h?.metricId ?? ''), survey).toBe(true)
      expect(invalidRefs(h?.uses ?? []), survey).toEqual([])
      const spec = resolveDrill(h?.drill)
      expect(spec?.kind, survey).toBe('surveyGroups')
    }
  })

  it('labels the value with the measure and wave', () => {
    const h = surveyHeadline(ctx, 'Candidate experience')!
    expect(h).toMatchObject({
      label: 'Candidate NPS, 2026 Q3',
      format: 'int',
      view: 'listening',
      tab: 'candidates',
    })
    expect(surveyHeadline(ctx, 'Exit survey')).toMatchObject({ format: 'num2', tab: 'stay-exit' })
  })

  it('is null without answers, and for engagement while the switch is off', () => {
    expect(surveyHeadline(fixtureContext({}), 'Exit survey')).toBeNull()
    expect(surveyHeadline(ctx, 'Engagement')).toBeNull()
    const on = sampleContext({ features: { engagementSurveys: true } })
    expect(surveyHeadline(on, 'Engagement')?.value).not.toBeNull()
  })

  it('hides the value below the minimum', () => {
    const h = surveyHeadline(
      fixtureContext({ surveyResponses: answers(4, [5]) }),
      'Hiring manager satisfaction',
    )
    expect(h).toMatchObject({ value: null, suppressed: true, respondents: 4 })
  })
})

describe('surveyKpi', () => {
  it('is a tile with the metric, fields, drill and change, and no tab of its own', () => {
    const k = surveyKpi(sampleContext(), 'Onboarding pulse day 30', { id: 'pulse' })!
    expect(k).toMatchObject({ id: 'pulse', metricId: 'listening.score.onboardingDay30', format: 'num2' })
    expect(k.tab).toBeUndefined()
    expect(k.uses?.length).toBeGreaterThan(0)
    expect(k.deltaLabel).toBe('vs 2026 Q2')
    expect(resolveDrill(k.drill)?.kind).toBe('surveyGroups')
  })
})
