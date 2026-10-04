/**
 * Listening engine: one pure function of the analytics context that returns everything the view
 * draws, plus the cheap folder-tab headline, the scorecard summary and the Action center items.
 * The UI calls `compute` inside useMemo keyed on the context; it is also memoized per context
 * here, so the summary, the actions and the view share one computation.
 *
 * Privacy (docs/VIEWS.md, Listening): every number is grouped through `@/lib/surveys`; groups
 * need the survey minimum (5 or more distinct respondents) and manager cuts 10 over four
 * quarters; numbers drill to grouped rows only.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { SurveyType } from '@/data/schema'
import { addMonths, formatRange } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { aggregate, type Breakdown, groupRows, type SurveyGroupRow } from '@/lib/surveys'
import type { Headline, ViewSummary } from '@/views/types'
import { M, scoreMetric } from '../metrics'
import { type AreaTab, type HeadlineKind, PROGRAMS, type ProgramMeta } from './catalog'
import {
  candidateNpsBy,
  courseBy,
  type DeclineCut,
  declineCut,
  type ExitCut,
  engagementBy,
  exitCut,
  type GapRow,
  type ManagerCutResult,
  managerCut,
  type ReadinessCut,
  type RecruiterCut,
  type ReturnCut,
  readinessCut,
  readinessRows,
  recruiterCut,
  regrettedGap,
  returnCut,
  type StageCut,
  type StayCut,
  serviceBy,
  stageCut,
  stayCut,
  type WouldReturn,
  wouldReturnOf,
  wouldReturnRows,
} from './cuts'
import { answersDrill, groupsDrill, rowsBy } from './drills'
import { buildFindings } from './findings'
import * as L from './lineage'
import { invitedDrill, type RateResult, rateOf, type SurveyModel, surveyModel } from './measures'
import { answersOf, type Prepared, prepare } from './prepare'
import { type ListeningSettings, listeningSettings, STATUS_WORD, type Status } from './settings'

export interface ProgramRow {
  survey: SurveyType
  name: string
  tab: AreaTab
  metricId: string
  kind: HeadlineKind
  latestWave: string | null
  /** "3 Aug 2026 – 28 Sep 2026": first and last answer of the latest wave. */
  waveDates: string | null
  /** Distinct respondents behind the headline in the latest wave. */
  respondents: number
  value: number | null
  suppressed: boolean
  target: number | null
  priorWave: string | null
  change: number | null
  material: boolean
  status: Status
  statusWord: string
  rate: number | null
  invited: number
  responded: number
  rateKnown: boolean
  /** Distinct respondents in the period. */
  periodRespondents: number
  /** Waves that started in the 12 months to the as-of date. */
  wavesInYear: number
}

export interface WaveRow {
  survey: SurveyType
  name: string
  wave: string
  start: string
  end: string
  respondents: number
  latest: boolean
}

export interface ListeningModel {
  asOf: string
  settings: ListeningSettings
  prepared: Prepared
  /** One model per survey program with answers (Engagement only while the switch is on). */
  surveys: ReadonlyMap<SurveyType, SurveyModel>
  programs: ProgramRow[]
  waves: WaveRow[]
  /** Programs with a wave in the last 12 months. */
  active: number
  /** Distinct respondents in the period across programs. */
  respondents: number
  pooledRate: { invited: number; responded: number; rate: number | null; programs: number }
  priorPooledRate: number | null
  kpis: Kpi[]
  findings: Finding[]
  stage: StageCut | null
  bySource: Breakdown | null
  byRecruiterCx: Breakdown | null
  declines: DeclineCut | null
  recruiter: RecruiterCut | null
  readiness: ReadinessCut | null
  priorReadiness: number | null
  stay: StayCut | null
  exit: ExitCut | null
  wouldReturn: WouldReturn | null
  priorWouldReturn: number | null
  regretted: GapRow[]
  managers: ManagerCutResult | null
  serviceCategory: Breakdown | null
  serviceChannel: Breakdown | null
  returns: ReturnCut | null
  courses: Breakdown | null
  engagementByOrg: Breakdown | null
  engagementOn: boolean
  engagementHidden: number
  /** Field lineage per figure. */
  uses: ListeningUses
}

