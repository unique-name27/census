import { describe, expect, it } from 'vitest'
import { METRIC_VIEW_LABEL } from '@/metrics/registry'
import { parseDataTab } from '../links'
import { arrivalAt, isMetricsTab, METRIC_VIEWS, metricsTab, parseMetricsTab } from './links'

describe('metricsTab', () => {
  it('addresses the dictionary, a view filter, a metric, or both', () => {
    expect(metricsTab()).toBe('metrics')
    expect(metricsTab({ view: 'comp' })).toBe('metrics:comp')
    expect(metricsTab({ metric: 'comp.merit.spend' })).toBe('metrics/comp/merit/spend')
    expect(metricsTab({ view: 'hrbp', metric: 'hrbp.attrition.first-year' })).toBe(
      'metrics:hrbp/hrbp/attrition/first-year',
    )
  })

  it('never puts a dot in the address (the hash splits on dots)', () => {
    expect(metricsTab({ view: 'data', metric: 'quality.rules.fill' })).not.toContain('.')
  })

  it('leaves out an id that is not shaped like a metric id', () => {
    expect(metricsTab({ metric: 'not an id' })).toBe('metrics')
    expect(metricsTab({ metric: '' })).toBe('metrics')
  })
})

describe('parseMetricsTab', () => {
  it('round-trips every address', () => {
    for (const r of [
      { view: null, metric: null },
      { view: 'comp', metric: null },
      { view: null, metric: 'comp.merit.spend' },
      { view: 'talent', metric: 'privacy.anonymity' },
    ] as const)
      expect(parseMetricsTab(metricsTab(r))).toEqual(r)
  })

  it('round-trips a filter to every view the View select offers', () => {
    expect([...METRIC_VIEWS].sort()).toEqual(Object.keys(METRIC_VIEW_LABEL).sort())
    for (const view of METRIC_VIEWS) {
      expect(parseMetricsTab(metricsTab({ view }))).toEqual({ view, metric: null })
      expect(parseMetricsTab(metricsTab({ view, metric: 'privacy.anonymity' }))).toEqual({
        view,
        metric: 'privacy.anonymity',
      })
    }
    for (const view of ['scorecard', 'onboarding', 'compliance', 'listening', 'actions'] as const)
      expect(parseMetricsTab(`metrics:${view}`).view).toBe(view)
  })

  it('ignores what it does not recognize', () => {
    expect(parseMetricsTab('')).toEqual({ view: null, metric: null })
    expect(parseMetricsTab('mapping')).toEqual({ view: null, metric: null })
    expect(parseMetricsTab('metrics:nowhere')).toEqual({ view: null, metric: null })
    expect(parseMetricsTab('metrics:comp/')).toEqual({ view: 'comp', metric: null })
    expect(parseMetricsTab('metrics/single')).toEqual({ view: null, metric: null })
    expect(parseMetricsTab('metrics/bad id/x')).toEqual({ view: null, metric: null })
  })

  it('reads ids typed with percent escapes', () => {
    expect(parseMetricsTab('metrics/comp/merit%2Dfoo/spend').metric).toBe('comp.merit-foo.spend')
  })

  it('is recognized by the Data room as its tab', () => {
    expect(isMetricsTab('metrics/comp/merit/spend')).toBe(true)
    expect(isMetricsTab('metricsfoo')).toBe(false)
    expect(parseDataTab(metricsTab({ view: 'comp', metric: 'comp.merit.spend' })).tab).toBe('metrics')
  })
})

describe('arrivalAt', () => {
  const id = 'hrbp.attrition.voluntary'

  it('brings the detail up and focuses it on one column, however the metric was reached', () => {
    expect(arrivalAt(id, { narrow: true, fromList: false })).toEqual({ scroll: true })
    expect(arrivalAt(id, { narrow: true, fromList: true })).toEqual({ scroll: true })
  })

  it('side by side, focuses a metric reached by a link but keeps focus in the list for a row', () => {
    expect(arrivalAt(id, { narrow: false, fromList: false })).toEqual({ scroll: false })
    expect(arrivalAt(id, { narrow: false, fromList: true })).toBeNull()
  })

  it('does nothing when no metric opens', () => {
    expect(arrivalAt(null, { narrow: true, fromList: false })).toBeNull()
  })
})
