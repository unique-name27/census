/**
 * The change dialog's content for each kind of change: one surface in one role, a role's place in
 * the Mode menu, the view it opens on, its pay level and its person card.
 */
import { HOME_OF, MODE_LABEL } from '@/access/modes'
import { overridesOf, type PolicyLine, type PolicyRole, ROLE_HOME, ROLE_OFFERED } from '@/access/overrides'
import { type Access, decideUnder } from '@/access/policy'
import type { EditRow } from '../inventory'
import { surfaceLabel } from '../inventory'
import {
  ACCESS_WORD,
  CARD_LEVELS,
  type CardLevel,
  cardLevelOf,
  cellTitle,
  homeChoices,
  knockOn,
  PAY_LEVELS,
  type PayLevel,
  payLevelOf,
  payLines,
  refusal,
} from '../model'
import type { ChangeSpec } from './ChangeDialog'

const ACCESS_OPTIONS = [
  { value: 'shown', label: 'Shown', hint: 'As in HR mode.' },
  { value: 'limited', label: 'Limited', hint: 'Shown, with a limit stated in one sentence.' },
  { value: 'hidden', label: 'Hidden', hint: 'Not rendered, exported, linked or offered to Ask.' },
]
const FIGURE_OPTIONS = ACCESS_OPTIONS.filter((o) => o.value !== 'limited')

/** One surface in one role. */
export function surfaceSpec(
  row: EditRow,
  role: PolicyRole,
  draft: readonly PolicyLine[],
  inForce: readonly PolicyLine[],
): ChangeSpec {
  const ov = overridesOf(draft)
  const now = decideUnder(ov, role, row.surface, row.at, row.info)
  const builtIn = decideUnder(null, role, row.surface, row.at, row.info)
  const forced = decideUnder(overridesOf(inForce), role, row.surface, row.at, row.info)
  const line = draft.find((l) => l.role === role && l.surface === row.surface)
  const figure = row.surface.startsWith('figure:')
  return {
    role,
    title: cellTitle(role, row.label),
    description: `${row.detail}. Built in: ${ACCESS_WORD[builtIn.access]}${builtIn.how ? `. ${builtIn.how}` : '.'}`,
    options: figure ? FIGURE_OPTIONS : ACCESS_OPTIONS,
    current: now.access,
    builtIn: builtIn.access,
    inForce: forced.access,
    how: line?.how ?? '',
    asksHow: true,
    changes: (value, how) => [
      {
        surface: row.surface,
        decision: value,
        ...(value === 'limited' && how.trim() ? { how: how.trim() } : {}),
      },
    ],
    refuse: (value) => refusal(draft, { role, surface: row.surface, decision: value })?.why ?? null,
    knockOn: (value) => knockOn(role, row.surface, value, ov),
  }
}

const lastValue = (lines: readonly PolicyLine[], role: PolicyRole, surface: string): string | undefined =>
  [...lines].reverse().find((l) => l.role === role && l.surface === surface)?.decision

/** Offered in the Mode menu, or left out. */
export function offeredSpec(
  role: PolicyRole,
  draft: readonly PolicyLine[],
  inForce: readonly PolicyLine[],
): ChangeSpec {
  return {
    role,
    title: `${MODE_LABEL[role]}: in the Mode menu`,
    description:
      'Whether the Mode menu and Settings, Mode offer this role. Anyone can still switch to the roles it offers.',
    options: [
      { value: 'shown', label: 'Offered', hint: 'Listed in the Mode menu.' },
      { value: 'hidden', label: 'Left out', hint: 'Not listed. A preview from here still opens it.' },
    ],
    current: lastValue(draft, role, ROLE_OFFERED) ?? 'shown',
    builtIn: 'shown',
    inForce: lastValue(inForce, role, ROLE_OFFERED) ?? 'shown',
    changes: (value) => [{ surface: ROLE_OFFERED, decision: value }],
    refuse: (value) => refusal(draft, { role, surface: ROLE_OFFERED, decision: value })?.why ?? null,
    knockOn: (value) => knockOn(role, ROLE_OFFERED, value, overridesOf(draft)),
  }
}

/** The view a role opens on. */
export function homeSpec(
  role: PolicyRole,
  draft: readonly PolicyLine[],
  inForce: readonly PolicyLine[],
  views: readonly { key: string; label: string }[],
): ChangeSpec {
  const ov = overridesOf(draft)
  const choices = homeChoices(role, ov, views)
  return {
    role,
    title: `${MODE_LABEL[role]}: opens on`,
    description: 'The view the role opens on, and where an address to something it does not show goes.',
    options: choices.map((v) => ({ value: v.key, label: surfaceLabel(`view:${v.key}`) })),
    current: lastValue(draft, role, ROLE_HOME) ?? HOME_OF[role],
    builtIn: HOME_OF[role],
    inForce: lastValue(inForce, role, ROLE_HOME) ?? HOME_OF[role],
    changes: (value) => [{ surface: ROLE_HOME, decision: value }],
    refuse: (value) => refusal(draft, { role, surface: ROLE_HOME, decision: value })?.why ?? null,
  }
}

/** None, ratios, totals, or per person behind the switch. */
export function paySpec(
  role: PolicyRole,
  draft: readonly PolicyLine[],
  inForce: readonly PolicyLine[],
): ChangeSpec {
  const ov = overridesOf(draft)
  const builtInOf = (s: string): Access => decideUnder(null, role, s).access
  return {
    role,
    title: `${MODE_LABEL[role]}: pay`,
    description:
      'What the role sees of pay. Amounts per person only ever show behind Show pay amounts, for one session.',
    options: PAY_LEVELS,
    current: payLevelOf(role, ov),
    builtIn: payLevelOf(role, null),
    inForce: payLevelOf(role, overridesOf(inForce)),
    changes: (value) =>
      payLines(value as PayLevel, builtInOf).map((c) =>
        // A limit equal to the built-in keeps the built-in sentence.
        c.decision === builtInOf(c.surface) ? { surface: c.surface, decision: c.decision } : c,
      ),
    refuse: (value) => {
      let lines = [...draft]
      for (const c of payLines(value as PayLevel, builtInOf)) {
        const r = refusal(lines, { role, surface: c.surface, decision: c.decision })
        if (r) return r.why
        lines = [
          ...lines.filter((l) => !(l.role === role && l.surface === c.surface)),
          { role, ...c, reason: '', by: '', at: '' },
        ]
      }
      return null
    },
  }
}

/** The person card: full, limited or none. */
export function cardSpec(
  role: PolicyRole,
  draft: readonly PolicyLine[],
  inForce: readonly PolicyLine[],
): ChangeSpec {
  const ov = overridesOf(draft)
  const access = (v: string): Access => CARD_LEVELS.find((c) => c.value === v)?.access ?? 'shown'
  const builtIn = decideUnder(null, role, 'person:inside-org')
  return {
    role,
    title: `${MODE_LABEL[role]}: person card`,
    description: `The card that opens on a person's name, inside the role's scope. Built in: ${ACCESS_WORD[builtIn.access]}${builtIn.how ? `. ${builtIn.how}` : '.'}`,
    options: CARD_LEVELS.map((c) => ({ value: c.value, label: c.label })),
    current: cardLevelOf(role, ov),
    builtIn: cardLevelOf(role, null),
    inForce: cardLevelOf(role, overridesOf(inForce)),
    asksHow: false,
    changes: (value) => [{ surface: 'person:inside-org', decision: access(value as CardLevel) }],
    refuse: (value) =>
      refusal(draft, { role, surface: 'person:inside-org', decision: access(value as CardLevel) })?.why ??
      null,
  }
}
