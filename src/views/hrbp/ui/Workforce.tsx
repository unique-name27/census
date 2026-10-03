import { BarList, Columns, Figure, HBars, Meter } from '@/charts'
import { Section } from '@/components'
import { useAnalytics } from '@/data/context'
import { LEVELS } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { TENURE_BANDS } from '@/lib/people'
import type { HrbpModel } from '../engine'
import { WORKER_ORDER } from '../engine/workforce'
import { DEF } from './defs'
import { rescope } from './model'

const COUNT_COLS = [
  { key: 'label', label: 'Group', format: 'text' as const },
  { key: 'headcount', label: 'Employees', format: 'int' as const },
  { key: 'share', label: 'Share', format: 'pct' as const },
]

export function Workforce({ m }: { m: HrbpModel }) {
  const ctx = useAnalytics()
  const asOf = formatDate(ctx.asOf)
  const wf = m.workforce
  const n = wf.headcount
  const note = `${n.toLocaleString('en-US')} employees · as of ${asOf}`
  const none = n ? null : 'No active employees in this scope.'
  const eng = wf.engineering
  const growthBy = new Set(wf.byBusinessUnit.map((r) => r.label)).size > 1 ? 'business unit' : 'department'
  const mixTotal = wf.mix.reduce((a, r) => a + r.people, 0)

  return (
    <>
      <Section
        title="Where people are"
        dek={`Active employees on ${asOf} by department, site, level and tenure. Contractors and interns appear in the worker mix only.`}
      >
        <Figure
          id="hrbp-hc-department"
          title="Headcount by department"
          subtitle={`Employees on ${asOf}, largest 12 departments`}
          data={wf.byDepartment}
          columns={[{ ...COUNT_COLS[0], label: 'Department' }, COUNT_COLS[1], COUNT_COLS[2]]}
          definitions={[DEF.headcount]}
          note={note}
          span={6}
          empty={none}
        >
          <BarList
            data={wf.byDepartment}
            label="label"
            value="headcount"
            top={12}
            secondary={(d) => fmt(d.share, 'pct0')}
            onSelect={(d) => {
              if (!d.label.startsWith('Other')) rescope(ctx, { department: [d.label] })
            }}
          />
        </Figure>
        <Figure
          id="hrbp-hc-location"
          title="Headcount by location"
          subtitle={`Employees on ${asOf} by work site`}
          data={wf.byLocation}
          columns={[{ ...COUNT_COLS[0], label: 'Location' }, COUNT_COLS[1], COUNT_COLS[2]]}
          definitions={[DEF.headcount]}
          note={note}
          span={6}
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
          span={6}
          empty={none}
        >
          <Columns data={wf.byLevel} x="label" y="headcount" xOrder={[...LEVELS]} height={220} />
        </Figure>
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
          span={6}
          empty={none}
        >
          <Columns data={wf.tenure} x="label" y="headcount" xOrder={[...TENURE_BANDS]} height={220} />
        </Figure>
      </Section>

      <Section
        title="How the workforce is changing"
        dek="Growth over the last 12 months, the mix of worker types, and how much of the workforce is in engineering."
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
          note={note}
          span={4}
          empty={wf.growth.length ? null : 'No employees in this scope.'}
        >
          <BarList
            data={wf.growth}
            label="group"
            value="growth"
            format="pct"
            sort="none"
            secondary={(d) => `${d.yearAgo} to ${d.now}`}
            tone={(d) => (d.growth != null && d.growth < 0 ? 'deemph' : 'default')}
          />
        </Figure>
        <Figure
          id="hrbp-worker-mix"
          title="Workforce mix"
          subtitle={`Employees, contractors and interns on ${asOf}, share of each business unit`}
          data={wf.mix}
          columns={[
            { key: 'businessUnit', label: 'Business unit', format: 'text' },
            { key: 'workerType', label: 'Worker type', format: 'text' },
            { key: 'people', label: 'People', format: 'int' },
            { key: 'share', label: 'Share of unit', format: 'pct' },
          ]}
          definitions={[
            {
              term: 'Worker type',
              text: 'Employment type on the roster. Only employees count in headcount and rates.',
            },
          ]}
          note={`${mixTotal.toLocaleString('en-US')} active workers · as of ${asOf}`}
          span={5}
          empty={mixTotal ? null : 'No active workers in this scope.'}
        >
          <HBars
            data={wf.mix}
            y="businessUnit"
            x="people"
            series="workerType"
            stack="normalize"
            seriesOrder={WORKER_ORDER}
            format="pct"
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
          ]}
          note={`${eng.engineering.toLocaleString('en-US')} of ${eng.total.toLocaleString('en-US')} employees · as of ${asOf}`}
          span={3}
          empty={eng.share == null ? 'Fewer than 5 employees in this scope.' : null}
        >
          <div className="flex flex-col gap-3 pt-1">
            <div className="cut-head text-[40px] leading-none font-semibold">{fmt(eng.share, 'pct0')}</div>
            <p className="text-[13px] leading-snug text-ink-2">
              of employees work in engineering departments.
            </p>
            <Meter value={eng.share} target={0.65} label="Engineering share" />
            <p className="text-[12px] leading-snug text-muted">
              Tick at 65%, the middle of the 60 to 70% range the earlier HRBP dashboard used as a reference.
            </p>
          </div>
        </Figure>
      </Section>
    </>
  )
}
