/**
 * Figure and tile notes, with the disclosures every Compensation number needs: who has no comp
 * record, and pay data that describes a different date from the people it is joined to. Pure.
 */
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { CompModel } from './model'

export type NoteInput = Pick<CompModel, 'asOf' | 'payAsOf' | 'payStale'> & {
  pop: Pick<CompModel['pop'], 'missingComp' | 'noFx'>
}

/** "114 active employees have no comp record" */
export function missingText(n: number): string {
  return `${fmt(n, 'int')} active ${n === 1 ? 'employee has' : 'employees have'} no comp record`
}

/** Disclosures appended to notes: pay from another date, then missing comp records. */
export function coverageParts(m: NoteInput): string[] {
  const out: string[] = []
  if (m.payStale && m.payAsOf) out.push(`pay data from ${formatDate(m.payAsOf)}`)
  if (m.pop.missingComp > 0) out.push(missingText(m.pop.missingComp))
  return out
}

/** "as of 30 Sep 2026", plus the coverage disclosures: the tail of every note. */
export function asOfNote(m: NoteInput): string {
  return [`as of ${formatDate(m.asOf)}`, ...coverageParts(m)].join(' · ')
}

/** "1,450 people · as of 30 Sep 2026", plus the FX caveat when it applies to amount totals and the coverage disclosures. */
export function note(m: NoteInput, n: number, unit = 'people', fx = false): string {
  const parts = [
    `${fmt(n, 'int')} ${n === 1 && unit === 'people' ? 'person' : unit}`,
    `as of ${formatDate(m.asOf)}`,
  ]
  if (fx && m.pop.noFx > 0) parts.push(`${fmt(m.pop.noFx, 'int')} without an FX rate left out of USD totals`)
  parts.push(...coverageParts(m))
  return parts.join(' · ')
}

/**
 * One or two sentences for the top of every tab when the pay data and the people are from
 * different dates. Comp rows have no effective date, so the view cannot rebuild past pay.
 */
export function payNotice(m: NoteInput): string | null {
  if (!m.payStale || !m.payAsOf) return null
  const pay = formatDate(m.payAsOf)
  const asOf = formatDate(m.asOf)
  if (m.payAsOf > m.asOf) {
    const k = m.pop.missingComp
    const gone = k > 0 ? `, and ${fmt(k, 'int')} of them ${k === 1 ? 'has' : 'have'} no comp record` : ''
    return `Pay data is a snapshot from ${pay} with no history, while people are counted as of ${asOf}. Figures show ${pay} pay for the people employed on ${asOf}${gone}.`
  }
  return `Pay data was loaded on ${pay}, while people are counted as of ${asOf}. Pay changes and hires since the upload are not in these figures.`
}

export interface EmptyScope {
  title: string
  body: string
  /** Point to the Data room (the data is missing), not just the filters. */
  dataRoom: boolean
}

/**
 * Why a scope has no one to show: no Compensation data at all, active people in scope without
 * comp records, or filters that simply match nobody.
 */
export function emptyScope(m: {
  pop: Pick<CompModel['pop'], 'missingComp'>
  company: { people: readonly unknown[] }
}): EmptyScope {
  const k = m.pop.missingComp
  if (!m.company.people.length)
    return {
      title: 'Upload Compensation to see this',
      body: `${k > 0 ? `${missingText(k)} in this scope.` : 'There are no active employees with a compensation record.'} Load a Compensation sheet in the Data room.`,
      dataRoom: true,
    }
  if (k > 0)
    return {
      title: 'No compensation records in this scope',
      body: `${missingText(k)} in this scope. Widen the filters, or load a fuller Compensation sheet in the Data room.`,
      dataRoom: true,
    }
  return {
    title: 'No one in this scope',
    body: 'No active employees match these filters. Widen the filters to see compensation.',
    dataRoom: false,
  }
}

/**
 * The Range position tab's "Outside the range" lead: it names the "Show pay amounts" switch only in
 * the modes that have it (docs/ROLES-V2.md 3.1); the HRBP modes see ratios and counts only.
 */
export function outsideRangeDek(paySwitch: boolean): string {
  return `People paid below the minimum or above the maximum of their salary range. ${
    paySwitch
      ? 'Amounts appear only with Show pay amounts on.'
      : 'This mode shows ratios and counts, never amounts.'
  }`
}
