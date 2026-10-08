/**
 * The Security center's draft (docs/SECURITY-CENTER.md): the override lines it would publish, the
 * change log (who typed their name, when, why), and the readable lists of changes. Kept in this
 * browser (`census:access-draft`) and in the settings file; the policy in force never changes
 * because of a draft. Pure but for `loadDraft` and `saveDraft`, which take a storage.
 */
import { HOME_OF, MODE_LABEL } from '../modes'
import { decideUnder, type PolicyOverrides } from '../policy'
import { overridesOf } from './lines'
import { isAccess, isPolicyRole, type PolicyLine, type PolicyRole, ROLE_HOME, ROLE_OFFERED } from './types'

export const DRAFT_KEY = 'census:access-draft'

export interface DraftLogEntry {
  at: string
  by: string
  /** "Finance: Recruiting shown (was hidden)". */
  what: string
  why: string
}

export interface Draft {
  v: 1
  /** Every override the draft would publish. */
  lines: PolicyLine[]
  /** The checksum of the policy in force when the draft started; '' for the defaults. */
  base: string
  log: DraftLogEntry[]
  /** The name typed last, offered next time. */
  author: string
  /** Notes for the next publish. */
  notes: string
}

export const emptyDraft = (lines: readonly PolicyLine[] = [], base = ''): Draft => ({
  v: 1,
  lines: [...lines],
  base,
  log: [],
  author: '',
  notes: '',
})

/** Words for a decision in a sentence. */
export const DECISION_WORD: Readonly<Record<string, string>> = {
  shown: 'shown',
  limited: 'limited',
  hidden: 'hidden',
}

/** Names surfaces in sentences ("Recruiting", "Recruiting, Pipeline", "The Data room"). */
export type LabelOf = (surface: string) => string

const keyOf = (role: string, surface: string) => `${role}|${surface}`

/** The value a role setting or surface has under a set of lines (the default when none names it). */
export function valueUnder(
  lines: readonly PolicyLine[],
  ov: PolicyOverrides | null,
  role: PolicyRole,
  surface: string,
): string {
  if (surface === ROLE_HOME)
    return (
      [...lines].reverse().find((l) => l.role === role && l.surface === ROLE_HOME)?.decision ?? HOME_OF[role]
    )
  if (surface === ROLE_OFFERED)
    return (
      [...lines].reverse().find((l) => l.role === role && l.surface === ROLE_OFFERED)?.decision ?? 'shown'
    )
  return decideUnder(ov, role, surface).access
}

/** The built-in value of a surface or role setting. */
export const defaultValue = (role: PolicyRole, surface: string): string =>
  surface === ROLE_HOME
    ? HOME_OF[role]
    : surface === ROLE_OFFERED
      ? 'shown'
      : decideUnder(null, role, surface).access

/** "Finance: Recruiting shown (was hidden)"; role settings in their own words. */
export function changeText(
  role: PolicyRole,
  surface: string,
  after: string,
  before: string,
  label: LabelOf,
): string {
  const who = MODE_LABEL[role]
  if (surface === ROLE_HOME)
    return `${who}: opens on ${label(`view:${after}`)} (was ${label(`view:${before}`)})`
  if (surface === ROLE_OFFERED)
    return after === 'hidden' ? `${who}: left out of the Mode menu` : `${who}: offered in the Mode menu again`
  return `${who}: ${label(surface)} ${DECISION_WORD[after] ?? after} (was ${DECISION_WORD[before] ?? before})`
}

export interface Stamp {
  reason: string
  by: string
  /** ISO date and time. */
  at: string
}

/**
 * Set one surface for one role. A value equal to the built-in default takes the override out, so
 * the draft only holds what differs. Logged with who, when and why.
 */
export function setInDraft(
  draft: Draft,
  change: { role: PolicyRole; surface: string; decision: string; how?: string },
  stamp: Stamp,
  label: LabelOf,
): Draft {
  const { role, surface, decision } = change
  const ov = overridesOf(draft.lines)
  const before = valueUnder(draft.lines, ov, role, surface)
  const rest = draft.lines.filter((l) => keyOf(l.role, l.surface) !== keyOf(role, surface))
  const isDefault = decision === defaultValue(role, surface) && !(decision === 'limited' && change.how)
  const lines = isDefault
    ? rest
    : [
        ...rest,
        {
          role,
          surface,
          decision,
          reason: stamp.reason.trim(),
          by: stamp.by.trim(),
          at: stamp.at,
          ...(decision === 'limited' && change.how?.trim() ? { how: change.how.trim() } : {}),
        },
      ]
  return {
    ...draft,
    lines,
    author: stamp.by.trim() || draft.author,
    log: [
      ...draft.log,
      {
        at: stamp.at,
        by: stamp.by.trim(),
        what: changeText(role, surface, decision, before, label),
        why: stamp.reason.trim(),
      },
    ],
  }
}

/** Several changes under one reason (the Pay control writes three or more surfaces). */
export function setManyInDraft(
  draft: Draft,
  changes: readonly { role: PolicyRole; surface: string; decision: string; how?: string }[],
  stamp: Stamp,
  label: LabelOf,
): Draft {
  return changes.reduce((d, c) => setInDraft(d, c, stamp, label), draft)
}

/** Every override of one role out of the draft: the role back on its defaults. */
export function resetRoleInDraft(draft: Draft, role: PolicyRole, stamp: Stamp): Draft {
  const lines = draft.lines.filter((l) => l.role !== role)
  if (lines.length === draft.lines.length) return draft
  return {
    ...draft,
    lines,
    author: stamp.by.trim() || draft.author,
    log: [
      ...draft.log,
      {
        at: stamp.at,
        by: stamp.by.trim(),
        what: `${MODE_LABEL[role]}: back to the defaults`,
        why: stamp.reason.trim(),
      },
    ],
  }
}

