/**
 * Job architecture: job function → job family (→ job title for one family), the job family ×
 * level grid, the titles table, and where they disagree.
 */
import { useMemo, useState } from 'react'
import { type Column, type Definition, Figure, Heatmap } from '@/charts'
import { Section } from '@/components/Section'
import type { FieldRef } from '@/data/quality/fieldRef'
import { drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { Select } from '../../ui/Select'
import { peopleSpec } from '../engine/drills'
import { BLANK, type FamilyRow, type HeatCell, jobDiagram, type TitleRow } from '../engine/structure'
import { ConflictList } from './ConflictList'
import { MappingDiagram } from './MappingDiagram'
import type { MappingModel } from './model'

const ACTIVE: FieldRef[] = ['employees.hireDate', 'employees.terminationDate', 'employees.employmentType']
const JOB_USES: FieldRef[] = ['employees.jobFunction', 'employees.jobFamily', ...ACTIVE]
const TITLE_USES: FieldRef[] = [...JOB_USES, 'employees.jobTitle', 'employees.level']
const LEVEL_USES: FieldRef[] = ['employees.jobFamily', 'employees.level', ...ACTIVE]

const DEFINITIONS: Definition[] = [
  {
    term: 'Headcount',
    text: 'Active employees on the as-of date. Contractors and interns are not counted.',
  },
  {
    term: 'Job function',
    text: 'The broad area above the job family: Engineering, Operations, Sales & marketing, G&A or Executive, or your own.',
  },
]
const LEVEL_DEFINITIONS: Definition[] = [
  ...DEFINITIONS.slice(0, 1),
  {
    term: 'Usual range',
    text: 'The 10th to 90th percentile level of a family’s other titles on the same track (individual contributor, manager or executive). A title is flagged when its median level sits 2 or more rungs beyond every other title on its track, leaving a rung empty between them. Checked when 10 or more other employees share the track.',
  },
]

const ALL = '\u0000all'
const NONE = '\u0000none'
const intText = (n: number) => n.toLocaleString('en-US')

export function JobSection({ model }: { model: MappingModel }) {
  const { ctx, report, familyRows, titleRows, heat, jobConflicts } = model
  const data = ctx.all
  const asOf = ctx.asOf
  const emps = data.employees
  const [focus, setFocus] = useState<string>(ALL)
  const families = useMemo(
    () =>
      [...new Set(report.functions.map((e) => e.jobFamily))].sort((a, b) =>
        (a ?? '￿').localeCompare(b ?? '￿'),
      ),
    [report],
  )
  const focusFamily = focus === ALL ? undefined : focus === NONE ? null : focus
  const focused = focusFamily !== undefined && families.includes(focusFamily) ? { value: focusFamily } : null
  const focusKey = focused ? (focused.value ?? NONE) : ALL
  const mapped = useMemo(
    () => jobDiagram(report, emps, focusKey === ALL ? null : { value: focusKey === NONE ? null : focusKey }),
    [report, emps, focusKey],
  )
  const fns = new Set(familyRows.map((r) => r.jobFunction)).size
  const fams = families.filter((f) => f != null).length
  const titles = new Set(titleRows.map((t) => t.jobTitle)).size

  const people = (title: string, rows: readonly number[], scope?: string) =>
    peopleSpec({ title, asOf, employees: emps, rows, focus: 'job', scope })

  const familyColumns: Column<FamilyRow>[] = [
    { key: 'jobFunction', label: 'Job function' },
    { key: 'jobFamily', label: 'Job family' },
    {
      key: 'headcount',
      label: 'Headcount',
      format: 'int',
      drill: (r) => () => people(r.jobFamily, r.rows, r.jobFunction),
    },
    { key: 'titles', label: 'Job titles', format: 'int' },
    { key: 'levels', label: 'Levels' },
    { key: 'status', label: 'Status' },
  ]
  const titleColumns: Column<TitleRow>[] = [
    { key: 'jobFunction', label: 'Job function' },
    { key: 'jobFamily', label: 'Job family' },
    { key: 'jobTitle', label: 'Job title' },
    {
      key: 'headcount',
      label: 'Headcount',
      format: 'int',
      drill: (r) => () => people(r.jobTitle, r.rows, r.jobFamily),
    },
    { key: 'levels', label: 'Levels' },
  ]
  const heatColumns: Column<HeatCell>[] = [
    { key: 'jobFamily', label: 'Job family' },
    { key: 'level', label: 'Level' },
    {
      key: 'headcount',
      label: 'Headcount',
      format: 'int',
      drill: (c) => () => people(`${c.jobFamily} at ${c.level}`, c.rows),
    },
  ]
  const asOfText = formatDate(asOf)
  const focusLabel = focused ? (focused.value ?? BLANK.jobFamily) : null

  return (
    <Section
      id="data-map-job"
      title="Job architecture"
      dek="How job titles roll up to job families and functions, and where each family sits on the level ladder. A family should sit under one function, and its titles within its usual levels."
    >
      <Figure
        id="data-map-job-diagram"
        title={focusLabel ? `Job titles in ${focusLabel}` : 'Job functions and families'}
        subtitle={
          focusLabel
            ? `The functions ${focusLabel} sits under and its titles, by active headcount as of ${asOfText}`
            : `${intText(fns)} ${fns === 1 ? 'function' : 'functions'} and ${intText(fams)} job families, by active headcount as of ${asOfText}. Choose a family to see its titles.`
        }
        data={familyRows}
        columns={familyColumns}
        definitions={DEFINITIONS}
        span={8}
        uses={JOB_USES}
        empty={familyRows.length ? null : 'No active people in Employees on the as-of date.'}
        table={{ rowTone: (r) => (r.flagged ? 'warning' : null) }}
        actions={
          <Select
            label="Show the titles of a job family"
            value={focusKey}
            onChange={setFocus}
            className="w-48"
          >
            <option value={ALL}>All job families</option>
            {families.map((f) => (
              <option key={f ?? NONE} value={f ?? NONE}>
                {f ?? BLANK.jobFamily}
              </option>
            ))}
          </Select>
        }
      >
        <MappingDiagram
          mapped={mapped}
          label={
            focusLabel ? `Job titles in ${focusLabel}` : 'Job functions and job families by active headcount'
          }
          maxHeight={focused ? 520 : 720}
          dense={!focused}
          drillFor={(id) => () => {
            const p = mapped.parts.get(id)
            return p ? people(p.title, p.rows) : null
          }}
        />
      </Figure>
      <ConflictList
        id="data-map-job-conflicts"
        title="Job architecture conflicts"
        none="Every job family sits under one function, every title sits within its family’s usual levels, and everyone has a job family."
        conflicts={jobConflicts}
        data={data}
        asOf={asOf}
        span={4}
        uses={TITLE_USES}
      />
      <Figure
        id="data-map-job-levels"
        title="Job family by level"
        subtitle={`Active headcount in each job family at each level, as of ${asOfText}.`}
        data={heat.cells}
        columns={heatColumns}
        definitions={LEVEL_DEFINITIONS}
        span={12}
        uses={LEVEL_USES}
        empty={heat.cells.length ? null : 'No active people in Employees on the as-of date.'}
      >
        <Heatmap
          data={heat.cells}
          x="level"
          y="jobFamily"
          value="headcount"
          format="int"
          xOrder={heat.levels}
          yOrder={heat.families}
          rowHeight={22}
          onSelect={(c) => drill(() => people(`${c.jobFamily} at ${c.level}`, c.rows))}
          ariaLabel="Active headcount by job family and level"
        />
      </Figure>
      <Figure
        id="data-map-job-titles"
        title="Job titles"
        subtitle={`${intText(titles)} titles by function and family, with headcount at each level, as of ${asOfText}`}
        data={titleRows}
        columns={titleColumns}
        tableOnly
        uses={TITLE_USES}
        table={{ search: 'Find a title or family', maxRows: 12 }}
      />
    </Section>
  )
}
