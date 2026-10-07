/**
 * What of the screen may go to Claude (docs/ASK.md, Privacy rules; docs/ASK-ACTIONS.md, parts 2
 * to 4). A figure's rows are what the page shows an HR reader, cut however the view cuts them: a
 * cell of one or two people, one person's rating or survey answer, a compa-ratio bin of one. The
 * tools apply the small-group rules before anything is sent; a figure on a page does not. So Ask
 * takes from a figure (make_chart, and open_records by a figure's row) only what those rules
 * cannot be needed for:
 *
 *  - a figure about survey answers, ratings and assessments, right to work, pay, HR ops cases and
 *    leave, or flight risk is refused, whatever the scope: its cuts need the rules query_records
 *    and compare_groups apply (small counts hidden and folded, the release audit). It is known by
 *    its view, its metric, the fields it declares (`uses`), the records its rows open, and its id;
 *  - every figure is refused while the scope on screen has fewer active people than the anonymity
 *    minimum, or leaves out a group smaller than it (the rule every tool applies to the scope);
 *  - ID columns (requisition, position, case IDs) are left out: IDs never go to Claude.
 *
 * The records panel is named the same way: a panel about one person, or on pay, ratings, right to
 * work, cases or survey records, goes as its kind only, never with its title (which can hold a
 * person token beside the fact) or its row count.
 */
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import { isActiveAt, isEmployee } from '@/data/scope'
import type { DrillSource } from '@/drill/Drill'
import type { DrillSpec } from '@/drill/types'
import { minGroupOf } from '@/metrics/privacy'
import { TOKEN_RE } from './privacy'
import { leaderSizesOf, scopeWords } from './scope'
import { scopedCtx, type ToolRuntime } from './tools/shared'

/* ───────────── figures ───────────── */

/** What makes a figure's cuts sensitive. */
export type FigureTopic = 'survey' | 'rating' | 'rightToWork' | 'pay' | 'hrOps' | 'risk'

export const TOPIC_WORDS: Readonly<Record<FigureTopic, string>> = {
  survey: 'survey answers',
  rating: 'ratings and assessments',
  rightToWork: 'right to work and compliance records',
  pay: 'pay',
  hrOps: 'HR ops cases, transactions and leave',
  risk: 'flight risk and key talent',
}

/** Where the same question can be charted with the small-group rules applied. */
const TOPIC_HINT: Readonly<Record<FigureTopic, string>> = {
  survey: 'query_records on surveyResponses',
  rating: 'query_records on reviews or succession, or compare_groups',
  rightToWork: 'query_records on rightToWork (grouped counts only)',
  pay: 'query_records on comp, or compare_groups on the comp view',
  hrOps: 'query_records on cases or transactions',
  risk: 'query_records on succession',
}

/** Whole views whose figures are all sensitive. */
const VIEW_TOPIC: Readonly<Record<string, FigureTopic>> = {
  listening: 'survey',
  compliance: 'rightToWork',
  comp: 'pay',
  services: 'hrOps',
}

const METRIC_TOPIC: readonly (readonly [string, FigureTopic])[] = [
  ['listening.', 'survey'],
  ['compliance.', 'rightToWork'],
  ['comp.', 'pay'],
  ['services.', 'hrOps'],
  ['talent.performance.', 'rating'],
  ['talent.potential.', 'rating'],
  ['talent.succession.', 'rating'],
  ['talent.retention.', 'risk'],
]

/** Datasets (of a figure's `uses`, or of the records its rows open) whose cuts are sensitive. */
const DATASET_TOPIC: Readonly<Record<string, FigureTopic>> = {
  surveyResponses: 'survey',
  surveyItems: 'survey',
  surveyGroups: 'survey',
  rightToWork: 'rightToWork',
  comp: 'pay',
  cases: 'hrOps',
  transactions: 'hrOps',
  leaveGroups: 'hrOps',
  reviews: 'rating',
  succession: 'rating',
}

/** Words in a figure id, for figures that declare neither a metric nor their fields. */
const ID_TOPIC: readonly (readonly [RegExp, FigureTopic])[] = [
  [/survey|pulse|feedback|stay-interview|evaluation|csat|nps/, 'survey'],
  [/rating|calibration|nine-box|potential|high-perform|merit|bonus|succession|bench|readiness/, 'rating'],
  [/risk|key-talent|flight/, 'risk'],
  [/authori[sz]ation|visa|i9|right-to-work|reverification/, 'rightToWork'],
  [/compa|salary|-pay|market|range-/, 'pay'],
]

