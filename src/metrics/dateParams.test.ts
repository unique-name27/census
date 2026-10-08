/**
 * Date settings (type 'date', the comp cycle's dates): 'YYYY-MM-DD' or '' for not set, read from
 * a form, a cell or a settings file, and worded for Settings and Metric definitions.
 */
import { describe, expect, it } from 'vitest'
import { defaultMetrics } from './api'
import { CATALOG } from './catalog'
import { COMP_CYCLE, COMP_CYCLE_ROWS, CYCLE_DATE_PARAMS, cycleDatesOf } from './compCycle'
import { allowedText, formatParam, NOT_SET, parseParamInput, validateParam } from './params'
import { metricsWith } from './testing'
import type { ParamDef } from './types'

const def: ParamDef = { key: 'closeDate', label: 'Cycle closes', description: 'x', type: 'date', default: '' }

describe('date settings', () => {
  it('take a calendar date or blank, and nothing else', () => {
    expect(validateParam(def, '')).toEqual({ ok: true, value: '' })
    expect(validateParam(def, '2026-10-30')).toEqual({ ok: true, value: '2026-10-30' })
    for (const bad of ['2026-02-30', '30 Oct', 42, null, true])
      expect(validateParam(def, bad).ok, String(bad)).toBe(false)
  })

  it('read typed and pasted dates, Excel cells and "Not set"', () => {
    const read = (raw: unknown) => parseParamInput(def, raw)
    expect(read('2026-10-30')).toEqual({ ok: true, value: '2026-10-30' })
    expect(read('30 Oct 2026')).toEqual({ ok: true, value: '2026-10-30' })
    expect(read('Oct 30, 2026')).toEqual({ ok: true, value: '2026-10-30' })
    expect(read(new Date(Date.UTC(2026, 9, 30)))).toEqual({ ok: true, value: '2026-10-30' })
    expect(read(46325)).toEqual({ ok: true, value: '2026-10-30' })
    for (const blank of ['', '  ', NOT_SET, 'not set', '—', null, undefined])
      expect(read(blank)).toEqual({ ok: true, value: '' })
    const bad = read('next Friday')
    expect(bad.ok).toBe(false)
    if (!bad.ok)
      expect(bad.error).toBe(
        'Cycle closes: "next Friday" is not a date. Write it as 30 Oct 2026, or leave it blank.',
      )
  })

  it('read in words', () => {
    expect(formatParam(def, '')).toBe(NOT_SET)
    expect(formatParam(def, '2026-10-30')).toBe('30 Oct 2026')
    expect(allowedText(def)).toBe('A date, or blank for not set')
  })
})

describe('the comp cycle dates', () => {
  it('are settings of Merit proposals, blank by default, listed in Settings, Compensation cycle', () => {
    const keys = CATALOG.byId.get(COMP_CYCLE.closeDate.metricId)!.params.map((p) => p.key)
    for (const p of CYCLE_DATE_PARAMS) expect(keys).toContain(p.key)
    expect(COMP_CYCLE_ROWS).toContain(COMP_CYCLE.eligibleHiredBy)
    expect(cycleDatesOf(defaultMetrics())).toEqual({
      open: null,
      calibration: null,
      close: null,
      effective: null,
      eligibleHiredBy: null,
    })
  })

  it('are read as set', () => {
    const m = metricsWith({
      [COMP_CYCLE.closeDate.metricId]: { closeDate: '2026-10-30', effectiveDate: '2026-11-01' },
    })
    expect(cycleDatesOf(m)).toMatchObject({ close: '2026-10-30', effective: '2026-11-01', open: null })
    expect(m.changedFields(COMP_CYCLE.closeDate.metricId)).toContain('params.closeDate')
  })
})
