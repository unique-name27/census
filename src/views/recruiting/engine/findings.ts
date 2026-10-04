/**
 * The recruiting readout: the user's flag rules (bottleneck, lacks a next step, offers waiting on
 * an answer, offer acceptance falling, empty funnel, source drying up, withdrawals rising) plus
 * slow time to fill and one good finding. Each names where it concentrates with the shared
 * decomposition, and related flags merge into one story (as the original tool did), so the
 * readout stays at six findings or fewer.
 */
import type { Finding, FindingPerson, Severity } from '@/components/types'
import type { Requisition } from '@/data/schema'
import type { Filters } from '@/data/scope'
import { addDays, addMonths } from '@/lib/dates'
import { type Dimension, decomposeMedian, decomposeRate, type Segment } from '@/lib/decompose'
import { fmt } from '@/lib/format'
import { median } from '@/lib/stats'
import type { RecruitingBase } from './base'
import {
  activeDrill,
  appDrill,
  exitExtra,
  filledReqsDrill,
  offersDrill,
  openReqsDrill,
  sourceDrill,
  stepExtra,
  unmatchedDrill,
  windowSub,
} from './drills'
import { TRANSITIONS, transitionsIn } from './flow'
import {
  APP_DIM,
  appDimUses,
  COHORT,
  FILLED_REQ,
  NEXT_STEP,
  OPEN_REQ,
  OUTCOME,
  OWNER,
  REASON,
  REQ_DIM,
  REQ_JOIN,
  reqDimUses,
  STAGE_REACHED,
  uses,
} from './lineage'
import { breakdownParts, inQueue, joinAnd } from './nextStep'
import { inWin } from './prepare'
import { EMPTY_FUNNEL_DAYS, ttfDays } from './reqs'
import { acceptance, quarterWindows, resolvedOffers, sourceRows } from './sources'
import type { ActiveItem, App } from './types'

export const MAX_FINDINGS = 6

interface Scored extends Finding {
  score: number
}

type DimKey = 'department' | 'location' | 'level' | 'hiringManager' | 'recruiter' | 'source'

const DIM_LABEL: Record<DimKey, string> = {
  department: 'Department',
  location: 'Location',
  level: 'Level',
  hiringManager: 'Hiring manager',
  recruiter: 'Recruiter',
  source: 'Source',
}