export interface ListeningUses {
  programs: FieldRef[]
  calendar: FieldRef[]
  /** Score by driver, change since last wave, a survey's headline. */
  drivers: FieldRef[]
  /** The driver heat table: its answers plus the group join. */
  heat: (survey: SurveyType, cut: string) => FieldRef[]
  rate: (survey: SurveyType) => FieldRef[]
  stage: FieldRef[]
  candidateBy: (by: 'source' | 'recruiter') => FieldRef[]
  declines: FieldRef[]
  recruiter: FieldRef[]
  readiness: FieldRef[]
  stay: FieldRef[]
  exitReasons: FieldRef[]
  wouldReturn: FieldRef[]
  regretted: FieldRef[]
  managers: FieldRef[]
  service: (by: 'category' | 'channel') => FieldRef[]
  returns: FieldRef[]
  courses: FieldRef[]
  engagement: FieldRef[]
}

const asRefs = (r: L.Refs): FieldRef[] => [...r]

function usesFor(p: Prepared): ListeningUses {
  const drv = L.union(
    L.when(p.hasDriverColumn, ['surveyResponses.driver']),
    L.when(p.hasItems, L.ITEMS_DRIVER),
  )
  const answers = L.union(L.ANSWER, L.ITEM, drv)
  const targets = L.when(p.hasItems, L.ITEMS_TARGET)
  const known = PROGRAMS.flatMap((x) => L.POPULATION[x.survey] ?? [])
  return {
    programs: asRefs(L.union(answers, targets, known)),
    calendar: asRefs(L.union(L.WAVE, L.RESPONDENT)),
    drivers: asRefs(L.union(answers, targets)),
    heat: (survey, cut) => {
      const candidate = survey === 'Candidate experience'
      const join =
        cut === 'stage'
          ? L.TOUCHPOINT
          : candidate
            ? L.union(L.CAND_REQ, cut === 'location' ? L.REQ_LOCATION : L.REQ_ORG)
            : cut === 'location'
              ? L.EMP_LOCATION
              : cut === 'tenure'
                ? L.EMP_TENURE
                : L.EMP_ORG
      return asRefs(L.union(answers, join))
    },
    rate: (survey) => asRefs(L.union(L.WAVE, L.RESPONDENT, L.POPULATION[survey] ?? [])),
    stage: asRefs(L.union(answers, L.TOUCHPOINT, L.CAND_REQ, L.REQ_ORG)),
    candidateBy: (by) =>
      asRefs(L.union(answers, L.CAND_REQ, by === 'source' ? L.CAND_SOURCE : L.CAND_RECRUITER)),
    declines: asRefs(L.union(L.WAVE, L.RESPONDENT, L.REASON)),
    recruiter: asRefs(L.union(answers, L.SUBJECT, L.REQ_RECRUITER)),
    readiness: asRefs(L.union(answers, L.EMP_LOCATION)),
    stay: asRefs(L.union(L.WAVE, L.RESPONDENT, L.REASON, L.EMP_ORG, L.EMP_LEVEL)),
    exitReasons: asRefs(L.union(L.WAVE, L.RESPONDENT, L.REASON, L.EMP_LOCATION)),
    wouldReturn: asRefs(answers),
    regretted: asRefs(L.union(answers, L.REGRETTED)),
    managers: asRefs(L.union(L.ANSWER, L.SUBJECT, L.MANAGER_JOIN)),
    service: (by) =>
      asRefs(
        L.union(
          answers,
          L.SUBJECT,
          by === 'category' ? ['cases.caseId', 'cases.category'] : ['cases.caseId', 'cases.channel'],
        ),
      ),
    returns: asRefs(L.union(answers, L.RETURN_TX)),
    courses: asRefs(L.union(answers, L.COURSE)),
    engagement: asRefs(L.union(answers, L.EMP_ORG)),
  }
}

