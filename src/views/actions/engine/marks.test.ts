/**
 * Marks v2 (docs/ACTION-CENTER-AUDIT.md 4.5 and part 6, Marks): a handled roll-up reopens when its
 * fingerprint changes; v1 values are read; broken entries are dropped; a throwing storage is
 * survived; an HR case's key is hashed, so no employee relations case ID is stored; the "by" name
 * and the marks file; and `census:actions` stays described in the storage keys list.
 */
import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/dev/storageKeys'
import {
  hashKey,
  isOpen,
  loadState,
  type MarkTarget,
  markKeyOf,
  marksFile,
  mergeMarks,
  parseMarks,
  parseState,
  readMarksFile,
  STORAGE_KEY,
  type StorageLike,
  saveMarks,
  serializeState,
  statusOf,
  withHandled,
  withReopened,
  withSnoozed,
} from './marks'

const NOW = Date.parse('2026-10-07T12:00:00Z')
const target = (id: string, fingerprint?: string): MarkTarget => ({
  markKey: markKeyOf(id),
  item: fingerprint ? { fingerprint } : {},
})

describe('a handled roll-up reopens when its fingerprint changes', () => {
  it('stays handled while the content is the same, and opens again once it changes', () => {
    const before = target('talent:training-overdue:E10039', '3:72cae76a')
    const marks = withHandled({}, [before], NOW)
    expect(statusOf(before, marks, NOW).state).toBe('handled')
    // A new overdue course next month: another fingerprint.
    const after = target('talent:training-overdue:E10039', '4:9b1c0d22')
    const s = statusOf(after, marks, NOW)
    expect(s).toEqual({ state: 'open', changedSince: marks[before.markKey].at })
    expect(isOpen(after, marks, NOW)).toBe(true)
    // A snoozed roll-up that changes comes back before the snooze ends.
    const snoozed = withSnoozed({}, [before], NOW, 7)
    expect(statusOf(before, snoozed, NOW).state).toBe('snoozed')
    expect(statusOf(after, snoozed, NOW).state).toBe('open')
  })

  it('judges an item without a fingerprint (or a mark without one) by its mark alone', () => {
    const plain = target('recruiting:review:APP-1')
    const marks = withHandled({}, [plain], NOW)
    expect(statusOf(plain, marks, NOW).state).toBe('handled')
    // A version 1 mark has no fingerprint: it holds until the item is reopened.
    const v1 = parseMarks(
      JSON.stringify({
        version: 1,
        marks: { 'hrbp:span:E1': { state: 'handled', at: '2026-10-01T00:00:00Z' } },
      }),
      NOW,
    )
    expect(statusOf(target('hrbp:span:E1', '5:abc'), v1, NOW).state).toBe('handled')
    expect(statusOf('hrbp:span:E1', withReopened(v1, ['hrbp:span:E1']), NOW).state).toBe('open')
  })
})

