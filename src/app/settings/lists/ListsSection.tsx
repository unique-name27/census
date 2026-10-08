/**
 * Settings → Official lists (docs/SETTINGS-LISTS.md, part 2): the approved values Census checks
 * the data against, one list per category, with their hierarchy. A picker with each list's size,
 * status and values to review; the chosen list; the change log with undo; and the "Official
 * lists" workbook to export, edit in Excel and import again (with a preview before anything
 * changes). Categories & mapping links here, and this links back.
 */
import { useId, useRef, useState } from 'react'
import { IconDownload, IconUpload } from '@/components/icons'
import { goTo } from '@/components/navigation'
import { toast } from '@/components/toast'
import { Button, cx, StatusPill } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { analyzeLists, canUndo, LIST_IDS, listDef, useLists } from '@/data/lists'
import type { EffectiveLists, ListId } from '@/data/lists/types'
import { undoListChange } from '@/data/lists/undo'
import { useOfficialLists } from '@/data/lists/useOfficialLists'
import {
  buildListsWorkbook,
  type ListsImportPlan,
  planListsImport,
  readListsWorkbook,
} from '@/data/lists/workbook'
import { SAMPLE_COMPANY } from '@/data/sample'
import { closeSettings } from '@/data/store'
import { todayISO } from '@/lib/dates'
import { downloadBlob } from '@/lib/export/download'
import { whenText } from '@/views/data/mapping/engine/edit'
import { useYourName } from '@/views/data/mapping/ui/hooks'
import { Select } from '@/views/data/ui/Select'
import { LINK, SettingsBlock } from '../ui'
import { undoFromToast } from './actions'
import { ListPanel, ListStatusChip } from './ListPanel'
import { intText, type PickerItem, pickerItems, plural, valuesText } from './listModel'

/** The list open last, so Settings reopens on it. */
let lastList: ListId = 'businessUnit'

type ImportPlan = ListsImportPlan

function Picker({
  items,
  value,
  onChange,
}: {
  items: readonly PickerItem[]
  value: ListId
  onChange: (id: ListId) => void
}) {
  return (
    <>
      <div className="sm:hidden">
        <Select
          label="Official list"
          value={value}
          onChange={(v) => onChange(v as ListId)}
          className="w-full"
        >
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label} ({intText(i.values)}, {i.official ? 'official' : 'proposed'}
              {i.notOnList ? `, ${intText(i.notOnList)} to review` : ''})
            </option>
          ))}
        </Select>
      </div>
      <ul
        aria-label="Official lists"
        className="hidden grid-cols-2 gap-px overflow-hidden rounded-control bg-rule sm:grid"
      >
        {items.map((i) => {
          const on = i.id === value
          return (
            <li key={i.id} className="flex">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onChange(i.id)}
                className={cx(
                  'flex w-full flex-col items-start gap-1 px-3 py-2 text-left transition-colors',
                  on ? 'bg-sheet-2 shadow-[inset_0_0_0_1px_var(--rule-strong)]' : 'bg-sheet hover:bg-hover',
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-small font-semibold text-ink">{i.label}</span>
                  <ListStatusChip official={i.official} />
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-ink-2">
                  {valuesText(i)}
                  {i.notOnList > 0 && (
                    <StatusPill
                      severity={i.official ? 'warning' : 'info'}
                      label={`${intText(i.notOnList)} not on it`}
                      quiet
                    />
                  )}
                </span>
              </button>
            </li>
          )
        })}
        {/* An odd count leaves one cell: fill it with the sheet so the grid reads as one surface. */}
        {items.length % 2 === 1 && <li aria-hidden="true" className="bg-sheet" />}
      </ul>
    </>
  )
}