/** Programs the view shows: every program, Engagement only while the switch is on. */
export const shownPrograms = (ctx: Pick<AnalyticsContext, 'features'>): readonly ProgramMeta[] =>
  PROGRAMS.filter((x) => x.survey !== 'Engagement' || ctx.features.engagementSurveys)

const cache = new WeakMap<AnalyticsContext, ListeningModel>()

export function compute(ctx: AnalyticsContext): ListeningModel {
  const hit = cache.get(ctx)
  if (hit) return hit
  const s = listeningSettings(ctx.metrics)
  const p = prepare(ctx)
  const uses = usesFor(p)
  const programs = shownPrograms(ctx)
  const surveys = new Map<SurveyType, SurveyModel>()
  for (const prog of programs)
    if (answersOf(p, prog.survey).length) surveys.set(prog.survey, surveyModel(ctx, p, prog, s))

  const yearStart = addMonths(ctx.asOf, -12)
  const rows: ProgramRow[] = programs.map((prog) => {
    const m = surveys.get(prog.survey)
    const rate: RateResult = m?.rate ?? rateOf(ctx, p, prog.survey, ctx.window)
    return {
      survey: prog.survey,
      name: prog.name,
      tab: prog.tab,
      metricId: scoreMetric(prog),
      kind: prog.headline,
      latestWave: m?.latest?.wave ?? null,
      waveDates: m?.latest ? formatRange(m.latest.start, m.latest.end) : null,
      respondents: m?.headline.respondents ?? 0,
      value: m?.headline.value ?? null,
      suppressed: m?.headline.suppressed ?? false,
      target: s.targetOf[prog.survey]?.value ?? null,
      priorWave: m?.prior?.wave ?? null,
      change: m?.change ?? null,
      material: m?.material ?? false,
      status: m?.status ?? 'none',
      statusWord: m ? (m.headline.value == null ? '—' : STATUS_WORD[m.status]) : 'No answers',
      rate: rate.rate,
      invited: rate.invited,
      responded: rate.responded,
      rateKnown: !rate.unknown,
      periodRespondents: m?.periodRespondents ?? 0,
      wavesInYear: m ? m.waves.filter((w) => w.start > yearStart).length : 0,
    }
  })

  const waves: WaveRow[] = []
  for (const m of surveys.values())
    for (const w of m.waves)
      if (w.end > yearStart)
        waves.push({
          survey: m.survey,
          name: m.survey,
          wave: w.wave,
          start: w.start,
          end: w.end,
          respondents: w.respondents,
          latest: w.wave === m.latest?.wave,
        })

  const active = [...surveys.values()].filter((m) => m.all.some((r) => r.responseDate > yearStart)).length
  const respondents = new Set([...surveys.values()].flatMap((m) => m.period.map((r) => r.respondentKey))).size
  const pooled = pool(rows.filter((r) => r.rateKnown && r.invited > 0))
  // A program only compares with the prior period when it ran then (had answers in it).
  const ranIn = (survey: SurveyType, w: { start: string; end: string }) =>
    answersOf(p, survey).some((r) => r.responseDate >= w.start && r.responseDate <= w.end)
  const priorPooled = pool(
    programs
      .filter((prog) => ranIn(prog.survey, ctx.prior))
      .map((prog) => rateOf(ctx, p, prog.survey, ctx.prior))
      .filter((r) => !r.unknown && r.invited > 0),
  )

  /* Area cuts. */
  const cx = surveys.get('Candidate experience')
  const hm = surveys.get('Hiring manager satisfaction')
  const d30 = surveys.get('Onboarding pulse day 30')
  const stay = surveys.get('Stay interview')
  const ex = surveys.get('Exit survey')
  const mf = surveys.get('Manager feedback')
  const hrs = surveys.get('HR service survey')
  const rtw = surveys.get('Return to work')
  const trn = surveys.get('Training evaluation')
  const eng = surveys.get('Engagement')

  const readiness = d30 ? readinessCut(ctx, p, d30.period, d30.min, s.regionGap) : null
  const priorReadiness = d30
    ? aggregate(
        readinessRows(
          p,
          d30.all.filter((r) => r.responseDate >= ctx.prior.start && r.responseDate <= ctx.prior.end),
        ),
        { min: d30.min },
      ).mean
    : null
  const wouldReturn = ex ? wouldReturnOf(p, ex.period, ex.min) : null
  const priorWouldReturn = ex
    ? aggregate(
        wouldReturnRows(
          p,
          ex.all.filter((r) => r.responseDate >= ctx.prior.start && r.responseDate <= ctx.prior.end),
        ),
        { min: ex.min },
      ).topBox
    : null

  const model: Omit<ListeningModel, 'kpis' | 'findings'> = {
    asOf: ctx.asOf,
    settings: s,
    prepared: p,
    surveys,
    programs: rows,
    waves,
    active,
    respondents,
    pooledRate: pooled,
    priorPooledRate: priorPooled.rate,
    stage: cx ? stageCut(ctx, p, cx.latestRows, cx.min, s.stageGap) : null,
    bySource: cx ? candidateNpsBy(p, cx.period, 'source', cx.min) : null,
    byRecruiterCx: cx ? candidateNpsBy(p, cx.period, 'recruiter', cx.min) : null,
    declines: cx ? declineCut(cx.period, cx.min) : null,
    recruiter: hm ? recruiterCut(ctx, p, hm.period, hm.min, s.recruiterGap) : null,
    readiness,
    priorReadiness,
    stay: stay ? stayCut(p, stay.period, stay.min, s.riskShare) : null,
    exit: ex ? exitCut(ctx, p, ex.period, ex.min, s.exitShare) : null,
    wouldReturn,
    priorWouldReturn,
    regretted: ex ? regrettedGap(p, ex.period, ex.min) : [],
    managers: mf ? managerCut(ctx, mf.all, s) : null,
    serviceCategory: hrs ? serviceBy(p, hrs.period, 'category', hrs.min) : null,
    serviceChannel: hrs ? serviceBy(p, hrs.period, 'channel', hrs.min) : null,
    returns: rtw ? returnCut(ctx, rtw.period, rtw.min, s.returnGap) : null,
    courses: trn ? courseBy(trn.period, trn.min) : null,
    engagementByOrg: eng?.latest ? engagementBy(p, eng.latestRows, eng.min) : null,
    engagementOn: p.engagementOn,
    engagementHidden: p.engagementHidden,
    uses,
  }
  const findings = buildFindings({
    ctx,
    p,
    s,
    surveys,
    stage: model.stage,
    recruiter: model.recruiter,
    readiness: model.readiness,
    stay: model.stay,
    exit: model.exit,
    managers: model.managers,
    returns: model.returns,
    courses: model.courses,
    engagementByOrg: model.engagementByOrg,
    rates: rows
      .filter((r) => r.rateKnown && r.invited > 0)
      .map((r) => ({
        survey: r.survey,
        name: r.name,
        rate: r.rate,
        invited: r.invited,
        responded: r.responded,
      })),
  })
  const out: ListeningModel = { ...model, findings, kpis: [] }
  out.kpis = buildKpis(ctx, out)
  cache.set(ctx, out)
  return out
}

