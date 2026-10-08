import { describe, expect, it } from 'vitest'
import { canUndo, EMPTY_LISTS } from './edit'
import { JOB_LISTS, LISTS_MIGRATION_DROPPED, LISTS_MIGRATION_WHAT, migrateListsV1 } from './migrate'
import { importListsSection, LISTS_KEY, LISTS_STORE_VERSION, loadLists, saveLists } from './persist'
import type { ListChange, ListsState, SavedList } from './types'

const AT = '2026-09-01T10:00:00.000Z'
const NOW = Date.parse('2026-10-07T09:00:00.000Z')

/** A change-log entry as version 1 saved it. */
const change = (id: string, lists: ListChange['lists']): ListChange => ({
  id,
  at: AT,
  by: null,
  what: `Change ${id}.`,
  lists,
  ops: [
    {
      op: 'add',
      list: lists[0],
      value: { value: `V${id}` },
      index: 0,
    },
  ],
})

/** The raw JSON a version 1 browser kept under `census:lists`. */
function v1(lists: Record<string, unknown>, log: ListChange[] = [], version: number | null = 1) {
  return JSON.stringify({ ...(version == null ? {} : { version }), lists, log })
}

const memory = (raw: string | null) => {
  const store = new Map<string, string>()
  if (raw != null) store.set(LISTS_KEY, raw)
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  }
}

const FROM_SAMPLE = {
  jobFunction: { values: [{ value: 'Engineering' }, { value: 'G&A' }], basis: 'sample', at: AT },
  jobFamily: {
    values: [
      { value: 'Design verification', parent: 'Engineering' },
      { value: 'FP&A', parent: 'G&A' },
    ],
    basis: 'sample',
    at: AT,
  },
  department: { values: [{ value: 'Firmware', parent: 'Systems' }], basis: 'sample', at: AT },
}

const FROM_DATA = {
  jobFunction: {
    values: [{ value: 'Engineering' }, { value: 'Operations' }],
    basis: 'data',
    at: AT,
    always: true,
  },
  jobFamily: {
    values: [
      { value: 'Design verification', parent: 'Engineering' },
      { value: 'Test engineering', parent: 'Operations' },
    ],
    basis: 'file',
    at: AT,
    draft: true,
  },
}

describe('lists saved before job families contained job functions (version 1)', () => {
  it('drops job lists copied from the old sample company, and keeps every other list', () => {
    const s = memory(v1(FROM_SAMPLE))
    const state = loadLists(s, NOW)
    expect(state.lists.jobFamily).toBeUndefined()
    expect(state.lists.jobFunction).toBeUndefined()
    expect(state.lists.department?.values).toEqual([{ value: 'Firmware', parent: 'Systems' }])
  })

  it('keeps job lists built from your data or a file, without family parents and with blank function parents', () => {
    const state = loadLists(memory(v1(FROM_DATA)), NOW)
    expect(state.lists.jobFamily).toMatchObject({ basis: 'file', draft: true })
    expect(state.lists.jobFamily?.values).toEqual([
      { value: 'Design verification' },
      { value: 'Test engineering' },
    ])
    expect(state.lists.jobFunction).toMatchObject({ basis: 'data', always: true })
    expect(state.lists.jobFunction?.values).toEqual([
      { value: 'Engineering', parent: null },
      { value: 'Operations', parent: null },
    ])
  })

  it('adds one entry to the change log that cannot be undone, and stops earlier job list changes being undone', () => {
    const log = [change('b', ['department']), change('a', ['jobFamily'])]
    const state = loadLists(memory(v1(FROM_DATA, log)), NOW)
    expect(state.log).toHaveLength(3)
    const [entry] = state.log
    expect(entry).toMatchObject({ what: LISTS_MIGRATION_WHAT, lists: [...JOB_LISTS], ops: [], by: 'Census' })
    expect(entry.at).toBe(new Date(NOW).toISOString())
    expect(canUndo(state, entry.id)).toBe(false)
    expect(canUndo(state, 'a')).toBe(false)
    expect(canUndo(state, 'b')).toBe(true)
  })

  it('runs once: the migrated state is saved at once as version 2', () => {
    const s = memory(v1(FROM_DATA, [change('a', ['jobFunction'])], null))
    const first = loadLists(s, NOW)
    expect(JSON.parse(s.store.get(LISTS_KEY) ?? '{}').version).toBe(LISTS_STORE_VERSION)
    const again = loadLists(s, NOW + 1000)
    expect(again).toEqual(first)
    expect(again.log.filter((c) => c.what === LISTS_MIGRATION_WHAT)).toHaveLength(1)
  })

  it('leaves a version 2 state alone', () => {
    const state: ListsState = {
      lists: {
        jobFunction: {
          values: [{ value: 'Design RTL', parent: 'Silicon Engineering', attrs: { stage: 2 } }],
          basis: 'sample',
          at: AT,
        },
      },
      log: [change('a', ['jobFunction'])],
    }
    const s = memory(null)
    saveLists(state, s)
    expect(loadLists(s, NOW)).toEqual(state)
  })

  it('adds nothing to the log when the state had no job list and no change to one', () => {
    const raw = v1({ department: FROM_SAMPLE.department }, [change('b', ['department'])])
    const state = loadLists(memory(raw), NOW)
    expect(state.log.map((c) => c.id)).toEqual(['b'])
    expect(migrateListsV1(EMPTY_LISTS, NOW).state).toBe(EMPTY_LISTS)
  })

  it('migrates a version 1 settings file section the same way, saying what was left out', () => {
    const fromSample = importListsSection({ version: 1, lists: FROM_SAMPLE }, EMPTY_LISTS, null, NOW)
    if (!fromSample.ok) throw new Error(fromSample.error)
    expect(fromSample.changed).toEqual(['department'])
    expect(fromSample.state.lists.jobFamily).toBeUndefined()
    expect(fromSample.summary).toBe(`Official lists: replaced departments. ${LISTS_MIGRATION_DROPPED}`)
    expect(LISTS_MIGRATION_DROPPED).toBe(
      "The file's job family and job function lists were copied from the old sample company, so they were left out.",
    )

    const fromData = importListsSection({ version: 1, lists: FROM_DATA }, EMPTY_LISTS, null, NOW)
    if (!fromData.ok) throw new Error(fromData.error)
    expect(fromData.state.lists.jobFunction?.values.every((v) => v.parent === null)).toBe(true)
    expect(fromData.summary).not.toMatch(/left out/)

    // A version 2 file keeps sample-based job lists as they are.
    const now: Partial<Record<string, SavedList>> = {
      jobFunction: {
        values: [{ value: 'Design RTL', parent: 'Silicon Engineering' }],
        basis: 'sample',
        at: AT,
      },
    }
    const v2 = importListsSection({ version: 2, lists: now }, EMPTY_LISTS, null, NOW)
    if (!v2.ok) throw new Error(v2.error)
    expect(v2.state.lists.jobFunction?.values[0].parent).toBe('Silicon Engineering')
  })
})