function dims<T>(get: (row: T) => App, keys: DimKey[]): Dimension<T>[] {
  return keys.map((key) => ({ key, label: DIM_LABEL[key], get: (row: T) => get(row)[key] }))
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const lower = (s: string) => s.toLowerCase()
const pct0 = (v: number | null) => fmt(v, 'pct0')
const days = (v: number | null) => fmt(v != null ? Math.round(v) : null, 'days')
const n0 = (v: number) => fmt(v, 'int')
const plural = (n: number, one: string, many = `${one}s`) => `${n0(n)} ${n === 1 ? one : many}`
const qLabel = (key: string) => key.replace(/^(\d{4}) (Q\d)$/, '$2 $1')

/** "in Design Verification", "at L5", "for Ji-woo Lim's reqs", "among Agency candidates". */
function where(s: Pick<Segment, 'dim' | 'value'>): string {
  switch (s.dim as DimKey) {
    case 'department':
    case 'location':
      return `in ${s.value}`
    case 'level':
      return `at ${s.value}`
    case 'hiringManager':
    case 'recruiter':
      return `on ${s.value}’s reqs`
    case 'source':
      return `among ${s.value} candidates`
  }
  return `in ${s.value}`
}

/** "Start with the Design Verification hiring managers." */
function startWith(s: Pick<Segment, 'dim' | 'value'>): string {
  switch (s.dim as DimKey) {
    case 'department':
      return `Start with the ${s.value} hiring managers.`
    case 'location':
    case 'level':
      return `Start with the ${s.value} hiring teams.`
    case 'hiringManager':
      return `Start with ${s.value}.`
    case 'recruiter':
      return `Start with ${s.value}’s reqs.`
    case 'source':
      return `Start with candidates from ${s.value}.`
  }
  return ''
}

function filterFor(s: Pick<Segment, 'dim' | 'value'>, apps: readonly App[]): Partial<Filters> | undefined {
  switch (s.dim as DimKey) {
    case 'department':
      return { department: [s.value] }
    case 'location':
      return { location: [s.value] }
    case 'level':
      return { level: [s.value] }
    case 'hiringManager': {
      const id = apps.find((a) => a.hiringManager === s.value && a.hiringManagerId)?.hiringManagerId
      return id ? { leaderId: id } : undefined
    }
    default:
      return undefined
  }
}

const FILTERABLE: DimKey[] = ['department', 'location', 'level']

/** "at onsite", "at the screen": where a candidate waits before each transition. */
const STAGE_AT = ['the applied stage', 'the screen', 'the hiring manager stage', 'onsite', 'offer']

function person(x: ActiveItem, note: string): FindingPerson {
  return { id: x.app.id, name: x.app.name, note }
}

/* ───────── bottleneck ───────── */

/** A step must run at least this many days slower than the comparison to count as a bottleneck. */
const MIN_GAP_DAYS = 5
/** A segment bottleneck is critical only over at least this many completed transitions. */
export const MIN_CRITICAL_TRANSITIONS = 10

function recentWindow(b: RecruitingBase): { start: string; end: string; words: string } {
  const threeMonths = addDays(addMonths(b.window.end, -3), 1)
  const start = threeMonths > b.window.start ? threeMonths : b.window.start
  return {
    start,
    end: b.window.end,
    words: start === threeMonths ? 'the last 3 months' : `the ${b.windowWords}`,
  }
}

function bottleneck(b: RecruitingBase): Scored | null {
  const recent = recentWindow(b)
  const events = transitionsIn(b.apps, recent)
  const byT = TRANSITIONS.map((_, i) => events.filter((e) => e.i === i))
  const meds = byT.map((list) => (list.length >= 10 ? median(list.map((e) => e.days)) : null))
  const before = { start: addMonths(recent.start, -6), end: addDays(recent.start, -1) }

  // Where does one transition run at least twice as slow as everywhere else?
  let seg: { i: number; s: Segment } | null = null
  for (let i = 0; i < byT.length; i++) {
    if (byT[i].length < 10) continue
    const found = decomposeMedian(
      byT[i],
      dims((e) => e.app, ['department', 'location', 'level', 'hiringManager', 'recruiter']),
      (e) => e.days,
      { minDev: 1, minAffected: 5, top: 3 },
    ).filter((s) => !s.small && s.segValue - s.compValue >= MIN_GAP_DAYS)
    if (found[0] && (!seg || found[0].impact > seg.s.impact)) seg = { i, s: found[0] }
  }
  // Or the whole step against the other steps (the original tool's rule).
  let stage: { i: number; ratio: number; m: number; others: number } | null = null
  for (let i = 0; i < meds.length; i++) {
    const m = meds[i]
    const others = meds.filter((v, j): v is number => j !== i && v != null)
    if (m == null || others.length < 2) continue
    const om = median(others) ?? 0
    const ratio = m / Math.max(om, 0.5)
    if (m > 2 * om && m - om >= MIN_GAP_DAYS && (!stage || ratio > stage.ratio))
      stage = { i, ratio, m, others: om }
  }
  if (!seg && !stage) return null

  const i = seg ? seg.i : stage!.i
  const step = TRANSITIONS[i]
  const fromStage = i
  const inSeg = (a: App) => !seg || a[seg.s.dim as DimKey] === seg.s.value
  // The steps the headline median is measured over.
  const measured = byT[i].filter((e) => inSeg(e.app)).sort((x, y) => y.days - x.days)
  const waiting = b.actives
    .filter((x) => x.stage === fromStage && inSeg(x.app))
    .sort((x, y) => y.daysInStage - x.daysInStage)
  const atStage = b.actives.filter((x) => x.stage === fromStage).length
  const prevDays = median(
    transitionsIn(b.apps, before)
      .filter((e) => e.i === i && inSeg(e.app))
      .map((e) => e.days),
  )
  const ratio = seg ? seg.s.segValue / Math.max(seg.s.compValue, 0.5) : stage!.ratio
  // A segment median over a handful of transitions is a hint, not an alarm.
  const solid = !seg || seg.s.affected >= MIN_CRITICAL_TRANSITIONS
  const stageWord = STAGE_AT[i]
  const title = seg
    ? `${step} is the bottleneck ${where(seg.s)}: median ${days(seg.s.segValue)} vs ${days(seg.s.compValue)} elsewhere over ${recent.words}.`
    : `${step} is the bottleneck: median ${days(stage!.m)} vs ${days(stage!.others)} for the other steps over ${recent.words}.`
  const waitText = waiting.length
    ? seg
      ? `${n0(waiting.length)} of the ${n0(atStage)} active candidates at ${stageWord} ${waiting.length === 1 ? 'is' : 'are'} ${where(seg.s)}, the longest waiting ${days(waiting[0].daysInStage)}.`
      : `${plural(waiting.length, 'active candidate')} ${waiting.length === 1 ? 'is' : 'are'} at ${stageWord}, the longest waiting ${days(waiting[0].daysInStage)}.`
    : ''
  const prevText =
    prevDays != null
      ? `The same step took ${days(prevDays)}${seg ? ' there' : ''} in the 6 months before.`
      : ''
  return {
    id: 'rec-bottleneck',
    severity: ratio >= 3 && solid ? 'critical' : 'warning',
    title,
    detail: [waitText, prevText].filter(Boolean).join(' ') || undefined,
    action: `Resolve the ${lower(step)} bottleneck.${seg ? ` ${startWith(seg.s)}` : ''}`,
    people: waiting.map((x) => person(x, `${x.app.reqId} · ${days(x.daysInStage)} at ${stageWord}`)),
    filter: seg ? filterFor(seg.s, b.apps) : undefined,
    tab: 'pipeline',
    drill: () =>
      appDrill(
        b,
        measured.map((e) => e.app),
        {
          title: `${step}${seg ? ` ${where(seg.s)}` : ''}, ${recent.words.replace(/^the /, '')}`,
          subtitle: windowSub(b, recent),
          note: seg
            ? `Median ${days(seg.s.segValue)} over ${plural(measured.length, 'step')} completed in the window, vs ${days(seg.s.compValue)} elsewhere.`
            : `Median ${days(stage!.m)} over ${plural(measured.length, 'step')} completed in the window, vs ${days(stage!.others)} for the other steps.`,
          extras: [stepExtra(measured, i)],
        },
      ),
    uses: uses(NEXT_STEP, appDimUses(seg?.s.dim)),
    score: 100 + ratio,
  }
}

/* ───────── lacks a next step ───────── */

function lacksNextStep(b: RecruitingBase): Scored | null {
  const lacking = b.actives.filter((x) => x.tier)
  if (!lacking.length) return null
  const n = lacking.length
  // Concentration is read over the same decisions the title counts (overdue ones), so the names
  // and counts match the action queue and the copied notes.
  const overdue = lacking.filter((x) => x.state === 'awaiting-feedback')
  const decisions = overdue.length
  const byHm = new Map<string, number>()
  for (const x of overdue)
    if (x.owner && x.ownerRole === 'Hiring manager') byHm.set(x.owner, (byHm.get(x.owner) ?? 0) + 1)
  const top = [...byHm]
    .sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0]))
    .slice(0, 2)
    .filter(([, k]) => k >= Math.max(3, 0.2 * decisions))
  const topShare = top.reduce((s, [, k]) => s + k, 0) / Math.max(1, decisions)
  const concentrated = decisions >= 6 && top.length > 0 && topShare >= 0.5
  const seg = decomposeRate(
    b.actives,
    dims((x: ActiveItem) => x.app, FILTERABLE),
    (x) => x.tier != null,
  ).find((s) => !s.small)

  const title = decisions
    ? `${plural(n, 'candidate')} ${n === 1 ? 'lacks' : 'lack'} a next step, ${n0(decisions)} of them waiting on an interview decision.`
    : `${plural(n, 'candidate')} ${n === 1 ? 'lacks' : 'lack'} a next step.`
  const parts = `${cap(joinAnd(breakdownParts(lacking)))}.`
  const conc = concentrated
    ? top.length === 2
      ? `${top[0][0]} has ${n0(top[0][1])} of the ${n0(decisions)} decisions and ${top[1][0]} ${n0(top[1][1])}, ${pct0(topShare)} together.`
      : `${top[0][0]} has ${n0(top[0][1])} of the ${n0(decisions)} decisions.`
    : seg
      ? `${cap(where(seg).replace(/^in |^at |^on |^among /, ''))} has ${n0(seg.affected)} of them, ${pct0(seg.segValue)} of its active candidates vs ${pct0(seg.compValue)} elsewhere.`
      : ''
  const groups = new Map<string, number>()
  for (const x of b.actives) if (inQueue(x) && x.owner) groups.set(x.owner, (groups.get(x.owner) ?? 0) + 1)
  const topOwner = [...groups].sort((a, c) => c[1] - a[1])[0]
  const others = lacking.length - decisions
  const action = concentrated
    ? `Ask the panels to submit scorecards and make a decision this week, starting with ${joinAnd(top.map(([name]) => name))}.`
    : decisions >= others
      ? 'Ask the panels to submit scorecards and make a decision this week, then work through the action queue.'
      : `Work through the action queue on the Pipeline tab${topOwner ? `, starting with ${topOwner[0]}` : ''}.`
  const ordered = lacking
    .slice()
    .sort((x, y) => (x.tier === y.tier ? y.days - x.days : x.tier === 'red' ? -1 : 1))
  return {
    id: 'rec-lacking-next-step',
    severity: n >= Math.max(8, 0.25 * b.actives.length) ? 'critical' : 'warning',
    title,
    detail: [parts, conc].filter(Boolean).join(' '),
    action,
    people: ordered.map((x) => person(x, `${x.label} · ${days(x.days)} · ${x.owner ?? 'no owner'}`)),
    filter: concentrated
      ? filterFor({ dim: 'hiringManager', value: top[0][0] }, b.apps)
      : seg
        ? filterFor(seg, b.apps)
        : undefined,
    tab: 'pipeline',
    drill: () => activeDrill(b, lacking, { title: 'Candidates lacking a next step' }),
    // Owners are named in the action and the people list; a segment only when the detail names it.
    uses: uses(NEXT_STEP, OWNER, !concentrated && seg ? appDimUses(seg.dim) : []),
    score: 95 + Math.min(10, (n / Math.max(1, b.actives.length)) * 20),
  }
}

