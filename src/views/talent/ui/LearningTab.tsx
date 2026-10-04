import { useState } from 'react'
import { BarList, Columns, Figure, Heatmap } from '@/charts'
import { Button, EmptyState, goTo, Section, Segmented } from '@/components'
import { useAnalytics } from '@/data/context'
import { drill, openPerson } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { targetStatus } from '@/metrics/api'
import { LinkedSurvey } from '@/views/listening/LinkedSurvey'
import type { TalentModel } from '../engine'
import type { CourseRow, OverdueCell } from '../engine/learning'
import { FIGURE_METRIC, TALENT_METRIC as M } from '../engine/settings'
import { targetWords } from '../engine/wording'
import {
  completionColumns,
  courseColumns,
  hoursColumns,
  overdueCellColumns,
  TRAINING_OVERDUE_COLUMNS,
} from './columns'
import { defsFor, TERM } from './defs'

type Dim = 'department' | 'location'

/** Groups ordered by how many overdue assignments they hold, most first. */
function groupOrder(cells: readonly OverdueCell[]): string[] {
  const totals = new Map<string, number>()
  for (const c of cells) totals.set(c.group, (totals.get(c.group) ?? 0) + (c.overdue ?? 0))
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g)
}

export function LearningTab({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const asOf = formatDate(ctx.asOf)
  const l = m.learning
  const [dim, setDim] = useState<Dim>('department')

  if (!m.has.learning) {
    return (
      <EmptyState
        title="Upload Learning to see training completion"
        body="Learning assignments with a course, a required flag, due dates and completion dates power this tab."
        action={
          <Button variant="secondary" onClick={() => goTo('data')}>
            Open the Data room
          </Button>
        }
      />
    )
  }

  const period = ctx.window.label
  const cells = dim === 'department' ? l.overdueByDepartment : l.overdueByLocation
  const { minGroup, onTimeTarget: target } = m.settings
  // Calm emphasis: courses short of the target in the series color, the rest in gray (every
  // course in the series color when there is no target).
  const shortOf = (rate: number) => !target || targetStatus(rate, target) === 'missed'
  const tone = (d: CourseRow) =>
    d.onTimeRate != null && shortOf(d.onTimeRate) ? ('default' as const) : ('deemph' as const)
  const targetText = target ? `Target ${targetWords(target)}` : null
  const totalOverdue = l.overdue.length
  const noDue = l.hasDueDates ? null : 'Upload Learning with due dates to measure on-time completion.'

  return (
    <>
      <Section
        title="Required training"
        dek={`Whether required courses due in the period (${period}) were finished by their due date, and how completions moved month by month.`}
      >
        <Figure
          id="talent-training-on-time-by-course"
          uses={m.uses['talent-training-on-time-by-course']}
          metric={FIGURE_METRIC['talent-training-on-time-by-course']}
          title="Required training on time by course"
          subtitle={`Share of assignments due ${period} completed by the due date`}
          data={l.byCourse}
          columns={courseColumns(m.drill)}
          definitions={defsFor(ctx.metrics, [M.requiredOnTime], [TERM.required])}
          note={`${plural(l.current.due, 'assignment')} due · ${fmt(l.current.rate, 'pct')} on time overall${targetText ? ` · ${targetText.toLowerCase()}` : ''}`}
          span={6}
          empty={noDue ?? (l.byCourse.length ? null : 'No required assignments were due in this period.')}
        >
          <BarList
            data={l.byCourse}
            label="course"
            value="onTimeRate"
            format="pct"
            sort="asc"
            ref={target && targetText ? { value: target.value, label: targetText } : undefined}
            tone={tone}
            secondary={(d) => `n = ${fmt(d.due)}`}
            onSelect={(d) => drill(d.onTimeRate != null ? m.drill.onTime(d.course, 'onTime') : null)}
            ariaLabel="Required training on time by course"
          />
        </Figure>
        <Figure
          id="talent-completions-by-month"
          uses={m.uses['talent-completions-by-month']}
          metric={FIGURE_METRIC['talent-completions-by-month']}
          title="Completions by month"
          subtitle={`Courses completed each month, required and optional, ${period}`}
          data={l.completions}
          columns={completionColumns(m.drill)}
          definitions={defsFor(ctx.metrics, [M.completions], [TERM.required])}
          note={`${plural(
            l.completions.reduce((s, r) => s + r.completions, 0),
            'completion',
          )} · as of ${asOf}`}
          span={6}
          empty={
            l.completions.some((r) => r.completions > 0) ? null : 'No courses were completed in this period.'
          }
        >
          <Columns
            data={l.completions}
            x="month"
            y="completions"
            series="kind"
            stack
            seriesOrder={['Required', 'Optional']}
            xType="month"
            height={260}
            onSelect={(d) => drill(m.drill.completions(d.month, null))}
            onSelectSegment={(d) => drill(m.drill.completions(d.month, d.kind))}
            ariaLabel="Course completions by month"
          />
        </Figure>
      </Section>

      <Section
        title="Overdue today"
        dek={`Required assignments past their due date and not completed, as of ${asOf}, for employees still employed. The grid shows where each course is behind.`}
      >
        <Figure
          id="talent-overdue-by-course"
          uses={m.uses['talent-overdue-by-course']}
          metric={FIGURE_METRIC['talent-overdue-by-course']}
          title={`Overdue by course and ${dim}`}
          subtitle={`Share of past-due assignments not completed, as of ${asOf}`}
          data={cells}
          columns={overdueCellColumns(dim === 'department' ? 'Department' : 'Location', m.drill, dim)}
          definitions={defsFor(ctx.metrics, [M.overdue])}
          note={`${plural(totalOverdue, 'assignment')} overdue · cells under ${minGroup} assignments are hidden, counts included`}
          span={12}
          actions={
            <Segmented<Dim>
              label="Rows"
              value={dim}
              onChange={setDim}
              options={[
                { value: 'department', label: 'Department' },
                { value: 'location', label: 'Location' },
              ]}
            />
          }
          empty={noDue ?? (cells.length ? null : 'Nothing is overdue in this scope.')}
        >
          {/* Room for the rotated course names, which the heatmap draws past its right edge on narrow screens. */}
          <div className="pr-12 lg:pr-8 xl:pr-4">
            <Heatmap
              data={cells}
              x="course"
              y="group"
              value="share"
              n="pastDue"
              format="pct0"
              xOrder={l.overdueCourses}
              yOrder={groupOrder(cells)}
              rowHeight={26}
              onSelect={(d) => drill(m.drill.overdueCell(dim, d, 'overdue'))}
              ariaLabel={`Share overdue by course and ${dim}`}
            />
          </div>
        </Figure>
        <Figure
          id="talent-overdue-assignments"
          uses={m.uses['talent-overdue-assignments']}
          metric={FIGURE_METRIC['talent-overdue-assignments']}
          title="Overdue assignments"
          subtitle={`Required, not completed and past due, as of ${asOf}`}
          data={l.overdue}
          columns={TRAINING_OVERDUE_COLUMNS}
          definitions={defsFor(ctx.metrics, [M.overdue])}
          note={`${plural(totalOverdue, 'assignment')} for ${plural(new Set(l.overdue.map((o) => o.employeeId)).size, 'employee')}${
            l.otherWorkersOverdue
              ? ` · ${plural(l.otherWorkersOverdue, 'assignment')} of contractors and interns also overdue, not listed`
              : ''
          }`}
          span={8}
          tableOnly
          table={{
            maxRows: 12,
            search: 'Search people or courses',
            rowTone: (r) => (r.daysOverdue > 90 ? 'critical' : r.daysOverdue > 30 ? 'warning' : null),
            onRowClick: (r) => openPerson(r.employeeId),
          }}
          empty={noDue ?? (totalOverdue ? null : 'Nothing is overdue in this scope.')}
        />
        <Figure
          id="talent-learning-hours"
          uses={m.uses['talent-learning-hours']}
          metric={FIGURE_METRIC['talent-learning-hours']}
          title="Learning hours per employee"
          subtitle={`Hours from courses completed ${period}, by business unit`}
          data={l.hours}
          columns={hoursColumns(m.drill)}
          definitions={defsFor(ctx.metrics, [M.hours])}
          note={`Employees only · units under ${minGroup} people are hidden`}
          span={4}
          className="self-start"
          empty={
            !m.has.learningHours
              ? 'Upload Learning with hours to see this.'
              : l.hours.length
                ? null
                : 'No learning hours in this period.'
          }
        >
          <BarList
            data={l.hours}
            label="businessUnit"
            value="perEmployee"
            format="hours"
            onSelect={(d) => drill(m.drill.hours(d.businessUnit))}
            ariaLabel="Learning hours per employee by business unit"
          />
        </Figure>
      </Section>

      <LinkedSurvey
        survey="Training evaluation"
        id="talent-training-evaluation"
        title="What learners say"
        dek="One number from the training evaluation, sent after a course. Usefulness and relevance by course are in Listening."
      />
    </>
  )
}
