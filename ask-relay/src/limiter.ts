/**
 * A best-effort rate limit kept in the worker's memory: a fixed one-minute window per key. Cloudflare
 * runs many copies of a worker (one or more in each location it serves from), and each copy counts
 * on its own, so this slows a flood from one place rather than counting exactly. The spend limit on
 * the Claude Console workspace is the backstop (docs/ASK-RELAY.md, Costs and limits).
 *
 * It has the shape of Cloudflare's rate limiting binding (`limit({ key })`), so the worker uses a
 * binding instead whenever wrangler.toml declares one.
 *
 * It holds at most `maxKeys` windows. When a new key finds it full, expired windows go first, then
 * the oldest windows still under their limit; a window over its limit is never let go before it
 * ends, so a flood of new keys cannot lift a block. When every window held is over its limit, a new
 * key is refused until one ends.
 */
import type { Limiter, Lockout } from './handler'

/** Windows kept at most. */
export const MAX_KEYS = 10_000

export function memoryLimiter(
  limit: number,
  periodMs = 60_000,
  now: () => number = Date.now,
  maxKeys: number = MAX_KEYS,
): Limiter {
  // In the order the windows started (a window that starts again moves to the end), so the first
  // ones are the oldest.
  const windows = new Map<string, { start: number; count: number }>()
  /** Make room for one more window; false when every window held is over its limit. */
  const room = (t: number): boolean => {
    for (const [k, w] of windows) {
      if (t - w.start < periodMs) break
      windows.delete(k)
    }
    if (windows.size < maxKeys) return true
    for (const [k, w] of windows)
      if (w.count <= limit) {
        windows.delete(k)
        return true
      }
    return false
  }
  return {
    async limit({ key }) {
      const t = now()
      let w = windows.get(key)
      if (w && t - w.start >= periodMs) {
        windows.delete(key)
        w = undefined
      }
      if (!w) {
        if (windows.size >= maxKeys && !room(t)) return { success: false }
        w = { start: t, count: 0 }
        windows.set(key, w)
      }
      w.count++
      return { success: w.count <= limit }
    },
  }
}

/**
 * The wrong-passcode lockout, kept in the worker's memory like the limiter: a key with `max` wrong
 * passcodes inside `periodMs` is locked until that window ends. `max` per key name: one limit for an
 * address, another for everyone together ('wrong:all').
 */
export function memoryLockout(
  maxPerAddress: number,
  maxForAll: number,
  periodMs: number,
  now: () => number = Date.now,
  maxKeys: number = MAX_KEYS,
): Lockout {
  const fails = new Map<string, { start: number; count: number }>()
  const max = (key: string) => (key === 'wrong:all' ? maxForAll : maxPerAddress)
  const current = (key: string, t: number) => {
    const w = fails.get(key)
    if (w && t - w.start >= periodMs) {
      fails.delete(key)
      return undefined
    }
    return w
  }
  return {
    locked(key) {
      const w = current(key, now())
      return !!w && w.count >= max(key)
    },
    fail(key) {
      const t = now()
      const w = current(key, t)
      if (w) {
        w.count++
        return
      }
      if (fails.size >= maxKeys)
        for (const [k, x] of fails) if (t - x.start >= periodMs || x.count < max(k)) fails.delete(k)
      if (fails.size < maxKeys) fails.set(key, { start: t, count: 1 })
    },
  }
}
