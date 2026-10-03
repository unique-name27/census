import { BarList, Figure } from '@/charts'
import { Section } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { fmt } from '@/lib/format'
import type { ServicesModel } from '../engine'
import { ATLAS_PROCESSES, SERVICE_LEVELS } from '../engine/catalog'
import type { LevelRow } from '../engine/levels'
import { asOfNote, count, DEF, period, STATUS_SEVERITY, STATUS_TONE } from './shared'

const actualText = (r: LevelRow) => fmt(r.actual, r.unit === 'days' ? 'days' : 'pct')

function gapText(r: LevelRow): string {
  if (r.gap == null) return '—'
  if (r.unit === 'days') return `${r.gap >= 0 ? '+' : '−'}${fmt(Math.abs(r.gap), 'days')}`
  return fmt(r.gap, 'pts')
}

const STATUS_DEF = {
  term: 'Status',
  text: 'Met when the actual reaches the target. At risk when it is within 5 pts of a percentage target, or within 10% of a day target. Missed otherwise. Fewer than 5 cases or transactions give no status.',
}

const BUSINESS_DAYS_DEF = {
  term: 'Business days',
  text: 'Monday to Friday from the opened date to the resolved (or first response) date, with no holiday calendar. A case still open past the clock counts as missed.',
  formula: 'business days(opened, resolved) ≤ target',
}

export function LevelsTab({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const per = period(ctx)
  const rows = m.levels.map((r) => ({
    ...r,
    actualText: actualText(r),
    gapText: gapText(r),
    statusText: r.status ?? 'No data',
  }))
  const scored = m.levels.filter((r) => r.status != null)
  const missed = scored.filter((r) => r.status === 'Missed').length
  const gaps = m.levels
    .filter((r) => r.unit === 'share' && r.gap != null)
    .map((r) => ({
      label: `${r.processId} ${ATLAS_PROCESSES.get(r.processId)?.short ?? ''}`.trim(),
      processId: r.processId,
      measure: r.measure,
      target: r.target,
      actual: r.actual,
      gap: r.gap,
      status: r.status,
    }))
  const dayRows = m.levels.filter((r) => r.unit === 'days')
  const adaptations = SERVICE_LEVELS.filter((d) => d.adaptation).map((d) => ({
    term: `${d.processId} ${d.measure}`,
    text: d.adaptation as string,
  }))
  const response = m.categories
    .filter((c) => !c.category.startsWith('Other ('))
    .slice()
    .sort((a, b) => (a.responseRate ?? 2) - (b.responseRate ?? 2))

  return (
    <>
      <Section
        title="Scorecard"
        dek={`Each row is a measurable KPI from the Hire-to-Retire Atlas, scored on the ${per}. The Atlas column quotes the KPI or service level the row tracks.`}
      >
        <Figure
          id="services-scorecard"
          span={12}
          title="Service level scorecard"
          subtitle={`${scored.length} Atlas measures with data, ${missed} missed, ${m.window.label}`}
          data={rows}
          columns={[
            { key: 'processId', label: 'Process ID' },
            { key: 'process', label: 'Process' },
            { key: 'measure', label: 'Measure' },
            { key: 'target', label: 'Target' },
            { key: 'actualText', label: 'Actual', align: 'right' },
            { key: 'gapText', label: 'Gap to target', align: 'right' },
            { key: 'statusText', label: 'Status' },
            { key: 'n', label: 'n', format: 'int' },
            { key: 'window', label: 'Window' },
            { key: 'atlas', label: 'Atlas wording' },
            { key: 'basis', label: 'Basis' },
          ]}
          definitions={[STATUS_DEF, BUSINESS_DAYS_DEF, DEF.onTime, ...adaptations]}
          note={asOfNote(m.asOf, 'Atlas process library and KPI targets', 'n = cases or transactions judged')}
          tableOnly
          table={{
            rowTone: (r) => (r.status ? STATUS_SEVERITY[r.status] : null),
            maxRows: 20,
          }}
        />
      </Section>

      <Section
        title="Distance to target"
        dek="How far each percentage measure sits from its target, and how quickly each category gets a first reply."
      >
        <Figure
          id="services-gap-to-target"
          span={7}
          title="Gap to target"
          subtitle={`Actual minus target in points for each Atlas measure, ${per}; below zero misses the target`}
          data={gaps}
          columns={[
            { key: 'processId', label: 'Process ID' },
            { key: 'measure', label: 'Measure' },
            { key: 'target', label: 'Target' },
            { key: 'actual', label: 'Actual', format: 'pct' },
            { key: 'gap', label: 'Gap to target', format: 'pts' },
            { key: 'status', label: 'Status' },
          ]}
          definitions={[
            {
              term: 'Gap to target',
              text: 'Actual minus target for "at least" targets, target minus actual for "under" targets, so a positive gap is always better.',
              formula: 'actual − target',
            },
            STATUS_DEF,
          ]}
          note={asOfNote(
            m.asOf,
            dayRows.length
              ? `${dayRows.map((r) => `${r.processId} (${actualText(r)} against ${r.target})`).join(', ')} is measured in days and appears in the scorecard only`
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
          />
        </Figure>
        <Figure
          id="services-response-by-category"
          span={5}
          title="First response SLA by category"
          subtitle={`Cases opened in the ${per} with a first reply inside the category response target, lowest first`}
          data={response}
          columns={[
            { key: 'category', label: 'Category' },
            { key: 'processId', label: 'Atlas process' },
            { key: 'cases', label: 'Cases opened', format: 'int' },
            { key: 'responseRate', label: 'First response SLA met', format: 'pct' },
          ]}
          definitions={[DEF.responseSla, DEF.anonymity]}
          note={asOfNote(m.asOf, count(m.summary.response.n, 'case'))}
          empty={
            !m.hasCases
              ? 'Upload HR cases to see this.'
              : m.caseCols.firstResponseAt
                ? null
                : 'Upload HR cases with a first response time to see this.'
          }
        >
          <BarList
            data={response}
            label="category"
            value="responseRate"
            format="pct"
            sort="none"
            domain={[0, 1]}
            secondary={(d) => `n = ${fmt(d.cases, 'int')}`}
          />
        </Figure>
      </Section>

      <Section
        title="Atlas processes"
        dek="The Hire-to-Retire Atlas process behind every case category and transaction type, with its owner and service level as the Atlas writes them."
      >
        <Figure
          id="services-atlas-processes"
          span={12}
          title="Processes behind these measures"
          subtitle={`Cases opened and transactions due in the ${per}, by governing process`}
          data={m.processes}
          columns={[
            { key: 'processId', label: 'Process ID' },
            { key: 'process', label: 'Process' },
            { key: 'owner', label: 'Accountable' },
            { key: 'covers', label: 'Covers' },
            { key: 'cases', label: 'Cases', format: 'int' },
            { key: 'transactions', label: 'Transactions', format: 'int' },
            { key: 'sla', label: 'Atlas service level' },
          ]}
          definitions={[
            {
              term: 'Atlas process',
              text: 'Each case category and transaction type maps to one process in the Hire-to-Retire Atlas. Uploaded cases keep their own process ID when they carry one.',
            },
          ]}
          note={asOfNote(m.asOf, `${m.processes.length} processes`)}
          tableOnly
          table={{ maxRows: 20 }}
        />
      </Section>
    </>
  )
}
