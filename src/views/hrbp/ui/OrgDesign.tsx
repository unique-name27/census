import { useState } from 'react'
import { BarList, Columns, Figure } from '@/charts'
import { KpiStrip, Section, Segmented } from '@/components'
import type { Kpi, Severity } from '@/components/types'
import { useAnalytics } from '@/data/context'
import { formatDate } from '@/lib/dates'
import type { HrbpModel } from '../engine'
import { type ManagerFlag, type ManagerRow, SPAN_BUCKETS } from '../engine/org'
import { DEF } from './defs'
import { rescope } from './model'

type ManagerFilter = 'all' | 'wide' | 'light' | 'new'

const FLAG_TONE: Record<ManagerFlag, Severity | null> = {
  Overloaded: 'critical',
  Heavy: 'warning',
  Light: 'info',
  New: 'info',
  Healthy: null,
}

const FILTERS: Record<ManagerFilter, (m: ManagerRow) => boolean> = {
  all: () => true,
  wide: (m) => m.directs >= 9,
  light: (m) => m.directs < 3,
  new: (m) => m.newManager,
}

export function OrgDesign({ m }: { m: HrbpModel }) {
  const ctx = useAnalytics()
  const [filter, setFilter] = useState<ManagerFilter>('all')
  const org = m.org
  const asOf = formatDate(ctx.asOf)
  const managers = org.managers.filter(FILTERS[filter])

  const kpis: Kpi[] = [
    {
      id: 'managers',
      label: 'Managers',
      value: org.managers.length,
      format: 'int',
      note: `${org.activeWorkers.toLocaleString('en-US')} active workers`,
      definition: 'Active people in scope with at least one active direct report.',
    },
    {
      id: 'mean-span',
      label: 'Mean span',
      value: org.meanSpan,
      format: 'num1',
      note: 'Direct reports per manager',
      definition: DEF.span.text,
    },
    {
      id: 'median-span',
      label: 'Median span',
      value: org.medianSpan,
      format: 'num1',
      note: 'Half of managers have more',
      definition: DEF.span.text,
    },
    {
      id: 'manager-ratio',
      label: 'Manager ratio',
      value: org.managerRatio,
      format: 'num1',
      note: 'Individual contributors per manager',
      definition: 'Active workers who manage nobody, divided by the number of managers.',
    },
    {
      id: 'layers',
      label: 'Layers',
      value: org.layers,
      format: 'int',
      note: 'From the top of this scope',
      definition: DEF.layers.text,
    },
  ]

  return (
    <>
      <KpiStrip id="hrbp-org-kpis" title="Org design figures" kpis={kpis} />

      <Section
        title="Spans and layers"
        dek={`How many people each manager leads and how deep each business unit runs, on ${asOf}.`}
      >
        <Figure
          id="hrbp-span-of-control"
          title="Span of control"
          subtitle={`Managers by number of active direct reports, ${asOf}`}
          data={org.spanBuckets}
          columns={[
            { key: 'bucket', label: 'Direct reports', format: 'text' },
            { key: 'managers', label: 'Managers', format: 'int' },
            { key: 'share', label: 'Share', format: 'pct' },
          ]}
          definitions={[DEF.span]}
          note={`${org.managers.length} managers · as of ${asOf}`}
          span={7}
          empty={org.managers.length ? null : 'No managers in this scope.'}
        >
          <Columns
            data={org.spanBuckets}
            x="bucket"
            y="managers"
            xOrder={[...SPAN_BUCKETS]}
            tone={(d) => (d.bucket === '12+' || d.bucket === '1' ? 'warning' : 'default')}
          />
        </Figure>
        <Figure
          id="hrbp-layers-bu"
          title="Layers by business unit"
          subtitle={`Reporting levels inside each business unit, ${asOf}`}
          data={org.layersByBu}
          columns={[
            { key: 'businessUnit', label: 'Business unit', format: 'text' },
            { key: 'layers', label: 'Layers', format: 'int' },
            { key: 'people', label: 'Active workers', format: 'int' },
          ]}
          definitions={[DEF.layers]}
          note={`Counted from each unit's top person · as of ${asOf}`}
          span={5}
          empty={org.layersByBu.length ? null : 'No active workers in this scope.'}
        >
          <BarList
            data={org.layersByBu}
            label="businessUnit"
            value="layers"
            secondary={(d) => `${d.people} people`}
          />
        </Figure>
      </Section>

      <Section
        title="Managers"
        dek="Every manager in scope with team size, total org, tenure and regretted exits. Select a row to focus on that manager's org."
      >
        <Figure
          id="hrbp-managers"
          title="Manager table"
          subtitle={`Managers on ${asOf}, regretted exits over the last 12 months`}
          data={managers}
          columns={[
            { key: 'managerId', label: 'ID', format: 'text' },
            { key: 'name', label: 'Manager', format: 'text' },
            { key: 'jobTitle', label: 'Title', format: 'text' },
            { key: 'department', label: 'Department', format: 'text' },
            { key: 'location', label: 'Location', format: 'text' },
            { key: 'directs', label: 'Directs', format: 'int' },
            { key: 'totalOrg', label: 'Total org', format: 'int' },
            { key: 'tenureMonths', label: 'Tenure (mo)', format: 'int' },
            { key: 'managerSince', label: 'Managing since', format: 'date' },
            { key: 'regretted12', label: 'Regretted exits, 12 mo', format: 'int' },
            { key: 'flag', label: 'Flag', format: 'text' },
          ]}
          definitions={[
            DEF.span,
            { term: 'Total org', text: 'Everyone below the manager, at every level, active today.' },
            DEF.newManager,
            {
              term: 'Flag',
              text: 'Overloaded at 12 or more direct reports, Heavy at 9 to 11, Light under 3, New when managing for under 12 months, otherwise Healthy.',
            },
          ]}
          note={`${managers.length} of ${org.managers.length} managers · as of ${asOf}`}
          actions={
            <Segmented
              label="Show managers"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'wide', label: '9+ reports' },
                { value: 'light', label: 'Under 3' },
                { value: 'new', label: 'New' },
              ]}
            />
          }
          tableOnly
          table={{
            search: 'Search managers',
            maxRows: 15,
            rowTone: (r) => FLAG_TONE[r.flag],
            onRowClick: (r) => rescope(ctx, { leaderId: r.managerId }),
          }}
          empty={managers.length ? null : 'No managers match this filter.'}
        />
        <Figure
          id="hrbp-single-report-chains"
          title="Single-report chains"
          subtitle={`Managers whose only direct report leads 5 or more people, ${asOf}`}
          data={org.chains}
          columns={[
            { key: 'manager', label: 'Manager', format: 'text' },
            { key: 'department', label: 'Department', format: 'text' },
            { key: 'report', label: 'Only direct report', format: 'text' },
            { key: 'reportTitle', label: 'Their title', format: 'text' },
            { key: 'below', label: 'People below them', format: 'int' },
          ]}
          definitions={[
            {
              term: 'Single-report chain',
              text: 'A manager with exactly one active direct report who in turn has 5 or more people below them. The layer adds a step without adding reach.',
            },
          ]}
          note={`${org.chains.length} chains · as of ${asOf}`}
          tableOnly
          table={{ onRowClick: (r) => rescope(ctx, { leaderId: r.managerId }) }}
          empty={org.chains.length ? null : 'No single-report chains in this scope.'}
        />
      </Section>
    </>
  )
}
