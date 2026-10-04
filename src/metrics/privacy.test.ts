import { describe, expect, it } from 'vitest'
import { defaultMetrics } from './api'
import { CATALOG } from './catalog'
import {
  ANONYMITY,
  IMMIGRATION_DETAILS,
  SURVEY_ANSWERS,
  SURVEY_MANAGER_CUTS,
  SURVEY_MANAGER_MIN,
  surveyMinimumsOf,
} from './privacy'
import { metricsWith } from './testing'

describe('privacy rules for surveys and immigration', () => {
  it('are registered, locked and read through the dictionary', () => {
    for (const id of [IMMIGRATION_DETAILS.metricId, SURVEY_ANSWERS.metricId, SURVEY_MANAGER_CUTS.metricId]) {
      const d = CATALOG.byId.get(id)
      expect(d?.locked, id).toBe(true)
      expect(d?.kind, id).toBe('rule')
      expect(d?.views, id).toContain('listening')
    }
    expect(surveyMinimumsOf(defaultMetrics())).toEqual({
      minGroup: 5,
      minManager: SURVEY_MANAGER_MIN,
      quarters: 4,
    })
  })

  it('let the minimums go up, never below the anonymity minimum', () => {
    const raised = metricsWith({ [SURVEY_MANAGER_CUTS.metricId]: { [SURVEY_MANAGER_CUTS.key]: 15 } })
    expect(surveyMinimumsOf(raised).minManager).toBe(15)
    const anon = metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 12 } })
    expect(surveyMinimumsOf(anon)).toMatchObject({ minGroup: 12, minManager: 12 })
    expect(() => metricsWith({ [SURVEY_MANAGER_CUTS.metricId]: { [SURVEY_MANAGER_CUTS.key]: 6 } })).toThrow()
  })
})
