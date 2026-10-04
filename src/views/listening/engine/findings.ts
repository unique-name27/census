/**
 * The Listening readout (docs/VIEWS.md, Listening, Findings): each finding ties a survey result
 * to an operational number (the late laptops behind low day-30 readiness, the recruiter's load
 * behind low hiring manager scores), says where it concentrates and gives one neutral next step.
 * Never a finding about a group under the minimum: every number here comes from a shown group.
 */

import { SEVERITY_RANK } from '@/components/readoutModel'
import type { Finding, Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { SITES } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { fmt, fmtDelta, plural } from '@/lib/format'
import { type Breakdown, groupRows } from '@/lib/surveys'
import { M, scoreMetric } from '../metrics'
import { LEVEL_BANDS } from './catalog'
import type {
  ExitCut,
  ManagerCutResult,
  ReadinessCut,
  RecruiterCut,
  ReturnCut,
  StageCut,
  StayCut,
} from './cuts'
import { splitDeptBand } from './cuts'
import { groupsDrill, rowsBy } from './drills'
import * as L from './lineage'
import type { SurveyModel } from './measures'
import { materialOf } from './measures'
import { cutOf, deptBandOf, type Prepared } from './prepare'
import type { ListeningSettings } from './settings'

/** A mean on 1-5 in words: "3.42 of 5". */
export const ofFive = (v: number): string => `${fmt(v, 'num2')} of 5`
/** NPS with its sign: "+10", "−31". */
export const npsText = (v: number): string => fmtDelta(v, 'int')
/** The headline value as written in a sentence. */
export const headlineText = (kind: 'nps' | 'mean', v: number): string =>
  kind === 'nps' ? `NPS ${npsText(v)}` : ofFive(v)

const STAGE_WORDS: Record<string, string> = {
  Screen: 'screen',
  'Hiring manager': 'hiring manager interview',
  Onsite: 'onsite',
  Offer: 'offer decision',
}
export const stageWords = (stage: string): string => STAGE_WORDS[stage] ?? stage.toLowerCase()

const lower = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1))

/**
 * A driver as a reader knows it: the question in quotes when the Survey items sheet words the
 * driver's one item ("I can see a path to my next role here"), else the driver's name.
 */
export function driverPhrase(p: Prepared, survey: string, driver: string): string {
  const items = p.itemRows.filter((it) => (!it.survey || it.survey === survey) && it.driver === driver)
  const text = items.length === 1 ? items[0].text?.trim().replace(/[.?]$/, '') : null
  return text ? `"${text}"` : driver
}

export interface FindingInputs {
  ctx: AnalyticsContext
  p: Prepared
  s: ListeningSettings
  surveys: ReadonlyMap<string, SurveyModel>
  stage: StageCut | null
  recruiter: RecruiterCut | null
  readiness: ReadinessCut | null
  stay: StayCut | null
  exit: ExitCut | null
  managers: ManagerCutResult | null
  returns: ReturnCut | null
  courses: Breakdown | null
  engagementByOrg: Breakdown | null
  /** Per-program response rates, for the response-rate finding. */
  rates: { survey: string; name: string; rate: number | null; invited: number; responded: number }[]
}

const periodSub = (ctx: AnalyticsContext) => `${ctx.window.label} · ${ctx.scopeLabel}`

function withItems(p: Prepared, ...groups: L.Refs[]): FieldRef[] {
  return [
    ...L.union(
      ...groups,
      L.when(p.hasDriverColumn, ['surveyResponses.driver']),
      L.when(p.hasItems, L.ITEMS_DRIVER),
    ),
  ]
}

