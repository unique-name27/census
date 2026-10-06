import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportIssue, ParsedSheet } from './import/types'

const idb = new Map<string, unknown>()
/** Keys whose delete fails, as when another tab holds the database. */
const stuck = new Set<string>()
vi.mock('idb-keyval', () => ({
  get: async (k: string) => structuredClone(idb.get(k)),
  set: async (k: string, v: unknown) => {
    idb.set(k, structuredClone(v))
  },
  del: async (k: string) => {
    if (stuck.has(k)) throw new Error('blocked')
    idb.delete(k)
  },
  keys: async () => [...idb.keys()],
}))

class MemoryStorage {
  m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}
const storage = new MemoryStorage()
vi.stubGlobal('localStorage', storage)

type Store = typeof import('./store')
async function freshStore(): Promise<Store> {
  vi.resetModules()
  return import('./store')
}

const sheet: ParsedSheet = {
  name: 'Workers',
  headerRow: 0,
  headers: ['Emp ID', 'Full name'],
  rows: [{ 'Emp ID': 'E1', 'Full name': 'A' }],
  rowNumbers: [2],
}
const issues: ImportIssue[] = [
  {
    row: 2,
    id: 'X',
    field: 'level',
    label: 'Level',
    value: 'P9',
    code: 'unknown-value',
    issue: '',
    action: 'left-blank',
  },
]

