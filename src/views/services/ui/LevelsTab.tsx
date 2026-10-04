import { BarList, type Column, Figure } from '@/charts'
import { Section, StatusPill } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { Drill, drill } from '@/drill'
import { fmt } from '@/lib/format'
import type { ServicesModel } from '../engine'
import type { CategoryRow } from '../engine/cases'
import { SERVICE_LEVELS, type ServiceLevelId } from '../engine/catalog'
import { metricDefinition, servicesDefinitions } from '../engine/definitions'
import {
  caseDrill,
  drillWhen,
  isLateTx,
  type LevelPart,
  levelDrill,
  resolutionDrill,
  responseDrill,
  txDrill,
} from '../engine/drills'
import type { LevelRow, LevelStatus, ProcessRow } from '../engine/levels'
import { isOther } from '../engine/util'
import { FIGURE_METRIC, levelMetric } from '../metrics'
import { type AtlasColumn, AtlasTable, ProcessId } from './AtlasTable'
import { asOfNote, count, period, STATUS_SEVERITY, STATUS_TONE, titled, useProcessHref } from './shared'

/** Short names for chart labels, unique per measure (LV-01 has two). */
const SHORT: Record<ServiceLevelId, string> = {
  'py05-payroll-2bd': 'payroll cases',
  'ds07-verification-2bd': 'verifications',
  'lv01-leave-response-1bd': 'leave first response',
  'lv01-leave-designation-5bd': 'leave resolution',
  'on03-hire-day-minus-3': 'hire entry',
  'of05-final-pay': 'final pay',
  'ds01-retro-share': 'retro share',
  'ds04-access-2bd': 'access cases',
  'er02-median-days': 'ER median days',
  'bn03-benefits-5bd': 'benefits cases',
  'mv06-immigration-response-1bd': 'immigration first response',
  'mv04-location-cutoff': 'location changes',
  'mv05-job-change-cutoff': 'job changes',
  'lv03-return-ready': 'returns from leave',
}

const STATUS_ORDER: Record<LevelStatus, number> = { Missed: 0, 'At risk': 1, Met: 2 }

const unitFormat = (r: LevelRow) => (r.unit === 'days' ? 'days' : 'pct')

function gapText(r: LevelRow): string {
  if (r.gap == null) return '—'
  if (r.unit === 'days') return `${r.gap >= 0 ? '+' : '−'}${fmt(Math.abs(r.gap), 'days')}`
  return fmt(r.gap, 'pts')
}

const CASE_CATEGORY = new Map(SERVICE_LEVELS.map((d) => [d.id, d.caseCategory ?? null]))

