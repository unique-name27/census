/**
 * The words Ask Census shows that come from the engine's contract (docs/ASK.md, What the user
 * sees): the privacy line, what is sent and what never is, and four suggested questions for the
 * view on screen (on Home, the mode's own four: docs/ROLES-V2.md 7).
 */
import type { Mode } from '@/access/modes'
import type { RouteView } from '@/data/store'
import { type AnalysisKey, parseAnalysesTab } from '@/views/hrbp/analyses/tab'

export const ASK_INTRO =
  'Ask a question about your people data. Census works out the numbers and links them to their records.'

export const PRIVACY_LINE =
  'Your questions and the numbers Census calculates go to Anthropic under your API key. Names, IDs and pay amounts never do.'

/** Settings > Ask Census: what is sent and what never is. */
export const WHAT_IS_SENT: readonly string[] = [
  'Sent: your question, and the counts, rates, definitions and org structure Census calculates to answer it.',
  'Never sent: names, employee, candidate and application IDs, emails, pay amounts, survey answers of one person, or immigration details. People appear as tokens that only this browser can read.',
  'The conversation lasts until you choose New chat, reload the page or close the tab. Your key is kept for this tab unless you choose to keep it on this device.',
]

const SUGGESTIONS: Record<RouteView, readonly string[]> = {
  home: [
    'Which practices miss the most targets?',
    'What are the most serious findings across Census right now?',
    'How is voluntary attrition trending against its target?',
    'Where is headcount growing fastest?',
  ],
  team: [
    'How has headcount in my org changed over the last 12 months?',
    'How does voluntary attrition in my org compare with the company?',
    'Which open reqs in my org have been open longest?',
    'Who starts in the next 30 days, and are they ready for day one?',
  ],
  scorecard: [
    'Which measures miss their target, and by how much?',
    'What are the most serious findings across Census right now?',
    'How is voluntary attrition trending against its target?',
    'Which numbers are held back by the data standard, and why?',
  ],
  recruiting: [
    'Where is time to fill longest, and what is driving it?',
    'Which open reqs have been open longest?',
    'Which sources bring the most hires per application?',
    'Where are candidates waiting longest for a decision?',
  ],
  onboarding: [
    'How many starts in the next two weeks are not ready for day one?',
    'Which onboarding tasks are most often late, and who owns them?',
    'How do hires compare with the hiring plan this quarter?',
    'How did new hires rate their first 30 days?',
  ],
  hrbp: [
    'Where is voluntary attrition highest, and how has it changed?',
    'How has headcount changed by business unit over the last 12 months?',
    'Which teams lost the most regretted leavers?',
    'What are the top reasons people leave voluntarily?',
  ],
  org: [
    'Which leaders have the largest orgs?',
    'How is headcount split by business unit and location?',
    'How many direct reports do the managers in Software have?',
    'How many contractors and interns work in each business unit?',
  ],
  services: [
    'Which case categories miss their resolution target most often?',
    'How long does it take to resolve a payroll case?',
    'How many transactions were processed late last quarter?',
    'How many people are on leave, and when are they due back?',
  ],
  talent: [
    'How does the rating distribution compare with the guideline?',
    'Which critical roles have no ready-now successor?',
    'Where is key talent at risk of leaving?',
    'How many required trainings are overdue, and where?',
  ],
  comp: [
    'Where is the median compa-ratio lowest?',
    'How many people are paid below their range minimum?',
    'How does merit spend compare with the budget?',
    'Is merit increase in line with ratings?',
  ],
  compliance: [
    'How many work authorizations expire in the next 90 days?',
    'How many I-9s were completed late?',
    'How many people are working without an export license in force?',
    'Which required acknowledgments are overdue?',
  ],
  listening: [
    'How did candidate NPS change this quarter?',
    'What do exit surveys say is the main reason for leaving?',
    'Which HR service categories score lowest?',
    'How did the onboarding pulse change since the last wave?',
  ],
  ai: [
    'What does Census measure about recruiting?',
    'How is voluntary attrition defined?',
    'Which datasets are loaded, and how good are they?',
    'What are the most serious findings right now?',
  ],
  data: [
    'Which datasets are below silver, and why?',
    'Which fields hold the employee data back?',
    'Which values are not on the official lists?',
    'Which metric definitions were changed from the default?',
  ],
  dev: [
    'Which datasets are loaded, and how good are they?',
    'How is voluntary attrition defined?',
    'What are the most serious findings right now?',
    'Which metric definitions were changed from the default?',
  ],
  actions: [
    'How many open items are overdue, and who owns them?',
    'Which owner group has the most critical items?',
    'Which view do most open items come from?',
    'What is due in the next week?',
  ],
}

