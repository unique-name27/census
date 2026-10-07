/**
 * Records Ask opens from the panel (panelApp.ts): while an answer is still coming and focus is in
 * the panel, they open once it has finished, so focus is not pulled out of the question box
 * mid-answer; a new chat before then drops them; otherwise they open at once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const inPanel = { now: true }
vi.mock('./panelFocus', async (orig) => ({
  ...(await orig<typeof import('./panelFocus')>()),
  focusInPanel: () => inPanel.now,
}))

const { useDrillStore } = await import('@/drill/store')
const { panelAskApp, resetPanelAppForTests } = await import('./panelApp')
const { useAsk } = await import('./store')

const spec = { kind: 'employees', title: 'Leavers', rows: [] } as const

afterEach(() => {
  resetPanelAppForTests()
  useDrillStore.setState({ stack: [] })
  useAsk.setState({ busy: false })
  inPanel.now = true
})

describe('records Ask opens from the panel', () => {
  it('wait for the answer to finish while focus is in the panel', () => {
    useAsk.setState({ busy: true })
    panelAskApp.openRecords(spec)
    expect(useDrillStore.getState().stack).toEqual([])
    useAsk.setState({ draft: 'next question' })
    expect(useDrillStore.getState().stack).toEqual([])
    useAsk.setState({ busy: false })
    expect(useDrillStore.getState().stack).toEqual([{ type: 'records', spec }])
  })

  it('are dropped by a new chat before the answer finishes', () => {
    useAsk.setState({ busy: true })
    panelAskApp.openRecords(spec)
    useAsk.getState().reset()
    useAsk.setState({ busy: false })
    expect(useDrillStore.getState().stack).toEqual([])
  })

  it('open at once when no answer is coming, or focus is on the page', () => {
    panelAskApp.openRecords(spec)
    expect(useDrillStore.getState().stack).toHaveLength(1)
    useDrillStore.setState({ stack: [] })
    useAsk.setState({ busy: true })
    inPanel.now = false
    panelAskApp.openRecords(spec)
    expect(useDrillStore.getState().stack).toHaveLength(1)
  })
})
