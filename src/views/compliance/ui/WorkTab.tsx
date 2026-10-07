/**
 * Right to work: who has an authorization ending soon and where reverification stands, the mix
 * of broad authorization categories (counts only; people behind a count only with immigration
 * details on), and Form I-9 Section 2 timeliness by site.
 */
import { BarList, type Column, Figure } from '@/charts'
import { Section } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { drill, openPerson } from '@/drill'
import { fmt } from '@/lib/format'
import type { ComplianceView } from '../engine'
import { expiryDrill, mixDrill } from '../engine/drills'
import type { SiteRow } from '../engine/i9'
import { USES } from '../engine/lineage'
import {
  asOfNote,
  businessDaysText,
  daysText,
  ofText,
  people,
  periodWords,
  targetPct,
} from '../engine/wording'
import type { ExpiryRow, MixRow } from '../engine/work'
import { M } from '../metrics'
import { I9DaysFigure, RunwayFigure } from './charts'
import { i9SiteCells } from './drill'
import { defs, NeedData, NO_RTW, STATUS_SEVERITY } from './shared'

interface ExpiringRow {
  employeeId: string
  name: string
  businessUnit: string
  department: string
  location: string
  authorizationType: string | null
  expiryDate: string
  daysToExpiry: number
  startedDate: string | null
  dueBy: string
  status: string
  x: ExpiryRow
}

