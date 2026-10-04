/**
 * Which catalog dialog is open. The header actions (Add agent, Import) and the cards (Edit) open
 * them; the view body renders them once.
 */
import { create } from 'zustand'
import type { AgentArea } from '../catalog'
import type { AgentFileRead } from '../catalog/excel'

export type Editing = { mode: 'add'; area?: AgentArea } | { mode: 'edit'; id: string }

interface AiUi {
  editing: Editing | null
  importRead: AgentFileRead | null
  confirmReset: boolean
  openAdd: (area?: AgentArea) => void
  openEdit: (id: string) => void
  closeEdit: () => void
  showImport: (read: AgentFileRead | null) => void
  setConfirmReset: (open: boolean) => void
}

export const useAiUi = create<AiUi>((set) => ({
  editing: null,
  importRead: null,
  confirmReset: false,
  openAdd: (area) => set({ editing: { mode: 'add', area } }),
  openEdit: (id) => set({ editing: { mode: 'edit', id } }),
  closeEdit: () => set({ editing: null }),
  showImport: (importRead) => set({ importRead }),
  setConfirmReset: (confirmReset) => set({ confirmReset }),
}))
