import { beforeAll, describe, expect, it } from 'vitest'
import { computeQuality, fieldRef } from '../../quality'
import { buildSampleState } from '../../quality/seed'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '../../schema'
import { generateSample, SAMPLE_AS_OF } from '..'
import { FAMILY_OF_FUNCTION } from '../jobs'
import {
  buildMessySample,
  completeMessySample,
  type MessySample,
  RAW_DATASETS,
  type RawDataset,
  SAMPLE_TIERS,
  sameRows,
  starterSample,
} from '.'
import { UNRECOGNIZED_SOURCE_SHARE } from './extracts/candidates'
import { caseMess, MISSING_FIRST_RESPONSE_SHARE } from './extracts/cases'
import { LEGACY_GRADES } from './extracts/hiringPlan'
import { tbdRows } from './extracts/onboardingTasks'
import { NO_MANAGER_SHARE } from './extracts/requisitions'
import { PENDING_RENEWAL } from './extracts/rightToWork'
import { TITLE_ROW, UNMATCHED_SUCCESSOR_SHARE } from './extracts/succession'
import { UNTAGGED_PROGRAM } from './extracts/surveys'
import { lostReasonRows, PICKLIST_CHANGE, variantUniversityRows } from './gold'

let base: Datasets
let messy: MessySample

beforeAll(() => {
  base = generateSample()
  messy = buildMessySample(base)
})

const qualityOf = (m: MessySample) => {
  const state = buildSampleState(base, m.seed, SAMPLE_AS_OF)
  const issues: Partial<Record<DatasetKey, readonly import('../../import/types').ImportIssue[]>> = {}
  for (const k of RAW_DATASETS) issues[k] = m.imports[k].result.issues
  return { state, q: computeQuality(state.data, state.versions, issues, { asOf: SAMPLE_AS_OF }) }
}

/** Field → rows whose value differs from the clean sample. */
function diffs(key: DatasetKey, rows: readonly object[]): Record<string, number> {
  const clean = base[key] as unknown as readonly Record<string, unknown>[]
  const got = rows as readonly Record<string, unknown>[]
  const out: Record<string, number> = {}
  clean.forEach((c, i) => {
    for (const f of Object.keys(c)) if ((c[f] ?? null) !== (got[i]?.[f] ?? null)) out[f] = (out[f] ?? 0) + 1
  })
  return out
}

describe('messy sample', () => {
  it('is deterministic', () => {
    const again = buildMessySample(generateSample())
    expect(JSON.stringify(again.seed)).toBe(JSON.stringify(messy.seed))
  })

  it('loads every dataset at the tier the data tiers table gives it', () => {
    const { q } = qualityOf(messy)
    const tiers = Object.fromEntries(DATASET_KEYS.map((k) => [k, q.datasetTier(k)]))
    expect(tiers).toEqual(SAMPLE_TIERS)
  })

  it('imports every row of every extract, with the planted issues and nothing else', () => {
    const expected: Record<RawDataset, Record<string, number>> = {
      jobChanges: { 'unknown-value': 3 },
      requisitions: { 'unknown-value': 3 },
      candidates: {},
      cases: {},
      transactions: { 'unknown-value': 4 },
      succession: { converted: 5, 'not-in-roster': 13 },
      learning: { unreadable: 5 },
      hiringPlan: { 'unknown-value': LEGACY_GRADES },
      // One summary line for the due dates written as days from the start, and the TBD dates.
      onboardingTasks: { converted: 1, unreadable: tbdRows(base.onboardingTasks).size },
      rightToWork: { unreadable: PENDING_RENEWAL },
      surveyResponses: {},
      surveyItems: {},
    }
    for (const k of RAW_DATASETS) {
      const { result } = messy.imports[k]
      const byCode: Record<string, number> = {}
      for (const i of result.issues) byCode[i.code] = (byCode[i.code] ?? 0) + 1
      expect(byCode, k).toEqual(expected[k])
      expect(result.stats.rowsIn, k).toBe(base[k].length)
      expect(result.stats.rowsOut, k).toBe(base[k].length)
    }
  })

  it('auto-maps every foreign header to the field it holds', () => {
    // Fields the extracts have no column for: built from first and last name, or from the type
    // or the checklist task.
    const unmapped: Partial<Record<RawDataset, string[]>> = {
      candidates: ['candidateName'],
      cases: ['processId'],
      transactions: ['processId'],
      onboardingTasks: ['processId'],
    }
    for (const k of RAW_DATASETS) {
      const { mapping, sheet } = messy.imports[k]
      const missing = Object.entries(mapping)
        .filter(([, m]) => !m.header)
        .map(([f]) => f)
      expect(missing, k).toEqual(unmapped[k] ?? [])
      // Every column of the extract is used.
      const used = new Set(Object.values(mapping).map((m) => m.header))
      const extra = sheet.headers.filter((h) => !used.has(h) && !['First Name', 'Last Name'].includes(h))
      expect(extra, k).toEqual([])
    }
  })

  it('changes only the planted values, so every planted story survives the import', () => {
    const expected: Record<RawDataset, Record<string, number>> = {
      jobChanges: { fromLevel: 3 },
      requisitions: { department: 38, hiringManagerId: 18, hiringManager: 18, reqType: 3 },
      candidates: { source: 399 },
      cases: { firstResponseAt: 534, category: 165, processId: 165 },
      transactions: { retro: 4 },
      succession: { successorId: 13 },
      learning: { dueDate: 5 },
      hiringPlan: { level: LEGACY_GRADES },
      onboardingTasks: { dueDate: tbdRows(base.onboardingTasks).size },
      rightToWork: { expiryDate: PENDING_RENEWAL },
      surveyResponses: { driver: base.surveyResponses.filter((r) => r.survey === UNTAGGED_PROGRAM).length },
      surveyItems: {},
    }
    for (const k of RAW_DATASETS) expect(diffs(k, messy.data[k]), k).toEqual(expected[k])
    // Exit reasons lost in the migration, and a few school names typed the short way.
    expect(diffs('employees', messy.data.employees)).toEqual({
      terminationReason: 139,
      university: variantUniversityRows(base.employees).size,
    })
    expect(variantUniversityRows(base.employees).size).toBeGreaterThan(20)
    expect(diffs('comp', messy.data.comp)).toEqual({ marketP50: 580 })
    expect(diffs('reviews', messy.data.reviews)).toEqual({})
  })

  it('keeps the original sheets, including the title row of the hand-kept spreadsheet', () => {
    const s = messy.imports.succession
    expect(s.extract.aoa[0]).toEqual([TITLE_ROW])
    expect(s.sheet.headerRow).toBe(2)
    expect(messy.imports.candidates.sheet.headers).toContain('First Name')
    expect(messy.imports.transactions.result.used.dateOrders['Initiated Date']).toBe('DMY')
    for (const k of RAW_DATASETS) {
      const e = messy.seed[k]
      expect(e?.raw, k).toBe(messy.imports[k].sheet)
      expect(e?.issues, k).toBe(messy.imports[k].result.issues)
    }
  })
})

