/**
 * `query_records`: aggregates over the scoped rows of one dataset (docs/ASK.md, Tools). Counts,
 * distinct people, sum, mean, median, min, max and share; group by up to two allowlisted fields
 * (dates by month, quarter or year); at most 50 rows, each with a `ref` to the rows behind it.
 *
 * Privacy, as everywhere in Census:
 *  - only allowlisted fields (see `allowlist.ts`); people come back as tokens;
 *  - rates, means, medians, shares, sums, minimums and maximums over fewer people than the
 *    anonymity minimum are hidden with the reason; counts stay, except for grouped-counts-only
 *    fields (immigration, leave reasons) and filters on one person's rating, answer or pay ratio,
 *    where small counts are hidden too;
 *  - survey groups cut by manager need the survey manager-cut minimum, and so do the surveys about
 *    managers in a narrowed scope (Listening's rule); each survey keeps its own raised minimum;
 *    engagement answers are left out while the engagement switch is off;
 *  - employee relations cases are counted by category only: any cut by assignee, subcategory,
 *    location or the requester's org leaves them out, and so does a scope smaller than the minimum;
 *  - a number below the data standard comes back hidden with the reason, never the value;
 *  - a scope with fewer people than the minimum is not broken down at all (a leader filter is
 *    already limited to real leaders with orgs at the minimum, in `scope.ts`);
 *  - survey answers and right to work rows come back as grouped counts with small counts hidden,
 *    and a group whose count is hidden is left out entirely, since its name alone (a visa type, an
 *    item someone scored low) can be the secret; such groups are counted together as Other only
 *    when that is at least the minimum;
 *  - category values off the official list that few people share go as one stand-in value
 *    (`values.ts`): uploaded free text can name someone or hold health details;
 *  - means and medians of one person's rating, answer or pay ratio are rounded, and a result that
 *    differs from an earlier one in the chat by fewer people than the minimum is withheld
 *    (`audit.ts`), so two results cannot be subtracted to give one person's value;
 *  - in a scope that leaves values out, a group that differs from the same group without one of
 *    those values by fewer people than the minimum is left out, name and all.
 */
import { gateFor } from '@/components/tier/tierModel'
import type { AnalyticsContext } from '@/data/context'
import { withoutValue } from '@/data/exclusion'
import type { FieldRef } from '@/data/quality/fieldRef'
import { type DatasetKey, type SurveyResponse, type SurveyType, surveyProgramOf } from '@/data/schema'
import {
  dimensionSet,
  FILTER_DIMENSIONS,
  type FilterDimension,
  isActiveAt,
  isEmployee,
  isExcluded,
} from '@/data/scope'
import type { DrillSpec, LeaveGroupRow } from '@/drill/types'
import { quarterKey } from '@/lib/dates'
import { median } from '@/lib/stats'
import { aggregate, managerWindowStart, type SurveyGroupRow } from '@/lib/surveys'
import { minGroupOf, surveyMinimumsOf } from '@/metrics/privacy'
import { listeningSettingsFor } from '@/views/listening/engine/settings'
import {
  groupableFields,
  type Joins,
  joinsFor,
  QUERY_DATASETS,
  type QueryDataset,
  type QueryField,
  queryDataset,
  type Row,
} from '../allowlist'
import { DIFFERENCING, type RowSet, unionOf } from '../audit'
import { contextFor, scopeOut, scopeWords } from '../scope'
import { valueMapFor } from '../values'
import { fail, inputOf, num, ok, scopedCtx, type ToolOutput, type ToolRuntime, unknownKeys } from './shared'

export const MAX_ROWS = 50
export const DEFAULT_ROWS = 25
export const MAX_GROUP_BY = 2
export const MAX_MEASURES = 6

export const OPS = [
  'eq',
  'ne',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'is_null',
  'not_null',
  'in_period',
] as const
export type Op = (typeof OPS)[number]

export const MEASURE_OPS = [
  'count',
  'distinct_people',
  'share',
  'sum',
  'mean',
  'median',
  'min',
  'max',
] as const
export type MeasureOp = (typeof MEASURE_OPS)[number]

export const DATE_PARTS = ['month', 'quarter', 'year'] as const
type DatePart = (typeof DATE_PARTS)[number]

