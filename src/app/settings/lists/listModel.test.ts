import { describe, expect, it } from 'vitest'
import { analyzeLists, applyEdit, EMPTY_LISTS, effectiveLists, type SourceKinds } from '@/data/lists'
import { emp, emptyDatasets, req } from '@/data/quality/test-fixtures'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import {
  checksText,
  offListItems,
  offListNote,
  originText,
  parentFills,
  pausedNote,
  pauseText,
  pickerItems,
  proposals,
  proposedStageText,
  soleField,
  statusText,
  valueRows,
  valuesText,
  withProposedStages,
} from './listModel'

const kinds = (uploads: DatasetKey[] = []): SourceKinds =>
  Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: uploads.includes(k) ? 'upload' : 'sample' }]),
  ) as SourceKinds

function data() {
  const d = emptyDatasets()
  d.employees = [
    emp(1, { department: 'Design Verification', costCenter: 'CC-100' }),
    emp(2, { department: 'Design Verification', costCenter: 'CC-101' }),
    emp(3, { department: 'Firmware', businessUnit: 'Systems', costCenter: 'CC-200' }),
  ]
  d.requisitions = [req(1, { department: 'Design verif.' })]
  return d
}

describe('Official lists view model', () => {
  it('summarizes each list for the picker', () => {
    const d = data()
    const own = kinds(['employees'])
    const lists = effectiveLists(EMPTY_LISTS, d, own)
    const items = pickerItems(lists, analyzeLists(lists, d))
    const dept = items.find((i) => i.id === 'department')!
    // Requisitions are still the sample: their "DV verif" is in the data but not on the list.
    expect(dept).toMatchObject({ official: false, values: 2, retired: 0, notOnList: 1, notOnListRows: 1 })
    expect(valuesText({ values: 24, retired: 2 })).toBe('24 values, 2 retired')
    expect(items.map((i) => i.id)).toHaveLength(19)
  })

  it('builds table rows with parent, rows in data, status and a department’s cost centers', () => {
    const d = data()
    const own = kinds(['employees', 'requisitions'])
    let state = EMPTY_LISTS
    const eff = effectiveLists(state, d, own)
    for (const list of ['department', 'costCenter'] as const) {
      const r = applyEdit(state, effectiveLists(state, d, own), { kind: 'make-official', list })
      if (!r.ok) throw new Error(r.error)
      state = r.state
    }
    const lists = effectiveLists(state, d, own)
    const rows = valueRows(lists.department, analyzeLists(lists, d).department, lists)
    expect(rows.find((r) => r.value === 'Design Verification')).toMatchObject({
      parent: 'Silicon Engineering',
      rows: 2,
      status: 'Active',
      costCenters: 'CC-100, CC-101',
    })
    expect(eff.department.status).toBe('proposed')
    expect(statusText({ value: 'DV', retired: true, replacedBy: 'Design Verification' })).toBe(
      'Retired, now Design Verification',
    )
    expect(statusText({ value: 'X', added: true })).toBe('Active, added by you')
  })

  it('lists values not on the list with the value each likely means, and what the data proposes', () => {
    const d = data()
    const lists = effectiveLists(EMPTY_LISTS, d, kinds(['employees']))
    const a = analyzeLists(lists, d)
    const items = offListItems(lists.department, a.department)
    expect(items).toEqual([
      {
        value: 'Design verif.',
        ref: 'requisitions.department',
        field: 'Requisitions: Department',
        rows: [0],
        suggestion: 'Design Verification',
        canMap: true,
      },
    ])
    expect(offListNote(lists.department, items)).toBe(
      '1 value in 1 row. Once the list is official they will count as not recognized.',
    )
    expect(proposals(lists.department, d).map((v) => [v.value, v.parent])).toEqual([
      ['Design verif.', 'Silicon Engineering'],
    ])
  })

  it('says where a list came from and what it checks', () => {
    const d = data()
    const sample = effectiveLists(EMPTY_LISTS, d, kinds())
    expect(originText(sample.department, EMPTY_LISTS)).toBe(
      'The sample company’s list, official so you can see the checks at work.',
    )
    expect(checksText(sample.department)).toBe(
      'Checks Employees, Requisitions, Job changes, Hiring plan and Headcount and cost budget.',
    )
    expect(originText(sample.level, EMPTY_LISTS)).toBe('Census reads these exact values.')
    const own = kinds(['employees'])
    const mine = effectiveLists(EMPTY_LISTS, d, own)
    expect(checksText(mine.department)).toBe(
      'Will check Employees, Requisitions, Job changes, Hiring plan and Headcount and cost budget once official.',
    )
    // Saved on the sample, then your own data is loaded: worth rebuilding.
    const r = applyEdit(
      EMPTY_LISTS,
      sample,
      { kind: 'add', list: 'department', value: 'Photonics' },
      { by: 'Jamie' },
    )
    if (!r.ok) throw new Error(r.error)
    const after = effectiveLists(r.state, d, own)
    expect(after.department).toMatchObject({ status: 'proposed', validates: false, paused: 'sample' })
    expect(pauseText(after.department)).toMatch(/^You saved this list while Census showed the sample company/)
    expect(checksText(after.department)).toBe(
      'Checks Employees, Requisitions, Job changes, Hiring plan and Headcount and cost budget while the sample is loaded.',
    )
    expect(effectiveLists(r.state, d, kinds()).department.paused).toBeUndefined()
    const off = offListItems(after.department, analyzeLists(after, d).department)
    expect(offListNote(after.department, off)).toMatch(
      /The list checks nothing in the data loaded now, so they do not count as not recognized\.$/,
    )
    // Changes to a proposed list are a draft until it is made official.
    const draft = applyEdit(EMPTY_LISTS, mine, { kind: 'add', list: 'department', value: 'Photonics' })
    if (!draft.ok) throw new Error(draft.error)
    const drafted = effectiveLists(draft.state, d, own).department
    expect(drafted.paused).toBe('draft')
    expect(originText(drafted, draft.state)).toMatch(
      /^Proposed from your data, with your changes\. Last changed/,
    )
    expect(pauseText(drafted)).toBe(
      'Your changes are kept. The list stays proposed and checks nothing until you make it official.',
    )
    expect(originText(after.department, r.state)).toMatch(
      /^Saved by you, starting from the sample company’s list\. Last changed .+ by Jamie\.$/,
    )
  })
})

