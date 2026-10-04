/**
 * View-local selection state shared across the Recruiting tabs: the action-queue owner filter, a
 * request to scroll the queue into view, and the basis of the offer acceptance by location chart.
 * Kept out of the global filters because each narrows one figure, not the app. (Clicking a number
 * opens the shared drill panel instead of filtering the page.)
 */
import { create } from 'zustand'

interface RecruitingUi {
  owner: string | null
  /** Scroll the action queue into view on the next Pipeline render. */
  focusQueue: boolean
  /** Offer acceptance by location: the latest quarter or the whole period (null = follow the readout). */
  acceptanceBasis: 'quarter' | 'period' | null
  setAcceptanceBasis: (basis: 'quarter' | 'period') => void
  filterOwner: (owner: string | null) => void
  /** Show the whole queue and scroll to it (from the Overview). */
  openQueue: () => void
  queueFocused: () => void
}

export const useRecruitingUi = create<RecruitingUi>((set) => ({
  owner: null,
  focusQueue: false,
  acceptanceBasis: null,
  setAcceptanceBasis: (basis) => set({ acceptanceBasis: basis }),
  filterOwner: (owner) => set({ owner }),
  openQueue: () => set({ owner: null, focusQueue: true }),
  queueFocused: () => set({ focusQueue: false }),
}))
