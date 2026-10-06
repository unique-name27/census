import { useState } from 'react'
import { BarList, Columns, Figure } from '@/charts'
import { KpiStrip, Section, Segmented } from '@/components'
import type { Severity } from '@/components/types'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { formatDate } from '@/lib/dates'
import { LinkedSurvey } from '@/views/listening/LinkedSurvey'
import type { HrbpModel } from '../engine'
import { chainBelowSpec, type ManagerCell, spanBucketSpec } from '../engine/buckets'
import { FIGURE } from '../engine/lineage'
import { type ManagerFlag, type ManagerRow, type OrgModel, SPAN_BUCKETS } from '../engine/org'
import { ID } from './defs'
import { drillWhen, layerDrill, managerDrill } from './drill'
import { rescope } from './model'

type ManagerFilter = 'all' | 'wide' | 'light' | 'new'

const FLAG_TONE: Record<ManagerFlag, Severity | null> = {
  Overloaded: 'critical',
  Heavy: 'warning',
  Light: 'info',
  New: 'info',
  Healthy: null,
}

/** The manager table filters, at the flag thresholds in force (Heavy and Light). */
const filtersOf = (flags: OrgModel['flags']): Record<ManagerFilter, (m: ManagerRow) => boolean> => ({
  all: () => true,
  wide: (m) => m.directs >= flags.heavy,
  light: (m) => m.directs < flags.light,
  new: (m) => m.newManager,
})

export function OrgDesign({ m }: { m: HrbpModel }) {
  const ctx = useAnalytics()
  const [filter, setFilter] = useState<ManagerFilter>('all')
  const org = m.org
  const p = m.prep
  const asOf = formatDate(ctx.asOf)
  const managers = org.managers.filter(filtersOf(org.flags)[filter])
  // A manager's total org sets their org as the filter; the business unit's layers set the unit.
  const managerCell = (cell: ManagerCell, count: (r: ManagerRow) => number) =>
    managerDrill(p, org, cell, count)
  const layerCell = layerDrill(p, org)

  return (
    <>
      <KpiStrip id="hrbp-org-kpis" title="Org design figures" kpis={m.orgKpis} />

      <Section
        title="Spans and layers"
        dek={`How many people each manager leads and how deep each business unit runs, on ${asOf}.`}
      >
        <Figure
          id="hrbp-span-of-control"
          metric={ID.span}
          uses={p.uses(FIGURE.spanOfControl)}
          title="Span of control"
          subtitle={`Managers by number of active direct reports, ${asOf}`}
          data={org.spanBuckets}
          columns={[
            { key: 'bucket', label: 'Direct reports', format: 'text' },
            {
              key: 'managers',
              label: 'Managers',
              format: 'int',
              drill: (r) => drillWhen(r.records.length > 0, () => spanBucketSpec(p, r)),
            },
            {
              key: 'share',
              label: 'Share',
              format: 'pct',
              drill: (r) => drillWhen(r.records.length > 0, () => spanBucketSpec(p, r)),
            },
          ]}
          definitions={p.defs(ID.span, ID.spanOutliers)}
          note={`${org.managers.length} managers · as of ${asOf}`}
          span={7}
          empty={org.managers.length ? null : 'No managers in this scope.'}
        >
          <Columns
            data={org.spanBuckets}
            x="bucket"
            y="managers"
            xOrder={[...SPAN_BUCKETS]}
            tone={(d) => (d.outlier ? 'warning' : 'default')}
            onSelect={(d) => drill(() => spanBucketSpec(p, d))}
          />
        </Figure>
        <Figure
          id="hrbp-layers-bu"
          metric={ID.layers}
          uses={p.uses(FIGURE.layersByBusinessUnit)}
          title="Layers by business unit"
          subtitle={`Reporting levels inside each business unit, ${asOf}`}
          data={org.layersByBu}
          columns={[
            { key: 'businessUnit', label: 'Business unit', format: 'text' },
            { key: 'layers', label: 'Layers', format: 'int', drill: layerCell },
            { key: 'people', label: 'Active workers', format: 'int', drill: layerCell },
          ]}
          definitions={p.defs(ID.layers)}
          note={`Counted from each unit's top person · as of ${asOf}`}
          span={5}
          empty={org.layersByBu.length ? null : 'No active workers in this scope.'}
        >
          <BarList
            data={org.layersByBu}
            label="businessUnit"
            value="layers"
            secondary={(d) => `${d.people} people`}
            onSelect={(d) => drill(layerCell(d))}
          />
        </Figure>
      </Section>

      <Section
        title="Managers"
        dek="Every manager in scope with team size, total org, tenure and regretted exits. Select a row to focus on that manager's org."
      >
        <Figure
          id="hrbp-managers"
          metric={ID.managerFlag}
          uses={p.uses(FIGURE.managers(p.set.regretted))}
          title="Manager table"
          subtitle={`Managers on ${asOf}, regretted exits over the last 12 months`}
          data={managers}
          columns={[
            { key: 'managerId', label: 'ID', format: 'text' },
            { key: 'name', label: 'Manager', format: 'text' },
            { key: 'jobTitle', label: 'Title', format: 'text' },
            { key: 'department', label: 'Department', format: 'text' },
            { key: 'location', label: 'Location', format: 'text' },
            {
              key: 'directs',
              label: 'Directs',
              format: 'int',
              drill: managerCell('directs', (r) => r.directs),
            },
            {
              key: 'totalOrg',
              label: 'Total org',
              format: 'int',
              drill: managerCell('totalOrg', (r) => r.totalOrg),
            },
            { key: 'tenureMonths', label: 'Tenure (mo)', format: 'int' },
            { key: 'managerSince', label: 'Managing since', format: 'date' },
            {
              key: 'regretted12',
              label: 'Regretted exits, 12 mo',
              format: 'int',
              drill: managerCell('regretted12', (r) => r.regretted12),
            },
            { key: 'flag', label: 'Flag', format: 'text' },
          ]}
          definitions={p.defs(ID.span, ID.totalOrg, ID.newManager, ID.managerFlag)}
          note={`${managers.length} of ${org.managers.length} managers · as of ${asOf}`}
          actions={
            <Segmented
              label="Show managers"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'wide', label: `${org.flags.heavy}+ reports` },
                { value: 'light', label: `Under ${org.flags.light}` },
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
          metric={ID.chains}
          uses={p.uses(FIGURE.singleReportChains)}
          title="Single-report chains"
          subtitle={`Managers whose only direct report leads ${p.set.chainMinBelow} or more people, ${asOf}`}
          data={org.chains}
          columns={[
            { key: 'manager', label: 'Manager', format: 'text' },
            { key: 'department', label: 'Department', format: 'text' },
            { key: 'report', label: 'Only direct report', format: 'text' },
            { key: 'reportTitle', label: 'Their title', format: 'text' },
            {
              key: 'below',
              label: 'People below them',
              format: 'int',
              drill: (r) => drillWhen(r.below > 0, () => chainBelowSpec(p, org, r)),
            },
          ]}
          definitions={p.defs(ID.chains)}
          note={`${org.chains.length} chains · as of ${asOf}`}
          tableOnly
          table={{ onRowClick: (r) => rescope(ctx, { leaderId: r.managerId }) }}
          empty={org.chains.length ? null : 'No single-report chains in this scope.'}
        />
      </Section>

      <LinkedSurvey
        survey="Manager feedback"
        id="hrbp-manager-feedback"
        title="What teams say about their managers"
        dek="One number from upward manager feedback, across every manager in scope. Results for one manager show in Listening only with 10 or more respondents over four quarters."
      />
    </>
  )
}
