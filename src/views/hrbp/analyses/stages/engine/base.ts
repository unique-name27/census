/**
 * Who counts in Engineering by stage and in which stage (docs/ANALYSES.md, 4.4), built once per
 * analytics context. Pure.
 *
 * A person counts where the job architecture places them (`ctx.jobs.engineeringPlace`): a job
 * function with a saved stage, or any function of a job family that counts as engineering (its
 * stage saved, proposed from keywords, or none: Not mapped). When nobody in the company's data is
 * placed that way (no job family marked engineering, no stage saved), the engineering departments
 * People stats uses stand in, and the note says so.
 *
 * Requisitions and the hiring plan carry no job function in this change (docs/TAXONOMY.md), so a
 * req or a plan line takes the most common job function of its department's active employees
 * across the company, marked "Inferred from department".
 */
import type { AnalyticsContext } from '@/data/context'
import { CHIP_STAGES, type ChipStageKey, type Employee, type ISODate } from '@/data/schema'
import { isActiveAt } from '@/data/scope'
import { NOT_MAPPED, type Placed, type StageKey, stagePlacer } from './placer'
import { type StagesSettings, stagesSettings } from './settings'

export {
  NOT_MAPPED,
  type Placed,
  type StageKey,
  type StagePlacer,
  type StageSource,
  stagePlacer,
} from './placer'

export interface StageInfo {
  key: StageKey
  label: string
  phase: string
  /** Software and firmware, Shared engineering and Not mapped: drawn after the nine, past a hairline. */
  across: boolean
}

/** Every row in order: the nine lifecycle stages, the two across it, then Not mapped. */
export const STAGE_ROWS: readonly StageInfo[] = [
  ...CHIP_STAGES.map((s) => ({ key: s.key, label: s.label, phase: s.phase, across: s.acrossLifecycle })),
  { key: NOT_MAPPED, label: 'Not mapped', phase: 'No stage', across: true },
]

const INFO = new Map<StageKey, StageInfo>(STAGE_ROWS.map((s) => [s.key, s]))
export const stageInfo = (k: StageKey): StageInfo => INFO.get(k) as StageInfo
export const stageLabel = (k: StageKey): string => stageInfo(k).label

/** The nine stages of the lifecycle (pre-silicon and post-silicon). */
export const LIFECYCLE: readonly ChipStageKey[] = CHIP_STAGES.filter((s) => !s.acrossLifecycle).map(
  (s) => s.key,
)
/** The seven pre-silicon stages. */
export const PRE_SILICON: readonly ChipStageKey[] = CHIP_STAGES.filter((s) =>
  s.phase.startsWith('Pre-silicon'),
).map((s) => s.key)

export type Worker = 'Employee' | 'Contractor' | 'Intern'

export interface EngPerson extends Placed {
  e: Employee
  worker: Worker
  /** Share of a full-time schedule; blank counts as 1. */
  fte: number
}

/** FTE as the engine reads it: blank (or not a number) is 1; a percentage typed as 80 reads as 0.8. */
export function fteOf(e: Pick<Employee, 'fte'>): number {
  const v = e.fte
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 1
  if (v > 1.5) return v <= 150 ? v / 100 : 1
  return v
}

const workerOf = (e: Employee): Worker | null =>
  e.employmentType === 'Employee' || e.employmentType === 'Contractor' || e.employmentType === 'Intern'
    ? e.employmentType
    : null

export interface StagesBase {
  ctx: AnalyticsContext
  asOf: ISODate
  set: StagesSettings
  /** No job family counts as engineering and no stage is saved: engineering departments stand in. */
  fallback: boolean
  /** Any Employees row carries an FTE. */
  hasFte: boolean
  /** Where a person counts, or null when outside engineering. */
  placeOf(e: Employee): Placed | null
  /** The most common job function of a department's active employees, company-wide. */
  functionOfDepartment(department: string | null | undefined): string | null
  /** Where a req or plan line of a department counts, inferred from the department. */
  placeOfDepartment(department: string | null | undefined): Placed | null
  /** Engineering people active on a date (employees, contractors and interns), in scope. */
  peopleAt(date: ISODate): EngPerson[]
  /** Counted with employees: employees, and interns while they count. */
  counted(p: EngPerson): boolean
}

const cache = new WeakMap<AnalyticsContext, StagesBase>()

export function stagesBase(ctx: AnalyticsContext): StagesBase {
  const hit = cache.get(ctx)
  if (hit) return hit
  const set = stagesSettings(ctx.metrics)
  const placer = stagePlacer(ctx.jobs, ctx.all.employees, ctx.asOf)
  const hasFte = ctx.all.employees.some((e) => typeof e.fte === 'number')

  const at = new Map<ISODate, EngPerson[]>()
  const peopleAt = (date: ISODate): EngPerson[] => {
    const got = at.get(date)
    if (got) return got
    const out: EngPerson[] = []
    for (const e of ctx.data.employees) {
      if (!isActiveAt(e, date)) continue
      const worker = workerOf(e)
      if (!worker) continue
      const p = placer.person(e)
      if (!p) continue
      out.push({ ...p, e, worker, fte: fteOf(e) })
    }
    at.set(date, out)
    return out
  }

  const base: StagesBase = {
    ctx,
    asOf: ctx.asOf,
    set,
    fallback: placer.fallback,
    hasFte,
    placeOf: placer.person,
    functionOfDepartment: placer.functionOfDepartment,
    placeOfDepartment: placer.department,
    peopleAt,
    counted: (p) => p.worker === 'Employee' || (p.worker === 'Intern' && set.countInterns),
  }
  cache.set(ctx, base)
  return base
}

/** In a job family, or anywhere for All engineering (null). */
export const inFamily = (p: Pick<Placed, 'family'>, family: string | null): boolean =>
  family == null || p.family === family
