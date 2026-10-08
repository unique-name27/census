/**
 * The guard rails no override can cross (docs/SECURITY-CENTER.md). The Security center's editor
 * refuses a change that would, with the rule as its reason, and the loader rejects the line of a
 * policy file that tries, while the rest of the file applies.
 *
 * Hiding never crosses a guard rail, except changing a scope or lowering a minimum: an override
 * can always take something away. Pure.
 */
import { IMMIGRATION_OF, type Mode, SCOPE_OF } from '../modes'
import { isGuardedDeveloperSurface } from '../policy/developer'
import type { Access } from '../policy/types'
import { kindOf, restOf } from '../surfaces'
import { isAccess } from './types'

export type GuardId =
  | 'developer-role'
  | 'protected'
  | 'er-names'
  | 'survey-person'
  | 'minimums'
  | 'switches'
  | 'developer-only'
  | 'scope'

/** Each guard rail as one sentence: the reason the editor and the loader give. */
export const GUARD_RAILS: Readonly<Record<GuardId, string>> = {
  'developer-role': 'Developer mode always shows everything and cannot be changed.',
  protected: 'Protected characteristics are never shown.',
  'er-names': 'Employee relations items never name a person.',
  'survey-person': 'Survey answers are never shown per person, and manager cuts keep their minimum.',
  minimums: 'Anonymity minimums can only be raised, never lowered.',
  switches: 'Pay amounts and immigration details per person only ever show behind their session switches.',
  'developer-only': 'The Security center, debug overlays and the Ask tools console stay Developer-only.',
  scope:
    'A role never sees outside its scope. The scope kind stays fixed, and what sits on its edge can only be narrowed.',
}

/** The rails in the order the Security center lists them. */
export const GUARD_ORDER: readonly GuardId[] = [
  'protected',
  'er-names',
  'survey-person',
  'minimums',
  'switches',
  'developer-only',
  'scope',
]

/** What a guard rail check needs about the policy around the line. */
export interface GuardEnv {
  /** The built-in decision (no overrides). */
  base: (mode: Mode, surface: string) => Access
  /** The decision with the draft or file applied, this line included. */
  effective: (mode: Mode, surface: string) => Access
}

export interface GuardLine {
  role: string
  surface: string
  decision: string
}

/** The words of a surface after its kind, lowercased, split on punctuation and camelCase. */
export function surfaceWords(surface: string): string[] {
  return restOf(surface)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

const PROTECTED = new Set([
  'gender',
  'sex',
  'ethnicity',
  'ethnic',
  'race',
  'racial',
  'religion',
  'religious',
  'age',
  'birth',
  'birthday',
  'birthdate',
  'dob',
  'disability',
  'disabled',
  'orientation',
  'sexuality',
  'marital',
  'pregnancy',
  'pregnant',
  'veteran',
  'nationality',
  'genetic',
  'transgender',
])
const PERSONAL = new Set([
  'name',
  'names',
  'named',
  'person',
  'people',
  'subject',
  'subjects',
  'who',
  'individual',
])
const RESPONDENT = new Set([...PERSONAL, 'respondent', 'respondents', 'employee', 'employees', 'answerer'])
const IMMIGRATION = new Set(['immigration', 'visa', 'visas', 'authorization', 'authorizations', 'permit'])

/** Minimums a line may name, with the lowest value each may take. */
export const MINIMUM_FLOORS: Readonly<Record<string, number>> = {
  'minimum:group': 5,
  'minimum:anonymity': 5,
  'minimum:survey': 5,
  'minimum:survey-manager-cut': 10,
  'minimum:manager-cut': 10,
}

const RANK: Record<Access, number> = { hidden: 0, limited: 1, shown: 2 }

/** Surface kinds on a scope's edge: what decides how far a scoped role reaches. */
const SCOPE_EDGE_KINDS = new Set(['filter', 'focus', 'person', 'drill', 'scope'])
const SCOPE_EDGE = new Set(['export:records', 'export:link', 'ui:kpi-delta-company'])

/** Whether a surface sits on the edge of a role's scope (Finance: its filter row). */
export function onScopeEdge(mode: Mode, surface: string): boolean {
  const kind = kindOf(surface)
  if (kind === 'scope') return true
  if (mode === 'finance') return kind === 'filter'
  if (!SCOPE_OF[mode]) return false
  return SCOPE_EDGE_KINDS.has(kind) || SCOPE_EDGE.has(surface)
}

/**
 * The guard rail a line crosses, or null. `env.effective` should include the line, so a pay
 * amount shown together with the pay switch passes.
 */
export function guardRailFor(line: GuardLine, env: GuardEnv): GuardId | null {
  const { role, surface, decision } = line
  if (role === 'developer') return 'developer-role'
  const kind = kindOf(surface)
  if (kind === 'minimum') {
    const floor = MINIMUM_FLOORS[surface] ?? 5
    const n = Number(decision)
    if (!Number.isFinite(n) || n < floor)
      return surface.includes('manager-cut') ? 'survey-person' : 'minimums'
    return null
  }
  const mode = role as Mode
  if (kind === 'scope') return 'scope'
  if (decision === 'hidden') return null
  if (isGuardedDeveloperSurface(surface)) return 'developer-only'
  const words = surfaceWords(surface)
  if (words.some((w) => PROTECTED.has(w))) return 'protected'
  const er = words.includes('er') || (words.includes('employee') && words.includes('relations'))
  if (er && (kind === 'person' || words.some((w) => PERSONAL.has(w)))) return 'er-names'
  const survey = words.some((w) => w === 'survey' || w === 'surveys' || w === 'listening')
  if (survey && (kind === 'person' || words.some((w) => RESPONDENT.has(w)))) return 'survey-person'
  if (surface === 'pay:amounts' && env.effective(mode, 'pay:switch') === 'hidden') return 'switches'
  const immigration =
    words.some((w) => IMMIGRATION.has(w)) ||
    surface === 'drill:rightToWork' ||
    surface === 'dataset:rightToWork'
  if (immigration && (kind === 'person' || kind === 'drill' || kind === 'dataset') && !IMMIGRATION_OF[mode])
    return 'switches'
  if (onScopeEdge(mode, surface) && isAccess(decision) && RANK[decision] > RANK[env.base(mode, surface)])
    return 'scope'
  return null
}
