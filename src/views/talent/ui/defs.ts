/** Plain definitions for the Talent figures' datasheet popovers (term, text, formula). */
import type { Definition } from '@/charts'

export const DEF = {
  latestCycle: {
    term: 'Latest cycle',
    text: 'The most recent review cycle that closed on or before the as-of date. Potential is only assessed in annual cycles.',
  },
  highPerformer: {
    term: 'High performer',
    text: 'Rated 4 (Exceeds) or 5 (Far exceeds). The guideline is 35% of rated people: 25% at 4 and 10% at 5.',
    formula: 'rated 4 or 5 ÷ people rated in the cycle',
  },
  guideline: {
    term: 'Rating guideline',
    text: 'Target share of rated people at each rating: 1 = 3%, 2 = 10%, 3 = 52%, 4 = 25%, 5 = 10%.',
  },
  nineBox: {
    term: '9-box',
    text: 'Performance from the rating in the latest annual cycle (1-2 Low, 3 Moderate, 4-5 High) against potential from the same cycle (Low, Moderate, High). Active employees only.',
  },
  calibration: {
    term: 'Calibration shift',
    text: 'Average of the manager-proposed rating minus the final rating, for people with both. A positive shift means calibration lowered ratings.',
    formula: 'mean(proposed rating − final rating)',
  },
  exitWithin12: {
    term: 'Exit rate within 12 months',
    text: 'Of employees rated in the cycle, the share who left in the 12 months after the cycle date, split by voluntary and involuntary exits.',
    formula: 'exits within 12 months ÷ people rated',
  },
  coverage: {
    term: 'Succession coverage',
    text: 'Share of Critical roles with at least one named successor who is Ready now and still employed.',
    formula: 'critical roles with a ready-now successor ÷ critical roles',
  },
  roleStatus: {
    term: 'Role status',
    text: 'Covered: at least one successor ready now. Thin: successors named, none ready now. No successor: nobody named, or everyone named has left.',
  },
  riskOfLoss: {
    term: 'Risk of loss',
    text: 'The incumbent’s risk of leaving as recorded in the succession plan. Flight risk (model) is the Census score for the same person, for comparison.',
  },
  bench: {
    term: 'Bench strength',
    text: 'Named successors still employed, by readiness. One person can be named for more than one role.',
  },
  highPotential: {
    term: 'High potential',
    text: 'Potential rated High in the latest annual cycle, among active employees assessed for potential.',
  },
  flightRisk: {
    term: 'Flight-risk score',
    text: 'Points from up to nine factors, each with a plain reason, added up to a score from 0 to 100. A factor’s points come from how much it raised the voluntary exit rate over the last 12 months; factors that did not raise it get 0 points.',
    formula: 'score = Σ factor strength × factor points',
  },
  bands: {
    term: 'Risk bands',
    text: 'Relative to everyone scored company-wide: the top 10% of scores are High, the next 25% Medium, the rest Low. A score of 0 is always Low.',
  },
  backTest: {
    term: 'Back-test',
    text: 'Everyone active 12 months before the as-of date is scored with the data available then, and their voluntary exits over the next 12 months are counted per band. People are split in two halves; each half is scored with points learned only from the other half, so no one is scored by points that saw their own outcome.',
    formula: 'exit rate = left within 12 months ÷ people in the band',
  },
  lift: {
    term: 'Lift',
    text: 'How many times more often people with a factor left than people without it. Above 1 means the factor went with more exits.',
    formula: 'exit rate with the factor ÷ exit rate without it',
  },
  keyTalent: {
    term: 'Key talent at risk',
    text: 'Active employees whose latest rating is 4 or 5 and whose flight-risk score is in the High band.',
  },
  overduePromotion: {
    term: 'Overdue for promotion',
    text: 'Active employees below executive level, with the company at least 3 years, rated 4 or 5 in each of the last two annual cycles, with no promotion in the last 36 months.',
  },
  regrettedHigh: {
    term: 'Regretted exit, rated 4-5',
    text: 'A voluntary exit marked regrettable whose last rating before leaving was 4 or 5.',
  },
  required: {
    term: 'Required training',
    text: 'Assignments marked required (compliance, security and onboarding courses).',
  },
  onTime: {
    term: 'On time',
    text: 'Completed on or before the due date. Counts assignments due in the period, for people still employed on the due date.',
    formula: 'completed by due date ÷ assignments due',
  },
  overdue: {
    term: 'Overdue',
    text: 'A required assignment that is not completed and was due before the as-of date, for people active today.',
  },
  hours: {
    term: 'Learning hours per employee',
    text: 'Hours credited for courses completed in the period by employees, divided by the average headcount over the period. Contractors and interns are excluded.',
    formula: 'hours completed ÷ average headcount',
  },
} satisfies Record<string, Definition>
