/**
 * The Security center's editor as data (docs/SECURITY-CENTER.md, "The editor"): each cell's
 * decision under the draft and whether it is built in, set by the policy in force or changed in
 * the draft; the rows a search, a group and "Changed only" keep; the role page's controls (pay,
 * person card, home) as the surfaces they write; and what a change takes along. Pure.
 */
import { HOME_OF, MODE_LABEL, PICK_OF } from '@/access/modes'
import {
  GUARD_RAILS,
  type GuardId,
  guardEnv,
  guardRailFor,
  homeProblem,
  overridesOf,
  type PolicyLine,
  type PolicyRole,
  ROLE_HOME,
  ROLE_OFFERED,
} from '@/access/overrides'
import { type Access, type Decision, decideUnder, type PolicyOverrides } from '@/access/policy'
import { VIEW_TABS } from '@/access/policy/kit'
import { kindOf, restOf } from '@/access/surfaces'
import type { EditRow, GroupKey } from './inventory'

export type CellState = 'default' | 'in-force' | 'draft'

export interface Cell {
  role: PolicyRole
  decision: Decision
  /** Built in, set by the policy in force (unchanged in the draft), or changed in the draft. */
  state: CellState
  /** The draft's line for this role and surface, when there is one. */
  line: PolicyLine | null
}

const keyOf = (role: string, surface: string) => `${role}|${surface}`

/** Lines by role and surface, for quick lookups while a matrix renders. */
export const indexLines = (lines: readonly PolicyLine[]): Map<string, PolicyLine> =>
  new Map(lines.map((l) => [keyOf(l.role, l.surface), l]))

const sameLine = (a: PolicyLine | undefined, b: PolicyLine | undefined): boolean =>
  !!a && !!b && a.decision === b.decision && (a.how ?? '') === (b.how ?? '')

/** The cell for a row in one role, under the draft. */
export function cellOf(
  row: Pick<EditRow, 'surface' | 'at' | 'info'>,
  role: PolicyRole,
  ov: PolicyOverrides,
  draft: ReadonlyMap<string, PolicyLine>,
  inForce: ReadonlyMap<string, PolicyLine>,
): Cell {
  const k = keyOf(role, row.surface)
  const line = draft.get(k) ?? null
  const was = inForce.get(k)
  const state: CellState = line ? (sameLine(line, was) ? 'in-force' : 'draft') : was ? 'draft' : 'default'
  return { role, decision: decideUnder(ov, role, row.surface, row.at, row.info), state, line }
}

export interface RowFilter {
  group: GroupKey | 'all'
  query: string
  changedOnly: boolean
}

export const NO_ROW_FILTER: RowFilter = { group: 'views', query: '', changedOnly: false }

/** The rows a filter keeps. "Changed only": rows with a line in the draft or in force, in any role. */
export function filterRows(
  rows: readonly EditRow[],
  f: RowFilter,
  draft: readonly PolicyLine[],
  inForce: readonly PolicyLine[],
): EditRow[] {
  const changed = new Set([...draft, ...inForce].map((l) => l.surface))
  const q = f.query.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.changedOnly && !changed.has(r.surface)) return false
    // A search looks through every group.
    if (!q && f.group !== 'all' && r.group !== f.group) return false
    if (q && !`${r.label} ${r.detail}`.toLowerCase().includes(q)) return false
    return true
  })
}

/* ───────────── what a change asks and takes along ───────────── */

/** Why a change is refused, or null: a guard rail, or a home that does not work. */
export function refusal(
  draft: readonly PolicyLine[],
  change: { role: PolicyRole; surface: string; decision: string },
): { rail: GuardId | null; why: string } | null {
  const next = [
    ...draft.filter((l) => !(l.role === change.role && l.surface === change.surface)),
    { ...change, reason: '', by: '', at: '' },
  ]
  const rail = guardRailFor(change, guardEnv(next))
  if (rail) return { rail, why: GUARD_RAILS[rail] }
  if (change.surface === ROLE_HOME) {
    const home = homeProblem(change.role, change.decision, overridesOf(next))
    if (home) return { rail: null, why: home }
  }
  // Hiding the pay switch while amounts stay shown would leave amounts with no switch.
  if (change.surface === 'pay:switch' && change.decision === 'hidden') {
    const amounts = decideUnder(overridesOf(next), change.role, 'pay:amounts').access
    if (amounts !== 'hidden') return { rail: 'switches', why: GUARD_RAILS.switches }
  }
  return null
}

const tabLabels = (view: string): string[] =>
  ((VIEW_TABS as Record<string, readonly { label: string }[]>)[view] ?? []).map((t) => t.label)

