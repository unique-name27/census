/**
 * Drill specs for the Data room's numbers: a dataset's rows, the rows a field leaves blank (or,
 * for a date that stays blank until something happens, the rows where it happened), the rows a
 * check is about and the rows an import-log line is about. Rows are gathered when a number is
 * clicked. No React, so the rules are unit-tested.
 */
import type { Column } from '@/charts/types'
import type { IssueCode, IssueSummary } from '@/data/import'
import { type DatasetKey, type Datasets, datasetDef } from '@/data/schema'
import { drillNoun } from '@/drill/records'
import type { DrillKind, DrillRecordMap, DrillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { type CheckRecords, checkRecords, LINKS, missingRefs, TARGET_NOUN } from '../engine/checks'
import { coverageText, type FieldCoverage, fieldRecords } from '../engine/coverage'
import type { ManifestRow } from '../engine/manifest'
import { DRILL_LIMIT, firstRecords, type IssueRecords, issueDetail } from '../engine/records'
import type { ImportLog } from '../state/importLog'

type Rec = DrillRecordMap[DrillKind]

/** What a drill needs to know about the dataset its rows come from. */
export type DrillDataset = Pick<ManifestRow, 'key' | 'label' | 'source'>

/** "Hire date" → "hire date" mid-sentence; acronyms such as "ID" or "FX" keep their case. */
export const midSentence = (label: string): string =>
  /^[A-Z]{2,}\b/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1)

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const recordsOf = (data: Datasets, key: DatasetKey): readonly Rec[] => data[key]

/** "Employees · Sample data" or "Employees · roster.xlsx". */
const subtitleOf = (ds: DrillDataset, scope?: string | null): string =>
  [scope, ds.label, ds.source.kind === 'sample' ? 'Sample data' : ds.source.label].filter(Boolean).join(' · ')

/** The first DRILL_LIMIT rows, with a sentence saying so when there are more. */
function capped(kind: DatasetKey, rows: readonly Rec[]): { rows: readonly Rec[]; note: string | null } {
  const first = firstRecords(rows)
  return {
    rows: first.rows,
    note: first.capped
      ? `Showing the first ${fmt(DRILL_LIMIT, 'int')} of ${drillNoun(kind, first.total)}, in file order. Download the dataset for all of them.`
      : null,
  }
}

const joinNotes = (...notes: (string | null | undefined)[]): string | undefined =>
  notes.filter(Boolean).join(' ') || undefined

/** Every loaded row of a dataset (the first 2,000 when there are more). */
export function rowsSpec(ds: DrillDataset, data: Datasets): DrillSpec {
  const { rows, note } = capped(ds.key, recordsOf(data, ds.key))
  return {
    kind: ds.key,
    title: `Rows loaded in ${ds.label}`,
    subtitle: subtitleOf(ds),
    rows,
    note: note ?? undefined,
  }
}

/**
 * The rows behind one field's coverage. `blank`: the rows it applies to that hold no value, the
 * gap in its share. `filled`: for a date that stays blank until something happens (a termination
 * date), the rows where it happened.
 */
export function fieldSpec(
  ds: DrillDataset,
  f: FieldCoverage,
  data: Datasets,
  which: 'blank' | 'filled',
): DrillSpec | null {
  const found = fieldRecords(datasetDef(ds.key), recordsOf(data, ds.key), f.key)[which]
  if (!found.length) return null
  const { rows, note } = capped(ds.key, found)
  const label = midSentence(f.label)
  if (which === 'filled')
    return {
      kind: ds.key,
      title: `${ds.label} with a ${label}`,
      subtitle: subtitleOf(ds, f.scope),
      rows,
      note: joinNotes(
        `${capFirst(f.event ?? 'rows with a value')}: ${fmt(found.length, 'int')} of ${fmt(f.expected, 'int')} ${f.rowsNoun}. ${f.label} stays blank until it happens.`,
        note,
      ),
    }
  const defaulted =
    f.defaulted > 0
      ? `Another ${fmt(f.defaulted, 'int')} hold a default the importer set; they count as blank but can’t be told apart from values in the file, so they are not listed.`
      : null
  return {
    kind: ds.key,
    title: `${ds.label} with no ${label}`,
    subtitle: subtitleOf(ds, f.scope),
    rows,
    note: joinNotes(
      `Filled = ${fmt(f.filled, 'int')} ÷ ${fmt(f.expected, 'int')} ${f.rowsNoun} (${coverageText(f.share)}). Listed: the ${fmt(found.length, 'int')} with no value, blank or Unknown.`,
      defaulted,
      note,
    ),
  }
}

/** Accessible name of a check's drill: "Show the 95 rows that refer to people who are not in Employees". */
export function checkDrillLabel(ds: Pick<ManifestRow, 'key'>, records: CheckRecords): string {
  const n = `${fmt(records.count, 'int')} ${records.count === 1 ? 'row' : 'rows'}`
  const sel = records.select
  if (sel.by === 'unlinked') {
    const target = LINKS[ds.key]?.target
    return `Show the ${n} that refer to ${(target && TARGET_NOUN[target]) ?? 'records that are not loaded'}`
  }
  const label = midSentence(datasetDef(ds.key).fields.find((x) => x.key === sel.field)?.label ?? sel.field)
  return sel.by === 'blank' ? `Show the ${n} with no ${label}` : `Show the ${n} with ${label} set by default`
}

