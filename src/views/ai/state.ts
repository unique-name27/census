/**
 * Live state for the AI in HR view: the catalog (kept in this browser) and the list filters
 * (kept for this visit, so the header links from other views can open the list filtered).
 */
import { create } from 'zustand'
import {
  type Agent,
  type AgentArea,
  type AgentDraft,
  type AgentFilters,
  clearCatalog,
  dedupeAgents,
  loadCatalog,
  NO_FILTERS,
  STORAGE_KEY,
  sampleCatalog,
  saveCatalog,
  tidyDraft,
  uniqueId,
} from './catalog'

interface AiState {
  agents: Agent[]
  /** Nothing saved: the catalog is the shipped sample. */
  isDefault: boolean
  /** The last save reached this browser's storage (false: changes last for this visit only). */
  persisted: boolean
  filters: AgentFilters

  setFilters: (patch: Partial<AgentFilters>) => void
  clearFilters: () => void
  /** Show only these areas, with every other filter cleared (header links, area counts). */
  showAreas: (areas: AgentArea[]) => void

  addAgent: (draft: AgentDraft) => Agent
  updateAgent: (id: string, draft: AgentDraft) => void
  /** Remove an agent; returns it and its position so it can be put back. */
  removeAgent: (id: string) => { agent: Agent; index: number } | null
  restoreAgent: (agent: Agent, index: number) => void
  /** Replace the whole catalog (an import); returns the previous one for undo. */
  replaceAll: (agents: readonly Agent[]) => { agents: Agent[]; isDefault: boolean }
  /** Put back a catalog that `replaceAll` or `resetToSample` returned. */
  restoreCatalog: (prev: { agents: Agent[]; isDefault: boolean }) => void
  resetToSample: () => { agents: Agent[]; isDefault: boolean }
  /** Re-read storage (another tab changed the catalog). */
  reload: () => void
}

const initial = loadCatalog()

export const useAiAgents = create<AiState>((set, get) => {
  const commit = (agents: Agent[]) => {
    const persisted = saveCatalog(agents)
    set({ agents, isDefault: false, persisted })
  }
  return {
    agents: initial.agents,
    isDefault: initial.isDefault,
    persisted: true,
    filters: NO_FILTERS,

    setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
    clearFilters: () => set({ filters: NO_FILTERS }),
    showAreas: (areas) => set({ filters: { ...NO_FILTERS, areas: [...areas] } }),

    addAgent(draft) {
      const { agents } = get()
      const agent: Agent = {
        id: uniqueId(
          draft.name,
          agents.map((a) => a.id),
        ),
        ...tidyDraft(draft),
      }
      commit([...agents, agent])
      return agent
    },
    updateAgent(id, draft) {
      commit(get().agents.map((a) => (a.id === id ? { id, ...tidyDraft(draft) } : a)))
    },
    removeAgent(id) {
      const { agents } = get()
      const index = agents.findIndex((a) => a.id === id)
      if (index < 0) return null
      commit(agents.filter((a) => a.id !== id))
      return { agent: agents[index], index }
    },
    restoreAgent(agent, index) {
      const agents = get().agents.filter((a) => a.id !== agent.id)
      agents.splice(Math.min(index, agents.length), 0, agent)
      commit(dedupeAgents(agents))
    },
    replaceAll(next) {
      const { agents, isDefault } = get()
      commit(dedupeAgents(next))
      return { agents, isDefault }
    },
    restoreCatalog(prev) {
      if (prev.isDefault) {
        clearCatalog()
        set({ agents: prev.agents, isDefault: true, persisted: true })
      } else commit(prev.agents)
    },
    resetToSample() {
      const { agents, isDefault } = get()
      clearCatalog()
      set({ agents: sampleCatalog(), isDefault: true, persisted: true })
      return { agents, isDefault }
    },
    reload() {
      const next = loadCatalog()
      set({ agents: next.agents, isDefault: next.isDefault })
    },
  }
})

// Another open Census tab saved or reset the catalog: follow it, so one tab never undoes another.
if (typeof window !== 'undefined') {
  try {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY || e.key === null) useAiAgents.getState().reload()
    })
  } catch {
    /* no storage events here: the catalog refreshes on the next load */
  }
}
