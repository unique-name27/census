/**
 * Survey results (docs/ROADMAP.md, Listening): pure aggregation over the long-format Survey
 * responses dataset. Every function here returns grouped numbers; nothing returns, names or
 * exports one person's answers.
 *
 * Privacy, enforced here and not only in the UI:
 *  - a group counts distinct respondents, and a group with fewer than `min` respondents has no
 *    numbers (`suppressed`); breakdowns fold such groups into "Other (k)", which is itself hidden
 *    when it is still too small;
 *  - cuts by manager need the larger survey minimum (10 respondents) over the last four quarters;
 *  - the respondent key (an employee ID, or an application ID for candidates) is used only to
 *    join org, stage or req attributes through `respondentKey` helpers that return group labels.
 *
 * Read the minimums from the metric dictionary: `surveyMinimumsOf(ctx.metrics)` in
 * `@/metrics/privacy` (the anonymity minimum and the survey manager-cut minimum).
 */
import type {
  Candidate,
  Employee,
  ISODate,
  Requisition,
  SurveyItem,
  SurveyResponse,
  SurveyScale,
  SurveyType,
} from '@/data/schema'
import { addMonths, quarterStart } from './dates'

/* ───────────── scales ───────────── */

export const SCALE_RANGE: Record<SurveyScale, readonly [number, number]> = {
  '1-5': [1, 5],
  '0-10': [0, 10],
}

/** A score that fits its scale (whole or half points are both fine). */
export function isValidScore(score: number, scale: SurveyScale): boolean {
  const [lo, hi] = SCALE_RANGE[scale] ?? [Number.NaN, Number.NaN]
  return Number.isFinite(score) && score >= lo && score <= hi
}

/** The score as a share of its scale's range, 0-100, so 1-5 and 0-10 items compare. */
export function percentOfScale(score: number, scale: SurveyScale): number {
  const [lo, hi] = SCALE_RANGE[scale]
  return ((score - lo) / (hi - lo)) * 100
}

/** Top box: 4-5 on a 1-5 scale, 9-10 (promoters) on 0-10. */
export function isTopBox(score: number, scale: SurveyScale): boolean {
  return scale === '0-10' ? score >= 9 : score >= 4
}

/** Bottom box: 1-2 on a 1-5 scale, 0-6 (detractors) on 0-10. */
export function isBottomBox(score: number, scale: SurveyScale): boolean {
  return scale === '0-10' ? score <= 6 : score <= 2
}

/**
 * Net promoter score from 0-10 answers: % promoters (9-10) minus % detractors (0-6), from -100
 * to 100. Null with no answers. Callers pass one "likelihood to recommend" item.
 */
export function npsOf(scores: readonly number[]): number | null {
  if (!scores.length) return null
  let promoters = 0
  let detractors = 0
  for (const s of scores) {
    if (s >= 9) promoters++
    else if (s <= 6) detractors++
  }
  return ((promoters - detractors) / scores.length) * 100
}

/* ───────────── selecting and labelling ───────────── */

export interface SurveyFilter {
  survey?: SurveyType | readonly SurveyType[]
  wave?: string | readonly string[]
  driver?: string | readonly string[]
  item?: string | readonly string[]
  /** Inclusive response-date bounds. */
  from?: ISODate
  to?: ISODate
  /** Item lookup for responses that leave the driver blank. */
  items?: ItemIndex
}

const asSet = <T>(v: T | readonly T[] | undefined): Set<T> | null =>
  v === undefined ? null : new Set<T>(Array.isArray(v) ? (v as readonly T[]) : [v as T])

/** Responses that match the filter and have a valid score for their scale. */
export function selectResponses(
  responses: readonly SurveyResponse[],
  filter: SurveyFilter = {},
): SurveyResponse[] {
  const surveys = asSet(filter.survey)
  const waves = asSet(filter.wave)
  const drivers = asSet(filter.driver)
  const items = asSet(filter.item)
  return responses.filter((r) => {
    if (!isValidScore(r.score, r.scale)) return false
    if (surveys && !surveys.has(r.survey)) return false
    if (waves && !waves.has(r.wave)) return false
    if (items && !items.has(r.item)) return false
    if (drivers && !drivers.has(driverOf(r, filter.items))) return false
    if (filter.from && r.responseDate < filter.from) return false
    if (filter.to && r.responseDate > filter.to) return false
    return true
  })
}

