/**
 * The counts of Engineering by stage (docs/ANALYSES.md, 4.4 and 4.6): capacity per stage, hiring
 * in flight per stage, the stage ratios against their references, where each stage is staffed,
 * stage headcount at the last 8 quarter ends, and the job functions behind the stages. Every
 * number keeps its records, so a drill lists exactly what was counted. Pure.
 *
 * Who is in a count: employees (and interns while they count with employees) are the headcount
 * of a stage; contractors are always their own series and count in ratios while that setting is
 * on; interns are otherwise listed in the capacity table only. FTE sums `fte` (blank counts as 1).
 * A share, ratio or rate over fewer people than the anonymity minimum is null.
 */
import type { ChipStageKey, ISODate } from '@/data/schema'
import { addMonths, monthEnd, quarterStart } from '@/lib/dates'
import {
  type EngPerson,
  inFamily,
  LIFECYCLE,
  NOT_MAPPED,
  PRE_SILICON,
  STAGE_ROWS,
  type StageKey,
  type StageSource,
  type StagesBase,
} from './base'
import { type InFlight, type PlacedLine, type PlacedReq, type PlacedStart, plannedStarts } from './hiring'

const sum = (xs: readonly EngPerson[]): number => xs.reduce((n, p) => n + p.fte, 0)
/** FTE to two decimals, so 0.6 + 0.8 adds up as people read it. */
const round2 = (v: number): number => Math.round(v * 100) / 100

export interface StagePeople {
  employees: EngPerson[]
  contractors: EngPerson[]
  interns: EngPerson[]
}

export interface CapacityRow {
  key: StageKey
  phase: string
  stage: string
  /** Drawn after the nine lifecycle stages, past a hairline. */
  across: boolean
  /** Employees (and interns while they count with employees). */
  employees: number
  contractors: number
  /** Interns, listed whatever the setting. */
  interns: number
  employeeFte: number
  contractorFte: number
  /** The stage's employees as a share of engineering employees; null under the minimum. */
  share: number | null
  /** Contractors ÷ (employees + contractors) in the stage; null under the minimum. */
  contractorShare: number | null
  /**
   * People (employees and contractors) in the stage through a job function whose stage is only
   * proposed, not saved; `proposedShare` is their share of the stage's people, null under the minimum.
   */
  proposed: number
  proposedShare: number | null
  /** Employees 12 months ago, each in their current job function's stage; null without leavers. */
  yearAgo: number | null
  change: number | null
  people: StagePeople & { yearAgo: EngPerson[] }
}

export function split(b: StagesBase, people: readonly EngPerson[]): StagePeople {
  const out: StagePeople = { employees: [], contractors: [], interns: [] }
  for (const p of people) {
    if (b.counted(p)) out.employees.push(p)
    if (p.worker === 'Contractor') out.contractors.push(p)
    else if (p.worker === 'Intern') out.interns.push(p)
  }
  return out
}

const byStage = <T extends { stage: StageKey }>(xs: readonly T[]): Map<StageKey, T[]> => {
  const m = new Map<StageKey, T[]>()
  for (const x of xs) {
    const arr = m.get(x.stage)
    if (arr) arr.push(x)
    else m.set(x.stage, [x])
  }
  return m
}

/**
 * Capacity per stage: the nine lifecycle stages and the two across it always (a stage with no one
 * shows as empty, so a gap in the flow is visible), then Not mapped when it has people.
 */
export function capacityRows(
  b: StagesBase,
  now: readonly EngPerson[],
  yearAgo: readonly EngPerson[] | null,
): CapacityRow[] {
  const min = b.set.minGroup
  const nowBy = byStage(now)
  const agoBy = yearAgo ? byStage(yearAgo) : null
  const total = now.filter((p) => b.counted(p)).length
  const rows: CapacityRow[] = []
  for (const s of STAGE_ROWS) {
    const people = nowBy.get(s.key) ?? []
    if (s.key === NOT_MAPPED && !people.length) continue
    const parts = split(b, people)
    const ago = agoBy ? (agoBy.get(s.key) ?? []).filter((p) => b.counted(p)) : []
    const employees = parts.employees.length
    const contractors = parts.contractors.length
    const heads = employees + contractors
    const proposed = [...parts.employees, ...parts.contractors].filter((p) => p.source === 'Proposed').length
    rows.push({
      key: s.key,
      phase: s.phase,
      stage: s.label,
      across: s.across,
      employees,
      contractors,
      interns: parts.interns.length,
      employeeFte: round2(sum(parts.employees)),
      contractorFte: round2(sum(parts.contractors)),
      share: total >= min ? employees / total : null,
      contractorShare: heads >= min ? contractors / heads : null,
      proposed,
      proposedShare: heads >= min ? proposed / heads : null,
      yearAgo: agoBy ? ago.length : null,
      change: agoBy ? employees - ago.length : null,
      people: { ...parts, yearAgo: ago },
    })
  }
  return rows
}

