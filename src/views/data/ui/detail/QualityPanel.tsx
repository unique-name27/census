/**
 * Quality: the dataset's tier and what the next one needs, the rules behind it, and each field's
 * fill rate over the rows it applies to, values not recognized or defaulted, and its own tier.
 * Every number opens the rows behind it.
 */
import { Meter } from '@/charts'
import { IconDownload } from '@/components/icons'
import { TierBadge } from '@/components/tier/TierBadge'
import { withoutTierPrefix } from '@/components/tier/tierModel'
import { Button, SeverityIcon } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import type { FieldRowKind, QualityIndex } from '@/data/quality'
import { MIN_COVERAGE, pctAgainst, pctText } from '@/data/quality'
import { type Datasets, datasetDef } from '@/data/schema'
import { Drill } from '@/drill/Drill'
import { fmt } from '@/lib/format'
import type { ManifestRow } from '../../engine/manifest'
import {
  nextTierText,
  QUALITY_COLUMNS,
  type QualityRow,
  qualityExportRows,
  qualityRows,
  RULE_COLUMNS,
  ruleExportRows,
} from '../../engine/qualityTable'
import { CheckSentence } from '../DrillSentence'
import { downloadQuality } from '../downloads'
import { indexSpec, midSentence } from '../drillSpecs'
import { roomMeta } from '../meta'
import { useBusy } from '../useBusy'
import { RuleList } from './RuleList'

/** Old manifest checks the rules and the field table don't already say. */
const EXTRA_CHECKS = new Set(['metric-field', 'import-warnings'])

const TITLE: Record<Exclude<FieldRowKind, 'filled'>, (ds: string, f: string) => string> = {
  applicable: (ds, f) => `${ds} rows that count for ${f}`,
  blank: (ds, f) => `${ds} with no ${f}`,
  invalid: (ds, f) => `${ds} with a ${f} that was not recognized`,
  defaulted: (ds, f) => `${ds} with ${f} filled by a default`,
  remapped: (ds, f) => `${ds} with ${f} changed by your reference mappings`,
}

const WORD: Record<Exclude<FieldRowKind, 'filled'>, string> = {
  applicable: 'rows',
  blank: 'blank',
  invalid: 'not recognized',
  defaulted: 'defaulted',
  remapped: 'remapped',
}

function Count({
  row,
  f,
  kind,
  n,
  data,
  index,
  words,
}: {
  row: ManifestRow
  f: QualityRow
  kind: Exclude<FieldRowKind, 'filled'>
  n: number
  data: Datasets
  index: Pick<QualityIndex, 'fieldRows'>
  /** Say what the count is ("12 blank"); the table's own columns name it already. */
  words?: boolean
}) {
  const text = `${fmt(n, 'int')}${words ? ` ${WORD[kind]}` : ''}`
  if (!n) return <span className="text-muted">{text}</span>
  const label = midSentence(f.label)
  const title = TITLE[kind](row.label, label)
  return (
    <Drill
      spec={() => indexSpec(row, data, index.fieldRows(f.ref, kind), title, { scope: f.scope })}
      label={`Show the ${fmt(n, 'int')} ${title.charAt(0).toLowerCase()}${title.slice(1)}`}
      className="whitespace-nowrap"
    >
      {text}
    </Drill>
  )
}

