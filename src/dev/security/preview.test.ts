/**
 * Preview as role (docs/SECURITY-CENTER.md, "Tests"): the draft is laid over this tab only, the
 * role opens on its home, and "Back to the Security center" returns there with the draft intact
 * and the policy in force back. A role that needs a pick opens its pick dialog; dismissed, the
 * preview ends. A reload while previewing stays in the preview.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULTS_IN_FORCE,
  emptyDraft,
  type PolicyLine,
  PREVIEW_KEY,
  policyStore,
  resetPolicyState,
  resumePreview,
  setInForce,
  startPreview,
} from '@/access/overrides'
import { decide } from '@/access/policy'
import { useMode } from '@/access/store'
import { useCensus } from '@/data/store'
import { backToSecurityCenter, endIdlePreview, previewAs } from './preview'
import { useDraft } from './store'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

const line = (surface: string, decision: string, role: PolicyLine['role'] = 'finance'): PolicyLine => ({
  role,
  surface,
  decision,
  reason: 'Preview check',
  by: 'QA',
  at: '2026-10-08T09:00:00.000Z',
})

class MemoryStorage {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

beforeEach(() => {
  resetPolicyState()
  // What is in force: Finance's Compensation hidden. The draft hides Onboarding instead.
  setInForce({ ...DEFAULTS_IN_FORCE, source: 'site', lines: [line('view:comp', 'hidden')] })
  useDraft.getState().set({ ...emptyDraft([line('view:onboarding', 'hidden')]), author: 'QA' })
  useMode.getState().setMode('developer')
  useCensus.getState().navigate('dev', 'security:role:finance')
})

afterEach(() => resetPolicyState())

describe('Preview as role', () => {
  it('lays the draft over this tab, enters the role and opens its home', () => {
    const draft = useDraft.getState().draft!
    previewAs('finance', draft.lines, 'role:finance')
    expect(useMode.getState().mode).toBe('finance')
    expect(policyStore.getState().preview?.role).toBe('finance')
    expect(decide('finance', 'view:onboarding').access).toBe('hidden')
    // The draft, not what is in force.
    expect(decide('finance', 'view:comp').access).not.toBe('hidden')
    expect(useCensus.getState().route.view).toBe('home')
  })

  it('returns to the Security center with the draft intact and the policy in force back', () => {
    const draft = useDraft.getState().draft!
    previewAs('finance', draft.lines, 'role:finance')
    backToSecurityCenter()
    expect(policyStore.getState().preview).toBeNull()
    expect(useMode.getState().mode).toBe('developer')
    expect(useCensus.getState().route).toMatchObject({ view: 'dev', tab: 'security:role:finance' })
    expect(useDraft.getState().draft).toBe(draft)
    expect(decide('finance', 'view:comp').access).toBe('hidden')
    expect(decide('finance', 'view:onboarding').access).not.toBe('hidden')
  })

  it('opens the pick dialog for a role that needs one, and ends quietly when it is dismissed', () => {
    useMode.setState({ picks: { managerId: null, unit: null, region: null, recruiter: null } })
    previewAs('hrbp-unit', [line('view:ai', 'hidden', 'hrbp-unit')], '')
    expect(useMode.getState().mode).toBe('developer')
    expect(useMode.getState().picking).toBe('unit')
    expect(endIdlePreview('developer', 'unit')).toBe(false)
    expect(decide('hrbp-unit', 'view:ai').access).toBe('hidden')
    useMode.getState().cancelPick()
    expect(endIdlePreview(useMode.getState().mode, useMode.getState().picking)).toBe(true)
    expect(policyStore.getState().preview).toBeNull()
    expect(decide('hrbp-unit', 'view:ai').access).not.toBe('hidden')
  })

  it('stays in the preview across a reload of the tab, and never touches what is in force', () => {
    const storage = new MemoryStorage()
    const lines = [line('view:onboarding', 'hidden')]
    startPreview({ role: 'finance', lines, from: 'developer', returnTo: '', startedAt: '' }, storage)
    expect(storage.getItem(PREVIEW_KEY)).toContain('view:onboarding')
    // A reload: the module state starts over, the stored preview comes back.
    resetPolicyState()
    setInForce({ ...DEFAULTS_IN_FORCE, source: 'site', lines: [line('view:comp', 'hidden')] })
    expect(resumePreview(storage)?.role).toBe('finance')
    expect(decide('finance', 'view:onboarding').access).toBe('hidden')
    expect(policyStore.getState().inForce.lines).toEqual([line('view:comp', 'hidden')])
  })
})
