/**
 * The sample catalog: about twenty Glean agents an HR team at a chip company would set up, one
 * area at a time. Every entry is a sample with a sample link, to be replaced by the team's own
 * catalog (edit in place, or import the "AI agents" sheet).
 *
 * House rules for every agent: it assists and people decide (never hiring, ratings or pay), only
 * data it is approved for goes in, and export control work never takes nationality as an input.
 */
import type { Agent, AgentDraft } from './types'

const SAMPLE_URL_PREFIX = 'https://app.glean.com/chat/agents/sample-'

/** A clearly fake Glean link for a sample agent. */
export const sampleUrl = (slug: string): string => `${SAMPLE_URL_PREFIX}${slug}`

/**
 * True for a sample link, whatever the agent's status: an agent moved to Pilot or Live that still
 * carries its sample link must not look like it opens a real agent.
 */
export const isSampleUrl = (url: string | null | undefined): boolean =>
  !!url &&
  url
    .trim()
    .toLowerCase()
    .replace(/^http:/, 'https:')
    .startsWith(SAMPLE_URL_PREFIX)

const agent = (id: string, a: Omit<AgentDraft, 'status' | 'url'>): Agent => ({
  id,
  status: 'Sample',
  url: sampleUrl(id),
  ...a,
})

export const SAMPLE_AGENTS: readonly Agent[] = [
  /* ───────── Recruiting ───────── */
  agent('job-description-writer', {
    name: 'Job description writer',
    area: 'recruiting',
    audience: ['hr', 'managers'],
    description:
      "Drafts a job description from the job architecture, the level guide and the hiring manager's notes.",
    useFor: [
      'A first draft for a new or refreshed requisition',
      'Rewriting an old posting in plain language',
      'Checking that the requirements match the level',
    ],
    dontUseFor: [
      'Not for setting the level or the pay range. Those come from the job architecture and Compensation.',
    ],
    examplePrompts: [
      'Draft a job description for an L4 design verification engineer in Austin from these notes: ...',
      'Rewrite this posting in plain language and keep it under 450 words.',
    ],
    dataSources: ['Job architecture', 'Level guide', 'Posting templates'],
    ownerTeam: 'Talent acquisition',
  }),
  agent('interview-kit-builder', {
    name: 'Interview kit builder',
    area: 'recruiting',
    audience: ['hr', 'managers'],
    description:
      'Builds a structured interview plan for one requisition: competencies per interviewer, questions and a scoring guide.',
    useFor: [
      'Splitting competencies across the panel so nobody repeats a question',
      'Behavioral and technical questions with what a strong answer looks like',
      'A scorecard that matches the plan',
    ],
    dontUseFor: [
      'Not for screening or ranking candidates. It prepares the panel and does not judge people.',
      'Only job-related questions. Never age, family, health, nationality or other protected topics.',
    ],
    examplePrompts: [
      'Build a four-person interview loop for REQ-4413 with one competency per interviewer.',
      'Write three behavioral questions on cross-team debugging, with a scoring guide.',
    ],
    dataSources: ['Greenhouse', 'Competency library', 'Interview training guide'],
    ownerTeam: 'Talent acquisition',
  }),
  agent('candidate-scorecard-summary', {
    name: 'Candidate scorecard summary',
    area: 'recruiting',
    audience: ['hr', 'managers'],
    description:
      "Summarizes a candidate's submitted scorecards into strengths, concerns and open questions for the debrief.",
    useFor: [
      'Preparing the hiring manager for a debrief',
      'Seeing where the panel disagrees',
      'Listing the scorecards that are still missing',
    ],
    dontUseFor: [
      'Not for hiring decisions or ranking candidates. It summarizes what the panel wrote, and the panel decides.',
    ],
    examplePrompts: [
      'Summarize the scorecards for CAN-500001 on REQ-4413 and list where interviewers disagree.',
      'Which interviewers have not submitted scorecards for REQ-4413?',
    ],
    dataSources: ['Greenhouse scorecards'],
    ownerTeam: 'Talent acquisition',
  }),
  agent('offer-justification-prep', {
    name: 'Offer justification prep',
    area: 'recruiting',
    audience: ['hr'],
    description:
      'Drafts the approval note for an offer from the approved range, the level and the offer guidelines.',
    useFor: [
      'The approval note for an offer above the range midpoint',
      'Listing the facts the approver will ask for',
      'Checking the note against the offer guidelines',
    ],
    dontUseFor: [
      'Not for choosing the offer amount. The recruiter and Compensation set it within the approved range.',
    ],
    examplePrompts: [
      'Draft an approval note for an offer at the 75th percentile of the L3 range for REQ-4425.',
      'What do the offer guidelines say about sign-on bonuses for new graduates?',
    ],
    dataSources: ['Greenhouse offers', 'Offer guidelines', 'Salary ranges'],
    ownerTeam: 'Talent acquisition',
  }),

  /* ───────── Onboarding ───────── */
  agent('new-hire-guide', {
    name: 'New hire guide',
    area: 'onboarding',
    audience: ['managers', 'employees'],
    description:
      "Answers a new hire's first-week questions from the onboarding pages, the benefits guide and the site guides.",
    useFor: [
      'Where to go on day one, badges and parking at each site',
      'Benefits enrollment deadlines and how to enroll',
      'Required training in the first 30 days',
    ],
    dontUseFor: ["Not for questions about one person's pay, visa or case. It points those to HR ops."],
    examplePrompts: [
      'What do I need to bring on my first day at the Hsinchu site?',
      'When is my benefits enrollment deadline if I started on 6 Oct?',
    ],
    dataSources: ['Onboarding pages', 'Benefits guide', 'Site guides'],
    ownerTeam: 'People operations',
  }),
  agent('start-readiness-checker', {
    name: 'Start readiness checker',
    area: 'onboarding',
    audience: ['hr'],
    description:
      "Checks a new hire's start tasks before day one: signed offer, background check, equipment, accounts and required reviews.",
    useFor: [
      'New hires starting in the next 14 days with open tasks',
      'Who owns each open task',
      'A note to the hiring manager on what is still open',
    ],
    dontUseFor: ['Not for confirming a start date. HR ops and the task owners confirm readiness.'],
    examplePrompts: [
      'Which new hires starting in the next 14 days still have open start tasks?',
      'Draft a note to the hiring manager of E10599 listing what is still open.',
    ],
    dataSources: ['HRIS', 'Onboarding task tracker', 'IT provisioning tickets'],
    ownerTeam: 'People operations',
  }),

  /* ───────── People stats (HRBP work) ───────── */
  agent('leader-1-1-prep', {
    name: 'Leader 1:1 prep',
    area: 'hrbp',
    audience: ['hr'],
    description:
      "Pulls a leader's team facts into a one-page brief for a 1:1: headcount, open roles, exits, promotions and case counts.",
    useFor: [
      'A brief before a monthly leader 1:1',
      "Questions to ask about a team's open roles and exits",
      'Follow-ups carried over from the last 1:1',
    ],
    dontUseFor: [
      "Not for judging one person's performance or potential. Calibration decides ratings.",
      'Counts only for employee relations. Never paste case details into it.',
    ],
    examplePrompts: [
      'Prepare a 1:1 brief for the VP of Operations for October.',
      "What changed in this leader's team since last quarter?",
    ],
    dataSources: ['HRIS', 'Census exports', 'Greenhouse'],
    ownerTeam: 'HRBP team',
  }),
  agent('reorg-impact-brief', {
    name: 'Reorg impact brief',
    area: 'hrbp',
    audience: ['hr'],
    description:
      'Summarizes what a proposed reorganization changes: spans, layers, managers gaining or losing reports, and moves that need consultation.',
    useFor: [
      'A first read of a scenario exported from the Org chart sandbox',
      'Countries where moves need consultation or notice steps',
      'A plain summary for the leader',
    ],
    dontUseFor: [
      'Not for choosing who moves or who is affected by a reduction. Leaders and HR decide with Legal.',
    ],
    examplePrompts: [
      'Summarize the impact of this reorg scenario file on spans and layers.',
      'Which moves in this scenario are in countries that need consultation before an announcement?',
    ],
    dataSources: ['Org chart sandbox export', 'HRIS', 'Country policy pages'],
    ownerTeam: 'HRBP team',
  }),
  agent('policy-answers-by-country', {
    name: 'Policy answers by country',
    area: 'hrbp',
    audience: ['hr', 'managers'],
    description:
      'Answers policy questions for one country from the published policy pages and links the source.',
    useFor: [
      'Leave, notice and working time rules by country',
      'Comparing a policy across two sites',
      'Finding the policy owner',
    ],
    dontUseFor: ['Not legal advice. Check edge cases with Employment law before you act.'],
    examplePrompts: [
      'What is the resignation notice period in Taiwan for an employee with 3 years of service?',
      'Compare parental leave in Germany and Israel.',
    ],
    dataSources: ['Policy pages', 'Country handbooks'],
    ownerTeam: 'HR policy',
  }),

  /* ───────── HR ops ───────── */
  agent('hr-help-desk-triage', {
    name: 'HR help desk triage',
    area: 'services',
    audience: ['hr'],
    description:
      'Reads a new HR case, suggests its category, priority and team from the Hire-to-Retire Atlas, and drafts a first reply.',
    useFor: [
      'Routing new cases to the right queue',
      'A first reply that names the next step and the service level',
      'Spotting duplicate cases from the same employee',
    ],
    dontUseFor: ['Not for employee relations or investigation cases. Those go straight to the ER team.'],
    examplePrompts: [
      'Suggest the category and priority for this case and draft a first reply: ...',
      'Which Atlas process covers a payroll address change?',
    ],
    dataSources: ['HR case system', 'Hire-to-Retire Atlas', 'Knowledge base'],
    ownerTeam: 'HR ops',
  }),
  agent('leave-and-benefits-navigator', {
    name: 'Leave and benefits navigator',
    area: 'services',
    audience: ['hr', 'managers', 'employees'],
    description:
      'Explains leave types and benefits for a country and plan, with the steps and forms to start.',
    useFor: [
      'Explaining leave options before a manager conversation',
      'Steps and forms to start a leave',
      'Benefit plan basics by country',
    ],
    dontUseFor: [
      'Not for approving leave or deciding eligibility. The leave team and the plan provider decide.',
    ],
    examplePrompts: [
      'What leave can an employee in Austin take to care for a parent, and how do they start it?',
      'Explain the medical plan options in Bengaluru.',
    ],
    dataSources: ['Benefits guides', 'Leave policy pages', 'Plan documents'],
    ownerTeam: 'Benefits',
  }),
  agent('employment-verification-drafter', {
    name: 'Employment verification drafter',
    area: 'services',
    audience: ['hr'],
    description: 'Drafts an employment verification letter from the HRIS on the approved template.',
    useFor: [
      'Verification letters for loans, rentals and visas',
      'Confirming dates of employment and job title',
    ],
    dontUseFor: [
      "No pay in a letter without the employee's written consent on the case.",
      'Only for the requester named on the case.',
    ],
    examplePrompts: ['Draft an employment verification letter for case HR-100001 on the standard template.'],
    dataSources: ['HRIS', 'Letter templates'],
    ownerTeam: 'HR ops',
  }),

  /* ───────── Talent ───────── */
  agent('review-writing-coach', {
    name: 'Review writing coach',
    area: 'talent',
    audience: ['managers'],
    description: 'Helps a manager turn notes into a clear, specific performance review that cites examples.',
    useFor: [
      'Turning bullet notes into a review draft',
      'Making feedback specific and tied to goals',
      'Checking for vague or loaded wording',
    ],
    dontUseFor: [
      'Not for choosing a rating. The manager rates and calibration confirms.',
      "Never paste another employee's review into it.",
    ],
    examplePrompts: [
      'Turn these notes into a review draft focused on impact and growth areas: ...',
      'Point out vague phrases in this draft and suggest specific ones.',
    ],
    dataSources: ['Review guide', 'Competency library'],
    ownerTeam: 'Talent management',
  }),
  agent('calibration-brief', {
    name: 'Calibration brief',
    area: 'talent',
    audience: ['hr'],
    description:
      "Prepares pre-reading for one org's calibration: rating distribution against the guideline, movers since last cycle and questions for the room.",
    useFor: [
      'Pre-reading for a calibration session',
      'Comparing the distribution with the rating guideline',
      'Ratings that moved 2 or more steps since last cycle',
    ],
    dontUseFor: [
      'Not for setting or changing ratings. The calibration group decides.',
      'No distributions for groups under 5 people.',
    ],
    examplePrompts: [
      'Prepare a calibration brief for the Design Engineering org for the 2026 cycle.',
      'Which ratings in this org moved 2 or more steps since last cycle?',
    ],
    dataSources: ['Reviews', 'Rating guideline', 'Census exports'],
    ownerTeam: 'Talent management',
  }),
  agent('career-path-explorer', {
    name: 'Career path explorer',
    area: 'talent',
    audience: ['managers', 'employees'],
    description:
      'Shows the common moves from a job and level, the skills each move needs, and open roles that fit.',
    useFor: [
      'Career conversations between a manager and an employee',
      'Seeing which moves people made from a job',
      'Finding internal openings to apply for',
    ],
    dontUseFor: ['Not a promise of a promotion or a move. It shows paths, and the hiring manager decides.'],
    examplePrompts: [
      'What moves do people usually make from L3 process engineer?',
      'Which open roles fit someone with 4 years in yield engineering?',
    ],
    dataSources: ['Job architecture', 'Career lattice', 'Internal job board'],
    ownerTeam: 'Talent management',
  }),
  agent('learning-recommender', {
    name: 'Learning recommender',
    area: 'talent',
    audience: ['managers', 'employees'],
    description:
      'Suggests courses and programs for a skill goal from the learning catalog, with the time each takes.',
    useFor: [
      'Building a development plan',
      'Finding required compliance training',
      'Programs for new managers',
    ],
    dontUseFor: ['Not for assigning required training. The learning team sets requirements.'],
    examplePrompts: [
      'Suggest courses to build statistical process control skills, 10 hours or less in total.',
      'What should a first-time manager complete in the first 90 days?',
    ],
    dataSources: ['Learning catalog', 'Skills library'],
    ownerTeam: 'Learning',
  }),

  /* ───────── Compensation ───────── */
  agent('pay-range-explainer', {
    name: 'Pay range explainer',
    area: 'comp',
    audience: ['hr', 'managers'],
    description:
      'Explains how salary ranges, levels and compa-ratio work, from the published compensation guide.',
    useFor: [
      'Explaining range position to a manager',
      'How a promotion changes the range',
      'What compa-ratio and range penetration mean',
    ],
    dontUseFor: ["Not for deciding anyone's pay or looking up a person's salary. It explains the rules."],
    examplePrompts: [
      'Explain compa-ratio and range penetration to a new manager in 5 sentences.',
      'How does a promotion from L3 to L4 change where someone sits in the range?',
    ],
    dataSources: ['Compensation guide', 'Salary structure'],
    ownerTeam: 'Total rewards',
  }),
  agent('merit-guideline-checker', {
    name: 'Merit guideline checker',
    area: 'comp',
    audience: ['hr', 'managers'],
    description:
      "Compares a manager's proposed merit increases with the guideline by rating and the budget, and lists the ones to review.",
    useFor: [
      'A check before submitting merit proposals',
      'Increases outside the guideline for their rating',
      'Budget used against the merit budget %',
    ],
    dontUseFor: ['Not for setting increases. Managers propose and Compensation approves.'],
    examplePrompts: [
      "Check my team's merit proposals against the guideline and list the ones outside it.",
      'How much of the 3.5% merit budget do these proposals use?',
    ],
    dataSources: ['Merit worksheet', 'Merit guideline'],
    ownerTeam: 'Total rewards',
  }),

  /* ───────── Compliance ───────── */
  agent('export-control-screening-guide', {
    name: 'Export control screening guide',
    area: 'compliance',
    audience: ['hr'],
    description:
      'Walks HR through the export control process for a hire or transfer: when a review is needed, which form, who signs and the usual lead time.',
    useFor: [
      'Knowing when a role needs a review',
      'The forms and the order of the steps',
      'Lead times to plan a start date',
    ],
    dontUseFor: [
      'Process steps only. Never decides eligibility and never takes nationality as an input. Trade compliance makes every determination.',
      'Never enter citizenship, passport or visa details.',
    ],
    examplePrompts: [
      'What are the steps for an export control review before a new hire starts in a controlled lab?',
      'Which form starts a review for an internal transfer?',
    ],
    dataSources: ['Export control procedure', 'Trade compliance pages'],
    ownerTeam: 'Trade compliance',
  }),

  /* ───────── People ops ───────── */
  agent('process-finder', {
    name: 'Process finder',
    area: 'peopleops',
    audience: ['hr', 'managers'],
    description:
      'Finds the right process in the Hire-to-Retire Atlas, with its owner, its service level and the form that starts it.',
    useFor: [
      'The process ID and owner for a request',
      'Service levels to quote to a manager',
      'The form or system that starts a process',
    ],
    dontUseFor: ['Not for doing the process. It points to the process and its owner.'],
    examplePrompts: [
      'Which process covers a change of manager, and what is its service level?',
      'Where do I start a relocation request?',
    ],
    dataSources: ['Hire-to-Retire Atlas'],
    ownerTeam: 'People operations',
  }),
]
