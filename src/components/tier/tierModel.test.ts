import { describe, expect, it } from 'vitest'
import { computeQuality } from '@/data/quality/compute'
import { emptyDatasets, req, roster } from '@/data/quality/test-fixtures'
import type { DatasetVersion, Limiting, QualityIndex } from '@/data/quality/types'
import { confirmVersion, makeVersion } from '@/data/quality/versions'
import type { DatasetKey, Datasets } from '@/data/schema'
import {
  belowStandardText,
  gateFor,
  heldBack,
  hiddenFindingsText,
  joinAnd,
  noDataText,
  raiseSteps,
  raiseText,
  splitByStandard,
  subjectOf,
  type TierGate,
  tierCountParts,
  tierCounts,
  tierCountsText,
  withoutTierPrefix,
} from './tierModel'

const AS_OF = '2026-09-30'

const version = (key: DatasetKey, data: Datasets): DatasetVersion =>
  makeVersion({
    dataset: key,
    source: 'upload',
    rows: data[key] as object[],
    versionId: `${key}-v1`,
    fileName: `${key}.xlsx`,
    importedAt: '2026-09-20T09:00:00.000Z',
    mapping: {},
  })

/** Employees confirmed (silver, termination reason 50% filled for leavers); requisitions raw. */
function company() {
  const employees = roster().map((e, i) => (i >= 35 ? { ...e, terminationReason: null } : e))
  const data: Datasets = { ...emptyDatasets(), employees, requisitions: [req(1), req(2)] }
  const versions = {
    employees: confirmVersion(version('employees', data), 'Jamie', '2026-09-25T10:00:00.000Z'),
    requisitions: version('requisitions', data),
  }
  return computeQuality(data, versions, undefined, { asOf: AS_OF })
}

describe('gateFor', () => {
  const q = company()

  it('names no data when there are no uses and no view datasets', () => {
    expect(gateFor(q, 'gold', undefined, [])).toBeNull()
    expect(gateFor(q, 'gold', [], [])).toBeNull()
  })

  it('shows everything at or above the standard', () => {
    expect(q.datasetTier('employees')).toBe('silver')
    const g = gateFor(q, 'silver', ['employees.hireDate'], [])!
    expect(g).toMatchObject({ tier: 'silver', shown: true, reason: null })
    expect(g.explain).toMatch(/^Silver: Employees mapping confirmed/)
    expect(gateFor(q, 'bronze', ['requisitions.status'], [])).toMatchObject({ tier: 'bronze', shown: true })
  })

  it('hides numbers below the standard and says which standard', () => {
    expect(gateFor(q, 'gold', ['employees.hireDate'], [])).toMatchObject({
      shown: false,
      reason: 'Not yet confirmed for production',
    })
    expect(gateFor(q, 'silver', ['requisitions.status'], [])).toMatchObject({
      tier: 'bronze',
      reason: 'Not yet validated',
    })
  })

  it('takes the weakest field: a capped field drops a silver dataset to bronze', () => {
    const g = gateFor(q, 'silver', ['employees.hireDate', 'employees.terminationReason'], [])!
    expect(g.tier).toBe('bronze')
    expect(g.limiting.ref).toBe('employees.terminationReason')
    expect(g.shown).toBe(false)
  })

  it('falls back to the view datasets when a number declares no fields', () => {
    expect(gateFor(q, 'silver', undefined, ['employees'])).toMatchObject({ tier: 'silver', shown: true })
    expect(gateFor(q, 'silver', undefined, ['employees', 'requisitions'])).toMatchObject({
      tier: 'bronze',
      shown: false,
    })
  })

  it('never shows no data, whatever the standard', () => {
    const g = gateFor(q, 'bronze', ['candidates.currentStage'], [])!
    expect(g.tier).toBe('none')
    expect(g.shown).toBe(false)
    expect(g.reason).toBe('No data: Candidates current stage is missing')
    expect(gateFor(q, 'bronze', undefined, ['cases'])?.reason).toBe('No data: HR cases is missing')
  })
})

describe('wording', () => {
  it('uses the one phrasing for a hidden number', () => {
    expect(belowStandardText('gold')).toBe('Not yet confirmed for production')
    expect(belowStandardText('silver')).toBe('Not yet validated')
  })

  it('names the field or dataset that holds a number back', () => {
    expect(subjectOf({ dataset: 'employees', ref: 'employees.terminationReason' })).toBe(
      'Employees termination reason',
    )
    expect(subjectOf({ dataset: 'cases', ref: null })).toBe('HR cases')
    expect(subjectOf({ dataset: null, ref: null })).toBeNull()
    expect(noDataText({ dataset: null, ref: null })).toBe('No data: the data behind this is missing')
  })

  it('drops the tier prefix from an explanation', () => {
    expect(withoutTierPrefix('Silver: Candidates mapping confirmed.')).toBe('Candidates mapping confirmed.')
    expect(withoutTierPrefix('No data: x is blank.')).toBe('X is blank.')
    expect(withoutTierPrefix('Plain')).toBe('Plain')
  })

  it('joins steps in plain English', () => {
    expect(joinAnd([])).toBe('')
    expect(joinAnd(['a'])).toBe('a')
    expect(joinAnd(['a', 'b'])).toBe('a and b')
    expect(joinAnd(['a', 'b', 'c'])).toBe('a, b and c')
  })
})

