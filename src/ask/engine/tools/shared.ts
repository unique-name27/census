/**
 * What every tool works with, and small helpers for their output.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Filters } from '@/data/scope'
import type { ViewDef } from '@/views/types'
import { withAccessTabs, withFeatureTabs } from '@/views/types'
import type { ReleaseAudit } from '../audit'
import type { TokenMap } from '../privacy'
import type { RefRegistry } from '../refs'
import { contextFor, resolveFilters } from '../scope'
import type { ToolEnv } from '../types'

export interface ToolRuntime {
  env: ToolEnv
  /** The live context with pay amounts and immigration details off. */
  base: AnalyticsContext
  tokens: TokenMap
  refs: RefRegistry
  /** The conversation's released results, for differencing protection. */
  audit: ReleaseAudit
}

/** A tool's answer before the privacy pass: a JSON-able value, or an error Claude can act on. */
export type ToolOutput = { ok: true; value: unknown } | { ok: false; error: string }

export const ok = (value: unknown): ToolOutput => ({ ok: true, value })
export const fail = (error: string): ToolOutput => ({ ok: false, error })

/** A number rounded for the wire (4 decimals; fractions keep their precision), or null. */
export function num(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.round(v * 10_000) / 10_000
}

/** The tool's input as an object (Claude always sends one; a missing input is an empty object). */
export function inputOf(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
}

/** Keys of the input that the tool does not take, as an error message; null when all are known. */
export function unknownKeys(input: Record<string, unknown>, known: readonly string[]): string | null {
  const extra = Object.keys(input).filter((k) => !known.includes(k))
  return extra.length
    ? `Unknown argument ${extra.map((k) => `"${k}"`).join(', ')}. This tool takes ${known.join(', ') || 'no arguments'}.`
    : null
}

/** The context for the call's `filters` (the user's own when none are given). */
export function scopedCtx(
  rt: ToolRuntime,
  filters: unknown,
): { ok: true; ctx: AnalyticsContext; filters: Filters } | { ok: false; error: string } {
  const r = resolveFilters(rt.base, filters, rt.tokens)
  if (!r.ok) return r
  return { ok: true, ctx: contextFor(rt.base, r.filters), filters: r.filters }
}

/** Views as the user sees them: feature-gated tabs dropped, and only the views and tabs the mode shows. */
export function liveViews(rt: ToolRuntime): ViewDef[] {
  const access = rt.base.access
  const views = access ? rt.env.views.filter((v) => access.can(`view:${v.key}`)) : rt.env.views
  return views.map((v) => {
    const f = withFeatureTabs(v, rt.base.features)
    return access ? withAccessTabs(f, access) : f
  })
}

/** Manager mode's lock, when Ask runs in Manager mode. */
export const lockOf = (rt: ToolRuntime) => rt.base.access?.lock ?? null

/** Views that read data and can be summarized (the scorecard included). */
export function dataViews(rt: ToolRuntime): ViewDef[] {
  return liveViews(rt).filter((v) => v.datasets.length > 0)
}

export const viewKeysText = (rt: ToolRuntime): string =>
  dataViews(rt)
    .map((v) => `${v.key} (${v.label})`)
    .join(', ')

/** `view:hrbp.attrition`, the link Claude uses for a view and tab. */
export const viewLink = (view: string, tab?: string | null): string =>
  tab ? `view:${view}.${tab}` : `view:${view}`
