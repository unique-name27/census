/**
 * The data a metric reads: each field with its tier and fill rate from the quality index, the
 * field that sets the metric's tier first in mind. Every count opens the rows behind it, and the
 * tier badge opens the dataset's Quality panel in the Datasets tab.
 */
import { Figure } from '@/charts'
import { TierBadge } from '@/components/tier/TierBadge'
import { cx } from '@/components/ui'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { FieldRowKind } from '@/data/quality/types'
import { Drill } from '@/drill/Drill'
import { fmt } from '@/lib/format'
import { sourceInfo } from '../../engine/manifest'
import { indexSpec, midSentence } from '../../ui/drillSpecs'
import { FIELD_COLUMNS, type FieldRow } from '../model'

type Ctx = Pick<AnalyticsContext, 'all' | 'sources' | 'quality'>

const TITLE: Record<
  Exclude<FieldRowKind, 'filled' | 'remapped' | 'defaulted'>,
  (ds: string, f: string) => string
> = {
  applicable: (ds, f) => `${ds} that ${f} applies to`,
  blank: (ds, f) => `${ds} with no ${f}`,
  invalid: (ds, f) => `${ds} with a ${f} that was not recognized`,
}

/** A count that opens its rows; plain when the quality index can't list them. */
function Count({
  ctx,
  row,
  kind,
  n,
  children,
}: {
  ctx: Ctx
  row: FieldRow
  kind: keyof typeof TITLE
  n: number
  children?: string
}) {
  const text = children ?? fmt(n, 'int')
  if (!n) return <span className="text-muted">{text}</span>
  const indexes = ctx.quality.fieldRows(row.ref, kind)
  if (!indexes.length) return <span>{text}</span>
  const title = TITLE[kind](row.datasetLabel, midSentence(row.field))
  const ds = { key: row.dataset, label: row.datasetLabel, source: sourceInfo(ctx.sources[row.dataset]) }
  return (
    <Drill
      spec={() => indexSpec(ds, ctx.all, indexes, title, { scope: row.scope })}
      label={`Show the ${fmt(indexes.length, 'int')} ${title.charAt(0).toLowerCase()}${title.slice(1)}`}
      className="whitespace-nowrap"
    >
      {text}
    </Drill>
  )
}

export function DataUsed({
  metricId,
  rows,
  uses,
  ctx,
  tierNote,
}: {
  metricId: string
  rows: readonly FieldRow[]
  uses: readonly FieldRef[]
  ctx: Ctx
  /** Why the metric has the tier it has, or what it reads when it names no fields. */
  tierNote: string | null
}) {
  const th = 'eyebrow py-1.5 pr-3 font-semibold'
  return (
    <Figure
      id={`data-metrics-${metricId.replace(/\./g, '-')}-data`}
      title="Data used"
      subtitle={
        rows.length
          ? 'The fields it reads. Its tier is the lowest of theirs.'
          : 'It names no fields of its own.'
      }
      data={rows}
      columns={FIELD_COLUMNS}
      image={false}
      tableToggle={false}
      gate={false}
      uses={uses}
      note={tierNote ?? undefined}
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-2">
          {tierNote ?? 'This is a rule about how Census treats data, not a number computed from it.'}
        </p>
      ) : (
        <div className="scroll-x">
          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">Fields this metric reads, with their tier and fill rate</caption>
            <thead>
              <tr className="border-b border-rule text-left">
                <th scope="col" className={th}>
                  Field
                </th>
                <th scope="col" className={th}>
                  Tier
                </th>
                <th scope="col" className={cx(th, 'text-right')}>
                  Filled
                </th>
                <th scope="col" className={cx(th, 'hidden text-right sm:table-cell')}>
                  Applies to
                </th>
                <th scope="col" className={cx(th, 'hidden text-right sm:table-cell')}>
                  Not recognized
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ref} className="border-b border-rule align-top last:border-b-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    <span className="block font-semibold text-ink">
                      {r.field}
                      {r.limiting && (
                        <span className="ml-1.5 text-[11px] font-medium text-muted">sets the tier</span>
                      )}
                    </span>
                    <span className="block text-[12px] text-muted">
                      {r.datasetLabel}
                      {r.scope ? ` · ${r.scope}` : ''}
                    </span>
                    {r.capReason && (
                      <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">{r.capReason}</span>
                    )}
                  </th>
                  <td className="py-2 pr-3">
                    <TierBadge
                      compact
                      tier={r.tier}
                      explain={ctx.quality.explain(r.ref)}
                      dataset={r.dataset}
                    />
                  </td>
                  <td className="tnum py-2 pr-3 text-right">
                    {r.coverage == null ? (
                      <span className="text-muted">—</span>
                    ) : r.blank > 0 ? (
                      <Count ctx={ctx} row={r} kind="blank" n={r.blank}>
                        {r.fillText}
                      </Count>
                    ) : (
                      r.fillText
                    )}
                    {r.blank > 0 && (
                      <span className="block text-[11px] text-muted">
                        <Count ctx={ctx} row={r} kind="blank" n={r.blank}>
                          {`${fmt(r.blank, 'int')} blank`}
                        </Count>
                      </span>
                    )}
                  </td>
                  <td className="tnum hidden py-2 pr-3 text-right sm:table-cell">
                    <Count ctx={ctx} row={r} kind="applicable" n={r.applicable} />
                  </td>
                  <td className="tnum hidden py-2 text-right sm:table-cell">
                    <Count ctx={ctx} row={r} kind="invalid" n={r.invalid} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Figure>
  )
}
