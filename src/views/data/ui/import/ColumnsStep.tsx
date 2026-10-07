/**
 * Step 1 for a sheet: which dataset it is, which column feeds each field (with how sure the
 * match is and three values from the file), and how to read dates, percentages and hourly pay.
 */
import { useState } from 'react'
import { IconCritical, IconInfoFilled } from '@/components/icons'
import { TABLE_HEAD } from '@/components/styles'
import { Button, cx, Segmented, Switch, Tag, Tip } from '@/components/ui'
import {
  type Confidence,
  type DateOrder,
  type MappedField,
  type Mapping,
  normalizeHeader,
  rankHeaders,
  type SuggestedOptions,
  withChoice,
} from '@/data/import'
import { type DatasetDef, type DatasetKey, datasetDef, type FieldDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import { fmt } from '@/lib/format'
import { requirementOf } from '../../engine/coverage'
import {
  headerOptions,
  orderedFields,
  payLeftOut,
  sampleValues,
  textDateHeaders,
  unusedHeaders,
} from '../../engine/flow'
import { confidenceFor, MATCH_WORD, matchStrength, sameTarget, WEAK_MATCH } from '../../engine/plan'
import { type Draft, type SessionSheet, useImportSession } from '../../state/session'
import { Select } from '../Select'
import { PayLeftOutNote } from './CheckStep'

const FIRST_NAME = new Set([
  'first name',
  'given name',
  'preferred first name',
  'legal first name',
  'firstname',
])
const LAST_NAME = new Set(['last name', 'surname', 'family name', 'legal last name', 'lastname'])
const NAME_FIELD: Partial<Record<DatasetKey, string>> = { employees: 'name', candidates: 'candidateName' }

/**
 * First and last name columns the importer joins into the name when no column feeds the name
 * itself (the same rule it applies), so they aren't listed as unused.
 */
function nameParts(headers: readonly string[], mapping: Mapping, def: DatasetDef): [string, string] | null {
  const field = NAME_FIELD[def.key]
  if (!field || mapping[field]?.header) return null
  const used = new Set(Object.values(mapping).flatMap((m) => (m.header ? [m.header] : [])))
  const find = (names: Set<string>) => headers.find((h) => !used.has(h) && names.has(normalizeHeader(h)))
  const first = find(FIRST_NAME)
  const last = find(LAST_NAME)
  return first && last ? [first, last] : null
}

const DOT: Record<Confidence | 'none', string> = {
  high: 'bg-good',
  medium: 'bg-warning',
  low: 'bg-serious',
  none: 'shadow-[inset_0_0_0_1.5px_var(--rule-strong)]',
}
const DOT_WORD: Record<Confidence | 'none', string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'No column',
}

function MatchDot({ m }: { m: MappedField | undefined }) {
  const level: Confidence | 'none' = m?.header ? m.confidence : 'none'
  return (
    <Tip content={m?.reason ?? 'No matching column'}>
      <span className="inline-flex items-center gap-1.5 text-meta text-ink-2">
        <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', DOT[level])} />
        {DOT_WORD[level]}
      </span>
    </Tip>
  )
}

function Requirement({ f }: { f: FieldDef }) {
  const r = requirementOf(f)
  if (r === 'required') return <Tag tone="outline">Required</Tag>
  if (r === 'recommended') return <Tag>Recommended</Tag>
  return null
}

function DatasetChoice({ item, draft, def }: { item: SessionSheet; draft: Draft; def: DatasetDef | null }) {
  const remapping = useImportSession((s) => s.mode === 'remap')
  if (remapping && def)
    return (
      <p className="max-w-[80ch] text-small text-ink-2">
        Re-mapping the sheet kept with the current version of {def.label}, starting from the columns it was
        read with. Nothing is uploaded again. Applying makes a new version, so its mapping needs confirming
        again.
      </p>
    )
  return <DatasetPicker item={item} draft={draft} def={def} />
}

