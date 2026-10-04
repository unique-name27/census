import { describe, expect, it } from 'vitest'
import { swatchSvg } from './legend'

describe('legend swatches for image exports', () => {
  it('draws each shape around the center line from the left edge', () => {
    expect(swatchSvg('rect', 10, 20)).toEqual({
      tag: 'rect',
      attrs: { x: 10, y: 15, width: 10, height: 10, rx: 2 },
    })
    expect(swatchSvg(undefined, 10, 20).tag).toBe('rect')
    expect(swatchSvg('line', 10, 20).attrs).toMatchObject({ y: 19, width: 14, height: 2 })
    expect(swatchSvg('dot', 10, 20)).toEqual({ tag: 'circle', attrs: { cx: 14, cy: 20, r: 4 } })
  })

  it('draws a 10px diamond', () => {
    expect(swatchSvg('diamond', 10, 20)).toEqual({ tag: 'path', attrs: { d: 'M15,15L20,20L15,25L10,20Z' } })
  })
})
