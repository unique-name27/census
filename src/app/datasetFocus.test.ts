import { beforeEach, describe, expect, it, vi } from 'vitest'

const goTo = vi.fn()
vi.mock('@/components/navigation', () => ({ goTo: (...args: unknown[]) => goTo(...args) }))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))

const { clearDatasetFocus, openDatasetQuality, useDatasetFocus } = await import('./datasetFocus')
const { useDrillStore } = await import('@/drill/store')
const { useCensus } = await import('@/data/store')

describe('openDatasetQuality', () => {
  beforeEach(() => goTo.mockClear())

  it('selects the dataset, opens Quality and goes to the Data room', () => {
    openDatasetQuality('candidates')
    expect(useDatasetFocus.getState()).toMatchObject({ key: 'candidates', panel: 'quality' })
    expect(goTo).toHaveBeenCalledWith('data')
  })

  it('changes the nonce on every request, even for the same dataset', () => {
    const before = useDatasetFocus.getState().nonce
    openDatasetQuality('candidates')
    openDatasetQuality('candidates', 'mapping')
    expect(useDatasetFocus.getState().nonce).toBe(before + 2)
    expect(useDatasetFocus.getState().panel).toBe('mapping')
  })

  it('closes the drill panel and Settings first', () => {
    useDrillStore.getState().openPerson('E001')
    useCensus.getState().openSettings('data')
    openDatasetQuality('employees')
    expect(useDrillStore.getState().stack).toEqual([])
    expect(useCensus.getState().settingsOpen.open).toBe(false)
  })

  it('clears the request once the Data room has acted on it', () => {
    openDatasetQuality('reviews')
    clearDatasetFocus()
    expect(useDatasetFocus.getState().key).toBeNull()
  })
})
