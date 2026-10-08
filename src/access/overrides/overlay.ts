/**
 * How a policy file's overrides lie over the built-in decisions (docs/SECURITY-CENTER.md). The
 * policy's `decide` asks `overrideDecision` first and then the role's engine, which for the
 * allowlist modes reads `overlayTable(ROLE_POLICY[mode], overrides)`: the table with the overrides
 * written into it, so the engine carries them through. A view shown by an override shows its tabs,
 * figures and metrics; a view hidden by one hides them.
 *
 * Order, for one mode's overrides:
 *  1. An exact override that hides the surface.
 *  2. A place that holds it hidden by an override: its view or page, its tab, the Data room for its
 *     tabs, Ask for its tools. A figure shown by an override on a hidden view stays hidden.
 *  3. An exact override that shows or limits it (never a Developer-only surface outside Developer).
 *  4. A prefix override (`figure:hrbp-quality-*`, `metric:listening.*`, `item:onboarding:i9:`).
 *  5. A metric whose every view is hidden.
 *  6. Nothing: the role's own engine answers.
 *
 * Every override reads the same in every mode's copy ("Hidden in this mode by the policy file in
 * force."); the reason typed in the Security center stays in the file. Pure.
 */

import { isGuardedDeveloperSurface } from '../policy/developer'
import { VIEW_TABS } from '../policy/kit'
import { baseTab } from '../policy/table'
import {
  type At,
  type DecideInfo,
  type Decision,
  type HiddenPart,
  hidden,
  limited,
  type PolicyPlace,
  type RolePolicy,
  type RoleTab,
  SHOWN,
} from '../policy/types'
import { kindOf, restOf } from '../surfaces'

/** One mode's overrides: surface to decision. */
export type ModeOverrides = ReadonlyMap<string, Decision>

export const OVERRIDE_HIDDEN = 'Hidden in this mode by the policy file in force.'
export const OVERRIDE_LIMITED = 'Shown with limits set by the policy file in force.'
const PLACE_HIDDEN = hidden('Its page is hidden in this mode by the policy file in force.')
const TAB_HIDDEN = hidden('Its tab is hidden in this mode by the policy file in force.')
const ASK_OFF = hidden('Ask is off in this mode by the policy file in force.')
const DATA_HIDDEN = hidden('The Data room is hidden in this mode by the policy file in force.')
const VIEWS_HIDDEN = hidden('None of the views it is on is shown in this mode.')

/** The decision an override line stands for, with the sentence every mode's copy reads. */
export function overrideOf(access: 'shown' | 'limited' | 'hidden', how?: string): Decision {
  if (access === 'shown') return SHOWN
  if (access === 'limited') return limited(how?.trim() || OVERRIDE_LIMITED)
  return hidden(OVERRIDE_HIDDEN)
}

/** The four Special analyses (src/views/hrbp/analyses/tab.ts `ANALYSIS_LABEL`; a test keeps them equal). */
export const ANALYSIS_PARTS: readonly { key: string; label: string }[] = [
  { key: 'quality', label: 'Quality of hire' },
  { key: 'declines', label: 'Offer declines' },
  { key: 'stages', label: 'Engineering by stage' },
  { key: 'pyramid', label: 'Level pyramid' },
]

const PREFIX_KINDS = new Set(['figure', 'metric'])

/** A prefix row: `figure:hrbp-quality-*`, `metric:listening.*` (the part before the star), else null. */
export function prefixOf(surface: string): string | null {
  const kind = kindOf(surface)
  if (!PREFIX_KINDS.has(kind) || !surface.endsWith('*')) return null
  return restOf(surface).slice(0, -1)
}

const isHidden = (d: Decision | undefined): boolean => d?.access === 'hidden'

/**
 * The override's answer for a surface, or undefined when no override reaches it. `placeHidden`
 * says whether a view is hidden in the mode with the overrides laid over (for step 5).
 */
export function overrideDecision(
  ov: ModeOverrides,
  s: string,
  at: At | undefined,
  info: DecideInfo | undefined,
  placeHidden: (view: string) => boolean,
): Decision | undefined {
  const exact = ov.get(s)
  if (isHidden(exact)) return exact
  const parent = hiddenParent(ov, s, at)
  if (parent) return parent
  if (exact && !isGuardedDeveloperSurface(s)) return exact
  const kind = kindOf(s)
  const rest = restOf(s)
  if (kind === 'figure' || kind === 'metric') {
    const byPrefix = longestPrefix(ov, kind, rest)
    if (byPrefix && !(byPrefix.access !== 'hidden' && isGuardedDeveloperSurface(s))) return byPrefix
  }
  if (kind === 'item') {
    for (const [k, d] of ov) if (k.startsWith('item:') && rest.startsWith(k.slice(5))) return d
  }
  if (kind === 'kpi' && info?.metric) {
    const m = overrideDecision(ov, `metric:${info.metric}`, undefined, info, placeHidden)
    if (m) return m
  }
  if (kind === 'metric') {
    const views = info?.metricViews?.(rest)
    if (views?.length && views.some((v) => ov.has(`view:${v}`)) && views.every(placeHidden))
      return VIEWS_HIDDEN
  }
  return undefined
}

