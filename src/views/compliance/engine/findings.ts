/**
 * The Compliance readout (docs/VIEWS.md): working on an expired authorization, reverification
 * overdue (where it concentrates), I-9 Section 2 late at a site, anyone working without an export
 * license in force (critical), starts with a license pending, a cluster of expiries in one month,
 * the statutory deadlines coming up, and a good-news line when reverification is fully on time.
 *
 * Each finding is one sentence with its number, up to two sentences of detail and one neutral
 * action naming the team. Thresholds come from the metric dictionary. Pure.
 */
import type { Finding, FindingPerson } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { formatMonth } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { M } from '../metrics'
import { topGroup } from './base'
import { type DrillScope, expiryDrill, i9Drill, jurisdictionPeopleDrill, licenseDrill } from './drills'
import { USES, union } from './lineage'
import type { ComplianceModel } from './model'
import {
  businessDaysText,
  day,
  daysText,
  isAre,
  ofText,
  pct,
  people,
  periodWords,
  targetPct,
} from './wording'
import type { ExpiryRow } from './work'

const personOf = (x: { e: { employeeId: string; name: string } }, note?: string): FindingPerson => ({
  id: x.e.employeeId,
  name: x.e.name,
  ...(note ? { note } : {}),
})

const latest = (rows: readonly ExpiryRow[]) =>
  rows.reduce((a, x) => (x.expiryDate > a ? x.expiryDate : a), '')

