/**
 * The monthly people report lays out each practice's first tab the mode shows (withAccessTabs),
 * never a tab the mode hides: in Talent management, Onboarding opens on First 90 days, not
 * Upcoming starts, so the section keeps its lead chart and key figures.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { accessFor } from '@/access/context'
import { MODES } from '@/access/modes'
import { routeShown } from '@/access/policy'
import { VIEWS } from '@/views/registry'
import { withAccessTabs, withFeatureTabs } from '@/views/types'
import { practiceViews } from '../engine/schedule'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

describe('the monthly report’s practice tabs', () => {
  it('reads the mode’s tabs', () => {
    const src = readFileSync(join(__dirname, 'monthlyReport.ts'), 'utf8')
    expect(src).toMatch(/withAccessTabs\(withFeatureTabs\(registered, features\), access\)/)
  })

  it('opens each practice on a tab the mode shows, in every mode', () => {
    for (const mode of MODES) {
      const access = accessFor(mode)
      for (const registered of practiceViews(VIEWS, access)) {
        const first = withAccessTabs(withFeatureTabs(registered, { engagementSurveys: false }), access)
          .tabs[0]
        if (first) expect(routeShown(mode, registered.key, first.key), `${mode} ${registered.key}`).toBe(true)
      }
    }
    const onboarding = VIEWS.find((v) => v.key === 'onboarding')!
    expect(withAccessTabs(onboarding, accessFor('talent-management')).tabs[0]?.key).toBe('first90')
  })
})
