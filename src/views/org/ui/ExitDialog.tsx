/**
 * Exit simulation (the old tool's ExitSimModal, without invented numbers): if this person left,
 * where their team would go, what that does to their manager's span, and who among their direct
 * reports could step up (rated 4 or 5 in the latest review cycle).
 */
import { Button, Dialog, StatusPill } from '@/components'
import { RATING_LABELS } from '@/data/schema'
import { DASH, plural } from '@/lib/format'
import { exitImpact, type OrgModel, type OrgTree, WIDE_SPAN } from '../engine'

export function ExitDialog({
  model,
  tree,
  id,
  onClose,
  onAddToScenario,
}: {
  model: OrgModel
  tree: OrgTree
  id: string | null
  onClose: () => void
  /** Sandbox only: record the exit as a scenario step. */
  onAddToScenario?: (id: string) => void
}) {
  const e = id ? tree.people.get(id) : undefined
  const x = e && id ? exitImpact(tree, id, model.reviews) : null
  const name = (pid: string | null) => (pid ? (tree.people.get(pid)?.name ?? pid) : '')
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
            {x.directs.length ? (
              <p>
                {plural(x.directs.length, 'direct report')} ({plural(x.orgSize, 'person', 'people')} in the
                org) would roll up to{' '}
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
                  {name(x.managerId)}’s span: {x.managerSpan.before} → <strong>{x.managerSpan.after}</strong>{' '}
                  direct reports
                </span>
                {x.wideAfter && <StatusPill severity="warning" label={`At or above ${WIDE_SPAN}`} />}
                {x.managerSpan.after === 1 && <StatusPill severity="info" label="Span of 1" />}
              </div>
            )}
            {x.peers > 0 && (
              <p className="mt-2 text-ink-2">
                {plural(x.peers, 'peer')} on the same team would lose a teammate.
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
                              <span className="block truncate font-medium text-ink">{r.name}</span>
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
                  {plural(x.unrated, 'direct report has', 'direct reports have')} no rating in {x.cycle}.
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