describe('starter state and background import', () => {
  it('the starter state has exactly the rows the import of each raw extract yields', () => {
    const starter = starterSample(base)
    for (const k of DATASET_KEYS) expect(sameRows(starter.data[k], messy.data[k]), k).toBe(true)
  })

  it('the starter state has the same tiers, so nothing changes on screen when the import lands', () => {
    const starter = starterSample(base)
    const state = buildSampleState(base, starter.seed, SAMPLE_AS_OF)
    const q = computeQuality(state.data, state.versions, undefined, { asOf: SAMPLE_AS_OF })
    expect(Object.fromEntries(DATASET_KEYS.map((k) => [k, q.datasetTier(k)]))).toEqual(SAMPLE_TIERS)
    for (const k of RAW_DATASETS) expect(state.versions[k].hasRaw, k).toBe(false)
  })

  it('completing the starter keeps its rows and adds each sheet, mapping and import log', async () => {
    const starter = starterSample(base)
    const full = await completeMessySample(starter, base)
    for (const k of RAW_DATASETS) {
      const e = full[k]
      expect(e?.rows, k).toBe(starter.data[k])
      expect(e?.raw?.headers, k).toEqual(messy.imports[k].sheet.headers)
      expect(e?.issues, k).toEqual(messy.imports[k].result.issues)
      expect(e?.mappingConfirmed, k).toEqual(starter.seed[k]?.mappingConfirmed)
    }
    expect(full.employees).toBe(starter.seed.employees)
    expect(full.comp?.certification).toEqual(starter.seed.comp?.certification)
  })
})

