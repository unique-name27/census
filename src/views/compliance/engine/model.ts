/**
 * The Compliance model: every engine's result for one analytics context. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import { buildBase, type ComplianceBase } from './base'
import { computeDeadlines, type DeadlinesModel } from './deadlines'
import { computeExport, type ExportModel } from './exportControl'
import { computeI9, type I9Model } from './i9'
import type { ComplianceSettings } from './settings'
import type { TrainingModel } from './training'
import { computeWork, type WorkModel } from './work'

export interface ComplianceCore {
  base: ComplianceBase
  settings: ComplianceSettings
  work: WorkModel
  i9: I9Model
  exportControl: ExportModel
  deadlines: DeadlinesModel
}

export interface ComplianceModel extends ComplianceCore {
  training: TrainingModel
}

/** Everything but the training summary (which runs the Talent learning engine): cheap enough for the scorecard. */
export function computeCore(ctx: AnalyticsContext): ComplianceCore {
  const base = buildBase(ctx)
  const s = base.settings
  return {
    base,
    settings: s,
    work: computeWork(base, ctx.window),
    i9: computeI9(base, ctx.window, ctx.prior),
    exportControl: computeExport(base),
    deadlines: computeDeadlines({ asOf: ctx.asOf, employees: ctx.data.employees }, s.deadlineDays),
  }
}
