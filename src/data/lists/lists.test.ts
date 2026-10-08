import { describe, expect, it } from 'vitest'
import { computeQuality } from '../quality'
import { emp, emptyDatasets, req } from '../quality/test-fixtures'
import { addMapping, EMPTY_REFERENCE } from '../reference/state'
import { FAMILY_OF_FUNCTION } from '../sample/jobs'
import { DATASET_KEYS, type DatasetKey, type Datasets, type HrCase, JOB_FAMILIES } from '../schema'
import { DEFAULT_SETTINGS, parseSettingsFile, settingsBlob } from '../settings'
import { analyzeList, officialParents } from './analyze'
import { listDef } from './defs'
import { applyEdit, applyEdits, canUndo, EMPTY_LISTS, MAX_LOG, undoChange, withReference } from './edit'
import {
  effectiveLists,
  officialLists,
  type SourceKinds,
  sampleLists,
  templateLists,
  validationVocab,
} from './effective'
import { importListsSection, listsFileSection, loadLists, sanitizeListsState, saveLists } from './persist'
import { censusValues, listFromData } from './seed'
import type { EffectiveLists, ListEdit, ListsState } from './types'
import { referenceToUndo, undoBoth } from './undo'

const kinds = (uploads: DatasetKey[] = []): SourceKinds =>
  Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: uploads.includes(k) ? 'upload' : 'sample' }]),
  ) as SourceKinds

const SAMPLE = kinds()
const OWN = kinds([...DATASET_KEYS])

function company(): Datasets {
  const d = emptyDatasets()
  d.employees = [
    emp(1, { department: 'Design Verification', businessUnit: 'Silicon Engineering', costCenter: 'CC-100' }),
    emp(2, { department: 'Design Verification', businessUnit: 'Silicon Engineering', costCenter: 'CC-100' }),
    emp(3, { department: 'Design Verification', businessUnit: 'Systems & Software', costCenter: 'CC-100' }),
    emp(4, {
      department: 'Firmware',
      businessUnit: 'Systems & Software',
      costCenter: 'CC-200',
      jobFamily: 'Systems & Software Engineering',
      jobFunction: 'Firmware',
    }),
    emp(5, {
      department: 'Firmware',
      businessUnit: 'Systems & Software',
      costCenter: 'CC-200',
      jobFamily: 'Systems & Software Engineering',
      jobFunction: 'Firmware',
    }),
    emp(6, { department: 'Payroll', businessUnit: 'Corporate', costCenter: 'CC-300', location: 'Austin' }),
  ]
  d.requisitions = [req(1), req(2, { department: 'DV' })]
  return d
}

