/**
 * "Preview a role" and "Scan as role" (docs/ROLES-V2.md 5.13): the eight roles with a Home, the
 * picks each is laid out with (the page's, else the remembered ones, never changing the mode), and
 * the layouts a scan makes in each mode: a role scan lays out what that role shows with its own
 * access and pick, and the Developer scan lays out the Home view once per role so every home is
 * judged. Also the default picks on the sample and the State tab's mode section in a scoped mode.
 */
import { describe, expect, it } from 'vitest'
import { BANNED_MODE_WORDS } from '@/access/copy'
import { matrixCounts } from '@/access/matrix'
import { EVERY_RECRUITER, HOME_OF, MODE_LABEL, MODES, type Mode, NO_PICKS } from '@/access/modes'
import { can } from '@/access/policy'
import { sampleCtx } from '@/ask/engine/testkit'
import { useLists } from '@/data/lists/store'
import { VIEWS } from '@/views/registry'
import { accessRows } from './accessInventory'
import {
  canLayOut,
  HOME_ROLES,
  isHomeRole,
  pickLabel,
  pickPrompt,
  picksFor,
  picksOfMode,
  picksOfPick,
  SCAN_MODES,
  withDefaults,
} from './roles'
import { scanLayouts, scanLine } from './scan'
import { stateSections } from './state'
import { defaultPicks } from './useScan'

const features = { engagementSurveys: false }
const ALL_PICKS = {
  managerId: 'E10001',
  unit: 'Silicon Engineering',
  region: 'APAC',
  recruiter: { name: 'Maya Chen', id: null },
}

describe('the roles on the Developer page', () => {
  it('previews the eight roles whose home is the Home view, and scans every mode, Developer first', () => {
    expect([...HOME_ROLES]).toEqual([
      'chro',
      'hrbp-unit',
      'hrbp-region',
      'compensation',
      'talent-management',
      'recruiter',
      'hr-ops',
      'finance',
    ])
    for (const m of HOME_ROLES) expect(HOME_OF[m]).toBe('home')
    expect(isHomeRole('finance')).toBe(true)
    expect(isHomeRole('hr')).toBe(false)
    expect(isHomeRole('')).toBe(false)
    expect(SCAN_MODES[0]).toBe('developer')
    expect([...SCAN_MODES].sort()).toEqual([...MODES].sort())
  })

  it('lays a role out with the page pick, else the remembered one, one kind at a time', () => {
    const remembered = { ...NO_PICKS, unit: 'Go-to-Market', region: 'EMEA' }
    const picks = picksFor(remembered, picksOfPick({ kind: 'region', region: 'APAC' }))
    expect(picks).toEqual({ ...NO_PICKS, unit: 'Go-to-Market', region: 'APAC' })
    expect(picksOfPick({ kind: 'manager', id: 'E1' })).toEqual({ managerId: 'E1' })
    expect(picksOfPick({ kind: 'unit', unit: 'Ops' })).toEqual({ unit: 'Ops' })
    expect(picksOfPick({ kind: 'recruiter', name: 'Maya Chen', id: 'E2' })).toEqual({
      recruiter: { name: 'Maya Chen', id: 'E2' },
    })
    expect(canLayOut('finance', NO_PICKS)).toBe(true)
    expect(canLayOut('hrbp-unit', NO_PICKS)).toBe(false)
    expect(canLayOut('hrbp-unit', picks)).toBe(true)
    expect(canLayOut('recruiter', picks)).toBe(false)
    // Defaults only fill what is missing.
    const filled = withDefaults(picks, { unit: 'X', recruiter: { name: EVERY_RECRUITER, id: null } })
    expect(filled.unit).toBe('Go-to-Market')
    expect(filled.recruiter?.name).toBe(EVERY_RECRUITER)
    expect(picksOfMode('hrbp-region', filled)).toEqual({ region: 'APAC' })
    expect(picksOfMode('finance', filled)).toEqual({})
  })

  it('names the pick the way the mode button does', () => {
    const name = (id: string) => (id === 'E10001' ? 'Priya Raman' : null)
    expect(pickLabel('manager', ALL_PICKS, name)).toBe("Priya Raman's org")
    expect(pickLabel('manager', { managerId: 'E9' }, name)).toBe('E9')
    expect(pickLabel('hrbp-unit', ALL_PICKS)).toBe('Silicon Engineering')
    expect(pickLabel('hrbp-region', ALL_PICKS)).toBe('APAC')
    expect(pickLabel('recruiter', ALL_PICKS)).toBe('Maya Chen')
    expect(pickLabel('recruiter', { recruiter: { name: EVERY_RECRUITER, id: null } })).toBe('every recruiter')
    expect(pickLabel('finance', ALL_PICKS)).toBeNull()
    expect(pickLabel('hrbp-unit', NO_PICKS)).toBeNull()
  })

  it('asks for a missing pick in plain words', () => {
    for (const m of HOME_ROLES) {
      const text = pickPrompt(m)
      if (!['hrbp-unit', 'hrbp-region', 'recruiter'].includes(m)) {
        expect(text, m).toBe('')
        continue
      }
      expect(text, m).toMatch(/^Pick a .+ to preview the .+ home\./)
      expect(text.includes('—'), m).toBe(false)
      for (const w of BANNED_MODE_WORDS) expect(text.toLowerCase().includes(w), `${m}: ${w}`).toBe(false)
    }
  })
})

