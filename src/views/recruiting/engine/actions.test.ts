/**
 * Recruiting for the Scorecard and the Action center: the summary's measures, hires vs plan,
 * and one action item per next step in the action queue plus empty-funnel reqs, with owners,
 * due dates and polite wording.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, type HiringPlanLine } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from '@/drill/Drill'
import { CATALOG } from '@/metrics/catalog'
import { hiresVsPlan } from '../../onboarding/api'
import { M as ONBOARDING } from '../../onboarding/metrics'
import { ACTION_OWNER_ROLES, type ActionItem } from '../../types'
import { RM } from '../metrics'
import { hiresVsPlanKpi, overviewKpis, PLAN_LINK } from '../plan'
import { recruitingActions, recruitingSummary, SUMMARY_KPIS, UNASSIGNED_OWNER } from './actions'
import { cand, ctxOf, emp, req } from './fixtures'
import { computeRecruiting } from './index'
import { inQueue } from './nextStep'

/** Verbs the tone rules rule out, anywhere in an item's words. */
const NAGGING = /\b(chas\w*|push\w*|nag\w*|ping\w*|hound\w*|unblock\w*|remind\w*)\b/i

const byId = (items: readonly ActionItem[], id: string) => {
  const x = items.find((i) => i.id === id)
  if (!x) throw new Error(`no item ${id}: ${items.map((i) => i.id).join(', ')}`)
  return x
}

describe('action items on hand-built data (as of 30 Sep 2026)', () => {
  const reqs = [
    req('REQ-1'),
    req('REQ-NOBODY', { recruiter: null, hiringManager: null, hiringManagerId: null }),
    req('REQ-EMPTY', {
      openedDate: '2026-07-01',
      jobTitle: 'Staff analog designer',
      recruiter: 'Rita Recruiter',
    }),
  ]
  const decision = cand('REQ-1', {
    applicationId: 'APP-DECIDE',
    candidateName: 'Priya Raman',
    currentStage: 'Onsite',
    appliedDate: '2026-08-01',
    screenDate: '2026-08-05',
    hmDate: '2026-08-12',
    onsiteDate: '2026-09-10',
    stageEnteredDate: '2026-09-10',
    nextEventDate: '2026-09-20',
  })
  const schedule = cand('REQ-1', {
    applicationId: 'APP-SCHEDULE',
    candidateName: 'Lee Park',
    currentStage: 'Hiring manager',
    appliedDate: '2026-07-20',
    screenDate: '2026-07-25',
    hmDate: '2026-08-01',
    stageEnteredDate: '2026-08-01',
    coordinator: 'Cora Coordinator',
  })
  const booked = cand('REQ-1', {
    applicationId: 'APP-BOOKED',
    currentStage: 'Screen',
    appliedDate: '2026-09-20',
    screenDate: '2026-09-25',
    stageEnteredDate: '2026-09-25',
    nextEventDate: '2026-10-02',
  })
  const offerOut = cand('REQ-1', {
    applicationId: 'APP-OFFER',
    candidateName: 'Sam Ortiz',
    currentStage: 'Offer',
    appliedDate: '2026-07-01',
    screenDate: '2026-07-05',
    hmDate: '2026-07-12',
    onsiteDate: '2026-08-01',
    offerDate: '2026-09-15',
    stageEnteredDate: '2026-09-15',
  })
  const unowned = cand('REQ-NOBODY', {
    applicationId: 'APP-NOBODY',
    recruiter: null,
    appliedDate: '2026-08-01',
  })
  const waiting = cand('REQ-EMPTY', { applicationId: 'APP-EMPTY', appliedDate: '2026-09-28' })

  let items: ActionItem[]
  beforeAll(() => {
    items = recruitingActions(
      ctxOf({ requisitions: reqs, candidates: [decision, schedule, booked, offerOut, unowned, waiting] }),
    )
  })

  it('asks the hiring manager for an interview decision, due when the decision wait runs out', () => {
    const x = byId(items, 'recruiting:decision:APP-DECIDE')
    expect(x).toMatchObject({
      ownerRole: 'manager',
      ownerId: 'E1',
      ownerName: 'Hana Manager',
      severity: 'critical',
      // Interview on 20 Sep; overdue after 5 days.
      due: '2026-09-25',
      view: 'recruiting',
      tab: 'pipeline',
      subject: { kind: 'candidates', id: 'APP-DECIDE', label: 'Priya Raman, Engineer REQ-1 (REQ-1)' },
    })
    expect(x.what).toBe('Scorecards and a decision are not in for the onsite on 20 Sep')
    expect(x.note).toBe(
      'Could you ask the panel to submit scorecards for Priya Raman and make a decision this week?',
    )
  })

  it('gives scheduling to the coordinator, offers to the recruiter, and leaves booked steps out', () => {
    const s = byId(items, 'recruiting:schedule-hiring-manager:APP-SCHEDULE')
    expect(s).toMatchObject({ ownerRole: 'coordinator', ownerName: 'Cora Coordinator', severity: 'critical' })
    // No step booked since 1 Aug; overdue past 2.5 × the usual 14 days (35 days).
    expect(s.due).toBe('2026-09-05')
    expect(s.what).toBe('Hiring manager interview not yet scheduled, 60 d waiting')
    const o = byId(items, 'recruiting:offer-answer:APP-OFFER')
    expect(o).toMatchObject({ ownerRole: 'recruiter', ownerName: 'Rita Recruiter', due: '2026-09-25' })
    expect(o.what).toBe('Offer out since 15 Sep with no answer yet, 15 d')
    expect(items.some((i) => i.subject.id === 'APP-BOOKED')).toBe(false)
  })

  it('names the recruiting team when nobody is assigned', () => {
    const x = byId(items, 'recruiting:review:APP-NOBODY')
    expect(x).toMatchObject({ ownerRole: 'recruiter', ownerName: UNASSIGNED_OWNER, ownerId: null })
  })

  it('lists an empty-funnel req for its recruiter', () => {
    const x = byId(items, 'recruiting:empty-funnel:REQ-EMPTY')
    expect(x).toMatchObject({
      ownerRole: 'recruiter',
      ownerName: 'Rita Recruiter',
      severity: 'critical',
      // Opened 1 Jul; an empty funnel after 30 days.
      due: '2026-07-31',
      tab: 'requisitions',
      subject: { kind: 'requisitions', id: 'REQ-EMPTY', label: 'REQ-EMPTY Staff analog designer' },
    })
    expect(x.what).toBe('No candidate past the screen after 91 d open')
    expect(x.note).toBe(
      'Could we review the sourcing plan for REQ-EMPTY Staff analog designer with Hana Manager this week?',
    )
  })

  it('sorts critical first, then by due date, and opens the records behind each item', () => {
    const rank = { critical: 0, warning: 1, info: 2, good: 3 }
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1]
      const b = items[i]
      expect(rank[a.severity] < rank[b.severity] || (a.due ?? '') <= (b.due ?? '')).toBe(true)
    }
    for (const x of items) {
      const spec = resolveDrill(x.drill)
      expect(spec, x.id).not.toBeNull()
      expect(spec!.rows.length, x.id).toBeGreaterThan(0)
    }
  })

  it('is empty without candidates or reqs', () => {
    expect(recruitingActions(ctxOf({}))).toEqual([])
  })
})

