/**
 * Hidden by an override means hidden everywhere it can be reached (docs/SECURITY-CENTER.md, the
 * red-team list of docs/ROLES-V2.md 4: not rendered, not in exports, not reachable by link,
 * shortcut, tour, search or Ask). Each case puts a policy in force the way the loader does and
 * checks every way in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accessFor } from '@/access/context'
import {
  DEFAULTS_IN_FORCE,
  overridesOf,
  type PolicyLine,
  type PolicyRole,
  resetPolicyState,
  setInForce,
} from '@/access/overrides'
import { decide, firstShownTab, routeDecision, routeShown } from '@/access/policy'
import { S } from '@/access/surfaces'
import { Conversation } from '@/ask/engine/conversation'
import { call, envOf, sampleCtx } from '@/ask/engine/testkit'
import { toolDefinitionsFor } from '@/ask/engine/tools'
import { articleShown, articlesInMode, tourInMode } from '@/help/access'
import { ARTICLES } from '@/help/articles'
import { TOURS } from '@/help/tours'
import { folderViews, VIEWS, visibleViews } from '@/views/registry'
import { withAccessTabs } from '@/views/types'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

afterEach(() => resetPolicyState())

const line = (role: PolicyRole, surface: string, decision: string): PolicyLine => ({
  role,
  surface,
  decision,
  reason: 'Red-team check',
  by: 'QA',
  at: '2026-10-08T09:00:00.000Z',
})

/** Put lines in force as the loader would. */
const inForce = (...lines: PolicyLine[]) => setInForce({ ...DEFAULTS_IN_FORCE, source: 'site', lines })

describe('a view hidden by an override', () => {
  it('is gone from the folder tabs, its address, its tabs, its figures and its header', () => {
    inForce(line('finance', 'view:onboarding', 'hidden'))
    const access = accessFor('finance')
    expect(folderViews(access).map((v) => v.key)).not.toContain('onboarding')
    expect(visibleViews(access).map((v) => v.key)).not.toContain('onboarding')
    expect(routeShown('finance', 'onboarding', 'plan')).toBe(false)
    const r = routeDecision('finance', { view: 'onboarding', tab: 'plan' })
    expect(r.redirected).toBe(true)
    expect(r.route.view).toBe('home')
    expect(firstShownTab('finance', 'onboarding')).toBeNull()
    expect(access.can(S.figure('onboarding-plan-vs-actual'))).toBe(false)
    expect(access.can(S.figure('home-fin-plan'), { view: 'onboarding', tab: 'plan' })).toBe(false)
    expect(access.can(S.header('onboarding'))).toBe(false)
    // Ask's view enum leaves it out too.
    const tools = toolDefinitionsFor(access)
    const summary = tools.find((t) => t.name === 'view_summary')
    const viewEnum = (summary?.input_schema.properties as Record<string, { enum?: string[] }> | undefined)
      ?.view?.enum
    if (viewEnum) expect(viewEnum).not.toContain('onboarding')
    // Its article and tour are not offered where their view is not shown.
    const tour = TOURS.find((t) => t.id === 'view-onboarding')
    if (tour) expect(tourInMode(access, tour)).toBeNull()
  })

  it('keeps every other mode as it was', () => {
    const before = decide('hr', 'view:onboarding')
    inForce(line('finance', 'view:onboarding', 'hidden'))
    expect(decide('hr', 'view:onboarding')).toEqual(before)
    expect(decide('developer', 'view:onboarding').access).toBe('shown')
  })
})

describe('a tab hidden by an override', () => {
  it('is dropped from its view, its address goes to the first shown tab, and its figures go', () => {
    inForce(line('hr', 'tab:recruiting.sources', 'hidden'))
    const access = accessFor('hr')
    const view = VIEWS.find((v) => v.key === 'recruiting')!
    expect(withAccessTabs(view, access).tabs.map((t) => t.key)).not.toContain('sources')
    expect(access.can(S.figure('recruiting-anything'), { view: 'recruiting', tab: 'sources' })).toBe(false)
    expect(access.can(S.kpi('k'), { view: 'recruiting', tab: 'sources' })).toBe(false)
  })
})

describe('an Ask tool hidden by an override', () => {
  it('is not sent to Claude, and a call to it is refused', () => {
    inForce(line('hr', 'ask:query_records', 'hidden'), line('hr', 'ask:make_chart', 'hidden'))
    const access = accessFor('hr')
    const names = toolDefinitionsFor(access, { views: VIEWS, actions: true }).map((t) => t.name)
    expect(names).not.toContain('query_records')
    expect(names).not.toContain('make_chart')
    expect(names).toContain('view_summary')
    const ctx = sampleCtx({ access: { mode: 'hr' } })
    const r = call(new Conversation(), envOf(ctx), 'query_records', {
      dataset: 'employees',
      measures: ['count'],
    })
    expect(r.content).toMatch(/not available|not shown/i)
  })

  it('goes with Ask itself', () => {
    inForce(line('compensation', 'ask', 'hidden'))
    expect(decide('compensation', 'ask:view_summary').access).toBe('hidden')
    expect(toolDefinitionsFor(accessFor('compensation')).length).toBe(0)
  })
})

describe('an export hidden by an override', () => {
  it('is hidden for the mode, where the menus and the records panel ask', () => {
    inForce(
      line('talent-management', 'export:view', 'hidden'),
      line('talent-management', 'export:figure', 'hidden'),
      line('talent-management', 'export:records', 'hidden'),
      line('chro', 'export:monthly-report', 'hidden'),
    )
    const access = accessFor('talent-management')
    for (const k of ['view', 'figure', 'records'] as const) expect(access.can(S.export(k))).toBe(false)
    expect(accessFor('chro').can(S.export('monthly-report'))).toBe(false)
    expect(accessFor('hr').can(S.export('monthly-report'))).toBe(true)
  })
})

describe('a help article or tour hidden by an override', () => {
  it('is left out of Help, its search and its tours', () => {
    const article = ARTICLES.find((a) => a.id === 'exporting')!
    inForce(
      line('recruiter', 'help:article:exporting', 'hidden'),
      line('recruiter', 'help:tour:view-recruiting', 'hidden'),
    )
    const access = accessFor('recruiter')
    expect(articleShown(access, article.id)).toBe(false)
    expect(articlesInMode(access, ARTICLES).map((a) => a.id)).not.toContain('exporting')
    const tour = TOURS.find((t) => t.id === 'view-recruiting')
    if (tour) expect(tourInMode(access, tour)).toBeNull()
  })
})

describe('the overrides behind it', () => {
  it('are what the loader put in force', () => {
    const lines = [line('finance', 'view:onboarding', 'hidden')]
    inForce(...lines)
    expect(decide('finance', 'view:onboarding')).toEqual(
      overridesOf(lines).get('finance')?.get('view:onboarding'),
    )
  })
})
