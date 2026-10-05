/**
 * Record refs (docs/ASK.md, Record refs): tools hand Claude short handles (`r1`, `r2` ...) for the
 * records behind each number, and keep `ref → DrillSource` here for the conversation. Claude links
 * a number as `[42 leavers](ref:r7)`; the UI opens the drill panel with `resolve('r7')`. The
 * records themselves never leave the browser.
 */
import type { DrillSource } from '@/drill/Drill'

export interface RefEntry {
  id: string
  source: NonNullable<DrillSource>
  /** What the number is, in plain words (may hold person tokens), for "What was sent". */
  label: string
}

export const REF_RE = /^r[1-9]\d*$/

export class RefRegistry {
  private readonly map = new Map<string, RefEntry>()
  private readonly bySource = new WeakMap<object, string>()
  private next = 1

  /** A ref for the records behind a number; the same source gets the same ref. Null without records. */
  add(source: DrillSource, label = ''): string | null {
    if (!source) return null
    const seen = this.bySource.get(source)
    if (seen) return seen
    const id = `r${this.next++}`
    this.map.set(id, { id, source, label })
    this.bySource.set(source, id)
    return id
  }

  /** The records behind a ref, or undefined for a ref this conversation never handed out. */
  resolve(id: string): DrillSource | undefined {
    return this.map.get(id.trim())?.source
  }

  has(id: string): boolean {
    return this.map.has(id.trim())
  }

  entry(id: string): RefEntry | undefined {
    return this.map.get(id.trim())
  }

  get size(): number {
    return this.map.size
  }
}
