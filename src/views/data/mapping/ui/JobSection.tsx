/**
 * Job architecture: job family → job function (→ job title for one function), the job function ×
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
import { BLANK, type HeatCell, type JobRow, jobDiagram, type TitleRow } from '../engine/structure'
import { ConflictList } from './ConflictList'
import { MappingDiagram } from './MappingDiagram'
import type { MappingModel } from './model'

const ACTIVE: FieldRef[] = ['employees.hireDate', 'employees.terminationDate', 'employees.employmentType']
const JOB_USES: FieldRef[] = ['employees.jobFamily', 'employees.jobFunction', ...ACTIVE]
const TITLE_USES: FieldRef[] = [...JOB_USES, 'employees.jobTitle', 'employees.level']
const LEVEL_USES: FieldRef[] = ['employees.jobFunction', 'employees.level', ...ACTIVE]

const DEFINITIONS: Definition[] = [
  {
    term: 'Headcount',
    text: 'Active employees on the as-of date. Contractors and interns are not counted.',
  },
  {
    term: 'Job family',
    text: 'The broad group of related jobs, such as Silicon Engineering. It contains job functions.',
  },
  { term: 'Job function', text: 'A discipline inside one job family, such as Design RTL.' },
]
const LEVEL_DEFINITIONS: Definition[] = [
  ...DEFINITIONS.slice(0, 1),
  {
    term: 'Usual range',
    text: 'The 10th to 90th percentile level of a job function’s other titles on the same track (individual contributor, manager or executive). A title is flagged when its median level sits 2 or more rungs beyond every other title on its track, leaving a rung empty between them. Checked when 10 or more other employees share the track.',
  },
]

const ALL = '\u0000all'
const NONE = '\u0000none'
const intText = (n: number) => n.toLocaleString('en-US')

export function JobSection({ model }: { model: MappingModel }) {
  const { ctx, report, jobRows, titleRows, heat, jobConflicts } = model
  const data = ctx.all
  const asOf = ctx.asOf
  const emps = data.employees
  const [focus, setFocus] = useState<string>(ALL)
  const functions = useMemo(
    () =>
      [...new Set(report.jobs.map((e) => e.jobFunction))].sort((a, b) => (a ?? '￿').localeCompare(b ?? '￿')),
    [report],
  )
  const focusFunction = focus === ALL ? undefined : focus === NONE ? null : focus
  const focused =
    focusFunction !== undefined && functions.includes(focusFunction) ? { value: focusFunction } : null
  const focusKey = focused ? (focused.value ?? NONE) : ALL
  const mapped = useMemo(
    () => jobDiagram(report, emps, focusKey === ALL ? null : { value: focusKey === NONE ? null : focusKey }),
    [report, emps, focusKey],
  )
  const fams = new Set(report.jobs.map((r) => r.jobFamily).filter((f) => f != null)).size
  const fns = functions.filter((f) => f != null).length
  const titles = new Set(titleRows.map((t) => t.jobTitle)).size

  const people = (title: string, rows: readonly number[], scope?: string) =>
    peopleSpec({ title, asOf, employees: emps, rows, focus: 'job', scope })

  const jobColumns: Column<JobRow>[] = [
    { key: 'jobFamily', label: 'Job family' },
    { key: 'jobFunction', label: 'Job function' },
    {
      key: 'headcount',
      label: 'Headcount',
      format: 'int',
      drill: (r) => () => people(r.jobFunction, r.rows, r.jobFamily),
    },
    { key: 'titles', label: 'Job titles', format: 'int' },
    { key: 'levels', label: 'Levels' },
    { key: 'status', label: 'Status' },
  ]
  const titleColumns: Column<TitleRow>[] = [
    { key: 'jobFamily', label: 'Job family' },
    { key: 'jobFunction', label: 'Job function' },
    { key: 'jobTitle', label: 'Job title' },
    {
      key: 'headcount',
      label: 'Headcount',
      format: 'int',
      drill: (r) => () => people(r.jobTitle, r.rows, r.jobFunction),
    },
    { key: 'levels', label: 'Levels' },
  ]
  const heatColumns: Column<HeatCell>[] = [
    { key: 'jobFunction', label: 'Job function' },
    { key: 'level', label: 'Level' },
    {
      key: 'headcount',
      label: 'Headcount',
      format: 'int',
      drill: (c) => () => people(`${c.jobFunction} at ${c.level}`, c.rows),
    },
  ]
  const asOfText = formatDate(asOf)
  const focusLabel = focused ? (focused.value ?? BLANK.jobFunction) : null

  return (
    <Section
      id="data-map-job"
      title="Job architecture"
      dek="How job titles roll up to job functions and job families, and where each function sits on the level ladder. A function should sit under one family, and its titles within its usual levels."
    >
      <Figure
        id="data-map-job-diagram"
        title={focusLabel ? `Job titles in ${focusLabel}` : 'Job families and functions'}
        subtitle={
          focusLabel
            ? `The families ${focusLabel} sits under and its titles, by active headcount as of ${asOfText}`
            : `${intText(fams)} job ${fams === 1 ? 'family' : 'families'} and ${intText(fns)} job ${fns === 1 ? 'function' : 'functions'}, by active headcount as of ${asOfText}. Choose a function to see its titles.`
        }
        data={jobRows}
        columns={jobColumns}
        definitions={DEFINITIONS}
        span={8}
        uses={JOB_USES}
        empty={jobRows.length ? null : 'No active people in Employees on the as-of date.'}
        table={{ rowTone: (r) => (r.flagged ? 'warning' : null) }}
        actions={
          <Select
            label="Show the titles of a job function"
            value={focusKey}
            onChange={setFocus}
            className="w-48"
          >
            <option value={ALL}>All job functions</option>
            {functions.map((f) => (
              <option key={f ?? NONE} value={f ?? NONE}>
                {f ?? BLANK.jobFunction}
              </option>
            ))}
          </Select>
        }
      >
        <MappingDiagram
          mapped={mapped}
          label={
            focusLabel ? `Job titles in ${focusLabel}` : 'Job families and job functions by active headcount'
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
        none={
          report.hasJobFunction
            ? 'Every job function sits under one family, every title sits within its function’s usual levels, and everyone has a job function.'
            : 'No job function column in Employees.'
        }
        conflicts={jobConflicts}
        data={data}
        asOf={asOf}
        span={4}
        uses={TITLE_USES}
      />
      <Figure
        id="data-map-job-levels"
        title="Job function by level"
        subtitle={`Active headcount in each job function at each level, as of ${asOfText}.`}
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
          y="jobFunction"
          value="headcount"
          format="int"
          xOrder={heat.levels}
          yOrder={heat.functions}
          rowHeight={22}
          onSelect={(c) => drill(() => people(`${c.jobFunction} at ${c.level}`, c.rows))}
          ariaLabel="Active headcount by job function and level"
        />
      </Figure>
      <Figure
        id="data-map-job-titles"
        title="Job titles"
        subtitle={`${intText(titles)} titles by job family and function, with headcount at each level, as of ${asOfText}`}
        data={titleRows}
        columns={titleColumns}
        tableOnly
        uses={TITLE_USES}
        table={{ search: 'Find a title or function', maxRows: 12 }}
      />
    </Section>
  )
}
