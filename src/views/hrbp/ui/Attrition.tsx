import { useState } from 'react'
import { BarList, Columns, Figure, Lines } from '@/charts'
import { Section, Segmented } from '@/components'
import { useAnalytics } from '@/data/context'
import { LEVELS, MIN_GROUP } from '@/data/schema'
import { drill } from '@/drill/Drill'
import { openPerson } from '@/drill/store'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { TENURE_BANDS } from '@/lib/people'
import type { HrbpModel } from '../engine'
import {
  COMPANY_SERIES,
  EXIT_TYPES,
  type GroupRateRow,
  NOT_RATED,
  type QuarterExitRow,
  type RegrettedQuarterRow,
  SCOPE_SERIES,
  type TypedCountRow,
} from '../engine/attrition'
import { isCalendarQuarter, NO_LEAVERS } from '../engine/base'
import {
  groupExitSpec,
  groupOtherSpec,
  managerRegrettedSpec,
  quarterExitSpec,
  reasonSpec,
  regrettedQuarterSpec,
  typedCountSpec,
} from '../engine/buckets'
import { DEF } from './defs'
import { drillWhen } from './drill'

type Dim = 'department' | 'location'
type Measure = 'voluntary' | 'all'

const RATING_ORDER = [
  '5 Far exceeds',
  '4 Exceeds',
  '3 Meets',
  '2 Partially meets',
  '1 Does not meet',
  NOT_RATED,
]

