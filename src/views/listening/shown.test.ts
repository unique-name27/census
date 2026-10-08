/**
 * The one rule for linked survey numbers (docs/ROLES-V2.md 4.2): another view shows a survey's
 * number only while the mode shows that survey's own Listening tab, not merely Listening.
 */
import { describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { surveyHeadline, surveyKpi, surveyShown } from './api'
import { sampleContext } from './engine/testkit'
import { linkedHeadline } from './linked'

/** The sample context with every surface shown except the ones named. */
function hiding(ctx: AnalyticsContext, hidden: readonly string[]): AnalyticsContext {
  const off = new Set(hidden)
  const can = (s: string) => !off.has(s) && ctx.access.can(s)
  return { ...ctx, access: { ...ctx.access, can } }
}

describe('linked survey numbers follow their Listening tab', () => {
  const ctx = sampleContext()

  it('show while the tab is shown', () => {
    expect(surveyShown(ctx, 'Candidate experience')).toBe(true)
    expect(surveyHeadline(ctx, 'Candidate experience')).not.toBeNull()
  })

  it('show nothing when only the survey’s tab is hidden, while other tabs still show theirs', () => {
    const c = hiding(ctx, ['tab:listening.candidates'])
    expect(surveyShown(c, 'Candidate experience')).toBe(false)
    expect(surveyHeadline(c, 'Candidate experience')).toBeNull()
    expect(linkedHeadline(c, 'Hiring manager satisfaction')).toBeNull()
    expect(surveyKpi(c, 'Candidate experience')).toBeNull()
    // Stay & exit is still shown: the exit survey number stays.
    expect(surveyShown(c, 'Exit survey')).toBe(true)
    expect(surveyHeadline(c, 'Exit survey')).not.toBeNull()
  })

  it('show nothing when Listening itself is hidden', () => {
    const c = hiding(ctx, ['view:listening'])
    for (const s of ['Exit survey', 'Manager feedback', 'Return to work'] as const) {
      expect(surveyShown(c, s), s).toBe(false)
      expect(surveyHeadline(c, s), s).toBeNull()
    }
  })
})
