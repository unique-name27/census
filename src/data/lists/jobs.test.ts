import { describe, expect, it } from 'vitest'
import { buildContext } from '../context'
import { emp, emptyDatasets } from '../quality/test-fixtures'
import { generateSample, SAMPLE_AS_OF } from '../sample'
import { DATASET_KEYS, type DatasetKey, JOB_FAMILIES } from '../schema'
import { DEFAULT_FILTERS } from '../scope'
import type { SourceMeta } from '../store'
import { applyEdit, EMPTY_LISTS } from './edit'
import { effectiveLists, officialLists, type SourceKinds } from './effective'
import { contextJobs, jobArchitecture } from './jobs'

const kinds = (uploads: DatasetKey[] = []): SourceKinds =>
  Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: uploads.includes(k) ? 'upload' : 'sample' }]),
  ) as SourceKinds

describe('jobArchitecture on the sample', () => {
  const data = generateSample()
  const jobs = contextJobs(EMPTY_LISTS, kinds(), data.employees, SAMPLE_AS_OF)

  it('reads the official lists, families by active headcount', () => {
    expect(jobs.source).toBe('official')
    expect(jobs.families.map((f) => f.name)).toEqual([
      'Silicon Engineering',
      'Systems & Software Engineering',
      'Corporate',
      'Go-to-Market',
      'Product & Test Operations',
      'Executive',
    ])
    expect(new Set(jobs.families.map((f) => f.name))).toEqual(new Set(JOB_FAMILIES))
    expect(jobs.families.flatMap((f) => f.functions)).toHaveLength(38)
  })

  it("lists Silicon Engineering's functions in stage order", () => {
    const se = jobs.families.find((f) => f.name === 'Silicon Engineering')!
    expect(se.functions).toEqual([
      { name: 'Architecture', stage: 1 },
      { name: 'Design RTL', stage: 2 },
      { name: 'Analog & Mixed-Signal', stage: 3 },
      { name: 'Design Verification', stage: 4 },
      { name: 'DFT', stage: 5 },
      { name: 'Physical Design', stage: 6 },
      // Proposed (Signoff and tape-out), not saved.
      { name: 'Packaging', stage: 7 },
      { name: 'Post-Silicon Validation', stage: 8 },
    ])
    // Functions on the same stage by active headcount.
    const ss = jobs.families.find((f) => f.name === 'Systems & Software Engineering')!
    expect(ss.functions).toEqual([
      { name: 'Systems Validation', stage: 8 },
      { name: 'Hardware Engineering', stage: 8 },
      { name: 'Software', stage: 10 },
      { name: 'Firmware', stage: 10 },
    ])
    // Functions with no stage by active headcount.
    const corp = jobs.families.find((f) => f.name === 'Corporate')!
    expect(corp.functions[0]).toEqual({ name: 'EDA & CAD Infrastructure', stage: 11 })
    expect(corp.functions.slice(1).every((f) => f.stage === null)).toBe(true)
  })

  it('says which families are engineering and where each person counts in Engineering by stage', () => {
    expect(jobs.engineeringOf('Silicon Engineering')).toEqual({ engineering: true, source: 'saved' })
    expect(jobs.engineeringOf('Product & Test Operations')).toEqual({ engineering: false, source: 'saved' })
    expect(jobs.engineeringOf('Photonics Engineering')).toEqual({ engineering: true, source: 'proposed' })
    expect(jobs.engineeringOf('Finance')).toEqual({ engineering: false, source: 'proposed' })
    expect(jobs.stageFor('Design RTL')).toEqual({ stage: 'rtl', source: 'saved' })
    expect(jobs.stageFor('Packaging')).toEqual({ stage: 'signoff', source: 'proposed' })
    expect(jobs.stageFor('Supply Chain')).toBe(null)
    const place = (jobFamily: string, jobFunction: string) =>
      jobs.engineeringPlace({ jobFamily, jobFunction })
    expect(place('Silicon Engineering', 'Packaging')).toEqual({
      family: 'Silicon Engineering',
      jobFunction: 'Packaging',
      stage: 'signoff',
      source: 'proposed',
    })
    // A saved stage counts whatever the family; a proposal only inside an engineering family.
    expect(place('Product & Test Operations', 'Test Engineering')?.stage).toBe('productTest')
    expect(place('Corporate', 'EDA & CAD Infrastructure')?.stage).toBe('shared')
    expect(place('Product & Test Operations', 'Supply Chain')).toBe(null)
    expect(place('Go-to-Market', 'Field Applications')).toBe(null)
    // An engineering family's function with no stage at all is Not mapped.
    expect(place('Silicon Engineering', 'Photonics')).toEqual({
      family: 'Silicon Engineering',
      jobFunction: 'Photonics',
      stage: null,
      source: null,
    })
  })

  it('answers family and stage per function, and the family a person counts under', () => {
    expect(jobs.familyOf('Design RTL')).toBe('Silicon Engineering')
    expect(jobs.familyOf('Post-Silicon Validation')).toBe('Silicon Engineering')
    expect(jobs.familyOf('Nope')).toBe(null)
    expect(jobs.stageOf('Packaging')).toBe(7)
    expect(jobs.stageOf('Software')).toBe(10)
    expect(jobs.stageOf('Sales')).toBe(null)
    expect(jobs.familyFor({ jobFamily: null, jobFunction: 'DFT' })).toBe('Silicon Engineering')
    expect(jobs.familyFor({ jobFamily: 'Corporate', jobFunction: 'DFT' })).toBe('Corporate')
    expect(jobs.familyFor({ jobFamily: null, jobFunction: null })).toBe(null)
  })

  it('is the same object for the same inputs, and is what buildContext carries', () => {
    expect(contextJobs(EMPTY_LISTS, kinds(), data.employees, SAMPLE_AS_OF)).toBe(jobs)
    const sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
    ) as Record<DatasetKey, SourceMeta>
    const ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })
    expect(ctx.jobs.source).toBe('official')
    expect(ctx.jobs.familyOf('Design RTL')).toBe('Silicon Engineering')
    expect(ctx.jobs.families[0].functions[1]).toEqual({ name: 'Design RTL', stage: 2 })
  })
})

