/**
 * The catalog as rows: the columns of the "AI agents" sheet (also the catalog figure's columns),
 * and reading those rows back from a parsed sheet with plain-language issues. Pure.
 */
import {
  AGENT_AREAS,
  AGENT_AUDIENCES,
  AGENT_STATUSES,
  type Agent,
  type AgentArea,
  type AgentAudience,
  type AgentDraft,
  type AgentStatus,
  AREA_LABEL,
  AUDIENCE_LABEL,
} from './types'
import { draftErrors, normalizeAgentUrl, tidyDraft, uniqueId } from './validate'

export const SHEET_NAME = 'AI agents'

/** The status an imported agent gets when its row has none (the Add dialog's default too). */
export const DEFAULT_STATUS: AgentStatus = 'Pilot'

export type SheetKey = keyof AgentDraft

export interface SheetColumn {
  key: SheetKey
  label: string
  /** Width in characters for the sheet and the table. */
  width: number
  /** A list field: one item per line in the sheet. */
  list?: boolean
  required?: boolean
}

export const SHEET_COLUMNS: readonly SheetColumn[] = [
  { key: 'name', label: 'Name', width: 28, required: true },
  { key: 'area', label: 'HR area', width: 16, required: true },
  { key: 'audience', label: 'Audience', width: 18, list: true },
  { key: 'status', label: 'Status', width: 10 },
  { key: 'description', label: 'Description', width: 48, required: true },
  { key: 'useFor', label: 'Use it for', width: 44, list: true },
  { key: 'dontUseFor', label: "Don't use it for", width: 48, list: true },
  { key: 'examplePrompts', label: 'Example prompts', width: 52, list: true },
  { key: 'dataSources', label: 'Data sources', width: 28, list: true },
  { key: 'ownerTeam', label: 'Owner team', width: 20 },
  { key: 'url', label: 'Glean link', width: 44 },
]

export type CatalogRow = Record<SheetKey, string>

/** One agent as sheet cells. Lists are joined with `sep`: a line break in the sheet, "; " in tables. */
export function agentRow(a: Agent, sep = '\n'): CatalogRow {
  return {
    name: a.name,
    area: AREA_LABEL[a.area],
    audience: a.audience.map((x) => AUDIENCE_LABEL[x]).join(sep),
    status: a.status,
    description: a.description,
    useFor: a.useFor.join(sep),
    dontUseFor: a.dontUseFor.join(sep),
    examplePrompts: a.examplePrompts.join(sep),
    dataSources: a.dataSources.join(sep),
    ownerTeam: a.ownerTeam,
    url: a.url,
  }
}

export const catalogRows = (agents: readonly Agent[], sep = '\n'): CatalogRow[] =>
  agents.map((a) => agentRow(a, sep))

/* ───────── reading a sheet back ───────── */

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const HEADER_SYNONYMS: Record<SheetKey, string[]> = {
  name: ['name', 'agent', 'agent name'],
  area: ['hr area', 'area'],
  audience: ['audience', 'audiences', 'for whom'],
  status: ['status'],
  description: ['description', 'what it does'],
  useFor: ['use it for', 'use for', 'uses', 'use cases'],
  dontUseFor: ['dont use it for', 'do not use it for', 'dont use for', 'guardrails', 'not for'],
  examplePrompts: ['example prompts', 'prompts', 'examples'],
  dataSources: ['data sources', 'data', 'sources', 'draws on'],
  ownerTeam: ['owner team', 'owner', 'team'],
  url: ['glean link', 'link', 'url', 'glean url'],
}

const AREA_SYNONYMS: Record<string, AgentArea> = {
  ...Object.fromEntries(AGENT_AREAS.map((a) => [fold(a), a])),
  ...Object.fromEntries(AGENT_AREAS.map((a) => [fold(AREA_LABEL[a]), a])),
  'hr business partners': 'hrbp',
  'hr business partner': 'hrbp',
  hrbps: 'hrbp',
  'employee services': 'services',
  'hr operations': 'services',
  compensation: 'comp',
  'total rewards': 'comp',
  'people operations': 'peopleops',
}

const AUDIENCE_SYNONYMS: Record<string, AgentAudience> = {
  ...Object.fromEntries(AGENT_AUDIENCES.map((a) => [fold(a), a])),
  ...Object.fromEntries(AGENT_AUDIENCES.map((a) => [fold(AUDIENCE_LABEL[a]), a])),
  'hr teams': 'hr',
  'hr staff': 'hr',
  manager: 'managers',
  'people managers': 'managers',
  employee: 'employees',
  'all employees': 'employees',
}

export const parseArea = (v: string): AgentArea | null => AREA_SYNONYMS[fold(v)] ?? null
export const parseAudience = (v: string): AgentAudience | null => AUDIENCE_SYNONYMS[fold(v)] ?? null
export const parseStatus = (v: string): AgentStatus | null =>
  AGENT_STATUSES.find((s) => s.toLowerCase() === v.trim().toLowerCase()) ?? null

/**
 * A list cell as items: one per line; a cell with no line breaks may separate items with
 * semicolons (as the table export does). Leading bullets ("-", "•") are dropped.
 */
export function splitList(cell: string): string[] {
  const parts = /\r?\n/.test(cell) ? cell.split(/\r?\n/) : cell.split(/;\s*/)
  return parts.map(stripBullet).filter(Boolean)
}

/** One list item without a typed bullet or number ("- Never paste...", "2) Draft..."), trimmed. */
export const stripBullet = (item: string): string => item.replace(/^\s*(?:[-•*·]|\d+[.)])\s+/, '').trim()

/**
 * Typed list items, one per line, as the add and edit dialog reads them: the same bullet
 * stripping as an imported sheet, so a download and re-import never changes an item.
 */