export function LevelsTab({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const s = m.scope
  const k = m.settings.minGroup
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const processHref = useProcessHref()
  const per = period(ctx)
  const order = new Map(SERVICE_LEVELS.map((d, i) => [d.id, i]))
  const rank = (r: LevelRow) => (r.status ? STATUS_ORDER[r.status] : 3)
  const rows = m.levels
    .map((r) => ({ ...r, label: `${r.processId} ${SHORT[r.id]}`, statusText: r.status ?? 'No data' }))
    .sort((a, b) => rank(a) - rank(b) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  type Row = (typeof rows)[number]
  const scored = m.levels.filter((r) => r.status != null)
  const missed = scored.filter((r) => r.status === 'Missed').length
  const gaps = rows.filter((r) => r.unit === 'share' && r.gap != null)
  const dayRows = m.levels.filter((r) => r.unit === 'days')
  // Each Atlas measure's own entry (with your wording), for the measures Census adapted.
  const adaptations = SERVICE_LEVELS.filter((d) => d.adaptation).map((d) =>
    metricDefinition(ctx.metrics, levelMetric(d.id)),
  )
  const response = m.categories
    .filter((c) => !isOther(c.category))
    .sort((a, b) => (a.responseRate ?? 2) - (b.responseRate ?? 2))

  /* Drill sources, shared by the scorecard, the charts and their table views. */
  const level = (r: LevelRow, part: LevelPart) => {
    const shown = part === 'n' ? !!r.n : r.actual != null && (part === 'actual' || r.misses.length > 0)
    return shown ? drillWhen(s, r.records?.rows, () => levelDrill(s, r, part)) : undefined
  }
  const caseSla = (r: LevelRow) => {
    const category = CASE_CATEGORY.get(r.id)
    return r.caseSla == null || !category
      ? undefined
      : drillWhen(s, r.caseRecords, () =>
          resolutionDrill(s, r.caseRecords, titled('Cases judged on resolution SLA', category, per)),
        )
  }
  const responseCategory = (d: CategoryRow) =>
    d.responseRate == null
      ? null
      : () => responseDrill(s, d.records, titled('Cases judged on first response SLA', d.category, per))
  const missesLabel = (r: LevelRow) =>
    `Show the ${r.misses.length.toLocaleString('en-US')} ${r.misses.length === 1 ? 'miss' : 'misses'}`

  const screen: AtlasColumn<Row>[] = [
    {
      key: 'process',
      label: 'Process',
      className: 'w-[22%] min-w-40',
      render: (r) => (
        <>
          <ProcessId id={r.processId} />
          <div className="mt-0.5 text-[12px] text-ink-2">{r.process}</div>
        </>
      ),
    },
    {
      key: 'measure',
      label: 'Measure',
      className: 'min-w-48',
      render: (r) => (
        <>
          {r.measure}
          <div className="mt-0.5 text-[12px] text-muted">
            {r.team}
            {r.basis === 'Atlas KPI' ? '' : ` · ${r.basis}`}
          </div>
        </>
      ),
    },
    { key: 'target', label: 'Target', className: 'whitespace-nowrap', render: (r) => r.target },
    {
      key: 'actual',
      label: 'Actual',
      align: 'right',
      render: (r) => <Drill spec={level(r, 'actual')}>{fmt(r.actual, unitFormat(r))}</Drill>,
    },
    {
      key: 'gap',
      label: 'Gap',
      align: 'right',
      render: (r) => (
        <Drill spec={level(r, 'misses')} label={missesLabel(r)}>
          {gapText(r)}
        </Drill>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      className: 'whitespace-nowrap',
      render: (r) =>
        r.status ? (
          <StatusPill severity={STATUS_SEVERITY[r.status]} label={r.status} />
        ) : (
          <span className="text-[12px] text-muted">No data</span>
        ),
    },
    {
      key: 'caseSla',
      label: 'Case SLA',
      align: 'right',
      render: (r) =>
        r.caseSlaTarget ? (
          <>
            <Drill spec={caseSla(r)}>{fmt(r.caseSla, 'pct')}</Drill>
            <div className="mt-0.5 text-[12px] text-muted">within {r.caseSlaTarget}</div>
          </>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'n',
      label: 'n',
      align: 'right',
      render: (r) => <Drill spec={level(r, 'n')}>{fmt(r.n, 'int')}</Drill>,
    },
  ]

  const scorecardColumns: Column<Row>[] = [
    { key: 'processId', label: 'Process ID', href: (r) => processHref(r.processId) },
    { key: 'process', label: 'Process' },
    { key: 'measure', label: 'Measure' },
    { key: 'target', label: 'Target' },
    { key: 'actual', label: 'Actual', format: (r) => unitFormat(r), drill: (r) => level(r, 'actual') },
    {
      key: 'gap',
      label: 'Gap to target',
      format: (r) => (r.unit === 'days' ? 'days' : 'pts'),
      drill: (r) => level(r, 'misses'),
    },
    { key: 'statusText', label: 'Status' },
    { key: 'caseSla', label: 'Case SLA met (calendar hours)', format: 'pct', drill: caseSla },
    { key: 'caseSlaTarget', label: 'Case SLA target' },
    { key: 'n', label: 'n', format: 'int', drill: (r) => level(r, 'n') },
    { key: 'team', label: 'Team' },
    { key: 'window', label: 'Window' },
    { key: 'atlas', label: 'Atlas wording' },
    { key: 'basis', label: 'Basis' },
  ]

  const processName = (r: ProcessRow) => `${r.processId} ${r.process}`
  const processColumns: Column<ProcessRow>[] = [
    { key: 'processId', label: 'Process ID', href: (r) => processHref(r.processId) },
    { key: 'process', label: 'Process', width: 22 },
    { key: 'owner', label: 'Accountable' },
    { key: 'covers', label: 'Covers', width: 26 },
    {
      key: 'cases',
      label: 'Cases',
      format: 'int',
      drill: (r) =>
        r.cases
          ? drillWhen(s, r.caseRecords, () =>
              caseDrill(s, r.caseRecords, { title: titled('Cases opened', processName(r), per) }),
            )
          : null,
    },
    {
      key: 'transactions',
      label: 'Transactions',
      format: 'int',
      drill: (r) =>
        r.transactions
          ? drillWhen(s, r.txRecords, () =>
              txDrill(s, r.txRecords, {
                title: titled('Transactions due', processName(r), per),
                order: (a, b) => Number(isLateTx(b)) - Number(isLateTx(a)),
              }),
            )
          : null,
    },
    { key: 'sla', label: 'Atlas service level', width: 40 },
  ]

  return (
    <>
      <Section
        title="Scorecard"
        dek={`Each row is a measurable KPI from the Hire-to-Retire Atlas, scored on the ${per}, misses first. Process IDs open the Atlas page. Case rows also show the help desk's resolution SLA in calendar hours, the clock the Cases tab and the readout use.`}
      >
        <Figure
          id="services-scorecard"
          uses={m.uses['services-scorecard']}
          metric={FIGURE_METRIC['services-scorecard']}
          span={12}
          title="Service level scorecard"
          subtitle={`${scored.length} Atlas measures with data, ${missed} missed, ${m.window.label}`}
          data={rows}
          columns={scorecardColumns}
          definitions={[D.levelStatus, D.businessDays, D.caseSla, D.txOnTime, ...adaptations]}
          note={asOfNote(
            m.asOf,
            'n = cases or transactions judged',
            'Atlas wording and basis are in the table view and exports',
          )}
          image={false}
          table={{ rowTone: (r) => (r.status ? STATUS_SEVERITY[r.status] : null), maxRows: 20 }}
        >
          <AtlasTable rows={rows} columns={screen} rowKey={(r) => r.id} caption="Service level scorecard" />
        </Figure>
      </Section>

      <Section
        title="Distance to target"
        dek="How far each percentage measure sits from its target, and how quickly each category gets a first reply."
      >
        <Figure
          id="services-gap-to-target"
          uses={m.uses['services-gap-to-target']}
          metric={FIGURE_METRIC['services-gap-to-target']}
          span={7}
          title="Gap to target"
          subtitle={`Actual minus target in points for each Atlas measure, ${per}; below zero misses the target`}
          data={gaps}
          columns={[
            { key: 'processId', label: 'Process ID', href: (r: Row) => processHref(r.processId) },
            { key: 'measure', label: 'Measure' },
            { key: 'target', label: 'Target' },
            { key: 'actual', label: 'Actual', format: 'pct', drill: (r: Row) => level(r, 'actual') },
            { key: 'gap', label: 'Gap to target', format: 'pts', drill: (r: Row) => level(r, 'misses') },
            { key: 'statusText', label: 'Status' },
          ]}
          definitions={[D.levelGap, D.levelStatus]}
          note={asOfNote(
            m.asOf,
            dayRows.length
              ? `${dayRows.map((r) => `${r.processId} (${fmt(r.actual, 'days')} against ${r.target})`).join(', ')} is measured in days and appears in the scorecard only`
              : null,
          )}
          empty={gaps.length ? null : 'No Atlas measure has enough data in this period.'}
        >
          <BarList
            data={gaps}
            label="label"
            value="gap"
            format="pts"
            sort="asc"
            tone={(d) => (d.status ? STATUS_TONE[d.status] : 'deemph')}
            onSelect={(d) => drill(level(d, 'actual'))}
          />
        </Figure>
        <Figure
          id="services-response-by-category"
          uses={m.uses['services-response-by-category']}
          metric={FIGURE_METRIC['services-response-by-category']}
          span={5}
          title="First response SLA by category"
          subtitle={`Cases opened in the ${per} with a first reply inside the category response target, lowest first`}
          data={response}
          columns={[
            { key: 'category', label: 'Category' },
            { key: 'processId', label: 'Atlas process', href: (r: CategoryRow) => processHref(r.processId) },
            {
              key: 'cases',
              label: 'Cases opened',
              format: 'int',
              drill: (r: CategoryRow) =>
                drillWhen(s, r.records, () =>
                  caseDrill(s, r.records, { title: titled('Cases opened', r.category, per), response: true }),
                ),
            },
            { key: 'responseRate', label: 'First response SLA met', format: 'pct', drill: responseCategory },
          ]}
          definitions={[D.responseSla, D.anonymity]}
          note={asOfNote(m.asOf, count(m.summary.response.n, 'case'))}
          empty={
            !m.hasCases
              ? 'Upload HR cases to see this.'
              : !m.caseCols.firstResponseAt
                ? 'Upload HR cases with a first response time to see this.'
                : response.length
                  ? null
                  : `No category has cases from ${k} or more people in this period.`
          }
        >
          <BarList
            data={response}
            label="category"
            value="responseRate"
            format="pct"
            sort="none"
            domain={[0, 1]}
            secondary={(d) => count(d.cases, 'case')}
            onSelect={(d) => drill(responseCategory(d))}
          />
        </Figure>
      </Section>

      <Section
        title="Atlas processes"
        dek="The Hire-to-Retire Atlas process behind every case category and transaction type, with its owner and service level as the Atlas writes them."
      >
        <Figure
          id="services-atlas-processes"
          uses={m.uses['services-atlas-processes']}
          metric={FIGURE_METRIC['services-atlas-processes']}
          span={12}
          title="Processes behind these measures"
          subtitle={`Cases opened and transactions due in the ${per}, by governing process`}
          data={m.processes}
          columns={processColumns}
          definitions={[D.processVolume, D.atlasProcess, D.hiddenCounts]}
          note={asOfNote(m.asOf, `${m.processes.length} processes`)}
          tableOnly
          table={{ maxRows: 20 }}
        />
      </Section>
    </>
  )
}
