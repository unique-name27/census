/**
 * The Talent figures' datasheet popovers. Metrics come from the metric dictionary
 * (`ctx.metrics`, see `../metrics.ts`), so an edited definition shows on every figure; the terms
 * below are not metrics, just the words the figures use, worded with the settings in force.
 */
import type { Definition } from '@/charts'
import { fmt } from '@/lib/format'
import type { MetricsApi } from '@/metrics/types'
import type { TalentSettings } from '../engine/settings'
import { figureDefinitions } from '../engine/wording'

export const TERM = {
  latestCycle: {
    term: 'Latest cycle',
    text: 'The most recent review cycle that closed on or before the as-of date. Potential is only assessed in annual cycles.',
  },
  riskOfLoss: {
    term: 'Risk of loss',
    text: 'The incumbent’s risk of leaving as recorded in the succession plan. Flight risk (model) is the Census score for the same person, for comparison.',
  },
  /** Risk of loss where the mode hides the model's scores (Manager): no mention of the model. */
  riskOfLossPlan: {
    term: 'Risk of loss',
    text: 'The incumbent’s risk of leaving as recorded in the succession plan.',
  },
  lift: {
    term: 'Lift',
    text: 'How many times more often people with a factor left than people without it. Above 1 means the factor went with more exits.',
    formula: 'exit rate with the factor ÷ exit rate without it',
  },
  required: {
    term: 'Required training',
    text: 'Assignments marked required (compliance, security and onboarding courses).',
  },
} satisfies Record<string, Definition>

/** "Main reason", with the shared-factor share in force (80% by default). */
export function mainReasonTerm(s: Pick<TalentSettings, 'sharedFactor'>): Definition {
  return {
    term: 'Main reason',
    text: `The factor that adds the most points to the person’s score, leaving out a factor that at least ${fmt(s.sharedFactor, 'pct0')} of the high band shares (such as tenure of 1-3 years) when the person has another one. That shared factor then shows under Also.`,
  }
}

/**
 * A figure's datasheet: its metrics from the dictionary (its own first), the plain terms it uses,
 * and the settings in force when they differ from the defaults (`related` adds metrics whose
 * settings it reads without defining them, such as the high performer rating).
 */
export const defsFor = (
  m: MetricsApi,
  ids: readonly string[],
  terms: readonly Definition[] = [],
  related: readonly string[] = [],
): Definition[] => figureDefinitions(m, ids, terms, related)
