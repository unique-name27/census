/**
 * The history policy for the address (docs/FILTERS.md, part 1, History), with the browser's
 * history and timers passed in so it can be tested:
 *
 * - `push`: a new entry (a change of view or tab, applying a saved view, "Filter to this").
 * - `replace`: the same entry (Back and Forward, correcting the address, load).
 * - `coalesce`: a scope change. The first change of a burst pushes an entry; the next ones
 *   replace it until there are ~600 ms of quiet, or until the menu that held the burst open
 *   closes (`hold`). Ticking several departments in one open menu is one entry.
 *
 * Every entry Census writes carries a mark (`{ census: id }`) in `history.state`: its address is
 * complete, so an address without a scope there means the defaults.
 */
import type { AddressIntent, HistoryMark } from '@/data/address'
import { isHistoryMark } from '@/data/address'

export interface HistoryApi {
  /** The current hash, with "#". */
  hash: () => string
  state: () => unknown
  push: (hash: string, mark: HistoryMark) => void
  replace: (hash: string, mark: HistoryMark) => void
}

export interface Timers {
  set: (fn: () => void, ms: number) => unknown
  clear: (id: unknown) => void
}

/** Quiet time that ends a burst of scope changes. */
export const QUIET_MS = 600

export class AddressWriter {
  private burst = false
  private timer: unknown = null
  private holds = 0
  private seq = 0

  constructor(
    private readonly api: HistoryApi,
    private readonly timers: Timers,
    private readonly quietMs = QUIET_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** A fresh entry id (unique across reloads: history entries outlive the page). */
  private nextId(): number {
    this.seq = (this.seq + 1) % 1000
    return this.now() * 1000 + this.seq
  }

  private currentId(): number | null {
    const s = this.api.state()
    return isHistoryMark(s) ? s.census : null
  }

  /** Write `hash` with this intent. Nothing happens when the address is already it (and marked). */
  write(hash: string, intent: AddressIntent): void {
    const same = hash === this.api.hash() && this.currentId() != null
    if (intent === 'replace') {
      if (!same) this.api.replace(hash, { census: this.currentId() ?? this.nextId() })
      return
    }
    if (same) return
    if (intent === 'push') {
      this.endBurst()
      this.api.push(hash, { census: this.nextId() })
      return
    }
    // coalesce
    if (this.burst) this.api.replace(hash, { census: this.currentId() ?? this.nextId() })
    else {
      this.api.push(hash, { census: this.nextId() })
      this.burst = true
    }
    this.restartTimer()
  }

  private restartTimer(): void {
    if (this.timer != null) this.timers.clear(this.timer)
    this.timer = null
    if (this.holds > 0) return
    this.timer = this.timers.set(() => {
      this.timer = null
      if (this.holds === 0) this.burst = false
    }, this.quietMs)
  }

  /** The next scope change starts a new entry. */
  endBurst(): void {
    if (this.timer != null) this.timers.clear(this.timer)
    this.timer = null
    this.burst = false
  }

  /**
   * Keep a burst open while a filter menu is open: every change in it is one entry. The returned
   * function releases the hold; the burst ends when the last hold goes.
   */
  hold(): () => void {
    this.holds++
    if (this.timer != null) this.timers.clear(this.timer)
    this.timer = null
    let released = false
    return () => {
      if (released) return
      released = true
      this.holds = Math.max(0, this.holds - 1)
      if (this.holds === 0) this.endBurst()
    }
  }

  /** True while scope changes replace the entry the burst pushed (for tests). */
  get inBurst(): boolean {
    return this.burst
  }
}
