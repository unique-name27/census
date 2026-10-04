import { describe, expect, it } from 'vitest'
import type { ParsedSheet } from '../import/types'
import { emp, emptyDatasets, req } from '../quality/test-fixtures'
import { generateSample, SAMPLE_AS_OF } from '../sample'
import type { Datasets, Employee, Level } from '../schema'
import { applyReferenceMappings, validateMapping } from './apply'
import { CATEGORIES, categoryOf } from './categories'
import { describeMapping } from './describe'
import { inferStructure } from './infer'
import { rawSpellings } from './spellings'
import { addMapping, canUndo, EMPTY_REFERENCE, removeMapping, undoChange } from './state'
import type { ReferenceMapping } from './types'

const AT = '2026-10-01T00:00:00.000Z'

function company(): Datasets {
  const d = emptyDatasets()
  d.employees = [
    emp(1, { businessUnit: 'Silicon', department: 'DV', jobFamily: 'Verification', jobFunction: null }),
    emp(2, {
      businessUnit: 'Silicon',
      department: 'DV',
      jobFamily: 'Verification',
      jobFunction: 'Engineering',
    }),
    emp(3, {
      businessUnit: 'Systems',
      department: 'DV',
      jobFamily: 'Verification',
      jobFunction: 'Operations',
    }),
    emp(4, { businessUnit: 'Silicon', department: 'Design Verification', jobFamily: 'Software' }),
    emp(5, { businessUnit: 'Systems', department: 'Firmware', jobFamily: 'Software' }),
  ]
  d.requisitions = [req(1, { businessUnit: 'Systems', department: 'DV' }), req(2, { department: 'Firmware' })]
  d.jobChanges = [
    {
      employeeId: 'E002',
      effectiveDate: '2026-01-01',
      changeType: 'Transfer',
      fromDepartment: 'DV',
      toDepartment: 'Firmware',
    },
  ]
  return d
}

const m = (x: Partial<ReferenceMapping> & Pick<ReferenceMapping, 'kind'>): ReferenceMapping =>
  ({ id: `m-${Math.random()}`, by: null, at: AT, scope: 'category', from: null, ...x }) as ReferenceMapping

