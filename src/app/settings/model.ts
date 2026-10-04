/**
 * Pure helpers for the Settings sheet: the related-tools form and the wording after a settings
 * import. (The compensation cycle settings moved to the metric dictionary; see CompSection.)
 */
import type { Settings } from '@/data/settings'
import type { MetricImportReport } from '@/metrics/types'
import { DEFAULT_TOOLS, normalizeUrl, type Tool } from '../tools'

/* ───────────── related tools ───────────── */

export type ToolDraft = Record<string, string>

export const toToolDraft = (tools: readonly Tool[]): ToolDraft =>
  Object.fromEntries(tools.map((t) => [t.id, t.url ?? '']))

/** An error per tool whose text is not a web link (blank is fine: it clears the link). */
export function toolErrors(tools: readonly Tool[], draft: ToolDraft): Record<string, string | null> {
  return Object.fromEntries(
    tools.map((t) => {
      const v = draft[t.id] ?? ''
      return [t.id, v.trim() && !normalizeUrl(v) ? 'Enter a web address (https://…)' : null]
    }),
  )
}

/**
 * What to save per tool: undefined restores the default link (the text is the default), null
 * clears it, a string sets it. Tools whose saved value would not change are left out.
 */
export function toolChanges(
  current: readonly Tool[],
  draft: ToolDraft,
  defaults: readonly Tool[] = DEFAULT_TOOLS,
): { id: string; url: string | null | undefined }[] {
  const out: { id: string; url: string | null | undefined }[] = []
  for (const t of current) {
    const next = normalizeUrl(draft[t.id] ?? '')
    if (next === t.url) continue
    const fallback = defaults.find((d) => d.id === t.id)?.url ?? null
    out.push({ id: t.id, url: next === fallback ? undefined : next })
  }
  return out
}

/* ───────────── settings file ───────────── */

const SETTING_NAME: Record<keyof Settings, string> = {
  theme: 'theme',
  textSize: 'text size',
  motion: 'motion',
  dataStandard: 'data standard',
  asOfOverride: 'reporting date',
  compCycle: 'compensation cycle',
  tools: 'tool links',
}

/** "Applied the theme, text size and data standard from the file." */
export function importedText(applied: readonly (keyof Settings)[]): string {
  const names = applied.map((k) => SETTING_NAME[k])
  if (!names.length) return 'Nothing in the file could be applied.'
  const list = names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Applied the ${list} from the file.`
}

/** What a settings file did to the metric dictionary, in one sentence or two. */
export function dictionaryImportText(
  r: Pick<MetricImportReport, 'changed' | 'rejected' | 'unknown' | 'summary'>,
): string {
  if (!r.changed.length && !r.rejected.length && !r.unknown.length)
    return 'The metric definitions already matched the file.'
  return `Metric definitions: ${r.summary}`
}

/** The toast after a settings import: the settings applied, then what changed in the metric dictionary. */
export function importDescription(
  applied: readonly (keyof Settings)[],
  metrics?: Pick<MetricImportReport, 'changed' | 'rejected' | 'unknown' | 'summary'>,
): string {
  if (!metrics) return importedText(applied)
  const parts = [applied.length ? importedText(applied) : null, dictionaryImportText(metrics)]
  return parts.filter(Boolean).join(' ')
}
