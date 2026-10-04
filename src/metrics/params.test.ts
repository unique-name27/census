import { describe, expect, it } from 'vitest'
import {
  allowedText,
  formatParam,
  parseParamInput,
  parseParamNumber,
  sameParam,
  validateParam,
} from './params'
import { FIXTURE } from './test-fixtures'
import type { ParamDef } from './types'

const param = (metricId: string, key: string): ParamDef =>
  FIXTURE.byId.get(metricId)!.params.find((p) => p.key === key)!

const budget = param('comp.merit.spend', 'meritBudget')
const guideline = param('comp.merit.spend', 'guideline')
const band = param('comp.merit.spend', 'healthyBand')
const months = param('comp.merit.spend', 'reviewMonths')
const firstYear = param('hrbp.attrition.voluntary', 'firstYearDays')
const annualize = param('hrbp.attrition.voluntary', 'annualize')
const regretted = param('hrbp.attrition.voluntary', 'regretted')
const minGroup = param('privacy.anonymity', 'minGroup')
const payOptIn = param('privacy.anonymity', 'payOptIn')

describe('validateParam', () => {
  it('checks numbers against min and max, and whole days and months', () => {
    expect(validateParam(budget, 0.04)).toEqual({ ok: true, value: 0.04 })
    expect(validateParam(budget, 0.25)).toEqual({
      ok: false,
      error: 'Merit budget: enter a value from 0% to 20%.',
    })
    expect(validateParam(budget, Number.NaN)).toEqual({ ok: false, error: 'Merit budget: enter a number.' })
    expect(validateParam(budget, '0.04').ok).toBe(false)
    expect(validateParam(firstYear, 180)).toEqual({ ok: true, value: 180 })
    expect(validateParam(firstYear, 180.5)).toEqual({
      ok: false,
      error: 'First-year window: enter a whole number of days.',
    })
    expect(validateParam(firstYear, 10)).toEqual({
      ok: false,
      error: 'First-year window: enter a value from 30 d to 730 d.',
    })
    expect(validateParam(months, 0).ok).toBe(false)
    expect(validateParam(months, 6)).toEqual({ ok: true, value: 6 })
  })

  it('checks booleans and choices', () => {
    expect(validateParam(annualize, false)).toEqual({ ok: true, value: false })
    expect(validateParam(annualize, 'no').ok).toBe(false)
    expect(validateParam(regretted, 'allVoluntary')).toEqual({ ok: true, value: 'allVoluntary' })
    expect(validateParam(regretted, 'everyone')).toEqual({
      ok: false,
      error: 'What counts as regretted: choose voluntary and flagged regrettable or every voluntary exit.',
    })
  })

  it('needs every rating, each within bounds, and copies the map', () => {
    const value = { 5: 0.07, 4: 0.05, 3: 0.03, 2: 0.01, 1: 0 }
    const r = validateParam(guideline, value)
    expect(r).toEqual({ ok: true, value })
    expect(r.ok && r.value).not.toBe(value)
    expect(validateParam(guideline, { 5: 0.07, 4: 0.05 })).toEqual({
      ok: false,
      error: 'Merit guideline by rating: give a value for every rating from 5 to 1.',
    })
    expect(validateParam(guideline, { ...value, 5: 0.4 })).toEqual({
      ok: false,
      error: 'Merit guideline by rating: enter a value for rating 5 from 0% to 30%.',
    })
  })

  it('needs a range with the low end below the high end', () => {
    expect(validateParam(band, [0.85, 1.15])).toEqual({ ok: true, value: [0.85, 1.15] })
    expect(validateParam(band, [1.1, 0.9])).toEqual({
      ok: false,
      error: 'Healthy compa-ratio band: the low end must be below the high end.',
    })
    expect(validateParam(band, [0.4, 1.1]).ok).toBe(false)
    expect(validateParam(band, [0.9]).ok).toBe(false)
  })

  it('lets a raise-only setting go up, never below its default', () => {
    expect(validateParam(minGroup, 8)).toEqual({ ok: true, value: 8 })
    expect(validateParam(minGroup, 5)).toEqual({ ok: true, value: 5 })
    expect(validateParam(minGroup, 4)).toEqual({
      ok: false,
      error: 'Smallest group shown can be raised, never lowered: enter 5 or more.',
    })
    expect(validateParam(minGroup, 60)).toEqual({
      ok: false,
      error: 'Smallest group shown: enter a value from 5 to 50.',
    })
    // The default is the floor even when the minimum allows less.
    expect(validateParam({ ...minGroup, min: 1 }, 3).ok).toBe(false)
    expect(validateParam({ ...minGroup, min: 1 }, 3, { ignoreLock: true }).ok).toBe(true)
  })

  it('refuses any change to a locked setting, but accepts its own value', () => {
    expect(validateParam(payOptIn, true)).toEqual({ ok: true, value: true })
    expect(validateParam(payOptIn, false)).toEqual({
      ok: false,
      error: "Pay amounts are opt-in is locked and can't be changed.",
    })
    expect(validateParam(payOptIn, false, { ignoreLock: true }).ok).toBe(true)
  })
})