describe('applyReferenceMappings', () => {
  it('returns the same datasets when there are no mappings or nothing changes', () => {
    const d = company()
    expect(applyReferenceMappings(d, []).datasets).toBe(d)
    const noop = applyReferenceMappings(d, [
      m({ kind: 'move-department', department: 'Nope', to: 'Silicon' }),
    ])
    expect(noop.datasets).toBe(d)
    expect(noop.total).toBe(0)
  })

  it('moves a department to another business unit in employees and requisitions', () => {
    const d = company()
    const r = applyReferenceMappings(d, [
      m({ kind: 'move-department', department: 'DV', from: 'Systems', to: 'Silicon' }),
    ])
    expect(r.datasets.employees.map((e) => e.businessUnit)).toEqual([
      'Silicon',
      'Silicon',
      'Silicon',
      'Silicon',
      'Systems',
    ])
    expect(r.datasets.requisitions[0].businessUnit).toBe('Silicon')
    expect(r.changes).toEqual({ 'employees.businessUnit': 1, 'requisitions.businessUnit': 1 })
    expect(r.rows['employees.businessUnit']).toEqual([2])
    expect(r.total).toBe(2)
    // Inputs are untouched and unchanged datasets keep their identity.
    expect(d.employees[2].businessUnit).toBe('Systems')
    expect(r.datasets.cases).toBe(d.cases)
    expect(r.datasets.employees[0]).toBe(d.employees[0])
  })

  it('assigns a job family to a function', () => {
    const r = applyReferenceMappings(company(), [
      m({ kind: 'move-family', jobFamily: 'Verification', to: 'Engineering' }),
    ])
    expect(r.datasets.employees.map((e) => e.jobFunction)).toEqual([
      'Engineering',
      'Engineering',
      'Engineering',
      'Engineering',
      'Engineering',
    ])
    expect(r.changes['employees.jobFunction']).toBe(2)
  })

  it('merges spellings across every field of the category, or one field only', () => {
    const merge = m({ kind: 'merge', ref: 'employees.department', from: ['DV'], to: 'Design Verification' })
    const r = applyReferenceMappings(company(), [merge])
    expect(r.datasets.employees.map((e) => e.department)).toEqual([
      'Design Verification',
      'Design Verification',
      'Design Verification',
      'Design Verification',
      'Firmware',
    ])
    expect(r.datasets.requisitions[0].department).toBe('Design Verification')
    expect(r.datasets.jobChanges[0].fromDepartment).toBe('Design Verification')
    expect(r.changes).toEqual({
      'employees.department': 3,
      'requisitions.department': 1,
      'jobChanges.fromDepartment': 1,
    })
    expect(r.by['employees.department']).toBeNull()

    const only = applyReferenceMappings(company(), [{ ...merge, scope: 'field' } as ReferenceMapping])
    expect(only.datasets.requisitions[0].department).toBe('DV')
  })

  it('counts each changed row once per mapping, even when two of its fields change', () => {
    const d = company()
    d.jobChanges.push({
      employeeId: 'E003',
      effectiveDate: '2026-02-01',
      changeType: 'Promotion',
      fromDepartment: 'DV',
      toDepartment: 'DV',
    })
    const rename = m({ kind: 'rename', ref: 'employees.department', from: ['DV'], to: 'Verification' })
    const r = applyReferenceMappings(d, [rename])
    // 3 employees, 1 requisition and 2 job changes, one of them with both departments changed.
    expect(r.changes).toMatchObject({ 'jobChanges.fromDepartment': 2, 'jobChanges.toDepartment': 1 })
    expect(r.perMapping[rename.id]).toBe(6)
  })

  it('applies mappings in order, so a rename then a move of the new name works', () => {
    const r = applyReferenceMappings(company(), [
      m({ kind: 'rename', ref: 'employees.department', from: ['DV'], to: 'Verification' }),
      m({ kind: 'move-department', department: 'Verification', to: 'Silicon' }),
    ])
    expect(r.datasets.employees.slice(0, 3).map((e) => [e.department, e.businessUnit])).toEqual([
      ['Verification', 'Silicon'],
      ['Verification', 'Silicon'],
      ['Verification', 'Silicon'],
    ])
  })

  it('counts final differences, so a rename and its reverse change nothing', () => {
    const d = company()
    const r = applyReferenceMappings(d, [
      m({ kind: 'rename', ref: 'employees.department', from: ['DV'], to: 'X' }),
      m({ kind: 'rename', ref: 'employees.department', from: ['X'], to: 'DV' }),
    ])
    expect(r.total).toBe(0)
    expect(r.datasets).toBe(d)
  })

  it('skips mappings that would leave a fixed list', () => {
    const bad = m({ kind: 'rename', ref: 'employees.level', from: ['L3'], to: 'P3' })
    const r = applyReferenceMappings(company(), [bad])
    expect(r.skipped).toEqual([{ id: bad.id, reason: expect.stringContaining('Level must be one of') }])
    expect(validateMapping({ kind: 'rename', ref: 'cases.subcategory', from: ['a'], to: 'b' })).toBe(
      'Only categorical fields can be merged or renamed.',
    )
    expect(
      validateMapping({ kind: 'move-department', department: 'DV', from: 'Silicon', to: 'Silicon' }),
    ).toBe('The department is already under that business unit.')
  })
})

describe('categories', () => {
  it('cover real schema fields and never case subcategories', () => {
    for (const c of CATEGORIES) for (const r of c.refs) expect(categoryOf(r)?.id).toBe(c.id)
    expect(categoryOf('cases.subcategory')).toBeUndefined()
    expect(categoryOf('requisitions.department')?.refs).toContain('jobChanges.toDepartment')
    expect(categoryOf('employees.level')?.strict).toBe(true)
    expect(categoryOf('employees.department')?.strict).toBe(false)
  })

  it('treat job function as open, so your own function is never "not in the list"', () => {
    expect(categoryOf('employees.jobFunction')?.vocab).toBeNull()
    const d = emptyDatasets()
    d.employees = [emp(1, { jobFunction: 'Research' }), emp(2)]
    const [inv] = inferStructure(d, { asOf: SAMPLE_AS_OF, categories: ['jobFunction'] }).categories
    expect(inv.unrecognized).toEqual([])
  })
})