/* ───────── offers ───────── */

function offersWaiting(b: RecruitingBase): { items: ActiveItem[]; oldest: number } | null {
  const items = b.actives.filter((x) => x.state === 'offer-out' && x.days > 5).sort((x, y) => y.days - x.days)
  return items.length >= 2 ? { items, oldest: items[0].days } : null
}

export interface AcceptanceDrop {
  /** 'quarter' when the latest quarter fell vs the one before; 'period' when the window fell vs the prior. */
  basis: 'quarter' | 'period'
  /** The window the latest rate is measured over. */
  window: { start: string; end: string }
  offers: App[]
  now: number
  before: number
  nowWords: string
  beforeWords: string
}

/**
 * Has offer acceptance fallen 5 pts or more (10+ offers each side)? The latest quarter against the
 * quarter before comes first; otherwise the window against the prior window.
 */
export function acceptanceDrop(b: RecruitingBase): AcceptanceDrop | null {
  if (!b.cov.hasDeclined) return null
  const [q0, q1] = quarterWindows(b.window.end, 2)
  const cur = resolvedOffers(b.apps, q1)
  const prev = resolvedOffers(b.apps, q0)
  const a1 = acceptance(cur)
  const a0 = acceptance(prev)
  const big = (x: typeof a1) => x.hired + x.declined >= 10
  if (big(a1) && big(a0) && a0.rate! - a1.rate! >= 0.05) {
    return {
      basis: 'quarter',
      window: { start: q1.start, end: q1.end },
      offers: cur,
      now: a1.rate!,
      before: a0.rate!,
      nowWords: `in ${qLabel(q1.key)}`,
      beforeWords: `in ${qLabel(q0.key)}`,
    }
  }
  const w1 = acceptance(b.offers)
  const w0 = acceptance(b.offersPrior)
  if (big(w1) && big(w0) && w0.rate! - w1.rate! >= 0.05)
    return {
      basis: 'period',
      window: b.window,
      offers: b.offers,
      now: w1.rate!,
      before: w0.rate!,
      nowWords: `in the ${b.windowWords}`,
      beforeWords: b.compareLabel.replace(/^vs /, 'in the '),
    }
  return null
}