/** What the Survey items sheet says about each item: its driver, target and wording. */
export interface ItemIndex {
  /** The item's row for a survey, or the row shared by every survey. */
  get(survey: SurveyType, item: string): SurveyItem | undefined
}

export function itemIndex(items: readonly SurveyItem[]): ItemIndex {
  const own = new Map<string, SurveyItem>()
  const shared = new Map<string, SurveyItem>()
  for (const it of items) {
    if (it.survey) own.set(`${it.survey}\u0001${it.item}`, it)
    else shared.set(it.item, it)
  }
  return { get: (survey, item) => own.get(`${survey}\u0001${item}`) ?? shared.get(item) }
}

/** The driver an answer measures: its own, else the Survey items sheet's, else the item itself. */
export function driverOf(r: SurveyResponse, items?: ItemIndex): string {
  const own = r.driver?.trim()
  if (own) return own
  return items?.get(r.survey, r.item)?.driver ?? r.item
}

/** The target mean for an item (from the Survey items sheet), or null. */
export function targetOf(items: ItemIndex | undefined, survey: SurveyType, item: string): number | null {
  const t = items?.get(survey, item)?.target
  return typeof t === 'number' && Number.isFinite(t) ? t : null
}

/* ───────────── waves ───────────── */

export interface WaveInfo {
  survey: SurveyType
  wave: string
  /** First and last response dates in the wave. */
  start: ISODate
  end: ISODate
  respondents: number
  responses: number
}

/** The waves of each survey, oldest first (by first response date, then name). */
export function wavesOf(responses: readonly SurveyResponse[], survey?: SurveyType): WaveInfo[] {
  const by = new Map<string, { info: WaveInfo; who: Set<string> }>()
  for (const r of responses) {
    if (survey && r.survey !== survey) continue
    const k = `${r.survey}\u0001${r.wave}`
    let w = by.get(k)
    if (!w) {
      w = {
        info: {
          survey: r.survey,
          wave: r.wave,
          start: r.responseDate,
          end: r.responseDate,
          respondents: 0,
          responses: 0,
        },
        who: new Set(),
      }
      by.set(k, w)
    }
    w.info.responses++
    w.who.add(r.respondentKey)
    if (r.responseDate < w.info.start) w.info.start = r.responseDate
    if (r.responseDate > w.info.end) w.info.end = r.responseDate
  }
  return [...by.values()]
    .map(({ info, who }) => ({ ...info, respondents: who.size }))
    .sort(
      (a, b) =>
        a.survey.localeCompare(b.survey) ||
        a.start.localeCompare(b.start) ||
        a.wave.localeCompare(b.wave, 'en', { numeric: true }),
    )
}

/** The latest wave of a survey that started on or before `asOf`, and the one before it. */
export function latestWaves(
  responses: readonly SurveyResponse[],
  survey: SurveyType,
  asOf?: ISODate,
): { latest: WaveInfo | null; prior: WaveInfo | null } {
  const waves = wavesOf(responses, survey).filter((w) => !asOf || w.start <= asOf)
  return { latest: waves.at(-1) ?? null, prior: waves.at(-2) ?? null }
}

/* ───────────── aggregates ───────────── */

