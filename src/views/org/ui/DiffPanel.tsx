/**
 * Scenario diff (the old tool's ScenarioDiffModal, as a sheet): what the scenario changes against
 * the org on the as-of date. Spans, layers, managers gaining their first report or losing their
 * last, new span outliers, people reporting across departments, and moves that were blocked.
 */
import type { ReactNode } from 'react'
import { SeverityIcon, StatusPill, spanClass } from '@/components'
import { cx } from '@/components/ui'
import { DASH, fmt, plural } from '@/lib/format'
import type { ScenarioDiff } from '../engine'
import type { BlockedAttempt } from './state'

export function DiffPanel({
  diff,
  blocked,
  describe,
  onJump,
  onClearBlocked,
}: {
  diff: ScenarioDiff
  blocked: readonly BlockedAttempt[]
  describe: (b: BlockedAttempt) => string
  onJump: (id: string) => void
  onClearBlocked: () => void
}) {
  const empty = !diff.reportingChanges.length && !diff.removed.length
  return (
    <section
      aria-labelledby="org-diff-title"
      className={cx(spanClass(7), 'rounded-sheet bg-sheet px-4 pt-3.5 pb-4')}
    >
      <h3 id="org-diff-title" className="cut-head text-[15px] leading-snug font-semibold">
        Scenario compared with today
      </h3>
      <p className="mt-0.5 text-[13px] text-ink-2">
        What the moves change against the org on the as-of date.
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-control bg-rule sm:grid-cols-3">
        <Tile label="People changing manager" value={fmt(diff.reportingChanges.length, 'int')} />
        <Tile label="Spans that change" value={fmt(diff.spanChanges.length, 'int')} />
        <Tile label="Exits" value={fmt(diff.removed.length, 'int')} />
        <Tile
          label="People managers"
          before={diff.managers.before}
          after={diff.managers.after}
          format="int"
        />
        <Tile label="Average span" before={diff.avgSpan.before} after={diff.avgSpan.after} format="num1" />
        <Tile label="Layers" before={diff.layers.before} after={diff.layers.after} format="int" />
      </dl>

      {empty ? (
        <p className="mt-4 text-[13px] text-muted">
          No changes yet. Drag a card onto a new manager to start.
        </p>
      ) : (
        <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <List
            title="First direct report"
            empty="Nobody becomes a manager."
            items={diff.managersCreated.map((m) => ({
              id: m.id,
              text: m.name,
              note: plural(m.directs, 'report'),
            }))}
            onJump={onJump}
          />
          <List
            title="No direct reports left"
            empty="No manager loses their whole team."
            items={diff.managersEmptied.map((m) => ({ id: m.id, text: m.name, note: `had ${m.before}` }))}
            onJump={onJump}
          />
          <List
            title="New wide spans (12+)"
            empty="No new wide spans."
            severity="warning"
            items={diff.newWideSpans.map((m) => ({
              id: m.id,
              text: m.name,
              note: plural(m.directs, 'report'),
            }))}
            onJump={onJump}
          />
          <List
            title="New spans of 1"
            empty="No new spans of 1."
            severity="info"
            items={diff.newSpansOfOne.map((m) => ({ id: m.id, text: m.name }))}
            onJump={onJump}
          />
          <List
            title="Reporting across departments"
            empty="Everyone moved stays within their department."
            items={diff.crossDept.map((c) => ({
              id: c.id,
              text: c.name,
              note: `${c.department} → ${c.managerDepartment}`,
            }))}
            onJump={onJump}
          />
          <div>
            <h4 className="eyebrow mb-1.5">People per layer</h4>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[11px] text-muted">
                  <th scope="col" className="pb-0.5 text-left font-normal">
                    <span className="sr-only">Layer</span>
                  </th>
                  <th scope="col" className="pb-0.5 text-right font-normal">
                    Today
                  </th>
                  <th scope="col" className="pb-0.5 text-right font-normal">
                    Scenario
                  </th>
                </tr>
              </thead>
              <tbody>
                {diff.layers.byDepth.map((l) => (
                  <tr key={l.layer} className="border-t border-rule first:border-t-0">
                    <th scope="row" className="py-0.5 text-left font-normal text-muted">
                      Layer {l.layer}
                    </th>
                    <td className="tnum py-0.5 text-right text-ink-2">{fmt(l.before, 'int')}</td>
                    <td
                      className={cx(
                        'tnum py-0.5 pl-3 text-right',
                        l.after !== l.before ? 'font-semibold text-ink' : 'text-ink-2',
                      )}
                    >
                      {fmt(l.after, 'int')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {blocked.length > 0 && (
        <div className="mt-5 border-t border-rule pt-3">
          <div className="mb-1.5 flex items-center gap-2">
            <h4 className="eyebrow">Blocked moves</h4>
            <button
              type="button"
              onClick={onClearBlocked}
              className="ml-auto text-[12px] text-link hover:underline"
            >
              Clear
            </button>
          </div>
          <ul className="space-y-2">
            {blocked.slice(0, 5).map((b, i) => (
              <li key={i} className="flex gap-2 text-[12px]">
                <SeverityIcon severity="critical" className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <span className="font-medium text-ink">{describe(b)}.</span>{' '}
                  <span className="text-ink-2">{b.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Tile({
  label,
  value,
  before,
  after,
  format,
}: {
  label: string
  value?: string
  before?: number | null
  after?: number | null
  format?: 'int' | 'num1'
}) {
  const changed = before !== undefined && before !== after
  return (
    <div className="bg-sheet px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="cut-head mt-0.5 text-[18px] font-semibold text-ink">
        {value ??
          (changed ? (
            <span className="tnum">
              <span className="text-[14px] font-normal text-muted">{fmt(before, format)} → </span>
              {fmt(after, format)}
            </span>
          ) : (
            (fmt(after, format) ?? DASH)
          ))}
      </dd>
    </div>
  )
}

function List({
  title,
  items,
  empty,
  severity,
  onJump,
}: {
  title: string
  items: { id: string; text: string; note?: string }[]
  empty: string
  severity?: 'warning' | 'info'
  onJump: (id: string) => void
}) {
  let body: ReactNode
  if (!items.length) body = <p className="text-[12px] text-muted">{empty}</p>
  else
    body = (
      <ul className="space-y-0.5 text-[13px]">
        {items.slice(0, 6).map((it) => (
          <li key={it.id} className="flex items-baseline gap-2">
            <button
              type="button"
              className="truncate text-left text-link hover:underline"
              onClick={() => onJump(it.id)}
            >
              {it.text}
            </button>
            {it.note && <span className="shrink-0 text-[12px] text-muted">{it.note}</span>}
          </li>
        ))}
        {items.length > 6 && <li className="text-[12px] text-muted">and {items.length - 6} more</li>}
      </ul>
    )
  return (
    <div>
      <h4 className="eyebrow mb-1.5 flex items-center gap-1.5">
        {title}
        {severity && items.length > 0 && (
          <StatusPill severity={severity} label={String(items.length)} quiet />
        )}
      </h4>
      {body}
    </div>
  )
}
