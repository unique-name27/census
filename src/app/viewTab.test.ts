/**
 * "<tab>:<anything>" never opens another tab's body (docs/ROLES-V2.md 4.13). For every mode and
 * every tab it shows, the address with ":x" or "/x" after the tab gives the view the same tab as
 * the bare address (so the same figures render), and the address is rewritten to the tab. Only a
 * tab with parts (People stats > Special analyses) reads what follows, and an unknown part reads
 * as the bare address there.
 */
import { describe, expect, it, vi } from 'vitest'
import { accessFor } from '@/access/context'
import { MODES } from '@/access/modes'
import { parseAnalysesTab } from '@/views/hrbp/analyses/tab'
import { VIEWS } from '@/views/registry'
import { withAccessTabs, withFeatureTabs } from '@/views/types'
import { viewTabOf } from './viewTab'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

describe('a tab with something after it', () => {
  it('shows that tab in every mode, never another, and rewrites the address', () => {
    let checked = 0
    for (const mode of MODES) {
      const access = accessFor(mode)
      for (const registered of VIEWS) {
        const shown = withAccessTabs(withFeatureTabs(registered, { engagementSurveys: true }), access).tabs
        for (const t of shown) {
          const bare = viewTabOf(shown, registered.tabs, t.key)
          expect(bare.rewrite, `${mode} ${registered.key}.${t.key}`).toBe(false)
          for (const extra of [':x', '/x', ':', ':overview']) {
            const label = `${mode} #${registered.key}.${t.key}${extra}`
            const got = viewTabOf(shown, registered.tabs, `${t.key}${extra}`)
            expect(got.tab, label).toBe(t.key)
            if (t.parts) {
              // The analyses tab reads the part; an unknown one is the bare address.
              expect(parseAnalysesTab(got.viewTab), label).toEqual(parseAnalysesTab(bare.viewTab))
            } else {
              expect(got.viewTab, label).toBe(bare.viewTab)
              expect(got.rewrite, label).toBe(true)
            }
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200)
  })

  it('the review’s cases: Finance on Requisitions and Workforce cost, Talent management on First 90 days', () => {
    const shownIn = (mode: (typeof MODES)[number], key: string) => {
      const v = VIEWS.find((x) => x.key === key)!
      return { shown: withAccessTabs(v, accessFor(mode)).tabs, registered: v.tabs }
    }
    const rec = shownIn('finance', 'recruiting')
    expect(rec.shown.map((t) => t.key)).not.toContain('overview')
    expect(viewTabOf(rec.shown, rec.registered, 'requisitions:x')).toEqual({
      tab: 'requisitions',
      viewTab: 'requisitions',
      rewrite: true,
    })
    const comp = shownIn('finance', 'comp')
    expect(viewTabOf(comp.shown, comp.registered, 'cost:x').viewTab).toBe('cost')
    const onb = shownIn('talent-management', 'onboarding')
    expect(onb.shown.map((t) => t.key)).not.toContain('upcoming')
    expect(viewTabOf(onb.shown, onb.registered, 'first90:x').viewTab).toBe('first90')
    // A part of Special analyses stays in the address.
    const hrbp = shownIn('hr', 'hrbp')
    expect(viewTabOf(hrbp.shown, hrbp.registered, 'analyses:quality')).toEqual({
      tab: 'analyses',
      viewTab: 'analyses:quality',
      rewrite: false,
    })
  })

  it('a tab the mode hides still opens the first shown tab, with the address rewritten', () => {
    const v = VIEWS.find((x) => x.key === 'recruiting')!
    const shown = withAccessTabs(v, accessFor('finance')).tabs
    expect(viewTabOf(shown, v.tabs, 'overview')).toEqual({
      tab: shown[0].key,
      viewTab: shown[0].key,
      rewrite: true,
    })
  })
})