export interface SurveyAggregate {
  /** Distinct respondents (the basis of every minimum). */
  respondents: number
  responses: number
  /** Fewer respondents than the minimum: every number below is null. */
  suppressed: boolean
  /** The scale when every answer uses one; 'mixed' otherwise (then `mean` is null). */
  scale: SurveyScale | 'mixed' | null
  /** Mean score on the scale; null when suppressed, mixed or empty. */
  mean: number | null
  /** Mean per scale, for groups that mix 1-5 and 0-10 items. */
  meanByScale: Partial<Record<SurveyScale, number | null>>
  /** Mean as a share of the scale (0-100); comparable across scales. */
  percentOfScale: number | null
  /** Share of answers in the top box (0-1). */
  topBox: number | null
  /** Share of answers in the bottom box (0-1). */
  bottomBox: number | null
  /** Net promoter score over the 0-10 answers (-100 to 100), null without any. */
  nps: number | null
}

export interface MinOptions {
  /** Smallest number of distinct respondents a group needs: the anonymity minimum (5) or higher. */
  min: number
}

/** One aggregate over the given answers, suppressed below the minimum. */
export function aggregate(responses: readonly SurveyResponse[], opts: MinOptions): SurveyAggregate {
  const who = new Set<string>()
  const sums: Partial<Record<SurveyScale, { s: number; n: number }>> = {}
  let pct = 0
  let top = 0
  let bottom = 0
  const tenPoint: number[] = []
  for (const r of responses) {
    who.add(r.respondentKey)
    const acc = sums[r.scale] ?? { s: 0, n: 0 }
    sums[r.scale] = acc
    acc.s += r.score
    acc.n++
    pct += percentOfScale(r.score, r.scale)
    if (isTopBox(r.score, r.scale)) top++
    if (isBottomBox(r.score, r.scale)) bottom++
    if (r.scale === '0-10') tenPoint.push(r.score)
  }
  const scales = Object.keys(sums) as SurveyScale[]
  const n = responses.length
  const suppressed = who.size < Math.max(1, opts.min)
  const scale = scales.length === 0 ? null : scales.length === 1 ? scales[0] : 'mixed'
  if (suppressed || n === 0)
    return {
      respondents: who.size,
      responses: n,
      suppressed,
      scale,
      mean: null,
      meanByScale: {},
      percentOfScale: null,
      topBox: null,
      bottomBox: null,
      nps: null,
    }
  const meanByScale: Partial<Record<SurveyScale, number | null>> = {}
  for (const s of scales) meanByScale[s] = sums[s]!.s / sums[s]!.n
  return {
    respondents: who.size,
    responses: n,
    suppressed: false,
    scale,
    mean: scale === 'mixed' || scale === null ? null : (meanByScale[scale] ?? null),
    meanByScale,
    percentOfScale: pct / n,
    topBox: top / n,
    bottomBox: bottom / n,
    nps: npsOf(tenPoint),
  }
}

/** A label for each answer's group, or null to leave the answer out of the breakdown. */
export type GroupKey = (r: SurveyResponse) => string | null

export interface SurveyGroup extends SurveyAggregate {
  group: string
  /** For "Other (k)": how many groups were folded into it. */
  folded?: number
}

export interface Breakdown {
  /** Groups at or above the minimum, largest first (or in `order`). */
  groups: SurveyGroup[]
  /** Groups under the minimum folded together; suppressed when still too small. Null when none. */
  other: SurveyGroup | null
  /** Answers whose group was unknown (key returned null). */
  unassigned: number
}

export interface BreakdownOptions extends MinOptions {
  /** Fixed group order (e.g. driver order); groups not listed follow, largest first. */
  order?: readonly string[]
  /** Never fold, report small groups as suppressed rows instead (for heat tables with fixed rows). */
  keepSmall?: boolean
}

/**
 * Aggregate per group. Groups with fewer respondents than the minimum are folded into
 * "Other (k)", which is itself suppressed if it is still under the minimum.
 */
