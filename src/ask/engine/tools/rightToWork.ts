/**
 * Right to work in view summaries (docs/ASK.md, privacy). Every right to work field says something
 * about a person's immigration status (an expiry date means a time-limited permit; a deemed export
 * license means a foreign national), so `query_records` gives that dataset as grouped counts only,
 * with counts under the anonymity minimum hidden (allowlist.ts). The views' own key figures and
 * findings built on it (Compliance: authorizations ending, reverification, I-9, export licenses)
 * follow the same rule in `view_summary`, `compare_groups` and the scorecard: a count under the
 * minimum is not sent, a finding goes as its one-sentence title only (its detail and next step
 * carry one person's dates, and small counts by unit), and a key figure's note (counts such as
 * "3 of 15") stays here. Pure.
 */
import type { Finding, Kpi } from '@/components/types'
import { plural } from '@/lib/format'

/** The figure or finding is computed from right to work fields. */
export const usesRightToWork = (uses: readonly string[] | undefined): boolean =>
  !!uses?.some((u) => u.startsWith('rightToWork.'))

/** Why a small right to work count is not sent. */
export const RTW_SMALL = (min: number): string =>
  `Fewer than ${min} people: right to work counts this small are never sent to Claude.`

/** A key figure that counts fewer people than the minimum (a rate is suppressed by its own rule). */
export function rtwSmallCount(k: Pick<Kpi, 'uses' | 'format' | 'value'>, min: number): boolean {
  if (!usesRightToWork(k.uses) || k.format !== 'int') return false
  return typeof k.value === 'number' && k.value > 0 && k.value < min
}

/** How many people or records a finding is about: its people, else the records behind it. */
function findingCount(f: Finding): number | null {
  if (f.people?.length) return f.peopleTotal ?? f.people.length
  try {
    const spec = typeof f.drill === 'function' ? f.drill() : f.drill
    return spec ? spec.rows.length : null
  } catch {
    return null
  }
}

/**
 * How a finding goes to Claude: as it is ('all'), as its title only ('title', a right to work
 * finding about enough people), or not at all ('withhold', fewer than the minimum or uncounted).
 */
export function rtwFinding(f: Finding, min: number): 'all' | 'title' | 'withhold' {
  if (!usesRightToWork(f.uses)) return 'all'
  const n = findingCount(f)
  return n != null && n >= min ? 'title' : 'withhold'
}

/** The line that says right to work findings were left out, or null. */
export function rtwWithheldText(n: number, min: number): string | null {
  if (!n) return null
  return `${plural(n, 'finding')} about right to work ${n === 1 ? 'involves' : 'involve'} fewer than ${min} people, so ${n === 1 ? 'it is' : 'they are'} not sent. The view shows ${n === 1 ? 'it' : 'them'}.`
}
