/**
 * `timed` (docs/ROLES.md, 5.7 and 6.8 test 7): it records only while the flag is on, which the
 * modes' connection turns on in Developer mode and off in every other mode, so HR and Manager
 * mode record nothing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  clearTimings,
  recordSince,
  setTimingOn,
  timed,
  timingClock,
  timingEntries,
  timingGroup,
  timingOn,
} from './timing'

class MemoryStorage {
  private m = new Map<string, string>()
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
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  clear() {
    this.m.clear()
  }
}

const names = () => timingEntries().map((e) => e.name)

describe('timed', () => {
  it('records nothing while the flag is off, and returns what the function returns', () => {
    setTimingOn(false)
    clearTimings()
    expect(timed('census:test:off', () => 42)).toBe(42)
    recordSince('census:test:off', timingClock())
    expect(names()).not.toContain('census:test:off')
  })

  it('records a census: measure while the flag is on, even when the function throws', () => {
    setTimingOn(true)
    expect(timed('census:test:on', () => 'x')).toBe('x')
    expect(() =>
      timed('census:test:throws', () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(names()).toEqual(expect.arrayContaining(['census:test:on', 'census:test:throws']))
    const e = timingEntries().find((x) => x.name === 'census:test:on')
    expect(e?.ms).toBeGreaterThanOrEqual(0)
    clearTimings()
    expect(names().filter((n) => n.startsWith('census:test:'))).toEqual([])
    setTimingOn(false)
  })

  it('names its groups', () => {
    expect(timingGroup('census:headline:hrbp')).toBe('headline')
    expect(timingGroup('census:context')).toBe('context')
  })
})

describe('the modes turn timings on in Developer mode only', () => {
  let stop: (() => void) | null = null
  let modes: typeof import('@/access/store')
  beforeAll(async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    modes = await import('@/access/store')
    const connect = await import('@/access/connect')
    stop = connect.connectAccess({ notify: () => undefined })
  }, 60_000)
  afterAll(() => {
    stop?.()
    vi.unstubAllGlobals()
  })

  it('records nothing in HR or Manager mode, and records in Developer mode', () => {
    modes.useMode.setState({ mode: 'hr' })
    expect(timingOn()).toBe(false)
    clearTimings()
    timed('census:headline:test', () => 1)
    expect(names()).not.toContain('census:headline:test')

    modes.useMode.setState({ mode: 'developer' })
    expect(timingOn()).toBe(true)
    timed('census:headline:test', () => 1)
    expect(names()).toContain('census:headline:test')

    modes.useMode.setState({ mode: 'manager', managerId: 'E-nobody' })
    expect(timingOn()).toBe(false)
    clearTimings()
    timed('census:headline:test', () => 1)
    expect(names()).not.toContain('census:headline:test')

    modes.useMode.setState({ mode: 'hr', managerId: null })
    expect(timingOn()).toBe(false)
  })

  it('stops recording when the modes disconnect', () => {
    modes.useMode.setState({ mode: 'developer' })
    expect(timingOn()).toBe(true)
    stop?.()
    stop = null
    expect(timingOn()).toBe(false)
  })
})
