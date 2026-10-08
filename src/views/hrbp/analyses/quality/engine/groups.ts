/**
 * Group scores (docs/ANALYSES.md, 2.2 and 2.6): a group's mean quality of hire with its interval,
 * its expected score from the site and level mix, its two parts, and where it sits against the
 * company; and the cuts the figures draw, with their folds. Any mean over fewer scored hires than
 * the anonymity minimum is null. Pure.
 */
import { DEGREE_LEVELS, SOURCES } from '@/data/schema'
import type { Hire } from './cohort'
import type { QualitySettings } from './settings'
import { type Clearly, clearly, type MixBenchmark, meanInterval } from './stats'

/** A group as a row: a value, the fold of small values, or the hires with no value. */
export type GroupKind = 'value' | 'other' | 'none'

export interface GroupScore {
  /** Stable within its cut: the value, or the fold's or blank's label. */
  key: string
  /** As shown: "Coyote Valley University", "Other universities (22)", "Not recorded". */
  label: string
  kind: GroupKind
  /** Every cohort hire in the group, by hire date. */
  hires: readonly Hire[]
  /** Hires with a quality of hire score. */
  scored: readonly Hire[]
  /** Hires with a first review score. */
  rated: readonly Hire[]
  /** Hires with a retention score. */
  retained: readonly Hire[]
  /** Scored hires: the n of every mean. */
  n: number
  q: number | null
  low: number | null
  high: number | null
  /** First review score, 0 to 100. */
  p: number | null
  /** Stayed a year, a fraction. */
  r: number | null
  expected: number | null
  gap: number | null
  status: Clearly
  /** Values folded into this row (Other only). */
  folded: readonly string[]
}

export interface ScoreContext {
  s: QualitySettings
  /**
   * How many hires a group has for its fold: scored hires, or hires with a retention score when
   * there are no Reviews (only Stayed a year shows then).
   */
  sized: 'scored' | 'retained'
  /** The company mean the "clearly" test and the reference rule use. */
  companyQ: number | null
  mix: MixBenchmark<Hire>
}

/** The score of one group of hires. */
export function scoreGroup(
  key: string,
  label: string,
  kind: GroupKind,
  hires: readonly Hire[],
  c: ScoreContext,
  folded: readonly string[] = [],
): GroupScore {
  const min = c.s.minGroup
  const scored = hires.filter((h) => h.Q != null)
  const rated = hires.filter((h) => h.P != null)
  const retained = hires.filter((h) => h.R != null)
  const i = meanInterval(
    scored.map((h) => h.Q as number),
    c.s.z,
    min,
  )
  const p = meanInterval(
    rated.map((h) => h.P as number),
    c.s.z,
    min,
  ).mean
  const stayed = retained.filter((h) => h.R === 100).length
  const r = retained.length >= min && retained.length > 0 ? stayed / retained.length : null
  const expected = i.mean == null ? null : c.mix.expected(scored)
  return {
    key,
    label,
    kind,
    hires,
    scored,
    rated,
    retained,
    n: scored.length,
    q: i.mean,
    low: i.low,
    high: i.high,
    p,
    r,
    expected,
    gap: i.mean != null && expected != null ? i.mean - expected : null,
    status: clearly(i, c.companyQ),
    folded,
  }
}

/** Hires by a value; blanks under the null key. */
function bucket(hires: readonly Hire[], groupOf: (h: Hire) => string | null): Map<string | null, Hire[]> {
  const m = new Map<string | null, Hire[]>()
  for (const h of hires) {
    const v = groupOf(h)
    const arr = m.get(v)
    if (arr) arr.push(h)
    else m.set(v, [h])
  }
  return m
}

const counter = (sized: ScoreContext['sized']) => (hs: readonly Hire[]) =>
  hs.reduce((n, h) => n + ((sized === 'scored' ? h.Q : h.R) != null ? 1 : 0), 0)

export interface CutOptions {
  /** A fixed order of values (degree levels, sources); otherwise by scored hires, largest first. */
  order?: readonly string[]
  /** Values with fewer scored hires fold into the Other row. */
  minShown: number
  /** Show at most this many values; the rest fold (fields of study: the six largest). */
  top?: number
  /** "Other universities (k)". */
  otherLabel: (k: number) => string
  /** The row of hires with no value; never folded, always last. */
  noneLabel: string
  /** Keep values under `minShown` as their own (hidden) rows instead of folding them. */
  keepSmall?: boolean
  /** Values that always fold (a field of study recorded as "Other" belongs with Other fields). */
  foldValues?: readonly string[]
}