/** Each role home's own four (docs/ROLES-V2.md 7); a mode without one uses Home's. */
const HOME_SUGGESTIONS: Partial<Record<Mode, readonly string[]>> = {
  chro: [
    'Which practices miss the most targets?',
    'What are the top risks across Census right now?',
    'How is voluntary attrition trending against its target?',
    'Which escalations have waited longest?',
  ],
  'hrbp-unit': [
    'Where is voluntary attrition highest in this business unit?',
    "Which leaders' orgs are furthest off the company on the scorecard?",
    'Which open reqs in this business unit have been open longest?',
    'What is waiting on me in the Action center?',
  ],
  'hrbp-region': [
    'Which sites in this region have the highest voluntary attrition?',
    'How has headcount in this region changed over the last 12 months?',
    'Where is key talent at risk in this region?',
    'What is waiting on me in the Action center?',
  ],
  compensation: [
    'How many people are paid below their range minimum, and where?',
    'Where is the median compa-ratio lowest?',
    'How is merit spend tracking against the budget?',
    'Which business units have the most merit proposals outside the guideline?',
  ],
  'talent-management': [
    'Which critical roles have no ready-now successor?',
    'How does the rating distribution compare with the guideline?',
    'Where is key talent at risk of leaving?',
    'How many required trainings are overdue, and where?',
  ],
  'hr-ops': [
    'Which case categories miss their resolution target most often?',
    'How many HR transactions are late, and of which type?',
    'Which starts in the next two weeks are not ready for day one?',
    'How many people return from leave in the next 30 days?',
  ],
  recruiter: [
    'Which of my reqs have gone longest without a hire?',
    'Which candidates have waited longest for a next step?',
    'How many offers are out, and how long have they waited?',
    'Who starts in the next 30 days, and are they ready for day one?',
  ],
  finance: [
    'Which business units are furthest behind the hiring plan?',
    'How has headcount changed by business unit over the last 12 months?',
    'How many open reqs are not in the hiring plan?',
    'How many contractors and interns work in each business unit?',
  ],
}

/** People stats > Special analyses (docs/ANALYSES.md, 1.8): one question per analysis, in picker order. */
const ANALYSIS_SUGGESTIONS: Record<AnalysisKey, string> = {
  quality: 'What drives quality of hire here?',
  declines: 'Why were offers declined last quarter?',
  stages: 'How many verification engineers do we have per RTL designer?',
  pyramid: 'Which levels grew fastest in the last year?',
}

/**
 * Four suggested questions for the view on screen. On People stats > Special analyses, one per
 * analysis the mode shows (`shown`), the one on screen first; on Home, the mode's own four.
 */
export function suggestionsFor(
  view: RouteView,
  tab?: string | null,
  shown: (key: AnalysisKey) => boolean = () => true,
  mode?: Mode | null,
): readonly string[] {
  if (view === 'home' && mode) {
    const own = HOME_SUGGESTIONS[mode]
    if (own) return own
  }
  const route = view === 'hrbp' ? parseAnalysesTab(tab) : null
  if (route?.onTab) {
    const keys = (Object.keys(ANALYSIS_SUGGESTIONS) as AnalysisKey[]).filter(shown)
    const first = route.key && keys.includes(route.key) ? [route.key] : []
    return [...first, ...keys.filter((k) => !first.includes(k))].map((k) => ANALYSIS_SUGGESTIONS[k])
  }
  return SUGGESTIONS[view] ?? SUGGESTIONS.scorecard
}
