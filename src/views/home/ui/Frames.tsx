/**
 * The frames every role home shares (docs/ROLES-V2.md 5.1; docs/DESIGN-REFRESH.md 2.6):
 *
 *  - `Hero`: the one number the role is judged on, `text-hero`, in a span 4 Figure with its
 *    breakdown (a SplitBar) directly under it. The number opens its records; each segment opens
 *    its own. Its table view and exports are the breakdown's rows.
 *  - `ListFigure`: My list, one table-only Figure (`home-list`, span 12): sortable, the first 50
 *    rows on screen with "Show all", every row in the export, each row opening its records.
 *  - `ListSwitch`: the Segmented that picks which list My list shows, where a role has two or three.
 */
import type { ReactNode } from 'react'
import { type Column, type Definition, Figure, useChartTheme } from '@/charts'
import { Segmented } from '@/components'
import { cx } from '@/components/ui'
import type { FieldRef } from '@/data/quality/fieldRef'
import { Drill, type DrillSource } from '@/drill/Drill'
import { SplitBar, type SplitPart } from './SplitBar'

export function Hero<T extends object>({
  id,
  metric,
  uses,
  title,
  subtitle,
  value,
  valueDrill,
  valueLabel,
  label,
  line,
  parts,
  unit,
  onSegment,
  ariaLabel,
  data,
  columns,
  definitions,
  note,
  empty,
  emptyAction,
  className,
}: {
  id: string
  metric: string
  uses?: readonly FieldRef[]
  title: string
  subtitle?: string
  /** The hero number as text ("78%", "4 of 21"), or "—". */
  value: string
  /** What the hero number counts. */
  valueDrill?: DrillSource
  /** Accessible name of the number's button: "Show the 312 people in their healthy band". */
  valueLabel?: string
  /** The words after the number: "in their healthy band". */
  label: string
  /** One short line under the bar: the target, or what the split leaves out. */
  line?: ReactNode
  parts: readonly SplitPart[]
  /** What the bar's counts count: "people", "roles", "cases". */
  unit: string
  onSegment?: (key: string) => void
  ariaLabel: string
  data: readonly T[]
  columns: readonly Column<T>[]
  definitions?: readonly Definition[]
  note?: string
  empty?: string | null
  emptyAction?: ReactNode
  className?: string
}) {
  const theme = useChartTheme()
  return (
    <Figure
      id={id}
      metric={metric}
      uses={uses}
      title={title}
      subtitle={subtitle}
      data={data}
      columns={columns}
      definitions={definitions}
      note={note}
      span={4}
      empty={empty}
      emptyAction={emptyAction}
      emptyHeight={150}
      className={cx(className)}
    >
      <div data-tour="home-hero">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="cut-head text-hero font-semibold text-ink">
            {valueDrill && value !== '—' ? (
              <Drill spec={valueDrill} label={valueLabel}>
                {value}
              </Drill>
            ) : (
              value
            )}
          </span>
          <span className="text-small text-ink-2">{label}</span>
        </div>
        <SplitBar
          className="mt-4"
          parts={parts}
          unit={unit}
          onSelect={onSegment}
          ariaLabel={ariaLabel}
          theme={theme}
        />
        {line && <p className="mt-2 text-meta text-muted">{line}</p>}
      </div>
    </Figure>
  )
}

export interface ListChoice<K extends string> {
  value: K
  label: string
}

export function ListSwitch<K extends string>({
  value,
  onChange,
  options,
}: {
  value: K
  onChange: (k: K) => void
  options: readonly ListChoice<K>[]
}) {
  if (options.length < 2) return null
  return <Segmented<K> label="List" value={value} onChange={onChange} options={[...options]} />
}

/** Rows My list shows before "Show all" (the export holds every row). */
export const LIST_ROWS = 50

export function ListFigure<T extends object>({
  metric,
  uses,
  title,
  subtitle,
  rows,
  columns,
  definitions,
  note,
  actions,
  empty,
  emptyAction,
  onRowClick,
  rowTone,
  className,
}: {
  metric: string
  uses?: readonly FieldRef[]
  title: string
  subtitle?: string
  rows: readonly T[]
  columns: readonly Column<T>[]
  definitions?: readonly Definition[]
  note?: string
  actions?: ReactNode
  empty?: string | null
  emptyAction?: ReactNode
  onRowClick?: (row: T) => void
  rowTone?: (row: T) => 'critical' | 'warning' | 'info' | 'good' | null | undefined
  className?: string
}) {
  return (
    <Figure
      id="home-list"
      metric={metric}
      uses={uses}
      title={title}
      subtitle={subtitle}
      data={rows}
      columns={columns}
      definitions={definitions}
      note={note}
      span={12}
      tableOnly
      actions={actions}
      table={{ maxRows: LIST_ROWS, ...(onRowClick ? { onRowClick } : {}), ...(rowTone ? { rowTone } : {}) }}
      // The words for an empty list show only when the list is empty.
      empty={rows.length ? null : empty}
      emptyAction={emptyAction}
      className={className}
    />
  )
}