export function breakdown(
  responses: readonly SurveyResponse[],
  key: GroupKey,
  opts: BreakdownOptions,
): Breakdown {
  const by = new Map<string, SurveyResponse[]>()
  let unassigned = 0
  for (const r of responses) {
    const g = key(r)
    if (g == null || g === '') {
      unassigned++
      continue
    }
    const list = by.get(g)
    if (list) list.push(r)
    else by.set(g, [r])
  }
  const groups: SurveyGroup[] = []
  const small: SurveyResponse[] = []
  let folded = 0
  for (const [group, rows] of by) {
    const a = aggregate(rows, opts)
    if (a.suppressed && !opts.keepSmall) {
      small.push(...rows)
      folded++
    } else groups.push({ group, ...a })
  }
  const order = opts.order ?? []
  const rank = (g: string) => {
    const i = order.indexOf(g)
    return i < 0 ? order.length : i
  }
  groups.sort(
    (a, b) =>
      rank(a.group) - rank(b.group) || b.respondents - a.respondents || a.group.localeCompare(b.group),
  )
  const other = folded ? { group: `Other (${folded})`, folded, ...aggregate(small, opts) } : null
  return { groups, other, unassigned }
}

/** Per driver, in the order drivers first appear in `items` (then by size). */
export function byDriver(
  responses: readonly SurveyResponse[],
  opts: BreakdownOptions & { items?: ItemIndex },
): Breakdown {
  return breakdown(responses, (r) => driverOf(r, opts.items), opts)
}

/** Per item. */
export function byItem(responses: readonly SurveyResponse[], opts: BreakdownOptions): Breakdown {
  return breakdown(responses, (r) => r.item, opts)
}

/** Per wave of one survey, oldest first; waves under the minimum are kept as suppressed points. */
export function byWave(
  responses: readonly SurveyResponse[],
  survey: SurveyType,
  opts: MinOptions,
): (SurveyGroup & { start: ISODate; end: ISODate })[] {
  const waves = wavesOf(responses, survey)
  const rows = responses.filter((r) => r.survey === survey)
  return waves.map((w) => ({
    group: w.wave,
    start: w.start,
    end: w.end,
    ...aggregate(
      rows.filter((r) => r.wave === w.wave),
      opts,
    ),
  }))
}

export type WaveMeasure = 'mean' | 'percentOfScale' | 'topBox' | 'nps'

export interface WaveChange {
  survey: SurveyType
  wave: string | null
  priorWave: string | null
  current: SurveyAggregate | null
  previous: SurveyAggregate | null
  /** current − previous on the chosen measure; null when either side is missing or suppressed. */
  delta: number | null
}

/**
 * The latest wave (on or before `asOf`) against the one before it, for the answers given (filter
 * them to an item or driver first). Either side under the minimum gives no change.
 */
export function waveChange(
  responses: readonly SurveyResponse[],
  survey: SurveyType,
  opts: MinOptions & { measure?: WaveMeasure; asOf?: ISODate },
): WaveChange {
  const rows = responses.filter((r) => r.survey === survey)
  const { latest, prior } = latestWaves(rows, survey, opts.asOf)
  const of = (w: WaveInfo | null) =>
    w
      ? aggregate(
          rows.filter((r) => r.wave === w.wave),
          opts,
        )
      : null
  const current = of(latest)
  const previous = of(prior)
  const m = opts.measure ?? 'mean'
  const a = current?.[m] ?? null
  const b = previous?.[m] ?? null
  return {
    survey,
    wave: latest?.wave ?? null,
    priorWave: prior?.wave ?? null,
    current,
    previous,
    delta: a != null && b != null ? a - b : null,
  }
}

/* ───────────── response rates ───────────── */

export interface ResponseRate {
  /** People invited (the known population). */
  invited: number
  /** Invited people who answered at least once; null while the rate is hidden. */
  responded: number | null
  /** responded ÷ invited; null when nobody was invited or the rate is hidden. */
  rate: number | null
  /** Respondents not in the invited population (a key mismatch or an outdated list). */
  outside: number
  /** Hidden to protect anonymity: see `rateHidden`. */
  suppressed: boolean
}

/**
 * Whether a response rate must be hidden: fewer people invited than the minimum, or between one
 * and the minimum less one who answered, or who didn't. The invited people can be listed by
 * name, so a rate over a handful of them (0% of 2, 100% of 4) would say who answered.
 */