function offerAcceptance(b: RecruitingBase, waiting: ReturnType<typeof offersWaiting>): Scored | null {
  const period = acceptanceDrop(b)
  if (!period) return null
  const drop = period.before - period.now
  const seg = decomposeRate(
    period.offers,
    dims((a: App) => a, ['location', 'department', 'level', 'source', 'recruiter']),
    (a) => a.outcome === 'Declined',
  ).find((s) => !s.small)
  const inSeg = (a: App) => !seg || a[seg.dim as DimKey] === seg.value
  const segDeclines = period.offers.filter((a) => a.outcome === 'Declined' && inSeg(a))
  const reasons = new Map<string, number>()
  for (const a of segDeclines) if (a.reason) reasons.set(a.reason, (reasons.get(a.reason) ?? 0) + 1)
  const topReasons = [...reasons]
    .sort((a, c) => c[1] - a[1])
    .slice(0, 2)
    .map(([r, k]) => `${lower(r)} (${n0(k)})`)
  const segText = seg
    ? (() => {
        const segOffers = period.offers.filter(inSeg)
        const acc = acceptance(segOffers)
        const rest = acceptance(period.offers.filter((a) => !inSeg(a)))
        const name = seg.dim === 'source' ? `${seg.value} candidates` : seg.value
        return `${name} accepted ${n0(acc.hired)} of ${n0(acc.hired + acc.declined)} offers (${pct0(acc.rate)}) vs ${pct0(rest.rate)} elsewhere${topReasons.length ? `; the top reasons for declining were ${joinAnd(topReasons)}` : ''}.`
      })()
    : topReasons.length
      ? `The top reasons for declining were ${joinAnd(topReasons)}.`
      : ''
  const waitText = waiting
    ? `${plural(waiting.items.length, 'offer')} out today ${waiting.items.length === 1 ? 'has' : 'have'} waited more than 5 d for an answer, the oldest ${days(waiting.oldest)}.`
    : ''
  const segName = seg && FILTERABLE.includes(seg.dim as DimKey) ? `${seg.value} ` : ''
  return {
    id: 'rec-offer-acceptance',
    severity: drop >= 0.1 ? 'critical' : 'warning',
    title: `Offer acceptance fell to ${pct0(period.now)} ${period.nowWords} from ${pct0(period.before)} ${period.beforeWords}${seg ? `, mostly ${where(seg)}` : ''}.`,
    detail: [segText, waitText].filter(Boolean).join(' ') || undefined,
    action: `Review ${segName}offer positioning and pay with the compensation team${waiting ? ', and follow up on the open offers this week' : ''}.`,
    people: segDeclines.map((a) => ({
      id: a.id,
      name: a.name,
      note: `Declined · ${a.reason ?? 'no reason given'} · ${a.reqId}`,
    })),
    filter: seg ? filterFor(seg, b.apps) : undefined,
    tab: 'sources',
    drill: () =>
      offersDrill(b, period.offers, `Offers resolved ${period.nowWords}`, windowSub(b, period.window)),
    uses: uses(OUTCOME, appDimUses(seg?.dim), topReasons.length ? REASON : [], waiting ? NEXT_STEP : []),
    score: 90 + drop * 100,
  }
}

