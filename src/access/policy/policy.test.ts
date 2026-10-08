/**
 * The policy engine (docs/ROLES-V2.md 8.3): CHRO is HR plus its home; HR leaves the role homes out;
 * the role tables show their Home and the frame to change mode, and route a hidden page home; pay
 * surfaces follow each mode's pay view; overrides lay decisions over the defaults without ever
 * showing a Developer-only surface elsewhere. The full matrix is src/access/matrix.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { accessFor } from '../context'
import { isOtherHomeFigure, MODES, type Mode, PAY_OF } from '../modes'
import { payDecisions } from '../pay'
import {
  decide,
  hidden,
  isTableMode,
  policyVersion,
  ROLE_POLICY,
  routeDecision,
  routeShown,
  SHOWN,
  setPolicyOverrides,
} from '.'

afterEach(() => setPolicyOverrides(null))

const access = (mode: Mode, s: string, at?: { view: string; tab?: string }) => decide(mode, s, at).access

describe('HR and CHRO', () => {
  const HOME = [
    'view:home',
    'tab:home.overview',
    'figure:home-chro-standing',
    'figure:home-attention',
    'figure:home-list',
  ]

  it('hides the role homes in HR and shows the executive home in CHRO', () => {
    for (const s of HOME) {
      expect(access('hr', s), s).toBe('hidden')
      expect(access('chro', s), s).toBe('shown')
    }
    expect(access('hr', 'figure:x', { view: 'home', tab: 'overview' })).toBe('hidden')
    expect(access('chro', 'help:article:view-home')).toBe('shown')
    expect(access('chro', 'help:tour:home-start')).toBe('shown')
    expect(access('hr', 'help:tour:home-start')).toBe('hidden')
  })

  it("keeps other roles' home figures out of CHRO mode", () => {
    for (const id of ['home-fin-cost-unit', 'home-hrbp-kpis', 'home-rec-starts'])
      expect(access('chro', `figure:${id}`), id).toBe('hidden')
    expect(isOtherHomeFigure('finance', 'home-fin-cost-unit')).toBe(false)
    expect(isOtherHomeFigure('finance', 'home-chro-kpis')).toBe(true)
    expect(isOtherHomeFigure('hrbp-region', 'home-hrbp-kpis')).toBe(false)
    expect(isOtherHomeFigure('manager', 'home-attention')).toBe(false)
    expect(isOtherHomeFigure('hr', 'recruiting-funnel')).toBe(false)
  })

  it('equals HR everywhere else, Developer-only surfaces and My team included', () => {
    for (const s of [
      'view:recruiting',
      'tab:comp.ranges',
      'page:data',
      'masthead:data',
      'settings:lists',
      'ask:explain_quality',
      'page:dev',
      'view:team',
      'overlay:figures',
      'pay:amounts',
      'person:ratings',
      'page:actions',
    ])
      expect(decide('chro', s).access, s).toBe(decide('hr', s).access)
    expect(routeDecision('chro', { view: 'team', tab: '' }).route).toEqual({ view: 'home', tab: '' })
  })
})

describe('the role tables', () => {
  // Each table in full is src/access/matrix.test.ts (the contract's grid and the snapshots).
  const roles = MODES.filter((m) => isTableMode(m) && m !== 'manager')

  it('show their Home, the Mode button and Settings > Mode, and hide My team, the Developer page and every other home', () => {
    expect(roles).toHaveLength(7)
    for (const mode of roles) {
      expect(access(mode, 'view:home'), mode).toBe('shown')
      expect(access(mode, 'tab:home.overview'), mode).toBe('shown')
      expect(access(mode, 'masthead:mode'), mode).not.toBe('hidden')
      expect(access(mode, 'settings:mode'), mode).not.toBe('hidden')
      for (const s of ['page:dev', 'view:team', 'figure:home-chro-standing'])
        expect(access(mode, s), `${mode} ${s}`).toBe('hidden')
      expect(routeShown(mode, 'home'), mode).toBe(true)
    }
    // A view a role hides opens its Home; a tab it hides opens the view's first shown tab.
    expect(routeDecision('recruiter', { view: 'hrbp', tab: 'attrition' }).route).toEqual({
      view: 'home',
      tab: '',
    })
    expect(routeDecision('finance', { view: 'comp', tab: 'ranges' }).route).toEqual({
      view: 'comp',
      tab: 'cost',
    })
    expect(routeDecision('compensation', { view: 'hrbp', tab: 'analyses:quality' }).route).toEqual({
      view: 'hrbp',
      tab: 'analyses:declines',
    })
  })
})

describe('pay surfaces follow the pay view', () => {
  it('in every mode', () => {
    for (const mode of MODES) {
      const want =
        mode === 'developer'
          ? { 'pay:switch': SHOWN, 'pay:amounts': SHOWN, 'pay:totals': SHOWN }
          : payDecisions(mode)
      for (const [s, d] of Object.entries(want)) expect(access(mode, s), `${mode} ${s}`).toBe(d.access)
      const amounts = access(mode, 'pay:amounts') !== 'hidden'
      const totals = access(mode, 'pay:totals') !== 'hidden'
      expect(amounts, mode).toBe(PAY_OF[mode] === 'switch')
      expect(totals, mode).toBe(PAY_OF[mode] !== 'none')
    }
  })
})

describe('overrides (the Security center policy file)', () => {
  it('lay exact decisions over the defaults, routes included, and reset to the defaults', () => {
    const before = policyVersion()
    const ctx = accessFor('finance')
    setPolicyOverrides(new Map([['finance', new Map([['view:talent', SHOWN]])]]))
    expect(policyVersion()).toBeGreaterThan(before)
    expect(access('finance', 'view:talent')).toBe('shown')
    expect(routeShown('finance', 'talent')).toBe(true)
    // A context built under other overrides is not reused.
    expect(accessFor('finance')).not.toBe(ctx)
    expect(accessFor('finance').can('view:talent')).toBe(true)
    // Another mode is untouched.
    expect(access('recruiter', 'view:talent')).toBe('hidden')
    setPolicyOverrides(null)
    expect(access('finance', 'view:talent')).toBe('hidden')
  })

  it('can hide anything outside Developer mode, never show a Developer-only surface, and never touch Developer', () => {
    setPolicyOverrides(
      new Map<Mode, Map<string, ReturnType<typeof hidden>>>([
        [
          'hr',
          new Map([
            ['view:comp', hidden('Hidden by the policy file.')],
            ['page:dev', SHOWN],
            ['overlay:figures', SHOWN],
          ]),
        ],
        ['developer', new Map([['view:comp', hidden('No.')]])],
      ]),
    )
    expect(decide('hr', 'view:comp')).toEqual({ access: 'hidden', how: 'Hidden by the policy file.' })
    expect(routeDecision('hr', { view: 'comp', tab: '' }).route).toEqual({ view: 'scorecard', tab: '' })
    expect(access('hr', 'page:dev')).toBe('hidden')
    expect(access('hr', 'overlay:figures')).toBe('hidden')
    expect(access('developer', 'view:comp')).toBe('shown')
  })

  it('leaves every table as plain data', () => {
    for (const t of Object.values(ROLE_POLICY)) expect(JSON.parse(JSON.stringify(t))).toEqual(t)
  })
})
