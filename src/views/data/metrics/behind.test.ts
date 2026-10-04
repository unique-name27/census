import { describe, expect, it } from 'vitest'
import { defaultMetrics } from '@/metrics/api'
import { metricsWith, metricsWithEdits } from '@/metrics/testing'
import { behindText } from './behind'

describe('behindText', () => {
  it('is null when a number is calculated exactly as by default', () => {
    expect(behindText(defaultMetrics(), 'hrbp.attrition.voluntary')).toBeNull()
  })

  it("names a setting registered on another metric, with that metric's name", () => {
    const m = metricsWith({ 'hrbp.headcount.employees': { countContractors: true } })
    expect(behindText(m, 'hrbp.attrition.voluntary')).toEqual({
      sentences: ['A setting it is calculated with has changed: Count contractors in headcount (Headcount).'],
      short: 'Count contractors in headcount (Headcount)',
    })
  })

  it("says the metric's own changes first, then its sources and the quality rules", () => {
    const m = metricsWithEdits([
      { metricId: 'hrbp.attrition.voluntary', field: 'target', value: { value: 0.08, comparator: '<=' } },
      { metricId: 'hrbp.attrition.all', field: 'params.annualize', value: false },
      { metricId: 'privacy.anonymity', field: 'params.minGroup', value: 8 },
      { metricId: 'quality.rules.fill', field: 'params.minCoverage', value: 0.9 },
    ])
    expect(behindText(m, 'hrbp.attrition.voluntary')?.sentences).toEqual([
      'Voluntary attrition differs from its default: Target.',
      'Settings it is calculated with have changed: Annualize turnover rates (Attrition) and Smallest group shown (Anonymity minimum).',
      'A data quality rule that sets its tier has changed: Fill threshold (Silver fill threshold).',
    ])
  })

  it('marks an HR ops readout when the SLA target it is judged against changes', () => {
    const m = metricsWithEdits([
      { metricId: 'services.cases.resolutionSla', field: 'target', value: { value: 0.95, comparator: '>=' } },
    ])
    expect(behindText(m, 'services.readout.slowCategory')?.short).toBe('Target (Resolution SLA met)')
  })
})
