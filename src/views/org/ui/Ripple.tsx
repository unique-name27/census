/**
 * Ripple preview of a proposed move or exit (the old tool's ReorgRipplePreview): who gains and loses
 * reports, how many people move, and any warnings; a blocked move says why.
 */
import { SeverityIcon, StatusPill } from '@/components'
import { cx } from '@/components/ui'
import { plural } from '@/lib/format'
import type { OrgTree, Ripple } from '../engine'

export function RipplePreview({
  tree,
  ripple,
  compact,
}: {
  tree: OrgTree
  ripple: Ripple
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
  const rows: { label: string; before: number; after: number }[] = []
  if (ripple.oldManager)
    rows.push({
      label: name(ripple.oldManager.id),
      before: ripple.oldManager.before,
      after: ripple.oldManager.after,
    })
  if (ripple.newManager)
    rows.push({
      label: name(ripple.newManager.id),
      before: ripple.newManager.before,
      after: ripple.newManager.after,
    })

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
            {a.mode === 'team'
              ? ` and ${plural(ripple.peopleMoving - 1, 'person', 'people')} in their org`
              : ''}{' '}
            move to <strong className="font-semibold">{name(a.toManagerId)}</strong>.
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
                <tr key={r.label} className="border-t border-rule first:border-t-0">
                  <th scope="row" className="truncate py-1 pr-2 text-left font-normal text-ink-2">
                    {r.label}
                  </th>
                  <td className="tnum py-1 text-right whitespace-nowrap text-ink">
                    {r.before} → <strong className="font-semibold">{r.after}</strong>
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
          {plural(ripple.rolledUp.length, 'direct report rolls', 'direct reports roll')} up to{' '}
          {name(ripple.oldManager?.id) || 'the top level'}.
        </p>
      )}
      {!compact && ripple.crossDept > 0 && a.kind === 'move' && (
        <p className="text-[12px] text-ink-2">
          {plural(ripple.crossDept, 'person', 'people')} would report into{' '}
          {tree.people.get(a.toManagerId)?.department} from another department. Department, title and cost
          center stay as they are in the data.
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