/** A cut: its values (fixed order or by size), then Other, then the blank row. */
export function cutBy(
  hires: readonly Hire[],
  groupOf: (h: Hire) => string | null,
  c: ScoreContext,
  o: CutOptions,
): GroupScore[] {
  const groups = bucket(hires, groupOf)
  const size = counter(c.sized)
  const byCountThenName = (a: [string, Hire[]], b: [string, Hire[]]) =>
    size(b[1]) - size(a[1]) || b[1].length - a[1].length || a[0].localeCompare(b[0])
  const values = [...groups].filter((g): g is [string, Hire[]] => g[0] != null)
  const ordered = o.order
    ? [
        ...o.order.flatMap((v) => {
          const g = groups.get(v)
          return g ? [[v, g] as [string, Hire[]]] : []
        }),
        ...values.filter(([v]) => !o.order?.includes(v)).sort(byCountThenName),
      ]
    : values.sort(byCountThenName)
  const shown: [string, Hire[]][] = []
  const fold: [string, Hire[]][] = []
  for (const g of ordered) {
    const big = size(g[1]) >= o.minShown
    const kept = !o.foldValues?.includes(g[0])
    if (kept && (big || o.keepSmall) && (o.top == null || shown.length < o.top)) shown.push(g)
    else fold.push(g)
  }
  // An Other row under the minimum would be worked out from the scope and the rows shown, so it
  // takes the smallest values shown until it reaches the minimum (complementary suppression).
  const folded = () => size(fold.flatMap(([, h]) => h))
  while (!o.keepSmall && fold.length && folded() < c.s.minGroup && shown.length) {
    let i = 0
    for (let j = 1; j < shown.length; j++) if (size(shown[j][1]) <= size(shown[i][1])) i = j
    fold.push(...shown.splice(i, 1))
  }
  const out = shown.map(([v, hs]) => scoreGroup(v, v, 'value', hs, c))
  if (fold.length) {
    const hs = fold.flatMap(([, h]) => h).sort((a, b) => (a.e.hireDate < b.e.hireDate ? -1 : 1))
    out.push(
      scoreGroup(
        `other:${fold.length}`,
        o.otherLabel(fold.length),
        'other',
        hs,
        c,
        fold.map(([v]) => v),
      ),
    )
  }
  const blank = groups.get(null)
  if (blank?.length) out.push(scoreGroup('none', o.noneLabel, 'none', blank, c))
  return protectRows(out, c.s.minGroup)
}

/** A group with every mean withheld: its hire counts stay, its numbers read "—" and never drill. */
function withheld(g: GroupScore): GroupScore {
  return {
    ...g,
    q: null,
    low: null,
    high: null,
    p: null,
    r: null,
    expected: null,
    gap: null,
    status: 'unclear',
  }
}

/** Each mean of a group, with the hires it is over. */
const MEASURES: readonly { pop: (g: GroupScore) => number; shown: (g: GroupScore) => boolean }[] = [
  { pop: (g) => g.n, shown: (g) => g.q != null },
  { pop: (g) => g.rated.length, shown: (g) => g.p != null },
  { pop: (g) => g.retained.length, shown: (g) => g.r != null },
]

/**
 * Complementary suppression: a cut's rows add up to the scope, whose means are shown, so the hidden
 * rows of a mean could be worked out together from the rest. While they hold some hires but fewer
 * than the minimum between them, the smallest row still shown is withheld too (one not clearly
 * above or below the company first, so the readout's groups stay).
 */
export function protectRows(rows: readonly GroupScore[], min: number): GroupScore[] {
  const out = [...rows]
  let changed = true
  while (changed) {
    changed = false
    for (const m of MEASURES) {
      const hidden = out.filter((g) => !m.shown(g) && m.pop(g) > 0)
      const total = hidden.reduce((n, g) => n + m.pop(g), 0)
      if (total === 0 || total >= min) continue
      // The smallest row shown that is not clearly above or below the company, else the smallest.
      const before = (a: GroupScore, b: GroupScore) =>
        (a.status === 'unclear') !== (b.status === 'unclear') ? a.status === 'unclear' : m.pop(a) < m.pop(b)
      let pick = -1
      for (let i = 0; i < out.length; i++)
        if (m.shown(out[i]) && (pick < 0 || before(out[i], out[pick]))) pick = i
      if (pick < 0) continue
      out[pick] = withheld(out[pick])
      changed = true
    }
  }
  return out
}

export const NOT_RECORDED = 'Not recorded'
export const NOT_LINKED = 'Not in the candidate data'

/** Sources on the hires that are not one of Recruiting's `SOURCES`. */
export function unlistedSources(hires: readonly Hire[]): string[] {
  const known = new Set<string>(SOURCES)
  const out = new Set<string>()
  for (const h of hires) if (h.app?.source && !known.has(h.app.source)) out.add(h.app.source)
  return [...out]
}

