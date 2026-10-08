/**
 * Offer declines in each mode (docs/ANALYSES.md, 1.7 and 3.8): shown in HR and Developer mode;
 * hidden in Manager mode, the analysis, every figure, tile and finding with it (the
 * `hrbp.declines.` prefix, the reasons metric Recruiting already hides, and the candidate survey
 * figure on Manager mode's figure list).
 */
import { describe, expect, it } from 'vitest'
import { decide } from '@/access/policy'
import { analysisSurface } from '../../tab'
import { DECLINES_FIGURES } from './ids'
import { DM } from './metrics'

const at = { view: 'hrbp', tab: 'analyses:declines' } as const

describe('Offer declines by mode', () => {
  it('is shown in HR and Developer mode, figures and metrics alike', () => {
    for (const mode of ['hr', 'developer'] as const) {
      expect(decide(mode, analysisSurface('declines')).access, mode).toBe('shown')
      for (const id of Object.values(DECLINES_FIGURES))
        expect(decide(mode, `figure:${id}`, at).access, `${mode} ${id}`).toBe('shown')
      for (const id of Object.values(DM))
        expect(decide(mode, `metric:${id}`).access, `${mode} ${id}`).toBe('shown')
    }
  })

  it('is hidden in Manager mode, with every number it shows', () => {
    expect(decide('manager', analysisSurface('declines')).access).toBe('hidden')
    for (const id of Object.values(DECLINES_FIGURES))
      expect(decide('manager', `figure:${id}`, at).access, id).toBe('hidden')
    for (const id of [
      DM.rate,
      DM.count,
      DM.expected,
      DM.timing,
      DM.competing,
      DM.rangePosition,
      DM.findings,
      DM.reasons,
    ])
      expect(decide('manager', `metric:${id}`).access, id).toBe('hidden')
    expect(decide('manager', `figure:${DECLINES_FIGURES.survey}`).access).toBe('hidden')
  })
})
