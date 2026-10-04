/**
 * Settings keep only values every screen and export can show exactly: whole numbers for counts
 * and ratings, values on the step otherwise. A value shown in words reads back to itself, so an
 * untouched Excel dictionary or settings box changes nothing.
 */
import { describe, expect, it } from 'vitest'
import { CATALOG } from './catalog'
import {
  formatParam,
  formatParamNumber,
  isWholeParam,
  paramDecimals,
  parseParamInput,
  sameParam,
  validateParam,
} from './params'
import type { ParamDef } from './types'

const count: ParamDef = {
  key: 'minExits',
  label: 'Exits to flag',
  description: 'x',
  type: 'number',
  default: 2,
  min: 1,
  max: 20,
  step: 1,
  format: 'int',
}
const rating: ParamDef = { ...count, key: 'minRating', label: 'High performer rating', default: 4, max: 5 }
const anonymity: ParamDef = {
  ...count,
  key: 'minGroup',
  label: 'Smallest group shown',
  default: 5,
  min: 5,
  max: 50,
  locked: 'raiseOnly',
}
const band: ParamDef = {
  key: 'healthyBand',
  label: 'Healthy compa-ratio band',
  description: 'x',
  type: 'range',
  default: [0.9, 1.1],
  min: 0.5,
  max: 1.5,
  step: 0.01,
  format: 'ratio',
}
const share: ParamDef = {
  key: 'gap',
  label: 'Gap to flag',
  description: 'x',
  type: 'percent',
  default: 0.03,
  min: 0,
  max: 0.5,
  step: 0.005,
  format: 'pts',
}
const guideline: ParamDef = {
  key: 'guideline',
  label: 'Merit guideline by rating',
  description: 'x',
  type: 'ratingMap',
  default: { 5: 0.06, 4: 0.045, 3: 0.03, 2: 0.01, 1: 0 },
  min: 0,
  max: 0.3,
  format: 'pct',
}
const ratio: ParamDef = {
  key: 'x',
  label: 'Ratio',
  description: 'x',
  type: 'number',
  default: 1,
  format: 'ratio',
}

describe('whole-number settings', () => {
  it('refuse fractions instead of keeping a value the screen rounds', () => {
    expect(isWholeParam(rating)).toBe(true)
    expect(validateParam(rating, 4.5)).toEqual({
      ok: false,
      error: 'High performer rating: enter a whole number.',
    })
    expect(validateParam(rating, 5)).toEqual({ ok: true, value: 5 })
    expect(validateParam(anonymity, 5.5)).toEqual({
      ok: false,
      error: 'Smallest group shown: enter a whole number.',
    })
    expect(validateParam(anonymity, 6)).toEqual({ ok: true, value: 6 })
    expect(parseParamInput(count, '2.5').ok).toBe(false)
    expect(
      validateParam(
        { ...guideline, min: 0, max: 10, step: 1, format: 'int' },
        { 5: 1, 4: 1, 3: 1.5, 2: 1, 1: 0 },
      ),
    ).toEqual({
      ok: false,
      error: 'Merit guideline by rating: enter a whole number for rating 3.',
    })
  })

  it('cover every count and rating setting in the catalog', () => {
    for (const d of CATALOG.list)
      for (const p of d.params)
        if (p.format === 'int' || p.type === 'days' || p.type === 'months')
          expect(isWholeParam(p), `${d.id} ${p.key}`).toBe(true)
  })
})

describe('settings with a step', () => {
  it('round to the step, so the value in force is the one shown', () => {
    expect(paramDecimals(band)).toBe(2)
    const r = validateParam(band, [0.955, 1.045])
    expect(r.ok && r.value).toEqual([0.96, 1.05])
    expect(validateParam(share, 0.0237)).toEqual({ ok: true, value: 0.025 })
    // Rounding can't carry a value past its bounds unnoticed.
    expect(validateParam(share, 0.5024)).toEqual({ ok: true, value: 0.5 })
    expect(validateParam(share, 0.51).ok).toBe(false)
  })

  it('keep two decimals of a percent without a step', () => {
    expect(paramDecimals(guideline)).toBe(4)
    const r = validateParam(guideline, { 5: 0.06, 4: 0.04567, 3: 0.03, 2: 0.01, 1: 0 })
    expect(r.ok && (r.value as Record<number, number>)[4]).toBe(0.0457)
  })
})

describe('wording that reads back exactly', () => {
  it('shows every decimal a setting keeps', () => {
    expect(formatParamNumber(0.955, ratio)).toBe('0.955')
    expect(formatParamNumber(0.9, ratio)).toBe('0.90')
    expect(formatParamNumber(1, ratio)).toBe('1.00')
    expect(formatParam(band, [0.95, 1.05])).toBe('0.95 to 1.05')
    expect(formatParamNumber(0.0225, { type: 'percent' })).toBe('2.25%')
    expect(formatParamNumber(0.03, share)).toBe('3 pts')
    expect(formatParamNumber(365, { type: 'days' })).toBe('365 d')
  })

  it('round-trips every catalog default through its words', () => {
    for (const d of CATALOG.list)
      for (const p of d.params) {
        if (p.type === 'boolean' || p.type === 'choice') continue
        const back = parseParamInput(p, formatParam(p, p.default), { ignoreLock: true })
        expect(back.ok, `${d.id} ${p.key}: ${formatParam(p, p.default)}`).toBe(true)
        if (back.ok) expect(sameParam(back.value, p.default), `${d.id} ${p.key}`).toBe(true)
      }
  })

  it('round-trips a value off the old two-decimal display', () => {
    const r = validateParam(band, [0.95, 1.04])
    if (!r.ok) throw new Error(r.error)
    const back = parseParamInput(band, formatParam(band, r.value))
    expect(back).toEqual({ ok: true, value: [0.95, 1.04] })
  })
})
