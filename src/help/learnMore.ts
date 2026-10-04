/**
 * Which help article covers a metric, for "Learn more" in the KPI and figure info popovers. Pure
 * and light (no article content), so the shared components can import it.
 */

/** A view's article, by the first part of a metric id (`hrbp.attrition.voluntary` → People stats). */
const BY_PREFIX: Readonly<Record<string, string>> = {
  scorecard: 'view-scorecard',
  recruiting: 'view-recruiting',
  onboarding: 'view-onboarding',
  hrbp: 'view-hrbp',
  org: 'view-org',
  services: 'view-services',
  talent: 'view-talent',
  comp: 'view-comp',
  compliance: 'view-compliance',
  listening: 'view-listening',
  actions: 'view-actions',
  quality: 'data-tiers',
}

/** The privacy rules each have their own article. */
const BY_ID: Readonly<Record<string, string>> = {
  'privacy.anonymity': 'privacy-small-groups',
  'privacy.payAmounts': 'privacy-pay',
  'privacy.protectedFields': 'privacy-browser',
  'privacy.immigrationDetails': 'privacy-immigration',
  'privacy.surveyAnswers': 'privacy-surveys',
  'privacy.surveyManagerCuts': 'privacy-surveys',
}

/** Every article id this module can return (tests check each one exists). */
export const LEARN_MORE_ARTICLES: readonly string[] = [
  ...new Set([...Object.values(BY_PREFIX), ...Object.values(BY_ID)]),
]

/** The article that explains a metric, or null when none covers it. */
export function articleForMetric(metricId: string | null | undefined): string | null {
  if (!metricId) return null
  return BY_ID[metricId] ?? BY_PREFIX[metricId.split('.')[0]] ?? null
}
