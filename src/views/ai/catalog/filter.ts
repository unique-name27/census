/**
 * Filtering and grouping the catalog: HR area, audience, status, data source and a search over
 * names, descriptions and use cases. Pure.
 */

import { drawsOn } from './charts'
import {
  AGENT_AREAS,
  type Agent,
  type AgentArea,
  type AgentAudience,
  type AgentStatus,
  AREA_LABEL,
  AUDIENCE_LABEL,
} from './types'

export interface AgentFilters {
  /** Empty means every area. */
  areas: AgentArea[]
  audiences: AgentAudience[]
  statuses: AgentStatus[]
  query: string
  /**
   * Data sources (folded with `sourceKey`), set from the "What agents draw on" chart: an agent
   * passes when it draws on any of them. Absent or empty means every source.
   */
  sources?: string[]
}

export const NO_FILTERS: AgentFilters = { areas: [], audiences: [], statuses: [], query: '' }

export const hasFilters = (f: AgentFilters): boolean =>
  f.areas.length > 0 ||
  f.audiences.length > 0 ||
  f.statuses.length > 0 ||
  f.query.trim() !== '' ||
  (f.sources?.length ?? 0) > 0

/** Lowercase, accents and punctuation folded to spaces, so "1:1" finds "1 1" and "Leader 1:1". */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()

/** The text a search looks through: name, description, uses, guardrails, prompts, area, owner, sources. */
export function searchText(a: Agent): string {
  return fold(
    [
      a.name,
      a.description,
      ...a.useFor,
      ...a.dontUseFor,
      ...a.examplePrompts,
      AREA_LABEL[a.area],
      ...a.audience.map((x) => AUDIENCE_LABEL[x]),
      a.ownerTeam,
      ...a.dataSources,
    ].join(' '),
  )
}

/** A single character only counts as a whole word: the "1" of "1:1" never matches "10 hours". */
const wholeWordOnly = (w: string) => w.length === 1

/**
 * The query matches when it appears as a phrase starting at a word ("leader 1:1", "verif"), or
 * when every word of it starts a word in the agent, in any order ("1 1 leader"). Single
 * characters must be whole words, so "1:1" finds Leader 1:1 prep and not every agent with a 1
 * in a req ID or a duration.
 */
export function matchesQuery(a: Agent, query: string): boolean {
  const q = fold(query)
  if (!q) return true
  const text = ` ${searchText(a)} `
  if (text.includes(` ${q}`)) {
    // The phrase may end mid-word (typing ahead), unless its last word must be whole.
    const last = q.slice(q.lastIndexOf(' ') + 1)
    if (!wholeWordOnly(last) || text.includes(` ${q} `)) return true
  }
  return q.split(' ').every((w) => text.includes(wholeWordOnly(w) ? ` ${w} ` : ` ${w}`))
}

type Facet = 'areas' | 'audiences' | 'statuses'

/** True when the agent passes every filter except `skip` (for facet counts). */
export function matches(a: Agent, f: AgentFilters, skip?: Facet): boolean {
  if (skip !== 'areas' && f.areas.length && !f.areas.includes(a.area)) return false
  if (skip !== 'audiences' && f.audiences.length && !a.audience.some((x) => f.audiences.includes(x)))
    return false
  if (skip !== 'statuses' && f.statuses.length && !f.statuses.includes(a.status)) return false
  if (f.sources?.length && !drawsOn(a, f.sources)) return false
  return matchesQuery(a, f.query)
}

export function filterAgents(agents: readonly Agent[], f: AgentFilters): Agent[] {
  return agents.filter((a) => matches(a, f))
}

export interface AreaGroup {
  area: AgentArea
  label: string
  agents: Agent[]
}

/** Agents grouped by HR area in the catalog's area order; empty areas are left out. */
export function groupByArea(agents: readonly Agent[]): AreaGroup[] {
  return AGENT_AREAS.map((area) => ({
    area,
    label: AREA_LABEL[area],
    agents: agents.filter((a) => a.area === area),
  })).filter((g) => g.agents.length > 0)
}

export interface AreaCount {
  area: AgentArea
  label: string
  /** Agents in the area that pass the other filters (audience, status, search). */
  count: number
  /** All agents in the area. */
  total: number
  selected: boolean
}

/**
 * "Agents by area": every area, with the count the list would show if you picked it. The count
 * ignores the area filter itself, so picking an area shows exactly that many agents.
 */
export function areaCounts(agents: readonly Agent[], f: AgentFilters): AreaCount[] {
  return AGENT_AREAS.map((area) => {
    const inArea = agents.filter((a) => a.area === area)
    return {
      area,
      label: AREA_LABEL[area],
      count: inArea.filter((a) => matches(a, f, 'areas')).length,
      total: inArea.length,
      selected: f.areas.includes(area),
    }
  })
}

/** Counts per option for a facet (audience or status), ignoring that facet's own filter. */
export function facetCounts<K extends 'audiences' | 'statuses'>(
  agents: readonly Agent[],
  f: AgentFilters,
  facet: K,
  values: readonly (K extends 'audiences' ? AgentAudience : AgentStatus)[],
): Map<string, number> {
  const pool = agents.filter((a) => matches(a, f, facet))
  return new Map(
    values.map((v) => [
      v,
      pool.filter((a) => (facet === 'audiences' ? a.audience.includes(v as AgentAudience) : a.status === v))
        .length,
    ]),
  )
}

/** Toggle one area in the filter: picking the only selected area again clears it. */
export function toggleArea(f: AgentFilters, area: AgentArea): AgentFilters {
  if (f.areas.length === 1 && f.areas[0] === area) return { ...f, areas: [] }
  return { ...f, areas: [area] }
}
