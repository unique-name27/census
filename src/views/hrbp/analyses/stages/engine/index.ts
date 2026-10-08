/**
 * Engineering resources by chip development stage (docs/ANALYSES.md, part 4): its definition for
 * the Special analyses shell, and the barrel of its engine.
 *
 * Who counts and in which stage comes from the job architecture (`ctx.jobs.engineeringPlace`),
 * never from the department, except when nobody in the data is placed that way (engineering
 * departments then stand in, and the note says so). Requisitions and the hiring plan carry no job
 * function in this change: a req or plan line takes the most common job function of its
 * department's active employees, marked "Inferred from department". See `./base` for who counts,
 * `./capacity` for the counts, `./hiring` for hiring in flight, `./kpis` and `./findings` for the
 * strip and the readout, and `./model` for the model per job family.
 */
import type { AnalyticsContext } from '@/data/context'
import { jobLevelsSwapped, type SwappedJobLevels, swappedText } from '@/data/import/swap'
import type { Employee } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { loaded, present } from '../../fields'
import { AID } from '../../metrics'
import type { AnalysisDef, Missing, Readiness } from '../../types'
import { stagesBase } from './base'
import { STAGES_FIGURES as F } from './ids'
import { type StagesModel, stagesModel } from './model'

export type { StagesModel } from './model'
export { stagesModelFor } from './model'

const swapCache = new WeakMap<readonly Employee[], SwappedJobLevels | null>()

/** The two job columns look swapped in Employees (`jobLevelsSwapped`), memoized on the rows. */
function swappedJobs(rows: readonly Employee[]): SwappedJobLevels | null {
  let hit = swapCache.get(rows)
  if (hit === undefined) {
    hit = jobLevelsSwapped(rows)
    swapCache.set(rows, hit)
  }
  return hit
}

export function stagesReady(ctx: AnalyticsContext): Readiness {
  if (!present(ctx, 'employees.jobFunction'))
    return {
      ready: false,
      message:
        'Add Job function to Employees, and give each job function a stage in Settings, Official lists, to see engineering by stage.',
      dataRoom: true,
    }
  // Data mapped before job families held job functions (families such as Design Verification
  // inside functions such as Engineering) would read as plausible but meaningless stages.
  const swapped = swappedJobs(ctx.all.employees)
  if (swapped)
    return {
      ready: false,
      message: `${swappedText(swapped)} Upload Employees again and swap the two columns in the mapping step.`,
      dataRoom: true,
    }
  return { ready: true }
}

export function stagesMissing(ctx: AnalyticsContext): Missing[] {
  const out: Missing[] = []
  if (!present(ctx, 'employees.fte'))
    out.push({
      id: 'fte',
      what: 'FTE',
      message: 'No FTE in Employees, so each person counts as 1.',
      refs: ['employees.fte'],
      figures: [],
    })
  if (!loaded(ctx, 'requisitions'))
    out.push({
      id: 'requisitions',
      what: 'Requisitions',
      message: 'Upload Requisitions to see open reqs by stage.',
      refs: ['requisitions.status', 'requisitions.openings'],
      figures: [F.hiring],
    })
  if (!loaded(ctx, 'hiringPlan'))
    out.push({
      id: 'hiringPlan',
      what: 'Hiring plan',
      message: 'No hiring plan loaded.',
      refs: ['hiringPlan.period', 'hiringPlan.plannedHires'],
      figures: [],
    })
  // The engine's own test: nobody is placed by a family marked engineering or a saved stage.
  if (stagesBase(ctx).fallback)
    out.push({
      id: 'engineeringFamily',
      what: 'A job family marked engineering',
      message: 'Engineering departments used: no job family is marked engineering.',
      refs: ['employees.jobFamily'],
      figures: [],
    })
  return out
}

export const STAGES: AnalysisDef<StagesModel> = {
  key: 'stages',
  label: 'Engineering by stage',
  short: 'Stages',
  title: 'Engineering by chip development stage',
  dek: (ctx) =>
    `Where do our engineers sit across chip development, from architecture to production test, and where are we hiring? People on ${formatDate(ctx.asOf)}.`,
  // People on the as-of date; plans and the trend state their own spans.
  window: (ctx) => ({
    start: null,
    end: ctx.asOf,
    label: `People on ${formatDate(ctx.asOf)}`,
    ignoresPeriod: true,
  }),
  leadMetric: AID.stageCapacity,
  leadFigure: F.capacity,
  figures: Object.values(F),
  ready: stagesReady,
  missing: stagesMissing,
  model: stagesModel,
}
