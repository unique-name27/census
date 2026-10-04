/**
 * What the Datasets tab has open: which manifest rows are expanded, the panel each one shows,
 * and a request to bring one into view (from a tier badge, a link or a button). Also the name
 * the reviewer last signed with, remembered in this browser for the next confirmation.
 */
import { create } from 'zustand'
import type { DatasetKey } from '@/data/schema'
import { type DatasetPanel, DEFAULT_PANEL } from '../links'

interface RoomState {
  open: readonly DatasetKey[]
  panel: Partial<Record<DatasetKey, DatasetPanel>>
  /** The row to scroll to; `nonce` changes on every request. */
  reveal: { key: DatasetKey; nonce: number } | null
  toggle: (key: DatasetKey) => void
  /** Open a row on a panel and bring it into view. */
  show: (key: DatasetKey, panel?: DatasetPanel | null) => void
  setPanel: (key: DatasetKey, panel: DatasetPanel) => void
}

export const useRoom = create<RoomState>((set) => ({
  open: [],
  panel: {},
  reveal: null,
  toggle: (key) =>
    set((s) => ({ open: s.open.includes(key) ? s.open.filter((k) => k !== key) : [...s.open, key] })),
  show: (key, panel) =>
    set((s) => ({
      open: s.open.includes(key) ? s.open : [...s.open, key],
      panel: { ...s.panel, [key]: panel ?? s.panel[key] ?? DEFAULT_PANEL },
      reveal: { key, nonce: (s.reveal?.nonce ?? 0) + 1 },
    })),
  setPanel: (key, panel) => set((s) => ({ panel: { ...s.panel, [key]: panel } })),
}))

const REVIEWER_KEY = 'census:reviewer-name'

/** The name last used to confirm or certify, or '' (storage can be blocked). */
export function loadReviewerName(): string {
  try {
    return localStorage.getItem(REVIEWER_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveReviewerName(name: string): void {
  try {
    if (name.trim()) localStorage.setItem(REVIEWER_KEY, name.trim())
  } catch {
    /* remembered for this page only */
  }
}