export function Attrition({ m }: { m: HrbpModel }) {
  const ctx = useAnalytics()
  const [dim, setDim] = useState<Dim>('department')
  const [measure, setMeasure] = useState<Measure>('voluntary')
  const a = m.attrition
  const p = m.prep
  const asOf = formatDate(ctx.asOf)
  const window = ctx.window.label
  const left = p.has.terminationDate
  const typed = left && p.has.terminationType
  const noLeavers = `${NO_LEAVERS}.`
  const quarters = a.quarters
  // Quarter ticks ("Q3 '26") match the quarter labels of the chart beside it when the blocks are calendar quarters.
  const calendarQuarters = quarters.length > 0 && isCalendarQuarter({ ...quarters[0], months: 3, label: '' })
  const qRange = quarters.length ? `${formatDate(quarters[0].start)} to ${asOf}` : ''
  const exitsInWindow = m.kpi.all.events
  const groupRows: GroupRateRow[] = dim === 'department' ? a.byDepartment : a.byLocation
  const voluntaryOnly = measure === 'voluntary' && typed
  const rateKey = voluntaryOnly ? 'voluntaryRate' : 'rate'
  const companyRef = voluntaryOnly ? a.company.voluntary : a.company.all
  const groupsWithRate = groupRows.filter((r) => r[rateKey] != null)
  const regrettedRows = a.regrettedByQuarter
  const showRegretted = regrettedRows.length > 0

  // Drills: each mark and count opens the leavers behind it.
  const quarterDrill = (rows: readonly QuarterExitRow[]) => drill(() => quarterExitSpec(p, rows))
  const quarterStart = (r: RegrettedQuarterRow) =>
    quarters.find((q) => q.end === r.quarterEnd)?.start ?? r.quarterEnd
  const regrettedDrill = (r: RegrettedQuarterRow) => regrettedQuarterSpec(p, r, quarterStart(r))
  const typedDrill = (by: 'tenure' | 'rating', rows: readonly TypedCountRow[]) =>
    drill(() => typedCountSpec(p, a, by, rows))
  const typedCell = (by: 'tenure' | 'rating') => (r: TypedCountRow) =>
    drillWhen(r.records.length > 0, () => typedCountSpec(p, a, by, [r]))
  const groupCell = (d: 'department' | 'location' | 'level', vol: boolean) => (r: GroupRateRow) =>
    drillWhen(r.leavers.length > 0, () => groupExitSpec(p, d, r, vol))

  return (
    <>
      <Section
        title="When and how people left"
        dek="Exits by quarter, split by type and annualized so quarters compare with the 12-month rate."
      >
        <Figure
          id="hrbp-attrition-quarter"
          title="Attrition by quarter"
          subtitle={`Annualized exit rate per quarter by termination type, ${qRange}`}
          data={quarters}
          columns={[
            { key: 'quarter', label: 'Quarter', format: 'text' },
            { key: 'start', label: 'From', format: 'date' },
            { key: 'end', label: 'To', format: 'date' },
            { key: 'type', label: 'Exit type', format: 'text' },
            {
              key: 'exits',
              label: 'Exits',
              format: 'int',
              drill: (r) => drillWhen(r.records.length > 0, () => quarterExitSpec(p, [r])),
            },
            { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
            {
              key: 'rate',
              label: 'Annualized rate',
              format: 'pct',
              drill: (r) => drillWhen(r.records.length > 0, () => quarterExitSpec(p, [r])),
            },
          ]}
          definitions={[
            DEF.attrition,
            DEF.avgHeadcount,
            { term: 'Quarter', text: 'Three whole months ending on the date shown; annualized ×4.' },
          ]}
          note={`8 quarters to ${asOf}`}
          span={7}
          empty={
            !left ? noLeavers : quarters.some((q) => q.exits > 0) ? null : 'No exits in the last 8 quarters.'
          }
        >
          <Columns
            data={quarters}
            x="quarter"
            y="rate"
            series="type"
            stack
            seriesOrder={EXIT_TYPES}
            xOrder={[...new Set(quarters.map((q) => q.quarter))]}
            format="pct"
            onSelect={(d) => quarterDrill(quarters.filter((q) => q.quarter === d.quarter))}
            onSelectSegment={(d) => quarterDrill([d])}
          />
        </Figure>
        <Figure
          id="hrbp-regretted-quarter"
          title="Regretted attrition by quarter"
          subtitle={`Annualized regretted exit rate per quarter, ${qRange}${ctx.isCompany ? '' : ', with the company for comparison'}`}
          data={regrettedRows}
          columns={[
            { key: 'quarter', label: 'Quarter', format: 'text' },
            { key: 'quarterEnd', label: 'Quarter end', format: 'date' },
            { key: 'series', label: 'Population', format: 'text' },
            {
              key: 'regretted',
              label: 'Regretted exits',
              format: 'int',
              drill: (r) => drillWhen(r.records.length > 0, () => regrettedDrill(r)),
            },
            { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
            {
              key: 'rate',
              label: 'Annualized rate',
              format: 'pct',
              drill: (r) => drillWhen(r.records.length > 0, () => regrettedDrill(r)),
            },
          ]}
          definitions={[DEF.regretted, DEF.suppressed]}
          note={`8 quarters to ${asOf}`}
          span={5}
          empty={
            showRegretted
              ? null
              : !left
                ? noLeavers
                : typed
                  ? 'Add the Regrettable column to Employees to see this.'
                  : 'Add the Termination type column to Employees to see this.'
          }
        >
          <Lines
            data={regrettedRows}
            x="quarterEnd"
            y="rate"
            series="series"
            seriesOrder={[SCOPE_SERIES, COMPANY_SERIES]}
            emphasize={ctx.isCompany ? undefined : SCOPE_SERIES}
            format="pct"
            zero
            xTicks={calendarQuarters ? 'quarter' : undefined}
            onSelect={(d) => drill(() => regrettedDrill(d))}
          />
        </Figure>
      </Section>

      <Section
        title="Why and where"
        dek={`Reasons given for voluntary exits and the groups where attrition runs highest, ${window}.`}
      >
        <Figure
          id="hrbp-exit-reasons"
          title="Why people left"
          subtitle={`Voluntary exits by reason, ${window}`}
          data={a.reasons}
          columns={[
            { key: 'reason', label: 'Reason', format: 'text' },
            {
              key: 'exits',
              label: 'Voluntary exits',
              format: 'int',
              drill: (r) => drillWhen(r.records.length > 0, () => reasonSpec(p, r)),
            },
            {
              key: 'share',
              label: 'Share',
              format: 'pct',
              drill: (r) => drillWhen(r.records.length > 0, () => reasonSpec(p, r)),
            },
          ]}
          definitions={[
            {
              term: 'Reason',
              text: 'Termination reason from the exit record, using the 12-reason voluntary taxonomy plus Other.',
            },
          ]}
          note={`${a.voluntaryExits} voluntary exits · as of ${asOf}`}
          span={5}
          empty={
            a.reasons.length
              ? null
              : !left
                ? noLeavers
                : p.has.terminationReason
                  ? 'No voluntary exits with a reason in this period.'
                  : 'Add the Termination reason column to Employees to see this.'
          }
        >
          <BarList
            data={a.reasons}
            label="reason"
            value="exits"
            secondary={(d) => fmt(d.share, 'pct0')}
            onSelect={(d) => drill(() => reasonSpec(p, d))}
          />
        </Figure>
        <Figure
          id={`hrbp-attrition-${dim}`}
          title={`${voluntaryOnly ? 'Voluntary attrition' : 'Attrition'} by ${dim}`}
          subtitle={`Annualized exits ÷ average headcount, ${window}, groups under ${MIN_GROUP} hidden`}
          data={groupRows}
          columns={[
            { key: 'group', label: dim === 'department' ? 'Department' : 'Location', format: 'text' },
            { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
            { key: 'exits', label: 'All exits', format: 'int', drill: groupCell(dim, false) },
            { key: 'voluntary', label: 'Voluntary exits', format: 'int', drill: groupCell(dim, true) },
            { key: 'rate', label: 'Attrition', format: 'pct', drill: groupCell(dim, false) },
            {
              key: 'voluntaryRate',
              label: 'Voluntary attrition',
              format: 'pct',
              drill: groupCell(dim, true),
            },
          ]}
          definitions={[
            DEF.attrition,
            DEF.voluntary,
            ...(dim === 'department'
              ? [
                  {
                    term: 'Department',
                    text: 'Each person counts in the department they were in at each month end, rebuilt from transfers in Job changes; leavers count in the department they left from.',
                  },
                ]
              : []),
            DEF.suppressed,
          ]}
          note={`Line at the company rate, ${fmt(companyRef, 'pct')} · select a bar to see its leavers`}
          span={7}
          actions={
            // Capped width so the two toggles wrap under each other on a phone instead of widening the page.
            <div className="flex max-w-[calc(100vw-10rem)] flex-wrap justify-end gap-2">
              <Segmented
                label="Measure"
                value={measure}
                onChange={setMeasure}
                options={[
                  { value: 'voluntary', label: 'Voluntary' },
                  { value: 'all', label: 'All exits' },
                ]}
              />
              <Segmented
                label="Group by"
                value={dim}
                onChange={setDim}
                options={[
                  { value: 'department', label: 'Department' },
                  { value: 'location', label: 'Location' },
                ]}
              />
            </div>
          }
          empty={
            !left
              ? noLeavers
              : groupsWithRate.length
                ? null
                : `No ${dim} has 5 or more employees in this period.`
          }
        >
          <BarList
            data={groupRows}
            label="group"
            value={rateKey}
            format="pct"
            top={14}
            other={(rest) => {
              const hc = rest.reduce((s, r) => s + r.avgHeadcount, 0)
              const ev = rest.reduce((s, r) => s + (rateKey === 'voluntaryRate' ? r.voluntary : r.exits), 0)
              return hc >= MIN_GROUP ? (ev / hc) * (12 / ctx.window.months) : null
            }}
            ref={
              companyRef != null
                ? { value: companyRef, label: `Company ${fmt(companyRef, 'pct')}` }
                : undefined
            }
            tone={(d) => {
              const v = d[rateKey]
              return v != null && companyRef != null && v - companyRef >= 0.03 && d.avgHeadcount >= 10
                ? 'critical'
                : 'default'
            }}
            secondary={(d) =>
              `${rateKey === 'voluntaryRate' ? d.voluntary : d.exits} of ${Math.round(d.avgHeadcount)}`
            }
            onSelect={(d) => drill(() => groupExitSpec(p, dim, d, voluntaryOnly))}
            onSelectOther={(rows) => drill(() => groupOtherSpec(p, a, dim, rows, voluntaryOnly))}
          />
        </Figure>
      </Section>

      <Section
        title="Who left"
        dek={`Exits ${window} by tenure, level and last performance rating, and the regretted leavers by name.`}
      >
        <Figure
          id="hrbp-exits-tenure"
          title="Exits by tenure at exit"
          subtitle={`Employee exits by years of service when they left, ${window}`}
          data={a.byTenure}
          columns={[
            { key: 'group', label: 'Tenure at exit', format: 'text' },
            { key: 'type', label: 'Exit type', format: 'text' },
            { key: 'exits', label: 'Exits', format: 'int', drill: typedCell('tenure') },
          ]}
          definitions={[{ term: 'Tenure at exit', text: 'Years from hire date to termination date.' }]}
          note={`${exitsInWindow} exits · as of ${asOf}`}
          span={4}
          empty={!left ? noLeavers : exitsInWindow ? null : 'No exits in this period.'}
        >
          <Columns
            data={a.byTenure}
            x="group"
            y="exits"
            series="type"
            stack
            seriesOrder={EXIT_TYPES}
            xOrder={[...TENURE_BANDS]}
            height={220}
            onSelect={(d) =>
              typedDrill(
                'tenure',
                a.byTenure.filter((r) => r.group === d.group),
              )
            }
            onSelectSegment={(d) => typedDrill('tenure', [d])}
          />
        </Figure>
        <Figure
          id="hrbp-attrition-level"
          title="Attrition by level"
          subtitle={`Annualized exits ÷ average headcount at each level, ${window}`}
          data={a.byLevel}
          columns={[
            { key: 'group', label: 'Level', format: 'text' },
            { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
            { key: 'exits', label: 'Exits', format: 'int', drill: groupCell('level', false) },
            { key: 'rate', label: 'Attrition', format: 'pct', drill: groupCell('level', false) },
            {
              key: 'voluntaryRate',
              label: 'Voluntary attrition',
              format: 'pct',
              drill: groupCell('level', true),
            },
          ]}
          definitions={[
            DEF.attrition,
            {
              term: 'Level',
              text: 'Level held on each snapshot date, rebuilt from Job changes; leavers count at their level when they left.',
            },
            DEF.suppressed,
          ]}
          note={`Groups under ${MIN_GROUP} hidden · as of ${asOf}`}
          span={4}
          empty={
            !left
              ? noLeavers
              : a.byLevel.some((r) => r.rate != null)
                ? null
                : 'No level has 5 or more employees in this period.'
          }
        >
          <Columns
            data={a.byLevel}
            x="group"
            y="rate"
            format="pct"
            xOrder={[...LEVELS]}
            height={220}
            onSelect={(d) => drill(() => groupExitSpec(p, 'level', d, false))}
          />
        </Figure>
        <Figure
          id="hrbp-exits-rating"
          title="Exits by last rating"
          subtitle={`Employee exits by their last performance rating before leaving, ${window}`}
          data={a.byRating}
          columns={[
            { key: 'group', label: 'Last rating', format: 'text' },
            { key: 'type', label: 'Exit type', format: 'text' },
            { key: 'exits', label: 'Exits', format: 'int', drill: typedCell('rating') },
          ]}
          definitions={[
            {
              term: 'Last rating',
              text: 'The final rating from the most recent review cycle that closed on or before the exit date.',
            },
          ]}
          note={`${exitsInWindow} exits · as of ${asOf}`}
          span={4}
          empty={
            !left
              ? noLeavers
              : !p.has.reviews
                ? 'Upload Reviews to see this.'
                : exitsInWindow
                  ? null
                  : 'No exits in this period.'
          }
        >
          <Columns
            data={a.byRating}
            x="group"
            y="exits"
            series="type"
            stack
            seriesOrder={EXIT_TYPES}
            xOrder={RATING_ORDER}
            height={220}
            onSelect={(d) =>
              typedDrill(
                'rating',
                a.byRating.filter((r) => r.group === d.group),
              )
            }
            onSelectSegment={(d) => typedDrill('rating', [d])}
          />
        </Figure>
        <Figure
          id="hrbp-regretted-leavers"
          title="Regretted leavers"
          subtitle={`Voluntary exits marked regrettable, ${window}, newest first. Select a row to open the person.`}
          data={a.regrettedLeavers}
          columns={[
            { key: 'employeeId', label: 'ID', format: 'text' },
            { key: 'name', label: 'Name', format: 'text' },
            { key: 'department', label: 'Department', format: 'text' },
            { key: 'location', label: 'Location', format: 'text' },
            { key: 'level', label: 'Level', format: 'text' },
            {
              key: 'manager',
              label: 'Manager',
              format: 'text',
              // The manager opens every regretted leaver from their team.
              drill: (r) => drillWhen(!!r.managerId, () => managerRegrettedSpec(p, a, r.managerId)),
            },
            { key: 'exitDate', label: 'Exit date', format: 'date' },
            { key: 'reason', label: 'Reason', format: 'text' },
            { key: 'lastRating', label: 'Last rating', format: 'int' },
            { key: 'tenure', label: 'Tenure', format: 'years' },
          ]}
          definitions={[DEF.regretted]}
          note={`${a.regrettedLeavers.length} regretted leavers · as of ${asOf}`}
          tableOnly
          table={{
            search: 'Search leavers',
            maxRows: 12,
            onRowClick: (r) => openPerson(r.employeeId),
          }}
          empty={
            a.regrettedLeavers.length
              ? null
              : !left
                ? noLeavers
                : p.has.regrettable
                  ? 'No regretted exits in this period.'
                  : 'Add the Regrettable column to Employees to see this.'
          }
        />
      </Section>
    </>
  )
}