export function rateHidden(invited: number, responded: number, min: number): boolean {
  if (invited <= 0 || min <= 1) return false
  const missing = invited - responded
  return invited < min || (responded > 0 && responded < min) || (missing > 0 && missing < min)
}

/**
 * Response rate against an invited population when it is known: the employee IDs (or
 * application IDs) who were sent the wave. With `min` (the survey's anonymity minimum) the rate
 * and the count who answered are null when `rateHidden` says so; the invited count stays.
 */
export function responseRate(
  responses: readonly SurveyResponse[],
  invited: ReadonlySet<string> | readonly string[],
  opts: { min?: number } = {},
): ResponseRate {
  const pop = invited instanceof Set ? invited : new Set(invited as readonly string[])
  const who = new Set(responses.map((r) => r.respondentKey))
  let responded = 0
  let outside = 0
  for (const k of who) {
    if (pop.has(k)) responded++
    else outside++
  }
  const suppressed = rateHidden(pop.size, responded, opts.min ?? 0)
  return {
    invited: pop.size,
    responded: suppressed ? null : responded,
    rate: pop.size && !suppressed ? responded / pop.size : null,
    outside,
    suppressed,
  }
}

/* ───────────── joining respondents (group labels only) ───────────── */

/** The records a respondent key can join to. Only used to label groups. */
export interface RespondentRecord {
  employee?: Employee
  candidate?: Candidate
  requisition?: Requisition
}

export interface RespondentSources {
  employees?: readonly Employee[]
  candidates?: readonly Candidate[]
  requisitions?: readonly Requisition[]
}

/**
 * A lookup from respondent key to the employee (by employee ID) or candidate and requisition
 * (by application ID). Keep it inside an engine; hand out `respondentKey(...)` group keys, never
 * the records with answers attached.
 */
export function respondentIndex(src: RespondentSources): (key: string) => RespondentRecord {
  const emp = new Map((src.employees ?? []).map((e) => [e.employeeId, e]))
  const cand = new Map((src.candidates ?? []).map((c) => [c.applicationId, c]))
  const req = new Map((src.requisitions ?? []).map((r) => [r.reqId, r]))
  const cache = new Map<string, RespondentRecord>()
  return (key) => {
    let hit = cache.get(key)
    if (!hit) {
      const employee = emp.get(key)
      const candidate = employee ? undefined : cand.get(key)
      const requisition = candidate ? req.get(candidate.reqId) : undefined
      hit = { employee, candidate, requisition }
      cache.set(key, hit)
    }
    return hit
  }
}

/**
 * A group key from respondent attributes: `respondentKey(index, (j) => j.employee?.department)`
 * groups answers by the respondent's department; answers whose respondent can't be joined are
 * left out (counted as unassigned).
 */
export function respondentKey(
  index: (key: string) => RespondentRecord,
  pick: (j: RespondentRecord) => string | null | undefined,
): GroupKey {
  return (r) => pick(index(r.respondentKey)) ?? null
}

/** Common respondent attributes for heat tables: org, location, tenure band, level. */
export const BY_DEPARTMENT = (j: RespondentRecord): string | null =>
  j.employee?.department ?? j.requisition?.department ?? null
export const BY_BUSINESS_UNIT = (j: RespondentRecord): string | null =>
  j.employee?.businessUnit ?? j.requisition?.businessUnit ?? null
export const BY_LOCATION = (j: RespondentRecord): string | null =>
  j.employee?.location ?? j.requisition?.location ?? null
export const BY_LEVEL = (j: RespondentRecord): string | null =>
  j.employee?.level ?? j.requisition?.level ?? null
export const BY_RECRUITER = (j: RespondentRecord): string | null =>
  j.candidate?.recruiter ?? j.requisition?.recruiter ?? null
export const BY_SOURCE = (j: RespondentRecord): string | null => j.candidate?.source ?? null

/* ───────────── manager cuts ───────────── */

export interface ManagerCutOptions {
  asOf: ISODate
  /** The survey minimum for manager cuts: 10 respondents (or higher). */
  minManager: number
  /** Quarters of answers pooled per manager (4 per the Atlas rule). */
  quarters?: number
}

