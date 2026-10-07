/**
 * Where files come in: a panel with a file button that also takes files dropped on it. While
 * files are read it shows which one and how far along, in place. Its foot says how many column
 * choices Census remembers and offers to forget them all.
 */
import { type DragEvent, useEffect, useState } from 'react'
import { IconUpload } from '@/components/icons'
import { spanClass } from '@/components/Section'
import { toast } from '@/components/toast'
import { Button, cx } from '@/components/ui'
import { fmt } from '@/lib/format'
import { useSavedChoices } from '../state/savedChoices'
import { useImportSession } from '../state/session'
import { useFilePicker } from './useFilePicker'

/** Files from a drop, ignoring folders and other non-file items. */
function droppedFiles(e: DragEvent): File[] {
  return [...e.dataTransfer.files].filter((f) => f.size > 0 || f.type !== '')
}

function SavedChoices() {
  const layouts = useSavedChoices((s) => s.layouts)
  const learned = useSavedChoices((s) => s.learned)
  const refresh = useSavedChoices((s) => s.refresh)
  const forgetAll = useSavedChoices((s) => s.forgetAll)
  const idle = useImportSession((s) => s.phase === 'idle')
  const [working, setWorking] = useState(false)
  // Count again whenever an upload finishes, since applying a sheet saves its column choices.
  useEffect(() => {
    if (idle) void refresh()
  }, [idle, refresh])
  if (!layouts && !learned) return null
  return (
    <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule px-5 py-2.5 text-meta text-ink-2">
      <span className="min-w-0 flex-1 basis-[260px]">
        {layouts
          ? `Saved column choices for ${fmt(layouts, 'int')} file ${layouts === 1 ? 'layout' : 'layouts'} are applied to files with the same columns.`
          : 'Column names you picked are remembered for the next upload.'}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="-mr-2"
        disabled={working || !idle}
        onClick={async () => {
          setWorking(true)
          await forgetAll()
          setWorking(false)
          toast('All saved column choices were forgotten', {
            description: 'The next upload is matched from its column names again.',
          })
        }}
      >
        Forget all saved column choices
      </Button>
    </p>
  )
}

export function DropZone({ className }: { className?: string }) {
  const start = useImportSession((s) => s.start)
  const phase = useImportSession((s) => s.phase)
  const reading = useImportSession((s) => s.reading)
  const picker = useFilePicker()
  const [over, setOver] = useState(false)
  const busy = phase !== 'idle'

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = busy ? 'none' : 'copy'
    if (!busy) setOver(true)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (busy) return
    const files = droppedFiles(e)
    if (files.length) void start(files)
  }

  return (
    // Dropping is a pointer shortcut; the Choose files button is the keyboard path.
    <section
      aria-label="Add files"
      data-tour="data-dropzone"
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={onDrop}
      className={cx(
        spanClass(12),
        'flex flex-col rounded-sheet bg-sheet transition-[background-color,box-shadow] duration-100',
        over && 'bg-hover shadow-[inset_0_0_0_2px_var(--ink)]',
        className,
      )}
    >
      <div className="px-5 pt-4 pb-5">
        <h2 className="eyebrow">Your files</h2>
        {reading ? (
          <div aria-live="polite">
            <p className="cut-head mt-2 truncate text-section leading-tight font-semibold">
              Reading {reading.fileName}
            </p>
            <p className="mt-2 text-small text-ink-2">
              {reading.total > 1 ? `File ${reading.index + 1} of ${reading.total}. ` : ''}Large workbooks take
              a few seconds. Nothing changes until you apply a sheet.
            </p>
          </div>
        ) : (
          <>
            <p className="cut-head mt-2 text-section leading-tight font-semibold">
              {over ? 'Drop to read these files' : 'Replace the sample with your exports'}
            </p>
            <p className="mt-2 max-w-[72ch] text-small text-ink-2">
              Add one file or several: .xlsx, .xls, .csv or .tsv, with any number of sheets. Each sheet is
              matched to a dataset by its columns, and you check the match and the rows before anything is
              replaced.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button variant="primary" icon={<IconUpload />} disabled={busy} onClick={() => picker.open()}>
                Choose files
              </Button>
              <span className="hidden text-meta text-muted sm:inline">or drop them on this panel</span>
            </div>
          </>
        )}
      </div>
      <SavedChoices />
      {picker.input}
    </section>
  )
}
