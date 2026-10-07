/**
 * The Ask panel's place and size (docs/ASK-ACTIONS.md, part 1): docked on wide screens, a rail when
 * collapsed, a three-height sheet on phones; widths kept within 360 to 640 and the main area's
 * room; the resize handle's keys; snapping the sheet; and what is remembered.
 */
import { describe, expect, it } from 'vitest'
import {
  dockLayout,
  heightAt,
  maxPanelWidth,
  PANEL_DEFAULT,
  PANEL_MAX,
  PANEL_MIN,
  PANEL_STATE_KEY,
  PANEL_WIDTH_KEY,
  panelWidth,
  peekLine,
  RAIL_WIDTH,
  readPanelState,
  readPanelWidth,
  savePanelState,
  savePanelWidth,
  stepHeight,
  widthAt,
  widthByKey,
} from './dock'

const wide = { width: 1440, height: 900 }
const phone = { width: 375, height: 800 }

function memory(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

describe('dock layout', () => {
  it('docks on wide screens and takes its width from the main area', () => {
    expect(dockLayout('open', wide, { width: 420, tall: false }, 120)).toEqual({
      kind: 'dock',
      width: 420,
      right: 420,
      bottom: 0,
    })
    expect(dockLayout('collapsed', wide, { width: 420, tall: false }, 120)).toEqual({
      kind: 'rail',
      width: RAIL_WIDTH,
      right: RAIL_WIDTH,
      bottom: 0,
    })
    expect(dockLayout('closed', wide, { width: 420, tall: false }, 120)).toEqual({
      kind: 'none',
      right: 0,
      bottom: 0,
    })
  })

  it('is a bottom sheet under 768px: peek when collapsed, half or full when open', () => {
    expect(dockLayout('collapsed', phone, { width: 420, tall: false }, 132)).toEqual({
      kind: 'sheet',
      height: 'peek',
      px: 132,
      right: 0,
      bottom: 132,
    })
    expect(dockLayout('open', phone, { width: 420, tall: false }, 132)).toMatchObject({
      height: 'half',
      px: 400,
      bottom: 400,
    })
    // At full height the page keeps the half sheet's room, so it does not jump under it.
    expect(dockLayout('open', phone, { width: 420, tall: true }, 132)).toMatchObject({
      height: 'full',
      px: 800,
      bottom: 400,
    })
    expect(dockLayout('open', { width: 767, height: 900 }, { width: 420, tall: false }, 1)).toMatchObject({
      kind: 'sheet',
    })
    expect(dockLayout('open', { width: 768, height: 900 }, { width: 420, tall: false }, 1)).toMatchObject({
      kind: 'dock',
    })
  })

  it('keeps the width within 360 to 640, and leaves the main area 400px', () => {
    expect(panelWidth(200, 1440)).toBe(PANEL_MIN)
    expect(panelWidth(900, 1440)).toBe(PANEL_MAX)
    expect(panelWidth(Number.NaN, 1440)).toBe(PANEL_DEFAULT)
    expect(maxPanelWidth(900)).toBe(500)
    expect(panelWidth(640, 900)).toBe(500)
    // The narrowest window that docks: 768 less the main area's 400.
    expect(panelWidth(640, 768)).toBe(368)
    expect(panelWidth(640, 700)).toBe(PANEL_MIN)
  })

  it('follows the pointer when its edge is dragged', () => {
    expect(widthAt(1000, 1440)).toBe(440)
    expect(widthAt(100, 1440)).toBe(PANEL_MAX)
    expect(widthAt(1400, 1440)).toBe(PANEL_MIN)
  })

  it('resizes from the keyboard: Left widens, Right narrows, Home and End go to the ends', () => {
    expect(widthByKey({ key: 'ArrowLeft' }, 420, 1440)).toBe(436)
    expect(widthByKey({ key: 'ArrowRight' }, 420, 1440)).toBe(404)
    expect(widthByKey({ key: 'ArrowLeft', shiftKey: true }, 420, 1440)).toBe(484)
    expect(widthByKey({ key: 'Home' }, 420, 1440)).toBe(PANEL_MIN)
    expect(widthByKey({ key: 'End' }, 420, 1440)).toBe(PANEL_MAX)
    expect(widthByKey({ key: 'End' }, 420, 900)).toBe(500)
    expect(widthByKey({ key: 'Enter' }, 420, 1440)).toBeNull()
  })
})

describe('phone sheet', () => {
  it('snaps to the nearest height, or one step on a flick', () => {
    expect(heightAt(800 - 140, 800, 132)).toBe('peek')
    expect(heightAt(800 - 420, 800, 132)).toBe('half')
    expect(heightAt(40, 800, 132)).toBe('full')
    expect(heightAt(400, 800, 132, 1.2, 'half')).toBe('peek')
    expect(heightAt(400, 800, 132, -1.2, 'half')).toBe('full')
    expect(heightAt(400, 800, 132, -1.2, 'full')).toBe('full')
  })

  it('steps up and down from the buttons', () => {
    expect(stepHeight('peek', 1)).toBe('half')
    expect(stepHeight('half', 1)).toBe('full')
    expect(stepHeight('full', 1)).toBe('full')
    expect(stepHeight('half', -1)).toBe('peek')
    expect(stepHeight('peek', -1)).toBe('peek')
  })

  it('peeks with what Census is doing, or the answer’s first sentence', () => {
    expect(peekLine('Calculating People stats key figures', 'Anything')).toBe(
      'Calculating People stats key figures',
    )
    expect(peekLine(null, '\n\nVoluntary attrition is 18.8% in Bengaluru. It rose.\n\nMore')).toBe(
      'Voluntary attrition is 18.8% in Bengaluru.',
    )
    expect(peekLine(null, '## Headcount by site\n\nText')).toBe('Headcount by site')
    expect(peekLine(null, '   ')).toBeNull()
  })
})

describe('what is remembered', () => {
  it('keeps open or collapsed for the session, and forgets closed', () => {
    const s = memory()
    expect(readPanelState(s)).toBe('closed')
    savePanelState('open', s)
    expect(s.getItem(PANEL_STATE_KEY)).toBe('open')
    expect(readPanelState(s)).toBe('open')
    savePanelState('collapsed', s)
    expect(readPanelState(s)).toBe('collapsed')
    savePanelState('closed', s)
    expect(s.getItem(PANEL_STATE_KEY)).toBeNull()
    s.setItem(PANEL_STATE_KEY, 'wide open')
    expect(readPanelState(s)).toBe('closed')
    expect(readPanelState(null)).toBe('closed')
  })

  it('keeps a dragged width on this device, and the default as nothing', () => {
    const s = memory()
    expect(readPanelWidth(s)).toBe(PANEL_DEFAULT)
    savePanelWidth(512.4, s)
    expect(s.getItem(PANEL_WIDTH_KEY)).toBe('512')
    expect(readPanelWidth(s)).toBe(512)
    savePanelWidth(PANEL_DEFAULT, s)
    expect(s.getItem(PANEL_WIDTH_KEY)).toBeNull()
    s.setItem(PANEL_WIDTH_KEY, '9000')
    expect(readPanelWidth(s)).toBe(PANEL_DEFAULT)
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readPanelWidth(broken)).toBe(PANEL_DEFAULT)
    expect(() => savePanelWidth(500, broken)).not.toThrow()
  })
})

describe('pointing at a figure', () => {
  it('centres a figure that fits the visible part of the page, else shows its top', async () => {
    const { pointScrollTop } = await import('./pointer')
    // 300px tall, 900px from the top of the window, 800px visible: centred.
    expect(pointScrollTop({ top: 900, height: 300 }, 200, 800)).toBe(200 + 900 - 250)
    // Taller than the visible part: its top 16px below the window's top.
    expect(pointScrollTop({ top: 900, height: 900 }, 200, 800)).toBe(200 + 900 - 16)
    // Above the sheet on a phone: only the top half is visible.
    expect(pointScrollTop({ top: 600, height: 200 }, 0, 400)).toBe(600 - 100)
    expect(pointScrollTop({ top: -50, height: 100 }, 0, 800)).toBe(0)
  })
})
