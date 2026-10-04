/**
 * The scorecard loads on its own, before the registry: it reads the other views one by one, so
 * there is no import cycle back through '@/views/registry' (which imports the scorecard). This
 * file imports nothing that loads the registry first.
 */
import { describe, expect, it } from 'vitest'
import { view } from '@/views/scorecard'

describe('loading the scorecard first', () => {
  it('works without the registry', () => {
    expect(view.key).toBe('scorecard')
    expect(view.label).toBe('Scorecard')
  })
})
