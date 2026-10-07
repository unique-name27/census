/**
 * Ask Census state: whether the sheet is open, the conversation and its turns (in memory for the
 * browser session only: never written to storage, kept when the sheet closes, cleared by New
 * chat), the composer's draft, and a counter that changes when the API key or model changes so
 * the sheet and Settings read them again. The key itself is never held here.
 */
import { createRef } from 'react'
import { create } from 'zustand'
import { ASK_NEW_CHAT } from '@/access/copy'
import { useMode } from '@/access/store'
import {
  type Conversation,
  createConversation,
  KEY_STORAGE_KEY,
  MODEL_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
} from '@/ask/engine'
import { useCensus } from '@/data/store'
import type { Turn } from './model'

/** The masthead Ask button: focus comes back here when nothing better is left. */
export const askTrigger = createRef<HTMLButtonElement>()

interface AskState {
  open: boolean
  /** Changes on every open request. */
  nonce: number
  /** Changes on New chat, so a late event from the old chat is ignored. */
  chat: number
  conversation: Conversation
  turns: Turn[]
  busy: boolean
  draft: string
  /** Changes when the key, model or workspace ID is saved or forgotten (here or in another tab). */
  keyVersion: number
  /** An answer finished while the sheet was closed and has not been seen yet. */
  unseen: boolean
  /** A line at the top of the sheet: "Mode changed, so Ask started a new chat." */
  notice: string | null

  openAsk: () => void
  closeAsk: () => void
  setDraft: (draft: string) => void
  /** Replace one turn (by id) in the current chat. */
  updateTurn: (chat: number, id: number, next: (t: Turn) => Turn) => void
  addTurn: (t: Turn) => void
  setBusy: (busy: boolean) => void
  /** An answer finished: unseen when the sheet is closed. */
  answered: () => void
  /** A new conversation: new tokens, refs and history. */
  reset: () => void
  /** The mode changed: a new conversation, with a line saying why (earlier answers may hold numbers it hides). */
  modeChanged: () => void
  keyChanged: () => void
}

export const useAsk = create<AskState>((set, get) => ({
  open: false,
  nonce: 0,
  chat: 1,
  conversation: createConversation(),
  turns: [],
  busy: false,
  draft: '',
  keyVersion: 0,
  unseen: false,
  notice: null,

  openAsk() {
    closedFor.route = false
    set((s) => ({ open: true, nonce: s.nonce + 1, unseen: false }))
  },
  closeAsk() {
    set({ open: false })
  },
  setDraft(draft) {
    set({ draft })
  },
  updateTurn(chat, id, next) {
    if (get().chat !== chat) return
    set((s) => ({ turns: s.turns.map((t) => (t.id === id ? next(t) : t)) }))
  },
  addTurn(t) {
    set((s) => ({ turns: [...s.turns, t] }))
  },
  setBusy(busy) {
    set({ busy })
  },
  answered() {
    if (!get().open) set({ unseen: true })
  },
  reset() {
    set((s) => ({
      chat: s.chat + 1,
      conversation: createConversation(),
      turns: [],
      busy: false,
      unseen: false,
      notice: null,
    }))
  },
  modeChanged() {
    const had = get().turns.length > 0
    get().reset()
    if (had) set({ notice: ASK_NEW_CHAT })
  },
  keyChanged() {
    set((s) => ({ keyVersion: s.keyVersion + 1 }))
  },
}))

export const openAsk = (): void => useAsk.getState().openAsk()
export const closeAsk = (): void => useAsk.getState().closeAsk()

/** The sheet closed because the page changed under it: focus is then the new page's to place. */
export const closedFor = { route: false }

/**
 * Leave Ask for another page (a view link, or a metric's "Open in Metric definitions"): the sheet
 * closes first and the page then changes, so focus goes to the new page, not back to the button
 * that opened Ask.
 */
export function leaveAsk(): void {
  closedFor.route = true
  useAsk.getState().closeAsk()
}

// Going to another page (a link in the records panel or a person card opened from an answer)
// closes the sheet, so the page shows; the conversation stays.
if (typeof window !== 'undefined')
  useCensus.subscribe((s, prev) => {
    if (s.route !== prev.route && (s.route.view !== prev.route.view || s.route.tab !== prev.route.tab))
      if (useAsk.getState().open) {
        closedFor.route = true
        useAsk.getState().closeAsk()
      }
  })

// Any mode change starts a new chat (docs/ROLES.md, 1.5): earlier answers may hold numbers the new
// mode does not show.
useMode.subscribe((s, prev) => {
  if (s.mode !== prev.mode || s.managerId !== prev.managerId) useAsk.getState().modeChanged()
})

// A key kept on this device (or the model choice or workspace ID) changed in another tab: read
// them again.
if (typeof window !== 'undefined') {
  try {
    window.addEventListener('storage', (e) => {
      if (
        e.key === KEY_STORAGE_KEY ||
        e.key === MODEL_STORAGE_KEY ||
        e.key === WORKSPACE_STORAGE_KEY ||
        e.key === null
      )
        useAsk.getState().keyChanged()
    })
  } catch {
    /* no storage events: the next open reads them anyway */
  }
}