/** What a figure declares, as the screen tools read it. */
export interface FigureFactsForAsk {
  id: string
  metric: string | null
  /** The fields it reads (`Figure`'s `uses`), when it declares them. */
  uses?: readonly string[] | null
  columns: readonly Column[]
  rows: readonly Record<string, unknown>[]
}

const resolve = (src: DrillSource): DrillSpec | null =>
  !src ? null : typeof src === 'function' ? src() : src

/** The drill kinds a figure's rows open (each drill column, from the first rows that open something). */
export function figureDrillKinds(fig: Pick<FigureFactsForAsk, 'columns' | 'rows'>): Set<string> {
  const out = new Set<string>()
  for (const c of fig.columns) {
    if (!c.drill) continue
    for (const r of fig.rows.slice(0, 20)) {
      let spec: DrillSpec | null = null
      try {
        spec = resolve(c.drill(r))
      } catch {
        spec = null
      }
      if (spec) {
        out.add(spec.kind)
        break
      }
    }
  }
  return out
}

/** The sensitive topic of a figure, or null when its cuts are not sensitive. */
export function figureTopic(fig: FigureFactsForAsk): FigureTopic | null {
  const view = fig.id.split('-')[0] ?? ''
  const byView = VIEW_TOPIC[view]
  if (byView) return byView
  const metric = fig.metric ?? ''
  for (const [prefix, topic] of METRIC_TOPIC) if (metric.startsWith(prefix)) return topic
  for (const ref of fig.uses ?? []) {
    const t = DATASET_TOPIC[ref.split('.')[0] ?? '']
    if (t) return t
  }
  for (const kind of figureDrillKinds(fig)) {
    const t = DATASET_TOPIC[kind]
    if (t) return t
  }
  for (const [re, topic] of ID_TOPIC) if (re.test(fig.id)) return topic
  return null
}

/** The figure's sensitive topic as the start of a refusal, or null. */
export function sensitiveFigure(
  fig: FigureFactsForAsk,
  title: string,
): { reason: string; hint: string } | null {
  const topic = figureTopic(fig)
  if (!topic) return null
  return {
    reason: `The figure "${title}" is a cut of ${TOPIC_WORDS[topic]}, and such cuts go to Claude only with the small groups hidden`,
    hint: TOPIC_HINT[topic],
  }
}

/** Active employees in a context's scope. */
export const activePeople = (ctx: Pick<AnalyticsContext, 'data' | 'asOf'>): number =>
  ctx.data.employees.filter((e) => isEmployee(e) && isActiveAt(e, ctx.asOf)).length

/**
 * Why the scope on screen is too small for its figures to go to Claude, or null: fewer active
 * people than the anonymity minimum (the whole company never is).
 */
export function smallScope(
  ctx: Pick<AnalyticsContext, 'data' | 'asOf' | 'isCompany' | 'metrics'>,
  scopeWords: string,
): string | null {
  if (ctx.isCompany) return null
  const min = minGroupOf(ctx.metrics)
  return activePeople(ctx) < min
    ? `The scope on screen (${scopeWords}) has fewer than ${min} people, the anonymity minimum`
    : null
}

/** IDs as a figure shows them: "REQ-4414", "POS-27045", "HR-105374", "E10427". */
const ID_VALUE = /^[A-Z][A-Z0-9]{0,5}-?\d{3,}$/
const ID_KEY = /^id$|[a-z0-9](Id|ID|Ids|IDs)$|_id$/

/** A column of IDs: by its key, or because every value it holds looks like one. */
export function isIdColumn(
  c: Pick<Column, 'key' | 'label'>,
  rows: readonly Record<string, unknown>[],
): boolean {
  if (ID_KEY.test(c.key) || /\bID\b/.test(c.label)) return true
  const values = rows.map((r) => r[c.key]).filter((v) => v != null && v !== '')
  return values.length > 0 && values.every((v) => typeof v === 'string' && ID_VALUE.test(v.trim()))
}

/** What reading a figure's text cells needs: the privacy pass, and who its person tokens are. */
export interface PeopleHelpers {
  /** Text with names, IDs, emails and money amounts replaced (the privacy pass). */
  scan(text: string): string
  /** The person tokens in text, each with whether it may name a group (a leader with a big enough org). */
  people(text: string): { token: string; group: boolean }[]
}

