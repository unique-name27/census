import { describe, expect, it } from 'vitest'
import { SAMPLE_AGENTS } from './sample'
import { AGENT_AREAS, AGENT_AUDIENCES, type Agent } from './types'
import {
  dedupeAgents,
  draftErrors,
  normalizeAgent,
  normalizeAgentUrl,
  safeAgentUrl,
  slugify,
  tidyDraft,
  toDraft,
  uniqueId,
} from './validate'

const allText = (a: Agent) => [
  a.name,
  a.description,
  ...a.useFor,
  ...a.dontUseFor,
  ...a.examplePrompts,
  ...a.dataSources,
  a.ownerTeam,
]

describe('the sample catalog', () => {
  it('has about twenty agents, in every HR area', () => {
    expect(SAMPLE_AGENTS.length).toBeGreaterThanOrEqual(18)
    expect(SAMPLE_AGENTS.length).toBeLessThanOrEqual(22)
    expect(new Set(SAMPLE_AGENTS.map((a) => a.area))).toEqual(new Set(AGENT_AREAS))
  })

  it('gives every agent every field, within the spec ranges', () => {
    for (const a of SAMPLE_AGENTS) {
      expect(a.name.trim(), a.id).not.toBe('')
      expect(AGENT_AREAS, a.name).toContain(a.area)
      expect(a.audience.length, a.name).toBeGreaterThan(0)
      for (const x of a.audience) expect(AGENT_AUDIENCES, a.name).toContain(x)
      expect(a.status, a.name).toBe('Sample')
      expect(a.useFor.length, a.name).toBeGreaterThanOrEqual(2)
      expect(a.useFor.length, a.name).toBeLessThanOrEqual(4)
      expect(a.dontUseFor.length, a.name).toBeGreaterThanOrEqual(1)
      expect(a.dontUseFor.length, a.name).toBeLessThanOrEqual(2)
      expect(a.examplePrompts.length, a.name).toBeGreaterThanOrEqual(1)
      expect(a.examplePrompts.length, a.name).toBeLessThanOrEqual(3)
      expect(a.dataSources.length, a.name).toBeGreaterThan(0)
      expect(a.ownerTeam.trim(), a.name).not.toBe('')
      expect(draftErrors(toDraft(a)), a.name).toEqual({})
      // Already tidy, so saving it unchanged changes nothing (audience in catalog order).
      expect(tidyDraft(toDraft(a)), a.name).toEqual(toDraft(a))
    }
  })

  it('describes each agent in one sentence', () => {
    for (const a of SAMPLE_AGENTS) {
      expect(a.description, a.name).toMatch(/\.$/)
      expect(a.description.slice(0, -1), a.name).not.toMatch(/[.!?]\s/)
    }
  })

  it('has unique names and ids, and ids are the names as slugs', () => {
    expect(new Set(SAMPLE_AGENTS.map((a) => a.name.toLowerCase())).size).toBe(SAMPLE_AGENTS.length)
    expect(new Set(SAMPLE_AGENTS.map((a) => a.id)).size).toBe(SAMPLE_AGENTS.length)
    for (const a of SAMPLE_AGENTS) expect(a.id).toBe(slugify(a.name))
  })

  it('links only to clearly fake https Glean sample links', () => {
    for (const a of SAMPLE_AGENTS) {
      expect(safeAgentUrl(a.url), a.name).toBe(a.url)
      expect(a.url, a.name).toMatch(/^https:\/\/app\.glean\.com\/chat\/agents\/sample-[a-z0-9-]+$/)
    }
  })

  it('follows the copy rules: sentence case, no em dashes, no exclamation marks, straight apostrophes', () => {
    for (const a of SAMPLE_AGENTS) {
      for (const t of allText(a)) {
        expect(t, a.name).not.toMatch(/[—!’]/)
        expect(t, a.name).toBe(t.trim())
      }
      // Sentence case: no capitalized word after the first, apart from proper nouns.
      const rest = a.name.split(' ').slice(1)
      expect(
        rest.filter((w) => /^[A-Z][a-z]/.test(w)),
        a.name,
      ).toEqual([])
    }
  })

  it('keeps people in charge: decisions on hiring, ratings and pay stay with people', () => {
    for (const a of SAMPLE_AGENTS.filter((x) => ['recruiting', 'talent', 'comp'].includes(x.area))) {
      expect(
        a.dontUseFor.some((g) => /decid|decision|rank|choos|setting|sets?\b/i.test(g)),
        a.name,
      ).toBe(true)
    }
  })

  it('never takes nationality as an input to export control work', () => {
    const exportControl = SAMPLE_AGENTS.filter((a) => /export control/i.test(a.name))
    expect(exportControl.length).toBe(1)
    const guard = exportControl[0].dontUseFor.join(' ')
    expect(guard).toMatch(/never takes nationality as an input/i)
    expect(guard).toMatch(/citizenship|passport/i)
    // Nothing in any sample suggests screening people by nationality.
    for (const a of SAMPLE_AGENTS)
      for (const t of [...a.useFor, ...a.examplePrompts]) expect(t, a.name).not.toMatch(/nationalit|citizen/i)
  })
})