/** One sentence on what else a change moves, or null. */
export function knockOn(
  role: PolicyRole,
  surface: string,
  decision: string,
  ov: PolicyOverrides,
): string | null {
  const kind = kindOf(surface)
  const rest = restOf(surface)
  if (kind === 'view' && decision === 'hidden')
    return 'Its tabs, figures, header actions and the metrics shown only there are hidden with it, and its address opens the role’s home.'
  if (kind === 'view' && decision !== 'hidden' && decideUnder(ov, role, surface).access === 'hidden') {
    const tabs = tabLabels(rest)
    return tabs.length
      ? `Its tabs show with it (${tabs.join(', ')}). Hide any the role should not see.`
      : 'It shows with what is on it.'
  }
  if (kind === 'ask' && !rest && decision === 'hidden') return 'Every Ask tool is off with it.'
  if (kind === 'page' && rest === 'data' && decision === 'hidden')
    return 'Every Data room tab and panel is hidden with it.'
  if (surface === ROLE_OFFERED && decision === 'hidden')
    return 'The Mode menu leaves the role out. Anyone already in it stays until they switch.'
  return null
}

/* ───────────── the role page's controls ───────────── */

export type PayLevel = 'none' | 'ratios' | 'totals' | 'switch'

export const PAY_LEVELS: readonly { value: PayLevel; label: string; hint: string }[] = [
  { value: 'none', label: 'None', hint: 'No pay at all: no amounts, totals or ratios.' },
  { value: 'ratios', label: 'Ratios', hint: 'Compa-ratio, range position and merit %, never an amount.' },
  {
    value: 'totals',
    label: 'Totals',
    hint: 'Cost totals over 5 or more people by whole business units, never one person’s pay. Finance only.',
  },
  {
    value: 'switch',
    label: 'Per person, behind the switch',
    hint: 'Amounts per person while Show pay amounts is on, for one session.',
  },
]

const RATIO_SURFACES = ['person:compa-ratio', 'metric:comp.compa.*'] as const

/**
 * The surfaces each pay level writes. Ratios show with the switch and with Ratios, go with None,
 * and stay as the role has them with Totals (Finance sees totals, not ratios).
 */
export function payLines(
  level: PayLevel,
  builtIn: (surface: string) => Access,
): { surface: string; decision: Access; how?: string }[] {
  const ratio: Access | null = level === 'none' ? 'hidden' : level === 'totals' ? null : 'shown'
  const ratios = RATIO_SURFACES.map((surface) => ({ surface, decision: ratio ?? builtIn(surface) }))
  switch (level) {
    case 'switch':
      return [
        { surface: 'pay:switch', decision: 'shown' },
        { surface: 'pay:amounts', decision: 'shown' },
        { surface: 'pay:totals', decision: 'shown' },
        ...ratios,
      ]
    case 'totals':
      return [
        { surface: 'pay:switch', decision: 'hidden' },
        { surface: 'pay:amounts', decision: 'hidden' },
        { surface: 'pay:totals', decision: 'limited', how: 'Totals over 5 or more people.' },
        ...ratios,
      ]
    default:
      return [
        { surface: 'pay:switch', decision: 'hidden' },
        { surface: 'pay:amounts', decision: 'hidden' },
        { surface: 'pay:totals', decision: 'hidden' },
        ...ratios,
      ]
  }
}

/** A role's pay level under a set of overrides. */
export function payLevelOf(role: PolicyRole, ov: PolicyOverrides | null): PayLevel {
  const on = (s: string) => decideUnder(ov, role, s).access !== 'hidden'
  if (on('pay:amounts') && on('pay:switch')) return 'switch'
  if (on('pay:totals')) return 'totals'
  return on('person:compa-ratio') ? 'ratios' : 'none'
}

export type CardLevel = 'full' | 'limited' | 'none'

export const CARD_LEVELS: readonly { value: CardLevel; label: string; access: Access }[] = [
  { value: 'full', label: 'Full', access: 'shown' },
  { value: 'limited', label: 'Limited', access: 'limited' },
  { value: 'none', label: 'None', access: 'hidden' },
]

export function cardLevelOf(role: PolicyRole, ov: PolicyOverrides | null): CardLevel {
  const a = decideUnder(ov, role, 'person:inside-org').access
  return a === 'shown' ? 'full' : a === 'limited' ? 'limited' : 'none'
}

/** The views a role could open on: the ones it shows, its own home first. */
export function homeChoices(
  role: PolicyRole,
  ov: PolicyOverrides | null,
  views: readonly { key: string; label: string }[],
) {
  if (PICK_OF[role]) return views.filter((v) => v.key === HOME_OF[role])
  return views.filter(
    (v) =>
      v.key === HOME_OF[role] ||
      (v.key !== 'team' && decideUnder(ov, role, `view:${v.key}`).access !== 'hidden'),
  )
}

/** "Finance: Recruiting". */
export const cellTitle = (role: PolicyRole, label: string): string => `${MODE_LABEL[role]}: ${label}`

export const ACCESS_WORD: Readonly<Record<Access, string>> = {
  shown: 'Shown',
  limited: 'Limited',
  hidden: 'Hidden',
}