function offersWaitingFinding(
  b: RecruitingBase,
  waiting: NonNullable<ReturnType<typeof offersWaiting>>,
): Scored {
  const byRecruiter = new Map<string, number>()
  for (const x of waiting.items) if (x.owner) byRecruiter.set(x.owner, (byRecruiter.get(x.owner) ?? 0) + 1)
  const top = [...byRecruiter].sort((a, c) => c[1] - a[1])[0]
  const n = waiting.items.length
  return {
    id: 'rec-offers-waiting',
    severity: waiting.oldest > 10 ? 'critical' : 'warning',
    title: `${plural(n, 'offer')} ${n === 1 ? 'has' : 'have'} waited more than 5 days for an answer, the oldest ${days(waiting.oldest)}.`,
    detail: top && top[1] >= 2 ? `${top[0]} has ${n0(top[1])} of them.` : undefined,
    action: 'Follow up with each candidate this week to answer any open questions.',
    people: waiting.items.map((x) => person(x, `${x.app.reqId} · offer out ${days(x.days)}`)),
    tab: 'pipeline',
    drill: () => activeDrill(b, waiting.items, { title: 'Offers waiting more than 5 days for an answer' }),
    uses: uses(NEXT_STEP, top && top[1] >= 2 ? APP_DIM.recruiter : []),
    score: 75 + n,
  }
}

/* ───────── requisitions ───────── */

/** A group that fills slowly: median time to fill ≥ 1.5 × the scope's, over 5+ filled reqs. */
interface SlowGroup {
  dim: 'department' | 'level' | 'location'
  value: string
  days: number
  n: number
  impact: number
}

interface SlowFill {
  top: SlowGroup
  /** The biggest slow group on another dimension, if any. */
  second: SlowGroup | null
  overall: number
}

const reqName = (r: { reqId: string; title: string | null }) => (r.title ? `${r.reqId} ${r.title}` : r.reqId)

