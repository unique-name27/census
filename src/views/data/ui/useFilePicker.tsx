import { useRef } from 'react'
import type { DatasetKey } from '@/data/schema'
import { ACCEPT_ATTR, useImportSession } from '../state/session'

/**
 * A hidden file input and an `open(target)` to show the system file picker. With a target (a
 * dataset's Upload button) the best-fitting sheet goes to that dataset.
 */
export function useFilePicker() {
  const start = useImportSession((s) => s.start)
  const inputRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef<DatasetKey | null>(null)
  const open = (target: DatasetKey | null = null) => {
    targetRef.current = target
    inputRef.current?.click()
  }
  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={ACCEPT_ATTR}
      className="hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])]
        e.target.value = ''
        if (files.length) void start(files, targetRef.current)
      }}
    />
  )
  return { open, input }
}
