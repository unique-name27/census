import { useState } from 'react'
import { BarList, Columns, Figure } from '@/charts'
import { KpiStrip, Section, Segmented } from '@/components'
import type { Severity } from '@/components/types'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { formatDate } from '@/lib/dates'
import type { HrbpModel } from '../engine'
import {
  chainBelowSpec,
  layerBuSpec,
  type ManagerCell,
  managerCellSpec,
  spanBucketSpec,
} from '../engine/buckets'
import { FIGURE } from '../engine/lineage'
import { type ManagerFlag, type ManagerRow, SPAN_BUCKETS } from '../engine/org'
import { DEF } from './defs'
import { drillWhen } from './drill'
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
  const p = m.prep
  const asOf = formatDate(ctx.asOf)
  const managers = org.managers.filter(FILTERS[filter])
  const managerCell = (cell: ManagerCell, count: (r: ManagerRow) => number) => (r: ManagerRow) =>
    drillWhen(count(r) > 0, () => managerCellSpec(p, org, r, cell))

  return (
    <>
      <KpiStrip id="hrbp-org-kpis" title="Org design figures" kpis={m.orgKpis} />

      <Section
        title="Spans and layers"
        dek={`How many people each manager leads and how deep each business unit runs, on ${asOf}.`}
      >
        <Figure
          id="hrbp-span-of-control"
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
            onSelect={(d) => drill(() => spanBucketSpec(p, d))}
          />
        </Figure>
        <Figure
          id="hrbp-layers-bu"
          uses={p.uses(FIGURE.layersByBusinessUnit)}
          title="Layers by business unit"
          subtitle={`Reporting levels inside each business unit, ${asOf}`}
          data={org.layersByBu}
          columns={[
            { key: 'businessUnit', label: 'Business unit', format: 'text' },
            {
              key: 'layers',
              label: 'Layers',
              format: 'int',
              drill: (r) => drillWhen(r.records.length > 0, () => layerBuSpec(p, org, r)),
            },
            {
              key: 'people',
              label: 'Active workers',
              format: 'int',
              drill: (r) => drillWhen(r.records.length > 0, () => layerBuSpec(p, org, r)),
            },
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
            onSelect={(d) => drill(() => layerBuSpec(p, org, d))}
          />
        </Figure>
      </Section>

      <Section
        title="Managers"
        dek="Every manager in scope with team size, total org, tenure and regretted exits. Select a row to focus on that manager's org."
      >
        <Figure
          id="hrbp-managers"
          uses={p.uses(FIGURE.managers)}
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
          definitions={[
            DEF.span,
            { term: 'Total org', text: 'Everyone below the manager, at every level, active today.' },
            DEF.newManager,
            {
              term: 'Flag',
              text: 'Overloaded at 12 or more direct reports, Heavy at 9 to 11, Light under 3, New when managing for under 12 months, otherwise Healthy. Executives (E levels) lead leadership teams and are flagged only when new.',
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
          uses={p.uses(FIGURE.singleReportChains)}
          title="Single-report chains"
          subtitle={`Managers whose only direct report leads 5 or more people, ${asOf}`}
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
