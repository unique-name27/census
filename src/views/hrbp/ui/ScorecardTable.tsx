/**
 * The sub-org scorecard as a datasheet with benchmark shading: a cell is washed when the org is
 * materially off the company (red for higher attrition, green for lower, amber when the metric
 * has no good direction) and carries an arrow so the state never depends on color. Rows rescope
 * the app on click; each number opens the records behind it (the org's leavers, promotions,
 * managers …). The Other and Company rows stay pinned at the bottom. The organization column
 * stays put while the rates scroll sideways on a narrow screen.
 */
import { type KeyboardEvent, useState } from 'react'
import { IconArrowDown, IconArrowUp } from '@/components/icons'
import { cx } from '@/components/ui'
import { Drill, type DrillSource } from '@/drill/Drill'
import { type Format, fmt } from '@/lib/format'
import type { ScoreCell } from '../engine/buckets'
import {
  METRIC_POLARITY,
  type ScoreMetric,
  type ScoreRow,
  SHADE_MIN_HEADCOUNT,
  type Shade,
} from '../engine/scorecard'

interface Col {
  key: ScoreCell
  label: string
  format: Format
  metric?: ScoreMetric
}

const COLS: Col[] = [
  { key: 'headcount', label: 'Headcount', format: 'int' },
  { key: 'netChange', label: 'Net change, 12 mo', format: 'int' },
  { key: 'voluntary', label: 'Voluntary', format: 'pct', metric: 'voluntary' },
  { key: 'regretted', label: 'Regretted', format: 'pct', metric: 'regretted' },
  { key: 'firstYear', label: 'First-year', format: 'pct', metric: 'firstYear' },
  { key: 'promotionRate', label: 'Promotion rate', format: 'pct', metric: 'promotionRate' },
  { key: 'avgSpan', label: 'Avg span', format: 'num1', metric: 'avgSpan' },
]

function washFor(metric: ScoreMetric, shade: Shade): string {
  if (METRIC_POLARITY[metric] === 'neutral') return 'bg-warning-wash'
  return shade === 'above' ? 'bg-critical-wash' : 'bg-good-wash'
}

const signed = (v: number) => (v > 0 ? `+${fmt(v, 'int')}` : fmt(v, 'int'))

type SortKey = ScoreCell | 'label'

