/**
 * The rows behind the AI in HR charts (docs/CHARTS.md, AI in HR): agents by HR area and audience,
 * and the data sources agents draw on. Counted from the catalog kept in this browser; no people
 * data, so nothing is suppressed. Pure.
 */
import {
  AGENT_AREAS,
  AGENT_AUDIENCES,
  type Agent,
  type AgentArea,
  type AgentAudience,
  AREA_LABEL,
  AUDIENCE_LABEL,
} from './types'

/* ───────────── agents by area and audience ───────────── */

export interface CoverageCell {
  area: AgentArea
  areaLabel: string
  audience: AgentAudience
  audienceLabel: string
  /** Agents in the area that serve the audience. */
  agents: number
  ids: string[]
}

/** Every HR area by every audience, in catalog order, with the agents in each (0 for a gap). */
export function coverage(agents: readonly Agent[]): CoverageCell[] {
  return AGENT_AREAS.flatMap((area) =>
    AGENT_AUDIENCES.map((audience) => {
      const ids = agents.filter((a) => a.area === area && a.audience.includes(audience)).map((a) => a.id)
      return {
        area,
        areaLabel: AREA_LABEL[area],
        audience,
        audienceLabel: AUDIENCE_LABEL[audience],
        agents: ids.length,
        ids,
      }
    }),
  )
}

/* ───────────── data sources ───────────── */

/** A plural last word in its singular ("guides" to "guide", "policies" to "policy"); acronyms ("HRIS") as they are. */
function singular(word: string): string {
  if (word.length < 4 || word === word.toUpperCase() || /(ss|us|is)$/i.test(word)) return word
  if (/ies$/i.test(word)) return `${word.slice(0, -3)}y`
  return /s$/i.test(word) ? word.slice(0, -1) : word
}

/**
 * A source as the catalog compares it: case, spacing and a plural last word folded, so "Benefits
 * guide" and "benefits guides" are one source.
 */
export const sourceKey = (s: string): string => {
  const words = s.trim().replace(/\s+/g, ' ').split(' ')
  const last = words.length - 1
  return words
    .map((w, i) => (i === last ? singular(w) : w))
    .join(' ')
    .toLowerCase()
}

export interface SourceRow {
  /** The source as most agents spell it (the first spelling on a tie). */
  source: string
  /** Folded keys behind the row: one, or every folded source for "Other (k)". */
  keys: string[]
  /** Agents drawing on the source (on any of them, for "Other"), each counted once. */
  agents: number
  /** The HR areas of those agents, in catalog order. */
  areas: string
  ids: string[]
}

/**
 * Data sources by how many agents draw on them, matched with `sourceKey`, most first (then by
 * name). With `minAgents`, only sources that many agents or more draw on; with `top`, sources past
 * it fold into one "Other (k)" row counting each agent once.
 */
export function sourceCounts(agents: readonly Agent[], top?: number, minAgents = 1): SourceRow[] {
  const by = new Map<string, { spellings: Map<string, number>; ids: Set<string> }>()
  for (const a of agents)
    for (const raw of a.dataSources) {
      const key = sourceKey(raw)
      if (!key) continue
      let s = by.get(key)
      if (!s) {
        s = { spellings: new Map(), ids: new Set() }
        by.set(key, s)
      }
      s.ids.add(a.id)
      const spelled = raw.trim().replace(/\s+/g, ' ')
      s.spellings.set(spelled, (s.spellings.get(spelled) ?? 0) + 1)
    }
  const row = (keys: string[], source: string): SourceRow => {
    const ids = new Set(keys.flatMap((k) => [...(by.get(k)?.ids ?? [])]))
    const inAreas = new Set(agents.filter((a) => ids.has(a.id)).map((a) => a.area))
    return {
      source,
      keys,
      agents: ids.size,
      areas: AGENT_AREAS.filter((x) => inAreas.has(x))
        .map((x) => AREA_LABEL[x])
        .join(', '),
      ids: agents.filter((a) => ids.has(a.id)).map((a) => a.id),
    }
  }
  const all = [...by.entries()]
    .map(([key, s]) => {
      const name = [...s.spellings.entries()].sort((x, y) => y[1] - x[1])[0][0]
      return row([key], name)
    })
    .filter((r) => r.agents >= minAgents)
    .sort((a, b) => b.agents - a.agents || a.source.localeCompare(b.source))
  if (top == null || all.length <= top + 1) return all
  const rest = all.slice(top)
  return [
    ...all.slice(0, top),
    row(
      rest.flatMap((r) => r.keys),
      `Other (${rest.length})`,
    ),
  ]
}

/** Whether an agent draws on any of the given (folded) sources. */
export const drawsOn = (a: Pick<Agent, 'dataSources'>, keys: readonly string[]): boolean =>
  !keys.length || a.dataSources.some((s) => keys.includes(sourceKey(s)))
