/**
 * Catalog actions with their confirmations: each change says what happened, offers Undo where it
 * replaces or removes something, and says so when this browser would not keep it.
 */
import { toast } from '@/components/toast'
import { plural } from '@/lib/format'
import type { Agent, AgentDraft } from '../catalog'
import { useAiAgents } from '../state'
import { useAiUi } from './uiState'

const store = () => useAiAgents.getState()

/** Toast description when the last change did not reach this browser's storage. */
const notKept = (): string | undefined =>
  store().persisted
    ? undefined
    : 'This browser did not save it, so the change lasts until you leave the page.'

export function saveAgent(id: string | null, draft: AgentDraft): void {
  if (id) {
    store().updateAgent(id, draft)
    toast(`Saved "${draft.name.trim()}"`, { tone: 'good', description: notKept() })
  } else {
    const a = store().addAgent(draft)
    toast(`Added "${a.name}"`, { tone: 'good', description: notKept() })
  }
}

export function removeAgent(agent: Agent): void {
  const removed = store().removeAgent(agent.id)
  if (!removed) return
  toast(`Removed "${agent.name}"`, {
    description: notKept(),
    action: { label: 'Undo', onClick: () => store().restoreAgent(removed.agent, removed.index) },
  })
}

export function replaceCatalog(agents: readonly Agent[], fileName: string): void {
  const prev = store().replaceAll(agents)
  toast(`Catalog replaced with ${plural(agents.length, 'agent')}`, {
    tone: 'good',
    description: notKept() ?? `From ${fileName}. Kept in this browser.`,
    action: { label: 'Undo', onClick: () => store().restoreCatalog(prev) },
  })
}

export function resetToSample(): void {
  const prev = store().resetToSample()
  toast('Catalog reset to the sample', {
    action: { label: 'Undo', onClick: () => store().restoreCatalog(prev) },
  })
}

export async function exportSheet(): Promise<void> {
  const { agents } = store()
  try {
    const { downloadAgentsWorkbook } = await import('../catalog/excel')
    await downloadAgentsWorkbook(agents)
    toast('AI agents sheet downloaded', {
      tone: 'good',
      description: `${plural(agents.length, 'agent')}. Edit it in Excel and import it here to replace the catalog.`,
    })
  } catch (err) {
    console.error('AI agents export failed', err)
    toast('The sheet could not be created. Try again.', { tone: 'critical' })
  }
}

/** Read a chosen file and open the import preview. */
export async function importFile(file: File): Promise<void> {
  try {
    const [{ readAgentsFile }, buffer] = await Promise.all([import('../catalog/excel'), file.arrayBuffer()])
    useAiUi.getState().showImport(readAgentsFile(buffer, file.name))
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'WorkbookReadError'
        ? err.message
        : `"${file.name}" could not be read. Save it as .xlsx or .csv and try again.`
    if (!(err instanceof Error && err.name === 'WorkbookReadError'))
      console.error('AI agents import failed', err)
    toast('Import failed', { tone: 'critical', description: message })
  }
}
