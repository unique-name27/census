import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, guidelineFor, ratingKey, sameSettings, sanitizeSettings } from './settings'

describe('cycle settings', () => {
  it('uses the spec defaults', () => {
    expect(DEFAULT_SETTINGS.meritBudget).toBe(0.035)
    expect([DEFAULT_SETTINGS.bandLow, DEFAULT_SETTINGS.bandHigh]).toEqual([0.9, 1.1])
    expect(DEFAULT_SETTINGS.guideline).toEqual({ 5: 0.06, 4: 0.045, 3: 0.03, 2: 0.01, 1: 0 })
  })

  it('falls back field by field for junk input', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
    const s = sanitizeSettings({
      meritBudget: 0.04,
      bandLow: 'x',
      bandHigh: 1.2,
      guideline: { 5: 0.08, 4: -1 },
    })
    expect(s.meritBudget).toBe(0.04)
    expect([s.bandLow, s.bandHigh]).toEqual([0.9, 1.1])
    expect(s.guideline[5]).toBe(0.08)
    expect(s.guideline[4]).toBe(0.045)
  })

  it('rejects a band whose low end is not below its high end', () => {
    const s = sanitizeSettings({ bandLow: 1.1, bandHigh: 0.9 })
    expect([s.bandLow, s.bandHigh]).toEqual([0.9, 1.1])
    expect(sanitizeSettings({ bandLow: 0.85, bandHigh: 1.15 })).toMatchObject({
      bandLow: 0.85,
      bandHigh: 1.15,
    })
  })

  it('rejects out-of-range budgets and guidelines', () => {
    expect(sanitizeSettings({ meritBudget: 0.5 }).meritBudget).toBe(0.035)
    expect(sanitizeSettings({ meritBudget: Number.NaN }).meritBudget).toBe(0.035)
    expect(sanitizeSettings({ guideline: { 3: 0.9 } }).guideline[3]).toBe(0.03)
  })

  it('maps only whole ratings 1-5 to a guideline', () => {
    expect(ratingKey(4)).toBe(4)
    expect(ratingKey(3.5)).toBeNull()
    expect(ratingKey(6)).toBeNull()
    expect(ratingKey(null)).toBeNull()
    expect(guidelineFor(DEFAULT_SETTINGS, 5)).toBe(0.06)
    expect(guidelineFor(DEFAULT_SETTINGS, undefined)).toBeNull()
  })

  it('compares settings by value', () => {
    expect(sameSettings(DEFAULT_SETTINGS, sanitizeSettings({}))).toBe(true)
    expect(sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, meritBudget: 0.03 })).toBe(false)
  })
})
