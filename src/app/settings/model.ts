/**
 * Pure helpers for the Settings sheet: the compensation cycle form (percent text in, fractions
 * out, plain-English errors), the related-tools form, and the wording after a settings import.
 */
import {
  COMP_CYCLE_LIMITS,
  type CompCycleSettings,
  RATING_KEYS,
  type RatingKey,
  type Settings,
} from '@/data/settings'
import { DEFAULT_TOOLS, normalizeUrl, type Tool } from '../tools'

/* ───────────── compensation cycle ───────────── */

export interface CompDraft {
  /** Merit budget in percent. */
  budget: string
  low: string
  high: string
  /** Guideline by rating in percent. */
  guideline: Record<RatingKey, string>
}

const pctText = (v: number) => String(Math.round(v * 10_000) / 100)

export function toCompDraft(c: CompCycleSettings): CompDraft {
  const guideline = {} as Record<RatingKey, string>
  for (const r of RATING_KEYS) guideline[r] = pctText(c.guideline[r])
  return {
    budget: pctText(c.meritBudgetPct),
    low: c.healthyBand[0].toFixed(2),
    high: c.healthyBand[1].toFixed(2),
    guideline,
  }
}

const num = (s: string): number => (s.trim() === '' ? Number.NaN : Number(s))
const within = (v: number, r: { min: number; max: number }) => v >= r.min && v <= r.max

export type CompDraftResult =
  | { ok: true; settings: CompCycleSettings }
  | { ok: false; error: string; field: 'budget' | 'low' | 'high' | `g${RatingKey}` }

/** Settings from the form, or the first problem and the field it is in. */
export function parseCompDraft(d: CompDraft): CompDraftResult {
  const L = COMP_CYCLE_LIMITS
  const budget = num(d.budget) / 100
  if (!within(budget, L.meritBudgetPct))
    return { ok: false, error: 'Merit budget must be between 0% and 20%.', field: 'budget' }
  const low = num(d.low)
  const high = num(d.high)
  if (!within(low, L.band))
    return { ok: false, error: 'Band values must be between 0.50 and 1.50.', field: 'low' }
  if (!within(high, L.band))
    return { ok: false, error: 'Band values must be between 0.50 and 1.50.', field: 'high' }
  if (!(low < high))
    return { ok: false, error: 'The low end of the band must be below the high end.', field: 'low' }
  const guideline = {} as Record<RatingKey, number>
  for (const r of RATING_KEYS) {
    const v = num(d.guideline[r]) / 100
    if (!within(v, L.guideline))
      return { ok: false, error: `The guideline for rating ${r} must be between 0% and 30%.`, field: `g${r}` }
    guideline[r] = v
  }
  return { ok: true, settings: { meritBudgetPct: budget, healthyBand: [low, high], guideline } }
}

export function sameCompCycle(a: CompCycleSettings, b: CompCycleSettings): boolean {
  return (
    a.meritBudgetPct === b.meritBudgetPct &&
    a.healthyBand[0] === b.healthyBand[0] &&
    a.healthyBand[1] === b.healthyBand[1] &&
    RATING_KEYS.every((r) => a.guideline[r] === b.guideline[r])
  )
}

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