/* ───────── hiring in flight ───────── */

export interface HiringRow {
  key: StageKey
  phase: string
  stage: string
  across: boolean
  /** Accepted offers and pre-hires not started. */
  accepted: number
  /** Openings of open reqs. */
  open: number
  /** Planned starts with no req; null when the mode leaves planned starts out. */
  planned: number | null
  total: number
  /** The stage's headcount today (the capacity figure's employees). */
  today: number
  /** In flight ÷ today; null when the stage has fewer people than the minimum. */
  ofToday: number | null
  records: { starts: PlacedStart[]; reqs: PlacedReq[]; lines: PlacedLine[] }
}

export function hiringRows(
  b: StagesBase,
  flight: InFlight,
  capacity: readonly CapacityRow[],
  family: string | null,
): HiringRow[] {
  const starts = byStage(
    flight.starts.filter((s) => inFamily(s.place, family)).map((s) => ({ ...s, stage: s.place.stage })),
  )
  const reqs = byStage(
    flight.reqs.filter((r) => inFamily(r.place, family)).map((r) => ({ ...r, stage: r.place.stage })),
  )
  const lines = flight.planned
    ? byStage(
        flight.planned.filter((l) => inFamily(l.place, family)).map((l) => ({ ...l, stage: l.place.stage })),
      )
    : null
  const today = new Map(capacity.map((r) => [r.key, r.employees]))
  const out: HiringRow[] = []
  for (const s of STAGE_ROWS) {
    const st = starts.get(s.key) ?? []
    const rq = reqs.get(s.key) ?? []
    const ln = lines?.get(s.key) ?? []
    if (s.key === NOT_MAPPED && !st.length && !rq.length && !ln.length && !today.get(s.key)) continue
    const accepted = st.length
    const open = rq.reduce((n, r) => n + Math.max(0, r.req.openings || 0), 0)
    const planned = lines ? plannedStarts(ln) : null
    const total = accepted + open + (planned ?? 0)
    const now = today.get(s.key) ?? 0
    out.push({
      key: s.key,
      phase: s.phase,
      stage: s.label,
      across: s.across,
      accepted,
      open,
      planned,
      total,
      today: now,
      ofToday: now >= b.set.minGroup ? total / now : null,
      records: {
        starts: st.map(({ stage: _s, ...x }) => x),
        reqs: rq.map(({ stage: _s, ...x }) => x),
        lines: ln.map(({ stage: _s, ...x }) => x),
      },
    })
  }
  return out
}

/* ───────── ratios ───────── */

export type RatioId = 'verification' | 'dft' | 'physical' | 'postSilicon' | 'software'

export interface RatioDef {
  id: RatioId
  label: string
  top: readonly ChipStageKey[]
  bottom: readonly ChipStageKey[]
  /** The two sides in words: "design verification", "RTL design". */
  topWords: string
  bottomWords: string
  /** "engineers per RTL designer". */
  per: string
  /** The setting that holds its reference. */
  settingKey: string
}

