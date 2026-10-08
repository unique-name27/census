/**
 * Swapped job levels. In Census a job family is the broad group (Silicon Engineering) and contains
 * job functions (Design RTL). A file whose "Job Family" column holds disciplines and whose "Job
 * Function" column holds broad groups (Engineering, G&A) reads upside down: many families, each
 * inside one of a few functions. Pure; shown as an import hint and as a Categories & mapping note.
 */

/** Fewer rows with both fields than this say nothing about the shape. */
export const SWAP_MIN_ROWS = 20

export interface SwappedJobLevels {
  /** Distinct job families among rows with both fields. */
  families: number
  /** Distinct job functions among rows with both fields. */
  functions: number
  /** Rows with both fields. */
  rows: number
  /** Share of rows whose function is the most common function of their family. */
  familyNest: number
  /** Share of rows whose family is the most common family of their function. */
  functionNest: number
}

const text = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''

/** For each key, the count of its most common partner, summed: rows that sit with the majority. */
function nested(pairs: readonly [string, string][]): number {
  const by = new Map<string, Map<string, number>>()
  for (const [a, b] of pairs) {
    let m = by.get(a)
    if (!m) {
      m = new Map()
      by.set(a, m)
    }
    m.set(b, (m.get(b) ?? 0) + 1)
  }
  let hits = 0
  for (const m of by.values()) hits += Math.max(...m.values())
  return pairs.length ? hits / pairs.length : 0
}

/** The shape of the two job levels in some rows (null under `SWAP_MIN_ROWS` rows with both). */
export function jobLevelsShape(
  rows: readonly { jobFamily?: unknown; jobFunction?: unknown }[],
): SwappedJobLevels | null {
  const pairs: [string, string][] = []
  for (const r of rows) {
    const fam = text(r.jobFamily)
    const fn = text(r.jobFunction)
    if (fam && fn) pairs.push([fam, fn])
  }
  if (pairs.length < SWAP_MIN_ROWS) return null
  return {
    families: new Set(pairs.map((p) => p[0])).size,
    functions: new Set(pairs.map((p) => p[1])).size,
    rows: pairs.length,
    familyNest: nested(pairs),
    functionNest: nested(pairs.map(([a, b]) => [b, a])),
  }
}

/**
 * The two columns look swapped when there are more families than functions, nearly every family
 * sits inside one function (familyNest ≥ 0.9) and functions spread across families
 * (functionNest < 0.75). Returns the shape when they do, else null.
 */
export function jobLevelsSwapped(
  rows: readonly { jobFamily?: unknown; jobFunction?: unknown }[],
): SwappedJobLevels | null {
  const s = jobLevelsShape(rows)
  if (!s) return null
  return s.families > s.functions && s.familyNest >= 0.9 && s.functionNest < 0.75 ? s : null
}

/** "These two columns look swapped. In Census a job family contains job functions, but here 34 job families sit inside 5 job functions." */
export function swappedText(s: SwappedJobLevels): string {
  const fam = `${s.families.toLocaleString('en-US')} job ${s.families === 1 ? 'family' : 'families'}`
  const fn = `${s.functions.toLocaleString('en-US')} job ${s.functions === 1 ? 'function' : 'functions'}`
  return `These two columns look swapped. In Census a job family contains job functions, but here ${fam} sit inside ${fn}.`
}
