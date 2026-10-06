import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { buildSampleState } from '@/data/quality/seed'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { starterSample } from '@/data/sample/raw'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { type DiagnosticState, diagnosticInput, pageLabels } from './diagnosticInput'
import { diagnosticText, safeAddress } from './diagnostics'
import { articleText, linksIn, parseInline, plainText } from './markup'
import { parsePrefs, withCompleted } from './store'
import { moved, placePopover, tourKey } from './tour/place'

describe('inline markup', () => {
  it('splits text into runs and links of every kind', () => {
    const parts = parseInline(
      'See [Data tiers](article:data-tiers) and [People stats](route:hrbp.attrition).',
    )
    expect(parts).toEqual([
      { text: 'See ' },
      { link: { kind: 'article', target: 'data-tiers', label: 'Data tiers' } },
      { text: ' and ' },
      { link: { kind: 'route', target: 'hrbp.attrition', label: 'People stats' } },
      { text: '.' },
    ])
    expect(plainText('A [b](tour:x) c')).toBe('A b c')
  })

  it('leaves unknown kinds as plain text', () => {
    expect(parseInline('[x](mailto:a)')).toEqual([{ text: '[x](mailto:a)' }])
    expect(linksIn('[x](mailto:a) [y](metric:hrbp.flow.hires)')).toEqual([
      { kind: 'metric', target: 'hrbp.flow.hires', label: 'y' },
    ])
  })

  it('article text holds the title, summary and body without link syntax', () => {
    const t = articleText({
      id: 'x',
      group: 'start',
      title: 'Title',
      summary: 'Sum',
      body: [{ p: 'Go to [Data room](route:data).' }, { ul: ['One', 'Two'] }],
    })
    expect(t).toBe('Title\nSum\nGo to Data room.\nOne\nTwo')
  })
})

describe('placePopover', () => {
  const view = { width: 1440, height: 900 }
  const pop = { width: 360, height: 180 }

  it('centers a step without a target', () => {
    expect(placePopover(null, pop, view)).toEqual({ top: 360, left: 540, side: 'center' })
  })

  it('goes on the preferred side when it fits', () => {
    const t = { top: 100, left: 600, width: 200, height: 40 }
    expect(placePopover(t, pop, view, 'bottom')).toEqual({ top: 156, left: 520, side: 'bottom' })
    // No room above: falls to the next side that fits.
    expect(placePopover(t, pop, view, 'top').side).toBe('bottom')
    expect(placePopover(t, pop, view, 'right')).toMatchObject({ side: 'right', left: 816 })
  })

  it('stays inside the screen edges', () => {
    const t = { top: 100, left: 1400, width: 30, height: 30 }
    const p = placePopover(t, pop, view, 'bottom')
    expect(p.left).toBe(1440 - 360 - 16)
  })

  it('docks to the edge away from the target on narrow screens', () => {
    const phone = { width: 375, height: 812 }
    expect(placePopover({ top: 600, left: 10, width: 300, height: 100 }, pop, phone).side).toBe('dock-top')
    expect(placePopover({ top: 50, left: 10, width: 300, height: 100 }, pop, phone)).toEqual({
      top: 812 - 180 - 16,
      left: 16,
      side: 'dock-bottom',
    })
  })

  it('sits in the lower corner when the target fills the screen', () => {
    const p = placePopover({ top: -200, left: 0, width: 1440, height: 2000 }, pop, view, 'bottom')
    expect(p).toEqual({ top: 900 - 180 - 16, left: 1440 - 360 - 16, side: 'corner' })
  })

  it('moved and tourKey', () => {
    expect(moved(null, null)).toBe(false)
    expect(moved({ top: 0, left: 0, width: 1, height: 1 }, { top: 0.2, left: 0, width: 1, height: 1 })).toBe(
      false,
    )
    expect(moved({ top: 0, left: 0, width: 1, height: 1 }, { top: 2, left: 0, width: 1, height: 1 })).toBe(
      true,
    )
    expect(tourKey('ArrowRight')).toBe(1)
    expect(tourKey('ArrowLeft')).toBe(-1)
    expect(tourKey('Escape')).toBe('end')
    expect(tourKey('Enter')).toBeNull()
  })
})

