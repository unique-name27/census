/**
 * Ask per role (docs/ROLES-V2.md part 7): the mode's scope in Ask's words, whether Ask is off for
 * it, and the filters a mode's tools take. A manager or a recruiter is a person and goes as a
 * token; business units, regions and sites are categories and go as text. Pure.
 *
 *   askOff(ctx)                  why Ask is off in a scoped mode, or null: a scope under the
 *                                anonymity minimum (any kind), or a pick that is missing or gone
 *   scopeText(scope, tokens)     "{{P3}}'s org", "Silicon Engineering", "APAC", "{{P7}}'s reqs"
 *   filterArgsIn(access)         the org filters a tool call may name (Finance: business unit)
 *   excludeArgsIn(access)        the filters a tool call may leave out ("everyone except")
 *   toolsKey(access)             what a mode's tool definitions depend on: mode and scope kind
 */
import { askScopeTooSmall, modeName } from '@/access/copy'
import type { Mode, PickKind } from '@/access/modes'
import { scopeOfAccess } from '@/access/scopes/records'
import type { OrgScope, ScopeKind, ScopeLock } from '@/access/scopes/types'
import type { AnalyticsContext } from '@/data/context'
import { minGroupOf } from '@/metrics/privacy'
import type { TokenMap } from './privacy'

/** The pick behind each scope kind (its wording in `@/access/copy`). */
export const PICK_OF_SCOPE: Readonly<Record<ScopeKind, PickKind>> = {
  org: 'manager',
  unit: 'unit',
  region: 'region',
  reqs: 'recruiter',
}

const PICK_WORDS: Readonly<Record<PickKind, string>> = {
  manager: 'a manager',
  unit: 'a business unit',
  region: 'a region',
  recruiter: 'a recruiter',
}

/** What an access answer is read for here. */
type ModeAccess = { mode: Mode; scope?: ScopeLock | null; lock?: OrgScope | null; unset?: boolean }

/** Ask in a scoped mode without its pick: "Ask needs a business unit picked in HRBP mode. Choose one with Mode." */
export function askNeedsPick(kind: PickKind, mode: Mode): string {
  return `Ask needs ${PICK_WORDS[kind]} picked in ${modeName(mode)}. Choose one with Mode.`
}

/**
 * Why Ask is off for a context, or null. Every scoped mode needs a scope of the anonymity minimum
 * (employees in an org, a business unit or a region; candidates on a recruiter's reqs), so that no
 * answer is about one person; a mode whose pick is missing or gone holds nobody.
 */
export function askOff(ctx: {
  access?: ModeAccess | null
  metrics: AnalyticsContext['metrics']
}): string | null {
  const access = ctx.access
  const scope = scopeOfAccess(access)
  if (!access || !scope) return null
  const kind = PICK_OF_SCOPE[scope.kind]
  if (access.unset) return askNeedsPick(kind, access.mode)
  const min = minGroupOf(ctx.metrics)
  return scope.size < min ? askScopeTooSmall(kind, min) : null
}

/** The person a scope belongs to, as a token: the manager (org) or the recruiter (reqs); null otherwise. */
export function scopePerson(scope: ScopeLock | null | undefined, tokens: TokenMap): string | null {
  if (!scope) return null
  if (scope.kind === 'org') return tokens.forEmployee(scope.managerId)
  if (scope.kind === 'reqs') {
    if (scope.recruiterId) return tokens.forEmployee(scope.recruiterId)
    return scope.recruiter ? tokens.forName(scope.recruiter) : null
  }
  return null
}

/**
 * The scope inside a sentence, with a person as a token: "{{P3}}'s org", "Silicon Engineering",
 * "APAC", "{{P7}}'s reqs". Null without a scope.
 */
export function scopeText(scope: ScopeLock | null | undefined, tokens: TokenMap): string | null {
  if (!scope) return null
  switch (scope.kind) {
    case 'org':
      return `${tokens.forEmployee(scope.managerId)}'s org`
    case 'unit':
      return scope.unit
    case 'region':
      return scope.region
    case 'reqs': {
      const who = scopePerson(scope, tokens)
      return who ? `${who}'s reqs` : 'the reqs'
    }
  }
}

/** The org filters as the tools name them. */
export const FILTER_ARGS = ['leader', 'business_unit', 'department', 'location', 'level'] as const
export type FilterArg = (typeof FILTER_ARGS)[number]

/** Finance filters by business unit and period only (docs/ROLES-V2.md 2.3). */
const FINANCE_ARGS: readonly FilterArg[] = ['business_unit']

const isFinance = (access: ModeAccess | null | undefined): boolean =>
  !!access && access.mode === 'finance' && !scopeOfAccess(access)

/** The org filters a tool call may name in a mode. */
export function filterArgsIn(access: ModeAccess | null | undefined): readonly FilterArg[] {
  return isFinance(access) ? FINANCE_ARGS : FILTER_ARGS
}

/**
 * The filters a tool call may leave out in a mode: Manager mode never leaves a leader out, HRBP for
 * a business unit never its business unit, and Finance leaves nothing out (whole business units).
 */
export function excludeArgsIn(access: ModeAccess | null | undefined): readonly FilterArg[] {
  if (isFinance(access)) return []
  switch (scopeOfAccess(access)?.kind) {
    case 'org':
      return FILTER_ARGS.filter((a) => a !== 'leader')
    case 'unit':
      return FILTER_ARGS.filter((a) => a !== 'business_unit')
    default:
      return FILTER_ARGS
  }
}

/** What a mode's tool definitions depend on besides the policy: the mode and its scope kind. */
export const toolsKey = (access: ModeAccess | null | undefined): string =>
  `${access?.mode ?? 'developer'}|${scopeOfAccess(access)?.kind ?? (isFinance(access) ? 'finance' : 'none')}`

/** The refusal for a filter Finance does not have. */
export const financeFilterRefused = (word: string): string =>
  `Finance mode filters by business unit and period only, so a ${word} filter is not available. Use business_unit, or leave it out.`

export const FINANCE_NO_EXCLUDE =
  'Finance mode filters by business unit and period only and keeps whole business units, so exclude is not available.'
