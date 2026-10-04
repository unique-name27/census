/**
 * View state for the Org chart: per-viewer preferences (color key, open roles, flags) and the reorg
 * sandbox scenario. Both live in this browser only (localStorage, wrapped so a blocked store just
 * means nothing is remembered). The scenario never touches the datasets.
 */
import { useState } from 'react'
import type { ColorBy, ScenarioAction } from '../engine'

const KEY = 'census:org:'

function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(KEY + k)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(KEY + k, JSON.stringify(v))
  } catch {
    /* storage unavailable: the preference lasts for this visit only */
  }
}

export interface ChartPrefs {
  colorBy: ColorBy
  showReqs: boolean
  showFlags: boolean
}
// Business unit by default: six units fit the eight color slots, where most departments would
// fold into "Other" at the executive levels.
const DEFAULT_PREFS: ChartPrefs = { colorBy: 'businessUnit', showReqs: false, showFlags: true }

export function useChartPrefs(): [ChartPrefs, (patch: Partial<ChartPrefs>) => void] {
  const [prefs, setPrefs] = useState<ChartPrefs>(() => ({
    ...DEFAULT_PREFS,
    ...read<Partial<ChartPrefs>>('prefs', {}),
  }))
  const update = (patch: Partial<ChartPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch }
      write('prefs', next)
      return next
    })
  }
  return [prefs, update]
}

/* ───────── scenario ───────── */

export interface BlockedAttempt {
  action: ScenarioAction
  reason: string
}

export interface StoredScenario {
  fingerprint: string
  actions: ScenarioAction[]
  cursor: number
  blocked: BlockedAttempt[]
}

export interface Scenario {
  /** Every recorded action; only the first `cursor` are in effect (the rest can be redone). */
  actions: ScenarioAction[]
  cursor: number
  blocked: BlockedAttempt[]
  /** Actions in effect. */
  active: ScenarioAction[]
  canUndo: boolean
  canRedo: boolean
  push: (a: ScenarioAction) => void
  undo: () => void
  redo: () => void
  /** Clear every step (and the redo list); returns what was cleared so it can be restored. */
  reset: () => StoredScenario
  /** Put back a scenario that `reset` cleared. */
  restore: (s: StoredScenario) => void
  block: (b: BlockedAttempt) => void
  clearBlocked: () => void
}

const empty = (fingerprint: string): StoredScenario => ({ fingerprint, actions: [], cursor: 0, blocked: [] })

/**
 * The sandbox scenario for one roster snapshot. `fingerprint` identifies the data the moves were
 * made on (as-of date and roster size); a different snapshot starts a fresh scenario.
 */
export function useScenario(fingerprint: string): Scenario {
  const [state, setState] = useState<StoredScenario>(() => {
    const saved = read<StoredScenario | null>('scenario', null)
    return saved && saved.fingerprint === fingerprint && Array.isArray(saved.actions)
      ? saved
      : empty(fingerprint)
  })
  const cur = state.fingerprint === fingerprint ? state : empty(fingerprint)

  const commit = (next: StoredScenario) => {
    write('scenario', next)
    setState(next)
  }

  return {
    actions: cur.actions,
    cursor: cur.cursor,
    blocked: cur.blocked,
    active: cur.actions.slice(0, cur.cursor),
    canUndo: cur.cursor > 0,
    canRedo: cur.cursor < cur.actions.length,
    push: (a) => {
      const actions = [...cur.actions.slice(0, cur.cursor), a]
      commit({ ...cur, actions, cursor: actions.length })
    },
    undo: () => {
      if (cur.cursor > 0) commit({ ...cur, cursor: cur.cursor - 1 })
    },
    redo: () => {
      if (cur.cursor < cur.actions.length) commit({ ...cur, cursor: cur.cursor + 1 })
    },
    reset: () => {
      commit(empty(fingerprint))
      return cur
    },
    restore: (s) => {
      if (s.fingerprint === fingerprint) commit(s)
    },
    block: (b) => commit({ ...cur, blocked: [b, ...cur.blocked].slice(0, 20) }),
    clearBlocked: () => commit({ ...cur, blocked: [] }),
  }
}