function pool(list: readonly { invited: number; responded: number }[]) {
  const invited = list.reduce((a, r) => a + r.invited, 0)
  const responded = list.reduce((a, r) => a + r.responded, 0)
  return { invited, responded, rate: invited ? responded / invited : null, programs: list.length }
}

/* ───────────── drills shared by the KPIs and the overview ───────────── */

/** Programs as drill rows: respondents per program in the period, with invited and response rate. */
export function programDrill(ctx: AnalyticsContext, m: ListeningModel, title: string) {
  const byName = new Map(m.programs.map((r) => [r.survey as string, r]))
  const rows: SurveyGroupRow[] = []
  for (const sm of m.surveys.values())
    rows.push(
      ...groupRows(
        [
          {
            group: sm.program.name,
            ...aggregate(
              sm.period.filter((r) => r.scale === (sm.program.headline === 'nps' ? '0-10' : '1-5')),
              { min: sm.min },
            ),
          },
        ],
        { survey: sm.survey, wave: null, groupBy: 'Program' },
      ),
    )
  return groupsDrill(rows, {
    wave: null,
    title,
    subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
    min: m.settings.minGroup,
    uses: m.uses.programs,
    note: 'Invited counts come from the records each program is sent after; who answered is never listed.',
    extra: {
      columns: [
        { key: 'invited', label: 'Invited', format: 'int' },
        { key: 'responded', label: 'Invited who answered', format: 'int' },
        { key: 'rate', label: 'Response rate', format: 'pct' },
      ],
      values: (row) => {
        const r = byName.get(row.survey)
        return r?.rateKnown
          ? { invited: r.invited, responded: r.responded, rate: r.rate }
          : { invited: null, responded: null, rate: null }
      },
    },
  })
}

