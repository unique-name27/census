/**
 * Detail panel for the selected card: person facts, flags, the manager chain, direct reports, team
 * stats, the latest rating and potential when reviews exist, and the next steps (focus this org,
 * open the same org in People stats or Talent, simulate an exit, make a slide, and in the
 * sandbox, move the person). Every team figure opens the people behind it, and "Person card"
 * opens everything Census knows about the person. Hovering a team figure shows its definition from
 * the metric dictionary; the exits window and the anonymity minimum are the settings in force.
 */
import { type ReactNode, useState } from 'react'
import { Button, goTo, IconButton, IconChevronRight, IconClose, IconExternal, StatusPill } from '@/components'
import { useAnalytics } from '@/data/context'
import type { Employee, Requisition } from '@/data/schema'
import { RATING_LABELS } from '@/data/schema'
import { useCensus } from '@/data/store'
import { Drill, type DrillSource, drillSpec, openPerson } from '@/drill'
import { formatDate } from '@/lib/dates'
import { DASH, fmt, plural } from '@/lib/format'
import { tenureYears } from '@/lib/people'
import {
  chainNames,
  type DrillScope,
  defText,
  directsDrill,
  type Flag,
  leaversDrill,
  monthsText,
  type OrgModel,
  type OrgTree,
  orgDrill,
  orgFilter,
  peopleDrill,
  ratingOf,
  scopeLine,
  teamStats,
} from '../engine'
import { ORG_METRIC } from '../metrics'

export interface DetailPanelProps {
  model: OrgModel
  /** The tree shown (the scenario tree in the sandbox). */
  tree: OrgTree
  id: string
  employees: readonly Employee[]
  mode: 'chart' | 'sandbox'
  /** Where the panel's numbers come from, for the drill subtitles. */
  scope: DrillScope
  onClose: () => void
  onJump: (id: string) => void
  onFocus?: (id: string) => void
  onExit: (id: string) => void
  onMove?: (id: string) => void
  onSlides?: (id: string) => void
}

