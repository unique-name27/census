import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS } from './state'

describe('chart preferences', () => {
  it('keeps the Open roles overlay off by default', () => {
    expect(DEFAULT_PREFS.showReqs).toBe(false)
    expect(DEFAULT_PREFS.showFlags).toBe(true)
  })
})
