/**
 * One person, on one sheet: role, place in the org, history, ratings and open items. Names in the
 * manager chain and the direct reports open their own cards; the counts (direct reports, org,
 * open cases, overdue courses) open the records behind them. Pay amounts are never shown here;
 * compa-ratio is.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import { useMemo } from 'react'
import { outsideOrg } from '@/access/copy'
import { personInLock } from '@/access/records'
import { Button, StatusPill, Tag } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { RATING_LABELS } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { openInOrgChart } from '@/views/org/link'
import { Drill } from './Drill'
import { focusScope } from './focus'
import { personSummary } from './person'
import { directsSpec, openCasesSpec, orgSpec, overdueSpec } from './related'
import { useDrillStore } from './store'

const LINK =
  'rounded-mark text-left text-link underline decoration-rule-strong underline-offset-[3px] hover:decoration-link'

export function PersonCard({ employeeId }: { employeeId: string }) {
  const ctx = useAnalytics()
  const openPerson = useDrillStore((s) => s.openPerson)
  const p = useMemo(() => personSummary(ctx, employeeId), [ctx, employeeId])
  // Built up front so a count with nothing to list (0) is plain text.
  const lists = useMemo(
    () => ({
      directs: directsSpec(ctx, employeeId),
      org: orgSpec(ctx, employeeId),
      cases: openCasesSpec(ctx, employeeId),
      courses: overdueSpec(ctx, employeeId),
    }),
    [ctx, employeeId],
  )
  if (!p) {
    return (
      <div className="flex flex-col gap-2">
        <BDialog.Title tabIndex={-1} className="cut-head text-section font-semibold">
          Not in the roster
        </BDialog.Title>
        <BDialog.Description className="text-small text-ink-2">
          No employee with ID {employeeId} is in the Employees dataset.
        </BDialog.Description>
      </div>
    )
  }
  const e = p.employee
  // Manager mode, someone outside the org: who they are, and nothing else (docs/ROLES.md, 3.12).
  if (p.outside)
    return (
      <article className="flex flex-col gap-2">
        <BDialog.Title tabIndex={-1} className="cut-head text-page-title leading-tight font-semibold">
          {e.name}
        </BDialog.Title>
        <BDialog.Description className="text-body text-ink-2">{e.jobTitle}</BDialog.Description>
        {e.department && <p className="text-small text-ink-2">{e.department}</p>}
        <p className="text-small text-muted">{outsideOrg(ctx.access.lock?.managerName ?? 'the manager')}</p>
      </article>
    )
  const latest = p.reviews[0]
  const count = (n: number, one: string, many: string) => `${fmt(n, 'int')} ${n === 1 ? one : many}`
  const casesText = count(p.openCases, 'open HR case', 'open HR cases')
  const coursesText = count(p.overdueTraining, 'overdue required course', 'overdue required courses')
  return (
    <article className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <BDialog.Title tabIndex={-1} className="cut-head text-page-title leading-tight font-semibold">
            {e.name}
          </BDialog.Title>
          {p.status === 'Left' ? (
            <StatusPill severity="warning" label={`Left ${formatDate(e.terminationDate)}`} />
          ) : p.status === 'Not started' ? (
            <StatusPill severity="info" label={`Starts ${formatDate(e.hireDate)}`} />
          ) : (
            <StatusPill severity="good" label="Active" />
          )}
        </div>
        <BDialog.Description className="text-body text-ink-2">
          {e.jobTitle}
          {p.levelLabel ? ` · ${p.levelLabel}` : ''}
        </BDialog.Description>
        <p className="text-small text-ink-2">
          {[e.department, e.businessUnit, e.location].filter(Boolean).join(' · ')}
          {e.employmentType && e.employmentType !== 'Employee' ? ` · ${e.employmentType}` : ''}
        </p>
        <PersonActions employeeId={e.employeeId} manages={p.directs.length > 0} />
      </header>

      <section className="border-y border-rule py-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-small sm:grid-cols-2">
          <Fact label="Reports to">
            {p.chain.length ? (
              <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                {p.chain.map((m, i) => (
                  <span key={m.employeeId} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted">›</span>}
                    {/* Manager mode: names above the manager read as plain text. */}
                    {personInLock(m.employeeId, ctx.access) ? (
                      <button type="button" className={LINK} onClick={() => openPerson(m.employeeId)}>
                        {m.name}
                      </button>
                    ) : (
                      <span>{m.name}</span>
                    )}
                  </span>
                ))}
              </span>
            ) : (
              'Top of the organization'
            )}
          </Fact>
          <Fact label="Hired">
            {formatDate(e.hireDate)} · {fmt(p.tenureYears, 'years')}
          </Fact>
          <Fact label="Team">
            {p.directs.length ? (
              <>
                <Drill
                  spec={lists.directs}
                  label={`Show ${e.name}'s ${count(p.directs.length, 'direct report', 'direct reports')}`}
                >
                  {count(p.directs.length, 'direct report', 'direct reports')}
                </Drill>
                {' · '}
                {/* Everyone below them, contractors and interns too; the leader filter and headcount
                    count employees with the leader, so the card says what it counts. */}
                <Drill
                  spec={lists.org}
                  label={`Show the ${count(p.orgSize, 'person', 'people')} below ${e.name}`}
                >
                  {`${count(p.orgSize, 'person', 'people')} below them`}
                </Drill>
                {p.orgContingent > 0 &&
                  `, including ${count(p.orgContingent, 'contractor or intern', 'contractors or interns')}`}
              </>
            ) : (
              'No direct reports'
            )}
          </Fact>
          <Fact label="Latest rating">
            {latest
              ? `${latest.rating} ${RATING_LABELS[latest.rating] ?? ''} (${latest.cycle})${latest.potential ? ` · ${latest.potential} potential` : ''}`
              : 'Not rated'}
          </Fact>
          {!p.limited && (
            <Fact label="Compa-ratio">{p.compaRatio == null ? '—' : fmt(p.compaRatio, 'num2')}</Fact>
          )}
          <Fact label="Open items">
            {/* Employee relations cases are left out of this count: ER is never tied to a named person.
                Manager mode shows no HR cases at all. */}
            {!p.limited && (
              <>
                <Drill spec={lists.cases} label={`Show ${e.name}'s ${casesText}`}>
                  {casesText}
                </Drill>
                {' · '}
              </>
            )}
            <Drill spec={lists.courses} label={`Show ${e.name}'s ${coursesText}`}>
              {coursesText}
            </Drill>
          </Fact>
          {p.successorFor.length > 0 && <Fact label="Named successor for">{p.successorFor.join(', ')}</Fact>}
          {p.status === 'Left' && (
            <Fact label="Exit">
              {[e.terminationType, e.terminationReason, e.regrettable ? 'Regrettable' : null]
                .filter(Boolean)
                .join(' · ') || '—'}
            </Fact>
          )}
        </dl>
      </section>

      {p.directs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="eyebrow">Direct reports</h3>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-small sm:grid-cols-2">
            {p.directs
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((d) => (
                <li key={d.employeeId} className="flex min-w-0 items-baseline gap-2">
                  <button type="button" className={LINK} onClick={() => openPerson(d.employeeId)}>
                    {d.name}
                  </button>
                  <span className="truncate text-meta text-muted">{d.jobTitle}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {p.reviews.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="eyebrow">Reviews</h3>
          <table className="w-full text-small tnum">
            <tbody>
              {p.reviews.map((r) => (
                <tr key={r.cycle} className="border-b border-rule last:border-0">
                  <td className="py-1.5 pr-3 text-ink-2">{r.cycle}</td>
                  <td className="py-1.5 pr-3">
                    {r.rating} {RATING_LABELS[r.rating] ?? ''}
                  </td>
                  <td className="py-1.5 text-ink-2">
                    {r.preCalibrationRating != null && r.preCalibrationRating !== r.rating
                      ? `Proposed ${r.preCalibrationRating}`
                      : ''}
                    {r.potential
                      ? `${r.preCalibrationRating != null && r.preCalibrationRating !== r.rating ? ' · ' : ''}${r.potential} potential`
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {p.jobChanges.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="eyebrow">Job history</h3>
          <ol className="flex flex-col gap-1 text-small">
            {p.jobChanges.slice(0, 8).map((j, i) => (
              <li key={`${j.effectiveDate}-${i}`} className="flex gap-3">
                <span className="w-24 shrink-0 text-ink-2 tnum">{formatDate(j.effectiveDate)}</span>
                <span>
                  {j.changeType}
                  {j.fromLevel && j.toLevel && j.fromLevel !== j.toLevel
                    ? `, ${j.fromLevel} to ${j.toLevel}`
                    : ''}
                  {j.fromDepartment && j.toDepartment && j.fromDepartment !== j.toDepartment
                    ? `, ${j.fromDepartment} to ${j.toDepartment}`
                    : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/** "Focus on their org" and "Show in org chart" for a person card. */
function PersonActions({ employeeId, manages }: { employeeId: string; manages: boolean }) {
  const close = useDrillStore((s) => s.close)
  const { org } = useAnalytics()
  return (
    <div className="flex flex-wrap gap-2">
      {manages && (
        <Button
          onClick={() => {
            // The same merge, history entry and Undo as "Filter to" in the records panel.
            focusScope({ leaderId: employeeId }, { mode: 'include', org })
          }}
        >
          Focus on their org
        </Button>
      )}
      <Button
        onClick={() => {
          close()
          openInOrgChart(employeeId)
        }}
      >
        Show in org chart
      </Button>
      <Tag tone="outline">ID {employeeId}</Tag>
    </div>
  )
}
