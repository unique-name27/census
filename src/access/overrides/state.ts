/**
 * The policy laid over Census in this tab (docs/SECURITY-CENTER.md): the policy file in force, or
 * while previewing a role, the Security center's draft. A plain store (no React), so the shell,
 * the loader and the Security center share one answer. `key` changes whenever the laid-over policy
 * does; the shell keys the analytics provider on it, so every screen re-reads its decisions.
 *
 * A preview is kept in this tab's sessionStorage (`census:access-preview`), so a reload while
 * previewing stays in the preview; it never changes the policy in force or the draft.
 */
import { createStore } from 'zustand/vanilla'
import type { Mode } from '../modes'
import { setPolicyOverrides } from '../policy'
import { overridesOf } from './lines'
import { DEFAULTS_IN_FORCE, type InForce, isPolicyRole, type PolicyLine, type PolicyRole } from './types'

export const PREVIEW_KEY = 'census:access-preview'

/** Preview as role: the draft's lines, laid over this tab only, and where to go back to. */
export interface PreviewSession {
  role: PolicyRole
  lines: readonly PolicyLine[]
  /** The mode the preview started from (Developer). */
  from: Mode
  /** The Security center's route tab to return to ("security:matrix"). */
  returnTo: string
  startedAt: string
}

export interface PolicyState {
  /** The loader has finished (or given up waiting): the shell can build the analytics context. */
  settled: boolean
  inForce: InForce
  preview: PreviewSession | null
  key: number
}

export const policyStore = createStore<PolicyState>(() => ({
  settled: false,
  inForce: DEFAULTS_IN_FORCE,
  preview: null,
  key: 0,
}))

function lay(lines: readonly PolicyLine[]): void {
  setPolicyOverrides(lines.length ? overridesOf(lines) : null)
}

/** The policy in force; applied unless a preview is on. Marks the loader settled. */
export function setInForce(inForce: InForce): void {
  const { preview } = policyStore.getState()
  if (!preview) lay(inForce.lines)
  policyStore.setState((s) => ({ inForce, settled: true, key: s.key + 1 }))
}

/** Let the shell go on with what is in force now (the file is late). */
export function settle(): void {
  if (policyStore.getState().settled) return
  policyStore.setState((s) => ({ settled: true, key: s.key + 1 }))
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const session = (): StorageLike | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

/** Read a stored preview; anything unreadable is no preview. */
export function parsePreview(raw: string | null): PreviewSession | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<PreviewSession>
    if (!isPolicyRole(v.role) || !Array.isArray(v.lines) || typeof v.returnTo !== 'string') return null
    return {
      role: v.role,
      lines: v.lines.filter((l): l is PolicyLine => !!l && typeof l === 'object' && isPolicyRole(l.role)),
      from: (typeof v.from === 'string' ? v.from : 'developer') as Mode,
      returnTo: v.returnTo,
      startedAt: typeof v.startedAt === 'string' ? v.startedAt : '',
    }
  } catch {
    return null
  }
}

/** Start previewing: the draft's lines over this tab, until `endPreview`. */
export function startPreview(p: PreviewSession, storage: StorageLike | null = session()): void {
  try {
    storage?.setItem(PREVIEW_KEY, JSON.stringify(p))
  } catch {
    /* the preview lasts until a reload */
  }
  lay(p.lines)
  policyStore.setState((s) => ({ preview: p, key: s.key + 1 }))
}

/** Stop previewing: the policy in force again. Returns the preview that ended. */
export function endPreview(storage: StorageLike | null = session()): PreviewSession | null {
  const { preview, inForce } = policyStore.getState()
  try {
    storage?.removeItem(PREVIEW_KEY)
  } catch {
    /* nothing kept */
  }
  if (!preview) return null
  lay(inForce.lines)
  policyStore.setState((s) => ({ preview: null, key: s.key + 1 }))
  return preview
}

/** A preview this tab kept across a reload, laid over again (before the context is built). */
export function resumePreview(storage: StorageLike | null = session()): PreviewSession | null {
  let raw: string | null = null
  try {
    raw = storage?.getItem(PREVIEW_KEY) ?? null
  } catch {
    raw = null
  }
  const p = parsePreview(raw)
  if (!p) return null
  lay(p.lines)
  policyStore.setState((s) => ({ preview: p, key: s.key + 1 }))
  return p
}

/** Back to nothing in force and no preview (tests). */
export function resetPolicyState(): void {
  setPolicyOverrides(null)
  policyStore.setState({ settled: false, inForce: DEFAULTS_IN_FORCE, preview: null, key: 0 })
}
