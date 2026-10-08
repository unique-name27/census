/**
 * Items as rows: for the Excel export of the list, for each owner group's sheet export, and as
 * drill records (`actionItems`), so every count on the page opens the items behind it and each
 * item's About cell opens its own records. Item ids are never shown or exported: an employee
 * relations item's id carries its case ID. An item's money (`ActionItem.amount`) is never in its
 * text: the export carries it in its own column, `pay: true` for one person's amount and
 * `cost: true` for a total over a group, so the pay rules drop it where the mode or the switch
 * says so. Pure.
 */
import type { Column } from '@/charts/types'
import type { Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { TIER_LABEL } from '@/data/quality/tier'
import type { ISODate } from '@/data/schema'
import { type ActionItemRow, type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { type OpenAction, usesOf } from './collect'
import { dueText } from './due'
import type { ItemStatus } from './marks'

/** The word beside each severity icon, as the status pill says it. */
export const SEVERITY_WORD: Record<Severity, string> = {
  critical: 'Critical',
  warning: 'Watch',
  info: 'Note',
  good: 'Good',
}

export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'warning', 'info', 'good']

/** "Open", "Handled 4 Oct 2026", "Handled 4 Oct 2026 by Priya", "Snoozed until 11 Oct 2026", "Open, changed since 4 Oct 2026". */
export function statusText(s: ItemStatus): string {
  const by = 'by' in s && s.by ? ` by ${s.by}` : ''
  if (s.state === 'handled') return `Handled ${formatDate(s.at.slice(0, 10))}${by}`
  if (s.state === 'snoozed') return `Snoozed until ${formatDate(s.until.slice(0, 10))}${by}`
  if (s.changedSince) return `Open, changed since ${formatDate(s.changedSince.slice(0, 10))}`
  return 'Open'
}

export interface ExportRow {
  [key: string]: unknown
  ownerGroup: string
  owner: string
  severity: string
  what: string
  subject: string
  due: ISODate | null
  dueText: string
  from: string
  note: string
  status: string
  /** One person's amount (USD), for a pay column. */
  amount: number | null
  /** A total over a group (USD), for a cost column. */
  total: number | null
  /** The total is rounded down to a whole $100,000 (Finance): it reads in millions. */
  totalRounded: boolean
  /** What the amount or total is: "Cost to bring to minimum, a year". */
  amountLabel: string
  /** The tier of data below the standard ("Bronze"), else empty. */
  data: string
  /** Other views that raised the same matter. */
  alsoFrom: string
}

/** A group item's amount is a total (cost); a person's is pay. */
const isGroup = (a: OpenAction) => a.item.subject.kind === 'none'

export const EXPORT_COLUMNS: Column<ExportRow>[] = [
  { key: 'ownerGroup', label: 'Owner group' },
  { key: 'owner', label: 'Waiting on', width: 22 },
  { key: 'severity', label: 'Severity' },
  { key: 'what', label: 'What is open', width: 48 },
  { key: 'subject', label: 'About', width: 30 },
  { key: 'due', label: 'Due date', format: 'date' },
  { key: 'dueText', label: 'Due' },
  { key: 'from', label: 'From', width: 22 },
  { key: 'note', label: 'Note', width: 48 },
  { key: 'status', label: 'Status' },
  { key: 'alsoFrom', label: 'Also raised in', width: 22 },
  { key: 'data', label: 'Data below your standard' },
  { key: 'amount', label: 'Amount (USD)', format: 'moneyFull', pay: true },
  {
    key: 'total',
    label: 'Total (USD)',
    format: (r) => (r.totalRounded ? 'moneyM' : 'moneyFull'),
    cost: true,
  },
  { key: 'amountLabel', label: 'Amount for', width: 30, cost: true },
]

type StatusFn = (a: OpenAction) => ItemStatus
const OPEN: StatusFn = () => ({ state: 'open' })

export function exportRows(
  items: readonly OpenAction[],
  asOf: ISODate,
  status: StatusFn = OPEN,
): ExportRow[] {
  return items.map((a) => ({
    ownerGroup: a.roleLabel,
    owner: a.ownerName,
    severity: SEVERITY_WORD[a.item.severity],
    what: a.item.what,
    subject: a.item.subject.label,
    due: a.item.due ?? null,
    dueText: dueText(a.item.due, asOf),
    from: a.from,
    note: a.item.note ?? '',
    status: statusText(status(a)),
    amount: a.item.amount && !isGroup(a) ? a.item.amount.usd : null,
    total: a.item.amount && isGroup(a) ? a.item.amount.usd : null,
    totalRounded: !!a.item.amount?.rounded,
    amountLabel: a.item.amount?.label ?? '',
    data: a.below ? TIER_LABEL[a.below.tier] : '',
    alsoFrom: a.alsoFrom.join(', '),
  }))
}

export function drillRows(
  items: readonly OpenAction[],
  asOf: ISODate,
  status: StatusFn = OPEN,
): ActionItemRow[] {
  return items.map((a) => ({
    id: a.id,
    severity: a.item.severity,
    severityLabel: SEVERITY_WORD[a.item.severity],
    what: a.item.what,
    subject: a.item.subject.label,
    personId: a.personId,
    subjectDrill: a.item.drill ?? null,
    ownerGroup: a.roleLabel,
    owner: a.ownerName,
    due: a.item.due ?? null,
    dueText: dueText(a.item.due, asOf),
    from: a.from,
    status: statusText(status(a)),
  }))
}

/** The items behind a count, as drill records with the fields they read. */
export function itemsDrill(
  ctx: Pick<AnalyticsContext, 'asOf' | 'scopeLabel'>,
  title: string,
  items: readonly OpenAction[],
  opts: { status?: StatusFn; note?: string } = {},
): DrillSpec<'actionItems'> {
  const uses: FieldRef[] = usesOf(items)
  const rows = drillRows(items, ctx.asOf, opts.status)
  // Columns that say the same thing on every row add nothing: one owner, or every item open.
  const hide: string[] = []
  if (rows.every((r) => r.status === 'Open')) hide.push('status')
  if (new Set(items.map((a) => a.ownerKey)).size === 1) hide.push('owner', 'ownerGroup')
  else if (new Set(items.map((a) => a.role)).size === 1) hide.push('ownerGroup')
  return drillSpec({
    kind: 'actionItems',
    title,
    subtitle: `${ctx.scopeLabel} · as of ${formatDate(ctx.asOf)}`,
    rows,
    ...(hide.length ? { hide } : {}),
    note: opts.note ?? 'Items from every view that wait on someone.',
    ...(uses.length ? { uses } : {}),
  })
}