describe('change list', () => {
  it('records adds and removals with who and when, and undoes them', () => {
    const a = addMapping(
      EMPTY_REFERENCE,
      { kind: 'move-department', department: 'DV', from: null, to: 'Silicon' },
      'Jamie',
      1000,
    )
    if (!a.ok) throw new Error(a.error)
    expect(a.mapping).toMatchObject({ by: 'Jamie', at: new Date(1000).toISOString(), from: null })
    expect(a.state.audit[0]).toMatchObject({ what: 'Moved DV to Silicon.', by: 'Jamie', action: 'add' })

    const b = addMapping(
      a.state,
      { kind: 'merge', ref: 'employees.department', from: [' DV ', 'DV'], to: 'Design Verification' },
      '',
      2000,
    )
    if (!b.ok) throw new Error(b.error)
    expect(b.mapping).toMatchObject({ from: ['DV'], scope: 'category', by: null })
    expect(b.state.audit[0].what).toBe('Merged department "DV" into "Design Verification".')

    const removed = removeMapping(b.state, a.mapping.id, null, 3000)
    expect(removed.mappings.map((x) => x.id)).toEqual([b.mapping.id])
    expect(removed.audit[0].what).toBe('Removed: Moved DV to Silicon.')

    // Undo the removal: the move comes back in its original place.
    const restored = undoChange(removed, removed.audit[0].id, 'Jamie', 4000)
    expect(restored.mappings.map((x) => x.id)).toEqual([a.mapping.id, b.mapping.id])
    expect(restored.audit[0].what).toBe('Restored: Moved DV to Silicon.')
    // Only the newest entry for the move offers Undo, not the original add as well.
    const undoable = restored.audit.filter((x) => canUndo(restored, x.id))
    expect(undoable.map((x) => x.what)).toEqual([
      'Restored: Moved DV to Silicon.',
      'Merged department "DV" into "Design Verification".',
    ])

    // Undo with no ID takes the latest change that can be undone.
    const last = undoChange(restored)
    expect(last.mappings.map((x) => x.id)).toEqual([b.mapping.id])
    expect(canUndo(last, last.audit[0].id)).toBe(true)
    expect(canUndo(last, b.state.audit[1].id)).toBe(false)
  })

  it('refuses an invalid mapping', () => {
    const r = addMapping(EMPTY_REFERENCE, {
      kind: 'move-family',
      jobFamily: ' ',
      from: null,
      to: 'Engineering',
    })
    expect(r).toEqual({ ok: false, error: 'Choose a job family.' })
  })

  it('describes renames and family moves', () => {
    expect(
      describeMapping({
        kind: 'rename',
        ref: 'cases.category',
        from: ['Pay'],
        to: 'Payroll',
        scope: 'field',
      }),
    ).toBe('Renamed case category "Pay" to "Payroll".')
    expect(
      describeMapping({ kind: 'move-family', jobFamily: 'DFT', from: 'Operations', to: 'Engineering' }),
    ).toBe('Moved job family DFT from Operations to Engineering.')
  })
})