/** The most specific prefix override of a kind that covers an id. */
function longestPrefix(ov: ModeOverrides, kind: string, id: string): Decision | undefined {
  let best: { len: number; d: Decision } | null = null
  for (const [k, d] of ov) {
    const p = prefixOf(k)
    if (p === null || kindOf(k) !== kind || !id.startsWith(p)) continue
    if (!best || p.length > best.len) best = { len: p.length, d }
  }
  return best?.d
}

/** A view, page, tab, the Data room or Ask hidden by an override above the surface. */
function hiddenParent(ov: ModeOverrides, s: string, at?: At): Decision | undefined {
  const placeOff = (v: string) => isHidden(ov.get(`view:${v}`)) || isHidden(ov.get(`page:${v}`))
  const tabOff = (v: string, t: string) => !!t && isHidden(ov.get(`tab:${v}.${baseTab(t)}`))
  const kind = kindOf(s)
  const rest = restOf(s)
  const atOff = at ? placeOff(at.view) || tabOff(at.view, at.tab ?? '') : false
  switch (kind) {
    case 'tab': {
      const dot = rest.indexOf('.')
      const view = dot < 0 ? rest : rest.slice(0, dot)
      if (placeOff(view)) return PLACE_HIDDEN
      // A part of a tab (`hrbp.analyses:quality`) goes with its tab.
      const t = dot < 0 ? '' : rest.slice(dot + 1)
      return t.includes(':') && tabOff(view, t) ? TAB_HIDDEN : undefined
    }
    case 'figure': {
      for (const [k, d] of ov)
        if (isHidden(d) && kindOf(k) === 'view' && rest.startsWith(`${restOf(k)}-`)) return PLACE_HIDDEN
      return atOff ? TAB_HIDDEN : undefined
    }
    case 'kpi':
      return atOff ? TAB_HIDDEN : undefined
    case 'header':
      return placeOff(rest) ? PLACE_HIDDEN : undefined
    case 'data':
    case 'data-panel':
      return placeOff('data') ? DATA_HIDDEN : undefined
    case 'ask':
      return rest && isHidden(ov.get('ask')) ? ASK_OFF : undefined
    default:
      return undefined
  }
}

/* ───────────── the allowlist tables ───────────── */

type TabbedPlace = keyof typeof VIEW_TABS

const tabsOf = (view: string): readonly { key: string; label: string }[] | undefined =>
  (VIEW_TABS as Record<string, readonly { key: string; label: string }[]>)[view]

/** A hidden analysis's redirect: the first analysis still shown, else People stats' first tab. */
function partRedirect(part: string, ov: ModeOverrides, base: RolePolicy): HiddenPart {
  const key = part.slice(part.indexOf(':') + 1)
  const label = ANALYSIS_PARTS.find((p) => p.key === key)?.label ?? key
  const shown = ANALYSIS_PARTS.find((p) => {
    if (p.key === key) return false
    const s = `tab:hrbp.analyses:${p.key}`
    const d = ov.get(s) ?? base.surfaces[s]
    return !isHidden(d) && !base.hiddenParts[`hrbp.analyses:${p.key}`]
  })
  return shown
    ? { label, instead: `analyses:${shown.key}`, insteadLabel: shown.label }
    : { label, instead: 'overview', insteadLabel: 'Overview' }
}

/**
 * One allowlist mode's table with its overrides written in, so `decideTable` carries them through.
 * The same table object comes back when there are none.
 */