describe('hires vs plan', () => {
  const line = (period: string, n = 1, patch: Partial<HiringPlanLine> = {}): HiringPlanLine => ({
    period,
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    plannedHires: n,
    planVersion: 'FY27 v2',
    ...patch,
  })

  it("is Onboarding's own plan number, and opens Onboarding, Hiring plan", () => {
    const plan = [
      line('2026-04-01', 4),
      line('2026-07-01', 4),
      line('2026-10-01', 6), // after the as-of date
      line('2026-04-01', 50, { planVersion: 'FY27 v1' }), // an older version
    ]
    const emps = [
      emp('E1', 'A', '2026-04-15'),
      emp('E2', 'B', '2026-05-01'),
      emp('E3', 'C', '2026-08-01'),
      emp('E4', 'D', '2026-09-30'),
      emp('E5', 'E', '2026-03-31'), // before the plan year
      emp('E6', 'F', '2026-10-05'), // a pre-hire
      emp('E7', 'G', '2026-06-01', { employmentType: 'Contractor' }),
    ]
    const ctx = ctxOf({ hiringPlan: plan, employees: emps })
    const kpi = hiresVsPlanKpi(ctx)
    const onboarding = hiresVsPlan(ctx)!
    expect(kpi).toMatchObject({ id: 'hires-vs-plan', value: 0.5, metricId: ONBOARDING.vsPlan, format: 'pct' })
    expect(kpi.value).toBe(onboarding.value)
    expect(kpi.link).toEqual({ view: 'onboarding', tab: 'plan', label: 'Onboarding, Hiring plan' })
    expect(kpi.tab).toBeUndefined()
    expect(kpi.note).toBe('4 of 8 planned to date · Behind')
    expect(resolveDrill(kpi.drill)!.rows).toHaveLength(4)
    expect(resolveDrill(kpi.noteDrill)!.rows).toHaveLength(2)
    expect(kpi.uses?.length).toBeGreaterThan(0)
    // The Recruiting engine no longer counts the plan itself; the Overview strip adds the tile last.
    expect(computeRecruiting(ctx).kpis.some((k) => k.id === 'hires-vs-plan')).toBe(false)
    expect(overviewKpis(ctx).at(-1)).toEqual(kpi)
  })

  it('is "—" without a plan, still linked to the Hiring plan tab', () => {
    const none = hiresVsPlanKpi(ctxOf({}))
    expect(none).toMatchObject({ value: null, note: 'Upload a Hiring plan to see this', link: PLAN_LINK })
    expect(none.drill).toBeUndefined()
    expect(none.uses).toEqual(CATALOG.byId.get(ONBOARDING.vsPlan)!.uses)
  })
})

