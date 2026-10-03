/**
 * Ready-to-send notes for the action queue, one per owner, composed per needed action. Tone rules
 * from the user's tool: polite, professional asks; never "chase" or any nagging verb; interview
 * decisions are a leader ask ("Could you ask the panel to submit scorecards and make a decision
 * this week?"). Plain text so it pastes into email or chat.
 */
import { formatDate } from '@/lib/dates'
import { type ActiveItem, LAST_OPEN_STAGE } from './types'

const STAGE_NOUN = ['application', 'screen', 'hiring manager interview', 'onsite', 'offer']

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const shortDate = (d: string) => formatDate(d).replace(/ \d{4}$/, '')

function bullet(x: ActiveItem, tail: string): string {
  const title = x.app.title && x.app.title !== '—' ? `, ${x.app.title}` : ''
  return `- ${x.app.name}${title} (${x.app.reqId}), ${tail}`
}

/** The note for one owner's queue items (scheduled candidates are in motion and never asked about). */
export function ownerNote(owner: string, items: readonly ActiveItem[]): string {
  const review: ActiveItem[] = []
  const sched: ActiveItem[] = []
  const decision: ActiveItem[] = []
  const pending: ActiveItem[] = []
  const offers: ActiveItem[] = []
  for (const x of items) {
    if (x.state === 'scheduled') continue
    if (x.state === 'awaiting-feedback') decision.push(x)
    else if (x.state === 'offer-out') offers.push(x)
    else if (x.stage === 0) review.push(x)
    else if (x.stage === LAST_OPEN_STAGE) pending.push(x)
    else sched.push(x)
  }
  const blocks: string[] = []
  if (decision.length) {
    if (decision.length === 1) {
      const x = decision[0]
      const title = x.app.title && x.app.title !== '—' ? ` (${x.app.title})` : ''
      blocks.push(
        `Could you ask the panel to submit scorecards for ${x.app.name}${title}, who interviewed on ${shortDate(x.since)}, and make a decision this week?`,
      )
    } else {
      blocks.push(
        [
          `${decision.length} candidates have interviewed and are waiting on scorecards or a decision:`,
          ...decision.map((x) => bullet(x, `interviewed ${shortDate(x.since)}`)),
          'Could you ask the panel to submit scorecards and make a decision this week?',
        ].join('\n'),
      )
    }
  }
  if (sched.length) {
    blocks.push(
      [
        `${sched.length} ${plural(sched.length, 'candidate is', 'candidates are')} waiting for an interview to be scheduled:`,
        ...sched.map((x) => bullet(x, `${STAGE_NOUN[x.stage]}, ${x.daysInStage} days waiting`)),
        'Can we get these on the calendar this week?',
      ].join('\n'),
    )
  }
  if (review.length) {
    blocks.push(
      [
        `${review.length} new ${plural(review.length, 'application still needs', 'applications still need')} a first review:`,
        ...review.map((x) => bullet(x, `applied ${shortDate(x.app.appliedDate)}`)),
        `Could you review ${plural(review.length, 'it', 'them')} this week?`,
      ].join('\n'),
    )
  }
  if (pending.length) {
    blocks.push(
      [
        `${pending.length} ${plural(pending.length, 'offer is', 'offers are')} approved but not yet sent:`,
        ...pending.map((x) => bullet(x, `${x.daysInStage} days at offer`)),
        `Can we get ${plural(pending.length, 'it', 'them')} out this week?`,
      ].join('\n'),
    )
  }
  if (offers.length) {
    blocks.push(
      [
        `${offers.length} ${plural(offers.length, 'offer is', 'offers are')} out and waiting on an answer:`,
        ...offers.map((x) => bullet(x, `offer sent ${shortDate(x.since)}, ${x.days} days ago`)),
        'Worth a follow-up call?',
      ].join('\n'),
    )
  }
  if (!blocks.length) return ''
  return [`Hi ${firstName(owner)},`, ...blocks, 'Thank you.'].join('\n\n')
}
