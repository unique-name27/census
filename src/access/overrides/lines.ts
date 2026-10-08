/**
 * Override lines (docs/SECURITY-CENTER.md): which surfaces a line may name, turning lines into the
 * policy's overrides, and screening a list of lines the way the loader and the Security center's
 * import do: an unknown role or surface, a decision the surface does not take, or a guard rail
 * crossed leaves that one line out, with why, and the rest apply. Pure.
 */
import { type Mode, PICK_OF } from '../modes'
import { decideUnder, type PolicyOverrides } from '../policy'
import type { Access, Decision } from '../policy/types'
import { kindOf, restOf } from '../surfaces'
import { GUARD_RAILS, type GuardEnv, guardRailFor } from './guards'
import { overrideOf, prefixOf } from './overlay'
import {
  isAccess,
  isPolicyRole,
  type PolicyLine,
  type PolicyRole,
  ROLE_HOME,
  ROLE_OFFERED,
  type SkippedLine,
} from './types'

/** What Census has, for telling a known surface from an unknown one. */
export interface SurfaceCatalog {
  /** Every surface the access matrix lists (exact ids and prefix rows). */
  surfaces: ReadonlySet<string>
  /** Metric ids in the dictionary. */
  metrics: ReadonlySet<string>
  /** Figure ids a figure scan saw; other figure ids are judged by their shape. */
  figures: ReadonlySet<string>
  /** View keys: a figure id starts with one, and a role can open on one. */
  views: readonly string[]
}

const FIGURE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)+$/

/** Whether a surface (or role setting) is one Census has. */
export function knownSurface(s: string, cat: SurfaceCatalog): boolean {
  if (s === ROLE_OFFERED || s === ROLE_HOME) return true
  if (cat.surfaces.has(s)) return true
  const kind = kindOf(s)
  const rest = restOf(s)
  if (kind === 'figure') {
    const p = prefixOf(s)
    const id = p ?? rest
    if (cat.figures.has(id)) return true
    const shaped = p !== null ? /^[a-z0-9]+(?:-[a-z0-9]+)*-$/.test(p) : FIGURE_ID.test(id)
    return shaped && cat.views.some((v) => id.startsWith(`${v}-`))
  }
  if (kind === 'metric') {
    const p = prefixOf(s)
    if (p === null) return cat.metrics.has(rest)
    return p.length > 0 && [...cat.metrics].some((m) => m.startsWith(p))
  }
  if (kind === 'item') return /^[a-z]+:/.test(rest) && cat.views.some((v) => rest.startsWith(`${v}:`))
  return false
}

/** Whether a decision is one the surface takes. */
export function validDecision(surface: string, decision: string, cat: SurfaceCatalog): boolean {
  if (surface === ROLE_OFFERED) return decision === 'shown' || decision === 'hidden'
  if (surface === ROLE_HOME) return cat.views.includes(decision)
  return isAccess(decision)
}

/** A decision's shape when there is no catalog to check it against. */
const roughlyValid = (surface: string, decision: string): boolean =>
  surface === ROLE_HOME ? /^[a-z]+$/.test(decision) : validDecision(surface, decision, NO_CATALOG)

const NO_CATALOG: SurfaceCatalog = { surfaces: new Set(), metrics: new Set(), figures: new Set(), views: [] }

/** The policy's overrides for a list of lines (later lines win). */
export function overridesOf(lines: readonly PolicyLine[]): PolicyOverrides {
  const out = new Map<Mode, Map<string, Decision>>()
  for (const l of lines) {
    let own = out.get(l.role)
    if (!own) {
      own = new Map()
      out.set(l.role, own)
    }
    if (l.surface === ROLE_HOME) {
      for (const k of [...own.keys()]) if (k.startsWith('role:home:')) own.delete(k)
      own.set(`role:home:${l.decision}`, overrideOf('shown'))
    } else own.set(l.surface, overrideOf(l.decision as Access, l.how))
  }
  return out
}

/** The decisions the defaults and a set of lines give, for the guard rails. */
export function guardEnv(lines: readonly PolicyLine[]): GuardEnv {
  const ov = overridesOf(lines)
  return {
    base: (mode, surface) => decideUnder(null, mode, surface).access,
    effective: (mode, surface) => decideUnder(ov, mode, surface).access,
  }
}

