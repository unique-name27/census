/**
 * Plain-English lines for the change list and exports.
 */
import { categoryOf } from './categories'
import type { NewReferenceMapping, ReferenceMapping } from './types'

const list = (xs: readonly string[]): string => {
  const q = xs.map((x) => `"${x}"`)
  return q.length <= 1 ? (q[0] ?? '') : `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}`
}

/** "Moved Design Verification from Systems & Software to Silicon Engineering." */
export function describeMapping(m: ReferenceMapping | NewReferenceMapping): string {
  switch (m.kind) {
    case 'move-department':
      return m.from ? `Moved ${m.department} from ${m.from} to ${m.to}.` : `Moved ${m.department} to ${m.to}.`
    case 'move-function':
      return m.from
        ? `Moved job function ${m.jobFunction} from ${m.from} to ${m.to}.`
        : `Put job function ${m.jobFunction} under ${m.to}.`
    case 'move-family':
      // Legacy: made before job families contained job functions.
      return `Set the job function of job family ${m.jobFamily} rows to ${m.to}.`
    case 'merge':
    case 'rename': {
      const label = categoryOf(m.ref)?.label.toLowerCase() ?? m.ref
      const verb = m.kind === 'merge' ? 'Merged' : 'Renamed'
      const prep = m.kind === 'merge' ? 'into' : 'to'
      return `${verb} ${label} ${list(m.from)} ${prep} "${m.to}".`
    }
  }
}