export interface ManagerCut extends SurveyAggregate {
  managerId: string
}

/** First day of the pooling window: the start of the quarter `quarters − 1` quarters before asOf's. */
export function managerWindowStart(asOf: ISODate, quarters = 4): ISODate {
  return quarterStart(addMonths(quarterStart(asOf), -3 * (quarters - 1)))
}

/**
 * Results per manager, pooled over the last four quarters (to `asOf`). The manager is the
 * answer's subject when it names a person in the roster (upward feedback about a named
 * manager), else the respondent's manager. Managers with fewer than `minManager` distinct
 * respondents come back suppressed, with no numbers.
 */
export function managerCuts(
  responses: readonly SurveyResponse[],
  employees: readonly Employee[],
  opts: ManagerCutOptions,
): { cuts: ManagerCut[]; hidden: number; window: { start: ISODate; end: ISODate } } {
  const start = managerWindowStart(opts.asOf, opts.quarters ?? 4)
  const end = opts.asOf
  const byId = new Map(employees.map((e) => [e.employeeId, e]))
  const by = new Map<string, SurveyResponse[]>()
  for (const r of responses) {
    if (r.responseDate < start || r.responseDate > end) continue
    const subject = r.subjectKey && byId.has(r.subjectKey) ? r.subjectKey : null
    const mgr = subject ?? byId.get(r.respondentKey)?.managerId ?? null
    if (!mgr) continue
    const list = by.get(mgr)
    if (list) list.push(r)
    else by.set(mgr, [r])
  }
  const cuts: ManagerCut[] = []
  let hidden = 0
  for (const [managerId, rows] of by) {
    const a = aggregate(rows, { min: opts.minManager })
    if (a.suppressed) hidden++
    cuts.push({ managerId, ...a })
  }
  cuts.sort((a, b) => b.respondents - a.respondents || a.managerId.localeCompare(b.managerId))
  return { cuts, hidden, window: { start, end } }
}

/* ───────────── drill rows ───────────── */

/**
 * What a survey number drills to (drill kind `surveyGroups`): grouped counts and scores, one row
 * per group. Never a respondent, a date or a single answer.
 */
export interface SurveyGroupRow {
  survey: SurveyType
  /** The wave, or null when several waves are pooled. */
  wave: string | null
  /** What the rows are grouped by, e.g. "Department". */
  groupBy: string
  group: string
  driver: string | null
  item: string | null
  respondents: number
  responses: number
  scale: SurveyScale | 'mixed' | null
  mean: number | null
  topBox: number | null
  nps: number | null
  /** Under the minimum: the row shows counts only. */
  suppressed: boolean
}

const isBreakdown = (b: Breakdown | readonly SurveyGroup[]): b is Breakdown => !Array.isArray(b)

/** Drill rows from a breakdown (its groups, then "Other"). */
export function groupRows(
  b: Breakdown | readonly SurveyGroup[],
  meta: {
    survey: SurveyType
    wave?: string | null
    groupBy: string
    driver?: string | null
    item?: string | null
  },
): SurveyGroupRow[] {
  const list = isBreakdown(b) ? [...b.groups, ...(b.other ? [b.other] : [])] : b
  return list.map((g) => ({
    survey: meta.survey,
    wave: meta.wave ?? null,
    groupBy: meta.groupBy,
    group: g.group,
    driver: meta.driver ?? null,
    item: meta.item ?? null,
    respondents: g.respondents,
    responses: g.responses,
    scale: g.scale,
    mean: g.mean,
    topBox: g.topBox,
    nps: g.nps,
    suppressed: g.suppressed,
  }))
}

/* ───────────── windows ───────────── */

/** The answers given in the window (inclusive). */
export const inWindow = (
  responses: readonly SurveyResponse[],
  w: { start: ISODate; end: ISODate },
): SurveyResponse[] => responses.filter((r) => r.responseDate >= w.start && r.responseDate <= w.end)
