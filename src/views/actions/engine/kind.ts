/**
 * What kind of work an item is ("Interview decision", "Required training overdue", "Case past
 * target"), for "What is waiting, by kind". A view may set `ActionItem.kind`; otherwise the kind
 * comes from the item id ('<view>:<kind>:<record>'), and an id this file does not know falls back
 * to the view's label, so a new kind of item still shows (under its view) until it is named here.
 *
 * Labels are category level: an employee relations case reads "Case past target", never its
 * subcategory or the person. Pure.
 */
import type { ActionItem } from '@/views/types'

/** Kind labels by the id's view and kind ('recruiting:decision'), or a prefix of the kind ending in '-'. */
export const KIND_LABEL: Readonly<Record<string, string>> = {
  'recruiting:decision': 'Interview decision',
  'recruiting:offer-answer': 'Offer awaiting an answer',
  'recruiting:review': 'Application to review',
  'recruiting:offer': 'Offer to send',
  'recruiting:schedule-': 'Interview to schedule',
  'recruiting:empty-funnel': 'Empty funnel',
  'onboarding:task': 'Day-one task',
  'onboarding:probation': 'Probation decision',
  'onboarding:i9': 'I-9 Section 2',
  'hrbp:span': 'Span of control',
  'hrbp:stay-conversations': 'Stay conversations',
  'org:new-manager': 'New manager with a large team',
  'org:single-report-chain': 'Single-report chain',
  'talent:training-overdue': 'Required training overdue',
  'talent:promotion-overdue': 'Promotion to review',
  'talent:critical-role': 'Critical role without a ready successor',
  'services:case': 'Case past target',
  'services:tx': 'Transaction past due',
  'services:return': 'Return from leave',
  'compliance:reverification': 'Work authorization to reverify',
  'compliance:i9': 'I-9 Section 2',
  'compliance:license': 'Export license',
  'comp:below-minimum': 'Pay below range minimum',
  'comp:guideline-exception': 'Merit outside guideline',
  'listening:manager': 'Low upward feedback',
  'listening:stay': 'Stay risk',
  'listening:exit': 'Exit survey reason',
  'listening:readiness': 'Day-30 readiness',
  'report:scorecard': 'Monthly people report',
}

/** The id's view and kind ('recruiting:decision'), or null for an id without them. */
export function idKind(id: string): string | null {
  const [view, kind] = id.split(':')
  return view && kind ? `${view}:${kind}` : null
}

/** The label the id names, or null when this file does not know it. */
export function kindFromId(id: string): string | null {
  const k = idKind(id)
  if (!k) return null
  if (KIND_LABEL[k]) return KIND_LABEL[k]
  const prefix = Object.keys(KIND_LABEL).find((p) => p.endsWith('-') && k.startsWith(p))
  return prefix ? KIND_LABEL[prefix] : null
}

/** What kind of work an item is: the view's own label, the one its id names, else the view label. */
export function kindOf(item: Pick<ActionItem, 'id' | 'kind'>, viewLabel: string): string {
  return item.kind?.trim() || kindFromId(item.id) || viewLabel
}
