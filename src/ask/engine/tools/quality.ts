/**
 * `explain_quality`: tiers and their reasons from the quality index (`ctx.quality`), the checks a
 * dataset passes or fails, the fields that hold it back, and values not on the official lists with
 * counts. Values are listed only for allowlisted category fields: never names, IDs or free text.
 */
import { fieldShortfall } from '@/data/quality/compute'
import { isFieldRef } from '@/data/quality/fieldRef'
import { TIER_LABEL, TIER_MEANING, tierRank } from '@/data/quality/tier'
import { isUnrecognized } from '@/data/quality/vocab'
import { DATASETS, type DatasetKey } from '@/data/schema'
import { minGroupOf } from '@/metrics/privacy'
import { joinsFor, queryDataset } from '../allowlist'
import { checksValues, NOT_OFFICIAL, sharedValues } from '../values'
import { fail, inputOf, num, ok, type ToolOutput, type ToolRuntime, unknownKeys } from './shared'

/** Values not on the official lists, per field, most frequent first. */
const MAX_VALUES = 15

function unrecognized(rt: ToolRuntime, dataset: DatasetKey, field: string) {
  const q = queryDataset(dataset)
  const f = q?.fields.find((x) => x.name === field)
  // Only plain categories: never people, IDs, text, grouped-counts-only fields or case topics.
  if (!q || f?.kind !== 'category' || f.countsOnly || f.hidesEr || f.name.startsWith('org.')) return null
  const ref = `${dataset}.${field}`
  const counts = new Map<string, number>()
  for (const r of rt.base.all[dataset] as unknown as Record<string, unknown>[]) {
    const v = r[field]
    if (isUnrecognized(ref, v, rt.base.quality.vocab))
      counts.set(v as string, (counts.get(v as string) ?? 0) + 1)
  }
  if (!counts.size) return null
  // A value fewer people than the anonymity minimum share may be free text about one person: it
  // is counted under one stand-in value, never sent.
  const sent = checksValues(q, f) ? sharedValues(rt.base, q, f, joinsFor(rt.base)) : null
  const out: { value: string; rows: number; values?: number }[] = []
  let rare = 0
  let rareRows = 0
  for (const [value, rows] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    if (!sent || sent.has(value)) out.push({ value, rows })
    else {
      rare++
      rareRows += rows
    }
  }
  const listed = out.slice(0, MAX_VALUES)
  if (rare) listed.push({ value: NOT_OFFICIAL(minGroupOf(rt.base.metrics)), rows: rareRows, values: rare })
  return listed
}

function fieldOut(rt: ToolRuntime, dataset: DatasetKey, field: string) {
  const q = rt.base.quality
  const ref = `${dataset}.${field}` as const
  const st = q.fieldStats(ref)
  const values = unrecognized(rt, dataset, field)
  return {
    field,
    label: st.label,
    tier: st.tier,
    rows: st.rows,
    applies_to: st.scope,
    applicable_rows: st.applicableRows,
    filled: st.filled,
    blank: st.blank,
    coverage: num(st.coverage),
    not_recognized: st.invalid,
    defaulted: st.defaulted,
    remapped: st.remapped,
    // The cap reason once the dataset is silver; before that, the shortfall the Data room lists.
    held_back_because:
      st.capReason ?? (st.tier === 'none' ? null : (fieldShortfall(st, q.rules)?.text ?? null)),
    explain: q.explain(ref),
    ...(values ? { values_not_on_official_lists: values } : {}),
  }
}

export function explainQuality(rt: ToolRuntime, raw: unknown): ToolOutput {
  const input = inputOf(raw)
  const bad = unknownKeys(input, ['dataset', 'field'])
  if (bad) return fail(bad)
  const q = rt.base.quality
  const tiers = Object.fromEntries(
    (['gold', 'silver', 'bronze', 'none'] as const).map((t) => [t, TIER_MEANING[t]]),
  )
  if (input.dataset == null) {
    if (input.field != null) return fail('field needs a dataset.')
    return ok({
      data_standard: rt.base.standard,
      tiers,
      datasets: DATASETS.map((d) => {
        const dq = q.dataset(d.key)
        return {
          dataset: d.key,
          label: d.label,
          tier: dq.tier,
          rows: dq.rows,
          explain: q.explain(d.key),
          to_reach_next_tier: dq.missing,
        }
      }),
    })
  }
  const def = DATASETS.find((d) => d.key === input.dataset)
  if (!def) return fail(`dataset must be one of ${DATASETS.map((d) => d.key).join(', ')}.`)
  const key = def.key
  if (input.field != null) {
    const ref = `${key}.${String(input.field)}`
    if (!isFieldRef(ref))
      return fail(
        `No field "${String(input.field)}" in ${key}. Fields: ${def.fields.map((f) => f.key).join(', ')}.`,
      )
    return ok({ dataset: key, tiers, ...fieldOut(rt, key, String(input.field)) })
  }
  const dq = q.dataset(key)
  const fields = q.fields(key)
  // Fields below the dataset's tier, and fields short of silver on their own, as the Data room
  // lists them whatever the dataset's tier (a bronze dataset's weak fields show before its mapping
  // is confirmed).
  const below = fields
    .map((f) => ({ f, short: f.tier === 'none' ? null : fieldShortfall(f, q.rules) }))
    .filter(({ f, short }) => tierRank(f.tier) < tierRank(dq.tier) || f.capReason || short)
  const values = def.fields
    .map((f) => ({ field: f.key, values: unrecognized(rt, key, f.key) }))
    .filter((x) => x.values)
  return ok({
    dataset: key,
    label: def.label,
    tier: dq.tier,
    tier_label: TIER_LABEL[dq.tier],
    rows: dq.rows,
    data_standard: rt.base.standard,
    explain: q.explain(key),
    issue_rate: num(dq.issueRate),
    checks: q.checks(key).map((r) => ({
      check: r.label,
      pass: r.pass,
      detail: r.detail,
      needed_for: r.gate,
      rows: r.count || null,
    })),
    to_reach_next_tier: dq.missing,
    fields_held_back: below.map(({ f, short }) => ({
      field: f.ref.split('.')[1],
      label: f.label,
      tier: f.tier,
      coverage: num(f.coverage),
      reason: f.capReason ?? short?.text ?? null,
    })),
    values_not_on_official_lists: values,
    tiers,
  })
}