function emptyFunnel(
  b: RecruitingBase,
  slow: SlowFill | null = null,
): { finding: Scored; department: string | null } | null {
  const rows = b.req.emptyFunnel
  if (!rows.length) return null
  const n = rows.length
  const byDept = new Map<string, typeof rows>()
  for (const r of rows) {
    const d = r.department ?? 'Not set'
    byDept.set(d, [...(byDept.get(d) ?? []), r])
  }
  const [dept, deptRows] = [...byDept].sort((a, c) => c[1].length - a[1].length)[0]
  const concentrated = deptRows.length >= 2 && deptRows.length / n >= 0.5
  const k = deptRows.length
  const allCritical = deptRows.every((r) => r.priority === 'Critical')
  const ages = (concentrated ? deptRows : rows).map((r) => r.daysOpen)
  const span = `${n0(Math.min(...ages))} to ${n0(Math.max(...ages))} days`
  const title =
    n === 1
      ? `${reqName(rows[0])} has had nobody past the screen in ${n0(rows[0].daysOpen)} days.`
      : concentrated && k === n
        ? `${n0(n)} open ${allCritical ? 'critical ' : ''}${dept} reqs have nobody past the screen after ${span}.`
        : concentrated
          ? `${n0(n)} open reqs have nobody past the screen, ${n0(k)} of them ${allCritical ? 'critical ' : ''}${dept} roles open ${span}.`
          : `${n0(n)} open reqs have nobody past the screen after ${span}.`
  const oldest = rows.reduce((a, r) => (r.daysOpen > a.daysOpen ? r : a), rows[0])
  // The department's time to fill against the whole company (never against itself).
  const deptFilled = concentrated ? b.filled.filter((r) => r.department === dept) : []
  const deptTtf = deptFilled.length >= 5 ? median(deptFilled.map(ttfDays)) : null
  const companyTtf = median(b.companyFilled.map(ttfDays))
  const vsCompany = deptTtf != null && companyTtf != null && b.companyFilled.length > deptFilled.length
  // Merged with the slow time-to-fill story (company scope only, where "overall" is the company).
  const ttfText = vsCompany
    ? slow
      ? `${dept} reqs filled in the ${b.windowWords} took a median ${days(deptTtf)} to fill and ${slow.top.value} reqs ${days(slow.top.days)}, vs ${days(companyTtf)} for the company.`
      : `${dept} reqs filled in the ${b.windowWords} took a median ${days(deptTtf)} to fill, vs ${days(companyTtf)} for the company.`
    : slow
      ? `${slow.top.value} reqs filled in the ${b.windowWords} took a median ${days(slow.top.days)} to fill, vs ${days(slow.overall)} for the company.`
      : ''
  const detail = [n > 1 ? `The oldest is ${reqName(oldest)} at ${n0(oldest.daysOpen)} days.` : '', ttfText]
    .filter(Boolean)
    .join(' ')
  return {
    department: concentrated ? dept : null,
    finding: {
      id: 'rec-empty-funnel',
      severity: 'critical',
      title,
      detail: detail || undefined,
      action: `Review the sourcing plan and screen criteria for ${n === 1 ? 'this req' : 'these reqs'} with ${n === 1 ? 'its recruiter' : 'their recruiters'}.`,
      filter: concentrated ? { department: [dept] } : undefined,
      tab: 'requisitions',
      drill: () =>
        openReqsDrill(
          b,
          rows.map((r) => r.req),
          'Open reqs with nobody past the screen',
          `Open more than ${EMPTY_FUNNEL_DAYS} days and no candidate has reached the hiring manager stage.`,
        ),
      // The title or detail names a req by its title; the funnel reads candidates through their req.
      uses: uses(
        OPEN_REQ,
        REQ_JOIN,
        STAGE_REACHED,
        ['requisitions.jobTitle'],
        concentrated ? ['requisitions.department', 'requisitions.priority'] : [],
        vsCompany || slow ? FILLED_REQ : [],
        vsCompany ? REQ_DIM.department : [],
        slow ? reqDimUses(slow.top.dim) : [],
      ),
      score: 80 + n,
    },
  }
}

const REQ_KEY: Record<'department' | 'level' | 'location', (r: Requisition) => string | null> = {
  department: (r) => r.department,
  level: (r) => r.level,
  location: (r) => r.location,
}

function slowFill(b: RecruitingBase, skipDept: string | null): SlowFill | null {
  const filled = b.filled
  if (filled.length < 10) return null
  const overall = median(filled.map(ttfDays))
  if (overall == null || overall <= 0) return null
  const groups: SlowGroup[] = []
  for (const dim of ['department', 'level', 'location'] as const) {
    const m = new Map<string, number[]>()
    for (const r of filled) {
      const v = REQ_KEY[dim](r)
      if (!v) continue
      m.set(v, [...(m.get(v) ?? []), ttfDays(r)])
    }
    if (m.size < 2) continue
    for (const [value, xs] of m) {
      if (xs.length < 5) continue
      const d = median(xs)!
      if (d < 1.5 * overall) continue
      groups.push({
        dim,
        value,
        days: d,
        n: xs.length,
        impact: (xs.length / filled.length) * (d / overall - 1),
      })
    }
  }
  const ranked = groups
    .filter((g) => !(g.dim === 'department' && g.value === skipDept))
    .sort((a, c) => c.impact - a.impact)
  const top = ranked[0]
  if (!top) return null
  return { top, second: ranked.find((g) => g.dim !== top.dim) ?? null, overall }
}

function slowTimeToFill(b: RecruitingBase, slow: SlowFill): Scored {
  const { top, second, overall } = slow
  const ratio = top.days / overall
  return {
    id: 'rec-time-to-fill',
    severity: 'warning',
    title: `${top.value} reqs took a median ${days(top.days)} to fill in the ${b.windowWords}, vs ${days(overall)} overall.`,
    // "Also": the second group is picked by impact, and a slower department may sit in the
    // empty-funnel finding, so it is never called the slowest.
    detail: second
      ? `By ${lower(DIM_LABEL[second.dim])}, ${second.value} also runs long at ${days(second.days)} over ${plural(second.n, 'req')}.`
      : `${plural(top.n, 'req')} filled.`,
    action: `Review the sourcing plan and interview loop for ${top.value} roles with the recruiters.`,
    filter: filterFor(top, b.apps),
    tab: 'requisitions',
    drill: () =>
      filledReqsDrill(
        b,
        b.filled.filter((r) => REQ_KEY[top.dim](r) === top.value),
        `Reqs filled, ${top.value}, ${b.windowWords}`,
      ),
    uses: uses(FILLED_REQ, reqDimUses(top.dim), reqDimUses(second?.dim)),
    score: 65 + 10 * (ratio - 1),
  }
}