export function buildFindings(f: FindingInputs): Finding[] {
  const { ctx, p, s } = f
  const out: Finding[] = []
  const sub = periodSub(ctx)

  /* Candidates at one stage of one department. */
  const cx = f.surveys.get('Candidate experience')
  if (f.stage?.flag && cx?.latest) {
    const g = f.stage.flag
    const wave = cx.latest.wave
    const stage = stageWords(g.stage)
    const detail = [
      `${plural(g.respondents, 'candidate')} answered in ${wave}.`,
      g.lowDriver
        ? `${driverPhrase(p, 'Candidate experience', g.lowDriver.driver)} scores ${ofFive(g.lowDriver.mean)} for them.`
        : null,
      g.waiting
        ? `${plural(g.waiting, 'active candidate')} in ${g.department} ${g.waiting === 1 ? 'is' : 'are'} at the ${stage} with no offer yet.`
        : null,
    ]
      .filter(Boolean)
      .join(' ')
    const atStage = cx.latestRows.filter((r) => r.scale === '0-10' && r.touchpoint?.trim() === g.stage)
    out.push({
      id: 'listening-stage',
      metricId: M.stageNps,
      severity: g.gap >= 2 * s.stageGap ? 'critical' : 'warning',
      title: `Candidate NPS after the ${g.department} ${stage} is ${npsText(g.nps)} in ${wave}, against ${npsText(g.restNps)} for other departments at the same stage.`,
      detail,
      action: `Resolve the ${stage} bottleneck in ${g.department}: ask the panels to submit scorecards and make decisions this week.`,
      tab: 'candidates',
      filter: { department: [g.department] },
      uses: withItems(
        p,
        L.ANSWER,
        L.ITEM,
        L.TOUCHPOINT,
        L.CAND_REQ,
        L.REQ_ORG,
        L.when(g.waiting, L.ONSITE_WAIT),
      ),
      drill: () =>
        groupsDrill(
          rowsBy(atStage, cutOf(p, 'department'), {
            survey: 'Candidate experience',
            wave,
            groupBy: 'Department',
            min: cx.min,
          }),
          {
            survey: 'Candidate experience',
            wave,
            title: `Candidate NPS at the ${stage}, by department`,
            subtitle: `${wave} · ${ctx.scopeLabel}`,
            min: cx.min,
          },
        ),
    })
  }

  /* One recruiter's hiring managers. */
  const hm = f.surveys.get('Hiring manager satisfaction')
  if (f.recruiter?.flag && hm) {
    const g = f.recruiter.flag
    const range =
      g.othersLow != null && g.othersHigh != null
        ? Math.abs(g.othersHigh - g.othersLow) < 0.005
          ? `${fmt(g.othersLow, 'num2')} for the other recruiter`
          : `${fmt(g.othersLow, 'num2')} to ${fmt(g.othersHigh, 'num2')} for other recruiters`
        : `${fmt(g.restMean, 'num2')} for other recruiters`
    const low = g.lowDrivers.map((d) => `${lower(d.driver)} (${fmt(d.mean, 'num2')})`)
    const detail = [
      `${plural(g.respondents, 'hiring manager')} answered about ${plural(g.reqs, 'filled req')} in the period${low.length ? `; ${low.join(' and ')} score lowest` : ''}.`,
      g.openReqs
        ? `${g.recruiter} carries ${plural(g.openReqs, 'open req')} and ${plural(g.activeCandidates, 'active candidate')}${g.heaviest ? ', the most of any recruiter' : ''}.`
        : null,
    ]
      .filter(Boolean)
      .join(' ')
    const five = hm.period.filter((r) => r.scale === '1-5')
    out.push({
      id: 'listening-recruiter',
      metricId: M.byRecruiter,
      severity: 'warning',
      title: `Hiring managers rate ${g.recruiter} ${ofFive(g.mean)}, against ${range}.`,
      detail,
      action: `Review ${g.recruiter}’s open req load with the talent acquisition lead and rebalance where needed.`,
      tab: 'candidates',
      uses: withItems(p, L.ANSWER, L.ITEM, L.SUBJECT, L.REQ_RECRUITER, L.when(g.openReqs, L.RECRUITER_LOAD)),
      drill: () =>
        groupsDrill(
          rowsBy(five, (r) => (r.subjectKey ? p.req.get(r.subjectKey)?.recruiter : null) ?? null, {
            survey: 'Hiring manager satisfaction',
            wave: null,
            groupBy: 'Recruiter',
            min: hm.min,
          }),
          {
            survey: 'Hiring manager satisfaction',
            wave: null,
            title: 'Hiring manager satisfaction by recruiter',
            subtitle: sub,
            min: hm.min,
          },
        ),
    })
  }

  /* Day-30 readiness in one region. */
  const d30 = f.surveys.get('Onboarding pulse day 30')
  if (f.readiness?.flag && d30) {
    const g = f.readiness.flag
    const laptop = g.laptop
    const title = laptop
      ? `Day-30 readiness is ${ofFive(g.mean)} in ${g.region}, against ${fmt(g.restMean, 'num2')} elsewhere; laptops shipped late for ${fmt(laptop.share, 'pct')} of starts there.`
      : `Day-30 readiness is ${ofFive(g.mean)} in ${g.region}, against ${fmt(g.restMean, 'num2')} elsewhere.`
    const detail = [
      `${plural(g.respondents, 'new employee')} in ${g.region} answered "In my first week I had what I needed to do my job" in the period.`,
      laptop
        ? `Laptops shipped after their due date for ${laptop.late} of ${laptop.starts} ${g.region} starts${g.lateMean != null ? `, and people whose laptop was late score ${fmt(g.lateMean, 'num2')}` : ''}.`
        : null,
    ]
      .filter(Boolean)
      .join(' ')
    const sites = SITES.filter((x) => (x.region === 'APAC' ? 'Asia Pacific' : x.region) === g.region).map(
      (x) => x.location,
    )
    const rows = f.readiness.byRegion
    out.push({
      id: 'listening-readiness',
      metricId: M.readiness,
      severity: 'warning',
      title,
      detail,
      action: laptop
        ? `Review laptop shipping lead times for ${g.region} starts with IT.`
        : `Review what new starters in ${g.region} are missing in their first week with the onboarding team.`,
      tab: 'onboarding',
      filter: sites.length ? { location: sites } : undefined,
      uses: withItems(p, L.ANSWER, L.ITEM, L.EMP_LOCATION, L.when(laptop, L.LAPTOP_TASKS)),
      drill: () =>
        groupsDrill(groupRows(rows, { survey: 'Onboarding pulse day 30', wave: null, groupBy: 'Region' }), {
          survey: 'Onboarding pulse day 30',
          wave: null,
          title: 'Day-30 readiness by region',
          subtitle: sub,
          min: d30.min,
        }),
    })
  }

  /* Stay risk for one group of key talent. */
  const stay = f.surveys.get('Stay interview')
  if (f.stay?.flag && stay) {
    const g = f.stay.flag
    const { department, band } = splitDeptBand(g.group)
    const reason = lower(g.reason)
    const detail = [
      g.driver
        ? `${driverPhrase(p, 'Stay interview', g.driver.driver)} scores ${ofFive(g.driver.mean)} for them, against ${fmt(g.driver.restMean, 'num2')} for other key talent.`
        : null,
      `Across the company, ${fmt(g.companyShare, 'pct0')} of stay interviews name ${reason}.`,
    ]
      .filter(Boolean)
      .join(' ')
    const action = /growth|promotion|career/i.test(g.reason)
      ? `Review promotion readiness for ${department} ${band} at the next talent review.`
      : /pay|salary|compensation|bonus|equity/i.test(g.reason)
        ? `Review pay positioning for ${department} ${band} with total rewards.`
        : `Discuss what would keep ${department} ${band} key talent with their leaders at the next talent review.`
    const inGroup = deptBandOf(p)
    const groupAnswers = stay.period.filter((r) => inGroup(r) === g.group)
    const levels = LEVEL_BANDS.find((b) => b.band === band)?.levels ?? []
    out.push({
      id: 'listening-stay-risk',
      metricId: M.topRisk,
      severity: 'warning',
      title: `${g.reason} is the top stay risk for ${department} ${band} key talent, named in ${fmt(g.share, 'pct0')} of their stay interviews (${g.count} of ${g.interviews}).`,
      detail,
      action,
      tab: 'stay-exit',
      filter: { department: [department], level: [...levels] },
      uses: withItems(
        p,
        L.WAVE,
        L.RESPONDENT,
        L.REASON,
        L.EMP_ORG,
        L.EMP_LEVEL,
        L.when(g.driver, L.ANSWER, L.ITEM),
      ),
      drill: () =>
        groupsDrill(
          rowsBy(groupAnswers, (r) => r.reason?.trim() || null, {
            survey: 'Stay interview',
            wave: null,
            groupBy: 'Top stay risk',
            min: stay.min,
          }),
          {
            survey: 'Stay interview',
            wave: null,
            title: `Stay risks named by ${department} ${band} key talent`,
            subtitle: sub,
            min: stay.min,
            note: 'Each person counts once for each reason they named.',
          },
        ),
    })
  }

  /* The top exit reason in one location. */
  const exit = f.surveys.get('Exit survey')
  if (f.exit?.flag && exit) {
    const g = f.exit.flag
    const against = g.next ? `, against ${g.next.count} for ${lower(g.next.reason)}` : ''
    const detail = [
      g.hris?.topReason
        ? `The HRIS records ${lower(g.hris.topReason)} for ${g.hris.topCount} of the ${g.hris.leavers} people who left ${g.location} by choice in the period, and ${lower(g.reason)} for ${g.hris.surveyReason}.`
        : null,
      `Elsewhere, ${fmt(g.restShare, 'pct0')} of leavers name ${lower(g.reason)}.`,
    ]
      .filter(Boolean)
      .join(' ')
    const here = exit.period.filter((r) => p.emp.get(r.respondentKey)?.location === g.location)
    out.push({
      id: 'listening-exit-reason',
      metricId: M.exitReasons,
      severity: 'warning',
      title: `${g.reason} is the top exit survey reason in ${g.location}, named by ${g.count} of ${g.respondents} leavers${against}.`,
      detail,
      action: g.pay
        ? `Review ${g.location} pay positioning against the market with total rewards.`
        : `Review what leavers in ${g.location} say with the HR business partner.`,
      tab: 'stay-exit',
      filter: { location: [g.location] },
      uses: [...L.union(L.WAVE, L.RESPONDENT, L.REASON, L.EMP_LOCATION, L.when(g.hris, L.HRIS_REASON))],
      drill: () =>
        groupsDrill(
          rowsBy(here, (r) => r.reason?.trim() || null, {
            survey: 'Exit survey',
            wave: null,
            groupBy: 'Exit reason',
            min: exit.min,
          }),
          {
            survey: 'Exit survey',
            wave: null,
            title: `Exit survey reasons in ${g.location}`,
            subtitle: sub,
            min: exit.min,
          },
        ),
    })
  }

  /* Low upward feedback (manager cuts only). */
  const mf = f.surveys.get('Manager feedback')
  if (f.managers?.flags.length && mf) {
    const g = f.managers.flags[0]
    const more = f.managers.flags.length - 1
    const detail = [
      `${plural(g.respondents, 'person', 'people')} answered over the four quarters to ${formatDate(ctx.asOf)}${g.average != null ? `; the average for managers shown is ${fmt(g.average, 'num2')}` : ''}.`,
      g.regrettedExits
        ? `${plural(g.regrettedExits, 'regretted leaver')} reported to ${g.name} in the period.`
        : null,
      more
        ? `${plural(more, 'other manager')} also ${more === 1 ? 'scores' : 'score'} below ${fmt(s.lowManager, 'num1')}.`
        : null,
    ]
      .filter(Boolean)
      .join(' ')
    const theirs = mf.all.filter(
      (r) =>
        r.responseDate >= f.managers!.window.start &&
        r.responseDate <= f.managers!.window.end &&
        (r.subjectKey === g.managerId ||
          (!r.subjectKey && p.emp.get(r.respondentKey)?.managerId === g.managerId)),
    )
    out.push({
      id: 'listening-manager-low',
      metricId: M.upward,
      severity: g.mean < s.lowManager - 0.5 ? 'critical' : 'warning',
      title: `Upward feedback for ${g.name} is ${ofFive(g.mean)}, the lowest of ${plural(g.shown, 'manager')} with ${s.minManager} or more respondents.`,
      detail,
      action: 'Share the results with the HR business partner and agree a development plan with the manager.',
      tab: 'managers',
      people: [{ id: g.managerId, name: g.name, note: g.department ?? undefined }],
      uses: [...L.union(L.ANSWER, L.SUBJECT, L.MANAGER_JOIN, L.when(g.regrettedExits, L.MANAGER_EXITS))],
      drill: () =>
        groupsDrill(
          rowsBy(theirs, (r) => r.driver ?? r.item, {
            survey: 'Manager feedback',
            wave: null,
            groupBy: 'Driver',
            min: s.minManager,
          }),
          {
            survey: 'Manager feedback',
            wave: null,
            title: `Upward feedback for ${g.name}, by driver`,
            subtitle: `Four quarters to ${formatDate(ctx.asOf)}`,
            min: s.minManager,
            note: `Manager cuts need ${s.minManager} or more distinct respondents over four quarters.`,
          },
        ),
    })
  }

  /* Return to work after late processing. */
  const rtw = f.surveys.get('Return to work')
  if (f.returns?.flag && rtw) {
    const g = f.returns.flag
    out.push({
      id: 'listening-return',
      metricId: M.returnTiming,
      severity: 'warning',
      title: `Return to work ${driverPhrase(p, 'Return to work', g.driver)} is ${ofFive(g.late as number)} for returns processed late, against ${fmt(g.onTime, 'num2')} for returns on time.`,
      detail: f.returns.returns
        ? `${f.returns.lateReturns} of ${plural(f.returns.returns, 'return')} from leave in the period were processed after their due date.`
        : undefined,
      action: 'Review return-from-leave processing times with people operations.',
      tab: 'services',
      uses: withItems(p, L.ANSWER, L.ITEM, L.RETURN_TX),
      drill: () =>
        groupsDrill(
          rowsBy(rtw.period, (r) => r.driver ?? r.item, {
            survey: 'Return to work',
            wave: null,
            groupBy: 'Driver',
            min: rtw.min,
          }),
          {
            survey: 'Return to work',
            wave: null,
            title: 'Return to work by driver',
            subtitle: sub,
            min: rtw.min,
          },
        ),
    })
  }

  /* The lowest course. */
  const trn = f.surveys.get('Training evaluation')
  if (f.courses && trn) {
    const shown = f.courses.groups.filter((g) => g.mean != null)
    const low = [...shown].sort((a, b) => (a.mean ?? 0) - (b.mean ?? 0))[0]
    if (low && (low.mean ?? 5) < s.lowCourse && shown.length >= 2)
      out.push({
        id: 'listening-course',
        metricId: M.byCourse,
        severity: 'info',
        title: `${low.group} scores ${ofFive(low.mean as number)} in training evaluations, the lowest of ${plural(shown.length, 'course')} rated in the period.`,
        detail: `${plural(low.respondents, 'person', 'people')} rated it.`,
        action: 'Review the course content and who it is assigned to with its owner.',
        tab: 'services',
        uses: withItems(p, L.ANSWER, L.ITEM, L.COURSE),
        drill: () =>
          groupsDrill(
            rowsBy(
              trn.period.filter((r) => r.subjectKey?.trim() === low.group),
              (r) => r.driver ?? r.item,
              { survey: 'Training evaluation', wave: null, groupBy: 'Driver', min: trn.min },
            ),
            {
              survey: 'Training evaluation',
              wave: null,
              title: `${low.group}, by driver`,
              subtitle: sub,
              min: trn.min,
            },
          ),
      })
  }

  /* The largest material drop since the last wave. */
  let drop: { m: SurveyModel; size: number } | null = null
  for (const m of f.surveys.values()) {
    if (m.change == null || m.change >= 0 || !m.material || !m.latest || !m.prior) continue
    const size = -m.change / materialOf(m.program.headline, s)
    if (!drop || size > drop.size) drop = { m, size }
  }
  if (drop) {
    const m = drop.m
    const kind = m.program.headline
    const worst = [...m.drivers]
      .filter((d) => d.delta != null && d.material && (d.delta ?? 0) < 0)
      .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0]
    out.push({
      id: `listening-drop-${m.program.key}`,
      metricId: M.change,
      severity: 'warning',
      title: `${m.program.name} fell ${kind === 'nps' ? `${fmt(-(m.change as number), 'int')} points` : `${fmt(-(m.change as number), 'num2')} points`} since ${m.prior!.wave}, to ${headlineText(kind, m.headline.value as number)} in ${m.latest!.wave}.`,
      detail: worst
        ? `${worst.driver} fell most, by ${fmt(-(worst.delta as number), 'num2')} to ${fmt(worst.value, 'num2')}.`
        : undefined,
      action: `Compare what changed for ${m.survey.toLowerCase()} respondents between the two waves.`,
      tab: m.program.tab,
      uses: withItems(p, L.ANSWER, L.ITEM),
      drill: () =>
        groupsDrill(
          rowsBy(
            [...m.priorRows, ...m.latestRows].filter((r) => r.scale === (kind === 'nps' ? '0-10' : '1-5')),
            (r) => r.wave,
            { survey: m.survey, wave: null, groupBy: 'Wave', min: m.min },
          ),
          {
            survey: m.survey,
            wave: null,
            title: `${m.program.name} by wave`,
            subtitle: ctx.scopeLabel,
            min: m.min,
          },
        ),
    })
  }

  /* Response rates under target. */
  const target = s.responseTarget
  const known = f.rates.filter((r) => r.rate != null)
  if (target && known.length) {
    const below = known.filter((r) => (r.rate as number) < target.value - 1e-9)
    if (below.length) {
      const worst = [...below].sort((a, b) => (a.rate as number) - (b.rate as number))[0]
      out.push({
        id: 'listening-response-rate',
        metricId: M.responseRate,
        severity: 'info',
        title: `${below.length} of ${plural(known.length, 'survey program')} with a known invited population ${below.length === 1 ? 'is' : 'are'} below the ${fmt(target.value, 'pct0')} response-rate target; ${lower(worst.survey)} is lowest at ${fmt(worst.rate, 'pct')}.`,
        detail: `${worst.responded} of ${plural(worst.invited, 'person', 'people')} invited answered it in the period.`,
        action: 'Review when and how these surveys are sent with their program owners.',
        tab: 'overview',
        uses: [...L.union(L.WAVE, L.RESPONDENT, ...Object.values(L.POPULATION))],
      })
    }
  }

  /* Engagement, while the switch is on. */
  const eng = f.surveys.get('Engagement')
  if (eng && f.engagementByOrg && eng.headline.value != null && eng.target && eng.status === 'missed') {
    const shown = f.engagementByOrg.groups.filter((g) => g.nps != null)
    const low = [...shown].sort((a, b) => (a.nps ?? 0) - (b.nps ?? 0))[0]
    out.push({
      id: 'listening-engagement',
      metricId: scoreMetric(eng.program),
      severity: 'warning',
      title: `eNPS is ${npsText(eng.headline.value)} in ${eng.latest?.wave}, below the ${npsText(eng.target.value)} target${low ? `; ${low.group} is lowest at ${npsText(low.nps as number)}` : ''}.`,
      action: 'Review the engagement results with each business unit leader.',
      tab: 'engagement',
      uses: withItems(p, L.ANSWER, L.ITEM, L.EMP_ORG),
    })
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity as Severity] - SEVERITY_RANK[b.severity as Severity])
}
