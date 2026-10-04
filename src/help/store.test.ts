import { afterEach, describe, expect, it } from 'vitest'
import { closeHelp, openHelp, useHelp } from './store'

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
