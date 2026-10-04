/**
 * The quiet "AI agents for Recruiting (4)" line in other views' headers: which areas a view links
 * to, and opening the AI in HR tab filtered to them.
 */
import { goTo, routeHash } from '@/components/navigation'
import { type AgentArea, type AgentLink, agentLinkFor } from './catalog'
import { useAiAgents } from './state'

export const AI_AGENTS_HASH = routeHash('ai', 'agents')

/** The header link for a view, live with the catalog; null when there is nothing to link to. */
export function useAgentLink(view: string): AgentLink | null {
  const agents = useAiAgents((s) => s.agents)
  return agentLinkFor(view, agents)
}

/** Open the AI in HR tab showing only these areas (other filters cleared). */
export function openAgents(areas: readonly AgentArea[]): void {
  useAiAgents.getState().showAreas([...areas])
  goTo('ai', 'agents')
}