/** Make a change, failing the test when it is refused. */
function must(state: ListsState, eff: EffectiveLists, edit: ListEdit, now = 1_000) {
  const r = applyEdit(state, eff, edit, { now })
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('starting lists', () => {
  it('ship as official on the sample, built from the sample company', () => {
    const lists = officialLists(EMPTY_LISTS, SAMPLE)
    const depts = lists.department!
    expect(depts).toMatchObject({ status: 'official', source: 'sample', validates: true })
    const dv = depts.values.find((v) => v.value === 'Design Verification')!
    expect(dv.parent).toBe('Silicon Engineering')
    expect(dv.attrs?.code).toBe('1130')
    // The ATS's old names are on the list, retired, pointing at the names that replaced them.
    expect(depts.values.find((v) => v.value === 'DV')).toMatchObject({
      retired: true,
      replacedBy: 'Design Verification',
      parent: 'Silicon Engineering',
    })
    const units = lists.businessUnit!.values
    expect(units.map((u) => u.value)).toContain('Silicon Engineering')
    expect(units.find((u) => u.value === 'Silicon Engineering')?.attrs).toMatchObject({ code: '1100' })
    expect(lists.location!.values.find((v) => v.value === 'Munich')?.attrs).toEqual({
      country: 'Germany',
      region: 'EMEA',
      jurisdiction: 'de',
      currency: 'EUR',
    })
    expect(lists.costCenter!.values.find((v) => v.value === '1110-SJC')).toMatchObject({
      parent: 'Architecture',
      attrs: { name: 'Architecture, San Jose' },
    })
    // Job families have no parent; every job function names its family, and the engineering
    // functions their place in the chip development flow.
    expect(lists.jobFamily!.values.map((v) => v.value).sort()).toEqual([...JOB_FAMILIES].sort())
    for (const v of lists.jobFamily!.values) expect(v.parent).toBeUndefined()
    const fns = lists.jobFunction!.values
    expect(fns).toHaveLength(38)
    for (const v of fns) expect(v.parent, v.value).toBe(FAMILY_OF_FUNCTION.get(v.value))
    expect(fns.find((v) => v.value === 'Design RTL')).toMatchObject({
      parent: 'Silicon Engineering',
      attrs: { stage: 'RTL design' },
    })
    // Packaging is left for Census to propose (docs/ANALYSES.md, 4.10).
    expect(fns.find((v) => v.value === 'Packaging')).toMatchObject({
      parent: 'Silicon Engineering',
      attrs: { stage: null },
    })
    expect(fns.find((v) => v.value === 'Software')?.attrs).toEqual({ stage: 'Software and firmware' })
    expect(fns.find((v) => v.value === 'Sales')?.attrs).toEqual({ stage: null })
    expect(lists.jobFamily!.values.find((v) => v.value === 'Silicon Engineering')?.attrs).toEqual({
      engineering: 'Yes',
    })
    expect(lists.jobFamily!.values.find((v) => v.value === 'Product & Test Operations')?.attrs).toEqual({
      engineering: 'No',
    })
    expect(listDef('jobFamily').parent).toBeUndefined()
    expect(listDef('jobFamily').attrs).toMatchObject([{ key: 'engineering', options: ['Yes', 'No'] }])
    expect(listDef('jobFunction')).toMatchObject({
      parent: 'jobFamily',
      attrs: [{ key: 'stage', label: 'Chip development stage' }],
    })
    expect(listDef('jobFunction').attrs[0].options).toHaveLength(11)
    expect(sampleLists()).toBe(sampleLists())
  })

  it('start Census vocabularies from the schema, always official', () => {
    const lists = officialLists(EMPTY_LISTS, OWN)
    expect(lists.caseCategory?.values[0]).toMatchObject({
      value: 'Payroll',
      builtIn: true,
      attrs: { process: 'PY-05', team: 'Payroll', responseHours: 8, resolutionHours: 48 },
    })
    expect(lists.terminationReason?.values.filter((v) => v.attrs?.type === 'Involuntary')).toHaveLength(4)
    expect(lists.level?.values.find((v) => v.value === 'M1')?.attrs).toEqual({
      label: 'Manager',
      track: 'Manager',
    })
    expect(lists.source?.values.find((v) => v.value === 'Sourced')?.attrs).toEqual({ sourceType: 'Outbound' })
    expect(lists.surveyProgram?.values).toHaveLength(censusValues('surveyProgram').length)
    // Your own lists need your data: proposed, not official.
    expect(lists.department).toBeNull()
  })

  it('propose your own lists from your data, with the parent most rows agree on', () => {
    const data = company()
    const eff = effectiveLists(EMPTY_LISTS, data, kinds(['employees']))
    const depts = eff.department
    expect(depts).toMatchObject({ status: 'proposed', source: 'data', validates: false })
    // Only the datasets you loaded: the sample requisitions' "DV" is not proposed.
    expect(depts.values.map((v) => v.value)).toEqual(['Design Verification', 'Firmware', 'Payroll'])
    expect(depts.values[0].parent).toBe('Silicon Engineering')
    expect(eff.costCenter.values.map((v) => [v.value, v.parent])).toEqual([
      ['CC-100', 'Design Verification'],
      ['CC-200', 'Firmware'],
      ['CC-300', 'Payroll'],
    ])
    // A proposed list checks nothing.
    expect(validationVocab(EMPTY_LISTS, kinds(['employees'])).refs.has('employees.department')).toBe(false)
    // Same inputs, same object.
    expect(effectiveLists(EMPTY_LISTS, data, kinds(['employees']))).toBe(eff)
  })

  it('leave the parent blank when no parent holds over half the rows', () => {
    const d = emptyDatasets()
    d.employees = [
      emp(1, { department: 'Shared', businessUnit: 'A' }),
      emp(2, { department: 'Shared', businessUnit: 'B' }),
    ]
    expect(listFromData(listDef('department'), d)[0].parent).toBeNull()
  })
})

describe('status rules', () => {
  it('keep saved lists as saved whatever data is loaded, checking the kind of data they were built for', () => {
    const data = company()
    const mine = kinds(['employees'])
    const eff = effectiveLists(EMPTY_LISTS, data, mine)
    const made = must(EMPTY_LISTS, eff, { kind: 'make-official', list: 'department' })
    expect(made.change.what).toBe('Made departments official.')
    const after = effectiveLists(made.state, data, mine)
    expect(after.department).toMatchObject({ status: 'official', source: 'saved', basis: 'data' })
    expect(validationVocab(made.state, mine).refs.get('requisitions.department')?.has('Firmware')).toBe(true)
    expect(applyEdit(made.state, after, { kind: 'make-official', list: 'department' }).ok).toBe(false)
    // Back on the sample, the saved list is still yours, but it checks nothing in the sample.
    const onSampleNow = officialLists(made.state, SAMPLE).department
    expect(onSampleNow).toMatchObject({
      source: 'saved',
      status: 'proposed',
      validates: false,
      paused: 'yours',
    })
    expect(validationVocab(made.state, SAMPLE).refs.has('employees.department')).toBe(false)
    expect(templateLists(made.state, SAMPLE)['employees.department']).toBeUndefined()
    // Unless you keep checking against it.
    const kept = must(made.state, effectiveLists(made.state, data, SAMPLE), {
      kind: 'make-official',
      list: 'department',
    })
    expect(kept.state.lists.department?.always).toBe(true)
    expect(kept.change.what).toBe('Kept checking the data against departments.')
    expect(officialLists(kept.state, SAMPLE).department).toMatchObject({
      status: 'official',
      validates: true,
    })
    expect(undoChange(kept.state, kept.change.id).lists).toEqual(made.state.lists)
  })

  it('stop checking your data against a list saved on the sample, until you keep it or rebuild it', () => {
    // Add a value to the sample's departments, then load your own employees.
    const sampleData = company()
    const r = must(EMPTY_LISTS, effectiveLists(EMPTY_LISTS, sampleData, SAMPLE), {
      kind: 'add',
      list: 'department',
      value: 'Photonics',
    })
    expect(r.state.lists.department?.basis).toBe('sample')
    expect(officialLists(r.state, SAMPLE).department).toMatchObject({ status: 'official', validates: true })
    const mine = kinds(['employees'])
    const yours = emptyDatasets()
    yours.employees = Array.from({ length: 40 }, (_, i) => emp(i + 1, { department: `Team ${i % 4}` }))
    const eff = effectiveLists(r.state, yours, mine)
    expect(eff.department).toMatchObject({ status: 'proposed', validates: false, paused: 'sample' })
    const vocab = validationVocab(r.state, mine)
    expect(vocab.refs.has('employees.department')).toBe(false)
    const q = computeQuality(yours, {}, undefined, { asOf: '2026-09-30', vocab })
    expect(q.fieldStats('employees.department').invalid).toBe(0)
    // Rebuild it from your data: it checks your data again.
    const rebuilt = must(r.state, eff, {
      kind: 'replace',
      list: 'department',
      values: listFromData(listDef('department'), yours, (k) => mine[k].kind === 'upload'),
      basis: 'data',
    })
    expect(effectiveLists(rebuilt.state, yours, mine).department).toMatchObject({
      status: 'official',
      validates: true,
    })
    expect(rebuilt.state.lists.department?.draft).toBeUndefined()
  })

  it('keep a proposed list proposed when you change it, until you make it official', () => {
    const data = company()
    const mine = kinds(['employees'])
    const eff = effectiveLists(EMPTY_LISTS, data, mine)
    const r = must(EMPTY_LISTS, eff, {
      kind: 'add',
      list: 'department',
      value: 'Photonics',
      parent: 'Corporate',
    })
    expect(r.state.lists.department?.draft).toBe(true)
    const draft = effectiveLists(r.state, data, mine)
    expect(draft.department).toMatchObject({ status: 'proposed', validates: false, paused: 'draft' })
    expect(draft.department.values.some((v) => v.value === 'Photonics')).toBe(true)
    expect(validationVocab(r.state, mine).refs.has('employees.department')).toBe(false)
    // Starting over keeps it a draft.
    const again = must(r.state, draft, {
      kind: 'replace',
      list: 'department',
      values: listFromData(listDef('department'), data),
      basis: 'data',
    })
    expect(again.state.lists.department?.draft).toBe(true)
    const made = must(r.state, draft, { kind: 'make-official', list: 'department' })
    expect(made.state.lists.department?.draft).toBeUndefined()
    expect(effectiveLists(made.state, data, mine).department).toMatchObject({
      status: 'official',
      validates: true,
    })
    expect(made.state.lists.department?.values.some((v) => v.value === 'Photonics')).toBe(true)
    // Undo takes it back to the draft.
    expect(undoChange(made.state, made.change.id).lists.department?.draft).toBe(true)
  })
})

describe('validation', () => {
  /** A department list with one retired value, and data with values on, retired and off the list. */
  function setup() {
    const d = emptyDatasets()
    d.employees = [
      emp(1),
      emp(2, { department: 'Old verification' }),
      emp(3, { department: 'Photonics' }),
      emp(4, { department: 'Photonics' }),
    ]
    d.requisitions = [req(1, { department: 'Photonics' })]
    d.cases = [
      { caseId: 'C1', category: 'Payroll' } as HrCase,
      { caseId: 'C2', category: 'Badge request' } as HrCase,
    ]
    const own = kinds(['employees', 'requisitions', 'cases'])
    let state: ListsState = EMPTY_LISTS
    let eff = effectiveLists(state, d, own)
    state = must(state, eff, {
      kind: 'replace',
      list: 'department',
      values: [{ value: 'Design Verification' }, { value: 'Old verification', retired: true }],
      basis: 'data',
    }).state
    eff = effectiveLists(state, d, own)
    return { d, own, state, eff }
  }

  it('counts each value not on an official list once, and still recognizes retired values', () => {
    const { d, own, state } = setup()
    const vocab = validationVocab(state, own)
    const versions = {}
    const q = computeQuality(d, versions, undefined, { asOf: '2026-09-30', vocab })
    expect(q.fieldStats('employees.department').invalid).toBe(2)
    expect(q.fieldRows('employees.department', 'invalid')).toEqual([2, 3])
    expect(q.fieldStats('requisitions.department').invalid).toBe(1)
    // Not on Census's case categories: counted once, by the official list.
    expect(q.fieldStats('cases.category').invalid).toBe(1)
    expect(q.vocab).toBe(vocab)
    // The same lists give the same index.
    expect(computeQuality(d, versions, undefined, { asOf: '2026-09-30', vocab })).toBe(q)
    // Without official lists nothing new is checked.
    expect(
      computeQuality(d, {}, undefined, { asOf: '2026-09-30' }).fieldStats('employees.department').invalid,
    ).toBe(0)
  })

  it('recognizes values added to a list', () => {
    const { d, own, state, eff } = setup()
    let next = must(state, eff, { kind: 'add', list: 'department', value: 'Photonics' }).state
    next = must(
      next,
      effectiveLists(next, d, own),
      { kind: 'add', list: 'caseCategory', value: 'Badge request' },
      2_000,
    ).state
    const q = computeQuality(d, {}, undefined, { asOf: '2026-09-30', vocab: validationVocab(next, own) })
    expect(q.fieldStats('employees.department').invalid).toBe(0)
    expect(q.fieldStats('cases.category').invalid).toBe(0)
  })

  it('finds values in the data that are not on the list, by field, and values no row uses', () => {
    const { d, eff } = setup()
    const a = analyzeList(eff.department, d)
    expect(a.notOnList.map((n) => [n.value, n.ref, n.rows])).toEqual([
      ['Photonics', 'employees.department', [2, 3]],
      ['Photonics', 'requisitions.department', [0]],
    ])
    expect(a.notOnListRows).toBe(3)
    expect(a.uses.get('Old verification')?.total).toBe(1)
    expect(a.notInData).toEqual([])
  })

  it('offers the active values of official lists to the templates', () => {
    const { own, state } = setup()
    const t = templateLists(state, own)
    expect(t['employees.department']).toEqual({
      name: 'Departments',
      label: 'Departments',
      values: ['Design Verification'],
    })
    expect(t['hiringPlan.department']).toBe(t['employees.department'])
    expect(t['employees.level'].values).toHaveLength(11)
    // Proposed lists offer nothing.
    expect(t['employees.jobFamily']).toBeUndefined()
  })
})

describe('editing', () => {
  const data = company()
  const own = kinds(['employees', 'requisitions'])
  const start = () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    let s = must(EMPTY_LISTS, eff, { kind: 'make-official', list: 'businessUnit' }).state
    s = must(s, effectiveLists(s, data, own), { kind: 'make-official', list: 'department' }, 2_000).state
    s = must(s, effectiveLists(s, data, own), { kind: 'make-official', list: 'costCenter' }, 3_000).state
    return { s, eff: effectiveLists(s, data, own) }
  }

  it('adds, refusing duplicates and parents that are not on the parent list', () => {
    const { s, eff } = start()
    expect(applyEdit(s, eff, { kind: 'add', list: 'department', value: ' firmware ' })).toEqual({
      ok: false,
      error: 'Departments already has "Firmware".',
    })
    expect(
      applyEdit(s, eff, { kind: 'add', list: 'department', value: 'Photonics', parent: 'Nowhere' }),
    ).toEqual({
      ok: false,
      error: '"Nowhere" is not on the business units list.',
    })
    const r = must(s, eff, {
      kind: 'add',
      list: 'department',
      value: '  Photonics  lab ',
      parent: 'Corporate',
    })
    expect(r.change.what).toBe('Added "Photonics lab" to departments.')
    const values = r.state.lists.department!.values.map((v) => v.value)
    expect(values).toEqual(['Design Verification', 'DV', 'Firmware', 'Payroll', 'Photonics lab'])
    expect(applyEdit(s, eff, { kind: 'add', list: 'level', value: 'L7' }).ok).toBe(false)
  })

  it('renames a job family and the job functions that name it; refuses to delete a family still a parent', () => {
    const d = company()
    const eff = effectiveLists(EMPTY_LISTS, d, own)
    let s = must(EMPTY_LISTS, eff, { kind: 'make-official', list: 'jobFamily' }).state
    s = must(s, effectiveLists(s, d, own), { kind: 'make-official', list: 'jobFunction' }, 2_000).state
    const e2 = effectiveLists(s, d, own)
    expect(e2.jobFunction.values.find((v) => v.value === 'Firmware')?.parent).toBe(
      'Systems & Software Engineering',
    )
    const r = must(
      s,
      e2,
      {
        kind: 'rename',
        list: 'jobFamily',
        from: 'Systems & Software Engineering',
        to: 'Systems Engineering',
      },
      3_000,
    )
    expect(r.change.lists).toEqual(['jobFamily', 'jobFunction'])
    expect(r.state.lists.jobFunction!.values.find((v) => v.value === 'Firmware')?.parent).toBe(
      'Systems Engineering',
    )
    const added = must(s, e2, { kind: 'add', list: 'jobFamily', value: 'Photonics' }, 4_000)
    const e3 = effectiveLists(added.state, d, own)
    const placed = must(
      added.state,
      e3,
      {
        kind: 'add',
        list: 'jobFunction',
        value: 'Optics',
        parent: 'Photonics',
        attrs: { stage: 'post-silicon validation and bring-up' },
      },
      5_000,
    )
    expect(placed.state.lists.jobFunction!.values.find((v) => v.value === 'Optics')).toMatchObject({
      parent: 'Photonics',
      attrs: { stage: 'Post-silicon validation and bring-up' },
    })
    expect(
      applyEdit(placed.state, effectiveLists(placed.state, d, own), {
        kind: 'delete',
        list: 'jobFamily',
        value: 'Photonics',
      }),
    ).toEqual({ ok: false, error: 'It is the job family of 1 job function. Move them first.' })
  })

  it('renames a value and the values that name it as their parent', () => {
    const { s, eff } = start()
    const r = must(s, eff, { kind: 'rename', list: 'department', from: 'Firmware', to: 'Embedded software' })
    expect(r.change.what).toBe('Renamed department "Firmware" to "Embedded software".')
    expect(r.change.lists).toEqual(['department', 'costCenter'])
    expect(r.state.lists.costCenter!.values.find((v) => v.value === 'CC-200')?.parent).toBe(
      'Embedded software',
    )
    expect(
      applyEdit(s, eff, { kind: 'rename', list: 'department', from: 'Firmware', to: 'payroll' }).ok,
    ).toBe(false)
    // Census's own values keep their names.
    const eff2 = effectiveLists(EMPTY_LISTS, data, own)
    expect(
      applyEdit(EMPTY_LISTS, eff2, { kind: 'rename', list: 'source', from: 'Referral', to: 'Referrals' }),
    ).toMatchObject({
      ok: false,
    })
  })

  it('retires and restores, moves, changes attributes and deletes only unused values you added', () => {
    const { s, eff } = start()
    let r = must(s, eff, {
      kind: 'retire',
      list: 'department',
      value: 'DV',
      replacedBy: 'Design Verification',
    })
    expect(r.change.what).toBe('Retired department "DV", replaced by "Design Verification".')
    expect(r.state.lists.department!.values.find((v) => v.value === 'DV')).toMatchObject({
      retired: true,
      replacedBy: 'Design Verification',
    })
    r = must(r.state, eff, { kind: 'restore', list: 'department', value: 'DV' })
    expect(r.state.lists.department!.values.find((v) => v.value === 'DV')?.retired).toBeUndefined()
    r = must(r.state, eff, {
      kind: 'move',
      list: 'department',
      value: 'Payroll',
      parent: 'Silicon Engineering',
    })
    expect(r.change.what).toBe('Moved department "Payroll" to Silicon Engineering.')
    r = must(r.state, eff, { kind: 'attrs', list: 'department', value: 'Payroll', attrs: { code: '9100' } })
    expect(r.state.lists.department!.values.find((v) => v.value === 'Payroll')?.attrs).toEqual({
      code: '9100',
    })
    expect(applyEdit(r.state, eff, { kind: 'delete', list: 'department', value: 'Payroll' })).toMatchObject({
      ok: false,
      error: 'Only values you added can be deleted. Retire it instead.',
    })
    const added = must(r.state, eff, { kind: 'add', list: 'department', value: 'Photonics' })
    const used = applyEdit(
      added.state,
      eff,
      { kind: 'delete', list: 'department', value: 'Photonics' },
      {
        usage: () => 3,
      },
    )
    expect(used).toMatchObject({ ok: false })
    const del = must(added.state, eff, { kind: 'delete', list: 'department', value: 'Photonics' })
    expect(del.state.lists.department!.values.some((v) => v.value === 'Photonics')).toBe(false)
    // Census sets the attributes of its own values.
    expect(
      applyEdit(EMPTY_LISTS, eff, {
        kind: 'attrs',
        list: 'caseCategory',
        value: 'Payroll',
        attrs: { team: 'Finance' },
      }),
    ).toMatchObject({ ok: false })
    // A level's label can change; its track is Census's.
    const lvl = must(EMPTY_LISTS, eff, {
      kind: 'attrs',
      list: 'level',
      value: 'L4',
      attrs: { label: 'Senior engineer' },
    })
    expect(lvl.state.lists.level!.values.find((v) => v.value === 'L4')?.attrs).toEqual({
      label: 'Senior engineer',
      track: 'Individual contributor',
    })
  })
})

