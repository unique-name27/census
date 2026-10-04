/**
 * What a "Definition changed" mark says: the changes behind one number, in plain sentences. A
 * number can change because of its own wording, target or settings, a setting registered on a
 * metric it depends on (the population setting on headcount changes every rate), the anonymity
 * minimum, or a data quality rule that sets its tier. Pure.
 */
import { fieldLabel } from '@/metrics/registry'
import type { MetricsApi } from '@/metrics/types'

type Api = Pick<MetricsApi, 'def' | 'changesBehind'>

const listText = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

export interface BehindText {
  /** "Voluntary attrition differs from its default: Target." etc., one sentence per kind of change. */
  sentences: string[]
  /** Short, for a screen reader after "Definition changed": "Target; Count contractors in headcount". */
  short: string
}

/** The changes behind a number in words; null when it is calculated exactly as by default. */
export function behindText(m: Api, metricId: string): BehindText | null {
  const behind = m.changesBehind(metricId)
  if (!behind.length) return null
  const name = m.def(metricId)?.name ?? 'This metric'
  const own: string[] = []
  const sources: string[] = []
  const rules: string[] = []
  for (const b of behind) {
    const def = m.def(b.metricId)
    const labels = b.fields.map((f) => fieldLabel(def, f))
    if (b.role === 'self') own.push(...labels)
    else {
      const where = def?.name ?? b.metricId
      for (const l of labels) (b.role === 'rule' ? rules : sources).push(l === where ? l : `${l} (${where})`)
    }
  }
  const sentences: string[] = []
  if (own.length) sentences.push(`${name} differs from its default: ${listText(own)}.`)
  if (sources.length)
    sentences.push(
      `${sources.length === 1 ? 'A setting it is calculated with has' : 'Settings it is calculated with have'} changed: ${listText(sources)}.`,
    )
  if (rules.length)
    sentences.push(
      `${rules.length === 1 ? 'A data quality rule that sets its tier has' : 'Data quality rules that set its tier have'} changed: ${listText(rules)}.`,
    )
  return { sentences, short: [...own, ...sources, ...rules].join('; ') }
}
