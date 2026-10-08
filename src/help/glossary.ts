/**
 * The glossary: one entry per metric in the dictionary, built from the definitions in force (yours
 * or the defaults), so it is never out of date. Pure.
 */
import type { MetricDef, MetricView } from '@/metrics/types'

export interface GlossaryEntry {
  /** The metric id; links open it in Metric definitions. */
  id: string
  term: string
  definition: string
  formula?: string
  /** Where it lives: "People stats". */
  where: string
  view: MetricView
}

/** Page names as the folder tabs and masthead say them. */
export const PAGE_LABEL: Readonly<Record<MetricView, string>> = {
  home: 'Home',
  team: 'My team',
  scorecard: 'Scorecard',
  recruiting: 'Recruiting',
  onboarding: 'Onboarding',
  hrbp: 'People stats',
  org: 'Org chart',
  services: 'HR ops',
  talent: 'Talent',
  comp: 'Compensation',
  compliance: 'Compliance',
  listening: 'Listening',
  ai: 'AI in HR',
  data: 'Data room',
  actions: 'Action center',
}

/** Glossary entries, sorted by term (then by where they live), one per metric id. */
export function buildGlossary(defs: readonly MetricDef[]): GlossaryEntry[] {
  const seen = new Set<string>()
  const out: GlossaryEntry[] = []
  for (const d of defs) {
    if (seen.has(d.id)) continue
    seen.add(d.id)
    const view = d.id.startsWith('privacy.') ? ('data' as const) : (d.views[0] ?? 'data')
    out.push({
      id: d.id,
      term: d.name,
      definition: d.definition,
      formula: d.formula || undefined,
      where: d.id.startsWith('privacy.') ? 'Privacy rule' : (PAGE_LABEL[view] ?? view),
      view,
    })
  }
  return out.sort(
    (a, b) =>
      a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }) || a.where.localeCompare(b.where, 'en'),
  )
}