/** One change undone: the surface back to what is in force. */
export function undoInDraft(
  draft: Draft,
  inForce: readonly PolicyLine[],
  role: PolicyRole,
  surface: string,
  stamp: Stamp,
  label: LabelOf,
): Draft {
  const was = inForce.find((l) => l.role === role && l.surface === surface)
  const rest = draft.lines.filter((l) => keyOf(l.role, l.surface) !== keyOf(role, surface))
  const before = valueUnder(draft.lines, overridesOf(draft.lines), role, surface)
  const after = was ? was.decision : defaultValue(role, surface)
  return {
    ...draft,
    lines: was ? [...rest, was] : rest,
    log: [
      ...draft.log,
      {
        at: stamp.at,
        by: stamp.by.trim() || draft.author,
        what: `Undone: ${changeText(role, surface, after, before, label)}`,
        why: stamp.reason.trim(),
      },
    ],
  }
}

/** The draft replaced by a file's lines (Import), logged. */
export function importIntoDraft(
  draft: Draft,
  lines: readonly PolicyLine[],
  stamp: Stamp,
  what: string,
): Draft {
  return {
    ...draft,
    lines: [...lines],
    author: stamp.by.trim() || draft.author,
    log: [...draft.log, { at: stamp.at, by: stamp.by.trim(), what, why: stamp.reason.trim() }],
  }
}

/* ───────────── changes, as readable lists ───────────── */

export interface Change {
  role: PolicyRole
  surface: string
  /** The value before (in force, or the default) and after (the draft). */
  before: string
  after: string
  /** The draft line's reason, who and when; empty when the change takes an override out. */
  reason: string
  by: string
  at: string
  text: string
}

/** The draft against what is in force: one entry per role and surface whose override differs. */
export function draftChanges(
  draft: readonly PolicyLine[],
  inForce: readonly PolicyLine[],
  label: LabelOf,
): Change[] {
  const a = overridesOf(inForce)
  const b = overridesOf(draft)
  const keys = new Map<string, { role: PolicyRole; surface: string }>()
  for (const l of [...inForce, ...draft])
    keys.set(keyOf(l.role, l.surface), { role: l.role, surface: l.surface })
  const out: Change[] = []
  for (const { role, surface } of keys.values()) {
    const lineA = inForce.find((l) => l.role === role && l.surface === surface)
    const lineB = draft.find((l) => l.role === role && l.surface === surface)
    if (lineA && lineB && lineA.decision === lineB.decision && (lineA.how ?? '') === (lineB.how ?? ''))
      continue
    const before = valueUnder(inForce, a, role, surface)
    const after = valueUnder(draft, b, role, surface)
    const text = changeText(role, surface, after, before, label)
    out.push({
      role,
      surface,
      before,
      after,
      reason: lineB?.reason ?? '',
      by: lineB?.by ?? '',
      at: lineB?.at ?? '',
      // An override that changes nothing on screen (another one above it decides) still changes the file.
      text: before === after ? `${text.replace(/ \(was [^)]*\)$/, '')} (no change on screen)` : text,
    })
  }
  return out.sort((x, y) => x.text.localeCompare(y.text))
}

/** What is in force against the defaults: each line, with the default it replaces. */
export function inForceChanges(inForce: readonly PolicyLine[], label: LabelOf): Change[] {
  const ov = overridesOf(inForce)
  return inForce.map((l) => {
    const before = defaultValue(l.role, l.surface)
    const after = valueUnder(inForce, ov, l.role, l.surface)
    return {
      role: l.role,
      surface: l.surface,
      before,
      after,
      reason: l.reason,
      by: l.by,
      at: l.at,
      text: changeText(l.role, l.surface, after, before, label),
    }
  })
}

/* ───────────── kept in this browser ───────────── */

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** Read a stored or imported draft; anything unreadable is null. Lines with a role Census lacks are dropped. */
export function parseDraft(v: unknown): Draft | null {
  if (!v || typeof v !== 'object') return null
  const d = v as Partial<Draft>
  if (d.v !== 1 || !Array.isArray(d.lines)) return null
  const str = (x: unknown) => (typeof x === 'string' ? x : '')
  const lines = d.lines
    .filter((l): l is PolicyLine => !!l && typeof l === 'object' && isPolicyRole((l as PolicyLine).role))
    .filter((l) => typeof l.surface === 'string' && typeof l.decision === 'string')
    .filter((l) => l.surface.startsWith('role:') || isAccess(l.decision))
    .map((l) => ({
      role: l.role,
      surface: l.surface,
      decision: l.decision,
      reason: str(l.reason),
      by: str(l.by),
      at: str(l.at),
      ...(typeof l.how === 'string' && l.how ? { how: l.how } : {}),
    }))
  const log = Array.isArray(d.log)
    ? d.log
        .filter((e): e is DraftLogEntry => !!e && typeof e === 'object')
        .map((e) => ({ at: str(e.at), by: str(e.by), what: str(e.what), why: str(e.why) }))
    : []
  return { v: 1, lines, base: str(d.base), log, author: str(d.author), notes: str(d.notes) }
}

export function loadDraft(storage: StorageLike | null): Draft | null {
  try {
    const raw = storage?.getItem(DRAFT_KEY)
    return raw ? parseDraft(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/** Save the draft; false when this browser would not keep it (it lasts for this visit). */
export function saveDraft(draft: Draft, storage: StorageLike | null): boolean {
  try {
    if (!storage) return false
    storage.setItem(DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}