describe('change log and undo', () => {
  const data = company()
  const own = kinds(['employees'])

  it('undoes a change back to how the list was, including a list that was not saved', () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    const a = must(EMPTY_LISTS, eff, { kind: 'add', list: 'department', value: 'Photonics' })
    expect(a.state.lists.department).toBeDefined()
    const undone = undoChange(a.state, a.change.id, 'Jamie', 5_000)
    expect(undone.lists.department).toBeUndefined()
    expect(undone.log[0]).toMatchObject({
      what: 'Undid: Added "Photonics" to departments.',
      by: 'Jamie',
      undoes: a.change.id,
    })
    // The undo can be undone: the change comes back.
    const redo = undoChange(undone, undone.log[0].id, null, 6_000)
    expect(redo.lists.department?.values.some((v) => v.value === 'Photonics')).toBe(true)
    expect(redo.log[0].what).toBe('Restored: Added "Photonics" to departments.')
  })

  it('undoes only while no later change touched the same lists', () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    const a = must(EMPTY_LISTS, eff, { kind: 'add', list: 'department', value: 'Photonics' })
    const b = must(
      a.state,
      effectiveLists(a.state, data, own),
      { kind: 'add', list: 'jobFunction', value: 'Research' },
      2_000,
    )
    expect(canUndo(b.state, a.change.id)).toBe(true)
    const c = must(
      b.state,
      effectiveLists(b.state, data, own),
      { kind: 'add', list: 'department', value: 'Optics' },
      3_000,
    )
    expect(canUndo(c.state, a.change.id)).toBe(false)
    expect(undoChange(c.state, a.change.id)).toBe(c.state)
    // Without an id, the latest change that can be undone.
    const latest = undoChange(c.state)
    expect(latest.lists.department?.values.some((v) => v.value === 'Optics')).toBe(false)
    expect(latest.lists.department?.values.some((v) => v.value === 'Photonics')).toBe(true)
  })

  it('undoes a rename everywhere it reached', () => {
    const eff0 = effectiveLists(EMPTY_LISTS, data, own)
    let s = must(EMPTY_LISTS, eff0, { kind: 'make-official', list: 'department' }).state
    s = must(s, effectiveLists(s, data, own), { kind: 'make-official', list: 'costCenter' }, 2_000).state
    const r = must(
      s,
      effectiveLists(s, data, own),
      { kind: 'rename', list: 'department', from: 'Firmware', to: 'Embedded' },
      3_000,
    )
    const back = undoChange(r.state, r.change.id)
    expect(back.lists).toEqual(s.lists)
  })

  it('logs several changes as one and keeps the log bounded', () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    const r = applyEdits(
      EMPTY_LISTS,
      eff,
      [
        { kind: 'add', list: 'department', value: 'A' },
        { kind: 'add', list: 'department', value: 'a' },
        { kind: 'add', list: 'jobFunction', value: 'Research' },
      ],
      'Imported.',
    )
    expect(r.applied).toHaveLength(2)
    expect(r.rejected[0].error).toBe('Departments already has "A".')
    expect(r.change?.lists).toEqual(['department', 'jobFunction'])
    expect(undoChange(r.state, r.change!.id).lists).toEqual({})
    let s: ListsState = EMPTY_LISTS
    for (let i = 0; i < MAX_LOG + 5; i++)
      s = undoChange(must(s, eff, { kind: 'add', list: 'jobFunction', value: `F${i}` }, i).state)
    expect(s.log).toHaveLength(MAX_LOG)
  })
})

