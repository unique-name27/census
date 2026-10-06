import { describe, expect, it } from 'vitest'
import type { HistoryMark } from '@/data/address'
import { AddressWriter, QUIET_MS } from './addressWriter'

/** A browser history and a clock to drive by hand. */
function fakeBrowser(start = '#hrbp') {
  const entries: { hash: string; state: unknown }[] = [{ hash: start, state: null }]
  let at = 0
  let now = 0
  const timers = new Map<number, { fn: () => void; due: number }>()
  let nextTimer = 1
  return {
    entries,
    get index() {
      return at
    },
    api: {
      hash: () => entries[at].hash,
      state: () => entries[at].state,
      push: (hash: string, mark: HistoryMark) => {
        entries.splice(at + 1)
        entries.push({ hash, state: mark })
        at = entries.length - 1
      },
      replace: (hash: string, mark: HistoryMark) => {
        entries[at] = { hash, state: mark }
      },
    },
    timers: {
      set: (fn: () => void, ms: number) => {
        const id = nextTimer++
        timers.set(id, { fn, due: now + ms })
        return id
      },
      clear: (id: unknown) => {
        timers.delete(id as number)
      },
    },
    tick(ms: number) {
      now += ms
      for (const [id, t] of [...timers]) {
        if (t.due <= now) {
          timers.delete(id)
          t.fn()
        }
      }
    },
    back() {
      at = Math.max(0, at - 1)
    },
  }
}

describe('history entries for the address', () => {
  it('pushes one entry per view or tab change', () => {
    const b = fakeBrowser()
    const w = new AddressWriter(b.api, b.timers)
    w.write('#hrbp.attrition', 'push')
    w.write('#talent', 'push')
    expect(b.entries.map((e) => e.hash)).toEqual(['#hrbp', '#hrbp.attrition', '#talent'])
  })

  it('collapses rapid scope changes into one entry, then starts a new one after the quiet time', () => {
    const b = fakeBrowser()
    const w = new AddressWriter(b.api, b.timers)
    w.write('#hrbp?dept=A', 'coalesce')
    b.tick(200)
    w.write('#hrbp?dept=A&dept=B', 'coalesce')
    b.tick(200)
    w.write('#hrbp?dept=A&dept=B&dept=C', 'coalesce')
    expect(b.entries.map((e) => e.hash)).toEqual(['#hrbp', '#hrbp?dept=A&dept=B&dept=C'])
    b.tick(QUIET_MS)
    w.write('#hrbp?period=t6m&dept=A&dept=B&dept=C', 'coalesce')
    expect(b.entries).toHaveLength(3)
  })

  it('holds one entry open while a menu is open, however slowly values are ticked', () => {
    const b = fakeBrowser()
    const w = new AddressWriter(b.api, b.timers)
    const release = w.hold()
    w.write('#hrbp?loc=A', 'coalesce')
    b.tick(5000)
    w.write('#hrbp?loc=A&loc=B', 'coalesce')
    b.tick(5000)
    w.write('#hrbp?loc=A&loc=B&loc=C', 'coalesce')
    expect(b.entries).toHaveLength(2)
    release()
    // The menu closed: the next change is its own entry, straight away.
    w.write('#hrbp?loc=A&loc=B&loc=C&level=L4', 'coalesce')
    expect(b.entries).toHaveLength(3)
  })

  it('marks every entry it writes, replaces without pushing, and does nothing when the address is current', () => {
    const b = fakeBrowser()
    const w = new AddressWriter(b.api, b.timers, QUIET_MS, () => 1000)
    w.write('#hrbp', 'replace')
    expect(b.entries).toHaveLength(1)
    const mark = b.entries[0].state as HistoryMark
    expect(typeof mark.census).toBe('number')
    w.write('#hrbp', 'push')
    w.write('#hrbp', 'coalesce')
    expect(b.entries).toHaveLength(1)
    w.write('#hrbp?bu=X', 'replace')
    expect(b.entries).toHaveLength(1)
    // Replacing keeps the entry's id.
    expect((b.entries[0].state as HistoryMark).census).toBe(mark.census)
  })

  it('ends a burst when the view changes, so the next filter change is its own entry', () => {
    const b = fakeBrowser()
    const w = new AddressWriter(b.api, b.timers)
    w.write('#hrbp?bu=X', 'coalesce')
    w.write('#talent?bu=X', 'push')
    w.write('#talent?bu=Y', 'coalesce')
    expect(b.entries.map((e) => e.hash)).toEqual(['#hrbp', '#hrbp?bu=X', '#talent?bu=X', '#talent?bu=Y'])
  })

  it('Back then a new change drops the forward entries, like the browser', () => {
    const b = fakeBrowser()
    const w = new AddressWriter(b.api, b.timers)
    w.write('#hrbp?bu=X', 'push')
    w.write('#hrbp?bu=Y', 'push')
    b.back()
    w.endBurst()
    w.write('#hrbp?bu=X', 'replace')
    w.write('#hrbp?bu=Z', 'coalesce')
    expect(b.entries.map((e) => e.hash)).toEqual(['#hrbp', '#hrbp?bu=X', '#hrbp?bu=Z'])
  })
})