/** The rows a check is about (its `records`), or null when it is not about loaded rows. */
export function checkSpec(
  ds: DrillDataset & Pick<ManifestRow, 'coverage'>,
  records: CheckRecords | undefined,
  data: Datasets,
): DrillSpec | null {
  if (!records || records.count === 0) return null
  const sel = records.select
  if (sel.by === 'blank') {
    const f = ds.coverage.fields.find((x) => x.key === sel.field)
    return f ? fieldSpec(ds, f, data, 'blank') : null
  }
  const found = checkRecords(ds.key, data, sel)
  if (!found.length) return null
  const { rows, note } = capped(ds.key, found)
  const def = datasetDef(ds.key)
  if (sel.by === 'defaulted') {
    const label = def.fields.find((x) => x.key === sel.field)?.label ?? sel.field
    return {
      kind: ds.key,
      title: `${ds.label} with ${midSentence(label)} set by default`,
      subtitle: subtitleOf(ds),
      rows,
      note: joinNotes(
        `${label} was not in the file, so the importer filled every row with its default.`,
        note,
      ),
    }
  }
  const link = LINKS[ds.key]
  const missing = missingRefs(ds.key, data)
  if (!link || !missing) return null
  const target = datasetDef(link.target)
  const refLabels = link.fields.map((k) => def.fields.find((x) => x.key === k)?.label ?? k).join(' or ')
  const extra: Column[] = [{ key: 'notFound', label: `Not in ${target.label}` }]
  return {
    kind: ds.key,
    title: `Rows in ${ds.label} that refer to ${TARGET_NOUN[link.target] ?? `records not in ${target.label}`}`,
    subtitle: subtitleOf(ds),
    rows,
    extra: { columns: extra, values: (r) => ({ notFound: missing(r).join(', ') }) },
    note: joinNotes(
      `${refLabels} checked against the ${fmt(data[link.target].length, 'int')} rows loaded in ${target.label}.`,
      note,
    ),
  }
}

/** Plain titles for the kinds of logged change a loaded row can carry. */
const ISSUE_TITLE: Partial<Record<IssueCode, (label: string) => string>> = {
  unreadable: (l) => `${l} could not be read`,
  'unknown-value': (l) => `${l} not recognized`,
  'out-of-range': (l) => `${l} outside the expected range`,
  defaulted: (l) => `${l} filled with a default`,
  converted: (l) => `${l} converted`,
  'not-in-roster': (l) => `${l} not in the roster`,
  'manager-self': () => 'Listed as their own manager',
  'manager-unknown': () => 'Manager not found in the roster',
  'manager-ambiguous': () => 'Manager name matches more than one person',
  'manager-cycle': () => 'Reporting loop broken',
}

const LOG_COLUMNS: Column[] = [
  { key: 'fileRow', label: 'Row in the file', format: 'int', align: 'right' },
  { key: 'fileValue', label: 'Value in the file' },
  { key: 'fileIssue', label: 'What happened' },
]

/**
 * The loaded rows one "Last upload" line is about, with the logged row, value and change beside
 * each. `found` comes from `issueRecordsByGroup` over the same (pay-redacted) log.
 */
export function issueSpec(
  ds: DrillDataset,
  log: Pick<ImportLog, 'fileName' | 'sheetName' | 'importedAt'>,
  summary: Pick<IssueSummary, 'code' | 'label' | 'message'>,
  found: IssueRecords<Rec> | undefined,
): DrillSpec | null {
  if (!found?.records.length) return null
  const def = datasetDef(ds.key)
  const { rows, note } = capped(ds.key, found.records)
  const title = ISSUE_TITLE[summary.code]?.(summary.label || 'Value') ?? summary.message
  const missing = found.logged - found.records.length
  const file = [log.fileName, log.sheetName && log.sheetName !== log.fileName ? log.sheetName : null]
    .filter(Boolean)
    .join(' › ')
  return {
    kind: ds.key,
    title: `${title}, last upload`,
    subtitle: [ds.label, file, formatDate(log.importedAt.slice(0, 10))].filter(Boolean).join(' · '),
    rows,
    extra: {
      columns: LOG_COLUMNS,
      values: (r) => {
        const issue = found.issueOf(r)
        const detail = issueDetail(def, r, issue)
        return { fileRow: issue?.row ?? null, fileValue: detail.value, fileIssue: detail.issue }
      },
    },
    note: joinNotes(
      summary.message,
      missing > 0
        ? missing === 1
          ? '1 logged row is no longer in the loaded data, so it is not listed.'
          : `${fmt(missing, 'int')} logged rows are no longer in the loaded data, so they are not listed.`
        : null,
      note,
    ),
  }
}

/* ───────────── rows by index (the quality index's drills) ───────────── */

/**
 * The rows at `indexes` of a dataset (the quality index hands out row indexes), the first
 * 2,000 when there are more. Null when there is nothing to list.
 */
export function indexSpec(
  ds: DrillDataset,
  data: Datasets,
  indexes: readonly number[],
  title: string,
  opts: { scope?: string | null; note?: string | null } = {},
): DrillSpec | null {
  const all = recordsOf(data, ds.key)
  const found = indexes.flatMap((i) => (all[i] ? [all[i]] : []))
  if (!found.length) return null
  const { rows, note } = capped(ds.key, found)
  return {
    kind: ds.key,
    title,
    subtitle: subtitleOf(ds, opts.scope),
    rows,
    note: joinNotes(opts.note, note),
  }
}
