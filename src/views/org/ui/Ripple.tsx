/**
 * Ripple preview of a proposed move or exit (the old tool's ReorgRipplePreview): who gains and loses
 * reports, who moves (up to 12 names), who would report across departments, and any warnings; a
 * blocked move says why. With a `scope`, every count opens the people behind it (the move dialog);
 * while dragging the same numbers are plain text.
 */
import { SeverityIcon, StatusPill } from '@/components'
import { cx } from '@/components/ui'
import { Drill } from '@/drill'
import { plural } from '@/lib/format'
import { type DrillScope, type OrgTree, peopleDrill, type Ripple, rippleTeams, scopeLine } from '../engine'

const NAMES_SHOWN = 12

export function RipplePreview({
  tree,
  ripple,
  scope,
  compact,
}: {
  tree: OrgTree
  ripple: Ripple
  /** Makes the counts open their people. */
  scope?: DrillScope
  compact?: boolean
}) {
  const name = (id: string | null | undefined) => (id ? (tree.people.get(id)?.name ?? id) : '')
  const a = ripple.action
  if (!ripple.ok) {
    return (
      <div className="flex gap-2 rounded-control bg-critical-wash px-3 py-2.5 text-[13px]">
        <SeverityIcon severity="critical" className="mt-0.5 size-4 shrink-0" />
        <div>
          <div className="font-semibold text-ink">Blocked</div>
          <p className="mt-0.5 text-ink-2">{ripple.reason}</p>
        </div>
      </div>
    )
  }
  const list = (ids: readonly string[], title: string, note?: string) =>
    scope
      ? () =>
          peopleDrill(tree, ids, {
            title,
            subtitle: scopeLine(scope),
            note,
            columns: ['directs', 'totalOrg'],
          })
      : null
  const teams = rippleTeams(tree, ripple)
  const rows: { id: string; label: string; before: number; after: number; afterIds: string[] }[] = []
  if (ripple.oldManager)
    rows.push({
      id: ripple.oldManager.id,
      label: name(ripple.oldManager.id),
      before: ripple.oldManager.before,
      after: ripple.oldManager.after,
      afterIds: teams.oldAfter,
    })
  if (ripple.newManager)
    rows.push({
      id: ripple.newManager.id,
      label: name(ripple.newManager.id),
      before: ripple.newManager.before,
      after: ripple.newManager.after,
      afterIds: teams.newAfter,
    })
  const others = ripple.movingIds.filter((id) => id !== a.personId)
  const what = a.kind === 'exit' ? `if ${name(a.personId)} left` : 'after the move'

  return (
    <div className="space-y-3 text-[13px]">
      <p className="text-ink">
        {a.kind === 'exit' ? (
          <>
            <strong className="font-semibold">{name(a.personId)}</strong> leaves; their reports roll up.
          </>
        ) : (
          <>
            <strong className="font-semibold">{name(a.personId)}</strong>
            {a.mode === 'team' && others.length > 0 && (
              <>
                {' and '}
                <Drill spec={list(others, `People moving with ${name(a.personId)}`)}>
                  {plural(others.length, 'person', 'people')}
                </Drill>
                {' in their org'}
              </>
            )}{' '}
            {a.mode === 'team' && others.length > 0 ? 'move' : 'moves'} to{' '}
            <strong className="font-semibold">{name(a.toManagerId)}</strong>.
          </>
        )}
      </p>
      {rows.length > 0 && (
        <table className="w-full text-[13px]">
          <caption className="eyebrow mb-1 text-left">Direct reports</caption>
          <tbody>
            {rows.map((r) => {
              const d = r.after - r.before
              return (
                <tr key={r.id} className="border-t border-rule first:border-t-0">
                  <th scope="row" className="truncate py-1 pr-2 text-left font-normal text-ink-2">
                    {r.label}
                  </th>
                  <td className="tnum py-1 text-right whitespace-nowrap text-ink">
                    <Drill spec={list(tree.children.get(r.id) ?? [], `${r.label}'s direct reports today`)}>
                      {r.before}
                    </Drill>{' '}
                    →{' '}
                    <strong className="font-semibold">
                      <Drill spec={list(r.afterIds, `${r.label}'s direct reports ${what}`)}>{r.after}</Drill>
                    </strong>
                  </td>
                  <td
                    className={cx(
                      'tnum w-10 py-1 text-right text-[12px]',
                      d === 0 ? 'text-muted' : 'text-ink-2',
                    )}
                  >
                    {d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '±0'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {ripple.rolledUp.length > 0 && (
        <p className="text-[12px] text-ink-2">
          <Drill spec={list(ripple.rolledUp, `Direct reports of ${name(a.personId)} who roll up`)}>
            {plural(ripple.rolledUp.length, 'direct report')}
          </Drill>{' '}
          {ripple.rolledUp.length === 1 ? 'rolls' : 'roll'} up to{' '}
          {name(ripple.oldManager?.id) || 'the top level'}.
        </p>
      )}
      {!compact && a.kind === 'move' && a.mode === 'team' && others.length > 0 && (
        <div className="text-[12px] text-ink-2">
          <div className="eyebrow mb-0.5">Moving with them</div>
          <p>
            {others
              .slice(0, NAMES_SHOWN)
              .map((id) => name(id))
              .join(', ')}
            {others.length > NAMES_SHOWN && (
              <>
                {', and '}
                <Drill spec={list(others.slice(NAMES_SHOWN), `More people moving with ${name(a.personId)}`)}>
                  {plural(others.length - NAMES_SHOWN, 'more', 'more')}
                </Drill>
              </>
            )}
            .
          </p>
        </div>
      )}
      {!compact && ripple.crossDept > 0 && (
        <p className="text-[12px] text-ink-2">
          <Drill
            spec={list(
              ripple.crossDeptIds,
              'People who would report to a manager in another department',
              'Department, title and cost center stay as they are in the data.',
            )}
          >
            {plural(ripple.crossDept, 'person', 'people')}
          </Drill>{' '}
          would report to a manager in another department (
          {ripple.crossDeptIds
            .slice(0, 3)
            .map((id) => {
              const to = ripple.changes.find((c) => c.id === id)?.to
              return `${name(id)}, ${tree.people.get(id)?.department ?? ''} → ${to ? (tree.people.get(to)?.department ?? '') : ''}`
            })
            .join('; ')}
          {ripple.crossDept > 3 ? '; …' : ''}). Department, title and cost center stay as they are in the
          data.
        </p>
      )}
      {ripple.warnings.length > 0 && (
        <ul className="space-y-1.5">
          {ripple.warnings.map((w) => (
            <li key={w} className="flex flex-col items-start gap-1">
              <StatusPill severity="warning" label="Check" />
              <span className="text-[12px] text-ink-2">{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
