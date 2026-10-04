/**
 * The scenario's steps in order, compact enough for a narrow column. The full table (with IDs and
 * managers) goes out through the view export and "Export scenario".
 */
import type { Column } from '@/charts'
import { Button, spanClass, useTableFigure } from '@/components'
import { cx } from '@/components/ui'
import { Drill, type DrillSource } from '@/drill'
import { plural } from '@/lib/format'
import { MOVE_COLUMNS, type MoveRow } from '../engine'

export function MovesPanel({
  moves,
  drillMoving,
  undone,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  moves: MoveRow[]
  /** The people moving in a step (by step number). */
  drillMoving?: (step: number) => DrillSource
  /** Steps that were undone and can be redone, in order. */
  undone: string[]
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}) {
  useTableFigure({
    id: 'org-sandbox-moves',
    title: 'Moves',
    subtitle: 'Each step of the reorg scenario, in order',
    columns: MOVE_COLUMNS as Column[],
    rows: moves as unknown as Record<string, unknown>[],
  })
  return (
    <section
      aria-labelledby="org-moves-title"
      className={cx(spanClass(5), 'rounded-sheet bg-sheet px-4 pt-3.5 pb-4')}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 id="org-moves-title" className="cut-head text-[15px] leading-snug font-semibold">
            Moves
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-2">Each step of the scenario, in order.</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" disabled={!canUndo} onClick={onUndo}>
            Undo
          </Button>
          <Button size="sm" variant="ghost" disabled={!canRedo} onClick={onRedo}>
            Redo
          </Button>
        </div>
      </div>
      {moves.length ? (
        <ol className="mt-3 divide-y divide-rule">
          {moves.map((m) => (
            <li key={m.step} className="flex gap-3 py-2 text-[13px]">
              <span className="tnum w-5 shrink-0 text-right text-muted">{m.step}</span>
              <span className="min-w-0">
                <span className="block text-ink">{m.change}</span>
                <span className="block text-[12px] text-muted">
                  {m.type === 'Exit' ? `Reported to ${m.fromManager}` : `From ${m.fromManager}`}
                  {m.peopleMoving > 1 && (
                    <>
                      {' · '}
                      <Drill spec={drillMoving?.(m.step)}>{plural(m.peopleMoving, 'person', 'people')}</Drill>
                    </>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-[13px] text-muted">No moves yet.</p>
      )}
      {undone.length > 0 && (
        <div className="mt-3 border-t border-rule pt-2">
          <div className="eyebrow mb-1">Undone, can be redone</div>
          <ol className="space-y-0.5 text-[12px] text-muted">
            {undone.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
