/**
 * The two confirmations that replace the whole catalog: importing an "AI agents" sheet (with a
 * preview of what was read and what was left out) and resetting to the sample.
 */
import { Dialog } from '@/components/Dialog'
import { Button } from '@/components/ui'
import { plural } from '@/lib/format'
import { AREA_LABEL, groupByArea, SAMPLE_AGENTS } from '../catalog'
import { useAiAgents } from '../state'
import { replaceCatalog, resetToSample } from './actions'
import { useAiUi } from './uiState'

const MAX_ISSUES = 8

export function ImportDialog() {
  const read = useAiUi((s) => s.importRead)
  const show = useAiUi((s) => s.showImport)
  const current = useAiAgents((s) => s.agents.length)
  const close = () => show(null)
  const n = read?.agents.length ?? 0
  return (
    <Dialog
      open={!!read}
      onOpenChange={(o) => {
        if (!o) close()
      }}
      title="Import AI agents"
      description={
        read ? (read.sheetName ? `${read.fileName}, sheet "${read.sheetName}".` : read.fileName) : undefined
      }
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!n}
            onClick={() => {
              if (!read) return
              replaceCatalog(read.agents, read.fileName)
              close()
            }}
          >
            {n ? `Replace the catalog with ${plural(n, 'agent')}` : 'Nothing to import'}
          </Button>
        </>
      }
    >
      {read && (
        <div className="flex flex-col gap-3 text-small">
          {n > 0 ? (
            <>
              <p className="text-ink">
                {plural(n, 'agent')} ready
                {read.skipped ? `, ${plural(read.skipped, 'row')} left out` : ''}. They replace the{' '}
                {plural(current, 'agent')} in this browser's catalog. You can undo right after.
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink-2">
                {groupByArea(read.agents).map((g) => (
                  <li key={g.area}>
                    {AREA_LABEL[g.area]} <span className="tnum text-muted">{g.agents.length}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-ink">No agents could be read from this file.</p>
          )}
          {read.issues.length > 0 && (
            <div>
              <h3 className="eyebrow">What to check</h3>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-meta leading-snug text-ink-2 marker:text-muted">
                {read.issues.slice(0, MAX_ISSUES).map((i, k) => (
                  <li key={k}>{i.message}</li>
                ))}
              </ul>
              {read.issues.length > MAX_ISSUES && (
                <p className="mt-1 text-meta text-muted">
                  And {plural(read.issues.length - MAX_ISSUES, 'more note')}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

export function ResetDialog() {
  const open = useAiUi((s) => s.confirmReset)
  const setOpen = useAiUi((s) => s.setConfirmReset)
  const current = useAiAgents((s) => s.agents.length)
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Reset to the sample catalog?"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              resetToSample()
              setOpen(false)
            }}
          >
            Reset to sample
          </Button>
        </>
      }
    >
      <p className="text-small text-ink">
        This replaces the {plural(current, 'agent')} in this browser's catalog with the{' '}
        {plural(SAMPLE_AGENTS.length, 'sample agent')}. You can undo right after.
      </p>
    </Dialog>
  )
}
