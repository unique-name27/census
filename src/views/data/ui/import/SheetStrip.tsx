/**
 * Every sheet in the upload, in the order they are walked (Employees first), with where each one
 * is going and whether it has been applied or skipped. Pending sheets can be opened directly.
 */
import { IconCheck } from '@/components/icons'
import { cx } from '@/components/ui'
import { datasetDef } from '@/data/schema'
import { useImportSession } from '../../state/session'

export function SheetStrip() {
  const sheets = useImportSession((s) => s.sheets)
  const status = useImportSession((s) => s.status)
  const currentId = useImportSession((s) => s.currentId)
  const goto = useImportSession((s) => s.goto)
  if (sheets.length < 2) return null
  const multiFile = new Set(sheets.map((s) => s.fileName)).size > 1
  return (
    <nav aria-label="Sheets in this upload" className="-mx-5 mb-5 border-b border-rule px-5 pb-3">
      <ol className="flex gap-1.5 overflow-x-auto [scrollbar-width:thin]">
        {sheets.map((s, i) => {
          const st = status[s.id] ?? 'pending'
          const current = s.id === currentId
          const target = s.dataset ? datasetDef(s.dataset).label : null
          const line =
            st === 'applied'
              ? `Applied to ${target}`
              : st === 'skipped' || !target
                ? 'Not imported'
                : `To ${target}`
          return (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                aria-current={current ? 'step' : undefined}
                disabled={st !== 'pending' || current}
                onClick={() => void goto(s.id)}
                className={cx(
                  'flex h-12 max-w-[220px] items-center gap-2 rounded-control px-2.5 text-left transition-colors',
                  current
                    ? 'bg-sheet-2 shadow-[inset_0_0_0_1px_var(--ink)]'
                    : 'shadow-[inset_0_0_0_1px_var(--rule)]',
                  st === 'pending' && !current && 'hover:bg-hover',
                  st !== 'pending' && 'opacity-70',
                )}
              >
                <span
                  className={cx(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    st === 'applied' ? 'bg-good-wash text-good-text' : 'bg-sheet-3 text-ink-2',
                  )}
                >
                  {st === 'applied' ? <IconCheck className="size-3" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium">
                    {multiFile ? `${s.fileName} › ` : ''}
                    {s.sheetName}
                  </span>
                  <span className="block truncate text-[11px] text-muted">{line}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
