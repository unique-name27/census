/**
 * Rules every agent in the catalog follows, whether it comes from the sample, an edit, this
 * browser's storage or an imported sheet. Pure.
 */
import { safeHref } from '@/charts/cells'
import {
  AGENT_AUDIENCES,
  type Agent,
  type AgentDraft,
  isAgentArea,
  isAgentAudience,
  isAgentStatus,
} from './types'

export const LIMITS = {
  name: 80,
  description: 300,
  item: 240,
  prompt: 500,
  useFor: 6,
  dontUseFor: 4,
  examplePrompts: 5,
  dataSources: 10,
  ownerTeam: 80,
  url: 2000,
} as const

/**
 * The link when it is safe to open from the catalog: http or https only (a sheet or an edit can
 * carry anything). Reuses the app's `safeHref` and narrows it to web links. Null otherwise.
 */
export function safeAgentUrl(raw: string | null | undefined): string | null {
  const s = safeHref(raw)
  if (!s || s.length > LIMITS.url) return null
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? s : null
  } catch {
    // A relative path is not a Glean link.
    return null
  }
}

/**
 * A typed link made safe: "app.glean.com/chat/agents/x" gets https:// in front, then the same
 * http/https rule applies. Empty input stays empty; anything unsafe is null.
 */
export function normalizeAgentUrl(raw: string): string | null {
  const s = raw.trim()
  if (!s) return ''
  const withScheme =
    /^[a-z][a-z0-9+.-]*:/i.test(s) || !/^[\w-]+(\.[\w-]+)+(?:[/:?#]|$)/.test(s) ? s : `https://${s}`
  return safeAgentUrl(withScheme)
}

/** Kebab-case id from a name, e.g. "Leader 1:1 prep" -> "leader-1-1-prep". */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'agent'
  )
}

/** An id for `name` that no agent in `taken` has. */
export function uniqueId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = slugify(name)
  let id = base
  for (let k = 2; used.has(id); k++) id = `${base}-${k}`
  return id
}

const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

const cleanText = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''

const cleanList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => cleanText(x, maxLen))
        .filter(Boolean)
        .slice(0, maxItems)
    : []

export type DraftErrors = Partial<Record<keyof AgentDraft, string>>

/**
 * What is wrong with a draft, by field, in plain words. `others` are the other agents' names,
 * so names stay unique. Empty when the draft can be saved.
 */
export function draftErrors(d: AgentDraft, others: readonly string[] = []): DraftErrors {
  const e: DraftErrors = {}
  const name = d.name.trim()
  if (!name) e.name = 'Give the agent a name.'
  else if (name.length > LIMITS.name) e.name = `Keep the name under ${LIMITS.name} characters.`
  else if (others.some((o) => nameKey(o) === nameKey(name))) e.name = 'Another agent already has this name.'
  if (!isAgentArea(d.area)) e.area = 'Choose an HR area.'
  if (!d.audience.length || !d.audience.every(isAgentAudience)) e.audience = 'Choose at least one audience.'
  if (!isAgentStatus(d.status)) e.status = 'Choose a status.'
  if (!d.description.trim()) e.description = 'Say in one sentence what the agent does.'
  else if (d.description.trim().length > LIMITS.description)
    e.description = `Keep the description under ${LIMITS.description} characters.`
  if (!d.useFor.some((s) => s.trim())) e.useFor = 'Add at least one use.'
  else if (d.useFor.length > LIMITS.useFor) e.useFor = `List up to ${LIMITS.useFor} uses.`
  if (!d.dontUseFor.some((s) => s.trim()))
    e.dontUseFor = 'Add at least one guardrail, such as "Not for hiring or pay decisions".'
  else if (d.dontUseFor.length > LIMITS.dontUseFor)
    e.dontUseFor = `List up to ${LIMITS.dontUseFor} guardrails.`
  if (d.examplePrompts.length > LIMITS.examplePrompts)
    e.examplePrompts = `List up to ${LIMITS.examplePrompts} prompts.`
  if (d.dataSources.length > LIMITS.dataSources) e.dataSources = `List up to ${LIMITS.dataSources} sources.`
  if (d.ownerTeam.trim().length > LIMITS.ownerTeam)
    e.ownerTeam = `Keep the team name under ${LIMITS.ownerTeam} characters.`
  if (normalizeAgentUrl(d.url) == null) e.url = 'Use a web link that starts with https:// (or http://).'
  return e
}