describe('jobArchitecture from data alone', () => {
  const d = emptyDatasets()
  d.employees = [
    emp(1, { jobFamily: 'Engineering', jobFunction: 'Firmware' }),
    emp(2, { jobFamily: 'Engineering', jobFunction: 'Firmware' }),
    emp(3, { jobFamily: 'Operations', jobFunction: 'Firmware' }),
    emp(4, { jobFamily: 'Operations', jobFunction: 'Supply' }),
    emp(5, { jobFamily: null, jobFunction: 'Supply' }),
    emp(6, { jobFamily: 'Operations', jobFunction: 'Planning', terminationDate: '2026-01-31' }),
    emp(7, { jobFamily: 'Engineering', jobFunction: 'Firmware', employmentType: 'Contractor' }),
    emp(8, { jobFamily: 'Corporate', jobFunction: null }),
  ]
  const own = kinds(['employees'])

  it('uses the family most rows name, with stages proposed from the names', () => {
    const lists = effectiveLists(EMPTY_LISTS, d, own)
    expect(lists.jobFunction.validates).toBe(false)
    const jobs = jobArchitecture(lists, d.employees, '2026-09-30')
    expect(jobs.source).toBe('data')
    expect(jobs.familyOf('Firmware')).toBe('Engineering')
    expect(jobs.familyOf('Supply')).toBe('Operations')
    // A former employee's function still has a family.
    expect(jobs.familyOf('Planning')).toBe('Operations')
    expect(jobs.stageFor('Firmware')).toEqual({ stage: 'software', source: 'proposed' })
    expect(jobs.stageOf('Supply')).toBe(null)
    // Active employees only: Operations 3 (one with no family counts under Supply's), Engineering 2, Corporate 1.
    expect(jobs.families.map((f) => [f.name, f.functions.map((x) => x.name)])).toEqual([
      ['Operations', ['Supply', 'Planning']],
      ['Engineering', ['Firmware']],
      ['Corporate', []],
    ])
    expect(jobArchitecture(lists, d.employees, '2026-09-30')).toBe(jobs)
  })

  it('takes the official family and stage over the rows once the lists are official', () => {
    const lists = effectiveLists(EMPTY_LISTS, d, own)
    const fam = applyEdit(EMPTY_LISTS, lists, { kind: 'make-official', list: 'jobFamily' })
    if (!fam.ok) throw new Error(fam.error)
    const fn = applyEdit(fam.state, effectiveLists(fam.state, d, own), {
      kind: 'make-official',
      list: 'jobFunction',
    })
    if (!fn.ok) throw new Error(fn.error)
    const moved = applyEdit(fn.state, effectiveLists(fn.state, d, own), {
      kind: 'move',
      list: 'jobFunction',
      value: 'Firmware',
      parent: 'Operations',
    })
    if (!moved.ok) throw new Error(moved.error)
    const staged = applyEdit(moved.state, effectiveLists(moved.state, d, own), {
      kind: 'attrs',
      list: 'jobFunction',
      value: 'Firmware',
      attrs: { stage: 'Analog and mixed-signal design' },
    })
    if (!staged.ok) throw new Error(staged.error)
    const official = officialLists(staged.state, own)
    const jobs = jobArchitecture(
      { jobFamily: official.jobFamily, jobFunction: official.jobFunction },
      d.employees,
    )
    expect(jobs.source).toBe('official')
    expect(jobs.familyOf('Firmware')).toBe('Operations')
    expect(jobs.stageOf('Firmware')).toBe(3)
    expect(jobs.stageFor('Firmware')).toEqual({ stage: 'ams', source: 'saved' })
    expect(contextJobs(staged.state, own, d.employees, '2026-09-30').familyOf('Firmware')).toBe('Operations')
  })
})