function DatasetPicker({ item, draft, def }: { item: SessionSheet; draft: Draft; def: DatasetDef | null }) {
  const setDataset = useImportSession((s) => s.setDataset)
  const sheets = useImportSession((s) => s.sheets)
  const status = useImportSession((s) => s.status)
  const confidence = confidenceFor(item.guesses, draft.dataset)
  const strength = confidence == null ? null : matchStrength(confidence)
  const twins = sameTarget(sheets, status, item.id)
    .map((id) => sheets.find((s) => s.id === id)?.sheetName)
    .filter(Boolean)
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-small font-medium">Import this sheet as</span>
        <Select
          label="Dataset for this sheet"
          value={draft.dataset ?? ''}
          onChange={(v) => void setDataset(item.id, (v || null) as DatasetKey | null)}
          className="w-[300px] max-w-full"
        >
          {item.guesses.map((g) => (
            <option key={g.key} value={g.key}>
              {datasetDef(g.key).label} · {fmt(g.confidence, 'pct0')} match
            </option>
          ))}
          <option value="">Skip this sheet</option>
        </Select>
        {strength && (
          <span className="inline-flex items-center gap-1.5 text-meta text-ink-2">
            <span
              aria-hidden="true"
              className={cx(
                'size-2 rounded-full',
                strength === 'strong' ? 'bg-good' : strength === 'possible' ? 'bg-warning' : 'bg-serious',
              )}
            />
            {MATCH_WORD[strength]}
          </span>
        )}
      </div>
      {!def && (
        <p className="mt-2 text-small text-ink-2">
          {item.reason === 'not-census'
            ? 'This sheet does not look like any Census dataset. Pick one above to import it, or skip it.'
            : item.reason === 'not-target'
              ? 'Another sheet in this upload fits the dataset you chose better. Pick a dataset to import this one too.'
              : 'This sheet will be skipped.'}
        </p>
      )}
      {def && confidence != null && confidence < WEAK_MATCH && (
        <p className="mt-2 flex gap-2 text-small">
          <IconCritical className="mt-0.5 size-3.5 shrink-0 text-critical" />
          This sheet does not look much like {def.label}. Check the columns below before you continue.
        </p>
      )}
      {def && strength === 'possible' && (
        <p className="mt-2 text-small text-ink-2">
          A possible match. Check the columns below before you continue.
        </p>
      )}
      {def && twins.length > 0 && (
        <p className="mt-2 flex gap-2 text-small text-ink-2">
          <IconInfoFilled className="mt-0.5 size-3.5 shrink-0 text-s1" />
          {twins.join(', ')} in this upload also {twins.length === 1 ? 'goes' : 'go'} to {def.label}. The
          sheet applied last replaces the other.
        </p>
      )}
    </div>
  )
}

