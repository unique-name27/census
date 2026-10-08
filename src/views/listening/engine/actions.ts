/**
 * Listening's open items for the Action center (docs/VIEWS.md, Action center): survey results
 * that need someone to act, each owned by the team that can act on it.
 *
 *  - Upward feedback below the low score (manager cuts only, 10+ respondents): the manager's HR
 *    business partner.
 *  - A group of key talent where one stay risk dominates: talent management.
 *  - A location whose top exit reason stands out: total rewards when the reason is pay, else
 *    the HR business partners.
 *  - Day-30 readiness well below elsewhere in a region: IT when late laptops explain it, else
 *    people operations.
 *
 * Wording follows the recruiting tone rules: `what` states the result, `note` is a polite ask.
 * No item names a respondent; a manager is named only through a manager cut. Each item carries
 * its place for the HRBP lenses (regions from the one region index, "APAC") and a fingerprint of
 * the result, so a handled mark reopens when a new wave changes it.
 */
import type { AnalyticsContext } from '@/data/context'
import { groupFilter } from '@/drill/filter'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ActionItem } from '@/views/types'
import { placeOf, TEAM_OWNER } from '../../hrbp/engine/places'
import { M } from '../metrics'
import { deptBandFilter, readinessRows, splitDeptBand } from './cuts'
import { groupsDrill, rowsBy } from './drills'
import { ofFive } from './findings'
import { compute, type ListeningModel } from './index'
import * as L from './lineage'
import { deptBandOf } from './prepare'

export function listeningActions(ctx: AnalyticsContext): ActionItem[] {
  return actionsOf(ctx, compute(ctx))
}