describe('spellings that differ only in case or spacing', () => {
  function messy() {
    const d = emptyDatasets()
    d.employees = [
      emp(1, { department: 'Firmware' }),
      emp(2, { department: 'Firmware' }),
      emp(3, { department: 'firmware' }),
      emp(4, { department: 'FW' }),
      emp(5, { department: 'Payroll  Ops' }),
      emp(6, { department: 'Payroll  Ops' }),
      emp(7, { department: 'Payroll Ops' }),
    ]
    return d
  }

  it('are one value of a list built from data: the spelling most rows use', () => {
    const values = listFromData(listDef('department'), messy()).map((v) => v.value)
    expect(values).toEqual(['Firmware', 'FW', 'Payroll  Ops'])
  })

  it('round-trip exactly through this browser and the settings file', () => {
    const d = messy()
    const mine = kinds(['employees'])
    const made = must(EMPTY_LISTS, effectiveLists(EMPTY_LISTS, d, mine), {
      kind: 'make-official',
      list: 'department',
    })
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    expect(saveLists(made.state, storage)).toBe(true)
    const loaded = loadLists(storage)
    expect(loaded).toEqual(made.state)
    const section = listsFileSection(made.state)
    const imported = importListsSection(JSON.parse(JSON.stringify(section)), EMPTY_LISTS)
    if (!imported.ok) throw new Error(imported.error)
    expect(imported.state.lists.department).toEqual(made.state.lists.department)
    // The rows on the list stay recognized after the reload; the other spellings never were.
    const before = validationVocab(made.state, mine).refs.get('employees.department')!
    const after = validationVocab(loaded, mine).refs.get('employees.department')!
    expect([...after]).toEqual([...before])
    expect(after.has('Payroll  Ops')).toBe(true)
    expect(after.has('firmware')).toBe(false)
    // A file that does hold two such spellings keeps the first.
    const dup = sanitizeListsState({
      lists: {
        department: { values: [{ value: 'Firmware' }, { value: ' firmware ' }], basis: 'data', at: 'x' },
      },
    })
    expect(dup.lists.department?.values.map((v) => v.value)).toEqual(['Firmware'])
  })

  it('are refused as a second value when you add or rename', () => {
    const d = messy()
    const mine = kinds(['employees'])
    const made = must(EMPTY_LISTS, effectiveLists(EMPTY_LISTS, d, mine), {
      kind: 'make-official',
      list: 'department',
    })
    const eff = effectiveLists(made.state, d, mine)
    expect(applyEdit(made.state, eff, { kind: 'add', list: 'department', value: 'payroll ops' })).toEqual({
      ok: false,
      error: 'Departments already has "Payroll  Ops".',
    })
    expect(
      applyEdit(made.state, eff, { kind: 'rename', list: 'department', from: 'FW', to: 'PAYROLL OPS' }).ok,
    ).toBe(false)
  })
})

