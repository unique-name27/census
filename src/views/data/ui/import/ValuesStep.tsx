/**
 * Step 2 for a sheet: the distinct values of every list, level and yes/no column, what each one
 * imports as, and a way to fix the ones Census doesn't recognize. Fixes are saved with the
 * column choices, so the same file maps the same way next time.
 */
import { IconCheck } from '@/components/icons'
import { TABLE_HEAD } from '@/components/styles'
import { cx } from '@/components/ui'
import type { ValueSummary } from '@/data/import'
import type { FieldDef } from '@/data/schema'
import { fmt } from '@/lib/format'
import { effectiveValue, fixChoices, openValues } from '../../engine/flow'
import { type Draft, type SessionSheet, useImportSession } from '../../state/session'
import { Select } from '../Select'

export interface ValueField {
  field: FieldDef
  header: string
  summaries: ValueSummary[]
}

/** Yes/no values come back as "true"/"false"; show them the way the file and the app say them. */
const displayAs = (field: FieldDef, v: string | null) =>
  field.type === 'boolean' ? (v === 'true' ? 'Yes' : v === 'false' ? 'No' : v) : v

const OPEN = '__open'
const BLANK = '__blank'

function ValueTable({ item, draft, vf }: { item: SessionSheet; draft: Draft; vf: ValueField }) {
  const update = useImportSession((s) => s.update)
  const fixes = draft.options.valueMaps?.[vf.field.key]
  const choices = fixChoices(vf.field)
  const open = openValues(vf.summaries, fixes)

  function setFix(key: string, value: string | null | undefined) {
    update(item.id, (d) => {
      const maps = { ...(d.options.valueMaps ?? {}) }
      const field = { ...(maps[vf.field.key] ?? {}) }
      if (value === undefined) delete field[key]
      else field[key] = value
      maps[vf.field.key] = field
      return { options: { ...d.options, valueMaps: maps } }
    })
  }

  return (
    <section aria-label={vf.field.label}>
      <h3 className="flex flex-wrap items-baseline gap-x-2">
        <span className="cut-head text-title font-semibold">{vf.field.label}</span>
        <span className="text-meta text-muted">
          from “{vf.header}” · {fmt(vf.summaries.length, 'int')}{' '}
          {vf.summaries.length === 1 ? 'value' : 'values'}
          {open > 0
            ? ` · ${open} not recognized`
            : fixes && Object.keys(fixes).length
              ? ' · all resolved'
              : ' · all recognized'}
        </span>
      </h3>
      <div className="scroll-x mt-1.5">
        <table className="w-full min-w-[520px] border-collapse text-small">
          <thead>
            <tr className="border-b border-rule text-left">
              <th scope="col" className={`${TABLE_HEAD} w-[40%] py-1.5 pr-3`}>
                Value in the file
              </th>
              <th scope="col" className={`${TABLE_HEAD} w-[12%] py-1.5 pr-3 text-right`}>
                Rows
              </th>
              <th scope="col" className={`${TABLE_HEAD} py-1.5`}>
                Imports as
              </th>
            </tr>
          </thead>
          <tbody>
            {vf.summaries.map((s) => {
              const e = effectiveValue(s, fixes)
              const selectValue = e.open ? OPEN : e.value == null ? BLANK : e.value
              return (
                <tr
                  key={s.key}
                  className={cx('border-b border-rule last:border-b-0', e.open && 'bg-warning-wash')}
                >
                  <td className="py-1.5 pr-3">
                    <span className="break-words">{s.raw}</span>
                  </td>
                  <td className="tnum py-1.5 pr-3 text-right text-ink-2">{fmt(s.count, 'int')}</td>
                  <td className="py-1">
                    {choices ? (
                      <span className="flex items-center gap-2">
                        <Select
                          label={`${vf.field.label}: import “${s.raw}” as`}
                          value={selectValue}
                          tone={e.open ? 'attention' : 'quiet'}
                          className="w-[220px]"
                          onChange={(v) => {
                            if (v === OPEN) return
                            const next = v === BLANK ? null : v
                            setFix(s.key, s.recognized && next === s.value ? undefined : next)
                          }}
                        >
                          {e.open && (
                            <option value={OPEN} disabled>
                              Not recognized
                            </option>
                          )}
                          <option value={BLANK}>Leave blank</option>
                          {choices.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </Select>
                        {e.fixed && <span className="text-meta text-muted">Your fix</span>}
                      </span>
                    ) : e.open ? (
                      <span className="text-small">Not recognized; left blank. Correct it in the file.</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <IconCheck className="size-3.5 text-good" />
                        {displayAs(vf.field, e.value)}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ValuesStep({
  item,
  draft,
  fields,
}: {
  item: SessionSheet
  draft: Draft
  fields: ValueField[]
}) {
  if (!fields.length)
    return (
      <p className="text-small text-ink-2">
        This sheet has no list, level or yes/no columns to check. Continue to the check.
      </p>
    )
  return (
    <div className="space-y-7">
      <p className="max-w-[70ch] text-small text-ink-2">
        Each value below is read into the list Census uses. Values it does not recognize are highlighted and
        stay blank unless you pick what they mean.
      </p>
      {fields.map((vf) => (
        <ValueTable key={vf.field.key} item={item} draft={draft} vf={vf} />
      ))}
    </div>
  )
}