/** Candidates that don't match any req make every per-req figure unreliable; say so first. */
function dataJoin(b: RecruitingBase): Scored | null {
  if (!b.joinNote) return null
  return {
    id: 'rec-data-join',
    severity: 'warning',
    title: `${b.joinNote}, so req health and candidate breakdowns by department, location and level can’t be read.`,
    detail:
      'Hires, offers and next steps still count every candidate, but empty funnels are not checked and candidates outside a matching req drop out of any filtered view.',
    action:
      'Check that Candidates and Requisitions use the same req IDs, then upload them again in the Data room.',
    drill: () => unmatchedDrill(b),
    uses: REQ_JOIN,
    score: 99,
  }
}

/* ───────── sources and exits ───────── */

function sourceDryingUp(b: RecruitingBase): Scored | null {
  const rows = sourceRows(b.cohort, b.priorCohort)
  const totalNow = b.cohort.length
  const totalPrior = b.priorCohort.length
  let pick: (typeof rows)[number] | null = null
  let othersChange = 0
  for (const r of rows) {
    if (r.priorApplications < 30 || r.priorApplications < 0.05 * totalPrior || r.change == null) continue
    if (r.change > -0.4) continue
    const restPrior = totalPrior - r.priorApplications
    const oc = restPrior > 0 ? (totalNow - r.applications) / restPrior - 1 : 0
    if (r.change - oc > -0.2) continue
    if (!pick || r.priorApplications - r.applications > pick.priorApplications - pick.applications) {
      pick = r
      othersChange = oc
    }
  }
  if (!pick || pick.change == null) return null
  const picked = pick
  const drop = -pick.change
  return {
    id: 'rec-source-drying-up',
    severity: 'warning',
    title: `${pick.source} applications fell ${pct0(drop)} to ${n0(pick.applications)}, from ${n0(pick.priorApplications)} ${b.compareLabel.replace(/^vs /, 'in the ')}.`,
    detail: `Applications from all other sources ${othersChange >= 0 ? 'rose' : 'fell'} ${pct0(Math.abs(othersChange))} over the same time.`,
    action: `Review ${lower(pick.source)} postings and spend with the sourcing team.`,
    tab: 'sources',
    drill: () => sourceDrill(b, picked, 'change'),
    uses: uses(COHORT, APP_DIM.source),
    score: 40 + 50 * drop,
  }
}

function withdrawalsRising(b: RecruitingBase): Scored | null {
  const exits = (w: { start: string; end: string }) =>
    b.apps.filter((a) => (a.outcome === 'Rejected' || a.outcome === 'Withdrawn') && inWin(a.exitDate, w))
  const cur = exits(b.window)
  const prev = exits(b.prior)
  if (cur.length < 10) return null
  const wd = cur.filter((a) => a.outcome === 'Withdrawn')
  const share = wd.length / cur.length
  const prevShare =
    prev.length >= 10 ? prev.filter((a) => a.outcome === 'Withdrawn').length / prev.length : null
  const rising = prevShare != null && share - prevShare >= 0.05
  if (share < 0.15 && !rising) return null
  const byStage = new Map<number, number>()
  for (const a of wd) byStage.set(a.furthest, (byStage.get(a.furthest) ?? 0) + 1)
  const topStage = [...byStage].sort((a, c) => c[1] - a[1])[0]
  const reasons = new Map<string, number>()
  for (const a of wd) if (a.reason) reasons.set(a.reason, (reasons.get(a.reason) ?? 0) + 1)
  const topReason = [...reasons].sort((a, c) => c[1] - a[1])[0]
  const stageName = topStage ? (STAGE_AT[topStage[0]] ?? null) : null
  const staged = !!(topStage && stageName)
  return {
    id: 'rec-withdrawals',
    severity: 'warning',
    title: `Withdrawals are ${pct0(share)} of candidate exits in the ${b.windowWords}${prevShare != null ? `, ${fmt(share - prevShare, 'pts')} ${b.compareLabel}` : ''}.`,
    detail:
      topStage && stageName
        ? `Most withdraw at ${stageName} (${n0(topStage[1])} of ${n0(wd.length)})${topReason ? `; the top reason is ${lower(topReason[0])}` : ''}.`
        : undefined,
    action: `Review response times${stageName ? ` at ${stageName}` : ''} with the recruiters.`,
    tab: 'sources',
    drill: () =>
      appDrill(b, wd, {
        title: `Withdrawals, ${b.windowWords}`,
        subtitle: windowSub(b),
        note: `Share = ${plural(wd.length, 'withdrawal')} ÷ ${plural(cur.length, 'rejection or withdrawal', 'rejections and withdrawals')} dated in the period.`,
        extras: [exitExtra],
        hide: ['nextEventDate', 'stageEnteredDate'],
      }),
    uses: uses(OUTCOME, staged ? STAGE_REACHED : [], staged && topReason ? REASON : []),
    score: 30 + share * 100,
  }
}

