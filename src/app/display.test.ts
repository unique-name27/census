import { describe, expect, it } from 'vitest'
import { applyMotion, applyTextSize, applyTheme, textZoom } from './useShell'

/** Just enough of an element for the display helpers. */
function fakeRoot() {
  const attrs = new Map<string, string>()
  const props = new Map<string, string>()
  return {
    attrs,
    props,
    style: {
      zoom: '',
      setProperty: (k: string, v: string) => props.set(k, v),
      removeProperty: (k: string) => props.delete(k),
    },
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    removeAttribute: (k: string) => attrs.delete(k),
  }
}
type Root = Parameters<typeof applyTheme>[1]

describe('display settings on the root element', () => {
  it('zooms the app for every text size but Standard', () => {
    expect(textZoom('md')).toBe('')
    expect(Number(textZoom('sm'))).toBeLessThan(1)
    expect(Number(textZoom('lg'))).toBeGreaterThan(1)
    expect(Number(textZoom('xl'))).toBeGreaterThan(Number(textZoom('lg')))
  })

  it('zooms the app root and hands the zoom to floating layers', () => {
    const root = fakeRoot()
    const app = fakeRoot()
    applyTextSize('xl', root as unknown as Root, app as unknown as Root)
    expect(app.style.zoom).toBe(textZoom('xl'))
    expect(root.style.zoom).toBe('')
    expect(root.attrs.get('data-text-size')).toBe('xl')
    expect(root.props.get('--text-zoom')).toBe(textZoom('xl'))
    applyTextSize('md', root as unknown as Root, app as unknown as Root)
    expect(app.style.zoom).toBe('')
    expect(root.attrs.has('data-text-size')).toBe(false)
    expect(root.props.has('--text-zoom')).toBe(false)
  })

  it('pins reduced motion, or follows the system', () => {
    const root = fakeRoot()
    applyMotion('reduce', root as unknown as Root)
    expect(root.attrs.get('data-motion')).toBe('reduce')
    applyMotion('system', root as unknown as Root)
    expect(root.attrs.has('data-motion')).toBe(false)
  })

  it('pins light or dark, and leaves system to the OS', () => {
    const root = fakeRoot()
    applyTheme('dark', root as unknown as Root)
    expect(root.attrs.get('data-theme')).toBe('dark')
    applyTheme('system', root as unknown as Root)
    expect(root.attrs.has('data-theme')).toBe(false)
  })
})