describe('remembered help prefs', () => {
  it('reads what was saved and ignores anything else', () => {
    expect(parsePrefs(null)).toEqual({ welcomeDismissed: false, completed: [] })
    expect(parsePrefs('not json')).toEqual({ welcomeDismissed: false, completed: [] })
    expect(parsePrefs('{"welcomeDismissed":true,"completed":["a","a",3]}')).toEqual({
      welcomeDismissed: true,
      completed: ['a'],
    })
  })

  it('marks a tour finished once', () => {
    const p = { welcomeDismissed: false, completed: ['a'] }
    expect(withCompleted(p, 'a')).toBe(p)
    expect(withCompleted(p, 'b').completed).toEqual(['a', 'b'])
  })
})

describe('report a problem', () => {
  let state: ReturnType<typeof buildSampleState>
  let sources: Record<DatasetKey, SourceMeta>
  const ctxFor = (filters: Filters): AnalyticsContext =>
    buildContext({
      data: state.data,
      sources,
      filters,
      asOfOverride: null,
      showPay: true,
      versions: state.versions,
    })

  beforeAll(() => {
    const base = generateSample()
    state = buildSampleState(base, starterSample(base).seed, SAMPLE_AS_OF)
    sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [
        k,
        { kind: 'sample', rowCount: state.data[k].length, fileName: 'secret-file.xlsx' },
      ]),
    ) as Record<DatasetKey, SourceMeta>
  })

  const settings = (filters: Filters): DiagnosticState => ({
    route: { view: 'hrbp', tab: 'attrition' },
    filters,
    dataStandard: 'bronze',
    asOfOverride: null,
    reference: { mappings: [], audit: [] },
    showPay: true,
    showImmigration: false,
    engagementSurveys: false,
    theme: 'system',
    textSize: 'md',
    motion: 'system',
    storageUnavailable: false,
  })

  it('never carries a name, an employee ID, a file name or a filter value', () => {
    const emps = state.data.employees
    const manager = emps.find((e) => emps.some((x) => x.managerId === e.employeeId))!
    const filters: Filters = {
      ...DEFAULT_FILTERS,
      leaderId: manager.employeeId,
      department: [manager.department],
    }
    const ctx = ctxFor(filters)
    const text = diagnosticText(
      diagnosticInput(ctx, settings(filters), {
        hash: '#hrbp.attrition',
        browser: 'Test browser',
        windowSize: '1440 × 900 px',
        at: '2026-10-04T10:00:00.000Z',
        lensOn: false,
      }),
    )
    expect(text).toContain('Page: People stats, Attrition (#hrbp.attrition)')
    expect(text).toContain('leader set (name left out)')
    expect(text).toContain('department: 1 value')
    expect(text).toContain('Data standard: Everything')
    expect(text).toContain('Employees: sample')
    expect(text).not.toContain(manager.name)
    expect(text).not.toContain(manager.employeeId)
    expect(text).not.toContain(manager.department)
    expect(text).not.toContain('secret-file')
    // No one's name appears anywhere in it.
    for (const e of emps.slice(0, 400)) expect(text.includes(e.name), e.name).toBe(false)
  })

  it('cleans the address and names pages the way the app does', () => {
    expect(safeAddress('#data.metrics/hrbp/attrition/voluntary')).toBe(
      '#data.metrics/hrbp/attrition/voluntary',
    )
    expect(safeAddress('#hrbp.attrition?name=Jane Doe')).toBe('#hrbp.attrition')
    expect(safeAddress('#hrbp.?x')).toBe('#hrbp')
    expect(safeAddress('')).toBe('#')
    // The scope after "?" holds leader employee IDs and values from the data, on every page.
    expect(safeAddress('#actions?leader=E10053&dept=Design+Verification')).toBe('#actions')
    expect(safeAddress('#hrbp?leader=E10053&dept=Design+Verification')).toBe('#hrbp')
    expect(safeAddress('#comp?loc=Bengaluru&not=loc')).toBe('#comp')
    expect(safeAddress('#hrbp?dept=Design.Verification')).toBe('#hrbp')
    expect(safeAddress('#data.metrics/hrbp/attrition/voluntary?loc=Bengaluru')).toBe(
      '#data.metrics/hrbp/attrition/voluntary',
    )
    expect(pageLabels('data', 'quality')).toEqual({ view: 'Data room', tab: 'Data quality' })
    expect(pageLabels('actions', '')).toEqual({ view: 'Action center', tab: null })
    expect(pageLabels('scorecard', '')).toEqual({ view: 'Scorecard', tab: null })
    expect(pageLabels('hrbp', '')).toEqual({ view: 'People stats', tab: 'Overview' })
  })
})