/** A survey's latest wave by driver (its headline drill). */
export function headlineDrill(ctx: AnalyticsContext, sm: SurveyModel, uses?: readonly FieldRef[]) {
  return answersDrill(sm.latestRows, {
    survey: sm.survey,
    wave: sm.latest?.wave ?? null,
    title: `${sm.program.name}, ${sm.latest?.wave ?? 'latest wave'}, by driver`,
    subtitle: `${sm.latest ? formatRange(sm.latest.start, sm.latest.end) : ''} · ${ctx.scopeLabel}`,
    min: sm.min,
    uses,
  })
}

/* ───────────── KPIs ───────────── */

function buildKpis(ctx: AnalyticsContext, m: ListeningModel): Kpi[] {
  const cx = m.surveys.get('Candidate experience')
  const d30 = m.surveys.get('Onboarding pulse day 30')
  const ex = m.surveys.get('Exit survey')
  const kpis: Kpi[] = [
    {
      id: 'programs',
      metricId: M.active,
      label: 'Survey programs running',
      value: m.surveys.size ? m.active : null,
      format: 'int',
      note: `of ${plural(shownPrograms(ctx).length, 'program')} · last 12 months`,
      uses: m.uses.calendar,
      drill: () => programDrill(ctx, m, 'Survey programs, respondents in the period'),
    },
    {
      id: 'respondents',
      metricId: M.respondents,
      label: 'Respondents',
      value: m.surveys.size ? m.respondents : null,
      format: 'int',
      note: 'distinct people, in the period',
      uses: m.uses.calendar,
      drill: () => programDrill(ctx, m, 'Respondents by survey program'),
    },
    responseRateKpi(ctx, m),
  ]
  if (cx) kpis.push(headlineKpi(ctx, m, cx, 'candidates'))
  kpis.push(readinessKpi(ctx, m, d30))
  kpis.push(wouldReturnKpi(ctx, m, ex))
  return kpis
}

export function responseRateKpi(ctx: AnalyticsContext, m: ListeningModel): Kpi {
  const r = m.pooledRate
  const delta = r.rate != null && m.priorPooledRate != null ? r.rate - m.priorPooledRate : null
  return {
    id: 'response-rate',
    metricId: M.responseRate,
    label: 'Response rate',
    value: r.rate,
    format: 'pct',
    delta,
    deltaLabel: 'vs prior period',
    goodDirection: 'up',
    deltaMaterial: delta != null && Math.abs(delta) >= 0.05,
    note: r.programs
      ? `${fmt(r.responded, 'int')} of ${fmt(r.invited, 'int')} invited · ${plural(r.programs, 'program')}`
      : 'Invited population not known',
    uses: [
      ...L.union(
        L.WAVE,
        L.RESPONDENT,
        ...m.programs.filter((x) => x.rateKnown).map((x) => L.POPULATION[x.survey] ?? []),
      ),
    ],
    tab: 'overview',
    drill: r.programs ? () => programDrill(ctx, m, 'Response rate by survey program') : undefined,
  }
}

