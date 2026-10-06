/**
 * Settings → This device: save the settings to a file, load them from one, or clear everything
 * Census stored in this browser (with a confirm step in the page).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { IconDownload, IconReset, IconUpload } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button } from '@/components/ui'
import { settingsFileName } from '@/data/settings'
import { clearDevice, exportSettings, importSettings } from '@/data/store'
import { useSavedViews } from '@/data/viewsStore'
import { todayISO } from '@/lib/dates'
import { downloadBlob } from '@/lib/export/download'
import { importDescription } from './model'
import { Field, SettingsBlock } from './ui'

function ClearEverything() {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const confirmId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  // Cancel takes the confirmation away: focus goes back to the button that asked for it.
  const openRef = useRef<HTMLButtonElement>(null)
  const cancelled = useRef(false)
  useEffect(() => {
    if (confirming || !cancelled.current) return
    cancelled.current = false
    openRef.current?.focus()
  }, [confirming])
  const clear = async () => {
    setBusy(true)
    try {
      await clearDevice()
      // Other in-memory stores (import logs, sessions) start over with the page.
      location.reload()
    } catch (err) {
      console.error('Clearing this device failed', err)
      setBusy(false)
      toast('Not everything could be cleared', {
        tone: 'critical',
        description: 'Reload the page and try again.',
      })
    }
  }
  if (!confirming)
    return (
      <Field
        label="Clear everything on this device"
        hint="Deletes uploads, mappings, certifications, metric definition changes and settings that Census stored in this browser, then starts over on the sample data."
      >
        <Button
          ref={openRef}
          icon={<IconReset />}
          onClick={() => {
            setConfirming(true)
            requestAnimationFrame(() => cancelRef.current?.focus())
          }}
        >
          Clear everything…
        </Button>
      </Field>
    )
  return (
    <div
      role="alertdialog"
      aria-labelledby={`${confirmId}-title`}
      aria-describedby={`${confirmId}-body`}
      className="rounded-control bg-critical-wash px-4 py-3.5"
    >
      <p id={`${confirmId}-title`} className="text-[13px] font-semibold text-ink">
        Clear everything Census stored in this browser?
      </p>
      <p id={`${confirmId}-body`} className="mt-1 max-w-[60ch] text-[13px] leading-snug text-ink-2">
        Uploaded files, mappings, certifications, metric definition changes and settings are deleted from this
        device. This can't be undone. Export your settings first if you want to keep them.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void clear()}>
          {busy ? 'Clearing…' : 'Clear everything'}
        </Button>
        <Button
          ref={cancelRef}
          disabled={busy}
          onClick={() => {
            cancelled.current = true
            setConfirming(false)
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function DeviceSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const onExport = () => {
    downloadBlob(exportSettings(), settingsFileName(todayISO()))
    toast('Settings file downloaded', { tone: 'good', description: 'Pay amounts are never in it.' })
  }
  const onImport = async (file: File | undefined) => {
    if (!file) return
    let text: string
    try {
      text = await file.text()
    } catch {
      toast('The file could not be read', { tone: 'critical' })
      return
    }
    const r = importSettings(text)
    if (!r.ok) {
      toast('Settings not imported', { tone: 'critical', description: r.error })
      return
    }
    // Saved views in the file join yours (a view with the same name is replaced).
    const views = r.viewsSection !== undefined ? useSavedViews.getState().importSection(r.viewsSection) : null
    const viewsText = views?.ok ? `Saved views: ${views.summary}.` : null
    toast('Settings imported', {
      tone: 'good',
      description:
        viewsText && !r.applied.length && !r.metrics && !r.listsSummary
          ? viewsText
          : [importDescription(r.applied, r.metrics, r.listsSummary), viewsText].filter(Boolean).join(' '),
    })
    if (views && !views.ok)
      toast('The saved views were not imported', {
        tone: 'critical',
        description: `${views.error} Your saved views stay as they were.`,
      })
    // The rest of the file applied; its official lists did not, so that gets its own warning.
    if (r.listsError)
      toast('The official lists were not imported', {
        tone: 'critical',
        description: `${r.listsError} The lists in this browser stay as they were.`,
      })
  }
  return (
    <SettingsBlock
      section="device"
      intro="Census keeps everything in this browser. Nothing is sent anywhere."
    >
      <Field
        label="Settings file"
        hint="Move your settings to another browser or computer. The file holds display, data and tool link settings, your metric definitions (wording, targets and calculation settings, with their change log), the official lists you saved and your saved views; it never holds pay amounts or data."
      >
        <Button icon={<IconDownload />} onClick={onExport}>
          Export settings
        </Button>
        <Button icon={<IconUpload />} onClick={() => fileRef.current?.click()}>
          Import settings…
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void onImport(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </Field>
      <ClearEverything />
    </SettingsBlock>
  )
}
