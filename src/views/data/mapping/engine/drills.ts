/**
 * Drill specs for the Categories & mapping tab: the active people behind a node, ribbon, cell or
 * conflict, the requisitions behind a requisition gap, and the rows behind a category value.
 * Rows are row indexes into the mapped datasets (`ctx.all`). Pure.
 */
import type { Column } from '@/charts/types'
import type { ImportIssue } from '@/data/import/types'
import { rowKeyOf } from '@/data/quality/importSummary'
import type { DatasetKey, Datasets, Employee } from '@/data/schema'
import type { DrillKind, DrillRecordMap, DrillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'

/** Columns the people list adds, by what the number is about. */
export type PeopleFocus = 'org' | 'job' | 'location'

const EXTRA: Record<PeopleFocus, Column[]> = {
  org: [
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'costCenter', label: 'Cost center' },
  ],
  job: [
    { key: 'jobFamily', label: 'Job family' },
    { key: 'jobFunction', label: 'Job function' },
  ],
  location: [{ key: 'country', label: 'Country' }],
}

const ACTIVE_HIDE = ['terminationDate', 'terminationType', 'terminationReason', 'regrettable']

const at = <T>(list: readonly T[], rows: readonly number[]): T[] =>
  rows.map((i) => list[i]).filter((r): r is T => r != null)

/** "Active people as of 30 Sep 2026" */
export const activeSubtitle = (asOf: string, more?: string | null): string =>
  [more, `Active as of ${formatDate(asOf)}`].filter(Boolean).join(' · ')

export function peopleSpec(args: {
  title: string
  asOf: string
  employees: readonly Employee[]
  rows: readonly number[]
  focus: PeopleFocus
  scope?: string | null
  note?: string
}): DrillSpec<'employees'> | null {
  const rows = at(args.employees, args.rows)
  if (!rows.length) return null
  return {
    kind: 'employees',
    title: args.title,
    subtitle: activeSubtitle(args.asOf, args.scope),
    rows,
    hide: ACTIVE_HIDE,
    extra: {
      columns: EXTRA[args.focus],
      values: (e) => ({
        businessUnit: e.businessUnit,
        costCenter: e.costCenter ?? null,
        jobFamily: e.jobFamily ?? null,
        jobFunction: e.jobFunction ?? null,
        country: e.country,
      }),
    },
    note: args.note,
  }
}

export function requisitionSpec(args: {
  title: string
  data: Datasets
  rows: readonly number[]
  note?: string
}): DrillSpec<'requisitions'> | null {
  const rows = at(args.data.requisitions, args.rows)
  if (!rows.length) return null
  return { kind: 'requisitions', title: args.title, subtitle: 'Requisitions', rows, note: args.note }
}

/** Any dataset's rows (for a category value). */
export function rowsSpec<K extends DrillKind>(args: {
  kind: K
  title: string
  subtitle?: string
  data: Datasets
  rows: readonly number[]
  note?: string
}): DrillSpec<K> | null {
  const list = args.data[args.kind as DatasetKey] as unknown as readonly DrillRecordMap[K][]
  const rows = at(list, args.rows)
  if (!rows.length) return null
  return { kind: args.kind, title: args.title, subtitle: args.subtitle, rows, note: args.note }
}

/**
 * Loaded rows whose value the importer did not recognize and left blank: the log names each row
 * by its key, so rows are matched on that key. Rows changed since the upload drop out.
 */
export function importRows(
  dataset: DatasetKey,
  rows: readonly object[],
  issues: readonly ImportIssue[],
  field: string,
  value: string,
): number[] {
  const ids = new Set(
    issues
      .filter(
        (i) => i.field === field && i.code === 'unknown-value' && i.value === value && i.row > 0 && i.id,
      )
      .map((i) => i.id as string),
  )
  if (!ids.size) return []
  const out: number[] = []
  rows.forEach((r, i) => {
    const k = rowKeyOf(dataset, r as Record<string, unknown>)
    if (k != null && ids.has(k)) out.push(i)
  })
  return out
}
