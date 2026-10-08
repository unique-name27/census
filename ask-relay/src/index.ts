/**
 * The Census Ask relay, as a Cloudflare Worker (docs/ASK-RELAY.md). The request rules are in
 * handler.ts; this file only gives them the real fetch, the rate limiters and the log.
 *
 * Rate limits: Cloudflare's rate limiting binding when wrangler.toml declares one (`TEAM_LIMITER`,
 * `ADDRESS_LIMITER`), else a best-effort count in this worker's memory with the limits in the
 * `REQUESTS_PER_MINUTE` and `ADDRESS_REQUESTS_PER_MINUTE` vars.
 */
import {
  handleRelay,
  type Limiter,
  LOCKOUT_MS,
  type RelayEnv,
  WRONG_FOR_ALL,
  WRONG_PER_ADDRESS,
} from './handler'
import { memoryLimiter, memoryLockout } from './limiter'

interface Env extends RelayEnv {
  /** Requests a minute per passcode and client address (the memory limit). */
  REQUESTS_PER_MINUTE?: string
  /** Requests a minute from one client address, right passcode or not (the memory limit). */
  ADDRESS_REQUESTS_PER_MINUTE?: string
  /** Cloudflare's rate limiting binding, when wrangler.toml declares it. */
  TEAM_LIMITER?: Limiter
  ADDRESS_LIMITER?: Limiter
}

const perMinute = (v: string | undefined, fallback: number): number => {
  const n = Number(v)
  return v?.trim() && Number.isInteger(n) && n > 0 ? n : fallback
}

/** The memory limiters live as long as this copy of the worker, so counts carry across requests. */
let memory: { key: string; team: Limiter; address: Limiter } | null = null
/** Wrong-passcode lockout for this copy of the worker. */
const lockout = memoryLockout(WRONG_PER_ADDRESS, WRONG_FOR_ALL, LOCKOUT_MS)

function memoryLimiters(env: Env): { team: Limiter; address: Limiter } {
  const team = perMinute(env.REQUESTS_PER_MINUTE, 60)
  const address = perMinute(env.ADDRESS_REQUESTS_PER_MINUTE, 120)
  const key = `${team}/${address}`
  if (memory?.key !== key) memory = { key, team: memoryLimiter(team), address: memoryLimiter(address) }
  return memory
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const fallback = memoryLimiters(env)
    return handleRelay(request, env, {
      // Called through a function: the runtime's fetch must not be called as a method of another object.
      fetch: (input, init) => fetch(input, init),
      teamLimiter: env.TEAM_LIMITER ?? fallback.team,
      addressLimiter: env.ADDRESS_LIMITER ?? fallback.address,
      lockout,
      // One line per request: what happened, the status and the model. Never a body, a key, a
      // passcode or an address.
      log: (line) => console.log(JSON.stringify(line)),
    })
  },
}