export function buildFindings(ctx: AnalyticsContext, m: ComplianceModel, s: DrillScope): Finding[] {
  const { work, i9, exportControl: ex, settings: cfg, base } = m
  const out: Finding[] = []
  if (!base.has.rightToWork) return deadlineFindings(m, s, out)

  /* Working on an expired authorization. */
  if (work.expired.length) {
    const n = work.expired.length
    out.push({
      id: 'compliance-expired',
      metricId: M.expired,
      severity: 'critical',
      title: `${people(n)} ${isAre(n)} working on a work authorization that ended before ${day(m.base.asOf)}.`,
      detail: 'No reverification is recorded, so the right to work record still shows the old expiry date.',
      action:
        'Confirm each current authorization with Global mobility today and update the right to work record.',
      people: work.expired.map((x) => personOf(x, `ended ${day(x.expiryDate)}`)),
      tab: 'work',
      drill: () =>
        expiryDrill(s, work.expired, {
          title: 'Working on an authorization that has ended',
          uses: USES.expiring,
        }),
      uses: USES.expiring,
    })
  }

  /* Reverification overdue, and where it concentrates. */
  if (work.overdue.length) {
    const n = work.overdue.length
    const top = topGroup(work.overdue, (x) => x.e.businessUnit)
    const soonest = work.overdue[0]
    const critical = work.overdue.some((x) => x.daysToExpiry <= cfg.overdueCriticalDays)
    const where =
      top && n > 1 && top.rows.length > 1
        ? `${top.rows.length === n ? 'All' : fmt(top.rows.length, 'int')} ${top.rows.length === n ? 'are' : isAre(top.rows.length)} in ${top.key}. `
        : ''
    const late = work.startedLate.length
      ? ` ${fmt(work.startedLate.length, 'int')} more started less than ${daysText(cfg.leadDays)} ahead.`
      : ''
    out.push({
      id: 'compliance-reverification-overdue',
      metricId: M.overdueRule,
      severity: critical ? 'critical' : 'warning',
      title: `Reverification has not started for ${people(n)} whose work authorization ends in the next ${daysText(cfg.leadDays)}.`,
      detail: `${where}The first ends on ${day(soonest.expiryDate)}.${late}`,
      action: `Start reverification with Global mobility this week for the ${people(n)} whose authorization ends before ${day(latest(work.overdue))}.`,
      people: work.overdue.map((x) => personOf(x, `ends ${day(x.expiryDate)}`)),
      filter: top && n > 1 && top.rows.length === n ? { businessUnit: [top.key] } : undefined,
      tab: 'work',
      drill: () =>
        expiryDrill(s, work.overdue, {
          title: `Reverification not started, authorization ending within ${daysText(cfg.leadDays)}`,
          uses: USES.reverificationByUnit,
        }),
      uses: USES.reverificationByUnit,
    })
  } else if (work.startedLate.length) {
    const n = work.startedLate.length
    out.push({
      id: 'compliance-reverification-late',
      metricId: M.reverificationOnTime,
      severity: 'warning',
      title: `Reverification started less than ${daysText(cfg.leadDays)} before the expiry date for ${people(n)}.`,
      detail: `Reverification on time is ${pct(work.reverification.rate)} of ${people(work.reverification.judged.length)} judged.`,
      action: `Review the reverification calendar with Global mobility so each one starts ${daysText(cfg.leadDays)} ahead.`,
      tab: 'work',
      drill: () =>
        expiryDrill(s, work.startedLate, { title: 'Reverification started late', uses: USES.reverification }),
      uses: USES.reverification,
    })
  }

  /* I-9 Section 2 late at a site. */
  const cur = i9.current
  const target = cfg.targets.i9
  if (cur.rate != null && target != null && cur.rate < target - 1e-12 && cur.late.length) {
    const top = topGroup(cur.late, (x) => x.site)
    const k = cur.late.length
    const where =
      top && k > 1
        ? `${top.rows.length === k ? 'All' : fmt(top.rows.length, 'int')} of the ${fmt(k, 'int')} late ${top.rows.length === k ? 'were' : top.rows.length === 1 ? 'was' : 'were'} in ${top.key}.`
        : top
          ? `The late one was in ${top.key}.`
          : undefined
    out.push({
      id: 'compliance-i9-late',
      metricId: M.i9Rule,
      severity: cur.rate < cfg.i9CriticalShare ? 'critical' : 'warning',
      title: `I-9 Section 2 was completed within ${businessDaysText(cfg.i9Days)} for ${pct(cur.rate)} of US starts in the ${periodWords(ctx)}, against a ${targetPct(target)} target.`,
      detail: where ? `${where} ${ofText(cur.onTime.length, cur.judged.length)} were on time.` : undefined,
      action: top
        ? `Review the Section 2 handoff for ${top.key} with People operations so verification is done in the first ${businessDaysText(cfg.i9Days)}.`
        : 'Review the Section 2 handoff with People operations.',
      people: cur.late.map((x) => personOf(x, x.section2 ? `done ${day(x.section2)}` : 'not done')),
      tab: 'work',
      drill: () =>
        i9Drill(s, cur.late, {
          title: `US starts with I-9 Section 2 after ${businessDaysText(cfg.i9Days)}`,
          uses: union(USES.i9),
        }),
      uses: USES.i9,
    })
  }

  /* Working without an export license in force. */
  if (ex.without.length) {
    const n = ex.without.length
    const statuses = [...new Set(ex.without.map((x) => x.status))]
    const one = n === 1 ? ex.without[0] : null
    out.push({
      id: 'compliance-without-license',
      metricId: M.withoutLicense,
      severity: 'critical',
      title: `${people(n)} ${isAre(n)} working without an export license in force.`,
      detail: one
        ? `They started on ${day(one.startDate)} and the license is ${one.status.toLowerCase()}.`
        : `The licenses are ${statuses.map((x) => x.toLowerCase()).join(' or ')}.`,
      action:
        'Confirm with Trade compliance this week that access to controlled technology stays restricted until each license is in force.',
      people: ex.without.map((x) => personOf(x, `license ${x.status.toLowerCase()}`)),
      tab: 'export',
      drill: () =>
        licenseDrill(s, ex.without, {
          title: 'Working without an export license in force',
          uses: USES.exportLicense,
        }),
      uses: USES.exportLicense,
    })
  }

  /* Starts with a license pending. */
  if (ex.pendingStarts.length) {
    const n = ex.pendingStarts.length
    const first = ex.pendingStarts[0]
    out.push({
      id: 'compliance-pending-starts',
      metricId: M.pendingStarts,
      severity: 'warning',
      title: `${people(n)} start in the next ${daysText(cfg.pendingDays)} with an export license not yet in force.`,
      detail: `The first starts on ${day(first.startDate)}.`,
      action: `Ask Trade compliance whether the licenses will be in force by ${day(first.startDate)}, and agree new start dates with the hiring managers if not.`,
      people: ex.pendingStarts.map((x) => personOf(x, `starts ${day(x.startDate)}`)),
      tab: 'export',
      drill: () =>
        licenseDrill(s, ex.pendingStarts, {
          title: 'Upcoming starts with an export license not in force',
          uses: USES.exportLicense,
        }),
      uses: USES.exportLicense,
    })
  }

  /* A cluster of expiries in one month. */
  const total = work.expiringHorizon.length
  if (total) {
    const months = new Map<string, ExpiryRow[]>()
    for (const x of work.expiringHorizon) {
      const k = x.expiryDate.slice(0, 7)
      months.set(k, [...(months.get(k) ?? []), x])
    }
    const peak = [...months.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    )[0]
    if (peak && peak[1].length >= cfg.clusterMin && peak[1].length / total >= cfg.clusterShare) {
      const rows = peak[1]
      const notStarted = rows.filter((x) => !x.startedDate).length
      out.push({
        id: 'compliance-expiry-cluster',
        metricId: M.clusterRule,
        severity: 'info',
        title: `${fmt(rows.length, 'int')} work authorizations end in ${formatMonth(`${peak[0]}-01`)}, ${fmt(rows.length / total, 'pct0')} of the ${fmt(total, 'int')} ending in the next ${daysText(cfg.horizonDays)}.`,
        detail: notStarted
          ? `Reverification has not started for ${fmt(notStarted, 'int')} of them.`
          : undefined,
        action: `Plan the ${formatMonth(`${peak[0]}-01`)} reverifications as one batch with Global mobility.`,
        tab: 'work',
        drill: () =>
          expiryDrill(s, rows, {
            title: `Work authorizations ending in ${formatMonth(`${peak[0]}-01`)}`,
            uses: USES.expiring,
          }),
        uses: USES.expiring,
      })
    }
  }

  /* Good news. */
  const rev = work.reverification
  if (!work.overdue.length && !work.expired.length && rev.rate === 1 && rev.judged.length >= cfg.minGroup) {
    out.push({
      id: 'compliance-reverification-good',
      metricId: M.reverificationOnTime,
      severity: 'good',
      title: `Every one of the ${fmt(rev.judged.length, 'int')} authorizations due for reverification started at least ${daysText(cfg.leadDays)} ahead.`,
      tab: 'work',
      drill: () =>
        expiryDrill(s, rev.judged, {
          title: 'Authorizations judged on reverification',
          uses: USES.reverification,
        }),
      uses: USES.reverification,
    })
  }
  return deadlineFindings(m, s, out)
}

