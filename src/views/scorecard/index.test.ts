import { describe, expect, it } from 'vitest'
import { gateHeadline } from '@/app/headlineGate'
import { VIEWS } from '@/views/registry'
import { view } from '@/views/scorecard'
import { sampleContext, tieredSampleContext } from './engine/testkit'
import { M } from './metrics'
import { OTHER_VIEWS } from './views'

describe('the scorecard view', () => {
  it('reads every other view, in folder-tab order, without importing the registry', () => {
    expect(OTHER_VIEWS).toEqual(VIEWS.filter((v) => v.key !== 'scorecard'))
    expect(VIEWS.find((v) => v.key === 'scorecard')).toBe(view)
  })

  it('heads the folder tab with targets met, counting what the standard shows', () => {
    const h = view.headline(sampleContext())
    expect(h).toMatchObject({ label: 'targets met', metricId: M.targetsMet })
    expect(h.value).toMatch(/^\d+ of \d+$/)
    expect(h.uses?.length).toBeGreaterThan(0)
    // Under Production the count covers only gold measures, so the tab itself is shown.
    const gold = tieredSampleContext('gold')
    const gated = gateHeadline(view.headline(gold), gold.quality, gold.standard, view.datasets)
    expect(gated.hidden).toBeNull()
    expect(gated.value).toMatch(/^\d+ of \d+$/)
  })

  it('has one tab, reads every dataset and offers the monthly report in its header', () => {
    expect(view.tabs.map((t) => t.key)).toEqual(['overview'])
    expect(view.HeaderActions).toBeTruthy()
    expect(view.summary).toBeUndefined()
    expect(view.actions).toBeUndefined()
  })
})
