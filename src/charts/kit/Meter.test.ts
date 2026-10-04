import { describe, expect, it } from 'vitest'
import { meterText } from './Meter'

describe('meterText', () => {
  it('reads the value against the target, named "target" by default', () => {
    expect(meterText(0.82, 0.95)).toEqual({ valueText: '82% of a 95% target', tickTitle: 'Target 95%' })
    expect(meterText(0.82, null)).toEqual({ valueText: '82%', tickTitle: null })
  })

  it('uses the target label in the spoken value and the tick title', () => {
    expect(meterText(0.61, 0.7, 'company rate')).toEqual({
      valueText: '61% of a 70% company rate',
      tickTitle: 'Company rate 70%',
    })
    expect(meterText(null, 0.7, 'plan').valueText).toBe('No data, plan 70%')
  })
})
