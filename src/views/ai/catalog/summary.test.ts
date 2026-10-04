import { describe, expect, it } from 'vitest'
import { SAMPLE_AGENTS } from './sample'
import { agentLinkFor, audiencePhrase, catalogHeadline, isSampleCatalog, VIEW_AREAS } from './summary'
import { AGENT_AREAS } from './types'

describe('catalog headline', () => {
  it('says "sample agents" while every agent is a sample', () => {
    expect(catalogHeadline(SAMPLE_AGENTS)).toEqual({
      value: String(SAMPLE_AGENTS.length),
      label: 'sample agents',
    })
    expect(isSampleCatalog(SAMPLE_AGENTS)).toBe(true)
  })

  it('says "agents" once the team has its own', () => {
    const mixed = [{ ...SAMPLE_AGENTS[0], status: 'Live' as const }, SAMPLE_AGENTS[1]]
    expect(catalogHeadline(mixed)).toEqual({ value: '2', label: 'agents' })
    expect(catalogHeadline([mixed[0]]).label).toBe('agent')
    expect(catalogHeadline([])).toEqual({ value: '0', label: 'agents' })
    expect(isSampleCatalog([])).toBe(false)
  })
})

describe('header links from other views', () => {
  it('maps every data view to known areas', () => {
    for (const areas of Object.values(VIEW_AREAS))
      for (const a of areas ?? []) expect(AGENT_AREAS).toContain(a)
  })

  it('links Recruiting to its four agents', () => {
    expect(agentLinkFor('recruiting', SAMPLE_AGENTS)).toEqual({
      areas: ['recruiting'],
      count: 4,
      text: 'AI agents for Recruiting (4)',
      label: 'Open the 4 AI agents for Recruiting',
    })
  })

  it('links HR ops to HR ops and People ops together', () => {
    const link = agentLinkFor('services', SAMPLE_AGENTS)
    expect(link?.areas).toEqual(['services', 'peopleops'])
    expect(link?.text).toBe('AI agents for HR ops and People ops (4)')
  })

  it('links People stats and the Org chart to the same area', () => {
    expect(agentLinkFor('hrbp', SAMPLE_AGENTS)?.text).toBe('AI agents for People stats (3)')
    expect(agentLinkFor('org', SAMPLE_AGENTS)?.text).toBe('AI agents for People stats (3)')
  })

  it('shows no link for views without areas, or areas without agents', () => {
    expect(agentLinkFor('ai', SAMPLE_AGENTS)).toBeNull()
    expect(agentLinkFor('data', SAMPLE_AGENTS)).toBeNull()
    expect(
      agentLinkFor(
        'comp',
        SAMPLE_AGENTS.filter((a) => a.area !== 'comp'),
      ),
    ).toBeNull()
    expect(agentLinkFor('comp', [SAMPLE_AGENTS.find((a) => a.area === 'comp')!])?.text).toBe(
      'AI agents for Compensation (1)',
    )
  })
})

describe('audiencePhrase', () => {
  it('reads as a phrase in catalog order', () => {
    expect(audiencePhrase(['managers'])).toBe('managers')
    expect(audiencePhrase(['managers', 'hr'])).toBe('HR team and managers')
    expect(audiencePhrase(['employees', 'hr', 'managers'])).toBe('HR team, managers and employees')
    expect(audiencePhrase([])).toBe('')
  })
})