export function ScorecardTable({
  rows,
  onPick,
  drillFor,
}: {
  rows: ScoreRow[]
  onPick: (row: ScoreRow) => void
  /** The records behind a cell; null for cells with none (hidden values, zero counts). */
  drillFor?: (row: ScoreRow, cell: ScoreCell) => DrillSource
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const pinned = rows.filter((r) => r.kind === 'other' || r.kind === 'company')
  let body = rows.filter((r) => r.kind !== 'other' && r.kind !== 'company')
  if (sort) {
    body = body.slice().sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (av == null) return bv == null ? 0 : 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
      return String(av).localeCompare(String(bv)) * sort.dir
    })
  }
  const toggle = (key: SortKey) =>
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'label' ? 1 : -1 },
    )
  const onKey = (e: KeyboardEvent, row: ScoreRow) => {
    // Keys on a cell's drill button belong to that button, not to the row.
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick(row)
    }
  }

  const th =
    'border-b border-rule-strong bg-sheet px-2 py-1.5 align-bottom first:pl-0 last:pr-0 cut-head text-[12px] font-semibold whitespace-nowrap text-ink-2'
  const td = 'border-b border-rule px-2 py-1.5 align-middle first:pl-0 last:pr-0'
  /**
   * The organization column: pinned to the left edge of the scroller, with a hairline once rates
   * pass under it and a 4px bleed of its own fill to the left so no glyph peeks past its edge.
   */
  const pin = 'sticky left-0 z-[1]'
  const edge = 'max-lg:shadow-[1px_0_0_var(--rule),-4px_0_0_var(--sheet)]'
  const edge2 = 'max-lg:shadow-[1px_0_0_var(--rule),-4px_0_0_var(--sheet-2)]'
  const header = (key: SortKey, label: string, right: boolean) => {
    const active = sort?.key === key
    return (
      <th
        key={key}
        scope="col"
        aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
        className={cx(th, right ? 'text-right' : 'text-left', key === 'label' && `${pin} ${edge}`)}
      >
        <button
          type="button"
          onClick={() => toggle(key)}
          className={cx(
            'group inline-flex items-center gap-1 rounded-[2px] hover:text-ink',
            right && 'flex-row-reverse',
            active && 'text-ink',
          )}
        >
          {label}
          <span
            className={cx(
              'inline-flex',
              active ? 'text-ink' : 'text-muted opacity-0 group-hover:opacity-100',
            )}
          >
            {active && sort.dir === 1 ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}
          </span>
        </button>
      </th>
    )
  }

  const cell = (row: ScoreRow, c: Col) => {
    const v = row[c.key]
    const shade = c.metric ? row.shade[c.metric] : undefined
    const text = c.key === 'netChange' && typeof v === 'number' ? signed(v) : fmt(v, c.format)
    // Hidden values ("—") never drill.
    const source = v != null && drillFor ? drillFor(row, c.key) : null
    return (
      <td key={c.key} className={cx(td, 'tnum text-right whitespace-nowrap')}>
        <span
          className={cx(
            'inline-flex items-center justify-end gap-1 rounded-[3px] px-1.5 py-0.5',
            shade && c.metric ? washFor(c.metric, shade) : '',
          )}
        >
          {shade &&
            (shade === 'above' ? (
              <IconArrowUp size={11} strokeWidth={2} className="text-ink-2" />
            ) : (
              <IconArrowDown size={11} strokeWidth={2} className="text-ink-2" />
            ))}
          {source ? (
            <Drill spec={source} label={`${row.label}, ${c.label}: ${text}. Show the records`}>
              {text}
            </Drill>
          ) : (
            text
          )}
          {shade && <span className="sr-only">, {shade} the company</span>}
        </span>
      </td>
    )
  }

  const line = (row: ScoreRow) => {
    const clickable = !!row.filter
    const benchmark = row.kind === 'company'
    return (
      <tr
        key={row.key}
        onClick={clickable ? () => onPick(row) : undefined}
        onKeyDown={clickable ? (e) => onKey(e, row) : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-label={clickable ? `${row.label}. Focus on this org` : undefined}
        className={cx(
          'group',
          clickable && 'cursor-pointer hover:bg-hover focus-visible:bg-hover',
          benchmark && 'bg-sheet-2',
        )}
      >
        <td
          className={cx(
            td,
            pin,
            'min-w-32 pr-4 sm:min-w-44',
            benchmark ? `bg-sheet-2 ${edge2}` : `bg-sheet ${edge}`,
            // The pinned cell is opaque, so it repeats the row's hover wash on top of its own fill.
            clickable &&
              'group-hover:bg-[image:linear-gradient(var(--hover-wash),var(--hover-wash))] group-focus-visible:bg-[image:linear-gradient(var(--hover-wash),var(--hover-wash))]',
          )}
        >
          <div
            className={cx('leading-snug text-ink', benchmark ? 'font-semibold' : clickable && 'font-medium')}
          >
            {row.label}
          </div>
          {row.sublabel && <div className="text-[12px] leading-snug text-muted">{row.sublabel}</div>}
        </td>
        {COLS.map((c) => cell(row, c))}
      </tr>
    )
  }

  return (
    <div className="min-w-0">
      {/* relative: keeps the screen-reader-only notes inside the scroller so they never widen the page */}
      <div className="scroll-x relative">
        <table className="w-full border-separate border-spacing-0 text-[13px] leading-snug">
          <caption className="sr-only">Sub-org scorecard</caption>
          <thead>
            <tr>
              {header('label', 'Organization', false)}
              {COLS.map((c) => header(c.key, c.label, true))}
            </tr>
          </thead>
          <tbody>
            {body.map(line)}
            {pinned.map(line)}
          </tbody>
        </table>
      </div>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        <span>
          Marked cells differ from the company by more than 1 pt or 10% (0.5 for span), in orgs of{' '}
          {SHADE_MIN_HEADCOUNT} or more:
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-[2px] bg-critical-wash shadow-[inset_0_0_0_1px_var(--rule-strong)]" />
          higher attrition
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-[2px] bg-good-wash shadow-[inset_0_0_0_1px_var(--rule-strong)]" />
          lower attrition
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-[2px] bg-warning-wash shadow-[inset_0_0_0_1px_var(--rule-strong)]" />
          different, no good direction
        </span>
      </p>
    </div>
  )
}