const OPS_BY_KIND: Record<QueryField['kind'], readonly Op[]> = {
  category: ['eq', 'ne', 'in', 'not_in', 'is_null', 'not_null'],
  person: ['eq', 'ne', 'in', 'not_in', 'is_null', 'not_null'],
  date: ['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'in_period', 'is_null', 'not_null'],
  boolean: ['eq', 'is_null', 'not_null'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'not_null'],
}

export const HIDDEN_SMALL = (min: number): string => `Hidden to protect anonymity (n < ${min})`
/** The group value of the row that counts small groups together. */
export const OTHER = 'Other'
const ER = 'Employee relations'

interface Where {
  field: QueryField
  op: Op
  test: (v: unknown) => boolean
  echo: Record<string, unknown>
}
interface GroupBy {
  field: QueryField
  part: DatePart | null
}
interface Measure {
  op: MeasureOp
  field: QueryField | null
  key: string
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

function fieldList(d: QueryDataset, pick: (f: QueryField) => boolean = () => true): string {
  return d.fields
    .filter(pick)
    .map((f) => f.name)
    .join(', ')
}

function lookupField(d: QueryDataset, name: unknown, use: string): QueryField | string {
  if (typeof name !== 'string' || !name) return `${use} needs a field. Fields of ${d.key}: ${fieldList(d)}.`
  const f = d.fields.find((x) => x.name === name)
  if (f) return f
  const denied = d.denied.get(name)
  if (denied) return `"${name}" is not available. ${denied}`
  return `No field "${name}" in ${d.key}. Fields: ${fieldList(d)}.`
}

/** Compare a value to what Claude asked for: case-insensitive for text. */
const same = (a: unknown, b: unknown): boolean =>
  typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b

function parseWhere(rt: ToolRuntime, ctx: AnalyticsContext, d: QueryDataset, raw: unknown): Where | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Each where clause is {field, op, value}.'
  const w = raw as Record<string, unknown>
  const f = lookupField(d, w.field, 'A where clause')
  if (typeof f === 'string') return f
  const op = (w.op ?? 'eq') as Op
  if (!OPS_BY_KIND[f.kind].includes(op))
    return `op "${String(w.op)}" does not apply to ${f.name}. Use one of ${OPS_BY_KIND[f.kind].join(', ')}.`
  const value = w.value
  const echo = { field: f.name, op, ...(value !== undefined ? { value } : {}) }
  const isNull = (v: unknown) => v == null || v === ''
  if (op === 'is_null') return { field: f, op, echo, test: isNull }
  if (op === 'not_null') return { field: f, op, echo, test: (v) => !isNull(v) }

  if (f.kind === 'person') {
    const list = op === 'in' || op === 'not_in' ? value : [value]
    if (!Array.isArray(list) || !list.every((t) => typeof t === 'string'))
      return `${f.name} takes person tokens such as {{P3}}${op === 'in' || op === 'not_in' ? ' in a list' : ''}.`
    for (const t of list as string[])
      if (!rt.tokens.resolve(t)) return `"${t}" is not a person token from this conversation.`
    const hit = (v: unknown) =>
      (list as string[]).some((t) =>
        rt.tokens.matches(t, v, f.personBy === 'id' || ctx.org.byId.has(v as string) ? 'id' : 'name'),
      )
    const neg = op === 'ne' || op === 'not_in'
    return { field: f, op, echo, test: (v) => (neg ? !hit(v) : hit(v)) }
  }

  if (op === 'in' || op === 'not_in') {
    if (!Array.isArray(value) || !value.length) return `${op} needs a list of values.`
    const neg = op === 'not_in'
    return { field: f, op, echo, test: (v) => (value as unknown[]).some((x) => same(v, x)) !== neg }
  }
  if (op === 'in_period') {
    const w2 = value === 'prior' ? ctx.prior : value === 'current' || value == null ? ctx.window : null
    if (!w2) return 'in_period takes "current" (the period) or "prior" (the comparison period).'
    return {
      field: f,
      op,
      echo: { ...echo, start: w2.start, end: w2.end },
      test: (v) => typeof v === 'string' && v >= w2.start && v <= w2.end,
    }
  }
  if (op === 'between') {
    if (!Array.isArray(value) || value.length !== 2) return 'between needs [low, high].'
    const [lo, hi] = value as unknown[]
    if (f.kind === 'date' && (!isDate(lo) || !isDate(hi))) return 'Dates are YYYY-MM-DD.'
    if (f.kind === 'number' && (typeof lo !== 'number' || typeof hi !== 'number'))
      return 'between needs two numbers.'
    return {
      field: f,
      op,
      echo,
      test: (v) =>
        v != null &&
        (v as number | string) >= (lo as number | string) &&
        (v as number | string) <= (hi as number | string),
    }
  }
  if (f.kind === 'boolean' && typeof value !== 'boolean') return `${f.name} takes true or false.`
  if (f.kind === 'number' && typeof value !== 'number') return `${f.name} takes a number.`
  if (f.kind === 'date' && !isDate(value)) return 'Dates are YYYY-MM-DD.'
  if (f.kind === 'category' && typeof value !== 'string') return `${f.name} takes text.`
  const cmp = (v: unknown): number | null => {
    if (v == null) return null
    if (typeof v === 'string' && typeof value === 'string') return v < value ? -1 : v > value ? 1 : 0
    if (typeof v === 'number' && typeof value === 'number') return v - value
    return null
  }
  const tests: Partial<Record<Op, (v: unknown) => boolean>> = {
    eq: (v) => same(v, value),
    ne: (v) => !same(v, value),
    gt: (v) => (cmp(v) ?? 0) > 0 && v != null,
    gte: (v) => v != null && (cmp(v) ?? -1) >= 0,
    lt: (v) => v != null && (cmp(v) ?? 1) < 0,
    lte: (v) => v != null && (cmp(v) ?? 1) <= 0,
  }
  const test = tests[op]
  return test ? { field: f, op, echo, test } : `op "${op}" is not supported.`
}

function parseGroupBy(d: QueryDataset, raw: unknown): GroupBy | string {
  const spec = typeof raw === 'string' ? { field: raw } : raw
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return 'Each group_by entry is {field, by?}.'
  const g = spec as Record<string, unknown>
  const f = lookupField(d, g.field, 'group_by')
  if (typeof f === 'string') return f
  if (f.kind === 'number')
    return `${f.name} is a number; group by a category, person, date or yes/no field. Groupable: ${fieldList(d, (x) => x.kind !== 'number')}.`
  if (f.kind !== 'date') {
    if (g.by != null) return `by applies to dates only.`
    return { field: f, part: null }
  }
  const part = (g.by ?? 'month') as DatePart
  if (!DATE_PARTS.includes(part)) return `by must be one of ${DATE_PARTS.join(', ')}.`
  return { field: f, part }
}

function parseMeasure(d: QueryDataset, raw: unknown): Measure | string {
  const spec = typeof raw === 'string' ? { op: raw } : raw
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return 'Each measure is {op, field?}.'
  const m = spec as Record<string, unknown>
  const op = m.op as MeasureOp
  if (!MEASURE_OPS.includes(op)) return `Measure op must be one of ${MEASURE_OPS.join(', ')}.`
  if (op === 'count') return { op, field: null, key: 'count' }
  if (op === 'distinct_people') {
    if (!d.person) return `${d.key} is not about people; use count.`
    return { op, field: null, key: 'people' }
  }
  if (op === 'share' && m.field == null) return { op, field: null, key: 'share' }
  const f = lookupField(d, m.field, `${op}`)
  if (typeof f === 'string') return f
  if (op === 'share') {
    if (f.kind !== 'boolean')
      return `share takes a yes/no field (or no field for each group's share of the rows).`
    return { op, field: f, key: `share_${f.name}` }
  }
  if (f.kind !== 'number')
    return `${op} needs a number field. Numbers in ${d.key}: ${fieldList(d, (x) => x.kind === 'number') || 'none'}.`
  if (f.sensitive && (op === 'sum' || op === 'min' || op === 'max'))
    return `${f.name} is one person's rating, answer or pay ratio: only mean and median over a group are available.`
  return { op, field: f, key: `${op}_${f.name}` }
}

function bucket(v: unknown, part: DatePart | null): unknown {
  if (part == null || typeof v !== 'string') return v ?? null
  if (part === 'year') return v.slice(0, 4)
  if (part === 'quarter') return quarterKey(v)
  return v.slice(0, 7)
}

/** The value a person field shows: the person's token, or a team's own name. */
function personValue(rt: ToolRuntime, ctx: AnalyticsContext, f: QueryField, v: unknown): unknown {
  if (typeof v !== 'string' || !v) return null
  if (f.personBy === 'id' || ctx.org.byId.has(v)) return rt.tokens.forEmployee(v)
  return rt.tokens.forName(v)
}

/** The value as the local drill title shows it (real names stay in the browser). */
function localValue(ctx: AnalyticsContext, f: QueryField, v: unknown): string {
  if (v == null || v === '') return '(blank)'
  if (f.kind === 'person' && typeof v === 'string') return ctx.org.byId.get(v)?.name ?? v
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

interface Stats {
  count: number | null
  people: number | null
  values: Record<string, number | null>
  hidden: string | null
  small: boolean
}

function computeStats(
  d: QueryDataset,
  rows: readonly Row[],
  j: Joins,
  measures: readonly Measure[],
  opts: { min: number; hideCounts: boolean; total: number },
  mixed: Set<string>,
): Stats {
  const who = new Set<string>()
  if (d.person)
    for (const r of rows) {
      const p = d.person(r, j)
      if (p) who.add(p)
    }
  const people = d.person ? who.size : null
  const small = people != null && people < opts.min
  const hideCounts = small && opts.hideCounts
  const values: Record<string, number | null> = {}
  for (const m of measures) {
    if (m.op === 'count' || m.op === 'distinct_people') continue
    if (small) {
      values[m.key] = null
      continue
    }
    if (m.op === 'share' && !m.field) {
      values[m.key] = opts.total ? num(rows.length / opts.total) : null
      continue
    }
    const f = m.field as QueryField
    if (m.op === 'share') {
      const known = rows.map((r) => f.get(r, j)).filter((v): v is boolean => typeof v === 'boolean')
      values[m.key] = known.length ? num(known.filter(Boolean).length / known.length) : null
      continue
    }
    const xs = rows
      .map((r) => f.get(r, j))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (d.key === 'surveyResponses' && f.name === 'score') {
      // Means over one scale only: 1-5 and 0-10 answers do not average together.
      const scales = new Set(rows.map((r) => (r as unknown as SurveyResponse).scale))
      if (scales.size > 1) {
        values[m.key] = null
        mixed.add(m.key)
        continue
      }
    }
    if (!xs.length) {
      values[m.key] = null
      continue
    }
    switch (m.op) {
      case 'sum':
        values[m.key] = num(xs.reduce((a, b) => a + b, 0))
        break
      case 'mean':
        values[m.key] = num(xs.reduce((a, b) => a + b, 0) / xs.length)
        break
      case 'median':
        values[m.key] = num(median(xs))
        break
      case 'min':
        values[m.key] = num(Math.min(...xs))
        break
      case 'max':
        values[m.key] = num(Math.max(...xs))
        break
    }
  }
  return {
    count: hideCounts ? null : rows.length,
    people: hideCounts ? null : people,
    values,
    hidden: small ? HIDDEN_SMALL(opts.min) : null,
    small,
  }
}

/**
 * A released mean or median of one person's rating, answer or pay ratio, rounded so that two
 * results over nearly the same people cannot be subtracted back to one value: scores to 0.1,
 * ratios to 0.01, fractions to 0.001 (0.1 pt).
 */
export function roundSensitive(v: number | null, unit: QueryField['unit']): number | null {
  if (v == null) return v
  const step = unit === 'score' ? 10 : unit === 'fraction' ? 1000 : 100
  return Math.round(v * step) / step
}

/** One result about to be sent: its rows, its numbers, and the smallest group it needs. */
interface Release {
  rows: readonly Row[]
  st: Stats
  min: number
}

/**
 * Differencing protection (`audit.ts`): release each result in order, withholding a sensitive
 * mean or median, or a grouped-only count, whose rows differ from an earlier result's in this chat
 * by fewer people than the minimum. The groups one answer released are summed into a larger one,
 * so their union is remembered too; then the total is released against it.
 */
function auditReleases(
  rt: ToolRuntime,
  d: QueryDataset,
  j: Joins,
  measures: readonly Measure[],
  hideCounts: boolean,
  groups: readonly Release[],
  total: Release,
): void {
  if (!d.person) return
  const personOf = (r: object) => d.person?.(r as Row, j) ?? null
  const fields = [
    ...new Set(
      measures.flatMap((m) =>
        m.field?.sensitive && (m.op === 'mean' || m.op === 'median') ? [m.field] : [],
      ),
    ),
  ]
  if (!fields.length && !hideCounts) return
  const now = new Map<string, RowSet[]>()
  const release = (x: Release) => {
    for (const f of fields) {
      const keys = measures.filter((m) => m.field === f && (m.op === 'mean' || m.op === 'median'))
      if (keys.every((m) => x.st.values[m.key] == null)) continue
      const topic = `${d.key}.${f.name}`
      const set = rt.audit.rowSet(
        x.rows.filter((r) => typeof f.get(r, j) === 'number'),
        personOf,
      )
      if (rt.audit.release(topic, set, x.min)) {
        for (const m of keys) x.st.values[m.key] = roundSensitive(x.st.values[m.key] ?? null, f.unit)
        now.set(topic, [...(now.get(topic) ?? []), set])
      } else {
        for (const m of keys) x.st.values[m.key] = null
        x.st.hidden = DIFFERENCING(x.min)
      }
    }
    if (hideCounts && x.st.count != null) {
      const topic = `${d.key}#counts`
      const set = rt.audit.rowSet(x.rows, personOf)
      if (rt.audit.release(topic, set, x.min)) now.set(topic, [...(now.get(topic) ?? []), set])
      else {
        x.st.count = null
        x.st.people = null
        for (const k of Object.keys(x.st.values)) x.st.values[k] = null
        x.st.hidden = DIFFERENCING(x.min)
      }
    }
  }
  for (const g of groups) release(g)
  for (const [topic, sets] of now) if (sets.length > 1) rt.audit.record(topic, unionOf(sets))
  release(total)
}

/** The smallest group survey answers need, as Listening applies it. */
interface SurveyMinimum {
  /** A cut by manager (group by or where on `org.manager`): every survey needs the manager-cut minimum. */
  byManager: boolean
  /** A filter, or a where clause on the person's org, narrows the scope as a Listening filter does. */
  narrowed: boolean
  minManager: number
  /** The minimum for one survey's answers. */
  of(survey: unknown): number
  /** The minimum for a set of answers: the largest of their surveys'. */
  forRows(rows: readonly Row[]): number
}

const orgField = (f: QueryField): boolean => f.kind === 'person' || f.name.startsWith('org.')

/**
 * Listening's rule (`listeningSettingsFor`): each survey's own smallest group, and for the surveys
 * about managers (Manager feedback, Engagement) the manager-cut minimum whenever the scope is
 * narrowed, since a leader, department or location can be one manager's team. In Ask a where
 * clause on the person's org narrows like a filter, and so does a cut by two org fields at once.
 * Any cut by manager needs the manager-cut minimum for every survey.
 */
function surveyMinimum(
  ctx: AnalyticsContext,
  where: readonly Where[],
  groupBy: readonly GroupBy[],
): SurveyMinimum {
  const sm = surveyMinimumsOf(ctx.metrics)
  // A leader filter is that leader's org: a cut by manager like any other.
  const byManager =
    !!ctx.filters.leaderId ||
    [...where.map((w) => w.field), ...groupBy.map((g) => g.field)].some((f) => f.managerCut)
  const narrowed =
    !ctx.isCompany ||
    byManager ||
    where.some((w) => orgField(w.field)) ||
    groupBy.filter((g) => orgField(g.field)).length > 1
  const s = listeningSettingsFor({ metrics: ctx.metrics, isCompany: !narrowed })
  const floor = byManager ? sm.minManager : sm.minGroup
  const of = (survey: unknown): number => Math.max(floor, s.minOf[survey as SurveyType] ?? sm.minGroup)
  return {
    byManager,
    narrowed,
    minManager: sm.minManager,
    of,
    forRows: (rows) => {
      let min = floor
      const seen = new Set<unknown>()
      for (const r of rows) {
        if (seen.has(r.survey)) continue
        seen.add(r.survey)
        min = Math.max(min, of(r.survey))
      }
      return min
    },
  }
}

/** The records behind a group: the dataset's own drill kind, or grouped rows for surveys and leave reasons. */
function groupDrill(
  d: QueryDataset,
  rows: readonly Row[],
  title: string,
  subtitle: string,
  how: 'records' | 'survey' | 'leave' | 'none',
  st: Stats,
  min: number,
  groupBy: string,
  leaveReason: string | null,
): DrillSpec | null {
  if (!rows.length || how === 'none') return null
  if (how === 'survey') {
    const answers = rows as unknown as SurveyResponse[]
    const a = aggregate(answers, { min })
    const surveys = [...new Set(answers.map((r) => r.survey))]
    const waves = [...new Set(answers.map((r) => r.wave))]
    const row: SurveyGroupRow = {
      survey: surveys[0] as SurveyResponse['survey'],
      wave: waves.length === 1 ? (waves[0] as string) : null,
      groupBy,
      group: title,
      driver: null,
      item: null,
      respondents: a.respondents,
      responses: a.responses,
      scale: a.scale,
      mean: a.mean,
      topBox: a.topBox,
      nps: a.nps,
      suppressed: a.suppressed,
    }
    return {
      kind: 'surveyGroups',
      title,
      subtitle,
      rows: [row],
      note: 'Survey results are grouped; no answer is shown on its own.',
    }
  }
  if (how === 'leave') {
    if (st.small) return null
    const row: LeaveGroupRow = {
      groupBy,
      group: title,
      reason: leaveReason,
      people: st.people,
      leaves: st.count,
      measure: null,
      value: null,
      format: 'int',
      suppressed: false,
    }
    return {
      kind: 'leaveGroups',
      title,
      subtitle,
      rows: [row],
      note: 'Leave by reason shows as grouped counts only.',
    }
  }
  return { kind: d.key, title, subtitle, rows: rows as never } as DrillSpec
}

/** The excluded values of a scope, one by one (the leader, and each value of an excluded list). */
function excludedValues(ctx: AnalyticsContext): { dim: FilterDimension; value: string }[] {
  const f = ctx.filters
  return FILTER_DIMENSIONS.flatMap((dim) => {
    if (!isExcluded(f, dim) || !dimensionSet(f, dim)) return []
    const values = dim === 'leaderId' ? [f.leaderId as string] : f[dim]
    return values.map((value) => ({ dim, value }))
  })
}

/**
 * The groups (by key) that differ from the same group in the scope without one of its excluded
 * values by between 1 and the group's minimum − 1 people (rows, for a dataset without people).
 * Side by side, the two would single those people out, as a scope that leaves out that few would.
 */
function groupsCutByExclusion(
  rt: ToolRuntime,
  ctx: AnalyticsContext,
  d: QueryDataset,
  j: Joins,
  groups: ReadonlyMap<string, { rows: Row[] }>,
  rowsIn: (c: AnalyticsContext) => readonly Row[],
  keyOf: (r: Row) => string,
  minFor: (rows: readonly Row[]) => number,
): Set<string> {
  const out = new Set<string>()
  const size = (rows: readonly Row[]): number => {
    if (!d.person) return rows.length
    const people = new Set<string>()
    for (const r of rows) {
      const p = d.person(r, j)
      if (p) people.add(p)
    }
    return people.size
  }
  for (const x of excludedValues(ctx)) {
    const without = contextFor(rt.base, withoutValue(ctx.filters, x.dim, x.value))
    const byKey = new Map<string, Row[]>()
    for (const r of rowsIn(without)) {
      const k = keyOf(r)
      const hit = byKey.get(k)
      if (hit) hit.push(r)
      else byKey.set(k, [r])
    }
    for (const [k, g] of groups) {
      const diff = size(byKey.get(k) ?? []) - size(g.rows)
      if (diff > 0 && diff < minFor(g.rows)) out.add(k)
    }
  }
  return out
}

export function queryRecords(rt: ToolRuntime, raw: unknown): ToolOutput {
  const input = inputOf(raw)
  const bad = unknownKeys(input, ['dataset', 'where', 'group_by', 'measures', 'filters', 'sort', 'limit'])
  if (bad) return fail(bad)
  const d = queryDataset(String(input.dataset ?? ''))
  if (!d) return fail(`dataset must be one of ${QUERY_DATASETS.map((x) => x.key).join(', ')}.`)
  const s = scopedCtx(rt, input.filters)
  if (!s.ok) return fail(s.error)
  const ctx = s.ctx
  const j = joinsFor(ctx)
  // A scope this small is a person or two: nothing about the people in it is broken down.
  const scopeMin = minGroupOf(ctx.metrics)
  if (d.person && d.key !== 'candidates' && !ctx.isCompany && ctx.data.employees.length < scopeMin)
    return fail(
      `The scope (${scopeWords(ctx.filters, rt.tokens)}) has fewer than ${scopeMin} people, the anonymity minimum, so Ask does not break down its records. Use a wider scope.`,
    )

  // Parse every argument before computing anything.
  const whereRaw = input.where == null ? [] : Array.isArray(input.where) ? input.where : [input.where]
  const where: Where[] = []
  for (const w of whereRaw) {
    const p = parseWhere(rt, ctx, d, w)
    if (typeof p === 'string') return fail(p)
    where.push(p)
  }
  const groupRaw =
    input.group_by == null ? [] : Array.isArray(input.group_by) ? input.group_by : [input.group_by]
  if (groupRaw.length > MAX_GROUP_BY) return fail(`group_by takes at most ${MAX_GROUP_BY} fields.`)
  const groupBy: GroupBy[] = []
  for (const g of groupRaw) {
    const p = parseGroupBy(d, g)
    if (typeof p === 'string') return fail(p)
    groupBy.push(p)
  }
  const measureRaw =
    input.measures == null ? ['count'] : Array.isArray(input.measures) ? input.measures : [input.measures]
  if (measureRaw.length > MAX_MEASURES) return fail(`measures takes at most ${MAX_MEASURES}.`)
  const measures: Measure[] = []
  for (const m of measureRaw) {
    const p = parseMeasure(d, m)
    if (typeof p === 'string') return fail(p)
    if (!measures.some((x) => x.key === p.key)) measures.push(p)
  }
  if (!measures.some((m) => m.op === 'count')) measures.unshift({ op: 'count', field: null, key: 'count' })
  const limitRaw = input.limit ?? DEFAULT_ROWS
  if (typeof limitRaw !== 'number' || !Number.isInteger(limitRaw) || limitRaw < 1)
    return fail(`limit must be a whole number from 1 to ${MAX_ROWS}.`)
  const limit = Math.min(MAX_ROWS, limitRaw)
  const sortRaw = (input.sort ?? {}) as Record<string, unknown>
  const sortBy = typeof sortRaw.by === 'string' ? sortRaw.by : 'count'
  const sortDir =
    sortRaw.dir === 'asc' ? 'asc' : sortRaw.dir === 'desc' ? 'desc' : sortBy === 'group' ? 'asc' : 'desc'
  if (
    sortBy !== 'group' &&
    sortBy !== 'count' &&
    sortBy !== 'people' &&
    !measures.some((m) => m.key === sortBy)
  )
    return fail(
      `sort.by must be "count", "group" or a measure key: ${measures.map((m) => m.key).join(', ')}.`,
    )

  const used: QueryField[] = [
    ...where.map((w) => w.field),
    ...groupBy.map((g) => g.field),
    ...measures.flatMap((m) => (m.field ? [m.field] : [])),
  ]
  const countsOnly = d.countsOnly || used.some((f) => f.countsOnly)
  if (countsOnly && measures.some((m) => m.op !== 'count' && m.op !== 'distinct_people'))
    return fail(
      `${d.countsOnly ? `${d.label} data` : used.find((f) => f.countsOnly)?.name} gives grouped counts only: use count or distinct_people.`,
    )
  const immigration = used.some(
    (f) => f.countsOnly && f.uses.some((u) => u === 'rightToWork.authorizationType'),
  )
  const leave = used.some((f) => f.name === 'leaveReason' && d.key === 'transactions')
  const notes: string[] = []

  // The data standard: hidden with the reason, never the value.
  const uses = [...new Set(used.flatMap((f) => f.uses))] as FieldRef[]
  const gate = gateFor(ctx.quality, ctx.standard, uses.length ? uses : undefined, [d.key])
  const head = {
    dataset: d.key,
    label: d.label,
    ...scopeOut(ctx, rt.tokens),
    where: where.map((w) => w.echo),
    group_by: groupBy.map((g) => (g.part ? `${g.field.name} by ${g.part}` : g.field.name)),
    measures: measures.map((m) => m.key),
    tier: gate?.tier ?? null,
  }
  if (gate && !gate.shown) return ok({ ...head, hidden: gate.reason, rows: [] })

  // Rows in scope, with the privacy exclusions.
  let rows = ctx.data[d.key as DatasetKey] as unknown as Row[]
  let dropEr = false
  if (d.key === 'surveyResponses' && !ctx.features.engagementSurveys) {
    const before = rows.length
    rows = rows.filter((r) => r.survey !== 'Engagement')
    if (rows.length < before)
      notes.push('Engagement survey answers are left out while the engagement switch is off.')
  }
  if (d.key === 'cases') {
    const min = minGroupOf(ctx.metrics)
    const scoped = ctx.data.employees.filter((e) => isEmployee(e) && isActiveAt(e, ctx.asOf)).length
    const small = !ctx.isCompany && scoped < min
    if (small || used.some((f) => f.hidesEr)) {
      dropEr = true
      const before = rows.length
      rows = rows.filter((r) => r.category !== ER)
      if (rows.length < before || small)
        notes.push(
          small
            ? 'Employee relations cases are left out: the scope has fewer people than the anonymity minimum.'
            : 'Employee relations cases are left out of cuts by assignee, subcategory, location or the requester’s org (category counts only).',
        )
    }
  }
  for (const w of where) rows = rows.filter((r) => w.test(w.field.get(r, j)))

  const sm = surveyMinimumsOf(ctx.metrics)
  const surveyMin = d.key === 'surveyResponses' ? surveyMinimum(ctx, where, groupBy) : null
  /** The smallest group for these rows: the anonymity minimum, or the survey rule for survey answers. */
  const minFor = (rs: readonly Row[]): number => surveyMin?.forRows(rs) ?? sm.minGroup
  const min = minFor(rows)
  // Survey answers and right to work: never a small group's count (one person's answer or status).
  const hideCounts =
    countsOnly ||
    d.key === 'surveyResponses' ||
    where.some((w) => w.field.sensitive) ||
    groupBy.some((g) => g.field.sensitive)
  if (surveyMin?.byManager) {
    const start = managerWindowStart(ctx.asOf, sm.quarters)
    notes.push(
      `Survey cuts by manager need ${surveyMin.minManager} or more respondents. Listening pools them from ${start} to ${ctx.asOf}; a where clause on responseDate with between [${start}, ${ctx.asOf}] matches it.`,
    )
  } else if (surveyMin?.narrowed) {
    const about = [...new Set(rows.map((r) => r.survey as SurveyType))].filter(
      (sv) => surveyProgramOf.get(sv)?.managerCuts && surveyMin.of(sv) > sm.minGroup,
    )
    const mins = new Set(about.map((sv) => surveyMin.of(sv)))
    if (about.length)
      notes.push(
        `${
          mins.size === 1
            ? `${about.join(' and ')} answers need ${surveyMin.of(about[0])}`
            : `${about.map((sv) => `${sv} answers need ${surveyMin.of(sv)}`).join(' and ')}`
        } or more respondents in a narrowed scope, as in Listening: a narrowed scope can be one manager’s team.`,
      )
  }
  if (hideCounts) notes.push(`Counts under ${min} people are hidden for this question.`)
  const how: 'records' | 'survey' | 'leave' | 'none' = immigration
    ? 'none'
    : d.key === 'surveyResponses'
      ? 'survey'
      : leave
        ? 'leave'
        : 'records'
  if (immigration) notes.push('Immigration details stay grouped: no records are listed.')

  // Group. A category value off the official list that few people share goes as a stand-in.
  const valueMaps = groupBy.map((g) => valueMapFor(ctx, d, g.field, j))
  const mixed = new Set<string>()
  const groups = new Map<string, { raw: unknown[]; rows: Row[] }>()
  for (const r of rows) {
    const raw = groupBy.map((g, i) => valueMaps[i]?.(bucket(g.field.get(r, j), g.part)))
    const key = JSON.stringify(raw)
    const hit = groups.get(key)
    if (hit) hit.rows.push(r)
    else groups.set(key, { raw, rows: [r] })
  }
  // Inside a scope that leaves values out, a group the exclusions cut by a few people is left out.
  if (groupBy.length && excludedValues(ctx).length) {
    const rowsIn = (c: AnalyticsContext): Row[] => {
      let rs = c.data[d.key as DatasetKey] as unknown as Row[]
      if (d.key === 'surveyResponses' && !c.features.engagementSurveys)
        rs = rs.filter((r) => r.survey !== 'Engagement')
      if (dropEr) rs = rs.filter((r) => r.category !== ER)
      for (const w of where) rs = rs.filter((r) => w.test(w.field.get(r, j)))
      return rs
    }
    const keyOf = (r: Row) =>
      JSON.stringify(groupBy.map((g, i) => valueMaps[i]?.(bucket(g.field.get(r, j), g.part))))
    const cut = groupsCutByExclusion(rt, ctx, d, j, groups, rowsIn, keyOf, minFor)
    for (const k of cut) groups.delete(k)
    if (cut.size)
      notes.push(
        `${cut.size} ${cut.size === 1 ? 'group is' : 'groups are'} left out: the scope's exclusions remove fewer than ${min} people from ${cut.size === 1 ? 'it' : 'each'}, so comparing with the same ${cut.size === 1 ? 'group' : 'groups'} without them would single those people out.`,
      )
  }
  const total = rows.length
  const scopeText = `${ctx.window.label} · ${ctx.scopeLabel}`
  const groupWords = groupBy.map((g) => g.field.label).join(' and ') || d.label
  const out = [...groups.values()].map((g) => {
    const gmin = minFor(g.rows)
    const st = computeStats(d, g.rows, j, measures, { min: gmin, hideCounts, total }, mixed)
    const local = groupBy.map((gb, i) => localValue(ctx, gb.field, g.raw[i])).join(' · ')
    const title = groupBy.length ? `${d.label}: ${local}` : d.label
    const leaveReason = leave
      ? ((groupBy.findIndex((gb) => gb.field.name === 'leaveReason') >= 0
          ? g.raw[groupBy.findIndex((gb) => gb.field.name === 'leaveReason')]
          : null) as string | null)
      : null
    const spec =
      st.count == null
        ? null
        : groupDrill(d, g.rows, title, scopeText, how, st, gmin, groupWords, leaveReason)
    const group: Record<string, unknown> = {}
    groupBy.forEach((gb, i) => {
      group[gb.part ? `${gb.field.name}_${gb.part}` : gb.field.name] =
        gb.field.kind === 'person' ? personValue(rt, ctx, gb.field, g.raw[i]) : (g.raw[i] ?? null)
    })
    const sortKey = g.raw.map((v) => (v == null ? '￿' : String(v))).join('\u0001')
    return { st, group, sortKey, spec, rows: g.rows, min: gmin }
  })
  // A group whose count is hidden is left out, name and all; enough of them together are Other.
  const withheld = out.filter((x) => x.st.count == null)
  const visible = out.filter((x) => x.st.count != null)
  let other: (Release & { spec: DrillSpec | null; groups: number }) | null = null
  if (withheld.length) {
    const otherRows = withheld.flatMap((x) => x.rows)
    const omin = minFor(otherRows)
    const counts = measures.filter((m) => m.op === 'count' || m.op === 'distinct_people')
    const st = computeStats(d, otherRows, j, counts, { min: omin, hideCounts, total }, mixed)
    if (st.count != null)
      other = {
        rows: otherRows,
        st,
        min: omin,
        groups: withheld.length,
        spec: groupDrill(
          d,
          otherRows,
          `${d.label}: other groups`,
          scopeText,
          how,
          st,
          omin,
          groupWords,
          null,
        ),
      }
    notes.push(
      `${withheld.length} ${withheld.length === 1 ? 'group' : 'groups'} under the anonymity minimum ${withheld.length === 1 ? 'is' : 'are'} left out${other ? ' and counted together as Other' : ''}.`,
    )
  }
  const val = (x: (typeof out)[number]): number => {
    const v = sortBy === 'count' ? x.st.count : sortBy === 'people' ? x.st.people : x.st.values[sortBy]
    return v == null ? Number.NEGATIVE_INFINITY : v
  }
  visible.sort((a, b) => {
    if (sortBy === 'group')
      return sortDir === 'asc' ? a.sortKey.localeCompare(b.sortKey) : b.sortKey.localeCompare(a.sortKey)
    const diff = val(a) - val(b)
    return (sortDir === 'asc' ? diff : -diff) || a.sortKey.localeCompare(b.sortKey)
  })
  const shown = visible.slice(0, limit)
  const hasStats = measures.some((m) => m.op !== 'count' && m.op !== 'distinct_people')
  const rowOut = (st: Stats, spec: DrillSpec | null, label: string) => ({
    count: st.count,
    ...(d.person ? { people: st.people } : {}),
    ...st.values,
    ...(st.hidden && (hideCounts || hasStats) ? { hidden: st.hidden } : {}),
    ref: spec && st.count != null ? rt.refs.add(spec, label) : null,
  })
  const totalStats = computeStats(d, rows, j, measures, { min, hideCounts, total }, mixed)
  auditReleases(rt, d, j, measures, hideCounts, [...shown, ...(other ? [other] : [])], {
    rows,
    st: totalStats,
    min,
  })
  const totalSpec =
    totalStats.count == null
      ? null
      : groupDrill(d, rows, d.label, scopeText, how, totalStats, min, 'All rows', null)
  if (mixed.size)
    notes.push(
      'Some groups mix 1-5 and 0-10 answers, so their mean score is left out; filter by scale or item.',
    )
  if (!(input.where && whereRaw.some((w) => (w as { op?: string }).op === 'in_period')))
    notes.push('Rows are not limited to the period unless a where clause uses in_period.')
  return ok({
    ...head,
    rows: [
      ...shown.map((x) => ({
        ...(groupBy.length ? { group: x.group } : {}),
        ...rowOut(x.st, x.spec, `${d.label}: ${JSON.stringify(x.group)}`),
      })),
      ...(other
        ? [
            {
              group: Object.fromEntries(
                Object.keys(shown[0]?.group ?? withheld[0]?.group ?? {}).map((k) => [k, OTHER]),
              ),
              groups: other.groups,
              ...rowOut(other.st, other.spec, `${d.label}: other groups`),
            },
          ]
        : []),
    ],
    total: rowOut(totalStats, totalSpec, `${d.label}: all matching rows`),
    groups_total: out.length,
    groups_hidden: withheld.length,
    rows_shown: shown.length,
    anonymity_minimum: min,
    notes,
  })
}

/** For tests and the privacy matrix: every dataset with its groupable fields. */
export const QUERYABLE = QUERY_DATASETS.map((d) => ({
  dataset: d.key,
  groupable: groupableFields(d).map((f) => f.name),
}))
