import { useState } from 'react'
import { BarList, Columns, Figure, HBars } from '@/charts'
import { Section, Segmented } from '@/components'
import { useAnalytics } from '@/data/context'
import { LEVELS } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { TENURE_BANDS } from '@/lib/people'
import type { HrbpModel } from '../engine'
import { NO_HISTORY } from '../engine/base'
import { CONTINGENT } from '../engine/workforce'
import { DEF } from './defs'
import { EngineeringStat } from './EngineeringStat'
import { rescope } from './model'

const COUNT_COLS = [
  { key: 'label', label: 'Group', format: 'text' as const },
  { key: 'headcount', label: 'Employees', format: 'int' as const },
  { key: 'share', label: 'Share', format: 'pct' as const },
]

/** Departments shown before the rest fold into "Other". Above the sample's 22, so every department shows. */
const DEPARTMENTS_SHOWN = 25
/** The engineering share reference tick: the middle of a common reference range of 60 to 70%. */
const ENGINEERING_REFERENCE = 0.65

type MixDim = 'location' | 'businessUnit'

export function Workforce({ m }: { m: HrbpModel }) {
  const ctx = useAnalytics()
  const [mixDim, setMixDim] = useState<MixDim>('location')
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

  return (
    <>
      <Section
        title="Where people are"
        dek={`Active employees on ${asOf} by department, site, level and tenure. Contractors and interns appear in their own chart only.`}
      >
        <Figure
          id="hrbp-hc-department"
          title="Headcount by department"
          subtitle={`Employees on ${asOf}${departments > DEPARTMENTS_SHOWN ? `, largest ${DEPARTMENTS_SHOWN} departments` : ''}`}
          data={wf.byDepartment}
          columns={[{ ...COUNT_COLS[0], label: 'Department' }, COUNT_COLS[1], COUNT_COLS[2]]}
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
            onSelect={(d) => {
              if (!d.label.startsWith('Other')) rescope(ctx, { department: [d.label] })
            }}
          />
        </Figure>
        <div className="col-span-full flex min-w-0 flex-col gap-4 md:col-span-6">
          <Figure
            id="hrbp-hc-location"
            title="Headcount by location"
            subtitle={`Employees on ${asOf} by work site`}
            data={wf.byLocation}
            columns={[{ ...COUNT_COLS[0], label: 'Location' }, COUNT_COLS[1], COUNT_COLS[2]]}
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
              onSelect={(d) => {
                if (!d.label.startsWith('Other')) rescope(ctx, { location: [d.label] })
              }}
            />
          </Figure>
          <Figure
            id="hrbp-hc-level"
            title="Headcount by level"
            subtitle={`Employees on ${asOf}, L1 to E3`}
            data={wf.byLevel}
            columns={[{ ...COUNT_COLS[0], label: 'Level' }, COUNT_COLS[1], COUNT_COLS[2]]}
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
            <Columns data={wf.byLevel} x="label" y="headcount" xOrder={[...LEVELS]} height={200} />
          </Figure>
        </div>
        <Figure
          id="hrbp-tenure"
          title="Tenure"
          subtitle={`Employees on ${asOf} by years since hire`}
          data={wf.tenure}
          columns={[{ ...COUNT_COLS[0], label: 'Tenure' }, COUNT_COLS[1], COUNT_COLS[2]]}
          definitions={[
            { term: 'Tenure', text: 'Years from hire date to the as-of date (365.25 days a year).' },
          ]}
          note={`${note}${wf.avgTenure != null ? ` · average ${fmt(wf.avgTenure, 'years')}` : ''}`}
          span={5}
          empty={none}
        >
          <Columns data={wf.tenure} x="label" y="headcount" xOrder={[...TENURE_BANDS]} height={300} />
        </Figure>
        <Figure
          id="hrbp-worker-mix"
          title="Contractors and interns"
          subtitle={`Active contractors and interns on ${asOf} by ${mixDim === 'location' ? 'site' : 'business unit'}`}
          data={mixRows}
          columns={[
            { key: 'group', label: mixDim === 'location' ? 'Location' : 'Business unit', format: 'text' },
            { key: 'workerType', label: 'Worker type', format: 'text' },
            { key: 'people', label: 'People', format: 'int' },
            {
              key: 'share',
              label: mixDim === 'location' ? 'Share of site' : 'Share of unit',
              format: 'pct',
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
          />
        </Figure>
      </Section>

      <Section
        title="How the workforce is changing"
        dek="Growth over the last 12 months and how much of the workforce is in engineering."
      >
        <Figure
          id="hrbp-growth"
          title={`Growth by ${growthBy}`}
          subtitle={`Change in employees from 12 months ago to ${asOf}`}
          data={wf.growth}
          columns={[
            {
              key: 'group',
              label: growthBy === 'department' ? 'Department' : 'Business unit',
              format: 'text',
            },
            { key: 'yearAgo', label: '12 months ago', format: 'int' },
            { key: 'now', label: 'Today', format: 'int' },
            { key: 'change', label: 'Change', format: 'int' },
            { key: 'growth', label: 'Growth', format: 'pct' },
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
          />
        </Figure>
        <Figure
          id="hrbp-engineering-share"
          title="Engineering share"
          subtitle={`Employees in engineering departments on ${asOf}`}
          data={eng.rows}
          columns={[
            { key: 'group', label: 'Function', format: 'text' },
            { key: 'headcount', label: 'Employees', format: 'int' },
            { key: 'share', label: 'Share', format: 'pct' },
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
          {eng.share != null && <EngineeringStat share={eng.share} reference={ENGINEERING_REFERENCE} />}
        </Figure>
      </Section>
    </>
  )
}