describe('undo with the data change made alongside', () => {
  it('takes the list and the data back together, and brings both back on undo of the undo', () => {
    const data = company()
    const mine = kinds(['employees'])
    const made = must(EMPTY_LISTS, effectiveLists(EMPTY_LISTS, data, mine), {
      kind: 'make-official',
      list: 'department',
    })
    const renamed = must(
      made.state,
      effectiveLists(made.state, data, mine),
      { kind: 'rename', list: 'department', from: 'Payroll', to: 'Payroll & Benefits' },
      2_000,
    )
    const mapped = addMapping(
      EMPTY_REFERENCE,
      { kind: 'rename', ref: 'employees.department', from: ['Payroll'], to: 'Payroll & Benefits' },
      null,
      2_000,
    )
    if (!mapped.ok) throw new Error(mapped.error)
    const audit = mapped.state.audit[0].id
    const lists = withReference(renamed.state, renamed.change.id, audit)
    expect(lists.log[0].reference).toBe(audit)

    const undone = undoBoth(lists, mapped.state, renamed.change.id, 'Jamie', 3_000)!
    expect(undone.reference.mappings).toEqual([])
    expect(undone.lists.lists).toEqual(made.state.lists)
    // The undo records the data change it made, so undoing it restores both.
    const undoEntry = undone.lists.log[0]
    expect(undoEntry.reference).toBe(undone.reference.audit[0].id)
    const redone = undoBoth(undone.lists, undone.reference, undoEntry.id, null, 4_000)!
    expect(redone.reference.mappings.map((m) => m.id)).toEqual([mapped.mapping.id])
    expect(redone.lists.lists).toEqual(lists.lists)
  })

  it('changes neither when a later change to the list stands in the way', () => {
    const data = company()
    const mine = kinds(['employees'])
    const made = must(EMPTY_LISTS, effectiveLists(EMPTY_LISTS, data, mine), {
      kind: 'make-official',
      list: 'department',
    })
    const renamed = must(made.state, effectiveLists(made.state, data, mine), {
      kind: 'rename',
      list: 'department',
      from: 'Payroll',
      to: 'Payroll & Benefits',
    })
    const mapped = addMapping(EMPTY_REFERENCE, {
      kind: 'rename',
      ref: 'employees.department',
      from: ['Payroll'],
      to: 'Payroll & Benefits',
    })
    if (!mapped.ok) throw new Error(mapped.error)
    const lists = withReference(renamed.state, renamed.change.id, mapped.state.audit[0].id)
    const later = must(lists, effectiveLists(lists, data, mine), {
      kind: 'add',
      list: 'department',
      value: 'Photonics',
    })
    expect(referenceToUndo(later.state, mapped.state, renamed.change.id)).toEqual({
      ok: false,
      reference: null,
    })
    expect(undoBoth(later.state, mapped.state, renamed.change.id)).toBeNull()
    // A mapping you already removed in Categories & mapping stays removed; the list still undoes.
    const plain = undoBoth(lists, EMPTY_REFERENCE, renamed.change.id)!
    expect(plain.reference).toBe(EMPTY_REFERENCE)
    expect(plain.lists.lists).toEqual(made.state.lists)
  })
})

