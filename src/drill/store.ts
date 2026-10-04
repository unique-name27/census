/**
 * The drill stack: a number opens a record list; a row opens a person; Back walks out again.
 */
import { create } from 'zustand'
import type { DrillSpec } from './types'

export type DrillEntry = { type: 'records'; spec: DrillSpec } | { type: 'person'; employeeId: string }

interface DrillState {
  stack: DrillEntry[]
  /** Open a fresh drill (replaces whatever was open). */
  open: (spec: DrillSpec) => void
  /** Open a person's card directly, or on top of the current list. */
  openPerson: (employeeId: string) => void
  back: () => void
  close: () => void
}

export const useDrillStore = create<DrillState>((set) => ({
  stack: [],
  open: (spec) => set({ stack: [{ type: 'records', spec }] }),
  openPerson: (employeeId) => set((s) => ({ stack: [...s.stack, { type: 'person', employeeId }] })),
  back: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  close: () => set({ stack: [] }),
}))

/** Imperative helpers for event handlers (no hook needed). */
export const openDrill = (spec: DrillSpec) => useDrillStore.getState().open(spec)
export const openPerson = (employeeId: string) => useDrillStore.getState().openPerson(employeeId)
