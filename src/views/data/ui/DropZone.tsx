/**
 * The large drop target for Excel and CSV files, with a file button for people who don't drag.
 * While files are read it shows which one and how far along, in place.
 */
import { type DragEvent, useState } from 'react'
import { IconUpload } from '@/components/icons'
import { spanClass } from '@/components/Section'
import { Button, cx } from '@/components/ui'
import { useImportSession } from '../state/session'
import { useFilePicker } from './useFilePicker'

/** Files from a drop, ignoring folders and other non-file items. */
function droppedFiles(e: DragEvent): File[] {
  return [...e.dataTransfer.files].filter((f) => f.size > 0 || f.type !== '')
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
    <section aria-label="Add files" className={cx(spanClass(8), 'rounded-sheet bg-sheet p-2', className)}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dropping is a pointer shortcut; the Choose files button is the keyboard path */}
      <div
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
        }}
        onDrop={onDrop}
        className={cx(
          'flex h-full min-h-[208px] flex-col justify-center rounded-control border border-dashed px-6 py-7 transition-colors duration-100',
          over ? 'border-ink bg-hover' : 'border-rule-strong',
        )}
      >
        <span className="flex size-9 items-center justify-center rounded-control bg-sheet-2 text-ink-2">
          <IconUpload />
        </span>
        {reading ? (
          <div aria-live="polite" className="mt-4">
            <h2 className="cut-head text-[20px] leading-tight font-semibold">Reading {reading.fileName}</h2>
            <p className="mt-1 text-[13px] text-ink-2">
              {reading.total > 1 ? `File ${reading.index + 1} of ${reading.total}. ` : ''}Large workbooks take
              a few seconds. Nothing changes until you apply a sheet.
            </p>
          </div>
        ) : (
          <>
            <h2 className="cut-head mt-4 text-[20px] leading-tight font-semibold">
              {over ? 'Drop to read these files' : 'Drop Excel or CSV files here'}
            </h2>
            <p className="mt-1 max-w-[62ch] text-[13px] text-ink-2">
              Add one file or several. Each sheet is matched to a dataset by its columns, and you check the
              match and the rows before anything is replaced.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button variant="primary" icon={<IconUpload />} disabled={busy} onClick={() => picker.open()}>
                Choose files
              </Button>
              <span className="text-[12px] text-muted">
                .xlsx, .xls, .csv or .tsv · workbooks with several sheets
              </span>
            </div>
          </>
        )}
        {picker.input}
      </div>
    </section>
  )
}
