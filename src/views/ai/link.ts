/**
 * The quiet "AI agents for Recruiting (4)" line in other views' headers: which areas a view links
 * to, and opening the AI in HR tab filtered to them. The areas travel in the address
 * (`#ai.agents:compliance`); a plain visit (the folder tab) shows every area again.
 */
import { useEffect } from 'react'
import { goTo, routeHash } from '@/components/navigation'
import { useRouteShown } from '@/components/RouteLink'
import { useCensus } from '@/data/store'
import { type AgentArea, type AgentLink, agentLinkFor, agentsTab, areasOfTab } from './catalog'
import { useAiAgents } from './state'

export const AI_AGENTS_HASH = routeHash('ai', 'agents')

/** The address of the AI in HR tab filtered to these areas. */
export const agentsHash = (areas: readonly AgentArea[]): string => routeHash('ai', agentsTab(areas))

/** The header link for a view, live with the catalog; null when there is nothing to link to. */
export function useAgentLink(view: string): AgentLink | null {
  const agents = useAiAgents((s) => s.agents)
  // No link where the mode hides AI in HR (Manager mode).
  const shown = useRouteShown('ai')
  return shown ? agentLinkFor(view, agents) : null
}

/** Open the AI in HR tab showing only these areas (other filters cleared). */
export function openAgents(areas: readonly AgentArea[]): void {
  useAiAgents.getState().showAreas([...areas])
  goTo('ai', agentsTab(areas))
}

/**
 * Follow the address on the AI in HR tab: the areas it names (a header link, a shared link, Back
 * or Forward), or none on a plain visit, so an area filter a link set does not linger.
 */
export function useAreasFromRoute(): void {
  const tab = useCensus((s) => (s.route.view === 'ai' ? s.route.tab : null))
  useEffect(() => {
    if (tab == null) return
    const areas = areasOfTab(tab)
    const { filters, showAreas, setFilters } = useAiAgents.getState()
    if (areas.length) {
      const same = areas.length === filters.areas.length && areas.every((a) => filters.areas.includes(a))
      if (!same) showAreas(areas)
    } else if (filters.areas.length) setFilters({ areas: [] })
  }, [tab])
}
