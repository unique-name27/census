import { useState } from 'react'
import { BarList, type Column, Columns, Figure, HBars } from '@/charts'
import { Section, Segmented } from '@/components'
import { useAnalytics } from '@/data/context'
import { LEVELS } from '@/data/schema'
import { Drill, drill } from '@/drill/Drill'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { TENURE_BANDS } from '@/lib/people'
import type { HrbpModel } from '../engine'
import { NO_HISTORY, type Prep } from '../engine/base'
import {
  type CountDim,
  countOtherSpec,
  countSpec,
  engineeringSpec,
  type GrowthCell,
  growthCellSpec,
  mixGroupSpec,
  mixSpec,
} from '../engine/buckets'
import { FIGURE } from '../engine/lineage'
import { CONTINGENT, type CountRow, type GrowthRow } from '../engine/workforce'
import { DEF } from './defs'
import { drillWhen } from './drill'
import { EngineeringStat } from './EngineeringStat'

/** Group, employees (each count opens the people) and share, for a headcount breakdown. */
function countCols(p: Prep, dim: CountDim, label: string): Column<CountRow>[] {
  return [
    { key: 'label', label, format: 'text' },
    {
      key: 'headcount',
      label: 'Employees',
      format: 'int',
      drill: (r) => drillWhen(r.records.length > 0, () => countSpec(p, dim, r)),
    },
    {
      key: 'share',
      label: 'Share',
      format: 'pct',
      drill: (r) => drillWhen(r.records.length > 0, () => countSpec(p, dim, r)),
    },
  ]
}

/** Departments shown before the rest fold into "Other". Above the sample's 22, so every department shows. */
const DEPARTMENTS_SHOWN = 25
/** The engineering share reference tick: the middle of a common reference range of 60 to 70%. */
const ENGINEERING_REFERENCE = 0.65

type MixDim = 'location' | 'businessUnit'

