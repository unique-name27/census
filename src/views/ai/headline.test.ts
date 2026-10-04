import { afterEach, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { SAMPLE_AGENTS } from './catalog'
import { view } from './index'
import { useAiAgents } from './state'

// The AI in HR headline reads no analytics context; the folder tab subscribes to the catalog store.
const ctx = {} as AnalyticsContext
const headline = () => view.headline(ctx)

describe('AI in HR folder-tab headline', () => {
  afterEach(() => {
    useAiAgents.getState().resetToSample()
  })

  it('follows the catalog store: edits, removals and imports change it without a reload', () => {
    const store = useAiAgents.getState
    store().resetToSample()
    expect(headline()).toMatchObject({ value: String(SAMPLE_AGENTS.length), label: 'sample agents' })

    const removed = store().removeAgent('process-finder')
    expect(removed).not.toBeNull()
    expect(headline().value).toBe(String(SAMPLE_AGENTS.length - 1))

    // One agent in pilot: the catalog is no longer the sample.
    const first = store().agents[0]
    store().updateAgent(first.id, { ...first, status: 'Pilot' })
    expect(headline()).toMatchObject({ value: String(SAMPLE_AGENTS.length - 1), label: 'agents' })

    store().replaceAll([...SAMPLE_AGENTS, { ...SAMPLE_AGENTS[0], id: 'extra', name: 'Extra agent' }])
    expect(headline()).toMatchObject({ value: String(SAMPLE_AGENTS.length + 1), label: 'sample agents' })

    store().replaceAll([{ ...SAMPLE_AGENTS[0], status: 'Live' }])
    expect(headline()).toMatchObject({ value: '1', label: 'agent' })
  })
})