/** Why a role's home choice does not work, or null: it must be a view the role shows, and a role with a pick keeps its home. */
export function homeProblem(role: PolicyRole, view: string, ov: PolicyOverrides): string | null {
  if (PICK_OF[role]) return 'A role that needs a pick opens on its home, where the pick is made.'
  if (view === 'dev' || view === 'data' || view === 'actions') return 'A role opens on a view, not a page.'
  if (decideUnder(ov, role, `view:${view}`).access === 'hidden') return 'A role opens on a view it shows.'
  return null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

/** A raw line as the file holds it, read without trusting it. */
function rawOf(v: unknown): {
  role: string
  surface: string
  decision: string
  rest: Record<string, unknown>
} {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  return { role: str(o.role), surface: str(o.surface), decision: str(o.decision), rest: o }
}

/**
 * Screen a file's lines: the ones that apply, and every one left out with why. A later line for
 * the same role and surface replaces an earlier one. Guard rails are weighed with every other
 * accepted line in place, so a pay amount shown together with its switch passes. Without a
 * catalog (a preview kept in this tab), unknown surfaces are let through, since nothing decides
 * them, and every guard rail still applies.
 */
export function screenLines(
  raw: readonly unknown[],
  cat: SurfaceCatalog | null,
): { lines: PolicyLine[]; skipped: SkippedLine[] } {
  const skipped: SkippedLine[] = []
  const kept = new Map<string, { index: number; line: PolicyLine }>()
  for (const [index, v] of raw.entries()) {
    const r = rawOf(v)
    const skip = (kind: SkippedLine['kind'], why: string) =>
      skipped.push({ index, role: r.role, surface: r.surface, decision: r.decision, kind, why })
    if (!r.role || !r.surface || !r.decision) {
      skip('invalid', 'Each line needs a role, a surface and a decision.')
      continue
    }
    if (r.role === 'developer') {
      skip('guard', GUARD_RAILS['developer-role'])
      continue
    }
    if (!isPolicyRole(r.role)) {
      skip('unknown-role', 'Not a role Census has.')
      continue
    }
    // A guard rail that does not depend on the other lines is named before anything else, so a
    // line that tries to show a protected characteristic says so rather than "unknown surface".
    // The pay lines are weighed together, below.
    if (kindOf(r.surface) !== 'pay') {
      const one = { role: r.role, surface: r.surface, decision: r.decision, reason: '', by: '', at: '' }
      const early = guardRailFor(one, guardEnv([one]))
      if (early) {
        skip('guard', GUARD_RAILS[early])
        continue
      }
    }
    if (kindOf(r.surface) === 'minimum') {
      skip('unknown-surface', 'Minimums are set in the metric dictionary, where they can be raised.')
      continue
    }
    if (cat && !knownSurface(r.surface, cat)) {
      skip('unknown-surface', 'Not a surface Census has.')
      continue
    }
    if (cat ? !validDecision(r.surface, r.decision, cat) : !roughlyValid(r.surface, r.decision)) {
      skip('invalid', 'Not a decision this surface takes.')
      continue
    }
    const line: PolicyLine = {
      role: r.role,
      surface: r.surface,
      decision: r.decision,
      reason: str(r.rest.reason),
      by: str(r.rest.by),
      at: str(r.rest.at),
      ...(typeof r.rest.how === 'string' && r.rest.how.trim() ? { how: r.rest.how.trim() } : {}),
    }
    const key = `${r.role}|${r.surface}`
    const before = kept.get(key)
    if (before)
      skipped.push({
        index: before.index,
        role: before.line.role,
        surface: before.line.surface,
        decision: before.line.decision,
        kind: 'replaced',
        why: 'A later line for the same role and surface replaces it.',
      })
    kept.set(key, { index, line })
  }
  // Guard rails and home choices, against everything else that applies; a line taken out can
  // change another's answer (a pay switch hidden takes its amounts with it), so repeat until none.
  let entries = [...kept.values()]
  for (let round = 0; round < 4; round++) {
    const lines = entries.map((e) => e.line)
    const env = guardEnv(lines)
    const ov = overridesOf(lines)
    const out: typeof entries = []
    for (const e of entries) {
      const rail = guardRailFor(e.line, env)
      const home = e.line.surface === ROLE_HOME ? homeProblem(e.line.role, e.line.decision, ov) : null
      if (rail || home)
        skipped.push({
          index: e.index,
          role: e.line.role,
          surface: e.line.surface,
          decision: e.line.decision,
          kind: rail ? 'guard' : 'invalid',
          why: rail ? GUARD_RAILS[rail] : (home as string),
        })
      else out.push(e)
    }
    if (out.length === entries.length) break
    entries = out
  }
  entries.sort((a, b) => a.index - b.index)
  skipped.sort((a, b) => a.index - b.index)
  return { lines: entries.map((e) => e.line), skipped }
}