export function actionsOf(ctx: AnalyticsContext, m: ListeningModel): ActionItem[] {
  const s = m.settings
  const p = m.prepared
  const out: ActionItem[] = []
  const sub = `${ctx.window.label} · ${ctx.scopeLabel}`

  const mf = m.surveys.get('Manager feedback')
  if (m.managers && mf) {
    const w = m.managers.window
    for (const g of m.managers.flags) {
      const theirs = mf.all.filter(
        (r) =>
          r.responseDate >= w.start &&
          r.responseDate <= w.end &&
          (r.subjectKey === g.managerId ||
            (!r.subjectKey && p.emp.get(r.respondentKey)?.managerId === g.managerId)),
      )
      out.push({
        id: `listening:manager:${g.managerId}`,
        ownerRole: 'hrbp',
        ownerId: null,
        ownerName: g.hrbp || TEAM_OWNER.hrbp,
        severity: g.mean < s.lowManager - 0.5 ? 'critical' : 'warning',
        what: `Upward feedback is ${ofFive(g.mean)} from ${g.respondents} people over four quarters, below the low score of ${fmt(s.lowManager, 'num1')}`,
        subject: { kind: 'employees', id: g.managerId, label: g.name },
        view: 'listening',
        tab: 'managers',
        note: `Could you review the upward feedback results with ${g.name} and agree a development plan?`,
        uses: [...L.union(L.ANSWER, L.SUBJECT, L.MANAGER_JOIN)],
        fingerprint: `${g.respondents}/${fmt(g.mean, 'num2')}`,
        closesWhen: 'A later wave with upward feedback at or above the low score',
        place: placeOf(ctx, p.emp.get(g.managerId)),
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
  }

  const stay = m.surveys.get('Stay interview')
  if (m.stay?.flag && stay) {
    const g = m.stay.flag
    const { department, band } = splitDeptBand(g.group)
    const inGroup = deptBandOf(p)
    const groupAnswers = stay.period.filter((r) => inGroup(r) === g.group)
    out.push({
      id: `listening:stay:${g.group}`,
      ownerRole: 'talent',
      ownerName: TEAM_OWNER.talent,
      severity: 'warning',
      what: `${g.reason} is the top stay risk in ${fmt(g.share, 'pct0')} of stay interviews (${g.count} of ${g.interviews})`,
      fingerprint: `${g.count}/${g.interviews}`,
      closesWhen: 'A later wave where no stay risk stands out for the group',
      place: { businessUnit: oneUnit(groupAnswers.map((r) => p.emp.get(r.respondentKey)?.businessUnit)) },
      subject: { kind: 'none', label: `${department} ${band} key talent` },
      view: 'listening',
      tab: 'stay-exit',
      note: /growth|promotion|career/i.test(g.reason)
        ? `Could you add promotion readiness for ${department} ${band} to the next talent review?`
        : `Could you add what would keep ${department} ${band} key talent to the next talent review?`,
      uses: [...L.union(L.WAVE, L.RESPONDENT, L.REASON, L.EMP_ORG, L.EMP_LEVEL)],
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
            filter: deptBandFilter(
              p,
              g.group,
              groupAnswers.map((r) => r.respondentKey),
            ),
          },
        ),
    })
  }

  const exit = m.surveys.get('Exit survey')
  if (m.exit?.flag && exit) {
    const g = m.exit.flag
    out.push({
      id: `listening:exit:${g.location}`,
      ownerRole: g.pay ? 'total-rewards' : 'hrbp',
      ownerName: g.pay ? TEAM_OWNER.totalRewards : TEAM_OWNER.hrbp,
      severity: 'warning',
      what: `${g.reason} is the top exit survey reason in ${g.location} (${g.count} of ${g.respondents} leavers)`,
      fingerprint: `${g.count}/${g.respondents}`,
      closesWhen: 'A later period where no exit reason stands out at the location',
      place: placeOf(ctx, { location: g.location }),
      subject: { kind: 'none', label: `${g.location} leavers` },
      view: 'listening',
      tab: 'stay-exit',
      note: g.pay
        ? `Could you review ${g.location} pay positioning against the market?`
        : `Could you review what leavers in ${g.location} say with their leaders?`,
      uses: [...L.union(L.WAVE, L.RESPONDENT, L.REASON, L.EMP_LOCATION)],
      drill: () =>
        groupsDrill(
          rowsBy(
            exit.period.filter((r) => p.emp.get(r.respondentKey)?.location === g.location),
            (r) => r.reason?.trim() || null,
            { survey: 'Exit survey', wave: null, groupBy: 'Exit reason', min: exit.min },
          ),
          {
            survey: 'Exit survey',
            wave: null,
            title: `Exit survey reasons in ${g.location}`,
            subtitle: sub,
            min: exit.min,
            filter: groupFilter('location', g.location),
          },
        ),
    })
  }

  const d30 = m.surveys.get('Onboarding pulse day 30')
  if (m.readiness?.flag && d30) {
    const g = m.readiness.flag
    const laptop = g.laptop
    out.push({
      id: `listening:readiness:${g.region}`,
      ownerRole: laptop ? 'it' : 'hr-ops',
      ownerName: laptop ? TEAM_OWNER.it : TEAM_OWNER.peopleOps,
      severity: 'warning',
      fingerprint: `${g.respondents}/${fmt(g.mean, 'num2')}`,
      closesWhen: 'A later period with day-30 readiness in the region near the rest',
      place: { region: g.region },
      what: laptop
        ? `Day-30 readiness is ${ofFive(g.mean)} in ${g.region}; laptops shipped late for ${laptop.late} of ${laptop.starts} starts there`
        : `Day-30 readiness is ${ofFive(g.mean)} in ${g.region}, against ${fmt(g.restMean, 'num2')} elsewhere`,
      subject: { kind: 'none', label: `${g.region} starts` },
      view: 'listening',
      tab: 'onboarding',
      note: laptop
        ? `Could you review laptop shipping lead times for ${g.region} starts, so new employees have what they need in week one?`
        : `Could you review what new starters in ${g.region} are missing in their first week?`,
      uses: [...L.union(L.ANSWER, L.ITEM, L.EMP_LOCATION, L.when(laptop, L.LAPTOP_TASKS))],
      drill: () =>
        groupsDrill(
          rowsBy(readinessRows(p, d30.period), (r) => p.emp.get(r.respondentKey)?.location ?? null, {
            survey: 'Onboarding pulse day 30',
            wave: null,
            groupBy: 'Location',
            min: d30.min,
          }),
          {
            survey: 'Onboarding pulse day 30',
            wave: null,
            title: 'Day-30 readiness by location',
            subtitle: sub,
            min: d30.min,
          },
        ),
    })
  }
  return out
}

/** The one business unit a group's people share, else none (the group spans units). */
function oneUnit(units: readonly (string | null | undefined)[]): string | null {
  const set = new Set(units.filter(Boolean))
  return set.size === 1 ? ([...set][0] as string) : null
}

/** Metric ids the actions read their thresholds from (for tests). */
export const ACTION_METRICS = [M.upward, M.topRisk, M.exitReasons, M.readiness] as const