/**
 * Whether a figure's rows name people one by one: a person who is not a leader of a big enough
 * org, or an email, in any text cell.
 */
export function listsPeople(
  fig: { columns: readonly Column[]; rows: readonly Record<string, unknown>[] },
  help: PeopleHelpers,
): boolean {
  for (const row of fig.rows)
    for (const c of fig.columns) {
      const v = row[c.key]
      if (typeof v !== 'string' || !v) continue
      const people = help.people(v)
      if (people.some((p) => !p.group) || (people.length && help.scan(v) !== v && /@/.test(v))) return true
    }
  return false
}

/** Who may be named in a figure's row: a leader whose org reaches the anonymity minimum. */
export function figureHelpers(rt: ToolRuntime): PeopleHelpers & {
  ref(source: DrillSource, label: string): string | null
} {
  const min = minGroupOf(rt.base.metrics)
  const sizes = leaderSizesOf(rt.base)
  return {
    scan: (s: string) => rt.tokens.scan(s),
    people: (s: string) =>
      [...rt.tokens.scan(s).matchAll(TOKEN_RE)].map((m) => {
        const p = rt.tokens.resolve(m[0])
        const id = p?.kind === 'employee' ? p.employeeId : null
        return { token: m[0], group: !!id && (sizes.get(id) ?? 0) >= min }
      }),
    ref: (src, label) => rt.refs.add(src, label),
  }
}

/**
 * Why a figure on screen cannot go to Claude at all, as a full sentence for `use` (drawing a chart
 * from it, or opening its rows by label), or null. The scope on screen first (the rules every tool
 * applies to it), then the figure's topic. Rows naming people one by one are the caller's check.
 */
export function figureRefusal(
  rt: ToolRuntime,
  fig: FigureFactsForAsk & { title: string },
  use: 'chart' | 'records',
): string | null {
  const own = scopedCtx(rt, undefined)
  if (!own.ok) return own.error
  const words = scopeWords(own.ctx.filters, rt.tokens)
    .replace(/^Whole company/, 'the whole company')
    .replaceAll(' · ', ', ')
  const small = smallScope(own.ctx, words)
  if (small)
    return use === 'chart'
      ? `${small}, so Ask does not draw from its figures. Use a wider scope.`
      : `${small}, so Ask does not open records by a figure's row. Use a wider scope.`
  const sensitive = sensitiveFigure(fig, rt.tokens.scan(fig.title))
  if (sensitive)
    return use === 'chart'
      ? `${sensitive.reason}, so Ask does not chart it from the figure. Chart it with ${sensitive.hint} instead: they hide the small groups.`
      : `${sensitive.reason}, so Ask does not open its rows by label. Point to it with show_figure; the person can open a row's records by clicking it.`
  return null
}

/* ───────────── the records panel ───────────── */

/** Drill kinds whose records are one person's sensitive facts, whatever their number. */
const PERSONAL_KINDS: Readonly<Record<string, string>> = {
  person: 'a person card',
  rightToWork: 'right to work records',
  comp: 'compensation records',
  cases: 'HR ops case records',
  transactions: 'HR transaction records',
  surveyResponses: 'survey records',
  reviews: 'performance review records',
  succession: 'succession records',
}

/** The records panel as Claude may know it: its title, or only what kind of records it holds. */
export interface RecordsForClaude {
  /** The panel's title and subtitle; null when they could tie a fact to a person. */
  title: string | null
  subtitle: string | null
  /** The drill kind. */
  records: string
  /** How many records; null when the count is itself sensitive. */
  rows: number | null
  /** The records in words, for a panel whose title is withheld ("compensation records"). */
  about: string
}

/**
 * What Claude may be told about records on screen: the title and count of grouped records, but
 * only the kind of a panel about one person (one record, or a person card) or of pay, ratings,
 * right to work, cases, survey or succession records, whose titles name the person beside the
 * fact ("Work authorization of {{P1}}") and whose counts are the fact's own.
 */
export function recordsForClaude(r: {
  title: string
  subtitle: string | null
  kind: string
  rows: number
}): RecordsForClaude {
  const personal = PERSONAL_KINDS[r.kind]
  if (personal) return { title: null, subtitle: null, records: r.kind, rows: null, about: personal }
  if (r.rows === 1) return { title: null, subtitle: null, records: r.kind, rows: 1, about: 'one record' }
  return { title: r.title, subtitle: r.subtitle, records: r.kind, rows: r.rows, about: r.title }
}
