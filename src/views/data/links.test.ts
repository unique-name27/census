import { describe, expect, it } from 'vitest'
import { DATA_TABS, datasetTab, parseDataTab, tabRoute } from './links'

describe('parseDataTab', () => {
  it('lands on Datasets for no tab or an unknown one', () => {
    expect(parseDataTab('')).toEqual({ tab: 'datasets', dataset: null, panel: null })
    expect(parseDataTab(undefined)).toEqual({ tab: 'datasets', dataset: null, panel: null })
    expect(parseDataTab('datasets')).toEqual({ tab: 'datasets', dataset: null, panel: null })
    expect(parseDataTab('nonsense-raw')).toEqual({ tab: 'datasets', dataset: null, panel: null })
  })

  it('reads the Categories & mapping tab', () => {
    expect(parseDataTab('mapping')).toEqual({ tab: 'mapping', dataset: null, panel: null })
  })

  it('reads a dataset with and without a panel', () => {
    expect(parseDataTab('candidates')).toEqual({ tab: 'datasets', dataset: 'candidates', panel: null })
    expect(parseDataTab('jobChanges-certify')).toEqual({
      tab: 'datasets',
      dataset: 'jobChanges',
      panel: 'certify',
    })
    expect(parseDataTab('comp-elsewhere')).toEqual({ tab: 'datasets', dataset: 'comp', panel: null })
  })

  it('round-trips datasetTab', () => {
    expect(parseDataTab(datasetTab('employees', 'quality'))).toEqual({
      tab: 'datasets',
      dataset: 'employees',
      panel: 'quality',
    })
    expect(datasetTab('cases')).toBe('cases')
  })

  it('maps tabs to routes', () => {
    expect(tabRoute('datasets')).toBe('')
    expect(tabRoute('mapping')).toBe('mapping')
    expect(DATA_TABS.map((t) => t.label)).toEqual(['Datasets', 'Categories & mapping'])
  })
})