describe('the layouts of a scan', () => {
  const layoutsOf = (mode: Mode, picks: Partial<typeof ALL_PICKS> = ALL_PICKS, previewLeaderId = 'E10001') =>
    scanLayouts({ views: VIEWS, mode, picks, features, previewLeaderId })

  it('lays out, in every mode, only views and tabs that mode shows, in the access it is laid out with', () => {
    for (const mode of SCAN_MODES) {
      const layouts = layoutsOf(mode)
      expect(layouts.length, mode).toBeGreaterThan(0)
      for (const l of layouts) {
        const m = l.access.mode
        const key: string = l.view.key
        if (key === 'actions') {
          expect(can(m, 'page:actions'), m).toBe(true)
          continue
        }
        expect(can(m, `view:${key}`), `${mode} ${m} ${key}`).toBe(true)
        for (const t of l.view.tabs) expect(can(m, `tab:${key}.${t.key}`), `${m} ${t.key}`).toBe(true)
      }
      // The Action center comes last where the mode shows it.
      if (can(mode, 'page:actions')) expect(String(layouts.at(-1)?.view.key)).toBe('actions')
    }
  })

  it('Developer: the Home view once per role, each in its own mode with the picks, and My team for a leader', () => {
    const layouts = layoutsOf('developer')
    const homes = layouts.filter((l) => l.view.key === 'home')
    expect(homes.map((l) => l.as)).toEqual([...HOME_ROLES])
    for (const l of homes) {
      expect(l.access.mode).toBe(l.as)
      expect(l.access.picks).toEqual(ALL_PICKS)
    }
    const team = layouts.find((l) => l.view.key === 'team')
    expect(team?.access).toEqual({ mode: 'manager', picks: { ...ALL_PICKS, managerId: 'E10001' } })
    for (const l of layouts.filter((x) => x.view.key !== 'home' && x.view.key !== 'team'))
      expect(l.access.mode).toBe('developer')
    // A role without its pick is left out rather than laid out empty.
    const noUnit = layoutsOf('developer', { ...ALL_PICKS, unit: null as unknown as string })
    expect(noUnit.filter((l) => l.view.key === 'home').map((l) => l.as)).not.toContain('hrbp-unit')
  })

  it('a role: its own Home once, in its mode, and nothing it hides', () => {
    const fin = layoutsOf('finance')
    const homes = fin.filter((l) => l.view.key === 'home')
    expect(homes).toHaveLength(1)
    expect(homes[0].as).toBeUndefined()
    expect(homes[0].access).toEqual({ mode: 'finance', picks: ALL_PICKS })
    expect(fin.some((l) => l.view.key === 'team')).toBe(false)
    expect(fin.every((l) => l.access.mode === 'finance')).toBe(true)
    const comp = fin.find((l) => l.view.key === 'comp')
    expect(comp?.view.tabs.map((t) => t.key)).toEqual(['cost'])
    // HR keeps the Scorecard; Home and My team are other modes' homes.
    const hr = layoutsOf('hr')
    expect(hr.some((l) => l.view.key === 'scorecard')).toBe(true)
    expect(hr.some((l) => l.view.key === 'home' || l.view.key === 'team')).toBe(false)
    // Manager: My team in Manager mode with the manager picked.
    const mgr = layoutsOf('manager')
    expect(mgr.find((l) => l.view.key === 'team')?.access).toEqual({ mode: 'manager', picks: ALL_PICKS })
    // A scoped role carries its pick.
    const rgn = layoutsOf('hrbp-region')
    expect(rgn.every((l) => l.access.mode === 'hrbp-region' && l.access.picks?.region === 'APAC')).toBe(true)
  })

  it('says which mode and pick a scan was for', () => {
    expect(scanLine(null)).toBe('Not scanned yet.')
    const line = scanLine({
      mode: 'hrbp-region',
      picks: { region: 'APAC' },
      scope: 'APAC',
      at: '2026-10-01T10:00:00Z',
      ms: 2500,
      views: [{ key: 'home', label: 'Home', tabs: [] }],
      figures: [],
    })
    expect(line).toMatch(
      /^Scanned 1 views in HRBP for a region mode for APAC at \d\d:\d\d: 0 figures, 2\.5 s\.$/,
    )
    expect(line).toContain(MODE_LABEL['hrbp-region'])
  })
})

