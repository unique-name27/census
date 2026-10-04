/**
 * Companion tools the team already uses, listed in the masthead's Tools menu. Defaults point at the
 * user's published tools; anyone can change a link in Settings → Related tools (kept in this
 * browser only, as part of the settings). Pure.
 */

export interface Tool {
  id: string
  label: string
  description: string
  url: string | null
}

export const DEFAULT_TOOLS: Tool[] = [
  {
    id: 'pipeline',
    label: 'Pipeline dashboard',
    description: 'Recruiting pipeline review for weekly hiring meetings',
    url: 'https://unique-name27.github.io/recruiting-pipeline/pipeline-review.html',
  },
  {
    id: 'lattice',
    label: 'Career lattice',
    description: 'Career paths and moves between jobs and levels',
    url: null,
  },
  {
    id: 'toolkit',
    label: 'Manager toolkit',
    description: 'Guides and templates for people managers',
    url: null,
  },
  {
    id: 'catalog',
    label: 'HR process catalog',
    description: 'Hire-to-Retire Atlas: processes, policies and service levels',
    url: 'https://claude.ai/artifact/JVU8J4nKU6Sjj35K9TA7Cn',
  },
]

/** Only web links; anything else (javascript:, data:, file paths) is refused. */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(withScheme)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * Defaults merged with the saved links (Settings → Related tools). A saved null clears a
 * default link.
 */
export function mergeTools(saved: Record<string, string | null> | null | undefined): Tool[] {
  return DEFAULT_TOOLS.map((t) => (saved && t.id in saved ? { ...t, url: saved[t.id] ?? null } : t))
}

/** Atlas deep link for a process ID, e.g. OF-05 -> <catalog>#process.OF-05. */
export function processLink(tools: Tool[], processId: string): string | null {
  const catalog = tools.find((t) => t.id === 'catalog')?.url
  if (!catalog || !/^[A-Z]{2}-\d{2}$/.test(processId)) return null
  return `${catalog.split('#')[0]}#process.${processId}`
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}
