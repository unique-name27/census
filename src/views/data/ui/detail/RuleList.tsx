/**
 * Rule results as a list: pass or fail (icon and word), the tier the rule is needed for, the
 * sentence with its number, and the rows behind a failure in the drill panel.
 */
import { IconCritical, IconGood, IconWarning } from '@/components/icons'
import { cx, Tag } from '@/components/ui'
import type { RuleResult } from '@/data/quality'
import type { Datasets } from '@/data/schema'
import { fmt } from '@/lib/format'
import { DrillSentence } from '../DrillSentence'
import { type DrillDataset, indexSpec } from '../drillSpecs'

const GATE_TAG = { silver: 'Silver', gold: 'Gold' } as const

const ROWS_TITLE: Partial<Record<RuleResult['id'], (label: string) => string>> = {
  'issue-rate': (l) => `${l} rows with an import error`,
  references: (l) => `${l} rows that refer to records that are not loaded`,
  'dates-in-order': (l) => `${l} rows with a later step dated before an earlier one`,
  'no-duplicates': (l) => `${l} rows that repeat an earlier row`,
}

function RuleIcon({ r }: { r: RuleResult }) {
  if (r.pass) return <IconGood className="mt-0.5 size-3.5 shrink-0 text-good" />
  if (r.gate) return <IconCritical className="mt-0.5 size-3.5 shrink-0 text-critical" />
  return <IconWarning className="mt-0.5 size-3.5 shrink-0 text-warning" />
}

export function RuleList({
  rules,
  ds,
  data,
  className,
}: {
  rules: readonly RuleResult[]
  ds: DrillDataset
  /** The rows the rule indexes point into (the analytics context's `all`). */
  data: Datasets
  className?: string
}) {
  return (
    <ul className={cx('space-y-2', className)}>
      {rules.map((r) => {
        const n = r.rows.length
        const title = ROWS_TITLE[r.id]?.(ds.label) ?? `${ds.label}: ${r.label.toLowerCase()}`
        const rowsText = `${fmt(n, 'int')} ${n === 1 ? 'row' : 'rows'}`
        return (
          <li key={r.id} className="flex gap-2 text-small">
            <RuleIcon r={r} />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium text-ink">{r.label}</span>
                <span className="sr-only">{r.pass ? 'passes' : 'does not pass'}.</span>
                {r.gate ? <Tag tone="outline">{`${GATE_TAG[r.gate]} needs it`}</Tag> : null}
              </span>
              <span className="block text-ink-2">
                <DrillSentence
                  text={r.detail}
                  figure={null}
                  spec={n ? () => indexSpec(ds, data, r.rows, title, { note: r.detail }) : null}
                  label={`Show the ${rowsText} behind this check`}
                  link={rowsText}
                />
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
