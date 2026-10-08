/**
 * Offer decline reasons and their themes (docs/ANALYSES.md, 3.2). Candidates' Rejection reason
 * holds why a declined offer was declined, in the ATS's own words; this reads it onto the Offer
 * decline reasons list (Census's reasons plus any you add, each with a theme). It reads declines
 * only: Rejection reason also holds why candidates were turned down, so the field is not checked
 * against this list and nothing is rewritten on import. Pure.
 */
import { normText } from '../import/text'
import { OFFER_DECLINE_REASONS, type OfferDeclineTheme } from '../schema'
import { listKey } from './defs'
import { officialLists, type SourceKinds } from './effective'
import type { ListsState, ListValue } from './types'

export interface DeclineReasonRead {
  /** The reason on the list, or the text as written when it is not recognized. */
  reason: string
  theme: OfferDeclineTheme
  /** On the list, or read from known words. Unrecognized text sits under the Other theme. */
  recognized: boolean
}

const THEMES = new Set<string>(['Competition', 'Pay', 'Role', 'Logistics', 'Process', 'Personal', 'Other'])
const isTheme = (v: unknown): v is OfferDeclineTheme => typeof v === 'string' && THEMES.has(v)

const word = (...phrases: string[]) => new RegExp(`\\b(?:${phrases.join('|')})\\b`)

/** Known wording, in the order tried: a counteroffer before any other offer wording. */
const RULES: readonly (readonly [RegExp, string])[] = [
  [
    word('counter ?offers?', 'counter', 'countered', 'current employer', 'retained by'),
    'Counteroffer from current employer',
  ],
  [
    word(
      'competing offers?',
      'accepted another offer',
      'another offer',
      'other offer',
      'better offer',
      'went with another (?:company|employer)',
      'another company',
      'another employer',
      'accepted (?:a|an) (?:different|other) (?:offer|role|position)',
      'competitor',
    ),
    'Accepted competing offer',
  ],
  [word('equity', 'bonus', 'total rewards', 'rsus?', 'stock', 'benefits'), 'Equity, bonus or total rewards'],
  [
    word('salary', 'comp', 'compensation', 'pay', 'money', 'base', 'offer too low', 'low offer'),
    'Compensation below expectations',
  ],
  [word('relocation', 'relocate', 'commute', 'location', 'move', 'remote', 'visa'), 'Location or relocation'],
  [word('notice period', 'notice', 'start date', 'joining date'), 'Start date or notice period'],
  [word('too long', 'took too long', 'slow', 'process', 'delays?'), 'Process took too long'],
  [word('team', 'manager', 'hiring manager', 'culture'), 'Team or manager'],
  [word('role', 'level', 'title', 'scope', 'responsibilit(?:y|ies)', 'seniority'), 'Role or level'],
  [word('personal', 'family', 'health'), 'Personal reasons'],
]

const BUILT_IN_THEME = new Map(OFFER_DECLINE_REASONS.map((r) => [r.reason, r.theme]))

/** The theme of a reason on the list: its saved theme, else Census's, else Other. */
function themeOf(v: ListValue): OfferDeclineTheme {
  const t = v.attrs?.theme
  return isTheme(t) ? t : (BUILT_IN_THEME.get(v.value) ?? 'Other')
}

/**
 * The reason and theme of a declined offer's Rejection reason. `list` is the Offer decline
 * reasons list in force (Census's reasons when left out); null for a blank reason.
 */
export function readDeclineReason(
  raw: unknown,
  list: readonly ListValue[] = OFFER_DECLINE_REASONS.map((r) => ({
    value: r.reason,
    attrs: { theme: r.theme },
  })),
): DeclineReasonRead | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const text = raw.trim().replace(/\s+/g, ' ')
  const key = listKey(text)
  const onList = list.find((v) => !v.retired && listKey(v.value) === key)
  if (onList) return { reason: onList.value, theme: themeOf(onList), recognized: true }
  // A retired reason reads as the one that replaced it.
  const retired = list.find((v) => v.retired && listKey(v.value) === key)
  const replacement = retired?.replacedBy ? list.find((v) => v.value === retired.replacedBy) : undefined
  if (replacement) return { reason: replacement.value, theme: themeOf(replacement), recognized: true }
  const t = normText(text)
  for (const [re, reason] of RULES)
    if (re.test(t)) {
      const v = list.find((x) => x.value === reason)
      return { reason, theme: v ? themeOf(v) : (BUILT_IN_THEME.get(reason) ?? 'Other'), recognized: true }
    }
  return { reason: text, theme: 'Other', recognized: false }
}

const contextMemo = new WeakMap<ListsState, Map<string, readonly ListValue[]>>()

/**
 * The Offer decline reasons list in force for the analytics context: the one you saved, else
 * Census's. Memoized on the saved lists, so the context keeps the same array while they stay.
 */
export function contextDeclineReasons(saved: ListsState, sources: SourceKinds): readonly ListValue[] {
  let byKey = contextMemo.get(saved)
  if (!byKey) {
    byKey = new Map()
    contextMemo.set(saved, byKey)
  }
  const key = Object.keys(sources)
    .filter((k) => sources[k as keyof SourceKinds]?.kind === 'upload')
    .sort()
    .join(',')
  let hit = byKey.get(key)
  if (!hit) {
    hit = officialLists(saved, sources).offerDeclineReason?.values ?? []
    byKey.set(key, hit)
  }
  return hit
}