function ImportPreview({
  plan,
  lists,
  onApply,
  onCancel,
}: {
  plan: ImportPlan
  lists: EffectiveLists
  onApply: () => void
  onCancel: () => void
}) {
  const ids = useId()
  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="flex flex-col gap-3 rounded-control bg-sheet-2 px-3.5 py-3"
    >
      <div>
        <h3 id={`${ids}-title`} className="text-small font-semibold text-ink">
          Import the Official lists workbook
        </h3>
        <p className="mt-0.5 text-meta leading-snug text-ink-2">
          {plan.total
            ? `${plural(plan.total, 'change')} will apply as one change you can undo. Renames change the list only; to rename the values in your data too, use Map to… on each list.`
            : 'Nothing in the file differs from the lists in force.'}
        </p>
      </div>
      {plan.lists.map((p) => (
        <div key={p.id} className="flex flex-col gap-1 border-t border-rule pt-2">
          <span className="text-small font-semibold text-ink">{listDef(p.id).label}</span>
          <ul className="flex flex-col gap-0.5 text-meta leading-snug">
            {p.lines.map((l, i) => (
              <li key={`${l.kind}-${i}`} className={l.error ? 'text-ink-2' : 'text-ink'}>
                {l.error ? (
                  <>
                    <span className="line-through decoration-rule-strong">{l.text}</span>
                    <span className="text-bad-text"> Not applied: {l.error}</span>
                  </>
                ) : (
                  l.text
                )}
              </li>
            ))}
            {p.skipped.map((s) => (
              <li key={`skip-${s.row}`} className="text-ink-2">
                Skipped: {s.reason}
              </li>
            ))}
          </ul>
          {p.notInFile > 0 && (
            <p className="text-meta text-muted">
              {plural(p.notInFile, 'value')} on the list but not in the file{' '}
              {p.notInFile === 1 ? 'stays' : 'stay'} as {p.notInFile === 1 ? 'it is' : 'they are'}.
            </p>
          )}
          {lists[p.id].status === 'proposed' && p.lines.some((l) => !l.error) && (
            <p className="text-meta text-muted">
              The list stays proposed: it checks nothing until you make it official.
            </p>
          )}
        </div>
      ))}
      {plan.notes.map((n) => (
        <p key={n} className="text-meta text-ink-2">
          {n}
        </p>
      ))}
      {plan.ignored.length > 0 && (
        <p className="text-meta text-muted">
          Sheets Census does not know were left out: {plan.ignored.join(', ')}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" disabled={!plan.total} onClick={onApply}>
          {plan.total ? `Apply ${plural(plan.total, 'change')}` : 'Apply'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  )
}

function Changes() {
  const state = useLists((s) => s.state)
  const [name] = useYourName()
  const [all, setAll] = useState(false)
  const ids = useId()
  if (!state.log.length) return null
  const shown = all ? state.log : state.log.slice(0, 5)
  return (
    <section aria-labelledby={`${ids}-title`} className="flex flex-col gap-1.5 border-t border-rule pt-4">
      <h3 id={`${ids}-title`} className="text-small font-semibold text-ink">
        Changes to the lists
      </h3>
      <ul className="flex flex-col">
        {shown.map((c) => (
          <li key={c.id} className="flex items-start gap-3 border-t border-rule py-2 first:border-t-0">
            <div className="min-w-0 flex-1">
              <p className="text-small leading-snug text-ink">{c.what}</p>
              <p className="text-meta text-muted">
                {c.by ?? 'You'}, {whenText(c.at)}
              </p>
            </div>
            {canUndo(state, c.id) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => undoListChange(c.id, name)}
                aria-label={`Undo: ${c.what}`}
              >
                Undo
              </Button>
            )}
          </li>
        ))}
      </ul>
      {state.log.length > 5 && (
        <div>
          <Button size="sm" variant="ghost" className="-ml-2.5" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show all ${intText(state.log.length)}`}
          </Button>
        </div>
      )}
    </section>
  )
}

export function ListsSection() {
  const ctx = useAnalytics()
  const { saved, lists, sources } = useOfficialLists()
  const analysis = analyzeLists(lists, ctx.all)
  const applyImport = useLists((s) => s.applyImport)
  const unsaved = useLists((s) => s.unsaved)
  const [name] = useYourName()
  const [id, setId] = useState<ListId>(lastList)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const items = pickerItems(lists, analysis)
  const choose = (next: ListId) => {
    lastList = next
    setId(next)
  }
  const current = LIST_IDS.includes(id) ? id : 'businessUnit'

  const exportWorkbook = async () => {
    setBusy('export')
    try {
      const blob = await buildListsWorkbook(lists, {
        rows: (l, v) => analysis[l].uses.get(v)?.total ?? 0,
        preparedOn: todayISO(),
        company: ctx.isSample ? SAMPLE_COMPANY : undefined,
      })
      downloadBlob(blob, `census-official-lists-${todayISO()}.xlsx`)
      toast('Official lists workbook downloaded', {
        tone: 'good',
        description:
          'One sheet per list, and a hidden Lists sheet with a workbook name per list for Excel dropdowns.',
      })
    } catch (err) {
      console.error('The official lists could not be exported', err)
      toast('The official lists could not be exported.', { tone: 'critical' })
    } finally {
      setBusy(null)
    }
  }

  const readFile = async (file: File | undefined) => {
    if (!file) return
    setBusy('import')
    try {
      const parsed = await readListsWorkbook(await file.arrayBuffer())
      if (!Object.keys(parsed.lists).length && !parsed.notes.length) {
        toast('No official lists in the file', {
          tone: 'critical',
          description: 'Census reads the sheets of an exported Official lists workbook, such as Departments.',
        })
        return
      }
      setPlan(planListsImport(parsed, saved, lists))
    } catch (err) {
      toast('The file could not be read', {
        tone: 'critical',
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setBusy(null)
    }
  }

  const apply = () => {
    if (!plan) return
    const r = applyImport(plan, lists, { by: name })
    setPlan(null)
    const change = r.change
    if (!change) {
      toast('Nothing changed', { description: r.rejected[0]?.error })
      return
    }
    toast(change.what, {
      tone: 'good',
      description: r.rejected.length
        ? `${plural(r.rejected.length, 'change')} could not be applied.`
        : undefined,
      action: { label: 'Undo', onClick: () => undoFromToast(change.id, name) },
    })
  }

  return (
    <SettingsBlock
      section="lists"
      intro={
        <>
          The approved values Census checks your data against, one list per category. A value in the data that
          is not on an official list counts as not recognized for its field. Lists are kept in this browser
          and in the settings file. How the data relates is in{' '}
          <button
            type="button"
            className={LINK}
            onClick={() => {
              closeSettings()
              goTo('data', 'mapping')
            }}
          >
            Categories & mapping
          </button>
          .
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button icon={<IconDownload />} onClick={() => void exportWorkbook()} disabled={busy !== null}>
          {busy === 'export' ? 'Preparing…' : 'Export workbook'}
        </Button>
        <Button icon={<IconUpload />} onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === 'import' ? 'Reading…' : 'Import workbook…'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            void readFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {unsaved && (
        <p role="status" className="rounded-control bg-warning-wash px-3.5 py-2.5 text-small text-ink">
          Your changes to the lists could not be saved in this browser (its storage is full or blocked). They
          last until you close this tab: export the workbook to keep them.
        </p>
      )}
      {plan && <ImportPreview plan={plan} lists={lists} onApply={apply} onCancel={() => setPlan(null)} />}
      <Picker items={items} value={current} onChange={choose} />
      <ListPanel
        key={current}
        list={lists[current]}
        lists={lists}
        analysis={analysis[current]}
        saved={saved}
        sources={sources}
      />
      <Changes />
    </SettingsBlock>
  )
}