/** The statutory deadlines coming up, as one informational line. */
function deadlineFindings(m: ComplianceModel, s: DrillScope, out: Finding[]): Finding[] {
  const d = m.deadlines
  if (!d.upcoming.length) return out
  const dated = d.upcoming.filter((x) => x.entry.day)
  const juris = new Set(d.upcoming.map((x) => x.jurisdiction.id)).size
  const first = dated[0]
  out.push({
    id: 'compliance-deadlines',
    metricId: M.deadlines,
    severity: 'info',
    title: `${plural(d.upcoming.length, 'statutory calendar entry', 'statutory calendar entries')} ${d.upcoming.length === 1 ? 'falls' : 'fall'} in the next ${daysText(m.settings.deadlineDays)} across ${plural(juris, 'jurisdiction')}.`,
    detail: first
      ? `${fmt(dated.length, 'int')} have a fixed date; the first is ${first.entry.title} (${first.jurisdiction.shortName}, ${day(first.start)}).`
      : undefined,
    action:
      'Confirm an owner for each entry, and the dates with employment counsel where the Atlas marks them to verify.',
    tab: 'deadlines',
    // The people whose work sites bring these jurisdictions into scope.
    drill: () => {
      const ids = new Set(d.upcoming.map((x) => x.jurisdiction.id))
      const covered = new Map(
        d.jurisdictions
          .filter((j) => ids.has(j.jurisdiction.id))
          .flatMap((j) => j.people.map((e) => [e.employeeId, e])),
      )
      return jurisdictionPeopleDrill(
        s,
        [...covered.values()],
        'the jurisdictions with deadlines',
        USES.deadlines,
      )
    },
    uses: USES.deadlines,
  })
  return out
}