export function WorkTab({ m, ctx }: { m: ComplianceView; ctx: AnalyticsContext }) {
  const s = m.scope
  const w = m.work
  const cfg = m.settings
  if (!m.base.has.rightToWork)
    return (
      <Section title="Right to work" dek="Work authorization expiry, reverification and Form I-9 timeliness.">
        <NeedData {...NO_RTW} />
      </Section>
    )

  const showType = ctx.showImmigration
  const listed = [...w.expired, ...w.expiringHorizon]
  const expiringRows: ExpiringRow[] = listed.map((x) => ({
    employeeId: x.e.employeeId,
    name: x.e.name,
    businessUnit: x.e.businessUnit,
    department: x.e.department,
    location: x.e.location,
    authorizationType: showType ? (x.r.authorizationType ?? null) : null,
    expiryDate: x.expiryDate,
    daysToExpiry: x.daysToExpiry,
    startedDate: x.startedDate,
    dueBy: x.dueBy,
    status: x.status,
    x,
  }))
  const one = (r: ExpiringRow) => () =>
    expiryDrill(s, [r.x], { title: `Work authorization of ${r.name}`, uses: USES.reverification })
  const expiringColumns: Column<ExpiringRow>[] = [
    { key: 'name', label: 'Name' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    ...(showType ? [{ key: 'authorizationType', label: 'Authorization type' }] : []),
    { key: 'expiryDate', label: 'Expiry', format: 'date' },
    { key: 'daysToExpiry', label: 'Days to expiry', format: 'days', drill: one },
    { key: 'dueBy', label: 'Start reverification by', format: 'date' },
    { key: 'startedDate', label: 'Reverification started', format: 'date' },
    { key: 'status', label: 'Status' },
  ]

  const mixUses = USES.mix
  // The people behind a count open only while immigration details are on; until then it is a count.
  const mixOpen = (r: MixRow) =>
    showType && r.people != null && r.rows.length ? () => mixDrill(s, r.rows, r.type, mixUses) : null
  const mixColumns: Column<MixRow>[] = [
    { key: 'type', label: 'Authorization category' },
    { key: 'people', label: 'Employees', format: 'int', drill: mixOpen },
    { key: 'share', label: 'Share of active employees', format: 'pct' },
  ]

  const target = cfg.targets.i9
  // A site's starts carry the site as their filter ("Filter to Austin").
  const siteCells = i9SiteCells(s, USES.i9)
  const siteDrill = (r: SiteRow, late = false) => (late ? siteCells.late(r) : siteCells.all(r))
  const siteColumns: Column<SiteRow>[] = [
    { key: 'site', label: 'Site' },
    { key: 'judged', label: 'US starts judged', format: 'int', drill: (r) => siteDrill(r) },
    { key: 'onTime', label: 'Section 2 on time', format: 'int', drill: (r) => siteDrill(r) },
    { key: 'late', label: 'Late or missing', format: 'int', drill: (r) => siteDrill(r, true) },
    { key: 'rate', label: 'On time %', format: 'pct', drill: (r) => (r.rate == null ? null : siteDrill(r)) },
  ]
  const cur = m.i9.current
  const s1 = m.i9.section1

  return (
    <>
      <Section
        title="Expiring authorizations"
        dek={`Everyone whose work authorization ends in the next ${daysText(cfg.horizonDays)}, with where reverification stands. Reverification should start ${daysText(cfg.leadDays)} before the expiry date. Authorization types show only while "Show immigration details" is on.`}
      >
        <RunwayFigure m={m} ctx={ctx} />
        <Figure
          id="compliance-expiring-authorizations"
          uses={showType ? [...USES.reverification, 'rightToWork.authorizationType'] : USES.reverification}
          metric={M.reverificationOverdue}
          span={12}
          title="Expiring authorizations"
          subtitle={`Active people whose work authorization ends in the next ${daysText(cfg.horizonDays)} or has already ended, soonest first`}
          data={expiringRows}
          columns={expiringColumns}
          definitions={defs(ctx.metrics, [M.expiring, M.reverificationOnTime, M.reverificationOverdue])}
          note={asOfNote(
            m.base.asOf,
            people(w.expiringHorizon.length),
            w.overdue.length ? `${fmt(w.overdue.length, 'int')} not started inside the lead time` : null,
            w.expired.length ? `${fmt(w.expired.length, 'int')} already ended` : null,
          )}
          tableOnly
          table={{
            maxRows: 15,
            search: 'Search people, departments or sites',
            rowTone: (r) => STATUS_SEVERITY[r.x.status],
            onRowClick: (r) => openPerson(r.employeeId),
          }}
          empty={
            !m.base.has.expiry
              ? 'Upload Right to work with an authorization expiry column to see this.'
              : listed.length
                ? null
                : `No work authorization ends in the next ${daysText(cfg.horizonDays)}.`
          }
        />
      </Section>

      <Section
        title="Authorizations and Form I-9"
        dek="The broad authorization categories of active people, and whether Form I-9 Section 2 was done on time at each US site. Nationality and citizenship are never held."
      >
        <Figure
          id="compliance-authorization-mix"
          uses={mixUses}
          metric={M.mix}
          span={4}
          title="Authorization mix"
          subtitle={`Active employees by broad authorization category, as of the as-of date`}
          data={w.mix}
          columns={mixColumns}
          definitions={defs(ctx.metrics, [M.mix])}
          note={asOfNote(
            m.base.asOf,
            `${people(w.activeCount)}`,
            showType
              ? `categories under ${cfg.minGroup} people fold into Other`
              : 'counts only; the people behind a count open while "Show immigration details" is on',
          )}
          empty={
            !m.base.has.authorizationType
              ? 'Upload Right to work with an authorization type column to see this.'
              : w.mix.length
                ? null
                : 'Nobody active in this scope has a right to work row.'
          }
        >
          <BarList
            data={w.mix}
            label="type"
            value="people"
            sort="none"
            secondary={(d) => (d.share == null ? null : fmt(d.share, 'pct'))}
            nullNote={`Hidden to protect anonymity (n < ${cfg.minGroup})`}
            onSelect={(d) => drill(mixOpen(d))}
            selectable={(d) => !!mixOpen(d)}
            lockedNote={() => (showType ? null : 'Counts only while "Show immigration details" is off')}
          />
        </Figure>
        <Figure
          id="compliance-i9-by-site"
          uses={USES.i9}
          metric={M.i9Section2}
          span={4}
          title="I-9 Section 2 on time by site"
          subtitle={`Share of US employee starts in the ${periodWords(ctx)} with Section 2 done within ${businessDaysText(cfg.i9Days)} of the start`}
          data={m.i9.bySite}
          columns={siteColumns}
          definitions={defs(ctx.metrics, [M.i9Section2, M.i9Section1])}
          note={asOfNote(
            m.base.asOf,
            cur.judged.length ? `${ofText(cur.onTime.length, cur.judged.length)} on time` : null,
            s1.judged.length && s1.rate != null ? `Section 1 by day 1: ${fmt(s1.rate, 'pct')}` : null,
            target != null ? `target ${targetPct(target)}` : null,
          )}
          empty={
            !m.base.has.i9Section2
              ? 'Upload Right to work with an I-9 Section 2 date column to see this.'
              : m.i9.bySite.length
                ? m.i9.bySite.some((r) => r.rate != null)
                  ? null
                  : `Every site has fewer than ${cfg.minGroup} US starts judged, so the shares are hidden to protect anonymity.`
                : 'No US employee started in the period.'
          }
        >
          <BarList
            data={m.i9.bySite}
            label="site"
            value="rate"
            format="pct"
            sort="none"
            domain={[0, 1]}
            ref={target != null ? { value: target, label: `target ${targetPct(target)}` } : undefined}
            secondary={(d) =>
              d.rate == null
                ? `${fmt(d.judged, 'int')} judged`
                : `${fmt(d.late, 'int')} late of ${fmt(d.judged, 'int')}`
            }
            glyphTone={(d) =>
              d.rate == null || target == null || d.rate >= target
                ? 'default'
                : d.rate < cfg.i9CriticalShare
                  ? 'critical'
                  : 'warning'
            }
            nullNote={`Hidden to protect anonymity (n < ${cfg.minGroup})`}
            onSelect={(d) => drill(siteDrill(d))}
          />
        </Figure>
        <I9DaysFigure m={m} ctx={ctx} />
      </Section>
    </>
  )
}