export const RATIOS: readonly RatioDef[] = [
  {
    id: 'verification',
    label: 'Verification per RTL designer',
    top: ['verification'],
    bottom: ['rtl'],
    topWords: 'Design verification',
    bottomWords: 'RTL design',
    per: 'engineers per RTL designer',
    settingKey: 'verificationReference',
  },
  {
    id: 'dft',
    label: 'DFT per RTL designer',
    top: ['dft'],
    bottom: ['rtl'],
    topWords: 'DFT',
    bottomWords: 'RTL design',
    per: 'engineers per RTL designer',
    settingKey: 'dftReference',
  },
  {
    id: 'physical',
    label: 'Physical design and signoff per RTL designer',
    top: ['physical', 'signoff'],
    bottom: ['rtl'],
    topWords: 'Physical design and signoff',
    bottomWords: 'RTL design',
    per: 'engineers per RTL designer',
    settingKey: 'physicalReference',
  },
  {
    id: 'postSilicon',
    label: 'Post-silicon per pre-silicon engineer',
    top: ['postSilicon', 'productTest'],
    bottom: PRE_SILICON,
    topWords: 'Post-silicon',
    bottomWords: 'the seven pre-silicon stages',
    per: 'engineers per pre-silicon engineer',
    settingKey: 'postSiliconReference',
  },
  {
    id: 'software',
    label: 'Software and firmware per silicon engineer',
    top: ['software'],
    bottom: LIFECYCLE,
    topWords: 'Software and firmware',
    bottomWords: 'the nine lifecycle stages',
    per: 'engineers per silicon engineer',
    settingKey: 'softwareReference',
  },
]

/** `na`: no value to compare, as the stage below the line has fewer people than the anonymity minimum. */
export type RatioStatus = 'below' | 'near' | 'above' | 'none' | 'na'

export const RATIO_STATUS_LABEL: Record<RatioStatus, string> = {
  below: 'Below reference',
  near: 'Near reference',
  above: 'Above reference',
  none: 'No reference',
  na: 'Too few people to compare',
}

/** Why a ratio has no value: nobody below the line, or fewer than the anonymity minimum. */
export const ratioNaLabel = (def: Pick<RatioDef, 'bottomWords'>, bottom: number): string =>
  bottom === 0 ? `No one in ${inWords(def.bottomWords)} in this scope` : RATIO_STATUS_LABEL.na

const inWords = (w: string) => (/^[A-Z]{2}/.test(w) ? w : w.charAt(0).toLowerCase() + w.slice(1))

export interface RatioRow {
  id: RatioId
  label: string
  /** People in the top stages and the bottom stages (heads). */
  top: number
  bottom: number
  value: number | null
  /** Contractors in the top and bottom stages, counted in `value` only while contractors count in ratios. */
  contractorsTop: number
  contractorsBottom: number
  /** The ratio with contractors in both stages, whatever the setting; null like `value`. */
  withContractors: number | null
  /** Null when the reference is 0 (none). */
  reference: number | null
  status: RatioStatus
  statusLabel: string
  /** Value ÷ reference − 1 (−0.11 is 11% below); null without both. */
  vsReference: number | null
  def: RatioDef
  people: { top: EngPerson[]; bottom: EngPerson[] }
}

/** Who counts in a ratio: employees (and interns while they count), plus contractors while that setting is on. */
export const inRatio = (b: StagesBase, p: EngPerson): boolean =>
  b.counted(p) || (p.worker === 'Contractor' && b.set.ratioContractors)

export function ratioRows(b: StagesBase, now: readonly EngPerson[]): RatioRow[] {
  const refs = b.set.references
  const belowBy = b.set.findings.belowBy
  const min = b.set.minGroup
  const people = now.filter((p) => inRatio(b, p))
  const contractors = now.filter((p) => p.worker === 'Contractor')
  const inStages = (list: readonly EngPerson[], stages: readonly string[]) =>
    list.filter((p) => stages.includes(p.stage))
  return RATIOS.map((def) => {
    const top = inStages(people, def.top)
    const bottom = inStages(people, def.bottom)
    const cTop = inStages(contractors, def.top).length
    const cBottom = inStages(contractors, def.bottom).length
    const raw = refs[def.id]
    const reference = raw > 0 ? raw : null
    const value = bottom.length >= min ? top.length / bottom.length : null
    // With contractors in both stages: the same people plus contractors, when they are not in already.
    const extra = b.set.ratioContractors ? { top: 0, bottom: 0 } : { top: cTop, bottom: cBottom }
    const withBottom = bottom.length + extra.bottom
    const withContractors = withBottom >= min && withBottom > 0 ? (top.length + extra.top) / withBottom : null
    let status: RatioStatus = value == null ? 'na' : 'none'
    if (reference != null && value != null)
      status =
        value <= reference * (1 - belowBy) + 1e-12
          ? 'below'
          : value >= reference * (1 + belowBy) - 1e-12
            ? 'above'
            : 'near'
    return {
      id: def.id,
      label: def.label,
      top: top.length,
      bottom: bottom.length,
      value,
      contractorsTop: cTop,
      contractorsBottom: cBottom,
      withContractors,
      reference,
      status,
      statusLabel: status === 'na' ? ratioNaLabel(def, bottom.length) : RATIO_STATUS_LABEL[status],
      vsReference: reference != null && value != null ? value / reference - 1 : null,
      def,
      people: { top, bottom },
    }
  })
}