describe('store', () => {
  let S: Store
  beforeEach(async () => {
    idb.clear()
    storage.m.clear()
    storage.setItem('census:theme', '"dark"')
    S = await freshStore()
    await S.useCensus.getState().init()
  })

  it('starts on the sample with a fixed version per dataset and migrated settings', () => {
    const s = S.useCensus.getState()
    expect(s.ready).toBe(true)
    expect(s.theme).toBe('dark')
    expect(s.dataStandard).toBe('bronze')
    expect(s.versions.employees).toMatchObject({ versionId: 'sample-employees', source: 'sample' })
    expect(s.versions.employees.rowCount).toBe(s.data.employees.length)
    expect(s.history.employees).toEqual([])
    expect(s.reference).toEqual({ mappings: [], audit: [] })
  })

  it('replaces a dataset with the old call shape and keeps the previous version in history', async () => {
    const rows = S.useCensus.getState().data.reviews.slice(0, 5)
    await S.useCensus.getState().replaceDataset('reviews', rows, { fileName: 'reviews.xlsx' })
    const s = S.useCensus.getState()
    expect(s.data.reviews).toBe(rows)
    expect(s.sources.reviews).toMatchObject({ kind: 'upload', rowCount: 5, fileName: 'reviews.xlsx' })
    expect(s.versions.reviews).toMatchObject({
      source: 'upload',
      fileName: 'reviews.xlsx',
      rowCount: 5,
      hasRaw: false,
    })
    expect(s.history.reviews.map((v) => v.versionId)).toEqual(['sample-reviews'])
  })

  it('keeps the raw sheet, mapping and import counts of an upload, and confirms, certifies and revokes', async () => {
    const st = () => S.useCensus.getState()
    const rows = st().data.employees.slice(0, 20)
    await st().replaceDataset(
      'employees',
      rows,
      { fileName: 'workers.xlsx', sheetName: 'Workers' },
      {
        raw: sheet,
        mapping: { employeeId: { header: 'Emp ID', confidence: 'high', score: 1, reason: '' } },
        options: { dateOrders: { Hired: 'DMY' } },
        issues,
        rowsIn: 21,
      },
    )
    const v = st().versions.employees
    expect(v.mapping.employeeId).toEqual({ header: 'Emp ID', confidence: 'high', confirmed: false })
    expect(v.applyOptions).toEqual({ dateOrders: { Hired: 'DMY' } })
    expect(v.issues).toMatchObject({
      rowsIn: 21,
      rowsOut: 20,
      rowsWithErrors: 1,
      invalidByField: { level: 1 },
    })
    expect(idb.has(`census:raw:employees:${v.versionId}`)).toBe(true)
    expect(await st().getRaw('employees')).toEqual({
      dataset: 'employees',
      versionId: v.versionId,
      sheet,
      issues,
    })

    st().confirmMapping('employees', 'Jamie')
    expect(st().versions.employees).toMatchObject({ mappingConfirmedBy: 'Jamie' })
    expect(st().versions.employees.mapping.employeeId.confirmed).toBe(true)

    const cert = st().certify('employees', {
      by: 'HRIS team',
      note: 'Matches the HRIS report',
      controlTotals: [{ label: 'Rows', metric: 'rows', expected: 20, tolerance: 0.005 }],
    })
    expect(cert).toMatchObject({ by: 'HRIS team', versionId: v.versionId, controlTotals: [{ actual: 20 }] })
    expect(st().versions.employees.certification?.note).toBe('Matches the HRIS report')
    await Promise.resolve()
    expect(
      (idb.get('census:versions:employees') as { current: { certification: unknown } }).current.certification,
    ).toBeTruthy()

    st().revokeCertification('employees')
    expect(st().versions.employees.certification).toBeNull()

    // A new version is never certified; the old one moves to history.
    st().certify('employees', { by: 'HRIS team' })
    await st().replaceDataset('employees', rows, { fileName: 'workers2.xlsx' })
    expect(st().versions.employees.certification).toBeNull()
    expect(st().versions.employees.mappingConfirmedAt).toBeNull()
    expect(st().history.employees[0].certification?.by).toBe('HRIS team')
  })

  it('keeps three earlier versions and deletes the raw sheets that fall out', async () => {
    const st = () => S.useCensus.getState()
    const rows = st().data.comp.slice(0, 3)
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      await st().replaceDataset('comp', rows, { fileName: `comp${i}.xlsx` }, { raw: sheet })
      ids.push(st().versions.comp.versionId)
    }
    expect(st().history.comp.map((v) => v.versionId)).toEqual([ids[3], ids[2], ids[1]])
    expect(idb.has(`census:raw:comp:${ids[0]}`)).toBe(false)
    expect(idb.has(`census:raw:comp:${ids[1]}`)).toBe(true)
    expect(await st().getRaw('comp', ids[1])).toMatchObject({ versionId: ids[1] })
  })

  it('restores uploads, versions and reference mappings after a reload', async () => {
    const st = () => S.useCensus.getState()
    const rows = st().data.learning.slice(0, 4)
    await st().replaceDataset('learning', rows, { fileName: 'lms.csv' })
    st().confirmMapping('learning', 'Jamie')
    st().confirmMapping('reviews', 'Sam')
    const r = st().addReferenceMapping(
      { kind: 'move-department', department: 'DFT', from: null, to: 'Operations' },
      'Jamie',
    )
    expect(r.ok).toBe(true)
    await new Promise((res) => setTimeout(res, 0))

    const S2 = await freshStore()
    await S2.useCensus.getState().init()
    const s2 = S2.useCensus.getState()
    expect(s2.data.learning).toHaveLength(4)
    expect(s2.versions.learning).toMatchObject({ mappingConfirmedBy: 'Jamie', fileName: 'lms.csv' })
    expect(s2.versions.reviews).toMatchObject({ source: 'sample', mappingConfirmedBy: 'Sam' })
    expect(s2.reference.mappings).toHaveLength(1)
    expect(s2.reference.audit[0].what).toBe('Moved DFT to Operations.')
  })

  it('resets a dataset to the sample', async () => {
    const st = () => S.useCensus.getState()
    await st().replaceDataset('cases', st().data.cases.slice(0, 2), { fileName: 'cases.csv' })
    await st().resetDataset('cases')
    expect(st().sources.cases.kind).toBe('sample')
    expect(st().versions.cases.versionId).toBe('sample-cases')
    expect(st().history.cases[0].fileName).toBe('cases.csv')
    expect(idb.has('census:dataset:cases')).toBe(false)
  })

  it('adds, removes and undoes reference mappings', () => {
    const st = () => S.useCensus.getState()
    const bad = st().addReferenceMapping({ kind: 'move-family', jobFamily: '', from: null, to: 'G&A' })
    expect(bad.ok).toBe(false)
    const a = st().addReferenceMapping({ kind: 'move-family', jobFamily: 'Legal', from: null, to: 'G&A' })
    if (!a.ok) throw new Error(a.error)
    st().removeReferenceMapping(a.mapping.id)
    expect(st().reference.mappings).toEqual([])
    st().undoReferenceChange()
    expect(st().reference.mappings.map((m) => m.id)).toEqual([a.mapping.id])
    expect(st().reference.audit.map((x) => x.action)).toEqual(['add', 'remove', 'add'])
  })

  it('keeps immigration details for the session only, and saves the engagement switch', () => {
    const st = () => S.useCensus.getState()
    expect(st().showImmigration).toBe(false)
    expect(st().engagementSurveys).toBe(false)
    st().setShowImmigration(true)
    st().setEngagementSurveys(true)
    expect(st().showImmigration).toBe(true)
    const saved = JSON.parse(storage.getItem('census:settings')!)
    expect(saved).toMatchObject({ engagementSurveys: true })
    expect(JSON.stringify(saved)).not.toMatch(/immigration/i)
  })

  it('routes the scorecard, the new tabs and the Action center, and keeps old links', () => {
    expect(S.parseHash('')).toBeNull()
    expect(S.parseHash('#actions')).toEqual({ view: 'actions', tab: '' })
    expect(S.parseHash('#onboarding.plan')).toEqual({ view: 'onboarding', tab: 'plan' })
    expect(S.parseHash('#recruiting.pipeline')).toEqual({ view: 'recruiting', tab: 'pipeline' })
    expect(S.parseHash('#nowhere')).toBeNull()
    expect(S.HOME_VIEW).toBe('scorecard')
    expect(S.PAGE_VIEWS).toEqual(['data', 'actions'])
    // Every folder tab is a route.
    for (const v of ['scorecard', 'compliance', 'listening'] as const) expect(S.ROUTE_VIEWS).toContain(v)
  })

  it('has every dataset, including the ones added for onboarding, compliance and listening', () => {
    const s = S.useCensus.getState()
    for (const k of [
      'hiringPlan',
      'onboardingTasks',
      'rightToWork',
      'surveyResponses',
      'surveyItems',
    ] as const) {
      expect(s.data[k].length, k).toBeGreaterThan(0)
      expect(s.sources[k], k).toEqual({ kind: 'sample', rowCount: s.data[k].length })
      expect(s.versions[k].dataset, k).toBe(k)
    }
  })

  it('saves settings, never pay amounts, and opens the settings sheet', () => {
    const st = () => S.useCensus.getState()
    st().setTextSize('lg')
    st().setDataStandard('gold')
    st().setShowPay(true)
    expect(st().setToolLink('lattice', 'javascript:alert(1)')).toBe(false)
    expect(st().setToolLink('lattice', 'lattice.example.com')).toBe(true)
    const saved = JSON.parse(storage.getItem('census:settings')!)
    expect(saved).toMatchObject({
      textSize: 'lg',
      dataStandard: 'gold',
      tools: { lattice: 'https://lattice.example.com/' },
    })
    expect(saved).not.toHaveProperty('compCycle')
    expect(saved).not.toHaveProperty('showPay')
    expect(storage.getItem('census:showPay')).toBeNull()

    const n = st().settingsOpen.nonce
    S.openSettings('tools')
    expect(st().settingsOpen).toEqual({ open: true, section: 'tools', nonce: n + 1 })
    expect(st().settingsOpen).not.toHaveProperty('focus')
    S.closeSettings()
    expect(st().settingsOpen.open).toBe(false)
    // Opened on one control in a section (Ask's workspace error lands on the Workspace ID field).
    S.openSettings('ask', 'ask-workspace')
    expect(st().settingsOpen).toEqual({ open: true, section: 'ask', nonce: n + 2, focus: 'ask-workspace' })
    S.closeSettings()
  })

  it('exports and imports settings', async () => {
    const st = () => S.useCensus.getState()
    st().setTheme('light')
    const text = await S.exportSettings().text()
    st().setTheme('dark')
    const r = S.importSettings(text)
    expect(r.ok).toBe(true)
    expect(st().theme).toBe('light')
    expect(S.importSettings('nope').ok).toBe(false)
  })

  it('clears everything Census stored on this device', async () => {
    const st = () => S.useCensus.getState()
    await st().replaceDataset(
      'reviews',
      st().data.reviews.slice(0, 2),
      { fileName: 'r.xlsx' },
      { raw: sheet },
    )
    st().addReferenceMapping({ kind: 'move-department', department: 'DFT', from: null, to: 'Operations' })
    st().setDataStandard('gold')
    idb.set('other-app', 1)
    storage.setItem('other-app', '1')
    await S.clearDevice()
    expect([...idb.keys()].filter((k) => k.startsWith('census:'))).toEqual([])
    expect(idb.has('other-app')).toBe(true)
    expect([...storage.m.keys()].filter((k) => k.startsWith('census:'))).toEqual([])
    expect(storage.getItem('other-app')).toBe('1')
    const s = st()
    expect(s.sources.reviews.kind).toBe('sample')
    expect(s.dataStandard).toBe('bronze')
    expect(s.reference.mappings).toEqual([])
    expect(s.history.reviews).toEqual([])
  })

  it('says when something could not be cleared, after clearing the rest', async () => {
    const st = () => S.useCensus.getState()
    st().addReferenceMapping({ kind: 'move-department', department: 'DFT', from: null, to: 'Operations' })
    await vi.waitFor(() => expect(idb.has('census:reference')).toBe(true))
    st().setDataStandard('gold')
    stuck.add('census:reference')
    try {
      await expect(S.clearDevice()).rejects.toThrow('census:reference')
      expect(idb.has('census:reference')).toBe(true)
      expect(storage.getItem('census:settings')).toBeNull()
    } finally {
      stuck.clear()
    }
  })
})