export function overlayTable(base: RolePolicy, ov: ModeOverrides): RolePolicy {
  if (!ov.size) return base
  const views: Record<string, Decision> = { ...base.views }
  const tabs: Record<string, RoleTab[]> = {}
  for (const [k, v] of Object.entries(base.tabs)) if (v) tabs[k] = [...v]
  const hiddenParts: Record<string, HiddenPart> = { ...base.hiddenParts }
  const surfaces: Record<string, Decision> = { ...base.surfaces }
  const articles: Record<string, Decision> = { ...base.articles }
  const tours: Record<string, Decision> = { ...base.tours }
  const hiddenFigures = new Set(base.hiddenFigures)
  const figurePrefixes = new Set(base.hiddenFigurePrefixes)
  const hide = new Set(base.metrics.hide)
  const hidePrefixes = new Set(base.metrics.hidePrefixes)
  const allow = base.metrics.allow ? [...base.metrics.allow] : undefined
  const drills = new Set<string>(base.drillKinds)
  const datasets = new Set<string>(base.datasets)
  const itemPrefixes = new Set(base.hiddenItemPrefixes)

  // Views and pages first, so a tab override lands on the view's rebuilt tab list.
  for (const [s, d] of ov) {
    const kind = kindOf(s)
    if (kind !== 'view' && kind !== 'page') continue
    const key = restOf(s)
    const was = views[key]
    views[key] = d
    delete surfaces[s]
    const defs = tabsOf(key)
    // A view the table hid has no tab list: shown now, it shows every tab until one is hidden.
    if (d.access !== 'hidden' && (!was || was.access === 'hidden') && defs)
      tabs[key] = defs.map((t) => ({ key: t.key, label: t.label, decision: SHOWN }))
  }

  for (const [s, d] of ov) {
    const kind = kindOf(s)
    const rest = restOf(s)
    switch (kind) {
      case 'view':
      case 'page':
        break
      case 'tab': {
        surfaces[s] = d
        const dot = rest.indexOf('.')
        if (dot < 0) break
        const view = rest.slice(0, dot)
        const t = rest.slice(dot + 1)
        if (t.includes(':')) {
          if (view === 'hrbp' && baseTab(t) === 'analyses') {
            if (isHidden(d)) hiddenParts[rest] = partRedirect(rest, ov, base)
            else delete hiddenParts[rest]
          }
          break
        }
        const defs = tabsOf(view)
        const list = tabs[view]
        if (!defs || !list) break
        const at = list.findIndex((x) => x.key === t)
        if (at >= 0) list[at] = { ...list[at], decision: d }
        else {
          const def = defs.find((x) => x.key === t)
          if (!def) break
          list.push({ key: def.key, label: def.label, decision: d })
          // Back in the registry's order, so the first shown tab is still the first on screen.
          list.sort((a, b) => defs.findIndex((x) => x.key === a.key) - defs.findIndex((x) => x.key === b.key))
        }
        break
      }
      case 'figure': {
        const p = prefixOf(s)
        if (p !== null) {
          if (isHidden(d)) figurePrefixes.add(p)
          else figurePrefixes.delete(p)
          break
        }
        if (isHidden(d)) surfaces[s] = d
        else {
          // Shown: off the hide list, and still judged by its view and tab.
          hiddenFigures.delete(rest)
          if (surfaces[s]?.access === 'hidden') delete surfaces[s]
          if (d.access === 'limited') surfaces[s] = d
        }
        break
      }
      case 'metric': {
        const p = prefixOf(s)
        if (p === null) {
          surfaces[s] = d
          if (isHidden(d)) hide.add(rest)
          else hide.delete(rest)
          break
        }
        if (isHidden(d)) hidePrefixes.add(p)
        else {
          hidePrefixes.delete(p)
          if (allow && !allow.some((a) => p.startsWith(a))) allow.push(p)
        }
        break
      }
      case 'item':
        if (isHidden(d)) {
          itemPrefixes.add(rest)
          surfaces[s] = d
        } else {
          itemPrefixes.delete(rest)
          delete surfaces[s]
        }
        break
      case 'help':
        if (rest.startsWith('article:')) articles[rest.slice(8)] = d
        else if (rest.startsWith('tour:')) tours[rest.slice(5)] = d
        else surfaces[s] = d
        break
      case 'drill':
        surfaces[s] = d
        if (isHidden(d)) drills.delete(rest)
        else drills.add(rest)
        break
      case 'dataset':
        surfaces[s] = d
        if (isHidden(d)) datasets.delete(rest)
        else datasets.add(rest)
        break
      default:
        surfaces[s] = d
    }
  }

  return {
    ...base,
    views: views as RolePolicy['views'],
    tabs: tabs as Partial<Record<PolicyPlace, readonly RoleTab[]>>,
    hiddenParts,
    surfaces,
    articles,
    tours,
    hiddenFigures: [...hiddenFigures],
    hiddenFigurePrefixes: [...figurePrefixes],
    metrics: { ...(allow ? { allow } : {}), hidePrefixes: [...hidePrefixes], hide: [...hide] },
    drillKinds: [...drills] as RolePolicy['drillKinds'],
    datasets: [...datasets] as RolePolicy['datasets'],
    hiddenItemPrefixes: [...itemPrefixes],
  }
}

/** The views whose tab lists the policy knows (the matrix test keeps them equal to the registry's). */
export const TABBED_VIEWS = Object.keys(VIEW_TABS) as TabbedPlace[]