describe('persistence and the settings file', () => {
  const data = company()
  const own = kinds(['employees'])

  it('saves and loads, checking what it reads', () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    const r = must(EMPTY_LISTS, eff, { kind: 'add', list: 'department', value: 'Photonics' })
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    saveLists(r.state, storage)
    expect(loadLists(storage)).toEqual(r.state)
    expect(loadLists({ getItem: () => '{oops', setItem: () => undefined })).toEqual(EMPTY_LISTS)
    expect(
      loadLists({
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => undefined,
      }),
    ).toEqual(EMPTY_LISTS)
    // Unknown lists and bad values are dropped; Census's values come back to its lists.
    const clean = sanitizeListsState({
      lists: {
        nope: { values: [] },
        department: { values: [{ value: 'A' }, { value: 'a' }, { value: '' }, 7], basis: 'data', at: 'x' },
        leaveReason: {
          values: [{ value: 'Parental', retired: true }, { value: 'Made up' }],
          basis: 'census',
          at: 'x',
        },
      },
      log: [{ id: 'x', at: 'y', what: 'z', ops: [{ op: 'explode', list: 'department' }] }],
    })
    expect(clean.lists.department?.values).toEqual([{ value: 'A', parent: null }])
    const leave = clean.lists.leaveReason!.values
    expect(leave.some((v) => v.value === 'Made up')).toBe(false)
    expect(leave.find((v) => v.value === 'Parental')).toMatchObject({ retired: true, builtIn: true })
    expect(leave).toHaveLength(9)
    expect(clean.log).toEqual([])
  })

  it('round-trips through the settings file', async () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    let s = must(EMPTY_LISTS, eff, { kind: 'make-official', list: 'department' }).state
    s = must(
      s,
      effectiveLists(s, data, own),
      { kind: 'add', list: 'department', value: 'Photonics', parent: 'Corporate' },
      2_000,
    ).state
    expect(listsFileSection(EMPTY_LISTS)).toBeUndefined()
    const blob = settingsBlob(
      DEFAULT_SETTINGS,
      new Date('2026-10-01T00:00:00Z'),
      undefined,
      listsFileSection(s),
    )
    const parsed = parseSettingsFile(await blob.text(), DEFAULT_SETTINGS, '2026-10-01')
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.listsSection).toBeDefined()
    const r = importListsSection(parsed.listsSection, EMPTY_LISTS, 'Jamie', 9_000)
    if (!r.ok) throw new Error(r.error)
    expect(r.state.lists).toEqual(s.lists)
    expect(r.changed).toEqual(['department'])
    expect(r.state.log[0].what).toBe('Loaded 1 official list from a settings file.')
    // Undo puts the lists back.
    expect(undoChange(r.state).lists).toEqual({})
    // The same file again changes nothing.
    const again = importListsSection(parsed.listsSection, r.state)
    expect(again).toMatchObject({ ok: true, changed: [], state: r.state })
    // A file with only lists in it is still a settings file.
    const onlyLists = JSON.stringify({
      kind: 'census-settings',
      version: 1,
      exportedAt: 'x',
      settings: {},
      lists: listsFileSection(s),
    })
    expect(parseSettingsFile(onlyLists, DEFAULT_SETTINGS, '2026-10-01').ok).toBe(true)
  })
})

describe('official parents', () => {
  it('come from an official list only', () => {
    const data = company()
    const eff = effectiveLists(EMPTY_LISTS, data, kinds(['employees']))
    expect(officialParents(eff.department).size).toBe(0)
    const sample = officialLists(EMPTY_LISTS, SAMPLE).department!
    expect(officialParents(sample).get('Firmware')).toBe('Systems & Software')
  })
})
