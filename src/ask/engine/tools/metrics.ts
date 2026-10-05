/**
 * `find_metrics`: up to 25 metric dictionary entries with the user's wording and targets (the
 * dictionary in force, `ctx.metrics`), matched to a query and/or a view.
 */
import { unitOf } from '@/components/kpiModel'
import { targetText } from '@/metrics/overrides'
import type { MetricDef } from '@/metrics/types'
import { fail, inputOf, ok, type ToolOutput, type ToolRuntime, unknownKeys } from './shared'

export const MAX_METRICS = 25

/** Little words that would match nearly every definition ("to" alone matched 202 of 309). */
const STOPWORDS: ReadonlySet<string> = new Set([
  'to',
  'of',
  'by',
  'in',
  'the',
  'an',
  'and',
  'or',
  'for',
  'on',
  'at',
  'per',
  'vs',
  'is',
  'are',
  'what',
  'how',
])

function words(s: string): string[] {
  const all = s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1)
  const kept = all.filter((w) => !STOPWORDS.has(w))
  // A query of little words only ("to") still searches for them.
  return kept.length ? kept : all
}

function score(def: MetricDef, terms: readonly string[], phrase: string): number {
  if (!terms.length) return 1
  const name = def.name.toLowerCase()
  // The name itself, then the whole phrase in the name, rank first.
  if (phrase && name === phrase) return 100
  const bonus = phrase && name.includes(phrase) ? 10 : 0
  const id = def.id.toLowerCase()
  const rest = `${def.definition} ${def.formula ?? ''} ${def.population ?? ''}`.toLowerCase()
  let s = 0
  for (const t of terms) {
    if (name.includes(t)) s += 3
    else if (id.includes(t)) s += 2
    else if (rest.includes(t)) s += 1
  }
  return s ? s + bonus : 0
}

export function findMetrics(rt: ToolRuntime, raw: unknown): ToolOutput {
  const input = inputOf(raw)
  const bad = unknownKeys(input, ['query', 'view'])
  if (bad) return fail(bad)
  if (input.query != null && typeof input.query !== 'string') return fail('query must be text.')
  if (input.view != null && typeof input.view !== 'string') return fail('view must be a view key.')
  const m = rt.base.metrics
  const query = ((input.query as string | undefined) ?? '').trim().toLowerCase()
  const terms = words(query)
  const view = input.view as string | undefined
  // On a tie, a metric with a target in force (a key figure judged on screen) before a finding
  // or a rule, then the shorter name.
  const rank = (def: MetricDef) => (m.target(def.id) ? 0 : def.kind ? 2 : 1)
  const scored = m.list
    .map((def, i) => ({ def, i, s: score(def, terms, query), r: rank(def) }))
    .filter((x) => x.s > 0 && (!view || (x.def.views as readonly string[]).includes(view)))
    .sort((a, b) => b.s - a.s || a.r - b.r || a.def.name.length - b.def.name.length || a.i - b.i)
  const list = scored.slice(0, MAX_METRICS).map(({ def }) => {
    const target = m.target(def.id)
    return {
      metric: def.id,
      name: def.name,
      views: def.views,
      definition: def.definition,
      formula: def.formula ?? null,
      population: def.population ?? null,
      window: def.window ?? null,
      unit: unitOf(def.unit) || def.unit,
      target: target ? targetText(def, target) : null,
      good_direction: def.goodDirection,
      changed_from_default: m.isChanged(def.id),
      ...(def.kind ? { kind: def.kind } : {}),
    }
  })
  return ok({
    matches: scored.length,
    shown: list.length,
    metrics: list,
    ...(list.length ? {} : { note: 'No metric matches. Try fewer or other words, or leave the query out.' }),
  })
}
