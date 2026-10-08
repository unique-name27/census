import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMode } from '@/access/store'
import { closeHelp, openHelp, parsePrefs, startTour, useHelp, welcomeDismissed } from './store'

describe('help sheet search', () => {
  afterEach(() => {
    closeHelp()
    useHelp.getState().setQuery('')
  })

  it('starts every open from a clean search', () => {
    openHelp()
    useHelp.getState().setQuery('time to fill')
    closeHelp()
    expect(useHelp.getState().open).toBe(false)
    openHelp()
    expect(useHelp.getState().query).toBe('')
  })

  it('opening an article (Learn more, About this view) clears an old search too', () => {
    openHelp()
    useHelp.getState().setQuery('attrition')
    closeHelp()
    openHelp('some-article')
    const s = useHelp.getState()
    expect(s.articleId).toBe('some-article')
    expect(s.query).toBe('')
  })
})

describe('finishing "Getting started with your home"', () => {
  // startTour asks whether focus is on an element; there is no DOM here.
  beforeEach(() => vi.stubGlobal('HTMLElement', class {}))
  afterEach(() => {
    vi.unstubAllGlobals()
    useMode.getState().setMode('hr')
    useHelp.setState({ prefs: parsePrefs(null), tour: null })
  })

  it("ends the welcome line of the mode it was taken in, and leaves the other modes' lines", () => {
    useHelp.setState({ prefs: parsePrefs(null) })
    useMode.getState().setMode('finance')
    startTour('home-start')
    expect(useHelp.getState().tour?.mode).toBe('finance')
    useHelp.getState().endTour('done')
    const p = useHelp.getState().prefs
    expect(p.completed).toContain('home-start')
    expect(welcomeDismissed(p, { home: 'finance' })).toBe(true)
    expect(welcomeDismissed(p, { home: 'compensation' })).toBe(false)
    expect(welcomeDismissed(p, { home: 'chro' })).toBe(false)
  })

  it('leaves every line when the tour is skipped', () => {
    useHelp.setState({ prefs: parsePrefs(null) })
    useMode.getState().setMode('compensation')
    startTour('home-start')
    useHelp.getState().endTour('skip')
    expect(welcomeDismissed(useHelp.getState().prefs, { home: 'compensation' })).toBe(false)
  })
})
