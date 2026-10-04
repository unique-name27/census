/**
 * The change log: what changed, from what to what, when and by whom, newest first. A change can
 * be undone while it is the latest for its field and still in force; undoing it is logged too,
 * and an undo can itself be taken back (Redo).
 * One metric's entries in its detail panel, every metric's on the overview.
 */
import { useState } from 'react'
import { Figure } from '@/charts'
import { Button } from '@/components/ui'
import type { FieldRef } from '@/data/quality/fieldRef'
import { useCensus } from '@/data/store'
import { CHANGE_COLUMNS, type ChangeRow, whenText } from '../model'

const FIRST = 8

export function ChangeLog({
  id,
  title = 'Change log',
  rows,
  by,
  uses,
  showMetric,
  onOpenMetric,
  className,
}: {
  id: string
  title?: string
  rows: readonly ChangeRow[]
  /** Your name, logged with an undo. */
  by: string
  uses: readonly FieldRef[]
  /** Name the metric on each entry (the overview lists every metric's changes). */
  showMetric?: boolean
  onOpenMetric?: (id: string) => void
  className?: string
}) {
  const [all, setAll] = useState(false)
  const undo = useCensus((s) => s.undoMetricChange)
  const shown = all ? rows : rows.slice(0, FIRST)
  const exportRows = rows.map((r) => ({ ...r, at: whenText(r.at) }))
  return (
    <Figure
      id={id}
      title={title}
      subtitle={
        rows.length
          ? `${rows.length.toLocaleString('en-US')} ${rows.length === 1 ? 'entry' : 'entries'}, newest first`
          : 'Who changed what, and when'
      }
      data={exportRows}
      columns={CHANGE_COLUMNS}
      image={false}
      tableToggle={false}
      gate={false}
      uses={uses}
      className={className}
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-2">
          No changes yet. Edit the wording, the target or a setting and the change appears here with who made
          it and when.
        </p>
      ) : (
        <>
          <ol className="divide-y divide-rule">
            {shown.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 first:pt-0">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-[13px] leading-snug text-ink">
                    {showMetric && onOpenMetric ? (
                      <button
                        type="button"
                        onClick={() => onOpenMetric(c.metricId)}
                        className="rounded-[2px] text-left text-link underline-offset-2 hover:underline"
                      >
                        {c.what}
                      </button>
                    ) : (
                      c.what
                    )}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {whenText(c.at)} · by {c.by} · {c.kindText}
                  </p>
                  {c.wording && (
                    <details className="mt-1 text-[12px] leading-snug">
                      <summary className="cursor-pointer text-ink-2 hover:text-ink">Show the wording</summary>
                      <dl className="mt-1 grid grid-cols-[40px_1fr] gap-x-2 gap-y-1">
                        <dt className="text-muted">From</dt>
                        <dd className="text-ink-2">{c.from}</dd>
                        <dt className="text-muted">To</dt>
                        <dd className="text-ink">{c.to}</dd>
                      </dl>
                    </details>
                  )}
                </div>
                {c.canUndo && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => undo(c.id, by)}
                    aria-label={`${c.kind === 'undo' ? 'Redo' : 'Undo'}: ${c.what}`}
                  >
                    {c.kind === 'undo' ? 'Redo' : 'Undo'}
                  </Button>
                )}
              </li>
            ))}
          </ol>
          {rows.length > FIRST && (
            <Button size="sm" variant="ghost" className="-ml-2.5 mt-1" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${rows.length.toLocaleString('en-US')}`}
            </Button>
          )}
        </>
      )}
    </Figure>
  )
}