describe('validation', () => {
  const base = toDraft(SAMPLE_AGENTS[0])

  it('accepts web links only', () => {
    expect(safeAgentUrl('https://app.glean.com/chat/agents/x')).toBe('https://app.glean.com/chat/agents/x')
    expect(safeAgentUrl('http://intranet.example.com/agent')).toBe('http://intranet.example.com/agent')
    expect(safeAgentUrl('javascript:alert(1)')).toBeNull()
    expect(safeAgentUrl('mailto:hr@example.com')).toBeNull()
    expect(safeAgentUrl('/relative/path')).toBeNull()
    expect(safeAgentUrl('data:text/html,<b>x</b>')).toBeNull()
    expect(safeAgentUrl('')).toBeNull()
  })

  it('adds https:// to a typed host, and keeps an empty link empty', () => {
    expect(normalizeAgentUrl('app.glean.com/chat/agents/x')).toBe('https://app.glean.com/chat/agents/x')
    expect(normalizeAgentUrl('  ')).toBe('')
    expect(normalizeAgentUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeAgentUrl('not a link')).toBeNull()
  })

  it('names what is missing, in plain words', () => {
    const e = draftErrors({
      ...base,
      name: ' ',
      description: '',
      useFor: [],
      dontUseFor: [' '],
      audience: [],
    })
    expect(Object.keys(e).sort()).toEqual(['audience', 'description', 'dontUseFor', 'name', 'useFor'])
    expect(draftErrors({ ...base, url: 'javascript:alert(1)' }).url).toMatch(/https:\/\//)
    expect(draftErrors({ ...base, name: 'interview KIT builder ' }, ['Interview kit builder']).name).toMatch(
      /already/,
    )
  })

  it('tidies whitespace and drops blank list items', () => {
    const t = tidyDraft({ ...base, name: '  Job   description writer ', useFor: ['  a ', '', ' b'] })
    expect(t.name).toBe('Job description writer')
    expect(t.useFor).toEqual(['a', 'b'])
  })

  it('reads stored agents defensively', () => {
    const a = SAMPLE_AGENTS[3]
    expect(normalizeAgent(JSON.parse(JSON.stringify(a)))).toEqual(a)
    expect(normalizeAgent({ ...a, url: 'javascript:alert(1)' })?.url).toBe('')
    expect(normalizeAgent({ ...a, area: 'finance' })).toBeNull()
    expect(normalizeAgent({ ...a, dontUseFor: [] })).toBeNull()
    expect(normalizeAgent({ ...a, id: '<script>' })?.id).toBe(slugify(a.name))
    expect(normalizeAgent(null)).toBeNull()
    expect(normalizeAgent('agent')).toBeNull()
  })

  it('keeps names unique and ids unique', () => {
    const [a, b] = SAMPLE_AGENTS
    const out = dedupeAgents([a, { ...b, id: a.id }, { ...a, id: 'other' }])
    expect(out.map((x) => x.name)).toEqual([a.name, b.name])
    expect(new Set(out.map((x) => x.id)).size).toBe(2)
    expect(uniqueId('Job description writer', ['job-description-writer'])).toBe('job-description-writer-2')
    expect(slugify('Leader 1:1 prep')).toBe('leader-1-1-prep')
    expect(slugify('!!!')).toBe('agent')
  })
})