describe('magnitudes from the data tiers table', () => {
  it('employees: gold, termination reason 72% filled and bronze; exits in the last 12 months keep theirs', () => {
    const { q } = qualityOf(messy)
    const s = q.fieldStats(fieldRef('employees', 'terminationReason'))
    expect(s.applicableRows).toBe(497)
    expect(s.filled).toBe(358)
    expect(Math.round((s.coverage ?? 0) * 100)).toBe(72)
    expect(s.tier).toBe('bronze')
    expect(q.datasetTier('employees')).toBe('gold')
    const lost = lostReasonRows(base.employees)
    for (const i of lost) expect(base.employees[i].terminationDate! < PICKLIST_CHANGE).toBe(true)
  })

  it("employees: every person's job function sits in their job family", () => {
    for (const e of messy.data.employees) {
      expect(e.jobFunction, e.employeeId).toBeTruthy()
      expect(FAMILY_OF_FUNCTION.get(e.jobFunction ?? ''), e.employeeId).toBe(e.jobFamily)
    }
    const { q } = qualityOf(messy)
    expect(q.fieldTier(fieldRef('employees', 'jobFamily'))).toBe('gold')
    expect(q.fieldTier(fieldRef('employees', 'jobFunction'))).toBe('gold')
  })

  it('requisitions: silver, 3% have no hiring manager ID', () => {
    const { q } = qualityOf(messy)
    const s = q.fieldStats(fieldRef('requisitions', 'hiringManagerId'))
    expect(s.blank).toBe(Math.round(base.requisitions.length * NO_MANAGER_SHARE))
    expect(Math.round((s.blank / s.rows) * 100)).toBe(3)
    expect(s.tier).toBe('silver')
  })

  it('requisitions: reqs closed before Oct 2025 use old department names the roster does not have', () => {
    const roster = new Set(messy.data.employees.map((e) => e.department))
    const gaps = new Map<string, number>()
    for (const r of messy.data.requisitions)
      if (!roster.has(r.department)) gaps.set(r.department, (gaps.get(r.department) ?? 0) + 1)
    expect(Object.fromEntries(gaps)).toEqual({ DV: 22, 'Test & Product Eng': 16 })
    for (const r of messy.data.requisitions)
      if (gaps.has(r.department)) expect(r.status === 'Cancelled' || r.filledDate! < '2025-10-01').toBe(true)
  })

  it('candidates: bronze, mapping not confirmed, 4% of sources not recognized', () => {
    const { q, state } = qualityOf(messy)
    const s = q.fieldStats(fieldRef('candidates', 'source'))
    expect(s.invalid).toBe(Math.round(base.candidates.length * UNRECOGNIZED_SOURCE_SHARE))
    expect(Math.round((s.problemRate ?? 0) * 100)).toBe(4)
    expect(state.versions.candidates.mappingConfirmedAt).toBeNull()
    expect(q.checks('candidates').find((r) => r.id === 'mapping-confirmed')?.pass).toBe(false)
  })

  it('cases: bronze, first response missing on 8%, some categories unmapped', () => {
    const { q } = qualityOf(messy)
    const s = q.fieldStats(fieldRef('cases', 'firstResponseAt'))
    expect(s.blank).toBe(caseMess(base.cases).noFirstResponse.size)
    expect(Math.round((s.blank / s.applicableRows) * 100)).toBe(MISSING_FIRST_RESPONSE_SHARE * 100)
    const cat = q.fieldStats(fieldRef('cases', 'category'))
    expect(cat.invalid).toBe(165)
    expect(new Set(messy.data.cases.map((c) => c.category)).size).toBe(15)
  })

  it('succession: bronze, 15% of successors are not in the roster', () => {
    const { q } = qualityOf(messy)
    const ids = new Set(messy.data.employees.map((e) => e.employeeId))
    const named = messy.data.succession.filter((r) => r.successorId)
    const unmatched = named.filter((r) => !ids.has(r.successorId!))
    expect(unmatched).toHaveLength(13)
    expect(Math.round((unmatched.length / named.length) * 100)).toBe(UNMATCHED_SUCCESSOR_SHARE * 100)
    expect(q.checks('succession').find((r) => r.id === 'references')?.pass).toBe(false)
    // Roles without a successor stay without one (the succession gap story).
    expect(messy.data.succession.filter((r) => !r.successorId)).toHaveLength(
      base.succession.filter((r) => !r.successorId).length,
    )
  })

  it('compensation: gold, market median 60% filled and bronze', () => {
    const { q } = qualityOf(messy)
    const s = q.fieldStats(fieldRef('comp', 'marketP50'))
    expect(s.coverage).toBe(0.6)
    expect(s.tier).toBe('bronze')
    expect(q.datasetTier('comp')).toBe('gold')
  })

  it('hiring plan: silver, mapping confirmed by finance and TA, three legacy grades left blank', () => {
    const { q, state } = qualityOf(messy)
    expect(q.datasetTier('hiringPlan')).toBe('silver')
    expect(state.versions.hiringPlan.mappingConfirmedBy).toBe('Finance and talent acquisition')
    expect(q.fieldStats(fieldRef('hiringPlan', 'level')).invalid).toBe(LEGACY_GRADES)
    // Month periods ("Oct 2026") and counts come back exactly; every req ID resolves.
    expect(q.checks('hiringPlan').find((r) => r.id === 'references')?.pass).toBe(true)
    expect(messy.data.hiringPlan.every((l) => l.period.endsWith('-01'))).toBe(true)
  })

  it('onboarding tasks: bronze raw tool export, relative due dates converted with the start date', () => {
    const { q, state } = qualityOf(messy)
    expect(q.datasetTier('onboardingTasks')).toBe('bronze')
    expect(state.versions.onboardingTasks.mappingConfirmedAt).toBeNull()
    const converted = messy.imports.onboardingTasks.result.issues.find((i) => i.code === 'converted')
    expect(converted?.issue).toMatch(/days from the start/)
    // Every "Day -3" and "Day +3 BD" resolved to the same date the checklist gives, for pre-hires
    // (roster start) and accepted candidates (ATS start date) alike.
    const tbd = tbdRows(base.onboardingTasks)
    messy.data.onboardingTasks.forEach((t, i) => {
      if (!tbd.has(i)) expect(t.dueDate, `${i}`).toBe(base.onboardingTasks[i].dueDate)
    })
    expect(messy.data.onboardingTasks.some((t) => t.applicationId && t.dueDate)).toBe(true)
  })

  it('right to work: silver, immigration programs read as broad categories, never nationality', () => {
    const { q, state } = qualityOf(messy)
    expect(q.datasetTier('rightToWork')).toBe('silver')
    expect(state.versions.rightToWork.mappingConfirmedBy).toBe('Global mobility')
    const raw = messy.imports.rightToWork.sheet
    expect(raw.headers.some((h) => /nation|citizen/i.test(h))).toBe(false)
    expect(new Set(raw.rows.map((r) => r['Work Authorization']))).toContain('H-1B')
    expect(messy.data.rightToWork.map((r) => r.authorizationType)).toEqual(
      base.rightToWork.map((r) => r.authorizationType),
    )
    // Two expiries read "Pending renewal" (under 2% of the expiries), so the field stays silver.
    expect(q.fieldTier(fieldRef('rightToWork', 'expiryDate'))).toBe('silver')
  })

  it('survey responses: silver, the comments column is dropped as the sheet is read', () => {
    const { q, state } = qualityOf(messy)
    expect(q.datasetTier('surveyResponses')).toBe('silver')
    expect(q.datasetTier('surveyItems')).toBe('silver')
    expect(state.versions.surveyResponses.mappingConfirmedBy).toBe('People analytics')
    const sheet = messy.imports.surveyResponses.sheet
    expect(sheet.dropped).toEqual([{ header: 'Comments', reason: 'comment' }])
    expect(sheet.headers).not.toContain('Comments')
    expect(sheet.rows.every((r) => !('Comments' in r))).toBe(true)
    // The help desk's case survey has no drivers; the Questions sheet supplies them.
    const blank = messy.data.surveyResponses.filter((r) => !r.driver)
    expect(blank.length).toBeGreaterThan(0)
    expect(blank.every((r) => r.survey === UNTAGGED_PROGRAM)).toBe(true)
  })
})

