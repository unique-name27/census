/**
 * Quality of hire's wording from the metric dictionary, with a note when a setting behind a
 * number differs from its default. Its numbers depend on settings registered on another entry
 * (the weights on Quality of hire, the regretted rule on People stats), so the note follows each
 * metric's sources as the dictionary lists them (`sourcesOf`, through `dependsOn`).
 */
import type { Definition } from '@/charts/types'
import { definitionOf } from '@/metrics/api'
import { formatParam } from '@/metrics/params'
import type { MetricsApi } from '@/metrics/types'

type Wording = Pick<MetricsApi, 'def' | 'changedFields' | 'paramDef' | 'param' | 'sourcesOf'>

/** "Changed setting: Weight of the first review 70% (default 50%)." or '' at the defaults. */
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

/** A metric's definition, plus any changed setting behind it; '' when not registered. */
export function textOf(m: Wording, id: string): string {
  const d = m.def(id)
  if (!d) return ''
  const note = changedSettingsText(m, id)
  return note ? `${d.definition} ${note}` : d.definition
}

/** Figure "Definitions" rows for these metrics, in order, from the dictionary. */
export function defsOf(m: Wording, ...ids: string[]): Definition[] {
  const out: Definition[] = []
  for (const id of ids) {
    const d = definitionOf(m, id)
    if (d) out.push({ ...d, text: textOf(m, id) })
  }
  return out
}

/** "38 hires", "1 hire". */
export const hiresText = (n: number): string => `${n.toLocaleString('en-US')} ${n === 1 ? 'hire' : 'hires'}`

/** A score in a sentence: whole points ("80"). */
export const scoreText = (v: number): string => String(Math.round(v))

/** A gap in a sentence: "13 points", "1 point". */
export function pointsText(v: number): string {
  const n = Math.round(Math.abs(v))
  return `${n} ${n === 1 ? 'point' : 'points'}`
}

/** A share in a sentence: "97%". */
export const pctText = (v: number): string => `${Math.round(v * 100)}%`

/** How to read the interval bars (docs/ANALYSES.md, 1.6), for the figures' definitions. */
export const INTERVAL_DEF: Definition = {
  term: 'Interval',
  text: 'The bar shows how sure the comparison is. Few hires make a wide bar. A bar that crosses the company line is not clearly different from the company.',
  formula: 'mean ± z × standard deviation ÷ √hires',
}

/** The muted line under the university chart (part of its note). */
export const COMPARE_GROUPS =
  'Compare groups, not people. University can stand in for where someone studied or grew up, so read each group beside its expected score.'