describe('on the sample company', () => {
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: 0 } satisfies SourceMeta]),
  ) as Record<DatasetKey, SourceMeta>
  let data: Datasets
  let ctx: AnalyticsContext
  let items: ActionItem[]
  beforeAll(() => {
    data = generateSample()
    ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })
    items = recruitingActions(ctx)
  })

  it('summary: time to fill, offer acceptance and hires vs plan, with the readout', () => {
    const s = recruitingSummary(ctx)
    expect(s.kpis.map((k) => k.id)).toEqual([...SUMMARY_KPIS])
    expect(s.kpis.map((k) => k.metricId)).toEqual([RM.timeToFill, RM.offerAcceptance, ONBOARDING.vsPlan])
    for (const k of s.kpis) {
      expect(k.uses?.length, k.id).toBeGreaterThan(0)
      expect(k.drill, k.id).toBeDefined()
    }
    expect(ctx.metrics.target(RM.timeToFill)).not.toBeNull()
    expect(ctx.metrics.target(RM.offerAcceptance)).not.toBeNull()
    expect(s.kpis[0].value).toBe(52)
    // FY27 v2 from April: 153 employees started against 167 planned starts, as Onboarding counts
    // them, and the tile opens Onboarding, Hiring plan.
    expect(s.kpis[2].value).toBeCloseTo(153 / 167, 6)
    expect(s.kpis[2].value).toBe(hiresVsPlan(ctx)!.value)
    expect(s.kpis[2].link).toEqual(PLAN_LINK)
    expect(s.findings).toBe(computeRecruiting(ctx).findings)
    for (const f of s.findings) {
      expect(f.metricId, f.id).toBeDefined()
      expect(f.uses?.length, f.id).toBeGreaterThan(0)
    }
  })

  it('lists every candidate in the action queue and the four analog reqs stuck at the screen', () => {
    const b = computeRecruiting(ctx).base
    const queue = b.actives.filter(inQueue)
    const candidates = items.filter((i) => i.subject.kind === 'candidates')
    expect(candidates).toHaveLength(queue.length)
    const funnels = items.filter((i) => i.id.startsWith('recruiting:empty-funnel:'))
    expect(funnels.map((i) => i.subject.id).sort()).toEqual(b.req.emptyFunnel.map((r) => r.reqId).sort())
    // The planted story: open longer than 75 days with nobody past the screen, all analog.
    const stuck = b.req.emptyFunnel.filter((r) => r.daysOpen > 75).map((r) => r.reqId)
    expect(stuck.sort()).toEqual(['REQ-4414', 'REQ-4427', 'REQ-4446', 'REQ-4468'])
    for (const id of stuck) expect(byId(funnels, `recruiting:empty-funnel:${id}`).ownerRole).toBe('recruiter')
  })

  it('puts the stuck interview decisions with Ji-woo Lim and Hannah Smith', () => {
    const decisions = items.filter((i) => i.id.startsWith('recruiting:decision:'))
    expect(decisions).toHaveLength(39)
    const by = (name: string) => decisions.filter((i) => i.ownerName === name)
    expect(by('Ji-woo Lim')).toHaveLength(20)
    expect(by('Hannah Smith')).toHaveLength(9)
    expect(decisions.every((i) => i.ownerRole === 'manager' && !!i.ownerId)).toBe(true)
    // Recruiters and coordinators are on the roster, so their items carry an employee ID too.
    const named = items.filter((i) => i.ownerName !== UNASSIGNED_OWNER)
    expect(named.every((i) => !!i.ownerId)).toBe(true)
    expect(items.filter((i) => i.id.startsWith('recruiting:review:'))).toHaveLength(86)
    expect(items.filter((i) => i.id.startsWith('recruiting:offer-answer:'))).toHaveLength(5)
  })

  it('keeps ids unique and stable, owners known and words polite', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    const again = recruitingActions(
      buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false }),
    )
    expect(again.map((i) => i.id)).toEqual(items.map((i) => i.id))
    for (const x of items) {
      expect(ACTION_OWNER_ROLES, x.id).toContain(x.ownerRole)
      expect(x.ownerName, x.id).toBeTruthy()
      expect(x.uses?.length, x.id).toBeGreaterThan(0)
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(NAGGING)
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(/—|!/)
      expect(x.what[0], x.id).toBe(x.what[0].toUpperCase())
    }
  })
})