export const lineItems = (text: string): string[] => text.split(/\r?\n/).map(stripBullet).filter(Boolean)

const cellText = (v: unknown): string => {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

export interface SheetIssue {
  /** Excel row number, or null for the sheet as a whole. */
  row: number | null
  message: string
}

export interface SheetRead {
  agents: Agent[]
  issues: SheetIssue[]
  /** Rows that were left out. */
  skipped: number
}

/** The sheet's header for each catalog column (null when absent). */
export function matchHeaders(headers: readonly string[]): Record<SheetKey, string | null> {
  const folded = headers.map((h) => ({ h, f: fold(h) }))
  return Object.fromEntries(
    SHEET_COLUMNS.map((c) => {
      const syn = HEADER_SYNONYMS[c.key]
      return [c.key, folded.find((x) => syn.includes(x.f))?.h ?? null]
    }),
  ) as Record<SheetKey, string | null>
}

/** True when a parsed sheet looks like the catalog (it has the required columns). */
export function isAgentSheet(headers: readonly string[]): boolean {
  const m = matchHeaders(headers)
  return SHEET_COLUMNS.every((c) => !c.required || m[c.key] != null)
}

/**
 * Agents from the rows of an "AI agents" sheet. Rows that cannot be agents are left out with a
 * reason; fixable cells (an unknown audience, an unsafe link) are fixed and reported.
 */
export function readAgentRows(
  headers: readonly string[],
  rows: readonly Record<string, unknown>[],
  rowNumbers: readonly number[] = rows.map((_, i) => i + 2),
): SheetRead {
  const m = matchHeaders(headers)
  const missing = SHEET_COLUMNS.filter((c) => c.required && m[c.key] == null)
  if (missing.length) {
    return {
      agents: [],
      skipped: rows.length,
      issues: [
        {
          row: null,
          message: `The sheet has no ${missing.map((c) => `"${c.label}"`).join(' or ')} column. Use the columns of an exported "AI agents" sheet.`,
        },
      ],
    }
  }
  const get = (r: Record<string, unknown>, k: SheetKey) => {
    const h = m[k]
    return h == null ? '' : cellText(r[h])
  }
  const issues: SheetIssue[] = []
  const agents: Agent[] = []
  let skipped = 0
  rows.forEach((r, i) => {
    const rowNo = rowNumbers[i] ?? i + 2
    const name = get(r, 'name')
    if (!name && SHEET_COLUMNS.every((c) => !get(r, c.key))) return
    const label = name ? `Row ${rowNo} (${name})` : `Row ${rowNo}`
    const skip = (why: string) => {
      skipped++
      issues.push({ row: rowNo, message: `${label} left out: ${why}` })
    }

    const areaText = get(r, 'area')
    const area = parseArea(areaText)
    if (!area) {
      skip(
        areaText
          ? `"${areaText}" is not an HR area. Use one of ${AGENT_AREAS.map((a) => AREA_LABEL[a]).join(', ')}.`
          : 'it has no HR area.',
      )
      return
    }

    const audienceItems = splitList(get(r, 'audience').replace(/,\s*/g, ';'))
    const audience = [...new Set(audienceItems.map(parseAudience).filter((a): a is AgentAudience => !!a))]
    const unknownAudience = audienceItems.filter((x) => !parseAudience(x))
    if (unknownAudience.length)
      issues.push({
        row: rowNo,
        message: `${label}: audience ${unknownAudience.map((x) => `"${x}"`).join(', ')} not recognized, left out.`,
      })
    if (!audience.length) {
      audience.push('hr')
      issues.push({ row: rowNo, message: `${label}: no audience given, set to HR team.` })
    }

    // A missing or unknown status becomes Pilot, as in the Add dialog, and the import says so.
    // Never Sample: a team's own catalog must not be labeled as the sample.
    const statusText = get(r, 'status')
    let status = parseStatus(statusText)
    if (!status) {
      status = DEFAULT_STATUS
      if (statusText)
        issues.push({
          row: rowNo,
          message: `${label}: status "${statusText}" not recognized, set to ${DEFAULT_STATUS}.`,
        })
      else if (m.status != null)
        issues.push({ row: rowNo, message: `${label}: no status given, set to ${DEFAULT_STATUS}.` })
    }

    const urlText = get(r, 'url')
    const url = normalizeAgentUrl(urlText)
    if (url == null)
      issues.push({
        row: rowNo,
        message: `${label}: the link is not a web link (https://), so it was removed.`,
      })

    const draft = tidyDraft({
      name,
      area,
      audience,
      status,
      description: get(r, 'description'),
      useFor: splitList(get(r, 'useFor')),
      dontUseFor: splitList(get(r, 'dontUseFor')),
      examplePrompts: splitList(get(r, 'examplePrompts')),
      dataSources: splitList(get(r, 'dataSources')),
      ownerTeam: get(r, 'ownerTeam'),
      url: url ?? '',
    })
    const errors = Object.values(
      draftErrors(
        draft,
        agents.map((a) => a.name),
      ),
    )
    if (errors.length) {
      skip(
        errors[0]
          .replace(/\.$/, '')
          .replace(/^./, (c) => c.toLowerCase())
          .concat('.'),
      )
      return
    }
    agents.push({
      id: uniqueId(
        draft.name,
        agents.map((a) => a.id),
      ),
      ...draft,
    })
  })
  if (agents.length && m.status == null)
    issues.unshift({
      row: null,
      message: `The sheet has no "Status" column, so every agent is set to ${DEFAULT_STATUS}.`,
    })
  if (!agents.length && !issues.length) issues.push({ row: null, message: 'The sheet has no agents in it.' })
  return { agents, issues, skipped }
}