export function Workforce({ m }: { m: HrbpModel }) {
  const ctx = useAnalytics()
  const [mixDim, setMixDim] = useState<MixDim>('location')
  const p = m.prep
  const asOf = formatDate(ctx.asOf)
  const wf = m.workforce
  const n = wf.headcount
  const note = `${n.toLocaleString('en-US')} employees · as of ${asOf}`
  const none = n ? null : 'No active employees in this scope.'
  const eng = wf.engineering
  const growthBy = new Set(wf.byBusinessUnit.map((r) => r.label)).size > 1 ? 'business unit' : 'department'
  const departments = wf.byDepartment.length
  const mixRows = wf.mix[mixDim]
  const contingentRows = mixRows.filter((r) => (CONTINGENT as readonly string[]).includes(r.workerType))
  const contingentBy = new Map<string, number>()
  for (const r of contingentRows) contingentBy.set(r.group, (contingentBy.get(r.group) ?? 0) + r.people)
  const withContingent = [...contingentBy.values()].filter((v) => v > 0).length
  const contingentTotal = [...contingentBy.values()].reduce((a, v) => a + v, 0)
  const mixGroups = new Set(mixRows.map((r) => r.group)).size
  const mixNoun = mixDim === 'location' ? ['site', 'sites'] : ['business unit', 'business units']
  const growthCell = (cell: GrowthCell) => (r: GrowthRow) => {
    const has =
      cell === 'yearAgo'
        ? r.records.before.length > 0
        : cell === 'now'
          ? r.records.now.length > 0
          : r.records.joined.length + r.records.left.length > 0
    return drillWhen(has, () => growthCellSpec(p, r, cell))
  }
  const [engRow, otherRow] = eng.rows

  return (
    <>
      <Section
        title="Where people are"
        dek={`Active employees on ${asOf} by department, site, level and tenure. Contractors and interns appear in their own chart only.`}
      >
        <Figure
          id="hrbp-hc-department"
          uses={p.uses(FIGURE.byDepartment)}
          title="Headcount by department"
          subtitle={`Employees on ${asOf}${departments > DEPARTMENTS_SHOWN ? `, largest ${DEPARTMENTS_SHOWN} departments` : ''}`}
          data={wf.byDepartment}
          columns={countCols(p, 'department', 'Department')}
          definitions={[DEF.headcount]}
          note={`${note} · ${departments} departments`}
          span={6}
          empty={none}
        >
          <BarList
            data={wf.byDepartment}
            label="label"
            value="headcount"
            top={DEPARTMENTS_SHOWN}
            secondary={(d) => fmt(d.share, 'pct0')}
            onSelect={(d) => drill(() => countSpec(p, 'department', d))}
            onSelectOther={(rows) => drill(() => countOtherSpec(p, 'department', rows))}
          />
        </Figure>
        <div className="col-span-full flex min-w-0 flex-col gap-4 md:col-span-6">
          <Figure
            id="hrbp-hc-location"
            uses={p.uses(FIGURE.byLocation)}
            title="Headcount by location"
            subtitle={`Employees on ${asOf} by work site`}
            data={wf.byLocation}
            columns={countCols(p, 'location', 'Location')}
            definitions={[DEF.headcount]}
            note={note}
            empty={none}
          >
            <BarList
              data={wf.byLocation}
              label="label"
              value="headcount"
              top={12}
              secondary={(d) => fmt(d.share, 'pct0')}
              onSelect={(d) => drill(() => countSpec(p, 'location', d))}
              onSelectOther={(rows) => drill(() => countOtherSpec(p, 'location', rows))}
            />
          </Figure>
          <Figure
            id="hrbp-hc-level"
            uses={p.uses(FIGURE.byLevel)}
            title="Headcount by level"
            subtitle={`Employees on ${asOf}, L1 to E3`}
            data={wf.byLevel}
            columns={countCols(p, 'level', 'Level')}
            definitions={[
              DEF.headcount,
              {
                term: 'Levels',
                text: 'L1 to L6 are individual levels, M1 and M2 manager and director, E1 to E3 executive.',
              },
            ]}
            note={note}
            empty={none}
          >
            <Columns
              data={wf.byLevel}
              x="label"
              y="headcount"
              xOrder={[...LEVELS]}
              height={200}
              onSelect={(d) => drill(() => countSpec(p, 'level', d))}
            />
          </Figure>
        </div>
        <Figure
          id="hrbp-tenure"
          uses={p.uses(FIGURE.tenure)}
          title="Tenure"
          subtitle={`Employees on ${asOf} by years since hire`}
          data={wf.tenure}
          columns={countCols(p, 'tenure', 'Tenure')}
          definitions={[
            { term: 'Tenure', text: 'Years from hire date to the as-of date (365.25 days a year).' },
          ]}
          note={`${note}${wf.avgTenure != null ? ` · average ${fmt(wf.avgTenure, 'years')}` : ''}`}
          span={5}
          empty={none}
        >
          <Columns
            data={wf.tenure}
            x="label"
            y="headcount"
            xOrder={[...TENURE_BANDS]}
            height={300}
            onSelect={(d) => drill(() => countSpec(p, 'tenure', d))}
          />
        </Figure>
        <Figure
          id="hrbp-worker-mix"
          uses={p.uses(FIGURE.workerMix(mixDim))}
          title="Contractors and interns"
          subtitle={`Active contractors and interns on ${asOf} by ${mixDim === 'location' ? 'site' : 'business unit'}`}
          data={mixRows}
          columns={[
            { key: 'group', label: mixDim === 'location' ? 'Location' : 'Business unit', format: 'text' },
            { key: 'workerType', label: 'Worker type', format: 'text' },
            {
              key: 'people',
              label: 'People',
              format: 'int',
              drill: (r) => drillWhen(r.records.length > 0, () => mixSpec(p, r)),
            },
            {
              key: 'share',
              label: mixDim === 'location' ? 'Share of site' : 'Share of unit',
              format: 'pct',
              drill: (r) => drillWhen(r.records.length > 0, () => mixSpec(p, r)),
            },
          ]}
          definitions={[
            {
              term: 'Worker type',
              text: 'Employment type on the roster. Only employees count in headcount and rates; the table also lists employees so each group’s mix is complete.',
            },
          ]}
          note={`${contingentTotal.toLocaleString('en-US')} contractors and interns in ${withContingent} of ${mixGroups} ${
            mixGroups === 1 ? mixNoun[0] : mixNoun[1]
          } · as of ${asOf}`}
          span={7}
          actions={
            <Segmented
              label="Group by"
              value={mixDim}
              onChange={setMixDim}
              options={[
                { value: 'location', label: 'Site' },
                { value: 'businessUnit', label: 'Business unit' },
              ]}
            />
          }
          empty={contingentTotal ? null : 'No active contractors or interns in this scope.'}
        >
          <HBars
            data={contingentRows.filter((r) => (contingentBy.get(r.group) ?? 0) > 0)}
            y="group"
            x="people"
            series="workerType"
            stack
            seriesOrder={CONTINGENT}
            onSelect={(d) => drill(() => mixGroupSpec(p, contingentRows, d.group))}
            onSelectSegment={(d) => drill(() => mixSpec(p, d))}
          />
        </Figure>
      </Section>

      <Section
        title="How the workforce is changing"
        dek="Growth over the last 12 months and how much of the workforce is in engineering."
      >
        <Figure
          id="hrbp-growth"
          uses={p.uses(FIGURE.growth(growthBy === 'department' ? 'department' : 'businessUnit'))}
          title={`Growth by ${growthBy}`}
          subtitle={`Change in employees from 12 months ago to ${asOf}`}
          data={wf.growth}
          columns={[
            {
              key: 'group',
              label: growthBy === 'department' ? 'Department' : 'Business unit',
              format: 'text',
            },
            { key: 'yearAgo', label: '12 months ago', format: 'int', drill: growthCell('yearAgo') },
            { key: 'now', label: 'Today', format: 'int', drill: growthCell('now') },
            { key: 'change', label: 'Change', format: 'int', drill: growthCell('change') },
            { key: 'growth', label: 'Growth', format: 'pct', drill: growthCell('growth') },
          ]}
          definitions={[
            DEF.headcount,
            {
              term: 'Growth',
              text: 'Change in headcount as a share of headcount 12 months ago. Hidden when the base is under 5.',
              formula: '(today − 12 months ago) ÷ 12 months ago',
            },
          ]}
          note={
            wf.growth.some((g) => (g.growth ?? 0) < 0) ? `${note} · bars left of the zero line shrank` : note
          }
          span={8}
          empty={
            !m.prep.has.terminationDate
              ? `${NO_HISTORY}.`
              : wf.growth.length
                ? null
                : 'No employees in this scope.'
          }
        >
          {/* Growth and decline both in the series color: direction from the zero line carries the sign. */}
          <BarList
            data={wf.growth}
            label="group"
            value="growth"
            format="pct"
            sort="none"
            secondary={(d) => `${d.yearAgo} to ${d.now}`}
            onSelect={(d) => drill(() => growthCellSpec(p, d, 'growth'))}
          />
        </Figure>
        <Figure
          id="hrbp-engineering-share"
          uses={p.uses(FIGURE.engineeringShare)}
          title="Engineering share"
          subtitle={`Employees in engineering departments on ${asOf}`}
          data={eng.rows}
          columns={[
            { key: 'group', label: 'Function', format: 'text' },
            {
              key: 'headcount',
              label: 'Employees',
              format: 'int',
              drill: (r) => drillWhen(r.records.length > 0, () => engineeringSpec(p, r)),
            },
            {
              key: 'share',
              label: 'Share',
              format: 'pct',
              drill: (r) => drillWhen(r.records.length > 0, () => engineeringSpec(p, r)),
            },
          ]}
          definitions={[
            {
              term: 'Engineering',
              text: 'Departments in architecture, design, verification, validation, physical design, analog and mixed-signal, DFT, firmware, software, hardware, and test and product engineering.',
            },
            {
              term: 'Reference',
              text: 'The tick marks 65%, the middle of a common reference range of 60 to 70%. It is a reference, not a target.',
            },
          ]}
          note={`${eng.engineering.toLocaleString('en-US')} of ${eng.total.toLocaleString('en-US')} employees · as of ${asOf}`}
          span={4}
          empty={eng.share == null ? 'Fewer than 5 employees in this scope.' : null}
        >
          {eng.share != null && (
            <>
              <EngineeringStat share={eng.share} reference={ENGINEERING_REFERENCE} />
              {/* The counts behind the share, each opening its people. */}
              <p className="mt-2 text-[13px] text-ink-2">
                <Drill
                  spec={() => engineeringSpec(p, engRow)}
                  label={`Show the ${eng.engineering} employees in engineering`}
                >
                  {eng.engineering.toLocaleString('en-US')} in engineering
                </Drill>
                {' · '}
                <Drill
                  spec={() => engineeringSpec(p, otherRow)}
                  label={`Show the ${otherRow.headcount} employees in other functions`}
                >
                  {otherRow.headcount.toLocaleString('en-US')} in other functions
                </Drill>
              </p>
            </>
          )}
        </Figure>
      </Section>
    </>
  )
}