/** A draft with whitespace tidied and blank list items dropped (what gets saved). */
export function tidyDraft(d: AgentDraft): AgentDraft {
  return {
    name: cleanText(d.name, LIMITS.name),
    area: d.area,
    audience: AGENT_AUDIENCES.filter((a) => d.audience.includes(a)),
    status: d.status,
    description: cleanText(d.description, LIMITS.description),
    useFor: cleanList(d.useFor, LIMITS.useFor, LIMITS.item),
    dontUseFor: cleanList(d.dontUseFor, LIMITS.dontUseFor, LIMITS.item),
    examplePrompts: cleanList(d.examplePrompts, LIMITS.examplePrompts, LIMITS.prompt),
    dataSources: cleanList(d.dataSources, LIMITS.dataSources, LIMITS.item),
    ownerTeam: cleanText(d.ownerTeam, LIMITS.ownerTeam),
    url: normalizeAgentUrl(d.url) ?? '',
  }
}

/**
 * An agent from untrusted JSON (this browser's storage): tidied, with an unsafe link cleared.
 * Null when it cannot be an agent (no name, unknown area, no description, uses or guardrails).
 */
export function normalizeAgent(v: unknown): Agent | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const draft = tidyDraft({
    name: cleanText(o.name, LIMITS.name),
    area: o.area as AgentDraft['area'],
    audience: Array.isArray(o.audience) ? o.audience.filter(isAgentAudience) : [],
    status: isAgentStatus(o.status) ? o.status : 'Sample',
    description: cleanText(o.description, LIMITS.description),
    useFor: cleanList(o.useFor, LIMITS.useFor, LIMITS.item),
    dontUseFor: cleanList(o.dontUseFor, LIMITS.dontUseFor, LIMITS.item),
    examplePrompts: cleanList(o.examplePrompts, LIMITS.examplePrompts, LIMITS.prompt),
    dataSources: cleanList(o.dataSources, LIMITS.dataSources, LIMITS.item),
    ownerTeam: cleanText(o.ownerTeam, LIMITS.ownerTeam),
    url: typeof o.url === 'string' ? o.url : '',
  })
  if (Object.keys(draftErrors(draft)).length) return null
  const id = typeof o.id === 'string' && /^[a-z0-9-]{1,80}$/.test(o.id) ? o.id : slugify(draft.name)
  return { id, ...draft }
}

/**
 * A list of agents with unique ids and unique names (case-insensitive): later duplicates of a
 * name are dropped, a repeated id gets a fresh one.
 */
export function dedupeAgents(agents: readonly Agent[]): Agent[] {
  const names = new Set<string>()
  const ids = new Set<string>()
  const out: Agent[] = []
  for (const a of agents) {
    const k = nameKey(a.name)
    if (names.has(k)) continue
    names.add(k)
    const id = ids.has(a.id) ? uniqueId(a.name, ids) : a.id
    ids.add(id)
    out.push(id === a.id ? a : { ...a, id })
  }
  return out
}

export const toDraft = ({ id: _id, ...rest }: Agent): AgentDraft => ({
  ...rest,
  audience: [...rest.audience],
  useFor: [...rest.useFor],
  dontUseFor: [...rest.dontUseFor],
  examplePrompts: [...rest.examplePrompts],
  dataSources: [...rest.dataSources],
})

export const blankDraft = (area: AgentDraft['area'] = 'recruiting'): AgentDraft => ({
  name: '',
  area,
  audience: ['hr'],
  // Same as an imported row without a status (sheet.ts DEFAULT_STATUS).
  status: 'Pilot',
  description: '',
  useFor: [],
  dontUseFor: ['Not for hiring, rating or pay decisions. It drafts, and people decide.'],
  examplePrompts: [],
  dataSources: [],
  ownerTeam: '',
  url: '',
})
