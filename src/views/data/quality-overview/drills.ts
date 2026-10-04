/**
 * Drill specs for data quality numbers: the gaps under a number (the rows it left out, kept with
 * a gap, or outside its period), the problem rows behind a field (blank, not recognized or
 * defaulted), and the rows behind a fix. Rows are gathered when a number is clicked; each list
 * says why every row is on it. No React.
 */
import type { Column } from '@/charts/types'
import type { FieldRef } from '@/data/quality/fieldRef'
import { capFirst, midSentence } from '@/data/quality/text'
import type { FieldRowKind } from '@/data/quality/types'
import { type DatasetKey, type Datasets, datasetDef } from '@/data/schema'
import { drillNoun } from '@/drill/records'
import type { DrillKind, DrillRecordMap, DrillSpec } from '@/drill/types'
import { fmt } from '@/lib/format'
import type { SourceInfo } from '../engine/manifest'
import { type LeftOutPart, type PartRows, partRows, rowReasonText, usedText } from './engine/leftOut'
import { shareText } from './engine/share'
import type { FieldCell } from './engine/summary'

type Rec = DrillRecordMap[DrillKind]

const recordsOf = (data: Datasets, key: DatasetKey): readonly Rec[] => data[key]

/** "Leavers · Employees · Sample data". */
export const drillSubtitle = (key: DatasetKey, source: SourceInfo | null, scope?: string | null): string =>
  [scope, datasetDef(key).label, source ? (source.kind === 'sample' ? 'Sample data' : source.label) : null]
    .filter(Boolean)
    .join(' · ')

/** Rows at `indexes` with a column saying why each one is listed. */
function listed(
  key: DatasetKey,
  data: Datasets,
  indexes: readonly number[],
  why: (index: number) => string,
  column: Column,
): { rows: Rec[]; extra: DrillSpec['extra'] } {
  const all = recordsOf(data, key)
  const reason = new Map<Rec, string>()
  const rows: Rec[] = []
  for (const i of indexes) {
    const r = all[i]
    if (!r) continue
    rows.push(r)
    reason.set(r, why(i))
  }
  return {
    rows,
    extra: { columns: [column], values: (r: Rec) => ({ [column.key]: reason.get(r) ?? '' }) },
  }
}

/* ───────────── the gaps under a number ───────────── */

/** The plural noun of a dataset's records: "people", "cases", "assignments". */
export const recordsNoun = (key: DatasetKey): string => drillNoun(key, 2).replace(/^\S+ /, '')

const NORMAL_BLANKS = 'Blanks that are normal for a field don’t count.'

/**
 * The rows under a number with a gap: those it left out (a field it requires is blank or not
 * recognized), those it kept with a gap in a field it only breaks them down by, every row with a
 * gap when it doesn't say which fields it requires, or the rows with a gap outside its period.
 */
export function leftOutSpec(args: {
  part: LeftOutPart
  /** Which rows: left out, kept with a gap, every gap, or outside the period. Default: every gap. */
  which?: PartRows
  data: Datasets
  /** What the number is: "Voluntary attrition". */
  what: string
  uses: readonly FieldRef[]
  scopeLabel: string
  source: SourceInfo | null
  /** The period the number covers, "1 Oct 2025 – 30 Sep 2026". */
  periodLabel?: string
}): DrillSpec | null {
  const { part, data } = args
  const which = args.which ?? 'gaps'
  const indexes = partRows(part, which)
  if (!indexes.length) return null
  const why = (i: number) =>
    rowReasonText((part.reasons.get(i) ?? []).filter((r) => which !== 'leftOut' || r.required))
  const { rows, extra } = listed(part.dataset, data, indexes, why, {
    key: 'gapWhy',
    label: which === 'leftOut' ? 'Why left out' : 'Gap',
  })
  if (!rows.length) return null
  const label = datasetDef(part.dataset).label
  const what = midSentence(args.what)
  const period = args.periodLabel ? ` (${args.periodLabel})` : ''
  const title: Record<PartRows, string> = {
    leftOut: `${label} rows left out of ${what}`,
    kept: `${label} rows in ${what} with a gap`,
    gaps: `${label} rows with a gap under ${what}`,
    outside: `${label} rows with a gap outside the period of ${what}`,
  }
  const note: Record<PartRows, string> = {
    leftOut: `${usedText(part)}. A row is left out when a field the number requires is blank there or holds a value Census does not recognize. ${NORMAL_BLANKS}`,
    kept: `The number counts these rows, but a field it only breaks them down by is blank or holds a value Census does not recognize, so they fall under Other or Unknown. ${NORMAL_BLANKS}`,
    gaps: `${usedText(part)}. These rows have a blank or a value Census does not recognize in a field the number reads. Whether that leaves a row out depends on the number: a breakdown counts it under Other or Unknown. ${NORMAL_BLANKS}`,
    outside: `These rows have a gap in a field the number reads, but they fall outside the period${period}, so the number does not read them. ${NORMAL_BLANKS}`,
  }
  return {
    kind: part.dataset,
    title: title[which],
    subtitle: drillSubtitle(part.dataset, args.source, args.scopeLabel),
    rows,
    extra,
    note: note[which],
    uses: args.uses,
  }
}