/** Hire rates over shorter windows mostly measure how many applications are still open. */
export const MIN_GOOD_SOURCE_MONTHS = 6

function bestSource(b: RecruitingBase): Scored | null {
  const total = b.cohort.length
  if (total < 30 || b.window.months < MIN_GOOD_SOURCE_MONTHS) return null
  const hired = b.cohort.filter((a) => a.furthest === 5).length
  const overall = hired / total
  if (overall <= 0) return null
  const best = sourceRows(b.cohort, b.priorCohort)
    .filter((r) => r.applications >= 30 && r.hires >= 5 && r.hireRate != null && r.hireRate >= 1.5 * overall)
    .sort((a, c) => (c.hireRate ?? 0) - (a.hireRate ?? 0))[0]
  if (!best || best.hireRate == null) return null
  return {
    id: 'rec-best-source',
    severity: 'good',
    title: `${best.source} applicants are hired at ${fmt(best.hireRate, 'pct')}, the best of any source and ${fmt(best.hireRate / overall, 'num1')}× the ${fmt(overall, 'pct')} overall.`,
    detail: `${plural(best.hires, 'hire')} from ${plural(best.applications, 'application')} in the ${b.windowWords}${best.offerAcceptance != null ? `, with ${pct0(best.offerAcceptance)} of offers accepted` : ''}.`,
    action: `Share these results with hiring teams and keep ${lower(best.source)} in the sourcing plan.`,
    tab: 'sources',
    drill: () => sourceDrill(b, best, 'hireRate'),
    uses: uses(COHORT, OUTCOME, APP_DIM.source),
    score: 0,
  }
}

/* ───────── assembly ───────── */

/** Every problem finding that fires, most severe first, before any merge or cap (for tests and audits). */
export function allProblemFindings(b: RecruitingBase): Finding[] {
  return problemFindings(b, Number.POSITIVE_INFINITY).map(toFinding)
}

const byRank = (a: Scored, c: Scored) =>
  SEVERITY_RANK[a.severity] - SEVERITY_RANK[c.severity] || c.score - a.score

/**
 * The problem findings, most severe first. When more fire than `slots`, the slow time-to-fill
 * story folds into the empty-funnel one (both say reqs take too long, README story 6), so a
 * lower-ranked story such as a source drying up keeps its place in the readout.
 */
function problemFindings(b: RecruitingBase, slots: number): Scored[] {
  if (!b.apps.length && !b.reqs.length) return []
  const waiting = offersWaiting(b)
  const acc = offerAcceptance(b, waiting)
  const empty = emptyFunnel(b)
  const slow = slowFill(b, empty?.department ?? null)
  const rest = [
    dataJoin(b),
    bottleneck(b),
    lacksNextStep(b),
    acc,
    acc || !waiting ? null : offersWaitingFinding(b, waiting),
    sourceDryingUp(b),
    withdrawalsRising(b),
  ].filter((f): f is Scored => f != null)
  const separate = [...rest, empty?.finding ?? null, slow ? slowTimeToFill(b, slow) : null].filter(
    (f): f is Scored => f != null,
  )
  // Merge only on the company view, where the scope's median and the company's are one number.
  if (separate.length > slots && empty && slow && b.isCompany) {
    const merged = emptyFunnel(b, slow)
    if (merged) return [...rest, merged.finding].sort(byRank)
  }
  return separate.sort(byRank)
}

/** The readout: up to six findings, the good one last. */
export function recruitingFindings(b: RecruitingBase): Finding[] {
  if (!b.apps.length && !b.reqs.length) return []
  const good = bestSource(b)
  const slots = good ? MAX_FINDINGS - 1 : MAX_FINDINGS
  const kept = problemFindings(b, slots).slice(0, slots)
  return [...kept, ...(good ? [good] : [])].map(toFinding)
}

function toFinding(s: Scored): Finding {
  const { id, severity, title, detail, action, people, filter, tab, drill } = s
  return {
    id,
    severity,
    title,
    detail,
    action,
    people: people?.length ? people : undefined,
    filter,
    tab,
    drill,
    uses: s.uses,
  }
}
