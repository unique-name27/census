/**
 * The Listening view contract: its tabs (Engagement only while the switch is on), the datasets it
 * reads, and the summary and actions the Scorecard and the Action center call.
 */
import { describe, expect, it } from 'vitest'
import { withFeatureTabs } from '../types'
import { sampleContext } from './engine/testkit'
import { view } from './index'

describe('the Listening view', () => {
  it('hides the Engagement tab while engagement surveys are off', () => {
    const keys = (on: boolean) => withFeatureTabs(view, { engagementSurveys: on }).tabs.map((t) => t.key)
    expect(keys(false)).toEqual(['overview', 'candidates', 'onboarding', 'stay-exit', 'managers', 'services'])
    expect(keys(true)).toEqual([
      'overview',
      'candidates',
      'onboarding',
      'stay-exit',
      'managers',
      'services',
      'engagement',
    ])
  })

  it('leaves views without gated tabs untouched', () => {
    const plain = { ...view, tabs: view.tabs.filter((t) => !t.feature) }
    expect(withFeatureTabs(plain, { engagementSurveys: false })).toBe(plain)
  })

  it('gives the Scorecard its summary and the Action center its items', () => {
    const ctx = sampleContext()
    const s = view.summary?.(ctx)
    expect(s?.kpis).toHaveLength(3)
    expect(s?.findings.length).toBeGreaterThanOrEqual(6)
    const items = view.actions?.(ctx) ?? []
    expect(new Set(items.map((a) => a.ownerRole))).toEqual(new Set(['hrbp', 'talent', 'total-rewards', 'it']))
  })
})
