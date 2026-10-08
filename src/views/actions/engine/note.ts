/**
 * "Copy note": one polite, plain-text message per owner, ready to paste into email or chat.
 * Tone rules (ARCHITECTURE.md, recruiting tone): a greeting, the items with what is open and the
 * view's own polite ask, and a thank you. Never chase, push, nag, ping, hound or remind; an ask
 * that uses one of those words is replaced by a neutral one. Interview decisions keep their
 * view's wording ("Could you ask the panel to submit scorecards ... and make a decision this
 * week?"). An employee relations item says only what its view says, which names no person.
 * Pure.
 */
import type { ISODate } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { firstName } from '@/views/hrbp/engine/owners'
import type { OpenAction } from './collect'

/** Words the tone rules rule out, anywhere in a note. */
export const NAGGING = /\b(chas\w*|push\w*|nag\w*|ping\w*|hound\w*|unblock\w*|remind\w*)\b/i

/** The ask used when an item has none, or its own breaks the tone rules. */
export const DEFAULT_ASK = 'Could you let me know where this stands?'

/** Items listed in one note; the rest are counted. */
export const NOTE_MAX_ITEMS = 25

export interface NoteOwner {
  name: string
  isTeam: boolean
}

export function greeting(owner: NoteOwner): string {
  const name = owner.name.trim()
  if (!owner.isTeam) return `Hi ${firstName(name)},`
  if (/^hr business partner$/i.test(name)) return 'Hello,'
  return /\bteam$/i.test(name) ? `Hi ${name},` : `Hi ${name} team,`
}

const shortDate = (d: string) => formatDate(d).replace(/ \d{4}$/, '')
const sentence = (s: string) => {
  const t = s.trim()
  return /[.?!]$/.test(t) ? t : `${t}.`
}

/** "Due 3 Oct 2026." unless the item already says its date. */
function duePhrase(a: OpenAction): string {
  const own = a.item.forOwner
  // The owner's wording carries its own due date when HR's would say more than the owner reads.
  const due = own?.due !== undefined ? own.due : a.item.due
  if (!due) return ''
  const text = `${own?.what ?? a.item.what} ${a.item.note ?? ''}`
  if (text.includes(formatDate(due)) || text.includes(shortDate(due))) return ''
  return ` Due ${formatDate(due)}.`
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The item's polite ask, or a neutral one when it has none or it breaks the tone rules. `me` is
 * who sends the note (the manager in Manager mode): an ask to review something "with" them reads
 * "together", never their own name in the third person.
 */
export function askOf(a: OpenAction, me?: string | null): string {
  const note = a.item.note?.trim()
  if (!note || NAGGING.test(note)) return DEFAULT_ASK
  let out = note
  const name = me?.trim()
  if (name)
    for (const n of new Set([name, firstName(name)]))
      out = out.replace(new RegExp(` with ${escapeRe(n)}(?=[\\s,.?!]|$)`, 'g'), ' together')
  return sentence(out)
}

/**
 * One numbered entry: what it is about, what is open (and when it is due), and the ask. A note
 * goes to the item's owner, so an item worded for them (`forOwner`) reads that way: a manager
 * reads "4 exits from your team", never HR's "regretted exits" about their team by name.
 */
function entry(a: OpenAction, n: number, me?: string | null): string {
  const own = a.item.forOwner
  return [
    `${n}. ${own?.subject ?? a.item.subject.label}`,
    `   ${sentence(own?.what ?? a.item.what)}${duePhrase(a)}`,
    `   ${askOf(a, me)}`,
  ].join('\n')
}

/**
 * The note for one owner's items, in the order given. Empty when there are none. `opts.me` is
 * the sender when the mode names one (Manager, Recruiter): asks that name them read "together".
 */
export function composeNote(
  owner: NoteOwner,
  items: readonly OpenAction[],
  asOf: ISODate,
  opts: { me?: string | null } = {},
): string {
  if (!items.length) return ''
  const n = items.length
  const whom = owner.isTeam ? 'your team' : 'you'
  const intro =
    n === 1
      ? `Here is one open item for ${whom}, as of ${formatDate(asOf)}.`
      : `Here are ${n} open items for ${whom}, as of ${formatDate(asOf)}.`
  const listed = items.slice(0, NOTE_MAX_ITEMS)
  const rest = n - listed.length
  const blocks = [greeting(owner), intro, listed.map((a, i) => entry(a, i + 1, opts.me)).join('\n\n')]
  if (rest > 0)
    blocks.push(`There ${rest === 1 ? 'is 1 more' : `are ${rest} more`}; I can send the full list.`)
  blocks.push(
    `${n === 1 ? 'If this is' : 'If any of these are'} already done, let me know and I will update the list. Thank you.`,
  )
  return blocks.join('\n\n')
}
