/**
 * Every figure and readout on the Scorecard, in page order (docs/DESIGN-REFRESH.md 4.1, ROLES.md
 * 2.1). The key figures strip registers as `key-figures`, as on every view. The access matrix
 * lists them in each mode, and a test keeps this list equal to the ids in `ui/`.
 */
export const SCORECARD_FIGURES: readonly string[] = [
  'scorecard-standing',
  'scorecard-measures',
  'scorecard-findings',
  'scorecard-items',
  'scorecard-attention',
  'scorecard-headcount',
  'scorecard-flow',
  'scorecard-attrition-trend',
  'scorecard-attrition-bu',
  'scorecard-pipeline',
  'scorecard-people',
]
