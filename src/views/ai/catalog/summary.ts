/**
 * Catalog-level facts: whether it is still the sample, the folder-tab headline, and the quiet
 * "AI agents for <area> (n)" link each view's header shows. Pure.
 */

import type { ViewKey } from '@/data/schema'
import { plural } from '@/lib/format'
import {
  AGENT_AREAS,
  AGENT_AUDIENCES,
  type Agent,
  type AgentArea,
  type AgentAudience,
  AREA_LABEL,
} from './types'

/** The catalog counts as the sample while every agent in it is still a sample. */
export const isSampleCatalog = (agents: readonly Agent[]): boolean =>
  agents.length > 0 && agents.every((a) => a.status === 'Sample')

const AUDIENCE_PHRASE: Record<AgentAudience, string> = {
  hr: 'HR team',
  managers: 'managers',
  employees: 'employees',
}

/** "HR team and managers", "HR team, managers and employees", in catalog order. */
export function audiencePhrase(audience: readonly AgentAudience[]): string {
  const words = AGENT_AUDIENCES.filter((a) => audience.includes(a)).map((a) => AUDIENCE_PHRASE[a])
  return words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

/** Folder-tab headline: the number of agents, "sample agents" while the catalog is the sample. */
export function catalogHeadline(agents: readonly Agent[]): { value: string; label: string } {
  return {
    value: agents.length.toLocaleString('en-US'),
    label: isSampleCatalog(agents) ? 'sample agents' : agents.length === 1 ? 'agent' : 'agents',
  }
}

/** Which HR areas each view's header links to (docs/VIEWS.md, AI in HR). */
export const VIEW_AREAS: Partial<Record<ViewKey, readonly AgentArea[]>> = {
  recruiting: ['recruiting'],
  onboarding: ['onboarding'],
  hrbp: ['hrbp'],
  org: ['hrbp'],
  services: ['services', 'peopleops'],
  talent: ['talent'],
  comp: ['comp'],
  compliance: ['compliance'],
}

export interface AgentLink {
  areas: readonly AgentArea[]
  count: number
  /** "AI agents for Recruiting (4)" */
  text: string
  /** Accessible name: "Open the 4 AI agents for Recruiting" */
  label: string
}

/** The header link for a view; null when the view has no areas or its areas have no agents. */
export function agentLinkFor(view: string, agents: readonly Agent[]): AgentLink | null {
  const areas = VIEW_AREAS[view as ViewKey]
  if (!areas?.length) return null
  const ordered = AGENT_AREAS.filter((a) => areas.includes(a))
  const count = agents.filter((a) => ordered.includes(a.area)).length
  if (!count) return null
  const names = ordered.map((a) => AREA_LABEL[a]).join(' and ')
  return {
    areas: ordered,
    count,
    text: `AI agents for ${names} (${count})`,
    label: `Open the ${plural(count, 'AI agent')} for ${names}`,
  }
}