describe('default picks for the Developer scan', () => {
  it('takes the largest business unit and region on the sample, and every recruiter', () => {
    const ctx = sampleCtx()
    const d = defaultPicks(ctx, useLists.getState().state)
    expect(d.unit).toBeTruthy()
    expect(['Americas', 'APAC', 'EMEA']).toContain(d.region)
    expect(d.recruiter).toEqual({ name: EVERY_RECRUITER, id: null })
    const units = new Map<string, number>()
    for (const e of ctx.all.employees)
      if (e.businessUnit && !e.terminationDate)
        units.set(e.businessUnit, (units.get(e.businessUnit) ?? 0) + 1)
    expect(units.has(d.unit ?? '')).toBe(true)
    // With them, every role's home is laid out in a Developer scan.
    const layouts = scanLayouts({
      views: VIEWS,
      mode: 'developer',
      picks: withDefaults(NO_PICKS, d),
      features,
    })
    expect(layouts.filter((l) => l.view.key === 'home').map((l) => l.as)).toEqual([...HOME_ROLES])
  })
})

describe('the State tab in a scoped mode', () => {
  it('names the scope, its size, the pay view and the picks remembered', () => {
    const ctx = sampleCtx({ access: { mode: 'hrbp-region', picks: { region: 'APAC' } } })
    const sections = stateSections({
      ctx,
      route: { view: 'home', tab: '' },
      hash: '#home',
      addressScope: { present: false },
      asOfOverride: null,
      savedStandard: 'bronze',
      lens: false,
      versions: {},
      counts: matrixCounts(accessRows(VIEWS)),
      picks: { ...NO_PICKS, region: 'APAC', recruiter: { name: EVERY_RECRUITER, id: null } },
      savedViews: { count: 0, applied: null, startup: null },
      panels: {
        drillDepth: 0,
        drillTop: null,
        helpOpen: false,
        tour: null,
        askOpen: false,
        askTurns: 0,
        askKey: 'not set',
        model: 'claude-opus-5-5',
        workspaceSet: false,
      },
      storage: { unavailable: false, rows: null },
    })
    const mode = sections.find((s) => s.id === 'mode')
    const value = (label: string) => mode?.rows.find((r) => r.label === label)?.value
    expect(value('Mode')).toBe('HRBP for a region')
    expect(value('Scope held')).toBe('A region: APAC')
    expect(Number(value('People in the scope')?.replace(/,/g, ''))).toBeGreaterThan(0)
    expect(value('Pay')).toBe('Ratios only')
    expect(value('Picks remembered')).toBe('Region: APAC; Recruiter: every recruiter')
    expect(value('Surfaces in this mode')).toMatch(/shown, .* limited, .* hidden$/)
  })
})
