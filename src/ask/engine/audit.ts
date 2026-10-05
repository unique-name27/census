/**
 * Differencing protection (docs/ASK.md, Privacy rules). Two results over groups that differ by
 * one person can be subtracted: a mean rating over six people and over the same people but one
 * gives that one person's rating exactly, and two counts of visa holders that differ by one say
 * who holds one. So, per conversation, Ask remembers the rows behind every result that a small
 * group must not be read from (a mean or median of one person's rating, answer or pay ratio, and
 * the counts of a grouped-only question such as survey reasons or right to work), and withholds a
 * new one whose rows differ from an earlier one's only by rows of fewer people than the anonymity
 * minimum. The same rows asked again are fine.
 *
 * The comparison is pairwise, plus the union of the groups one answer released (which can be
 * summed back into a larger group). It is the differencing protection survey tools apply; it does
 * not try to solve every combination of many answers.
 *
 * Rows are known by identity: scoped datasets filter the loaded rows and never copy them.
 */

/** A set of rows: their ids in ascending order. */
export type RowSet = Uint32Array

export const DIFFERENCING = (min: number): string =>
  `Hidden: with an earlier result in this chat it would single out fewer than ${min} people`

export class ReleaseAudit {
  private readonly ids = new WeakMap<object, number>()
  /** Row id → the person it is about. */
  private readonly personOf: string[] = []
  /** Released row sets per topic ("reviews.rating", "surveyResponses#counts"). */
  private readonly released = new Map<string, RowSet[]>()

  /** How many results have been remembered (for tests). */
  get size(): number {
    let n = 0
    for (const list of this.released.values()) n += list.length
    return n
  }

  /** The row set of `rows`, each row's person given by `person` (a row about no one counts as its own person). */
  rowSet(rows: readonly object[], person: (row: object) => string | null): RowSet {
    const out = new Uint32Array(rows.length)
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k] as object
      let id = this.ids.get(r)
      if (id === undefined) {
        id = this.personOf.length
        this.ids.set(r, id)
        this.personOf.push(person(r) ?? `row:${id}`)
      }
      out[k] = id
    }
    out.sort()
    return out
  }

  /** Would releasing a result over `set` single out 1 to min − 1 people against an earlier result on the topic? */
  conflicts(topic: string, set: RowSet, min: number): boolean {
    for (const prev of this.released.get(topic) ?? []) {
      const n = this.differingPeople(set, prev, min)
      if (n > 0 && n < min) return true
    }
    return false
  }

  /** Remember a released result (the same rows twice are kept once). */
  record(topic: string, set: RowSet): void {
    if (!set.length) return
    const list = this.released.get(topic)
    if (!list) {
      this.released.set(topic, [set])
      return
    }
    if (list.some((prev) => sameSet(prev, set))) return
    list.push(set)
  }

  /** Release if it does not conflict; true when released. */
  release(topic: string, set: RowSet, min: number): boolean {
    if (this.conflicts(topic, set, min)) return false
    this.record(topic, set)
    return true
  }

  /** People behind the rows in exactly one of the two sets, counted up to `cap`. */
  private differingPeople(a: RowSet, b: RowSet, cap: number): number {
    const people = new Set<string>()
    let i = 0
    let j = 0
    while (i < a.length || j < b.length) {
      const x = i < a.length ? (a[i] as number) : Number.POSITIVE_INFINITY
      const y = j < b.length ? (b[j] as number) : Number.POSITIVE_INFINITY
      let odd: number
      if (x === y) {
        i++
        j++
        continue
      }
      if (x < y) {
        odd = x
        i++
      } else {
        odd = y
        j++
      }
      people.add(this.personOf[odd] as string)
      if (people.size >= cap) return people.size
    }
    return people.size
  }
}

function sameSet(a: RowSet, b: RowSet): boolean {
  if (a.length !== b.length) return false
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false
  return true
}

/** The union of row sets (ascending, without repeats). */
export function unionOf(sets: readonly RowSet[]): RowSet {
  const all = new Set<number>()
  for (const s of sets) for (const id of s) all.add(id)
  const out = Uint32Array.from(all)
  out.sort()
  return out
}