describe('inferStructure', () => {
  it('finds departments under several units, departments without one, and req departments not in the roster', () => {
    const d = company()
    d.employees.push(emp(6, { businessUnit: '', department: 'Lab' }))
    d.requisitions.push(req(3, { department: 'Photonics', status: 'Open' }))
    const s = inferStructure(d, { asOf: SAMPLE_AS_OF })
    expect(s.departmentsUnderSeveralUnits).toEqual([
      {
        department: 'DV',
        headcount: 3,
        businessUnits: [
          { value: 'Silicon', headcount: 2, rows: [0, 1] },
          { value: 'Systems', headcount: 1, rows: [2] },
        ],
      },
    ])
    expect(s.departmentsWithoutUnit).toEqual([{ value: 'Lab', headcount: 1, rows: [5] }])
    expect(s.reqDepartmentsNotInRoster).toEqual([
      { department: 'Photonics', businessUnit: 'Silicon Engineering', reqs: 1, openReqs: 1, rows: [2] },
    ])
    const dv = s.org.find((e) => e.businessUnit === 'Silicon' && e.department === 'DV')!
    expect(dv).toMatchObject({
      headcount: 2,
      workers: 2,
      managers: 1,
      costCenters: ['CC-100'],
      sites: ['San Jose'],
    })
    expect(dv.leader?.employeeId).toBe('E001')
  })

  it('maps function to family to title and flags families under several functions', () => {
    const s = inferStructure(company(), { asOf: SAMPLE_AS_OF })
    expect(
      s.familiesUnderSeveralFunctions.map((f) => [f.jobFamily, f.functions.map((x) => x.value)]),
    ).toEqual([['Verification', ['Engineering', 'Operations', null]]])
    expect(s.peopleWithoutFamily.headcount).toBe(0)
    expect(s.locations).toEqual([
      {
        location: 'San Jose',
        country: 'United States',
        region: 'Americas',
        headcount: 5,
        rows: [0, 1, 2, 3, 4],
      },
    ])
    expect(s.familyLevels).toEqual([
      { jobFamily: 'Software', level: 'L3', headcount: 2, rows: [3, 4] },
      { jobFamily: 'Verification', level: 'L3', headcount: 3, rows: [0, 1, 2] },
    ])
  })

  it('flags titles whose level does not fit their family', () => {
    const d = emptyDatasets()
    for (let i = 1; i <= 12; i++)
      d.employees.push(emp(i, { jobFamily: 'Software', jobTitle: 'Engineer', level: 'L3' }))
    d.employees.push(emp(13, { jobFamily: 'Software', jobTitle: 'Chief engineer', level: 'L6' }))
    const s = inferStructure(d, { asOf: SAMPLE_AS_OF })
    expect(s.levelOutliers).toEqual([
      {
        jobFamily: 'Software',
        jobTitle: 'Chief engineer',
        level: 'L6',
        usual: ['L3', 'L3'],
        headcount: 1,
        rows: [12],
      },
    ])
  })

  it('compares titles within their track, so the ends of a ladder are not flagged', () => {
    const d = emptyDatasets()
    let n = 0
    const add = (title: string, level: Level | null, k: number, patch: Partial<Employee> = {}) => {
      for (let i = 0; i < k; i++)
        d.employees.push(emp(++n, { jobFamily: 'Software', jobTitle: title, level, ...patch }))
    }
    add('Associate engineer', 'L1', 2)
    add('Engineer', 'L2', 4)
    add('Engineer II', 'L3', 6)
    add('Senior engineer', 'L4', 4)
    add('Staff engineer', 'L5', 2)
    add('Principal engineer', 'L6', 1)
    add('Engineering manager', 'M1', 10)
    add('Director', 'M2', 1)
    expect(inferStructure(d, { asOf: SAMPLE_AS_OF }).levelOutliers).toEqual([])

    // In a family that sits at L2 and L3, a title at L5 leaves L4 empty between them.
    const hw = { jobFamily: 'Hardware' }
    add('Hardware engineer', 'L2', 6, hw)
    add('Hardware engineer II', 'L3', 6, hw)
    add('Senior hardware engineer', 'L5', 2, hw)
    // Contractors and people with no level are not counted or listed.
    add('Senior hardware engineer', 'L5', 1, { ...hw, employmentType: 'Contractor' })
    add('Senior hardware engineer', null, 1, hw)
    const s = inferStructure(d, { asOf: SAMPLE_AS_OF })
    expect(s.levelOutliers).toEqual([
      {
        jobFamily: 'Hardware',
        jobTitle: 'Senior hardware engineer',
        level: 'L5',
        usual: ['L2', 'L3'],
        headcount: 2,
        rows: [42, 43],
      },
    ])
  })

  it('counts only employees in the splits behind conflicts', () => {
    const d = company()
    d.employees.push(emp(6, { businessUnit: '', department: 'Lab', employmentType: 'Contractor' }))
    d.employees.push(emp(7, { businessUnit: 'Systems', department: 'DV', employmentType: 'Intern' }))
    d.employees.push(emp(8, { jobFamily: null, employmentType: 'Contractor' }))
    const s = inferStructure(d, { asOf: SAMPLE_AS_OF })
    // A department held only by a contractor under no unit is not a conflict.
    expect(s.departmentsWithoutUnit).toEqual([])
    expect(s.departmentsUnderSeveralUnits[0].businessUnits).toEqual([
      { value: 'Silicon', headcount: 2, rows: [0, 1] },
      { value: 'Systems', headcount: 1, rows: [2] },
    ])
    expect(s.peopleWithoutFamily).toEqual({ headcount: 0, rows: [] })
    for (const f of s.familiesUnderSeveralFunctions)
      for (const x of f.functions) expect(x.rows).toHaveLength(x.headcount)
  })

  it('inventories category values with known lists, raw spellings and unrecognized values', () => {
    const d = emptyDatasets()
    d.cases = [
      { category: 'Payroll' },
      { category: 'Payroll' },
      { category: 'Badge request' },
      { category: null },
    ] as unknown as Datasets['cases']
    const s = inferStructure(d, {
      asOf: SAMPLE_AS_OF,
      categories: ['caseCategory'],
      spellings: {
        'cases.category': [
          { raw: 'Pay', value: 'Payroll', count: 1 },
          { raw: 'Payroll', value: 'Payroll', count: 1 },
          { raw: '???', value: null, count: 2 },
        ],
      },
    })
    expect(s.categories).toHaveLength(1)
    const inv = s.categories[0]
    expect(inv).toMatchObject({ ref: 'cases.category', total: 4, blank: 1 })
    expect(inv.values[0]).toEqual({
      value: 'Payroll',
      count: 2,
      share: 2 / 3,
      recognized: true,
      spellings: ['Pay'],
    })
    expect(inv.values.find((v) => v.value === 'Benefits')).toMatchObject({ count: 0, recognized: true })
    expect(inv.unrecognized).toEqual([
      { value: 'Badge request', count: 1, source: 'rows' },
      { value: '???', count: 2, source: 'import' },
    ])
  })

  it('runs over the whole sample with finite numbers', () => {
    const s = inferStructure(generateSample(), { asOf: SAMPLE_AS_OF })
    const hc = s.org.reduce((a, e) => a + e.headcount, 0)
    expect(hc).toBe(1450)
    expect(s.departmentsUnderSeveralUnits).toEqual([])
    expect(s.org.find((e) => e.department === 'Design Verification')?.headcount).toBe(150)
    expect(s.categories.length).toBeGreaterThan(30)
    for (const inv of s.categories) for (const v of inv.values) expect(Number.isFinite(v.share)).toBe(true)
  })
})

describe('rawSpellings', () => {
  it('lists the raw spellings of categorical columns and what they were read as', () => {
    const sheet: ParsedSheet = {
      name: 'ATS',
      headerRow: 0,
      headers: ['Stage', 'Src'],
      rows: [
        { Stage: 'Phone Screen', Src: 'Employee referral' },
        { Stage: 'phone screen', Src: 'Referral' },
        { Stage: 'Final round', Src: 'LinkedIn' },
      ],
      rowNumbers: [2, 3, 4],
    }
    const out = rawSpellings('candidates', sheet, {
      currentStage: { header: 'Stage', confidence: 'high', confirmed: false },
      source: { header: 'Src', confidence: 'high', confirmed: false },
    })
    expect(out['candidates.currentStage']?.[0]).toMatchObject({ raw: 'Phone Screen', count: 2 })
    expect(out['candidates.source']).toEqual([
      { raw: 'Employee referral', value: 'Referral', count: 1 },
      { raw: 'Referral', value: 'Referral', count: 1 },
      { raw: 'LinkedIn', value: 'LinkedIn', count: 1 },
    ])
  })
})