export function DetailPanel(p: DetailPanelProps) {
  const [allReports, setAllReports] = useState(false)
  const setFilters = useCensus((s) => s.setFilters)
  const { metrics } = useAnalytics()
  const e = p.tree.people.get(p.id)
  if (!e) return null
  const t = p.tree
  const asOf = t.asOf
  const directs = t.children.get(p.id) ?? []
  const managerId = t.parent.get(p.id) ?? null
  const manager = managerId ? t.people.get(managerId) : undefined
  const flags: readonly Flag[] = p.model.flags.get(p.id) ?? []
  const chain = chainNames(t, p.id).slice(0, -1)
  const isManager = directs.length > 0
  const { rules } = p.model
  const stats = isManager ? teamStats(t, p.id, p.employees, p.model.reqs.get(p.id)?.length ?? 0, rules) : null
  const months = monthsText(rules.exitMonths)
  const rating = p.model.reviews.cycles.length ? ratingOf(p.model.reviews, p.id, asOf) : null
  const shown = allReports ? directs : directs.slice(0, 8)

  const openIn = (view: 'hrbp' | 'talent') => {
    setFilters({ leaderId: p.id })
    goTo(view)
  }

  const sc = p.scope
  const reqRows = (p.model.reqs.get(p.id) ?? [])
    .map((r) => p.model.reqRecords.get(r.reqId))
    .filter((r): r is Requisition => !!r)
  const drills = stats && {
    directs: () => directsDrill(t, p.id, sc),
    org: () => orgDrill(t, p.id, sc),
    // The average is over the person's org: "Filter to" their org keeps it.
    tenure: stats.ids.tenure.length
      ? () => {
          const spec = peopleDrill(t, stats.ids.tenure, {
            title: `Tenure in ${e.name}'s org`,
            subtitle: scopeLine(sc),
            columns: ['directs'],
            note: `Average tenure = ${fmt(stats.avgTenure, 'years')} across ${plural(stats.ids.tenure.length, 'person', 'people')}. Tenure is the measured value.`,
          })
          const filter = orgFilter(p.id, sc)
          return spec && filter ? { ...spec, filter } : spec
        }
      : null,
    contingent: () =>
      peopleDrill(t, stats.ids.contingent, {
        title: `Contractors and interns reporting to ${e.name}`,
        subtitle: scopeLine(sc),
      }),
    exits: () => leaversDrill(e.name, stats.exits, false, sc, stats.exitMonths),
    regretted: () => leaversDrill(e.name, stats.regretted, true, sc, stats.exitMonths),
    reqs: reqRows.length
      ? () =>
          drillSpec({
            kind: 'requisitions',
            title: `Open requisitions with ${e.name} as hiring manager`,
            subtitle: scopeLine(sc),
            rows: reqRows,
            hide: ['filledDate'],
          })
      : null,
  }

  return (
    <aside aria-label={`Details for ${e.name}`} className="flex min-h-0 flex-col text-[13px]">
      <header className="flex items-start gap-2 border-b border-rule px-4 pt-3 pb-3">
        <div className="min-w-0 flex-1">
          <h3 className="cut-head text-[16px] leading-tight font-semibold text-ink">{e.name}</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{e.jobTitle}</p>
          <p className="mt-1 font-mono text-[12px] text-muted">{e.employeeId}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => openPerson(p.id)} className="-mt-0.5 shrink-0">
          Person card
        </Button>
        <IconButton label="Close details" size="sm" onClick={p.onClose} className="-mt-0.5 -mr-1.5">
          <IconClose />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {flags.length > 0 && (
          <ul className="mt-3 space-y-2">
            {flags.map((f) => (
              <li key={f.kind} className="flex flex-col items-start gap-1">
                <StatusPill severity={f.severity} label={f.label} />
                <span className="text-[12px] leading-snug text-ink-2">{f.detail}</span>
              </li>
            ))}
          </ul>
        )}

        <dl className="mt-3 grid grid-cols-[minmax(0,7.5rem)_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          <Fact term="Level" value={e.level ?? DASH} />
          <Fact term="Department" value={e.department} />
          <Fact term="Business unit" value={e.businessUnit} />
          <Fact term="Location" value={e.location} />
          <Fact term="Worker type" value={e.employmentType ?? DASH} />
          <Fact
            term="Hire date"
            value={`${formatDate(e.hireDate)} · ${fmt(tenureYears(e, asOf), 'years')}`}
          />
          {e.hrbp && <Fact term="HR business partner" value={e.hrbp} />}
          <dt className="text-muted">Manager</dt>
          <dd className="min-w-0">
            {manager ? (
              <button
                type="button"
                className="text-left text-link hover:underline"
                onClick={() => p.onJump(manager.employeeId)}
              >
                {manager.name}
              </button>
            ) : (
              <span className="text-ink-2">Top of the chart</span>
            )}
          </dd>
          {rating && (
            <>
              <dt className="text-muted">Latest rating</dt>
              <dd>
                {rating.rating} {RATING_LABELS[rating.rating] ?? ''}
                <span className="text-muted"> · {rating.cycle}</span>
              </dd>
              <dt className="text-muted">Potential</dt>
              <dd>
                {rating.potential ?? DASH}
                {rating.potentialCycle && <span className="text-muted"> · {rating.potentialCycle}</span>}
              </dd>
            </>
          )}
        </dl>

        {chain.length > 0 && (
          <section className="mt-4">
            <h4 className="eyebrow mb-1.5">Reporting line</h4>
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[12px]">
              {chain.map((c, i) => (
                <li key={c.id} className="flex items-center gap-1">
                  <button type="button" className="text-link hover:underline" onClick={() => p.onJump(c.id)}>
                    {c.name}
                  </button>
                  {i < chain.length - 1 && <IconChevronRight className="size-3 text-muted" />}
                </li>
              ))}
            </ol>
          </section>
        )}

        {stats && drills && (
          <section className="mt-4">
            <h4 className="eyebrow mb-1.5">Team</h4>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control bg-rule">
              <Stat
                label="Direct reports"
                value={fmt(stats.directs, 'int')}
                title={defText(metrics, ORG_METRIC.directReports)}
                drill={drills.directs}
              />
              <Stat
                label="Total org"
                value={fmt(stats.totalOrg, 'int')}
                title={defText(metrics, ORG_METRIC.totalOrg)}
                drill={drills.org}
              />
              <Stat
                label="Average tenure"
                value={stats.avgTenure == null ? DASH : fmt(stats.avgTenure, 'years')}
                title={
                  stats.avgTenure == null
                    ? `Hidden to protect anonymity (n < ${rules.minGroup})`
                    : defText(metrics, ORG_METRIC.teamTenure)
                }
                drill={drills.tenure}
              />
              <Stat
                label="Contractors, interns"
                value={fmt(stats.contingentDirects, 'int')}
                title={defText(metrics, ORG_METRIC.teamContingent)}
                drill={stats.contingentDirects ? drills.contingent : null}
              />
              <Stat
                label={`Exits, ${months}`}
                value={fmt(stats.exits12, 'int')}
                title={defText(metrics, ORG_METRIC.teamExits)}
                drill={stats.exits12 ? drills.exits : null}
              />
              <Stat
                label={`Regretted, ${months}`}
                value={fmt(stats.regrettedExits12, 'int')}
                title={defText(metrics, ORG_METRIC.teamRegretted)}
                drill={stats.regrettedExits12 ? drills.regretted : null}
              />
              {/* Like the open-role cards, left out when Requisitions is below the data standard. */}
              {stats.openReqs > 0 && p.model.gates.reqCards.ok && (
                <Stat
                  label="Open roles"
                  value={fmt(stats.openReqs, 'int')}
                  title={defText(metrics, ORG_METRIC.openRoles)}
                  drill={drills.reqs}
                />
              )}
            </dl>
          </section>
        )}

        {isManager && (
          <section className="mt-4">
            <h4 className="eyebrow mb-1.5">
              Direct reports ·{' '}
              <Drill spec={drills?.directs} label={`Show ${e.name}'s ${directs.length} direct reports`}>
                {fmt(directs.length, 'int')}
              </Drill>
            </h4>
            <ul className="divide-y divide-rule">
              {shown.map((id) => {
                const r = t.people.get(id)!
                const n = t.total.get(id) ?? 0
                return (
                  <li key={id} className="flex items-baseline gap-2">
                    <button
                      type="button"
                      onClick={() => p.onJump(id)}
                      className="min-w-0 flex-1 rounded-[3px] px-1 py-1.5 text-left hover:bg-hover"
                    >
                      <span className="block truncate text-ink">{r.name}</span>
                      <span className="block truncate text-[12px] text-muted">{r.jobTitle}</span>
                    </button>
                    {n > 0 && (
                      <Drill
                        spec={() => orgDrill(t, id, sc)}
                        label={`Show the ${n} people in ${r.name}'s org`}
                        className="tnum shrink-0 text-[12px] text-muted"
                      >
                        {fmt(n, 'int')} org
                      </Drill>
                    )}
                  </li>
                )
              })}
            </ul>
            {directs.length > shown.length && (
              <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={() => setAllReports(true)}>
                Show all {directs.length}
              </Button>
            )}
          </section>
        )}

        <section className="mt-5 flex flex-wrap gap-2">
          {p.mode === 'sandbox' && p.onMove && (
            <Button size="sm" variant="primary" onClick={() => p.onMove?.(p.id)}>
              Move to…
            </Button>
          )}
          {p.mode === 'chart' && isManager && p.onFocus && (
            <Button size="sm" onClick={() => p.onFocus?.(p.id)}>
              Focus on this org
            </Button>
          )}
          {managerId && (
            <Button size="sm" onClick={() => p.onExit(p.id)}>
              Simulate exit
            </Button>
          )}
          {isManager && p.onSlides && (
            <Button size="sm" onClick={() => p.onSlides?.(p.id)}>
              Make slide
            </Button>
          )}
        </section>

        {isManager && p.mode === 'chart' && (
          <section className="mt-4 border-t border-rule pt-3">
            <h4 className="eyebrow mb-1">See this org elsewhere</h4>
            <p className="mb-1.5 text-[12px] text-muted">
              Sets the leader filter to {e.name} for every view.
            </p>
            <div className="flex flex-col items-start gap-0.5">
              <LinkButton onClick={() => openIn('hrbp')}>Open in People stats</LinkButton>
              <LinkButton onClick={() => openIn('talent')}>Open in Talent</LinkButton>
            </div>
          </section>
        )}

        <p className="mt-4 text-[12px] text-muted">
          {plural(directs.length, 'direct report')} · as of {formatDate(asOf)}
        </p>
      </div>
    </aside>
  )
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{term}</dt>
      <dd className="min-w-0 text-ink">{value}</dd>
    </>
  )
}

function Stat({
  label,
  value,
  title,
  drill,
}: {
  label: string
  value: string
  title?: string
  /** The records behind the value; suppressed and zero values pass null and stay plain. */
  drill?: DrillSource
}) {
  let shown: ReactNode = value
  if (drill && value !== DASH) {
    shown = (
      <Drill spec={drill} label={`${label}: show the records behind ${value}`}>
        {value}
      </Drill>
    )
  }
  return (
    <div className="bg-sheet px-2.5 py-2" title={title}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="cut-head mt-0.5 text-[16px] font-semibold text-ink">{shown}</dd>
    </div>
  )
}

function LinkButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[13px] text-link hover:underline"
    >
      {children}
      <IconExternal className="size-3.5" />
    </button>
  )
}
