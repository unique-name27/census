/**
 * Exit simulation (the old tool's ExitSimModal, without invented numbers): if this person left,
 * where their team would go, what that does to their manager's span, and who among their direct
 * reports could step up (rated 4 or 5 in the latest review cycle). Every count lists its people;
 * each possible successor opens their person card.
 */
import { Button, Dialog, StatusPill } from '@/components'
import { RATING_LABELS } from '@/data/schema'
import { Drill, openPerson } from '@/drill'
import { DASH, plural } from '@/lib/format'
import {
  type DrillScope,
  directsDrill,
  exitImpact,
  type OrgModel,
  type OrgTree,
  orgDrill,
  peopleDrill,
  scopeLine,
  WIDE_SPAN,
} from '../engine'

export function ExitDialog({
  model,
  tree,
  id,
  scope,
  onClose,
  onAddToScenario,
}: {
  model: OrgModel
  tree: OrgTree
  id: string | null
  /** Where the numbers come from, for the drill subtitles. */
  scope: DrillScope
  onClose: () => void
  /** Sandbox only: record the exit as a scenario step. */
  onAddToScenario?: (id: string) => void
}) {
  const e = id ? tree.people.get(id) : undefined
  const x = e && id ? exitImpact(tree, id, model.reviews) : null
  const name = (pid: string | null) => (pid ? (tree.people.get(pid)?.name ?? pid) : '')
  const sub = scopeLine(scope)
  const list = (ids: readonly string[], title: string, note?: string) => () =>
    peopleDrill(tree, ids, { title, subtitle: sub, note, columns: ['directs', 'totalOrg'] })
  return (
    <Dialog
      open={!!x}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      title={e ? `If ${e.name} left` : 'Exit simulation'}
      description={e ? `${e.jobTitle} · ${e.department} · ${e.location}` : undefined}
      width={560}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {onAddToScenario && x?.managerId && (
            <Button variant="primary" onClick={() => onAddToScenario(x.personId)}>
              Add exit to scenario
            </Button>
          )}
        </>
      }
    >
      {x && (
        <div className="space-y-5 text-[13px]">
          <section>
            <h4 className="eyebrow mb-1.5">Their team</h4>
            {x.directs.length && e ? (
              <p>
                <Drill spec={() => directsDrill(tree, x.personId, scope)}>
                  {plural(x.directs.length, 'direct report')}
                </Drill>{' '}
                (
                <Drill spec={() => orgDrill(tree, x.personId, scope)}>
                  {plural(x.orgSize, 'person', 'people')}
                </Drill>{' '}
                in the org) would roll up to{' '}
                {x.managerId ? <strong className="font-semibold">{name(x.managerId)}</strong> : 'nobody'}.
              </p>
            ) : (
              <p>
                No direct reports. {x.managerId ? `${name(x.managerId)} would have one fewer report.` : ''}
              </p>
            )}
            {x.managerSpan && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="tnum">
                  {name(x.managerId)}'s span:{' '}
                  <Drill
                    spec={list(x.peerIds.concat(x.personId), `${name(x.managerId)}'s direct reports today`)}
                  >
                    {x.managerSpan.before}
                  </Drill>{' '}
                  →{' '}
                  <strong>
                    <Drill
                      spec={list(
                        x.managerTeamAfter,
                        `${name(x.managerId)}'s direct reports if ${e?.name ?? 'they'} left`,
                        `${plural(x.peers, 'peer')} already on the team, plus ${plural(x.directs.length, 'direct report')} of ${e?.name ?? 'this person'} who would roll up.`,
                      )}
                    >
                      {x.managerSpan.after}
                    </Drill>
                  </strong>{' '}
                  direct reports
                </span>
                {x.wideAfter && <StatusPill severity="warning" label={`At or above ${WIDE_SPAN}`} />}
                {x.managerSpan.after === 1 && <StatusPill severity="info" label="Span of 1" />}
              </div>
            )}
            {x.peers > 0 && (
              <p className="mt-2 text-ink-2">
                <Drill spec={list(x.peerIds, `Peers of ${e?.name ?? 'this person'}`)}>
                  {plural(x.peers, 'peer')}
                </Drill>{' '}
                on the same team would lose a teammate.
              </p>
            )}
          </section>

          {x.directs.length > 0 && (
            <section>
              <h4 className="eyebrow mb-1.5">Who could step up</h4>
              {x.cycle ? (
                x.backfills.length ? (
                  <>
                    <p className="mb-2 text-ink-2">Direct reports rated 4 or 5 in {x.cycle}.</p>
                    <ul className="divide-y divide-rule rounded-control shadow-[0_0_0_1px_var(--rule)]">
                      {x.backfills.map((b) => {
                        const r = tree.people.get(b.id)!
                        return (
                          <li key={b.id} className="flex items-baseline gap-3 px-3 py-2">
                            <span className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => openPerson(b.id)}
                                className="block max-w-full truncate text-left font-medium text-link hover:underline"
                              >
                                {r.name}
                              </button>
                              <span className="block truncate text-[12px] text-muted">
                                {r.jobTitle} · {r.level ?? ''}
                              </span>
                            </span>
                            <span className="shrink-0 text-right text-[12px] text-ink-2">
                              {b.rating} {RATING_LABELS[b.rating]}
                              <span className="block text-muted">Potential {b.potential ?? DASH}</span>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                ) : (
                  <p className="text-ink-2">No direct report was rated 4 or 5 in {x.cycle}.</p>
                )
              ) : (
                <p className="text-ink-2">
                  No review cycle on record before this date, so there are no ratings to go on.
                </p>
              )}
              {x.cycle && x.unrated > 0 && (
                <p className="mt-2 text-[12px] text-muted">
                  <Drill
                    spec={list(
                      x.unratedIds,
                      `Direct reports of ${e?.name ?? 'this person'} with no ${x.cycle} rating`,
                    )}
                  >
                    {plural(x.unrated, 'direct report')}
                  </Drill>{' '}
                  {x.unrated === 1 ? 'has' : 'have'} no rating in {x.cycle}.
                </p>
              )}
            </section>
          )}
          <p className="text-[12px] text-muted">
            This is a what-if. Nothing changes in the data
            {onAddToScenario ? ' unless you add it to the scenario, which also stays in this browser' : ''}.
          </p>
        </div>
      )}
    </Dialog>
  )
}