export function headlineKpi(ctx: AnalyticsContext, m: ListeningModel, sm: SurveyModel, tab: AreaTab): Kpi {
  const kind = sm.program.headline
  return {
    id: `score-${sm.program.key}`,
    metricId: scoreMetric(sm.program),
    label: sm.program.name,
    value: sm.headline.value,
    format: kind === 'nps' ? 'int' : 'num2',
    delta: sm.change,
    deltaLabel: sm.prior ? `vs ${sm.prior.wave}` : undefined,
    goodDirection: 'up',
    deltaMaterial: sm.material,
    suppressed: sm.headline.suppressed,
    note: sm.latest ? `${sm.latest.wave} · ${plural(sm.headline.respondents, 'respondent')}` : 'No waves yet',
    uses: m.uses.drivers,
    tab,
    drill: () => headlineDrill(ctx, sm, m.uses.drivers),
  }
}

/**
 * The tiles at the top of one survey's section: its headline against target with the change
 * since the last wave, respondents in the latest wave, the response rate in the period and the
 * drivers below target.
 */
export function surveyKpis(ctx: AnalyticsContext, m: ListeningModel, sm: SurveyModel): Kpi[] {
  const tab = sm.program.tab
  const latestN = new Set(sm.latestRows.map((r) => r.respondentKey)).size
  const shown = sm.drivers.filter((d) => d.value != null)
  const below = shown.filter((d) => d.status === 'missed' || d.status === 'watch')
  const rateUses = m.uses.rate(sm.survey)
  const sub = `${ctx.window.label} · ${ctx.scopeLabel}`
  // The tiles sit on the survey's own tab, so the headline links nowhere else.
  const { tab: _own, ...head } = headlineKpi(ctx, m, sm, tab)
  const out: Kpi[] = [
    head,
    {
      id: `respondents-${sm.program.key}`,
      metricId: M.calendar,
      label: 'Respondents, latest wave',
      value: sm.latest ? latestN : null,
      format: 'int',
      note: sm.latest ? `${sm.latest.wave} · ${formatRange(sm.latest.start, sm.latest.end)}` : 'No waves yet',
      uses: m.uses.calendar,
      drill: sm.latest ? () => headlineDrill(ctx, sm, m.uses.drivers) : undefined,
    },
    {
      id: `rate-${sm.program.key}`,
      metricId: M.responseRate,
      label: 'Response rate',
      value: sm.rate.rate,
      format: 'pct',
      note: sm.rate.unknown
        ? 'Invited population not known'
        : `${fmt(sm.rate.responded, 'int')} of ${fmt(sm.rate.invited, 'int')} invited · period`,
      uses: rateUses,
      drill: sm.rate.unknown ? undefined : () => invitedDrill(ctx, sm.survey, ctx.window, rateUses),
    },
    {
      id: `below-${sm.program.key}`,
      metricId: M.driverScore,
      label: 'Drivers below target',
      value: sm.latest && shown.length ? below.length : null,
      format: 'int',
      note: shown.length
        ? `of ${plural(shown.length, 'driver')} on 1 to 5 · ${sm.latest?.wave ?? ''}`
        : 'No 1 to 5 drivers shown',
      uses: m.uses.drivers,
      drill: shown.length
        ? () =>
            answersDrill(
              sm.latestRows.filter((r) => r.scale === '1-5'),
              {
                survey: sm.survey,
                wave: sm.latest?.wave ?? null,
                title: `${sm.program.name}, drivers in ${sm.latest?.wave ?? 'the latest wave'}`,
                subtitle: sub,
                min: sm.min,
                uses: m.uses.drivers,
              },
            )
        : undefined,
    },
  ]
  return out
}

