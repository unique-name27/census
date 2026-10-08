/**
 * Engineering by chip development stage (docs/ANALYSES.md, part 4): the whole model for one job
 * family, or All engineering (null). The Special analyses shell computes All engineering through
 * `analysisModel(ctx, 'stages')`; the panel's job family control asks `stagesModelFor(ctx, family)`,
 * cached per context and family, so a family's KPI strip, readout and figures come from one place.
 * Pure.
 */
import { S } from '@/access/surfaces'
import type { AnalyticsContext } from '@/data/context'
import type { ISODate } from '@/data/schema'
import { addMonths } from '@/lib/dates'
import { hasExitData } from '@/lib/people'
import type { AnalysisModel } from '../../types'
import { type EngPerson, inFamily, type StagesBase, stagesBase } from './base'
import {
  type CapacityRow,
  capacityRows,
  type FunctionRow,
  functionRows,
  type HiringRow,
  hiringRows,
  quarterEnds,
  type RatioRow,
  ratioRows,
  type TrendStage,
  trendStages,
  type WhereModel,
  whereModel,
} from './capacity'
import { type StagesReadout, stagesFindings } from './findings'
import { type InFlight, inFlight } from './hiring'
import { stagesKpis } from './kpis'
import { SID } from './metrics'
import { stagesTables } from './tables'

export interface FamilyOption {
  name: string
  /** Engineering people in it (every worker type), in scope. */
  people: number
  /**
   * Every function of the family counts (the family is marked engineering). False: only its
   * functions with a saved stage count, as EDA & CAD Infrastructure does in Corporate.
   */
  engineering: boolean
  /** The family's functions with engineering people in scope, largest first. */
  functions: string[]
}

export interface StagesModel extends AnalysisModel {
  /** The job family the model is for; null is All engineering. */
  family: string | null
  /** The families with engineering people in scope, largest first (the job family control). */
  families: FamilyOption[]
  /** Engineering departments stand in: no job family counts as engineering and no stage is saved. */
  fallback: boolean
  hasFte: boolean
  /** Planned starts are shown in this mode. */
  showPlanned: boolean
  /** The comparison date of the capacity's change column and the first two tiles. */
  yearAgoDate: ISODate
  /** False when no Employees row has a termination date: nothing is said about a year ago. */
  hasHistory: boolean
  /** Engineering people on the as-of date in the family (every worker type). */
  people: EngPerson[]
  capacity: CapacityRow[]
  hiring: HiringRow[]
  flight: InFlight
  ratios: RatioRow[]
  where: WhereModel
  trend: TrendStage[]
  functions: FunctionRow[]
  /** Chart notes taken from the findings that cite them. */
  notes: StagesReadout['notes']
  base: StagesBase
}

const cache = new WeakMap<AnalyticsContext, Map<string, StagesModel>>()

/** The model for a job family (null: All engineering), computed once per context and family. */
export function stagesModelFor(ctx: AnalyticsContext, family: string | null): StagesModel {
  let byFamily = cache.get(ctx)
  if (!byFamily) {
    byFamily = new Map()
    cache.set(ctx, byFamily)
  }
  const key = family ?? ''
  let hit = byFamily.get(key)
  if (!hit) {
    hit = compute(ctx, family)
    byFamily.set(key, hit)
  }
  return hit
}

/** All engineering: what the shell lays out, exports and Ask read. */
export const stagesModel = (ctx: AnalyticsContext): StagesModel => stagesModelFor(ctx, null)

function compute(ctx: AnalyticsContext, family: string | null): StagesModel {
  const b = stagesBase(ctx)
  const showPlanned = ctx.access.can(S.metric(SID.planned))
  const all = b.peopleAt(b.asOf)
  const families = familyOptions(all, (f) => ctx.jobs.engineeringOf(f).engineering)
  const now = all.filter((p) => inFamily(p, family))
  const hasHistory = hasExitData(ctx.all.employees)
  const yearAgoDate = addMonths(b.asOf, -12)
  const yearAgo = hasHistory ? b.peopleAt(yearAgoDate).filter((p) => inFamily(p, family)) : null
  const flight = inFlight(b, showPlanned)
  const capacity = capacityRows(b, now, yearAgo)
  const hiring = hiringRows(b, flight, capacity, family)
  const ratios = ratioRows(b, now)
  const counted = now.filter((p) => b.counted(p))
  const readout = stagesFindings(b, { family, capacity, hiring, ratios, flight, counted })
  const kpis = stagesKpis(b, { family, now, yearAgo, yearAgoDate, ratios, flight })
  const where = whereModel(b, now)
  return {
    kpis,
    findings: readout.findings,
    tables: stagesTables({ capacity, hiring, ratios, where, showPlanned }),
    notes: readout.notes,
    family,
    families,
    fallback: b.fallback,
    hasFte: b.hasFte,
    showPlanned,
    yearAgoDate,
    hasHistory,
    people: now,
    capacity,
    hiring,
    flight,
    ratios,
    where,
    trend: trendStages(b, family, quarterEnds(b.asOf)),
    functions: functionRows(b, now, flight, family),
    base: b,
  }
}

const NO_FAMILY = 'No job family'

/**
 * A family as the job family control lists it. A family not marked engineering counts only
 * through its functions with a saved stage, so the control says which: "Corporate (EDA & CAD
 * Infrastructure)", or "Product & Test Operations (functions with a stage)" for more than two.
 */
export function familyMenuLabel(f: Pick<FamilyOption, 'name' | 'engineering' | 'functions'>): string {
  if (f.engineering) return f.name
  if (f.functions.length > 0 && f.functions.length <= 2) return `${f.name} (${f.functions.join(' and ')})`
  return `${f.name} (functions with a stage)`
}

function familyOptions(
  people: readonly EngPerson[],
  engineering: (family: string) => boolean,
): FamilyOption[] {
  const c = new Map<string, number>()
  const fns = new Map<string, Map<string, number>>()
  for (const p of people) {
    const k = p.family ?? NO_FAMILY
    c.set(k, (c.get(k) ?? 0) + 1)
    if (!p.jobFunction) continue
    const byFn = fns.get(k) ?? new Map<string, number>()
    byFn.set(p.jobFunction, (byFn.get(p.jobFunction) ?? 0) + 1)
    fns.set(k, byFn)
  }
  return [...c.entries()]
    .filter(([name]) => name !== NO_FAMILY)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(([name, n]) => ({
      name,
      people: n,
      engineering: engineering(name),
      functions: [...(fns.get(name) ?? [])]
        .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
        .map(([f]) => f),
    }))
}
