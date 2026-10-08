import { describe, expect, it } from 'vitest'
import { analysesTab, analysisSurface, defaultAnalysis, parseAnalysesTab } from './tab'

describe('the Special analyses address', () => {
  it('reads the tab and the analysis after the colon', () => {
    expect(parseAnalysesTab('analyses')).toEqual({ onTab: true, key: null })
    expect(parseAnalysesTab('analyses:quality')).toEqual({ onTab: true, key: 'quality' })
    expect(parseAnalysesTab('analyses:declines')).toEqual({ onTab: true, key: 'declines' })
    expect(parseAnalysesTab('analyses:stages')).toEqual({ onTab: true, key: 'stages' })
    expect(parseAnalysesTab(' analyses:pyramid ')).toEqual({ onTab: true, key: 'pyramid' })
  })

  it('reads an unknown analysis as the bare address, and other tabs as not this one', () => {
    expect(parseAnalysesTab('analyses:nope')).toEqual({ onTab: true, key: null })
    expect(parseAnalysesTab('analyses:')).toEqual({ onTab: true, key: null })
    expect(parseAnalysesTab('org')).toEqual({ onTab: false, key: null })
    expect(parseAnalysesTab('')).toEqual({ onTab: false, key: null })
    expect(parseAnalysesTab(null)).toEqual({ onTab: false, key: null })
    expect(parseAnalysesTab('analysesx:quality')).toEqual({ onTab: false, key: null })
  })

  it('writes the route tab and the access surface', () => {
    expect(analysesTab('stages')).toBe('analyses:stages')
    expect(analysesTab(null)).toBe('analyses')
    expect(analysisSurface('quality')).toBe('tab:hrbp.analyses:quality')
  })

  it('opens the first shown analysis that is ready, else the first shown', () => {
    expect(defaultAnalysis(['quality', 'declines', 'stages', 'pyramid'], () => true)).toBe('quality')
    expect(defaultAnalysis(['quality', 'declines', 'stages'], (k) => k === 'stages')).toBe('stages')
    expect(defaultAnalysis(['stages', 'pyramid'], () => false)).toBe('stages')
    expect(defaultAnalysis([], () => true)).toBe(null)
  })
})