/* ───────── where each stage is staffed ───────── */

export type WhereDim = 'location' | 'businessUnit'
export const WHERE_DIMS: readonly WhereDim[] = ['location', 'businessUnit']
export const WHERE_LABEL: Record<WhereDim, 'Site' | 'Business unit'> = {
  location: 'Site',
  businessUnit: 'Business unit',
}
/** Columns shown before the rest fold into "Other". */
export const WHERE_COLUMNS = 8

export interface WhereCell {
  /** "Site" or "Business unit": the export holds both groupings. */
  groupedBy: 'Site' | 'Business unit'
  dim: WhereDim
  stageKey: StageKey
  stage: string
  group: string
  /** The column folds several smaller sites or units. */
  other: boolean
  people: number
  /** The stage's people at this site ÷ the stage's people; null under the minimum. */
  share: number | null
  stageTotal: number
  records: EngPerson[]
}

export interface WhereModel {
  cells: WhereCell[]
  columns: Record<WhereDim, string[]>
  rows: string[]
}

export function whereModel(b: StagesBase, now: readonly EngPerson[]): WhereModel {
  const counted = now.filter((p) => b.counted(p))
  const min = b.set.minGroup
  const stages = STAGE_ROWS.filter((s) => counted.some((p) => p.stage === s.key))
  const cells: WhereCell[] = []
  const columns = {} as Record<WhereDim, string[]>
  for (const dim of WHERE_DIMS) {
    const sizes = new Map<string, number>()
    for (const p of counted) {
      const g = (p.e[dim] ?? '').trim() || 'Not recorded'
      sizes.set(g, (sizes.get(g) ?? 0) + 1)
    }
    const ranked = [...sizes.entries()]
      .filter(([g]) => g !== 'Not recorded')
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .map(([g]) => g)
    const shown = ranked.length > WHERE_COLUMNS + 1 ? ranked.slice(0, WHERE_COLUMNS) : ranked
    const folded = new Set(ranked.filter((g) => !shown.includes(g)))
    const otherLabel = folded.size ? `Other (${folded.size})` : null
    const cols = [
      ...shown,
      ...(otherLabel ? [otherLabel] : []),
      ...(sizes.has('Not recorded') ? ['Not recorded'] : []),
    ]
    columns[dim] = cols
    for (const s of stages) {
      const inStage = counted.filter((p) => p.stage === s.key)
      for (const col of cols) {
        const records = inStage.filter((p) => {
          const g = (p.e[dim] ?? '').trim() || 'Not recorded'
          return col === otherLabel ? folded.has(g) : g === col
        })
        cells.push({
          groupedBy: WHERE_LABEL[dim],
          dim,
          stageKey: s.key,
          stage: s.label,
          group: col,
          other: col === otherLabel,
          people: records.length,
          share: inStage.length >= min ? records.length / inStage.length : null,
          stageTotal: inStage.length,
          records,
        })
      }
    }
  }
  return { cells, columns, rows: stages.map((s) => s.label) }
}

/* ───────── stage headcount over time ───────── */

/** The last 8 quarter ends, the as-of date last (it is one when it ends a quarter). */
export function quarterEnds(asOf: ISODate, n = 8): ISODate[] {
  const qs = quarterStart(asOf)
  const pts: ISODate[] = []
  for (let i = n - 1; i >= 1; i--) pts.push(monthEnd(addMonths(qs, -3 * i + 2)))
  pts.push(asOf)
  return pts
}

export interface TrendStage {
  key: ChipStageKey
  name: string
  values: number[]
  periods: ISODate[]
  /** The people behind each point. */
  records: EngPerson[][]
}

