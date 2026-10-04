/**
 * Ordering and export rows for a view's readout. Pure.
 */
import type { Column } from '@/charts/types'
import type { Finding, FindingPerson, Severity } from './types'

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

/** The word each severity carries next to its icon (matches StatusPill). */
export const SEVERITY_WORD: Record<Severity, string> = {
  critical: 'Critical',
  warning: 'Watch',
  info: 'Note',
  good: 'Good',
}

/** Critical first, then warnings, notes and good news; original order within a severity. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] || a.i - b.i)
    .map((x) => x.f)
}

export function severityCounts(findings: readonly Finding[]): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, warning: 0, info: 0, good: 0 }
  for (const f of findings) out[f.severity]++
  return out
}

/** The first `limit` people and how many are left over ("and 7 more"). */
export function peoplePreview(
  people: readonly FindingPerson[],
  limit = 5,
): { shown: FindingPerson[]; more: number } {
  return { shown: people.slice(0, limit), more: Math.max(0, people.length - limit) }
}

export const READOUT_COLUMNS: Column[] = [
  { key: 'severity', label: 'Severity', format: 'text' },
  { key: 'finding', label: 'Finding', format: 'text' },
  { key: 'detail', label: 'Detail', format: 'text' },
  { key: 'nextStep', label: 'Next step', format: 'text' },
  { key: 'people', label: 'People', format: 'int', align: 'right' },
]

/** Export rows in on-screen order. People are counted, not named. */
export function readoutRows(findings: readonly Finding[]): Record<string, unknown>[] {
  return sortFindings(findings).map((f) => ({
    severity: SEVERITY_WORD[f.severity],
    finding: f.title,
    detail: f.detail ?? '',
    nextStep: f.action ?? '',
    people: f.people?.length ?? null,
  }))
}

/**
 * A label as it reads inside a sentence ("Open drivers"): the first letter is lowered only when
 * the second is lowercase, so acronyms and names keep their case ("Open HR transactions").
 */
export function labelInSentence(label: string): string {
  if (label.length < 2 || !/\p{Ll}/u.test(label[1])) return label
  return label[0].toLowerCase() + label.slice(1)
}
