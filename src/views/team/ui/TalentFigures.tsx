/**
 * My team, Talent: ratings in the latest cycle against the guideline, critical roles by their best
 * successor's readiness, required training on time by course, and the overdue assignments and
 * critical roles one by one. Talent's numbers and records; no flight-risk score anywhere.
 */
import { BarList, type Column, Figure, HBars, useChartTheme } from '@/charts'
import { Section } from '@/components'
import { useAnalytics } from '@/data/context'
import type { LearningRecord } from '@/data/schema'
import { drill, openPerson } from '@/drill'
import type { DrillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { targetStatus } from '@/metrics/api'
import { isOnTime, type OverdueRow } from '@/views/talent/engine/learning'
import { FIGURE_METRIC, TALENT_METRIC as TM } from '@/views/talent/engine/settings'
import { COVERAGE_ORDER, type RoleRow } from '@/views/talent/engine/succession'
import { readinessColors } from '@/views/talent/ui/colors'
import { distributionColumns } from '@/views/talent/ui/columns'
import { defsFor, TERM } from '@/views/talent/ui/defs'
import { GuidelineColumns } from '@/views/talent/ui/GuidelineColumns'
import {
  type CourseBar,
  type CoverageCount,
  courseBars,
  criticalCoverage,
  criticalRoles,
  overdueRows,
  overdueSpec,
  type TeamSources,
} from '../engine'

const pctWords = (v: number) => fmt(v, 'pct0')

export function TalentSection({ s, small = false }: { s: TeamSources; small?: boolean }) {
  const ctx = useAnalytics()
  const t = useChartTheme()
  const m = s.talent
  const perf = m.performance
  const set = m.settings
  const asOf = formatDate(ctx.asOf)
  const cycle = perf.cycle?.cycle

  /* Critical roles by best successor readiness. */
  const coverage = criticalCoverage(m)
  const roles = criticalRoles(m)
  const coverageDrill = (c: CoverageCount) =>
    c.roles ? m.drill.roles(c.list, `Critical roles, best successor ${c.coverage.toLowerCase()}`) : null

  /* Required training on time by course. */
  const courses = courseBars(m)
  const target = ctx.metrics.target(TM.requiredOnTime)
  const targetText = target ? `Target ${pctWords(target.value)}` : null
  const shortOf = (rate: number) => !target || targetStatus(rate, target) === 'missed'
  // A course's assignments (all due, or those done on time); "Other courses" opens its courses'
  // together. The assignments due carry an On time column, so the share's late ones are listed too.
  const withOutcome = (spec: DrillSpec | null, c: CourseBar): DrillSpec | null =>
    spec?.kind === 'learning'
      ? ({
          ...spec,
          extra: {
            columns: [{ key: 'onTimeOutcome', label: 'On time' }],
            values: (l: LearningRecord) => ({ onTimeOutcome: isOnTime(l) ? 'Yes' : 'No' }),
          },
          note: `Share on time = ${fmt(c.onTime, 'int')} on time ÷ ${fmt(c.due, 'int')} due. Employees employed on the due date only.`,
        } as DrillSpec)
      : spec
  const partDrill =
    (part: 'due' | 'onTime') =>
    (c: CourseBar): (() => DrillSpec | null) | null => {
      if (c.onTimeRate == null) return null
      const one = (name: string) => m.drill.onTime(name, part)?.() ?? null
      const spec = (): DrillSpec | null => {
        if (!c.other) return one(c.course)
        const specs = c.courses.flatMap((name) => {
          const x = one(name)
          return x ? [x] : []
        })
        const first = specs[0]
        if (!first) return null
        return {
          ...first,
          title: `${part === 'due' ? 'Assignments due' : 'Completed on time'}, ${c.course.toLowerCase()}`,
          rows: specs.flatMap((x) => x.rows),
        } as DrillSpec
      }
      return part === 'due' ? () => withOutcome(spec(), c) : spec
    }
  const dueDrill = partDrill('due')
  const courseColumns: Column<CourseBar>[] = [
    { key: 'course', label: 'Course' },
    { key: 'due', label: 'Assignments due', format: 'int', drill: dueDrill },
    { key: 'onTime', label: 'On time', format: 'int', drill: partDrill('onTime') },
    { key: 'onTimeRate', label: 'Share on time', format: 'pct', drill: dueDrill },
  ]
  const courseNote = small
    ? `${plural(m.learning.current.due, 'assignment')} due · shares hidden: the org has fewer than ${set.minGroup} employees`
    : `${plural(m.learning.current.due, 'assignment')} due · ${fmt(m.learning.current.rate, 'pct')} on time overall`

  /* Overdue assignments. */
  // The row's glyph (critical past 90 days, watch past 30) carries its word in the Status column.
  const overdue = overdueRows(m).map((r) => ({
    ...r,
    state: r.daysOverdue > 90 ? 'Over 90 days' : r.daysOverdue > 30 ? 'Over 30 days' : 'Under 30 days',
  }))
  type OverdueItem = (typeof overdue)[number]
  const overdueDrill = (r: OverdueRow) => () => overdueSpec(m, r, ctx.scopeLabel)
  const overdueColumns: Column<OverdueItem>[] = [
    { key: 'name', label: 'Name' },
    { key: 'course', label: 'Course' },
    { key: 'dueDate', label: 'Due date', format: 'date' },
    { key: 'daysOverdue', label: 'Days overdue', format: 'days', drill: overdueDrill },
    { key: 'state', label: 'Status' },
  ]

  /* Critical roles. */
  const roleColumns: Column<RoleRow>[] = [
    { key: 'roleTitle', label: 'Role' },
    { key: 'incumbent', label: 'Incumbent' },
    {
      key: 'successors',
      label: 'Successors',
      format: 'int',
      drill: (r) => (r.successors ? m.drill.roleBench(r.roleId, null) : null),
    },
    {
      key: 'readyNow',
      label: 'Ready now',
      format: 'int',
      drill: (r) => (r.readyNow ? m.drill.roleBench(r.roleId, 'Ready now') : null),
    },
    { key: 'successorNames', label: 'Successors named' },
    { key: 'status', label: 'Bench' },
  ]

  return (
    <Section title="Talent" dek="Ratings, successors for critical roles and required training.">
      <Figure
        id="team-rating-mix"
        uses={m.uses['talent-rating-distribution']}
        metric={FIGURE_METRIC['talent-rating-distribution']}
        title="Ratings against the guideline"
        subtitle={cycle ? `Share of people at each rating, ${cycle}` : 'Share of people at each rating'}
        data={perf.distribution}
        columns={distributionColumns(m.drill)}
        definitions={defsFor(ctx.metrics, [TM.ratingDistribution], [TERM.latestCycle])}
        note={`${plural(perf.rated, 'person', 'people')} rated · as of ${asOf}`}
        span={4}
        emptyHeight={240}
        empty={
          !m.has.reviews
            ? 'Upload Reviews to see the rating distribution.'
            : perf.rated < set.minGroup
              ? `Fewer than ${set.minGroup} people are rated in this org, so the distribution is hidden to protect anonymity.`
              : null
        }
      >
        <GuidelineColumns
          data={perf.distribution}
          drillFor={(d) => m.drill.rating(d.rating)}
          height={220}
          minGroup={set.minGroup}
          ariaLabel="Rating distribution compared with the guideline"
        />
      </Figure>
      <Figure
        id="team-succession"
        uses={m.uses['talent-succession-coverage']}
        metric={TM.criticalCoverage}
        title="Critical roles by successor readiness"
        subtitle="Critical roles in the org by the readiness of their best successor, as of the latest plans"
        // With no critical role the four readiness rows are all zero: nothing to export.
        data={roles.length ? coverage : []}
        columns={[
          { key: 'coverage', label: 'Best successor readiness' },
          { key: 'roles', label: 'Critical roles', format: 'int', drill: coverageDrill },
        ]}
        definitions={defsFor(ctx.metrics, [TM.criticalCoverage, TM.bestReadiness])}
        note={`${plural(roles.length, 'critical role')} · as of ${asOf}`}
        span={4}
        emptyHeight={240}
        empty={
          !m.has.succession
            ? 'Upload Succession to see coverage.'
            : roles.length
              ? null
              : 'No succession plan names a critical role in this org.'
        }
      >
        <HBars<CoverageCount>
          data={coverage}
          y="coverage"
          x="roles"
          series="coverage"
          stack
          seriesOrder={COVERAGE_ORDER}
          yOrder={COVERAGE_ORDER}
          colors={readinessColors(t)}
          format="int"
          onSelect={(d) => drill(coverageDrill(d))}
          onSelectSegment={(d) => drill(coverageDrill(d))}
          ariaLabel="Critical roles by best successor readiness"
        />
      </Figure>
      <Figure
        id="team-training-by-course"
        uses={m.uses['talent-training-on-time-by-course']}
        metric={TM.requiredOnTime}
        title="Required training on time by course"
        subtitle={`Share of assignments due ${ctx.window.label} completed by the due date`}
        // An org under the minimum exports nothing: its on-time counts would give the share away.
        data={small ? [] : courses}
        columns={courseColumns}
        definitions={defsFor(ctx.metrics, [TM.requiredOnTime], [TERM.required])}
        note={courseNote}
        span={4}
        emptyHeight={240}
        empty={
          !m.learning.hasDueDates
            ? 'Upload Learning with due dates to measure on-time completion.'
            : !courses.length
              ? 'No required assignments were due in this period.'
              : small
                ? `This org has fewer than ${set.minGroup} employees, so on-time shares are hidden to protect anonymity.`
                : null
        }
      >
        <BarList<CourseBar>
          data={courses}
          label="course"
          value="onTimeRate"
          format="pct"
          sort="none"
          domain={[0, 1]}
          ref={target && targetText ? { value: target.value, label: targetText } : undefined}
          tone={(d) => (d.onTimeRate != null && shortOf(d.onTimeRate) ? 'default' : 'deemph')}
          secondary={(d) => `n = ${fmt(d.due, 'int')}`}
          onSelect={(d) => drill(dueDrill(d))}
          ariaLabel="Required training on time by course"
        />
      </Figure>
      <Figure
        id="team-training-overdue"
        uses={m.uses['talent-overdue-assignments']}
        metric={FIGURE_METRIC['talent-overdue-assignments']}
        title="Overdue training"
        subtitle={`Required, not completed and past due, as of ${asOf}`}
        data={overdue}
        columns={overdueColumns}
        definitions={defsFor(ctx.metrics, [TM.overdue])}
        note={`${plural(overdue.length, 'assignment')} for ${plural(new Set(overdue.map((o) => o.employeeId)).size, 'employee')}`}
        span={roles.length ? 6 : 12}
        tableOnly
        table={{
          maxRows: 8,
          rowTone: (r) => (r.daysOverdue > 90 ? 'critical' : r.daysOverdue > 30 ? 'warning' : null),
          onRowClick: (r) => openPerson(r.employeeId),
        }}
        empty={m.learning.hasDueDates ? (overdue.length ? null : 'Nothing is overdue in this org.') : null}
      />
      {/* With no critical role in the org, the readiness chart above says so once. */}
      {roles.length > 0 && (
        <Figure
          id="team-critical-roles"
          uses={m.uses['talent-critical-roles']}
          metric={FIGURE_METRIC['talent-critical-roles']}
          title="Critical roles"
          subtitle="Each critical role with its successors and how ready they are"
          data={roles}
          columns={roleColumns}
          definitions={defsFor(ctx.metrics, [TM.roleStatus, TM.bestReadiness])}
          note={`${plural(roles.length, 'critical role')} · as of the latest plans`}
          span={6}
          tableOnly
          table={{
            maxRows: 8,
            rowTone: (r) =>
              r.status === 'No successor' ? 'critical' : r.status === 'Thin' ? 'warning' : null,
            onRowClick: (r) => openPerson(r.incumbentId),
          }}
        />
      )}
    </Section>
  )
}
