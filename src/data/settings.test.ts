import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COMP_CYCLE,
  DEFAULT_SETTINGS,
  fromCycleSettings,
  LEGACY_KEYS,
  loadSettings,
  parseSettingsFile,
  SETTINGS_KEY,
  sanitizeCompCycle,
  sanitizeSettings,
  saveSettings,
  settingsBlob,
  settingsFileName,
  toCycleSettings,
} from './settings'

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

describe('settings', () => {
  it('match the Compensation view defaults', () => {
    expect(toCycleSettings(DEFAULT_COMP_CYCLE)).toEqual({
      meritBudget: 0.035,
      bandLow: 0.9,
      bandHigh: 1.1,
      guideline: { 5: 0.06, 4: 0.045, 3: 0.03, 2: 0.01, 1: 0 },
    })
    expect(fromCycleSettings(toCycleSettings(DEFAULT_COMP_CYCLE))).toEqual(DEFAULT_COMP_CYCLE)
    expect(DEFAULT_SETTINGS.dataStandard).toBe('bronze')
  })

  it('sanitize every field, falling back to defaults', () => {
    const s = sanitizeSettings({
      theme: 'neon',
      textSize: 'lg',
      motion: 'reduce',
      dataStandard: 'gold',
      asOfOverride: '2026-02-30',
      compCycle: { meritBudgetPct: 0.5, healthyBand: [1.1, 0.9], guideline: { 5: 0.08, 1: -1 } },
      tools: {
        pipeline: 'javascript:alert(1)',
        lattice: 'example.com/lattice',
        toolkit: '',
        'bad id!': 'x.com',
      },
    })
    expect(s).toEqual({
      engagementSurveys: false,
      theme: 'system',
      textSize: 'lg',
      motion: 'reduce',
      dataStandard: 'gold',
      asOfOverride: null,
      tools: { lattice: 'https://example.com/lattice', toolkit: null },
    })
    // The comp cycle moved to the metric dictionary; Settings no longer carries it.
    expect(s).not.toHaveProperty('compCycle')
  })

  it('accept the comp engine shape too', () => {
    expect(sanitizeCompCycle({ meritBudget: 0.04, bandLow: 0.85, bandHigh: 1.15 })).toMatchObject({
      meritBudgetPct: 0.04,
      healthyBand: [0.85, 1.15],
    })
  })

  it('migrate the older keys when nothing is saved, and prefer saved settings after', () => {
    const st = new MemoryStorage()
    st.setItem(LEGACY_KEYS.theme, '"dark"')
    st.setItem(LEGACY_KEYS.asOf, '"2026-06-30"')
    st.setItem(LEGACY_KEYS.tools, JSON.stringify({ catalog: null }))
    st.setItem(LEGACY_KEYS.compCycle, JSON.stringify({ meritBudget: 0.03, bandLow: 0.9, bandHigh: 1.1 }))
    const s = loadSettings(st)
    expect(s).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      asOfOverride: '2026-06-30',
      tools: { catalog: null },
    })
    saveSettings({ ...s, theme: 'light' }, st)
    expect(JSON.parse(st.getItem(SETTINGS_KEY)!).theme).toBe('light')
    expect(loadSettings(st).theme).toBe('light')
    // The older keys go once the settings are saved.
    for (const k of Object.values(LEGACY_KEYS)) expect(st.getItem(k)).toBeNull()
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('export to a file and import it back, keeping current values for anything invalid', async () => {
    const mine = { ...DEFAULT_SETTINGS, theme: 'dark' as const, dataStandard: 'silver' as const }
    const text = await settingsBlob(mine, new Date('2026-10-03T00:00:00Z')).text()
    expect(JSON.parse(text)).not.toHaveProperty('metrics')
    const file = JSON.parse(text)
    expect(file).toMatchObject({
      kind: 'census-settings',
      version: 1,
      exportedAt: '2026-10-03T00:00:00.000Z',
    })
    expect(file.settings).not.toHaveProperty('showPay')

    const r = parseSettingsFile(text, DEFAULT_SETTINGS)
    expect(r.ok && r.settings).toEqual(mine)

    const partial = parseSettingsFile(
      { kind: 'census-settings', version: 1, settings: { theme: 'neon', textSize: 'xl' } },
      mine,
    )
    expect(partial).toEqual({ ok: true, settings: { ...mine, textSize: 'xl' }, applied: ['textSize'] })
  })

  it('import field by field, keeping current values for anything invalid or missing', () => {
    const mine = {
      ...DEFAULT_SETTINGS,
      tools: { lattice: 'https://intranet.example.com/lattice' },
      asOfOverride: '2026-06-30',
    }
    const myCycle = { ...DEFAULT_COMP_CYCLE, healthyBand: [0.85, 1.15] as [number, number] }
    const file = (settings: unknown) => ({ kind: 'census-settings', version: 1, settings })
    const today = '2026-10-03'

    // Tool links merge link by link; an unsafe link changes nothing.
    expect(parseSettingsFile(file({ tools: { lattice: 'javascript:alert(1)' } }), mine, today)).toEqual({
      ok: false,
      error: 'The file holds no settings Census can use.',
    })
    const tools = parseSettingsFile(file({ tools: { catalog: 'catalog.example.com/hr' } }), mine, today)
    expect(tools.ok && tools.settings.tools).toEqual({
      lattice: 'https://intranet.example.com/lattice',
      catalog: 'https://catalog.example.com/hr',
    })

    // An older file's comp cycle merges field by field over the cycle in force, and is handed
    // back for the store to apply to the metric dictionary.
    const cycle = parseSettingsFile(file({ compCycle: { meritBudgetPct: 0.05 } }), mine, today, myCycle)
    expect(cycle).toEqual({
      ok: true,
      settings: mine,
      applied: [],
      compCycle: { ...myCycle, meritBudgetPct: 0.05 },
    })
    expect(parseSettingsFile(file({ compCycle: { meritBudgetPct: 9 } }), mine, today).ok).toBe(false)

    // Reporting dates outside 1 Jan 1990 to today are refused, as in the Settings sheet.
    for (const d of ['2099-12-31', '1989-12-31', '2026-10-04'])
      expect(parseSettingsFile(file({ asOfOverride: d }), mine, today).ok).toBe(false)
    const date = parseSettingsFile(file({ asOfOverride: '2026-10-03' }), mine, today)
    expect(date.ok && date.settings.asOfOverride).toBe('2026-10-03')
    expect(sanitizeSettings({ asOfOverride: '2099-12-31' }, today).asOfOverride).toBeNull()
  })

  it('carry the metric dictionary in the file and hand it back on import', async () => {
    const metrics = {
      overrides: { 'comp.merit.spend': { text: {}, params: { meritBudget: 0.04 } } },
      log: [],
    }
    const text = await settingsBlob(DEFAULT_SETTINGS, new Date('2026-10-03T00:00:00Z'), metrics).text()
    expect(JSON.parse(text).metrics).toEqual(metrics)
    const r = parseSettingsFile(text, DEFAULT_SETTINGS)
    expect(r.ok && r.metricsSection).toEqual(metrics)
    // A file with only the dictionary is still a settings file.
    const only = parseSettingsFile(
      { kind: 'census-settings', version: 1, settings: {}, metrics },
      DEFAULT_SETTINGS,
    )
    expect(only.ok && only.metricsSection).toEqual(metrics)
  })

  it('refuse files that are not Census settings', () => {
    expect(parseSettingsFile('{oops', DEFAULT_SETTINGS)).toEqual({
      ok: false,
      error: 'The file is not valid JSON.',
    })
    expect(parseSettingsFile({ settings: {} }, DEFAULT_SETTINGS)).toEqual({
      ok: false,
      error: 'The file is not a Census settings file.',
    })
    expect(
      parseSettingsFile({ kind: 'census-settings', version: 9, settings: {} }, DEFAULT_SETTINGS),
    ).toEqual({
      ok: false,
      error: 'The file comes from a newer version of Census.',
    })
    expect(
      parseSettingsFile(
        { kind: 'census-settings', version: 1, settings: { theme: 'neon' } },
        DEFAULT_SETTINGS,
      ),
    ).toEqual({
      ok: false,
      error: 'The file holds no settings Census can use.',
    })
  })
})

