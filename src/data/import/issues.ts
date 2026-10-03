/**
 * The import exceptions log: labels, grouping into readable summaries, and table rows for the
 * Data room (and its CSV/Excel export of the log).
 */
import type { Column } from '@/charts/types'
import type { ImportIssue, IssueAction, IssueCode, IssueSummary } from './types'

export const ACTION_LABELS: Record<IssueAction, string> = {
  'row-skipped': 'Row skipped',
  'left-blank': 'Left blank',
  defaulted: 'Default used',
  cleared: 'Cleared',
  converted: 'Converted',
  kept: 'Kept as is',
}

/** Most serious first: lost rows, then lost values, then changes, then notes. */
const ACTION_ORDER: IssueAction[] = ['row-skipped', 'left-blank', 'cleared', 'defaulted', 'converted', 'kept']

const fmtN = (n: number) => n.toLocaleString('en-US')
const rowsWord = (n: number) => (n === 1 ? 'row' : 'rows')
const valuesWord = (n: number) => (n === 1 ? 'value' : 'values')
const isAre = (n: number) => (n === 1 ? 'is' : 'are')

function outcomePhrase(action: IssueAction, count: number): string {
  if (action === 'row-skipped') return count === 1 ? 'the row was skipped' : 'the rows were skipped'
  if (action === 'defaulted') return 'a default was used'
  return ACTION_LABELS[action].toLowerCase()
}

/** "Hire date" → "hire date" mid-sentence; acronyms such as "ID" or "FX" keep their case. */
const midSentence = (label: string) =>
  /^[A-Z]{2,}\b/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1)

function summaryMessage(
  code: IssueCode,
  fieldLabel: string,
  action: IssueAction,
  count: number,
  examples: string[],
): string {
  const label = midSentence(fieldLabel)
  const n = fmtN(count)
  const eg = examples.length ? ` (for example ${examples.map((e) => `"${e}"`).join(', ')})` : ''
  const outcome = outcomePhrase(action, count)
  switch (code) {
    case 'missing-required':
      return `${n} ${rowsWord(count)} had no ${label}; ${outcome}.`
    case 'column-missing':
      return `No column is mapped to ${label}.`
    case 'unreadable':
      return `${n} ${label} ${valuesWord(count)} could not be read${eg}; ${outcome}.`
    case 'unknown-value':
      return `${n} ${label} ${valuesWord(count)} ${isAre(count)} not recognized${eg}; ${outcome}.`
    case 'out-of-range':
      return `${n} ${label} ${valuesWord(count)} ${isAre(count)} outside the expected range${eg}; ${outcome}.`
    case 'duplicate':
      return `${n} duplicate ${rowsWord(count)} by ${label}; the most recent row was kept.`
    case 'defaulted':
      return `${fieldLabel} was filled with a default in ${n} ${rowsWord(count)}.`
    case 'converted':
      return `${fieldLabel} was converted in ${n} ${rowsWord(count)}.`
    case 'manager-self':
      return `${n} ${count === 1 ? 'person was' : 'people were'} listed as their own manager; ${outcome}.`
    case 'manager-unknown':
      return `${n} manager ${count === 1 ? 'reference was' : 'references were'} not found in the roster${eg}; ${outcome}.`
    case 'manager-ambiguous':
      return `${n} manager ${count === 1 ? 'name matches' : 'names match'} more than one person${eg}; ${outcome}.`
    case 'manager-cycle':
      return `${n} reporting ${count === 1 ? 'loop was' : 'loops were'} broken at the most senior person.`
    case 'not-in-roster':
      return `${n} ${rowsWord(count)} refer to people who are not in the roster; ${outcome}.`
  }
}

/** Group the log by what happened, most serious first, then by count. */
export function summarizeIssues(issues: readonly ImportIssue[]): IssueSummary[] {
  const groups = new Map<
    string,
    { first: ImportIssue; count: number; rows: number[]; examples: Set<string> }
  >()
  for (const i of issues) {
    const key = `${i.code}|${i.field}|${i.action}`
    let g = groups.get(key)
    if (!g) {
      g = { first: i, count: 0, rows: [], examples: new Set() }
      groups.set(key, g)
    }
    g.count++
    if (i.row > 0 && g.rows.length < 20) g.rows.push(i.row)
    if (i.value && g.examples.size < 3) g.examples.add(i.value)
  }
  return [...groups.values()]
    .map((g) => {
      const { code, field, label, action } = g.first
      const examples = [...g.examples]
      // Sheet-level issues already carry their own complete sentence.
      const sheetLevel = g.first.row === 0 && g.rows.length === 0
      const message = sheetLevel
        ? g.first.issue
        : summaryMessage(code, label || 'row', action, g.count, examples)
      return { code, field, label, action, count: g.count, rows: g.rows, examples, message }
    })
    .sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action) || b.count - a.count)
}

/** Columns for showing or exporting the exceptions log. */
export const ISSUE_COLUMNS: Column[] = [
  { key: 'row', label: 'Row', format: 'int', align: 'right', width: 6 },
  { key: 'id', label: 'Record', width: 14 },
  { key: 'field', label: 'Field', width: 18 },
  { key: 'value', label: 'Value', width: 18 },
  { key: 'issue', label: 'Issue', width: 48 },
  { key: 'action', label: 'Action', width: 12 },
]

/** One flat row per issue for `ISSUE_COLUMNS`. Sheet-level issues show an empty row number. */
export function issueTableRows(issues: readonly ImportIssue[]): Record<string, unknown>[] {
  return issues.map((i) => ({
    row: i.row > 0 ? i.row : null,
    id: i.id ?? '',
    field: i.label,
    value: i.value,
    issue: i.issue,
    action: ACTION_LABELS[i.action],
  }))
}
