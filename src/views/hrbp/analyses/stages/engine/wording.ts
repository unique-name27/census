/**
 * Engineering by stage's wording from the metric dictionary (`ctx.metrics`), with your changes:
 * KPI info popovers, Figure datasheets and readout findings. When a setting behind a number (its
 * own, or one of a metric it depends on) differs from its default, the definition says so.
 */
import type { Definition } from '@/charts/types'
import { definitionOf } from '@/metrics/api'
import { formatParam } from '@/metrics/params'
import type { MetricsApi } from '@/metrics/types'

type Wording = Pick<MetricsApi, 'def' | 'changedFields' | 'paramDef' | 'param' | 'sourcesOf'>

/** "Changed setting: Count contractors in ratios Off (default On)." or '' at the defaults. */
export function changedSettingsText(m: Wording, id: string): string {
  const parts: string[] = []
  for (const source of m.sourcesOf(id)) {
    for (const field of m.changedFields(source)) {
      if (!field.startsWith('params.')) continue
      const key = field.slice('params.'.length)
      const def = m.paramDef(source, key)
      if (!def) continue
      parts.push(
        `${def.label} ${formatParam(def, m.param(source, key))} (default ${formatParam(def, def.default)})`,
      )
    }
  }
  if (!parts.length) return ''
  return `${parts.length === 1 ? 'Changed setting' : 'Changed settings'}: ${parts.join('; ')}.`
}

/** The dictionary's definition, plus any changed setting; '' when not registered. */
export function definitionText(m: Wording, id: string): string {
  const d = m.def(id)
  if (!d) return ''
  const note = changedSettingsText(m, id)
  return note ? `${d.definition} ${note}` : d.definition
}

/** Figure "Definitions" rows for these metrics, in order, from the dictionary. */
export function stageDefs(m: Wording, ...ids: string[]): Definition[] {
  const out: Definition[] = []
  for (const id of ids) {
    const d = definitionOf(m, id)
    if (d) out.push({ ...d, text: definitionText(m, id) })
  }
  return out
}

const n = (v: number): string => v.toLocaleString('en-US')

/** "1 engineer", "149 engineers". */
export const count = (v: number, one: string, many = `${one}s`): string => `${n(v)} ${v === 1 ? one : many}`

/** "a, b and c". */
export const andList = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/** A stage name inside a sentence: "design verification", but "DFT" and "RTL design" keep their capitals. */
export function inSentence(label: string): string {
  const [first, ...rest] = label.split(' ')
  if (!first || /^[A-Z]{2,}/.test(first)) return label
  return [first.toLowerCase(), ...rest].join(' ')
}