function readinessKpi(ctx: AnalyticsContext, m: ListeningModel, d30: SurveyModel | undefined): Kpi {
  const a = m.readiness?.overall
  const value = a?.mean ?? null
  const delta = value != null && m.priorReadiness != null ? value - m.priorReadiness : null
  return {
    id: 'readiness',
    metricId: M.readiness,
    label: 'Day-30 readiness',
    value,
    format: 'num2',
    delta,
    deltaLabel: 'vs prior period',
    goodDirection: 'up',
    deltaMaterial: delta != null && Math.abs(delta) >= m.settings.material,
    suppressed: !!a?.suppressed && a.respondents > 0,
    note: a ? `"I had what I needed" · ${plural(a.respondents, 'respondent')}` : 'No day-30 pulse answers',
    uses: m.uses.readiness,
    tab: 'onboarding',
    drill:
      d30 && m.readiness
        ? () =>
            groupsDrill(
              groupRows(m.readiness!.byRegion, {
                survey: 'Onboarding pulse day 30',
                wave: null,
                groupBy: 'Region',
              }),
              {
                survey: 'Onboarding pulse day 30',
                wave: null,
                title: 'Day-30 readiness by region',
                subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
                min: d30.min,
                uses: m.uses.readiness,
              },
            )
        : undefined,
  }
}

function wouldReturnKpi(ctx: AnalyticsContext, m: ListeningModel, ex: SurveyModel | undefined): Kpi {
  const w = m.wouldReturn
  const value = w?.share ?? null
  const delta = value != null && m.priorWouldReturn != null ? value - m.priorWouldReturn : null
  return {
    id: 'would-return',
    metricId: M.wouldReturn,
    label: 'Leavers who would return',
    value,
    format: 'pct',
    delta,
    deltaLabel: 'vs prior period',
    goodDirection: 'up',
    deltaMaterial: delta != null && Math.abs(delta) >= 0.05,
    suppressed: !!w?.suppressed && w.respondents > 0,
    note: w?.found ? `answered 4 or 5 · ${plural(w.respondents, 'leaver')}` : 'No exit survey answers',
    uses: m.uses.wouldReturn,
    tab: 'stay-exit',
    drill:
      ex && w?.found
        ? () =>
            groupsDrill(
              rowsBy(wouldReturnRows(m.prepared, ex.period), (r) => r.wave, {
                survey: 'Exit survey',
                wave: null,
                groupBy: 'Wave',
                min: ex.min,
              }),
              {
                survey: 'Exit survey',
                wave: null,
                title: 'Leavers who would return, by wave',
                subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
                min: ex.min,
                uses: m.uses.wouldReturn,
              },
            )
        : undefined,
  }
}

/* ───────────── folder tab, scorecard ───────────── */

/** Survey programs with a wave in the last 12 months (cheap: one pass over the answers). */
export function headline(ctx: AnalyticsContext): Headline {
  const p = prepare(ctx)
  const yearStart = addMonths(ctx.asOf, -12)
  const shown = new Set(shownPrograms(ctx).map((x) => x.survey))
  const active = new Set<string>()
  for (const r of p.answers) if (r.responseDate > yearStart && shown.has(r.survey)) active.add(r.survey)
  return {
    value: String(active.size),
    label: active.size === 1 ? 'survey program' : 'survey programs',
    metricId: M.active,
    uses: [...L.WAVE],
  }
}

/** What the People scorecard reads: response rate, day-30 readiness and "would return". */
export function summary(ctx: AnalyticsContext): ViewSummary {
  const m = compute(ctx)
  const ids = ['response-rate', 'readiness', 'would-return']
  return {
    kpis: ids.map((id) => m.kpis.find((k) => k.id === id)).filter((k): k is Kpi => !!k),
    findings: m.findings,
  }
}