describe('the engagement surveys switch', () => {
  it('is off by default, only true when saved as true, and travels in the settings file', () => {
    expect(DEFAULT_SETTINGS.engagementSurveys).toBe(false)
    expect(sanitizeSettings({ engagementSurveys: 'yes' }).engagementSurveys).toBe(false)
    expect(sanitizeSettings({ engagementSurveys: true }).engagementSurveys).toBe(true)
    const storage = new MemoryStorage()
    saveSettings({ ...DEFAULT_SETTINGS, engagementSurveys: true }, storage)
    expect(loadSettings(storage).engagementSurveys).toBe(true)
    const file = { kind: 'census-settings', version: 1, settings: { engagementSurveys: true } }
    const r = parseSettingsFile(file, DEFAULT_SETTINGS)
    expect(r.ok && r.settings.engagementSurveys).toBe(true)
    expect(r.ok && r.applied).toEqual(['engagementSurveys'])
    const bad = parseSettingsFile(
      { ...file, settings: { engagementSurveys: 1, theme: 'dark' } },
      DEFAULT_SETTINGS,
    )
    expect(bad.ok && bad.settings.engagementSurveys).toBe(false)
  })
})

describe('settingsFileName', () => {
  it('follows the slug style of every other Census export', () => {
    expect(settingsFileName('2026-10-04')).toBe('census-settings-2026-10-04.json')
  })
})