describe('starter state', () => {
  it('silver datasets have a confirmed mapping and no certification; bronze ones neither', () => {
    const { state } = qualityOf(messy)
    for (const k of DATASET_KEYS) {
      const v = state.versions[k]
      const tier = SAMPLE_TIERS[k]
      expect(!!v.mappingConfirmedAt, k).toBe(tier === 'silver' || tier === 'gold')
      expect(!!v.certification, k).toBe(tier === 'gold')
    }
    expect(state.versions.jobChanges.mappingConfirmedBy).toBe('HRIS team')
  })

  it('gold datasets are certified by their owners for this version, and the control totals reconcile', () => {
    const { state, q } = qualityOf(messy)
    const owners: Partial<Record<DatasetKey, string>> = {
      employees: 'HRIS team',
      reviews: 'Talent team',
      comp: 'Total rewards',
    }
    for (const [k, by] of Object.entries(owners) as [DatasetKey, string][]) {
      const cert = state.versions[k].certification!
      expect(cert.by).toBe(by)
      expect(cert.versionId).toBe(state.versions[k].versionId)
      expect(cert.note).toBeTruthy()
      expect(cert.controlTotals?.length).toBeGreaterThan(0)
      expect(q.checks(k).find((r) => r.id === 'control-totals')?.pass, k).toBe(true)
    }
    const hc = state.versions.employees.certification!.controlTotals!.find(
      (t) => t.metric === 'activeHeadcount',
    )
    expect(hc).toMatchObject({ expected: 1450, actual: 1450 })
  })

  it('raw datasets keep their sheet and import log as the version', () => {
    const { state } = qualityOf(messy)
    for (const k of RAW_DATASETS) {
      expect(state.versions[k]).toMatchObject({
        hasRaw: true,
        versionId: `sample-${k}-raw`,
        rowCount: base[k].length,
      })
      expect(state.versions[k].fileName).toBeTruthy()
    }
    expect(state.raws.map((r) => r.dataset).sort()).toEqual([...RAW_DATASETS].sort())
    expect(state.versions.transactions.issues.rowsWithErrors).toBe(4)
  })
})
