/**
 * The AI agent catalog: the Glean agents the HR team can use, organized by HR area. Pure types and
 * vocabularies (no React), shared by the view, the persistence layer and the Excel round trip.
 */

/** HR areas, in the order the view lists them. Internal keys stay stable when labels change. */
export const AGENT_AREAS = [
  'recruiting',
  'onboarding',
  'hrbp',
  'services',
  'talent',
  'comp',
  'compliance',
  'peopleops',
] as const
export type AgentArea = (typeof AGENT_AREAS)[number]

export const AREA_LABEL: Record<AgentArea, string> = {
  recruiting: 'Recruiting',
  onboarding: 'Onboarding',
  hrbp: 'People stats',
  services: 'HR ops',
  talent: 'Talent',
  comp: 'Compensation',
  compliance: 'Compliance',
  peopleops: 'People ops',
}

export const AGENT_AUDIENCES = ['hr', 'managers', 'employees'] as const
export type AgentAudience = (typeof AGENT_AUDIENCES)[number]

export const AUDIENCE_LABEL: Record<AgentAudience, string> = {
  hr: 'HR team',
  managers: 'Managers',
  employees: 'Employees',
}

export const AGENT_STATUSES = ['Sample', 'Pilot', 'Live'] as const
export type AgentStatus = (typeof AGENT_STATUSES)[number]

/** One Glean agent as the catalog lists it. */
export interface Agent {
  /** Stable internal id (React keys, edits). Not shown and not exported. */
  id: string
  name: string
  area: AgentArea
  audience: AgentAudience[]
  status: AgentStatus
  /** One sentence: what the agent does. */
  description: string
  /** "Use it for": 2-4 short bullets. */
  useFor: string[]
  /** "Don't use it for": 1-2 guardrails. */
  dontUseFor: string[]
  /** Example prompts, each with a Copy button. */
  examplePrompts: string[]
  /** The data the agent draws on (Greenhouse, the HRIS, policy pages). */
  dataSources: string[]
  ownerTeam: string
  /** "Open in Glean" link; http or https only, empty when there is none yet. */
  url: string
}

/** The fields a person edits (everything but the id). */
export type AgentDraft = Omit<Agent, 'id'>

export const isAgentArea = (v: unknown): v is AgentArea => AGENT_AREAS.includes(v as AgentArea)
export const isAgentAudience = (v: unknown): v is AgentAudience =>
  AGENT_AUDIENCES.includes(v as AgentAudience)
export const isAgentStatus = (v: unknown): v is AgentStatus => AGENT_STATUSES.includes(v as AgentStatus)