function FieldTable({
  row,
  rows,
  data,
  index,
  remap,
}: {
  row: ManifestRow
  rows: readonly QualityRow[]
  data: Datasets
  /** Drills for import-time problems (knows the import log). */
  index: Pick<QualityIndex, 'fieldRows'>
  /** Drills for reference mappings (the analytics context's index). */
  remap: Pick<QualityIndex, 'fieldRows' | 'explain'>
}) {
  const th = 'eyebrow py-1.5 pr-3 font-semibold'
  return (
    <div className="scroll-x">
      <table className="w-full border-collapse text-[13px] sm:min-w-[680px]">
        <caption className="sr-only">Field quality for {row.label}</caption>
        <thead>
          <tr className="border-b border-rule text-left">
            <th scope="col" className={th}>
              Field
            </th>
            <th scope="col" className={`${th} hidden text-right sm:table-cell`}>
              Applies to
            </th>
            <th scope="col" className={`${th} w-[22%]`}>
              Filled
            </th>
            <th scope="col" className={`${th} hidden text-right sm:table-cell`}>
              Blank
            </th>
            <th scope="col" className={`${th} hidden text-right md:table-cell`}>
              Not recognized
            </th>
            <th scope="col" className={`${th} hidden text-right md:table-cell`}>
              Defaulted
            </th>
            <th scope="col" className="eyebrow py-1.5 font-semibold">
              Tier
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            // Near the 95% bar the share gets a decimal, so 94.6% never reads as 95%.
            const share =
              f.coverage == null
                ? '—'
                : f.blankOk
                  ? pctText(f.coverage)
                  : pctAgainst(f.coverage, MIN_COVERAGE, 'min')
            const counts = { row, f, data, index }
            return (
              <tr key={f.ref} className="border-b border-rule last:border-b-0">
                <td className="py-1.5 pr-3 align-top">
                  {f.label}
                  {f.scope && <span className="block text-[11px] text-muted">{f.scope}</span>}
                  {f.blankOk && (
                    <span className="block text-[11px] text-muted">
                      Blanks are normal, so they don’t lower the tier
                    </span>
                  )}
                  {f.capReason && <span className="block text-[11px] text-ink-2">{f.capReason}</span>}
                  {f.remapped > 0 && (
                    <span className="block text-[11px] text-ink-2">
                      <Count {...counts} index={remap} kind="remapped" n={f.remapped} words /> by reference
                      mappings
                    </span>
                  )}
                  {/* Below sm the counts sit under the field name, so nothing scrolls sideways. */}
                  <span className="tnum mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-ink-2 sm:hidden">
                    <span>{fmt(f.applicableRows, 'int')} rows</span>
                    {f.blank > 0 && <Count {...counts} kind="blank" n={f.blank} words />}
                    {f.invalid > 0 && <Count {...counts} kind="invalid" n={f.invalid} words />}
                    {f.defaulted > 0 && <Count {...counts} kind="defaulted" n={f.defaulted} words />}
                  </span>
                </td>
                <td className="tnum hidden py-1.5 pr-3 text-right align-top sm:table-cell">
                  <Count {...counts} kind="applicable" n={f.applicableRows} />
                </td>
                <td className="py-1.5 pr-3 align-top">
                  <span className="flex h-5 items-center gap-2">
                    <Meter
                      value={f.coverage}
                      tone={f.capReason && !f.blankOk && (f.coverage ?? 1) < 0.95 ? 'warning' : 'default'}
                      label={`${f.label} filled, ${share}`}
                      className="max-w-[120px]"
                    />
                    <span className="tnum w-11 shrink-0 text-right text-[12px] text-ink-2">{share}</span>
                  </span>
                </td>
                <td className="tnum hidden py-1.5 pr-3 text-right align-top sm:table-cell">
                  <Count {...counts} kind="blank" n={f.blank} />
                </td>
                <td className="tnum hidden py-1.5 pr-3 text-right align-top md:table-cell">
                  <Count {...counts} kind="invalid" n={f.invalid} />
                </td>
                <td className="tnum hidden py-1.5 pr-3 text-right align-top md:table-cell">
                  <Count {...counts} kind="defaulted" n={f.defaulted} />
                </td>
                <td className="py-1 align-top">
                  <TierBadge tier={f.tier} explain={remap.explain(f.ref)} compact />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function QualityPanel({
  row,
  data,
  index,
}: {
  row: ManifestRow
  data: Datasets
  /** The quality index with this dataset's import log, so import problems open their rows. */
  index: QualityIndex
}) {
  const ctx = useAnalytics()
  const { isBusy, run } = useBusy()
  const def = datasetDef(row.key)
  const dq = ctx.quality.dataset(row.key)
  const explain = ctx.quality.explain(row.key)
  const rules = index.checks(row.key)
  const fields = qualityRows(def, ctx.quality.fields(row.key))
  const next = nextTierText(dq.tier, dq.missing)
  const extra = row.checks.filter((c) => EXTRA_CHECKS.has(c.kind))
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-4">
        <div className="flex items-start gap-3">
          <TierBadge tier={dq.tier} explain={explain} />
          <p className="min-w-0 text-[13px] text-ink">{withoutTierPrefix(explain)}</p>
        </div>
        {next && <p className="mt-2 text-[13px] text-ink-2">{next}</p>}
        <h4 className="eyebrow mt-5">Checks</h4>
        <RuleList rules={rules} ds={row} data={data} className="mt-2" />
        {extra.length > 0 && (
          <>
            <h4 className="eyebrow mt-5">Also worth a look</h4>
            <ul className="mt-1.5 space-y-1.5">
              {extra.map((c) => (
                <li key={`${c.kind}|${c.text}`} className="flex gap-2 text-[13px]">
                  <SeverityIcon severity={c.severity} className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    <CheckSentence check={c} row={row} data={data} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="min-w-0 lg:col-span-8">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-[300px]">
            <h4 className="eyebrow">Fields</h4>
            <p className="mt-1 text-[12px] text-muted">
              Filled counts the rows each field applies to. Silver and gold need a field at least 95% filled
              there, with no more than 2% of values not recognized or defaulted; below that it is bronze.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={<IconDownload />}
            disabled={isBusy('quality')}
            onClick={() =>
              run(
                'quality',
                () =>
                  downloadQuality({
                    key: row.key,
                    tier: dq.tier,
                    fields: { columns: QUALITY_COLUMNS, rows: qualityExportRows(fields) },
                    checks: { columns: RULE_COLUMNS, rows: ruleExportRows(rules) },
                    meta: roomMeta(ctx),
                  }),
                'The quality report could not be exported.',
              )
            }
          >
            Download quality (.xlsx)
          </Button>
        </div>
        <div className="mt-2">
          <FieldTable row={row} rows={fields} data={data} index={index} remap={ctx.quality} />
        </div>
      </div>
    </div>
  )
}