describe('parsing and wording', () => {
  it('reads numbers with units and shares typed as percents', () => {
    expect(parseParamNumber('4.5%', budget)).toBe(0.045)
    expect(parseParamNumber('4.5', budget)).toBe(0.045)
    expect(parseParamNumber(0.045, budget)).toBe(0.045)
    expect(parseParamNumber('0.045', budget)).toBe(0.045)
    expect(parseParamNumber('365 d', firstYear)).toBe(365)
    expect(parseParamNumber('1,095 days', firstYear)).toBe(1095)
    expect(parseParamNumber('12 months', months)).toBe(12)
    expect(parseParamNumber('twelve', months)).toBeNull()
    expect(parseParamNumber('', months)).toBeNull()
  })

  it('parses every type from text and validates the result', () => {
    expect(parseParamInput(annualize, 'Off')).toEqual({ ok: true, value: false })
    expect(parseParamInput(annualize, 'yes')).toEqual({ ok: true, value: true })
    expect(parseParamInput(regretted, 'every voluntary exit')).toEqual({ ok: true, value: 'allVoluntary' })
    expect(parseParamInput(guideline, '5: 7%, 4: 5%, 3: 3%, 2: 1%, 1: 0%')).toEqual({
      ok: true,
      value: { 5: 0.07, 4: 0.05, 3: 0.03, 2: 0.01, 1: 0 },
    })
    expect(parseParamInput(guideline, '5: 7%; 4: 5%')).toEqual({
      ok: false,
      error: 'Merit guideline by rating: give a value for every rating from 5 to 1.',
    })
    expect(parseParamInput(guideline, 'generous').ok).toBe(false)
    expect(parseParamInput(band, '0.85 to 1.15')).toEqual({ ok: true, value: [0.85, 1.15] })
    expect(parseParamInput(band, '0.85-1.15')).toEqual({ ok: true, value: [0.85, 1.15] })
    expect(parseParamInput(band, '0.85 – 1.15')).toEqual({ ok: true, value: [0.85, 1.15] })
    expect(parseParamInput(band, 'wide')).toEqual({
      ok: false,
      error: 'Healthy compa-ratio band: write it as "0.90 to 1.10".',
    })
    expect(parseParamInput(minGroup, '4').ok).toBe(false)
    expect(parseParamInput(budget, 'lots')).toEqual({
      ok: false,
      error: 'Merit budget: "lots" is not a number.',
    })
  })

  it('words every value with its unit', () => {
    expect(formatParam(budget, 0.035)).toBe('3.5%')
    expect(formatParam(firstYear, 365)).toBe('365 d')
    expect(formatParam(months, 1)).toBe('1 month')
    expect(formatParam(months, 12)).toBe('12 months')
    expect(formatParam(annualize, true)).toBe('On')
    expect(formatParam(regretted, 'flagged')).toBe('Voluntary and flagged regrettable')
    expect(formatParam(guideline, guideline.default)).toBe('5: 6%, 4: 4.5%, 3: 3%, 2: 1%, 1: 0%')
    expect(formatParam(band, [0.9, 1.1])).toBe('0.90 to 1.10')
    expect(formatParam(minGroup, 5)).toBe('5')
    expect(allowedText(budget)).toBe('0% to 20%')
    expect(allowedText(minGroup)).toBe('5 to 50, raise only')
    expect(allowedText(payOptIn)).toBe('Locked')
    expect(allowedText(regretted)).toBe('Voluntary and flagged regrettable or Every voluntary exit')
    expect(allowedText(band)).toBe('Low end below high end, each 0.50 to 1.50')
  })

  it('compares values deeply, ignoring float noise', () => {
    expect(sameParam(0.1 + 0.2, 0.3)).toBe(true)
    expect(sameParam([0.9, 1.1], [0.9, 1.1])).toBe(true)
    expect(sameParam({ 5: 1, 4: 2 }, { 4: 2, 5: 1 })).toBe(true)
    expect(sameParam({ 5: 1 }, { 5: 2 })).toBe(false)
    expect(sameParam(null, null)).toBe(true)
  })
})