export function trendStages(b: StagesBase, family: string | null, points: readonly ISODate[]): TrendStage[] {
  const at = points.map((d) => byStage(b.peopleAt(d).filter((p) => b.counted(p) && inFamily(p, family))))
  const out: TrendStage[] = []
  for (const s of STAGE_ROWS) {
    if (s.key === NOT_MAPPED) continue
    const records = at.map((m) => m.get(s.key) ?? [])
    if (!records.some((r) => r.length)) continue
    out.push({
      key: s.key as ChipStageKey,
      name: s.label,
      values: records.map((r) => r.length),
      periods: [...points],
      records,
    })
  }
  return out
}

/* ───────── job functions behind the stages ───────── */

export interface FunctionRow {
  family: string
  jobFunction: string
  stageKey: StageKey
  stage: string
  source: Exclude<StageSource, 'Inferred from department'>
  employees: number
  contractors: number
  employeeFte: number
  contractorFte: number
  /** Openings of open reqs inferred to this function. */
  openings: number
  /** Planned starts with no req inferred to this function; null when the mode leaves them out. */
  planned: number | null
  records: { employees: EngPerson[]; contractors: EngPerson[]; reqs: PlacedReq[]; lines: PlacedLine[] }
}

export const NO_FUNCTION = 'Not recorded'
const NO_FAMILY = 'Not recorded'

export function functionRows(
  b: StagesBase,
  now: readonly EngPerson[],
  flight: InFlight,
  family: string | null,
): FunctionRow[] {
  const rows = new Map<string, FunctionRow>()
  const order = new Map(STAGE_ROWS.map((s, i) => [s.key, i]))
  const rowOf = (
    fam: string | null,
    fn: string | null,
    stage: StageKey,
    source: StageSource,
  ): FunctionRow => {
    const f = fam ?? NO_FAMILY
    const j = fn ?? NO_FUNCTION
    const key = `${f}\u0001${j}`
    let r = rows.get(key)
    if (!r) {
      const st = STAGE_ROWS[order.get(stage) ?? 0]
      // A req inferred to a function shows the function's own stage source.
      const own = fn ? b.ctx.jobs.stageFor(fn) : null
      r = {
        family: f,
        jobFunction: j,
        stageKey: stage,
        stage: stage === NOT_MAPPED ? '' : st.label,
        source:
          source === 'Inferred from department'
            ? own
              ? own.source === 'saved'
                ? 'Saved'
                : 'Proposed'
              : 'Not mapped'
            : source,
        employees: 0,
        contractors: 0,
        employeeFte: 0,
        contractorFte: 0,
        openings: 0,
        planned: flight.planned ? 0 : null,
        records: { employees: [], contractors: [], reqs: [], lines: [] },
      }
      rows.set(key, r)
    }
    return r
  }
  for (const p of now) {
    if (!inFamily(p, family)) continue
    const counted = b.counted(p)
    if (!counted && p.worker !== 'Contractor') continue
    const r = rowOf(p.family, p.jobFunction, p.stage, p.source)
    if (counted) {
      r.employees++
      r.employeeFte = round2(r.employeeFte + p.fte)
      r.records.employees.push(p)
    } else {
      r.contractors++
      r.contractorFte = round2(r.contractorFte + p.fte)
      r.records.contractors.push(p)
    }
  }
  for (const q of flight.reqs) {
    if (!inFamily(q.place, family)) continue
    const r = rowOf(q.place.family, q.place.jobFunction, q.place.stage, q.place.source)
    r.openings += Math.max(0, q.req.openings || 0)
    r.records.reqs.push(q)
  }
  for (const l of flight.planned ?? []) {
    if (!inFamily(l.place, family)) continue
    const r = rowOf(l.place.family, l.place.jobFunction, l.place.stage, l.place.source)
    r.planned = (r.planned ?? 0) + l.view.line.plannedHires
    r.records.lines.push(l)
  }
  return [...rows.values()].sort(
    (x, y) =>
      (order.get(x.stageKey) ?? 0) - (order.get(y.stageKey) ?? 0) ||
      x.family.localeCompare(y.family) ||
      y.employees - x.employees ||
      x.jobFunction.localeCompare(y.jobFunction),
  )
}