/** The cuts of 2.6, each a function of the hires it groups. */
export const CUTS = {
  university: (hires: readonly Hire[], c: ScoreContext) =>
    cutBy(hires, (h) => h.university, c, {
      minShown: c.s.minUniversityHires,
      otherLabel: (k) => `Other universities (${k})`,
      noneLabel: NOT_RECORDED,
    }),
  degree: (hires: readonly Hire[], c: ScoreContext) =>
    cutBy(hires, (h) => h.degree, c, {
      order: DEGREE_LEVELS,
      minShown: c.s.minGroup,
      keepSmall: true,
      otherLabel: (k) => `Other (${k})`,
      noneLabel: NOT_RECORDED,
    }),
  field: (hires: readonly Hire[], c: ScoreContext) =>
    cutBy(hires, (h) => h.field, c, {
      minShown: c.s.minGroup,
      top: 6,
      foldValues: ['Other'],
      otherLabel: () => 'Other fields',
      noneLabel: NOT_RECORDED,
    }),
  // The sources Recruiting knows, in its order; a spelling it does not recognize ("Northgate
  // careers page") and a source under the university minimum (10) fold into Other sources.
  source: (hires: readonly Hire[], c: ScoreContext) =>
    cutBy(hires, (h) => (h.app ? h.app.source : null), c, {
      order: SOURCES,
      minShown: Math.max(c.s.minGroup, c.s.minUniversityHires),
      foldValues: unlistedSources(hires),
      otherLabel: (k) => `Other sources (${k})`,
      noneLabel: NOT_LINKED,
    }),
  businessUnit: (hires: readonly Hire[], c: ScoreContext) =>
    cutBy(hires, (h) => h.e.businessUnit || null, c, {
      minShown: c.s.minGroup,
      otherLabel: (k) => `Other (${k})`,
      noneLabel: NOT_RECORDED,
    }),
  location: (hires: readonly Hire[], c: ScoreContext) =>
    cutBy(hires, (h) => h.site || null, c, {
      minShown: c.s.minGroup,
      otherLabel: (k) => `Other (${k})`,
      noneLabel: NOT_RECORDED,
    }),
} as const

export type CutKey = keyof typeof CUTS

/** One cell of degree level by field of study. */
export interface DegreeFieldCell {
  /** The field row: one of the six largest, or "Other fields". */
  field: string
  degree: string
  hires: readonly Hire[]
  scored: readonly Hire[]
  n: number
  /** Mean quality of hire; null under the smallest cell. */
  q: number | null
  p: number | null
  r: number | null
}

/**
 * Degree level by field of study: rows are the field cut's values and its "Other fields" (never
 * Not recorded), columns the degree levels; a cell under `minCellHires` scored hires has no mean.
 * Each row adds up to its field's group and each column to its degree level's (`degrees`), both
 * shown in their own figures, so cells are withheld until no hidden cell can be worked out
 * (`protectCells`).
 */
export function degreeFieldCells(
  fields: readonly GroupScore[],
  c: ScoreContext,
  degrees: readonly GroupScore[] = [],
): DegreeFieldCell[] {
  return protectCells(rawCells(fields, c), fields, degrees, c.s.minGroup)
}

function rawCells(fields: readonly GroupScore[], c: ScoreContext): DegreeFieldCell[] {
  const out: DegreeFieldCell[] = []
  for (const row of fields) {
    if (row.kind === 'none') continue
    for (const degree of DEGREE_LEVELS) {
      const hs = row.hires.filter((h) => h.degree === degree)
      const g = scoreGroup(`${row.key}|${degree}`, degree, 'value', hs, c)
      const big = g.n >= c.s.minCellHires
      out.push({
        field: row.label,
        degree,
        hires: hs,
        scored: g.scored,
        n: g.n,
        q: big ? g.q : null,
        p: big ? g.p : null,
        r: big ? g.r : null,
      })
    }
  }
  return out
}

/**
 * Complementary suppression for the heatmap: in a row or column whose total is shown, the hidden
 * cells and the hires in no cell (no degree level, or no field of study) together could be worked
 * out, so while they hold some hires but fewer than the minimum, the smallest cell still shown is
 * withheld too.
 */
export function protectCells(
  cells: readonly DegreeFieldCell[],
  fields: readonly GroupScore[],
  degrees: readonly GroupScore[],
  min: number,
): DegreeFieldCell[] {
  const out = [...cells]
  const lines: { total: GroupScore; at: (cell: DegreeFieldCell) => boolean }[] = [
    ...fields
      .filter((f) => f.kind !== 'none' && f.q != null)
      .map((f) => ({ total: f, at: (cell: DegreeFieldCell) => cell.field === f.label })),
    ...degrees
      .filter((d) => d.kind === 'value' && d.q != null)
      .map((d) => ({ total: d, at: (cell: DegreeFieldCell) => cell.degree === d.label })),
  ]
  let changed = true
  while (changed) {
    changed = false
    for (const line of lines) {
      const idx = out.flatMap((cell, i) => (line.at(cell) ? [i] : []))
      const outside = line.total.n - idx.reduce((n, i) => n + out[i].n, 0)
      const hidden = idx.filter((i) => out[i].q == null && out[i].n > 0)
      const held = hidden.reduce((n, i) => n + out[i].n, 0) + Math.max(0, outside)
      if (held === 0 || held >= min) continue
      let pick = -1
      for (const i of idx) if (out[i].q != null && (pick < 0 || out[i].n < out[pick].n)) pick = i
      if (pick < 0) continue
      out[pick] = { ...out[pick], q: null, p: null, r: null }
      changed = true
    }
  }
  return out
}