describe('sample seed', () => {
  it('loads a registered seed on init, and resetting a dataset goes back to it', async () => {
    idb.clear()
    const S = await freshStore()
    const base = (await import('./sample')).generateSample()
    S.setSampleSeed(() => ({
      candidates: {
        rows: base.candidates.slice(0, 7),
        raw: sheet,
        issues,
        fileName: 'ATS export.csv',
      },
      employees: { certification: { by: 'HRIS team', at: '2026-09-20T00:00:00.000Z' } },
    }))
    const st = () => S.useCensus.getState()
    await st().init()
    expect(st().data.candidates).toHaveLength(7)
    expect(st().versions.candidates).toMatchObject({ versionId: 'sample-candidates-raw', hasRaw: true })
    expect((await st().getRaw('candidates'))?.sheet).toEqual(sheet)
    expect(st().versions.employees.certification?.by).toBe('HRIS team')

    await st().replaceDataset('candidates', base.candidates.slice(0, 2), { fileName: 'mine.csv' })
    await st().resetDataset('candidates')
    expect(st().data.candidates).toHaveLength(7)
    expect(st().versions.candidates.versionId).toBe('sample-candidates-raw')
    S.setSampleSeed(null)
  })
})

describe('metric dictionary', () => {
  const C = { budget: 'comp.merit.spend', band: 'comp.compa.inBand' }
  let S: Store
  const st = () => S.useCensus.getState()
  beforeEach(async () => {
    idb.clear()
    storage.m.clear()
    S = await freshStore()
    await st().init()
  })

  it('edits, undoes and resets definitions, keeps them in census:metrics, and reads them back after a reload', async () => {
    expect(st().metrics).toEqual({ overrides: {}, log: [] })
    const bad = st().editMetric({ metricId: C.budget, field: 'params.meritBudget', value: 0.5 })
    expect(bad).toEqual({ ok: false, error: 'Merit budget: enter a value from 0% to 20%.' })
    const r = st().editMetric({ metricId: C.budget, field: 'params.meritBudget', value: 0.04 }, 'Jamie')
    expect(r.ok && r.change).toMatchObject({ from: 0.035, to: 0.04, by: 'Jamie', kind: 'edit' })
    expect(st().compCycle.meritBudgetPct).toBe(0.04)
    expect(JSON.parse(storage.getItem('census:metrics')!).overrides).toEqual({
      [C.budget]: { text: {}, params: { meritBudget: 0.04 } },
    })
    st().editMetric({ metricId: 'privacy.anonymity', field: 'params.minGroup', value: 7 })
    expect(st().editMetric({ metricId: 'privacy.anonymity', field: 'params.minGroup', value: 4 }).ok).toBe(
      false,
    )

    S = await freshStore()
    expect(st().metrics.overrides[C.budget].params.meritBudget).toBe(0.04)
    expect(st().compCycle.meritBudgetPct).toBe(0.04)

    expect(st().undoMetricChange()).toBe(true) // the anonymity minimum, the latest change
    expect(st().metrics.overrides['privacy.anonymity']).toBeUndefined()
    st().resetMetric(C.budget, 'Jamie')
    expect(st().metrics.overrides).toEqual({})
    expect(st().compCycle.meritBudgetPct).toBe(0.035)
    expect(st().metrics.log.map((c) => c.kind)).toEqual(['reset', 'undo', 'edit', 'edit'])
    st().editMetrics([
      { metricId: C.budget, field: 'params.meritBudget', value: 0.03 },
      { metricId: C.band, field: 'params.healthyBand', value: [0.85, 1.15] },
    ])
    expect(st().compCycle).toMatchObject({ meritBudgetPct: 0.03, healthyBand: [0.85, 1.15] })
    st().resetAllMetrics()
    expect(st().metrics.overrides).toEqual({})
    expect(st().undoMetricChange('missing')).toBe(false)
  })

  it('moves the Settings comp cycle into the dictionary once, and setCompCycle writes the dictionary', async () => {
    storage.setItem(
      'census:settings',
      JSON.stringify({
        theme: 'dark',
        compCycle: { meritBudgetPct: 0.045, healthyBand: [0.9, 1.1], guideline: {} },
      }),
    )
    S = await freshStore()
    expect(st().theme).toBe('dark')
    expect(st().compCycle.meritBudgetPct).toBe(0.045)
    expect(st().metrics.log[0]).toMatchObject({ kind: 'migration', metricId: C.budget })
    // Saving Settings drops the old copy; the dictionary keeps the value.
    st().setTheme('light')
    expect(JSON.parse(storage.getItem('census:settings')!)).not.toHaveProperty('compCycle')
    S = await freshStore()
    expect(st().compCycle.meritBudgetPct).toBe(0.045)
    expect(st().metrics.log).toHaveLength(1)

    st().setCompCycle({ ...st().compCycle, healthyBand: [0.8, 1.2] })
    expect(st().metrics.overrides[C.band].params.healthyBand).toEqual([0.8, 1.2])
    st().resetCompCycle()
    expect(st().metrics.overrides).toEqual({})
  })

  it('travels in the settings file, and an older file with a comp cycle lands in the dictionary', async () => {
    st().editMetric({ metricId: C.budget, field: 'params.meritBudget', value: 0.04 })
    const text = await S.exportSettings().text()
    expect(JSON.parse(text).metrics.overrides[C.budget]).toBeDefined()
    st().resetAllMetrics()
    const r = S.importSettings(text)
    expect(r.ok && r.metrics?.summary).toBe('Changed 1 value in 1 metric.')
    expect(st().compCycle.meritBudgetPct).toBe(0.04)

    const old = S.importSettings({
      kind: 'census-settings',
      version: 1,
      settings: { compCycle: { meritBudgetPct: 0.05 } },
    })
    expect(old.ok && old.applied).toEqual([])
    expect(old.ok && old.metrics?.changed.map((c) => c.kind)).toEqual(['import'])
    expect(st().compCycle.meritBudgetPct).toBe(0.05)
  })

  it('imports an edited Metric dictionary workbook and uses the tolerance rule for new control totals', async () => {
    const { buildDictionaryWorkbook } = await import('@/metrics/excel')
    const { metricsApi } = await import('@/metrics/api')
    const wb = await buildDictionaryWorkbook(metricsApi(st().metrics))
    const ws = wb.getWorksheet('Settings')!
    ws.eachRow((row) => {
      if (row.getCell(1).value === 'quality.rules.controlTolerance') row.getCell(8).value = 0.01
    })
    const r = await st().importMetricDictionary((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'Jamie')
    expect(r.ok && r.report.summary).toBe('Changed 1 value in 1 metric.')
    const cert = st().certify('employees', {
      by: 'HRIS team',
      controlTotals: [{ label: 'Rows', metric: 'rows', expected: 1, tolerance: Number.NaN }],
    })
    expect(cert?.controlTotals?.[0].tolerance).toBe(0.01)
    expect((await st().importMetricDictionary(new Uint8Array([1]))).ok).toBe(false)

    await S.clearDevice()
    expect(st().metrics).toEqual({ overrides: {}, log: [] })
    expect(storage.getItem('census:metrics')).toBeNull()
  })
})
