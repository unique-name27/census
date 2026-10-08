/**
 * One severity rubric for every item (docs/ACTION-CENTER-AUDIT.md 4.2 and 3.6; docs/ROLES-V2.md
 * 5.14), applied when the Action center collects items so a "Critical" means the same thing
 * whichever view raised it:
 *
 *  - **Critical**: legal or regulatory exposure (`exposure`), or a person blocked past the overdue
 *    limit: a candidate waiting on a review, an interview, a decision or an offer, or a start
 *    waiting on a day-one task or an I-9, more than `blockedDays` overdue.
 *  - **Watch**: overdue. A person-blocking item overdue by less than the limit reads Watch, however
 *    its view's own aging tier rates it, and an overdue item is never only a Note.
 *  - **Note**: due soon, or for awareness.
 *
 * Items about a group or a record rather than a waiting person keep their view's thresholds,
 * which are settings on the item's metric (a req at 2.5 times its time-to-fill target, a plan
 * line 25% behind, a critical role at high risk of loss, three regretted exits from one team).
 * Pure.
 */
import { itemKindOf, kindMatches } from '@/access/policy/routing'
import type { Severity } from '@/components/types'
import type { ISODate } from '@/data/schema'
import type { ActionItem } from '@/views/types'
import { daysToDue } from './due'

/** Kinds where a person waits on the item: a candidate's next step, a start's day-one task or I-9. */
export const BLOCKS_PERSON: readonly string[] = [
  'recruiting:review',
  'recruiting:schedule-*',
  'recruiting:decision',
  'recruiting:offer',
  'recruiting:offer-answer',
  'onboarding:task',
  'onboarding:i9',
]

export const blocksPerson = (item: Pick<ActionItem, 'id'>): boolean =>
  kindMatches(itemKindOf(item.id), BLOCKS_PERSON)

/** The rubric's severity for an item, against the as-of date and the overdue limit in days. */
export function severityOf(
  item: Pick<ActionItem, 'id' | 'severity' | 'due' | 'exposure'>,
  asOf: ISODate,
  blockedDays: number,
): Severity {
  if (item.exposure) return 'critical'
  const d = daysToDue(item.due, asOf)
  if (blocksPerson(item)) {
    if (d != null && d < -blockedDays) return 'critical'
    if (d != null && d < 0) return 'warning'
    // Not overdue yet (or no due date): never critical.
    return item.severity === 'critical' ? 'warning' : item.severity
  }
  if (d != null && d < 0 && (item.severity === 'info' || item.severity === 'good')) return 'warning'
  return item.severity
}
