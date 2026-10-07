/**
 * The AI in HR charts (catalog/charts.ts): each count recounts from the catalog, and the list
 * filter a mark sets shows exactly the agents the mark counts.
 */
import { describe, expect, it } from 'vitest'
import { decide } from '@/access/policy'
import { CATALOG } from '@/metrics/catalog'
import { M } from '../metrics'
import { coverage, drawsOn, sourceCounts, sourceKey } from './charts'
import { filterAgents, hasFilters, NO_FILTERS } from './filter'
import { sampleCatalog } from './storage'
import { AGENT_AREAS, AGENT_AUDIENCES, type Agent } from './types'

const agent = (id: string, p: Partial<Agent>): Agent => ({
  id,
  name: id,
  area: 'recruiting',
  audience: ['hr'],
  status: 'Sample',
  description: '',
  useFor: [],
  dontUseFor: [],
  examplePrompts: [],
  dataSources: [],
  ownerTeam: 'Talent acquisition',
  url: '',
  ...p,
})

describe('agents by HR area and audience', () => {
  it('has a cell for every area and audience, counting agents for several audiences in each', () => {
    const agents = [
      agent('a', { area: 'recruiting', audience: ['hr', 'managers'] }),
      agent('b', { area: 'recruiting', audience: ['hr'] }),
      agent('c', { area: 'comp', audience: ['employees'] }),
    ]
    const cells = coverage(agents)
    expect(cells).toHaveLength(AGENT_AREAS.length * AGENT_AUDIENCES.length)
    const at = (area: string, audience: string) =>
      cells.find((c) => c.area === area && c.audience === audience)?.agents
    expect(at('recruiting', 'hr')).toBe(2)
    expect(at('recruiting', 'managers')).toBe(1)
    expect(at('comp', 'employees')).toBe(1)
    expect(at('compliance', 'managers')).toBe(0)
  })

  it('narrows the list to exactly the agents of a cell', () => {
    const agents = sampleCatalog()
    for (const c of coverage(agents)) {
      const shown = filterAgents(agents, { ...NO_FILTERS, areas: [c.area], audiences: [c.audience] })
      expect(shown.map((a) => a.id).sort(), `${c.area} ${c.audience}`).toEqual([...c.ids].sort())
      expect(shown).toHaveLength(c.agents)
    }
  })
})

describe('data sources agents draw on', () => {
  const agents = [
    agent('a', { area: 'recruiting', dataSources: ['Greenhouse', 'Level guide'] }),
    agent('b', { area: 'onboarding', dataSources: ['greenhouse ', 'Benefits guide'] }),
    agent('c', { area: 'comp', dataSources: ['Salary ranges', 'Level  guide'] }),
  ]

  it('matches sources regardless of case and spacing, most agents first', () => {
    const rows = sourceCounts(agents)
    expect(rows.map((r) => [r.source, r.agents, r.areas])).toEqual([
      ['Greenhouse', 2, 'Recruiting, Onboarding'],
      ['Level guide', 2, 'Recruiting, Compensation'],
      ['Benefits guide', 1, 'Onboarding'],
      ['Salary ranges', 1, 'Compensation'],
    ])
    expect(sourceKey(' Level  Guide ')).toBe('level guide')
  })

  it('treats a plural spelling as the same source, and keeps acronyms', () => {
    expect(sourceKey('Benefits guides')).toBe(sourceKey('Benefits guide'))
    expect(sourceKey('Leave policies')).toBe('leave policy')
    expect(sourceKey('HRIS')).toBe('hris')
    expect(sourceKey('Job status')).toBe('job status')
    const rows = sourceCounts([
      agent('a', { dataSources: ['Benefits guide'] }),
      agent('b', { dataSources: ['Benefits guides', 'HRIS'] }),
      agent('c', { dataSources: ['HRIS'] }),
    ])
    expect(rows.map((r) => [r.source, r.agents])).toEqual([
      ['Benefits guide', 2],
      ['HRIS', 2],
    ])
  })

  it('keeps only the sources enough agents share', () => {
    expect(sourceCounts(agents, undefined, 2).map((r) => r.source)).toEqual(['Greenhouse', 'Level guide'])
  })

  it('folds the rest into Other, counting each agent once', () => {
    const rows = sourceCounts(agents, 1)
    expect(rows.map((r) => [r.source, r.agents])).toEqual([
      ['Greenhouse', 2],
      ['Other (3)', 3],
    ])
  })

  it('narrows the list to exactly the agents of a bar, the sample included', () => {
    const sample = sampleCatalog()
    for (const r of sourceCounts(sample, 8)) {
      const f = { ...NO_FILTERS, sources: r.keys }
      expect(hasFilters(f)).toBe(true)
      const shown = filterAgents(sample, f)
      expect(shown.map((a) => a.id).sort(), r.source).toEqual([...r.ids].sort())
      expect(shown.every((a) => drawsOn(a, r.keys))).toBe(true)
    }
    expect(hasFilters({ ...NO_FILTERS, sources: [] })).toBe(false)
  })
})

describe('access', () => {
  it('registers the AI metrics and hides them, and the figures, in Manager mode', () => {
    const views = (id: string) => CATALOG.byId.get(id)?.views
    for (const id of Object.values(M)) {
      expect(CATALOG.byId.get(id)?.views, id).toEqual(['ai'])
      expect(decide('manager', `metric:${id}`, undefined, { metricViews: views }).access, id).toBe('hidden')
      expect(decide('hr', `metric:${id}`).access, id).toBe('shown')
    }
    for (const id of ['ai-agent-coverage', 'ai-agent-sources'])
      expect(decide('manager', `figure:${id}`).access, id).toBe('hidden')
  })
})