describe('raiseSteps and heldBack', () => {
  const q = company()

  it('lists the failing rules up to the standard', () => {
    const lim: Limiting = { tier: 'bronze', dataset: 'requisitions', ref: 'requisitions.status' }
    expect(raiseSteps(q, lim, 'silver')).toEqual({
      room: ['review and confirm the Requisitions mapping'],
      source: [],
    })
    const gold = raiseSteps(q, lim, 'gold').room
    expect(gold[0]).toBe('review and confirm the Requisitions mapping')
    expect(gold).toContain('have the data owner certify this Requisitions version')
  })

  it('asks for the field to be filled when coverage caps it', () => {
    const lim: Limiting = { tier: 'bronze', dataset: 'employees', ref: 'employees.terminationReason' }
    expect(raiseSteps(q, lim, 'silver')).toEqual({
      room: [],
      source: ['fill in termination reason for more leavers in the source data'],
    })
  })

  it('asks to load a dataset with no rows, or add a column that is missing', () => {
    expect(raiseSteps(q, { dataset: 'cases', ref: null }, 'gold')).toEqual({
      room: ['load HR cases'],
      source: [],
    })
    expect(raiseSteps(q, { dataset: null, ref: null }, 'gold')).toEqual({ room: [], source: [] })
  })

  it('words the empty state that stands in for a figure', () => {
    const g = gateFor(q, 'silver', ['requisitions.status'], [])!
    const h = heldBack(g, q)
    expect(h.title).toBe('Not yet validated')
    // The whole dataset holds it back, so the dataset is named rather than one of its fields.
    expect(h.body).toBe('Held back by Requisitions, which is Bronze. Requisitions mapping not yet confirmed.')
    expect(h.raise).toBe('To raise it, review and confirm the Requisitions mapping in the Data room.')
    expect(h.dataset).toBe('requisitions')
    expect(h.canPreview).toBe(true)

    const capped = heldBack(gateFor(q, 'silver', ['employees.terminationReason'], [])!, q)
    expect(capped.body).toBe(
      'Held back by Employees termination reason, which is Bronze. Termination reason is 50% filled for leavers; silver needs 95%.',
    )
    expect(capped.raise).toBe('To raise it, fill in termination reason for more leavers in the source data.')

    const none = heldBack(gateFor(q, 'bronze', ['candidates.currentStage'], [])!, q)
    expect(none.title).toBe('No data')
    expect(none.canPreview).toBe(false)
    expect(none.raise).toBe('To raise it, load Candidates in the Data room.')
  })
})

describe('raiseText', () => {
  it('says where each step happens', () => {
    expect(raiseText({ room: ['confirm the mapping'], source: [] })).toBe(
      'To raise it, confirm the mapping in the Data room.',
    )
    expect(raiseText({ room: ['a', 'b'], source: ['fill in x in the source data'] })).toBe(
      'To raise it, a and b in the Data room, and fill in x in the source data.',
    )
    expect(raiseText({ room: [], source: [] })).toBe('')
  })
})

describe('readout split', () => {
  const gate = (shown: boolean): TierGate => ({
    tier: shown ? 'gold' : 'bronze',
    standard: 'gold',
    limiting: { tier: 'bronze', dataset: 'employees', ref: null },
    shown,
    explain: '',
    reason: shown ? null : 'Not yet confirmed for production',
  })

  it('keeps order and treats ungated items as shown', () => {
    const items = [
      { id: 'a', g: gate(true) },
      { id: 'b', g: gate(false) },
      { id: 'c', g: null },
      { id: 'd', g: gate(false) },
    ]
    const { shown, hidden } = splitByStandard(items, (i) => i.g)
    expect(shown.map((i) => i.id)).toEqual(['a', 'c'])
    expect(hidden.map((i) => i.id)).toEqual(['b', 'd'])
  })

  it('says how many findings are hidden and why', () => {
    expect(hiddenFindingsText(3, 'gold')).toBe(
      '3 findings hidden because their data is not yet confirmed for production',
    )
    expect(hiddenFindingsText(1, 'silver')).toBe('1 finding hidden because its data is not yet validated')
    expect(hiddenFindingsText(2, 'bronze')).toBe('2 findings hidden because their data is missing')
  })
})

describe('dataset counts', () => {
  it('counts datasets per tier, highest first', () => {
    const q = company()
    const counts = tierCounts(q)
    expect(counts).toEqual({ gold: 0, silver: 1, bronze: 1, none: 8 })
    expect(tierCountParts(counts).map((p) => p.text)).toEqual(['1 silver', '1 bronze', '8 with no data'])
    expect(tierCountsText(counts)).toBe('Datasets: 1 silver, 1 bronze, 8 with no data')
    expect(tierCountsText({ gold: 0, silver: 0, bronze: 0, none: 0 })).toBe('No datasets loaded')
  })

  it('reads only the tier of each dataset', () => {
    const fake = { datasetTier: (k: DatasetKey) => (k === 'employees' ? 'gold' : 'silver') } as Pick<
      QualityIndex,
      'datasetTier'
    >
    expect(tierCounts(fake, ['employees', 'reviews', 'comp'])).toEqual({
      gold: 1,
      silver: 2,
      bronze: 0,
      none: 0,
    })
  })
})
