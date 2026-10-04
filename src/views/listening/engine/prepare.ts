/**
 * The answers the Listening view reads, prepared once per analytics context: the scoped answers
 * with a valid score, dated on or before the as-of date, with each answer's driver filled in from
 * the Survey items sheet when the answer leaves it blank, split by survey. Engagement answers are
 * left out entirely (not shown, not counted) while the engagement surveys switch is off.
 *
 * The respondent joins return group labels only (business unit, location, tenure band, stage);
 * nothing here hands out a record with its answers attached.
 */
import type { AnalyticsContext } from '@/data/context'
import {
  type Candidate,
  type Employee,
  type HrCase,
  type ISODate,
  type Region,
  type Requisition,
  type SurveyItem,
  type SurveyResponse,
  type SurveyType,
  siteByLocation,
} from '@/data/schema'
import { tenureBand, tenureYears } from '@/lib/people'
import { driverOf, type ItemIndex, itemIndex, selectResponses } from '@/lib/surveys'
import { levelBand } from './catalog'

export interface Prepared {
  asOf: ISODate
  /** Answers in scope (valid scores, on or before the as-of date), drivers filled in. */
  answers: readonly SurveyResponse[]
  bySurvey: ReadonlyMap<SurveyType, readonly SurveyResponse[]>
  items: ItemIndex
  /** The Survey items sheet as loaded (reference data, never scoped). */
  itemRows: readonly SurveyItem[]
  /** The Survey items sheet has rows (its fields then count in lineage). */
  hasItems: boolean
  /** Some answer names its own driver. */
  hasDriverColumn: boolean
  /** Engagement answers are counted (the switch is on). */
  engagementOn: boolean
  /** Engagement answers exist in scope but are left out because the switch is off. */
  engagementHidden: number
  emp: ReadonlyMap<string, Employee>
  req: ReadonlyMap<string, Requisition>
  cand: ReadonlyMap<string, Candidate>
  cases: ReadonlyMap<string, HrCase>
}

const cache = new WeakMap<AnalyticsContext, Prepared>()

/** The prepared answers for a context (computed once per context). */
export function prepare(ctx: AnalyticsContext): Prepared {
  const hit = cache.get(ctx)
  if (hit) return hit
  const items = itemIndex(ctx.all.surveyItems)
  const engagementOn = ctx.features.engagementSurveys
  const answers: SurveyResponse[] = []
  let engagementHidden = 0
  let hasDriverColumn = false
  for (const r of selectResponses(ctx.data.surveyResponses, { to: ctx.asOf })) {
    if (r.survey === 'Engagement' && !engagementOn) {
      engagementHidden++
      continue
    }
    const own = r.driver?.trim()
    if (own) hasDriverColumn = true
    answers.push(own ? r : { ...r, driver: driverOf(r, items) })
  }
  const bySurvey = new Map<SurveyType, SurveyResponse[]>()
  for (const r of answers) {
    const list = bySurvey.get(r.survey)
    if (list) list.push(r)
    else bySurvey.set(r.survey, [r])
  }
  const out: Prepared = {
    asOf: ctx.asOf,
    answers,
    bySurvey,
    items,
    itemRows: ctx.all.surveyItems,
    hasItems: ctx.all.surveyItems.length > 0,
    hasDriverColumn,
    engagementOn,
    engagementHidden,
    emp: ctx.org.byId,
    req: new Map(ctx.all.requisitions.map((r) => [r.reqId, r])),
    cand: new Map(ctx.all.candidates.map((c) => [c.applicationId, c])),
    cases: new Map(ctx.all.cases.map((c) => [c.caseId, c])),
  }
  cache.set(ctx, out)
  return out
}

/** Answers of one survey (on or before the as-of date). */
export const answersOf = (p: Prepared, survey: SurveyType): readonly SurveyResponse[] =>
  p.bySurvey.get(survey) ?? []

/** Answers dated inside a window (inclusive). */
export const within = (
  rows: readonly SurveyResponse[],
  w: { start: ISODate; end: ISODate },
): SurveyResponse[] => rows.filter((r) => r.responseDate >= w.start && r.responseDate <= w.end)

/* ───────────── group labels ───────────── */

const REGION_NAME: Record<Region, string> = { Americas: 'Americas', EMEA: 'EMEA', APAC: 'Asia Pacific' }

/** "Asia Pacific" for Bengaluru; null for a site Census doesn't know. */
export function regionOfLocation(location: string | null | undefined): string | null {
  const site = location ? siteByLocation.get(location) : undefined
  return site ? REGION_NAME[site.region] : null
}

export type CutKey = 'businessUnit' | 'location' | 'tenure' | 'stage' | 'region' | 'department'

export const CUT_LABEL: Record<CutKey, string> = {
  businessUnit: 'Business unit',
  location: 'Location',
  tenure: 'Tenure',
  stage: 'Stage',
  region: 'Region',
  department: 'Department',
}

/** The req a candidate answer is about: the application's req. */
function reqOfCandidate(p: Prepared, r: SurveyResponse): Requisition | undefined {
  const c = p.cand.get(r.respondentKey)
  return c ? p.req.get(c.reqId) : undefined
}

/**
 * A group label for an answer: the respondent's business unit, location, region, department or
 * tenure band at the answer's date (employees), or the req's org and location and the stage
 * (candidates). Null when the respondent can't be joined.
 */
export function cutOf(p: Prepared, cut: CutKey): (r: SurveyResponse) => string | null {
  return (r) => {
    const e = p.emp.get(r.respondentKey)
    if (cut === 'stage') return r.touchpoint?.trim() || null
    if (e) {
      if (cut === 'businessUnit') return e.businessUnit || null
      if (cut === 'department') return e.department || null
      if (cut === 'location') return e.location || null
      if (cut === 'region') return regionOfLocation(e.location)
      return tenureBand(tenureYears(e, r.responseDate))
    }
    const q = reqOfCandidate(p, r)
    if (!q) return null
    if (cut === 'businessUnit') return q.businessUnit || null
    if (cut === 'department') return q.department || null
    if (cut === 'location') return q.location || null
    if (cut === 'region') return regionOfLocation(q.location)
    return null
  }
}

/** A respondent's department and career band ("Design Verification L4-L5"), employees only. */
export function deptBandOfKey(p: Prepared): (respondentKey: string) => string | null {
  return (key) => {
    const e = p.emp.get(key)
    const band = levelBand(e?.level)
    return e && band ? `${e.department} ${band}` : null
  }
}

/** The answer's respondent's department and career band. */
export function deptBandOf(p: Prepared): (r: SurveyResponse) => string | null {
  const of = deptBandOfKey(p)
  return (r) => of(r.respondentKey)
}

/** The req a hiring manager answer rates (its subject), or the candidate's req. */
export function reqOfAnswer(p: Prepared, r: SurveyResponse): Requisition | undefined {
  return (r.subjectKey ? p.req.get(r.subjectKey) : undefined) ?? reqOfCandidate(p, r)
}

/** The candidate behind a candidate answer, for source and recruiter cuts. */
export const candidateOf = (p: Prepared, r: SurveyResponse): Candidate | undefined =>
  p.cand.get(r.respondentKey)