describe('marks v2 storage', () => {
  it('reads version 1 and version 2, drops broken entries, old marks and ended snoozes', () => {
    const v1 = JSON.stringify({
      version: 1,
      marks: {
        ok: { state: 'handled', at: '2026-10-01T00:00:00Z' },
        snoozed: { state: 'snoozed', at: '2026-10-06T00:00:00Z', until: '2026-10-13T00:00:00Z' },
        ended: { state: 'snoozed', at: '2026-09-01T00:00:00Z', until: '2026-09-08T00:00:00Z' },
        old: { state: 'handled', at: '2024-01-01T00:00:00Z' },
        broken: { state: 'done', at: 'yesterday' },
        nothing: null,
      },
    })
    expect(Object.keys(parseMarks(v1, NOW)).sort()).toEqual(['ok', 'snoozed'])
    const v2 = serializeState({
      name: 'Priya',
      marks: withHandled({}, [target('comp:below-minimum:all', '78:1ko92ah')], NOW, 'Priya'),
    })
    const back = parseState(v2, NOW)
    expect(back.name).toBe('Priya')
    expect(back.marks['comp:below-minimum:all']).toMatchObject({
      state: 'handled',
      fingerprint: '78:1ko92ah',
      by: 'Priya',
    })
    for (const raw of [null, '', '{bad json', JSON.stringify({ version: 99, marks: {} }), JSON.stringify([])])
      expect(parseState(raw, NOW), String(raw)).toEqual({ marks: {}, name: null })
  })

  it('survives a storage that throws, and one that is missing', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const m = withHandled({}, ['a'], NOW)
    expect(saveMarks(m, broken)).toBe(false)
    expect(loadState(broken, NOW)).toEqual({ marks: {}, name: null })
    expect(saveMarks(m, null)).toBe(false)
    expect(loadState(null, NOW)).toEqual({ marks: {}, name: null })
  })

  it('saves the name with the marks and removes the key when both are empty', () => {
    const data = new Map<string, string>()
    const store: StorageLike = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    }
    expect(saveMarks({}, store, 'Sam')).toBe(true)
    expect(loadState(store, NOW)).toEqual({ marks: {}, name: 'Sam' })
    expect(saveMarks({}, store, null)).toBe(true)
    expect(data.has(STORAGE_KEY)).toBe(false)
  })

  it("hashes an HR case's key, so an employee relations case ID is never stored", () => {
    const id = 'services:case:HR-105374'
    const key = markKeyOf(id)
    expect(key).toBe(`services:case:#${hashKey(id)}`)
    expect(key).not.toContain('HR-105374')
    expect(markKeyOf(key)).toBe(key)
    // Other ids are kept as they are, and the hash is stable.
    expect(markKeyOf('recruiting:review:APP-1')).toBe('recruiting:review:APP-1')
    expect(hashKey(id)).toBe(hashKey(id))
    // A plain id finds the hashed mark, and a version 1 value with a case id in the clear is hashed on read.
    const marks = withHandled({}, [id], NOW)
    expect(Object.keys(marks)).toEqual([key])
    expect(statusOf(id, marks, NOW).state).toBe('handled')
    const v1 = JSON.stringify({
      version: 1,
      marks: { [id]: { state: 'handled', at: '2026-10-01T00:00:00Z' } },
    })
    const read = parseMarks(v1, NOW)
    expect(Object.keys(read)).toEqual([key])
    expect(JSON.stringify(read)).not.toContain('HR-105374')
    expect(serializeState({ marks: read, name: null })).not.toContain('HR-105374')
  })

  it('keeps census:actions described in the storage keys list', () => {
    const entry = STORAGE_KEYS.find((k) => k.key === STORAGE_KEY)
    expect(entry?.where).toContain('localStorage')
    expect(entry?.holds).toMatch(/handled or snoozed/)
  })
})

describe('the marks file', () => {
  it('writes the marks and the name, and reads back only a Census marks file', () => {
    const marks = withHandled({}, [target('hrbp:span:E1', '5:a')], NOW, 'Priya')
    const text = marksFile({ marks, name: 'Priya' }, NOW)
    const r = readMarksFile(text, NOW)
    expect(r).toEqual({ ok: true, marks, count: 1 })
    expect(readMarksFile('{}', NOW).ok).toBe(false)
    expect(readMarksFile('not json', NOW).ok).toBe(false)
    expect(readMarksFile(JSON.stringify({ kind: 'census-settings', marks }), NOW).ok).toBe(false)
  })

  it('merges a file over this browser by the later mark', () => {
    const mine = withHandled({}, ['a', 'b'], NOW)
    const later = withSnoozed({}, ['b', 'c'], NOW + 60_000, 7)
    const earlier = withSnoozed({}, ['a'], NOW - 60_000, 7)
    const merged = mergeMarks(mine, { ...later, ...earlier })
    expect(merged.a.state).toBe('handled')
    expect(merged.b.state).toBe('snoozed')
    expect(merged.c.state).toBe('snoozed')
  })
})
