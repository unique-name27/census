/**
 * Education and quality of hire (docs/ANALYSES.md, part 2): its definition for the Special
 * analyses shell. The model (`./model`) holds the cohort, every cut with its interval and expected
 * score, the KPI strip and the readout.
 */
import type { AnalyticsContext } from '@/data/context'
import { loaded, present } from '../../fields'
import type { AnalysisDef, Missing, Readiness } from '../../types'
import { cohortWindow } from './cohort'
import { QUALITY_FIGURES as F } from './ids'
import { QID } from './metrics'
import { type QualityModel, qualityModel, windowWords } from './model'
import { qualitySettings } from './settings'

export type { QualityModel } from './model'

/** The hire window in force: the `cohortMonths` months ending `retentionMonths` before the as-of date. */
export const hireWindow = (ctx: Pick<AnalyticsContext, 'asOf' | 'metrics'>) =>
  cohortWindow(ctx.asOf, qualitySettings(ctx.metrics))

export function qualityReady(ctx: AnalyticsContext): Readiness {
  if (!present(ctx, 'employees.hireDate'))
    return { ready: false, message: 'Add Hire date to Employees to see quality of hire.', dataRoom: true }
  if (!present(ctx, 'employees.terminationDate'))
    return {
      ready: false,
      message: 'Add leavers (Termination date) to Employees to see who stayed a year.',
      dataRoom: true,
    }
  return { ready: true }
}

const EDUCATION = ['University', 'Degree level', 'Field of study'] as const
const EDUCATION_REF = {
  University: 'employees.university',
  'Degree level': 'employees.degreeLevel',
  'Field of study': 'employees.fieldOfStudy',
} as const

export function qualityMissing(ctx: AnalyticsContext): Missing[] {
  const out: Missing[] = []
  if (!loaded(ctx, 'reviews'))
    out.push({
      id: 'reviews',
      what: 'Reviews',
      message: 'Upload Reviews to score the first full review. Until then only Stayed a year shows.',
      refs: ['reviews.rating', 'reviews.cycleDate'],
      figures: [],
    })
  const absent = EDUCATION.filter((f) => !present(ctx, EDUCATION_REF[f]))
  if (absent.length === EDUCATION.length)
    out.push({
      id: 'education',
      what: 'University, Degree level or Field of study',
      message: 'Add University, Degree level or Field of study to Employees to compare by education.',
      refs: Object.values(EDUCATION_REF),
      figures: [F.university, F.universityParts, F.degree, F.field, F.degreeField],
    })
  else {
    const figuresOf: Record<(typeof EDUCATION)[number], string[]> = {
      University: [F.university, F.universityParts],
      'Degree level': [F.degree, F.degreeField],
      'Field of study': [F.field, F.degreeField],
    }
    for (const f of absent)
      out.push({
        id: EDUCATION_REF[f].split('.')[1],
        what: f,
        message: `Add ${f} to Employees to see this.`,
        refs: [EDUCATION_REF[f]],
        figures: figuresOf[f],
      })
  }
  if (!loaded(ctx, 'candidates'))
    out.push({
      id: 'candidates',
      what: 'Candidates',
      message: 'Upload Candidates to see where hires came from.',
      refs: ['candidates.source', 'candidates.hiredDate'],
      figures: [F.source],
    })
  return out
}

export const QUALITY: AnalysisDef<QualityModel> = {
  key: 'quality',
  label: 'Quality of hire',
  short: 'Quality',
  title: 'Education and quality of hire',
  dek: (ctx) =>
    `Do hires from some universities, degrees and fields of study perform better and stay longer? Hires from ${windowWords(hireWindow(ctx))}.`,
  // A fixed cohort: hires old enough to have a first review and a year to stay, whatever the period.
  window: (ctx) => {
    const w = hireWindow(ctx)
    return { start: w.start, end: w.end, label: `Hires ${windowWords(w)}`, ignoresPeriod: true }
  },
  leadMetric: QID.score,
  leadFigure: F.university,
  figures: Object.values(F),
  ready: qualityReady,
  missing: qualityMissing,
  model: qualityModel,
}
