import { describe, expect, it } from 'vitest'
import {
  type AgentFilters,
  areaCounts,
  facetCounts,
  filterAgents,
  groupByArea,
  hasFilters,
  matchesQuery,
  NO_FILTERS,
  toggleArea,
} from './filter'
import { SAMPLE_AGENTS } from './sample'
import { AGENT_AREAS, AGENT_STATUSES, type Agent } from './types'

const f = (patch: Partial<AgentFilters>): AgentFilters => ({ ...NO_FILTERS, ...patch })
const names = (agents: readonly Agent[]) => agents.map((a) => a.name)
const byName = (name: string) => SAMPLE_AGENTS.find((a) => a.name === name)!

describe('filterAgents', () => {
  it('returns everything with no filters', () => {
    expect(filterAgents(SAMPLE_AGENTS, NO_FILTERS)).toHaveLength(SAMPLE_AGENTS.length)
    expect(hasFilters(NO_FILTERS)).toBe(false)
    expect(hasFilters(f({ query: '  ' }))).toBe(false)
    expect(hasFilters(f({ query: 'offer' }))).toBe(true)
  })

  it('filters by area', () => {
    expect(names(filterAgents(SAMPLE_AGENTS, f({ areas: ['recruiting'] })))).toEqual([
      'Job description writer',
      'Interview kit builder',
      'Candidate scorecard summary',
      'Offer justification prep',
    ])
    expect(filterAgents(SAMPLE_AGENTS, f({ areas: ['services', 'peopleops'] }))).toHaveLength(4)
  })

  it('filters by audience: an agent for several audiences matches any of them', () => {
    const forEmployees = filterAgents(SAMPLE_AGENTS, f({ audiences: ['employees'] }))
    expect(forEmployees.length).toBeGreaterThan(0)
    for (const a of forEmployees) expect(a.audience).toContain('employees')
    expect(names(forEmployees)).toContain('Leave and benefits navigator')
  })

  it('filters by status', () => {
    expect(filterAgents(SAMPLE_AGENTS, f({ statuses: ['Live'] }))).toHaveLength(0)
    const mixed = [...SAMPLE_AGENTS.slice(0, 2), { ...SAMPLE_AGENTS[2], status: 'Live' as const }]
    expect(names(filterAgents(mixed, f({ statuses: ['Live'] })))).toEqual(['Candidate scorecard summary'])
  })

  it('searches names, descriptions, uses and guardrails, every word in any order, ignoring case and punctuation', () => {
    expect(matchesQuery(byName('Leader 1:1 prep'), 'leader 1:1')).toBe(true)
    expect(matchesQuery(byName('Leader 1:1 prep'), '1 1 LEADER')).toBe(true)
    expect(names(filterAgents(SAMPLE_AGENTS, f({ query: 'nationality' })))).toEqual([
      'Interview kit builder',
      'Export control screening guide',
    ])
    expect(names(filterAgents(SAMPLE_AGENTS, f({ query: 'debrief' })))).toEqual([
      'Candidate scorecard summary',
    ])
    expect(names(filterAgents(SAMPLE_AGENTS, f({ query: 'verification letter' })))).toEqual([
      'Employment verification drafter',
    ])
    expect(filterAgents(SAMPLE_AGENTS, f({ query: 'zzz-no-such-agent' }))).toHaveLength(0)
  })

  it('matches words where they start, so short tokens do not match inside other words', () => {
    // "1:1" folds to "1 1": only the agent with a 1:1 in it, not every agent with a 1 in an ID.
    expect(names(filterAgents(SAMPLE_AGENTS, f({ query: '1:1' })))).toEqual(['Leader 1:1 prep'])
    expect(names(filterAgents(SAMPLE_AGENTS, f({ query: '1 1' })))).toEqual(['Leader 1:1 prep'])
    // A word matches at its start (typing ahead), never in the middle of another word.
    expect(names(filterAgents(SAMPLE_AGENTS, f({ query: 'verif' })))).toContain(
      'Employment verification drafter',
    )
    expect(filterAgents(SAMPLE_AGENTS, f({ query: 'ification' }))).toHaveLength(0)
    expect(matchesQuery(byName('Candidate scorecard summary'), 'card')).toBe(false)
    expect(matchesQuery(byName('Candidate scorecard summary'), 'score')).toBe(true)
    // A phrase may end mid-word, and numbers type ahead too.
    expect(matchesQuery(byName('Interview kit builder'), 'req 44')).toBe(true)
    expect(matchesQuery(byName('Interview kit builder'), '4413')).toBe(true)
  })

  it('combines filters', () => {
    const out = filterAgents(
      SAMPLE_AGENTS,
      f({ areas: ['talent'], audiences: ['employees'], query: 'courses' }),
    )
    expect(names(out)).toEqual(['Learning recommender'])
  })
})

describe('agents by area', () => {
  it('groups in area order and leaves out empty areas', () => {
    const groups = groupByArea(filterAgents(SAMPLE_AGENTS, f({ areas: ['comp', 'recruiting'] })))
    expect(groups.map((g) => g.area)).toEqual(['recruiting', 'comp'])
    expect(groups[1].label).toBe('Compensation')
    expect(groupByArea(SAMPLE_AGENTS).map((g) => g.area)).toEqual([...AGENT_AREAS])
  })

  it('counts each area under the other filters, ignoring the area filter itself', () => {
    const all = areaCounts(SAMPLE_AGENTS, NO_FILTERS)
    expect(all.map((c) => c.area)).toEqual([...AGENT_AREAS])
    expect(all.reduce((s, c) => s + c.count, 0)).toBe(SAMPLE_AGENTS.length)
    expect(all.find((c) => c.area === 'recruiting')).toMatchObject({ count: 4, total: 4, selected: false })

    const managers = f({ audiences: ['managers'], areas: ['recruiting'] })
    const counts = areaCounts(SAMPLE_AGENTS, managers)
    for (const c of counts) {
      // Picking the area shows exactly the count it printed.
      const shown = filterAgents(SAMPLE_AGENTS, { ...managers, areas: [c.area] })
      expect(shown.length, c.area).toBe(c.count)
    }
    expect(counts.find((c) => c.area === 'recruiting')?.selected).toBe(true)
  })

  it('counts audiences and statuses ignoring their own filter', () => {
    const statuses = facetCounts(SAMPLE_AGENTS, f({ statuses: ['Live'] }), 'statuses', AGENT_STATUSES)
    expect(statuses.get('Sample')).toBe(SAMPLE_AGENTS.length)
    expect(statuses.get('Live')).toBe(0)
    const audiences = facetCounts(SAMPLE_AGENTS, f({ areas: ['comp'] }), 'audiences', [
      'hr',
      'managers',
      'employees',
    ])
    expect(audiences.get('managers')).toBe(2)
    expect(audiences.get('employees')).toBe(0)
  })

  it('toggles an area: picking the only selected area again clears it', () => {
    const one = toggleArea(NO_FILTERS, 'talent')
    expect(one.areas).toEqual(['talent'])
    expect(toggleArea(one, 'talent').areas).toEqual([])
    expect(toggleArea(f({ areas: ['services', 'peopleops'] }), 'services').areas).toEqual(['services'])
  })
})