/* ───────────── problem rows behind a field ───────────── */

export type ProblemKind = 'blank' | 'invalid' | 'defaulted'

const PROBLEM: Record<ProblemKind, string> = {
  blank: 'Blank',
  invalid: 'Not recognized',
  defaulted: 'Filled by a default',
}

/** Each kind of problem as the drill note lists it. */
const PROBLEM_NOTE: Record<ProblemKind, string> = {
  blank: 'a blank',
  invalid: 'a value not recognized',
  defaulted: 'a default',
}

const orList = (items: readonly string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`

/** The rows behind a field cell's gaps: blank (unless blanks are normal), not recognized, defaulted. */
export function fieldProblemSpec(args: {
  cell: Pick<FieldCell, 'key' | 'ref' | 'field' | 'scope' | 'blankOk' | 'coverage' | 'filled' | 'applicable'>
  data: Datasets
  rowsOf: (kind: Extract<FieldRowKind, ProblemKind>) => readonly number[]
  source: SourceInfo | null
  /**
   * Only these kinds of problem (a count in the table, what a fix touches); without it every gap:
   * blanks (unless they are normal for the field), values not recognized and defaults.
   */
  kinds?: readonly ProblemKind[]
  /** The silver fill threshold, so the fill rate reads as it does in the table. */
  minCoverage?: number
}): DrillSpec | null {
  const { cell } = args
  const kinds =
    args.kinds ?? (['blank', 'invalid', 'defaulted'] as const).filter((k) => !(k === 'blank' && cell.blankOk))
  const why = new Map<number, string[]>()
  for (const k of kinds)
    for (const i of args.rowsOf(k)) {
      const list = why.get(i)
      if (list) list.push(PROBLEM[k])
      else why.set(i, [PROBLEM[k]])
    }
  const indexes = [...why.keys()].sort((a, b) => a - b)
  const { rows, extra } = listed(cell.key, args.data, indexes, (i) => (why.get(i) ?? []).join(', '), {
    key: 'fieldProblem',
    label: 'Problem',
  })
  if (!rows.length) return null
  const records = capFirst(recordsNoun(cell.key))
  const f = midSentence(cell.field)
  const found = new Set(indexes.flatMap((i) => why.get(i) ?? []))
  const title =
    found.size === 1 && found.has(PROBLEM.blank)
      ? `${records} with no ${f}`
      : found.size === 1 && found.has(PROBLEM.invalid)
        ? `${records} with a ${f} not recognized`
        : found.size === 1
          ? `${records} with ${f} filled by a default`
          : `${records} with a gap in ${f}`
  const share = shareText(
    cell.coverage,
    cell.blankOk || args.minCoverage == null ? null : { threshold: args.minCoverage, side: 'min' },
  )
  const fill =
    cell.coverage == null
      ? null
      : `Filled = ${fmt(cell.filled, 'int')} ÷ ${fmt(cell.applicable, 'int')} rows it applies to (${share}).`
  const listedKinds = kinds.filter((k) => found.has(PROBLEM[k])).map((k) => PROBLEM_NOTE[k])
  return {
    kind: cell.key,
    title,
    subtitle: drillSubtitle(cell.key, args.source, cell.scope),
    rows,
    extra,
    note: [fill, `Listed: the ${fmt(rows.length, 'int')} rows with ${orList(listedKinds)}.`]
      .filter(Boolean)
      .join(' '),
    uses: [cell.ref],
  }
}

/** Rows by index with a plain title (rule results, a fix's failing rows). */
export function rowsSpec(args: {
  key: DatasetKey
  data: Datasets
  indexes: readonly number[]
  title: string
  source: SourceInfo | null
  note?: string
  uses?: readonly FieldRef[]
}): DrillSpec | null {
  const all = recordsOf(args.data, args.key)
  const rows = args.indexes.flatMap((i) => (all[i] ? [all[i]] : []))
  if (!rows.length) return null
  return {
    kind: args.key,
    title: args.title,
    subtitle: drillSubtitle(args.key, args.source),
    rows,
    ...(args.note ? { note: args.note } : {}),
    ...(args.uses ? { uses: args.uses } : {}),
  }
}
