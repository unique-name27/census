/**
 * The upload dialog. It walks every sheet of the files just added, Employees first: pick the
 * dataset, check the columns, fix unrecognized values, review what the import would change, then
 * apply. A saved mapping for the same layout skips straight to the review.
 */
import { useMemo } from 'react'
import { Dialog } from '@/components/Dialog'
import { Button, cx } from '@/components/ui'
import * as importLib from '@/data/import'
import { datasetDef } from '@/data/schema'
import { fmt } from '@/lib/format'
import { blockingFields, openValues, type Step, valueFields } from '../../engine/flow'
import { pendingImports } from '../../engine/plan'
import { useImportSession } from '../../state/session'
import { CheckStep } from './CheckStep'
import { ColumnsStep } from './ColumnsStep'
import { SheetStrip } from './SheetStrip'
import { useCheck } from './useCheck'
import { type ValueField, ValuesStep } from './ValuesStep'

const STEP_LABEL: Record<Step, string> = {
  columns: 'Columns',
  values: 'Values',
  check: 'Check',
}
/** Said after the label from sm up; phones keep the short label so all steps fit. */
const STEP_MORE: Partial<Record<Step, string>> = { check: ' and apply' }

export default function ImportDialog() {
  const sheets = useImportSession((s) => s.sheets)
  const status = useImportSession((s) => s.status)
  const currentId = useImportSession((s) => s.currentId)
  const drafts = useImportSession((s) => s.drafts)
  const notes = useImportSession((s) => s.notes)
  const busy = useImportSession((s) => s.busy)
  const close = useImportSession((s) => s.close)
  const update = useImportSession((s) => s.update)
  const skip = useImportSession((s) => s.skip)
  const apply = useImportSession((s) => s.apply)
  const remapping = useImportSession((s) => s.mode === 'remap')

  const item = sheets.find((s) => s.id === currentId) ?? null
  const draft = currentId ? (drafts[currentId] ?? null) : null
  const def = draft?.dataset ? datasetDef(draft.dataset) : null
  const mapping = draft?.mapping ?? null
  const step: Step = draft?.step ?? 'columns'

  const suggested = useMemo(
    () => (item && def && mapping ? importLib.suggestOptions(item.sheet, def, mapping) : null),
    [item, def, mapping],
  )
  const blockers = useMemo(
    () => (item && def && mapping ? blockingFields(importLib.applyMapping, item.sheet, def, mapping) : []),
    [item, def, mapping],
  )
  const valueList = useMemo<ValueField[]>(() => {
    if (!item || !def || !mapping) return []
    return valueFields(def, mapping).flatMap((field) => {
      const header = mapping[field.key]?.header
      return header
        ? [{ field, header, summaries: importLib.summarizeValues(item.sheet, header, def, field.key) }]
        : []
    })
  }, [item, def, mapping])
  const check = useCheck(item, draft, step === 'check')

  if (!item || !draft) return null

  const openCount = valueList.reduce(
    (a, vf) => a + openValues(vf.summaries, draft.options.valueMaps?.[vf.field.key]),
    0,
  )
  const steps: Step[] = valueList.length ? ['columns', 'values', 'check'] : ['columns', 'check']
  const stepIndex = Math.max(0, steps.indexOf(step))
  const blocked = blockers.length > 0
  const go = (to: Step) => update(item.id, () => ({ step: to }))
  const next = () => go(step === 'columns' && openCount > 0 ? 'values' : 'check')
  const back = () => go(steps[Math.max(0, stepIndex - 1)])
  const position = sheets.findIndex((s) => s.id === item.id) + 1
  const remaining = pendingImports(sheets, status, item.id).length
  const isText = item.format === 'csv' || item.format === 'tsv'
  const result = check.result

  const footer = !def ? (
    <Button variant="primary" onClick={() => void skip(item.id)}>
      {remaining ? 'Skip and continue' : 'Skip and finish'}
    </Button>
  ) : (
    <>
      <Button variant="ghost" className="mr-auto" disabled={busy} onClick={() => void skip(item.id)}>
        {remapping ? 'Cancel' : 'Skip this sheet'}
      </Button>
      {stepIndex > 0 && (
        <Button disabled={busy} onClick={back}>
          Back
        </Button>
      )}
      {step !== 'check' ? (
        <Button variant="primary" disabled={blocked} onClick={next}>
          Next
        </Button>
      ) : (
        <Button
          variant="primary"
          disabled={!result || result.rows.length === 0 || busy}
          onClick={() => {
            if (result) void apply(item.id, result)
          }}
        >
          {busy ? 'Applying…' : remaining ? 'Apply and continue' : 'Apply'}
        </Button>
      )}
    </>
  )

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close()
      }}
      width={1040}
      title={def ? (remapping ? `Re-map ${def.label}` : `Import into ${def.label}`) : 'Import a sheet'}
      description={
        <>
          {remapping ? 'Stored sheet · ' : ''}
          {sheets.length > 1 ? `Sheet ${position} of ${sheets.length} · ` : ''}
          {item.fileName}
          {isText ? '' : ` › ${item.sheetName}`} · {fmt(item.rows, 'int')} {item.rows === 1 ? 'row' : 'rows'},{' '}
          {fmt(item.sheet.headers.length, 'int')} columns
        </>
      }
      footer={footer}
    >
      <SheetStrip />
      {notes.length > 0 && (
        <ul className="mb-4 space-y-0.5 text-[12px] text-muted">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {def && (
        <nav aria-label="Steps" className="-mx-5 mb-5 border-b border-rule px-5">
          <ol className="flex gap-4 overflow-x-auto sm:gap-6">
            {steps.map((s, i) => {
              const selected = s === step
              const reachable = !blocked || s === 'columns'
              return (
                <li key={s} className="shrink-0">
                  <button
                    type="button"
                    aria-current={selected ? 'step' : undefined}
                    disabled={!reachable}
                    onClick={() => go(s)}
                    className={cx(
                      'relative flex h-9 items-center gap-1.5 text-[13px] whitespace-nowrap transition-colors disabled:opacity-45 focus-visible:-outline-offset-2',
                      selected
                        ? 'font-semibold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink'
                        : 'font-medium text-ink-2 hover:text-ink',
                    )}
                  >
                    <span className="tnum text-muted">{i + 1}</span>
                    <span>
                      {STEP_LABEL[s]}
                      {STEP_MORE[s] && <span className="hidden sm:inline">{STEP_MORE[s]}</span>}
                    </span>
                    {s === 'values' && openCount > 0 && (
                      <span className="rounded-[3px] bg-warning-wash px-1 text-[11px] font-semibold text-ink">
                        {openCount} to check
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
      )}
      {step === 'columns' || !def ? (
        <ColumnsStep item={item} draft={draft} suggested={suggested} blockers={blockers} />
      ) : step === 'values' ? (
        <ValuesStep item={item} draft={draft} fields={valueList} />
      ) : (
        <CheckStep item={item} draft={draft} result={result} pending={check.pending} />
      )}
    </Dialog>
  )
}
