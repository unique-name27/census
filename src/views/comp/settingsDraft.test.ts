import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './engine/settings'
import { parseDraft, toDraft } from './settingsDraft'

describe('cycle settings draft', () => {
  it('round-trips the settings through percent text', () => {
    const d = toDraft(DEFAULT_SETTINGS)
    expect(d).toEqual({
      budget: '3.5',
      low: '0.90',
      high: '1.10',
      guideline: { 5: '6', 4: '4.5', 3: '3', 2: '1', 1: '0' },
    })
    expect(parseDraft(d)).toEqual({ settings: DEFAULT_SETTINGS })
  })

  it('names the first problem and its field', () => {
    const d = toDraft(DEFAULT_SETTINGS)
    expect(parseDraft({ ...d, budget: '' })).toEqual({
      error: 'Merit budget must be between 0% and 20%.',
      field: 'budget',
    })
    expect(parseDraft({ ...d, low: '1.2' })).toMatchObject({ field: 'low' })
    expect(parseDraft({ ...d, high: '2' })).toMatchObject({ field: 'high' })
    expect(parseDraft({ ...d, guideline: { ...d.guideline, 4: '-1' } })).toMatchObject({ field: 'g4' })
  })

  it('accepts edited values', () => {
    const d = toDraft(DEFAULT_SETTINGS)
    const r = parseDraft({ ...d, budget: '4', low: '0.85', guideline: { ...d.guideline, 5: '7.5' } })
    expect(r).toEqual({
      settings: {
        ...DEFAULT_SETTINGS,
        meritBudget: 0.04,
        bandLow: 0.85,
        guideline: { ...DEFAULT_SETTINGS.guideline, 5: 0.075 },
      },
    })
  })
})
