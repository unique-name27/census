/**
 * The service level scorecard's on-screen table as plain HTML: two-line cells (process ID over
 * its name, measure over its team) and status pills, which the shared DataTable doesn't draw.
 * Each process ID links to its page in the Hire-to-Retire Atlas (Tools menu > HR process catalog)
 * in a new tab, and cells can wrap their numbers in a drill. The Figure around it still gives the
 * sortable table view (with `Column.href` links and drills) and every export from the same rows.
 * Plain tables (the processes list) use the Figure's own table.
 */
import type { ReactNode } from 'react'
import { useTools } from '@/app/ToolsMenu'
import { processLink } from '@/app/tools'
import { cx } from '@/components'

/** A process ID that opens the Atlas process page in a new tab, or plain text without a catalog link. */
export function ProcessId({ id }: { id: string }) {
  const tools = useTools()
  const href = processLink(tools, id)
  const text = 'font-mono text-[12px] whitespace-nowrap'
  if (!href) return <span className={cx(text, 'text-ink-2')}>{id}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(text, 'rounded-[2px] text-link underline-offset-2 hover:underline')}
      title={`Open ${id} in the HR process catalog (new tab)`}
    >
      {id}
      <span className="sr-only"> (opens the HR process catalog in a new tab)</span>
    </a>
  )
}

export interface AtlasColumn<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  /** Tailwind width / wrapping hints for the cell. */
  className?: string
  render: (row: T) => ReactNode
}

const TH =
  'border-b border-rule-strong py-1.5 px-2 first:pl-0 last:pr-0 align-bottom cut-head text-[12px] font-semibold text-ink-2'
const TD = 'border-b border-rule py-2 px-2 first:pl-0 last:pr-0 align-top'

export function AtlasTable<T>({
  rows,
  columns,
  rowKey,
  caption,
}: {
  rows: readonly T[]
  columns: readonly AtlasColumn<T>[]
  rowKey: (row: T) => string
  caption: string
}) {
  return (
    <div className="scroll-x relative min-w-0">
      <table className="w-full border-separate border-spacing-0 text-[13px] leading-snug">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cx(TH, c.align === 'right' ? 'text-right' : 'text-left', c.className)}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cx(
                    TD,
                    c.align === 'right' ? 'tnum text-right whitespace-nowrap' : 'text-left',
                    'text-ink',
                    c.className,
                  )}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