describe('the Rows count', () => {
  it('opens exactly the rows it counts, and only when one field holds them all', () => {
    const d = data()
    d.requisitions = [req(1, { department: 'Design Verification' }), req(2, { department: 'Firmware' })]
    d.employees.push(emp(4, { department: 'Payroll', costCenter: 'CC-300' }))
    const own = kinds(['employees', 'requisitions'])
    const r = applyEdit(EMPTY_LISTS, effectiveLists(EMPTY_LISTS, d, own), {
      kind: 'make-official',
      list: 'department',
    })
    if (!r.ok) throw new Error(r.error)
    const lists = effectiveLists(r.state, d, own)
    const a = analyzeLists(lists, d).department
    const rows = valueRows(lists.department, a, lists)
    let drilled = 0
    for (const row of rows) {
      const sole = soleField(a.uses.get(row.value))
      if (sole) {
        // The records opened are the number shown.
        expect(sole.rows.length, row.value).toBe(row.rows)
        drilled++
      }
    }
    expect(drilled).toBe(1)
    // Payroll is used in one field only; the others in Employees and Requisitions.
    expect(soleField(a.uses.get('Payroll'))).toEqual({ ref: 'employees.department', rows: [3] })
    expect(soleField(a.uses.get('Design Verification'))).toBeNull()
    expect(soleField(undefined)).toBeNull()
  })

  it('says when a change leaves a list checking nothing', () => {
    const def = effectiveLists(EMPTY_LISTS, data(), kinds()).department.def
    expect(pausedNote(def, null)).toBeUndefined()
    expect(pausedNote(def, 'draft')).toBe(
      'The departments list stays proposed: it checks nothing until you make it official.',
    )
    expect(pausedNote(def, 'sample')).toBe(
      'The departments list stays proposed: it checks nothing in the data loaded now until you keep checking against it.',
    )
  })
})

describe('Fill parents from the data', () => {
  it('proposes the family most rows name for each function with none, and nothing where no family has over half', () => {
    const d = emptyDatasets()
    d.employees = [
      emp(1, { jobFamily: 'Silicon Engineering', jobFunction: 'Design RTL' }),
      emp(2, { jobFamily: 'Silicon Engineering', jobFunction: 'Design RTL' }),
      emp(3, { jobFamily: 'Corporate', jobFunction: 'Design RTL' }),
      emp(4, { jobFamily: 'Corporate', jobFunction: 'Legal' }),
      emp(5, { jobFamily: 'Go-to-Market', jobFunction: 'Legal' }),
      emp(6, { jobFamily: 'Corporate', jobFunction: 'Facilities' }),
    ]
    const own = kinds(['employees'])
    const lists = effectiveLists(EMPTY_LISTS, d, own)
    // A list saved without parents (as a version 1 list of job functions is after the migration).
    const made = applyEdit(EMPTY_LISTS, lists, { kind: 'make-official', list: 'jobFunction' })
    if (!made.ok) throw new Error(made.error)
    const state = {
      ...made.state,
      lists: {
        jobFunction: {
          ...made.state.lists.jobFunction!,
          values: made.state.lists.jobFunction!.values.map((v) =>
            v.value === 'Facilities' ? v : { ...v, parent: null },
          ),
        },
      },
    }
    const after = effectiveLists(state, d, own)
    expect(parentFills(after.jobFunction, d)).toEqual([
      { value: 'Design RTL', parent: 'Silicon Engineering' },
    ])
    // A list with no parent offers nothing.
    expect(parentFills(after.jobFamily, d)).toEqual([])
  })
})

describe('Job functions with a proposed stage', () => {
  const row = (value: string, stage: string | null, retired = false) =>
    ({
      value,
      parent: 'Silicon Engineering',
      rows: 3,
      status: 'Active',
      'attr:stage': stage,
      item: { value, retired },
    }) as unknown as Parameters<typeof withProposedStages>[0][number]

  it('shows the proposed stage, marked Proposed, only where none is saved', () => {
    const stageFor = (fn: string) =>
      fn === 'Packaging'
        ? { stage: 'signoff' as const, source: 'proposed' }
        : fn === 'Design RTL'
          ? { stage: 'rtl' as const, source: 'saved' }
          : null
    const out = withProposedStages(
      [row('Packaging', null), row('Design RTL', 'RTL design'), row('Widgets', null), row('Old', null, true)],
      stageFor,
    )
    expect(out.map((r) => r['attr:stage'])).toEqual([
      'Proposed: Signoff and tape-out',
      'RTL design',
      null,
      null,
    ])
    expect(proposedStageText('verification')).toBe('Proposed: Design verification')
  })
})
