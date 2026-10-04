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
      theme: 'system',
      textSize: 'lg',
      motion: 'reduce',
      dataStandard: 'gold',
      asOfOverride: null,
      compCycle: { ...DEFAULT_COMP_CYCLE, guideline: { ...DEFAULT_COMP_CYCLE.guideline, 5: 0.08 } },
      tools: { lattice: 'https://example.com/lattice', toolkit: null },
    })
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
    expect(s).toMatchObject({
      theme: 'dark',
      asOfOverride: '2026-06-30',
      tools: { catalog: null },
      compCycle: { meritBudgetPct: 0.03 },
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
      compCycle: { ...DEFAULT_COMP_CYCLE, healthyBand: [0.85, 1.15] as [number, number] },
      tools: { lattice: 'https://intranet.example.com/lattice' },
      asOfOverride: '2026-06-30',
    }
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

    // The comp cycle merges field by field.
    const cycle = parseSettingsFile(file({ compCycle: { meritBudgetPct: 0.05 } }), mine, today)
    expect(cycle.ok && cycle.settings.compCycle).toEqual({ ...mine.compCycle, meritBudgetPct: 0.05 })

    // Reporting dates outside 1 Jan 1990 to today are refused, as in the Settings sheet.
    for (const d of ['2099-12-31', '1989-12-31', '2026-10-04'])
      expect(parseSettingsFile(file({ asOfOverride: d }), mine, today).ok).toBe(false)
    const date = parseSettingsFile(file({ asOfOverride: '2026-10-03' }), mine, today)
    expect(date.ok && date.settings.asOfOverride).toBe('2026-10-03')
    expect(sanitizeSettings({ asOfOverride: '2099-12-31' }, today).asOfOverride).toBeNull()
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