function MappingTable({
  item,
  draft,
  def,
  blockers,
}: {
  item: SessionSheet
  draft: Draft
  def: DatasetDef
  blockers: readonly string[]
}) {
  const update = useImportSession((s) => s.update)
  const showPay = useCensus((s) => s.showPay)
  const [showAll, setShowAll] = useState(false)
  const mapping = draft.mapping ?? {}
  const fields = orderedFields(def)
  const hidden = fields.filter((f) => requirementOf(f) === 'optional' && !mapping[f.key]?.header)
  const shown = showAll ? fields : fields.filter((f) => !hidden.includes(f))
  const { sheet } = item
  const choose = (field: string, header: string | null) =>
    update(item.id, (d) => ({
      mapping: withChoice(d.mapping ?? {}, field, header),
      overrides: d.overrides.includes(field) ? d.overrides : [...d.overrides, field],
    }))
  const parts = nameParts(sheet.headers, mapping, def)
  const unused = unusedHeaders(sheet.headers, mapping).filter((h) => !parts?.includes(h))
  const nameField = NAME_FIELD[def.key]
  return (
    <div>
      {/* Below sm the match and the file's values sit under each column choice. */}
      <div className="scroll-x -mx-1 px-1">
        <table className="w-full border-collapse text-small sm:min-w-[680px]">
          <caption className="sr-only">Columns for {def.label}</caption>
          <thead>
            <tr className="border-b border-rule text-left">
              <th scope="col" className={`${TABLE_HEAD} w-[45%] py-2 pr-3 sm:w-[30%]`}>
                Field
              </th>
              <th scope="col" className={`${TABLE_HEAD} py-2 sm:w-[30%] sm:pr-3`}>
                Column in your file
              </th>
              <th scope="col" className={`${TABLE_HEAD} hidden w-[13%] py-2 pr-3 sm:table-cell`}>
                Match
              </th>
              <th scope="col" className={`${TABLE_HEAD} hidden py-2 sm:table-cell`}>
                Values in the file
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => {
              const m = mapping[f.key]
              const header = m?.header ?? null
              const blocked = blockers.includes(f.key)
              const options = headerOptions(
                def,
                sheet.headers,
                rankHeaders(sheet.headers, sheet.rows, def, f.key),
                mapping,
                f.key,
              )
              const samples = header ? sampleValues(sheet, header) : []
              const match = blocked ? (
                <span className="inline-flex items-center gap-1.5 text-meta font-medium">
                  <IconCritical className="size-3.5 text-critical" />
                  Needed
                </span>
              ) : (
                <MatchDot m={m} />
              )
              const values =
                header == null ? (
                  f.key === nameField && parts ? (
                    <span className="text-meta text-ink-2">
                      Built from “{parts[0]}” and “{parts[1]}”
                    </span>
                  ) : (
                    <span className="text-meta text-muted">—</span>
                  )
                ) : f.pay && !showPay ? (
                  <span className="text-meta text-muted">Hidden while pay amounts are off</span>
                ) : samples.length ? (
                  <span className="block truncate text-meta text-ink-2" title={samples.join(' · ')}>
                    {samples.join(' · ')}
                  </span>
                ) : (
                  <span className="text-meta text-muted">Blank in every row</span>
                )
              return (
                <tr
                  key={f.key}
                  className={cx('border-b border-rule last:border-b-0', blocked && 'bg-critical-wash')}
                >
                  <td className="py-2 pr-3 align-top">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{f.label}</span>
                      <Requirement f={f} />
                    </span>
                    <span className="mt-0.5 block text-meta leading-snug text-muted">{f.description}</span>
                  </td>
                  <td className="py-2 align-top sm:pr-3">
                    <Select
                      label={`Column for ${f.label}`}
                      value={header ?? ''}
                      onChange={(v) => choose(f.key, v || null)}
                      tone={blocked ? 'attention' : 'default'}
                      className="w-full"
                    >
                      <option value="">Not in this file</option>
                      {options.suggested.length > 0 && (
                        <optgroup label="Likely columns">
                          {options.suggested.map((o) => (
                            <option key={o.header} value={o.header}>
                              {o.header}
                              {o.usedBy ? ` (used for ${o.usedBy})` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {options.others.length > 0 && (
                        <optgroup label="Other columns">
                          {options.others.map((o) => (
                            <option key={o.header} value={o.header}>
                              {o.header}
                              {o.usedBy ? ` (used for ${o.usedBy})` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </Select>
                    <span className="mt-1 block min-w-0 space-y-0.5 sm:hidden">
                      <span className="block">{match}</span>
                      {(header != null || (f.key === nameField && parts)) && (
                        <span className="block min-w-0">{values}</span>
                      )}
                    </span>
                  </td>
                  <td className="hidden py-2 pr-3 align-top leading-7 sm:table-cell">{match}</td>
                  <td className="hidden max-w-0 py-2 align-top leading-7 sm:table-cell">{values}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-meta text-muted">
        {hidden.length > 0 && (
          <Button size="sm" variant="ghost" className="-ml-2.5" onClick={() => setShowAll(!showAll)}>
            {showAll
              ? 'Hide optional fields with no column'
              : `Show ${hidden.length} optional ${hidden.length === 1 ? 'field' : 'fields'} with no column`}
          </Button>
        )}
        {unused.length > 0 && (
          <span>
            Not used: {unused.slice(0, 8).join(', ')}
            {unused.length > 8 ? ` and ${unused.length - 8} more` : ''}
          </span>
        )}
      </div>
    </div>
  )
}

const DATE_ORDER_OPTIONS: { value: DateOrder; label: string }[] = [
  { value: 'MDY', label: 'Month first' },
  { value: 'DMY', label: 'Day first' },
]

function ReadingOptions({
  item,
  draft,
  def,
  suggested,
}: {
  item: SessionSheet
  draft: Draft
  def: DatasetDef
  suggested: SuggestedOptions
}) {
  const update = useImportSession((s) => s.update)
  const dateHeaders = textDateHeaders(item.sheet, suggested.dateOrders)
  const percentKeys = Object.keys(suggested.percentWhole)
  const isComp = def.key === 'comp'
  if (!dateHeaders.length && !percentKeys.length && !isComp) return null
  const o = draft.options
  const fieldFor = (header: string) =>
    def.fields.find((f) => draft.mapping?.[f.key]?.header === header)?.label
  const hourlyOn = o.hourlyToAnnual === undefined ? !!suggested.hourlyToAnnual : !!o.hourlyToAnnual
  const basis = (o.hourlyToAnnual ?? suggested.hourlyToAnnual)?.basisHeader ?? null
  return (
    <div>
      <h3 className="cut-head text-title font-semibold">Reading the values</h3>
      <ul className="mt-2 divide-y divide-rule rounded-control shadow-[inset_0_0_0_1px_var(--rule)]">
        {dateHeaders.map((h) => {
          const guess = suggested.dateOrders[h]
          const value = o.dateOrders?.[h] ?? guess.order
          return (
            <li key={h} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
              <span className="min-w-0 flex-1 basis-[260px] text-small">
                Dates in “{h}”{fieldFor(h) ? ` (${fieldFor(h)})` : ''}
                <span className="block text-meta text-muted">
                  {guess.certain
                    ? `Read as ${guess.order === 'DMY' ? 'day' : 'month'} first, from values that can only be read one way.`
                    : 'Every value could be read either way. Check one and pick the order your system uses.'}
                </span>
              </span>
              <Segmented
                label={`Day order for ${h}`}
                value={value}
                options={DATE_ORDER_OPTIONS}
                onChange={(v) =>
                  update(item.id, (d) => ({
                    options: { ...d.options, dateOrders: { ...d.options.dateOrders, [h]: v } },
                  }))
                }
              />
            </li>
          )
        })}
        {percentKeys.map((k) => {
          const label = def.fields.find((f) => f.key === k)?.label ?? k
          const whole = o.percentWhole?.[k] ?? suggested.percentWhole[k]
          return (
            <li key={k} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
              <span className="min-w-0 flex-1 basis-[260px] text-small">
                {label}
                <span className="block text-meta text-muted">
                  {whole ? 'Read 3.5 as 3.5%.' : 'Read 0.035 as 3.5%.'} Detected from the values.
                </span>
              </span>
              <Segmented
                label={`Percent scale for ${label}`}
                value={whole ? 'whole' : 'fraction'}
                options={[
                  { value: 'fraction', label: 'Fractions' },
                  { value: 'whole', label: 'Whole numbers' },
                ]}
                onChange={(v) =>
                  update(item.id, (d) => ({
                    options: {
                      ...d.options,
                      percentWhole: { ...d.options.percentWhole, [k]: v === 'whole' },
                    },
                  }))
                }
              />
            </li>
          )
        })}
        {isComp && (
          <li className="px-3 py-2.5">
            <Switch
              checked={hourlyOn}
              onChange={(on) =>
                update(item.id, (d) => ({
                  options: {
                    ...d.options,
                    hourlyToAnnual: on
                      ? { hours: 2080, basisHeader: suggested.hourlyToAnnual?.basisHeader ?? null }
                      : null,
                  },
                }))
              }
              label="Convert hourly pay to annual at 2,080 hours"
            />
            <span className="mt-1 block pl-[38px] text-meta text-muted">
              {basis
                ? `Rows marked hourly in “${basis}” are converted.`
                : 'Base pay under 1,000 is treated as an hourly rate.'}
              {suggested.hourlyToAnnual ? ' Detected from the values.' : ' Not detected in this file.'}
            </span>
          </li>
        )}
      </ul>
    </div>
  )
}

export function ColumnsStep({
  item,
  draft,
  suggested,
  blockers,
}: {
  item: SessionSheet
  draft: Draft
  suggested: SuggestedOptions | null
  blockers: readonly string[]
}) {
  const def = draft.dataset ? datasetDef(draft.dataset) : null
  const blockerLabels = def ? blockers.map((k) => def.fields.find((f) => f.key === k)?.label ?? k) : []
  return (
    <div className="space-y-6">
      <DatasetChoice item={item} draft={draft} def={def} />
      {def && draft.mapping && (
        <>
          {draft.profileStale && (
            <p className="text-small text-ink-2">
              The column choices you saved for this layout no longer cover every required field. Check them
              below.
            </p>
          )}
          {def && payLeftOut(def, blockers, null) && <PayLeftOutNote />}
          {blockerLabels.length > 0 && (
            <p className="flex gap-2 text-small">
              <IconCritical className="mt-0.5 size-3.5 shrink-0 text-critical" />
              Pick a column for {blockerLabels.join(' and ')} to continue. Without{' '}
              {blockerLabels.length === 1 ? 'it' : 'them'} no row can be imported.
            </p>
          )}
          <div>
            <h3 className="cut-head text-title font-semibold">Columns</h3>
            <p className="mt-0.5 mb-2 text-meta text-muted">
              Matched by column names and the values in them. Change any choice; Census remembers it for this
              layout.
            </p>
            <MappingTable item={item} draft={draft} def={def} blockers={blockers} />
          </div>
          {suggested && <ReadingOptions item={item} draft={draft} def={def} suggested={suggested} />}
        </>
      )}
    </div>
  )
}
