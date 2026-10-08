/**
 * Education and quality of hire, the model (docs/ANALYSES.md, part 2): the cohort of the scope
 * and of the company, every cut the figures draw with its interval and expected score, the KPI
 * strip and the readout. Computed only when the tab (or an export, or Ask) asks for it, through
 * `analysisModel(ctx, 'quality')`. Pure.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { formatDate } from '@/lib/dates'
import { tagFindings, tagKpis } from '@/views/hrbp/engine/drillUses'
import type { AnalysisModel } from '../../types'
import { type Coverage, cellsOf, cohortInputs, cohortOf, type Hire } from './cohort'
import { type DrillScope, hiresSpec } from './drill'
import { qualityFindings, type Subject } from './findings'
import {
  CUTS,
  type CutKey,
  type DegreeFieldCell,
  degreeFieldCells,
  type GroupScore,
  scoreGroup,
} from './groups'
import {
  BUSINESS_UNIT,
  DEGREE,
  EDUCATION,
  FIELD,
  ifPresent,
  MIX,
  PARTS,
  PERFORMANCE,
  RETENTION,
  SCORE,
  SOURCE,
  UNIVERSITY,
  usesIn,
} from './lineage'
import { QID } from './metrics'
import { type QualitySettings, qualitySettings } from './settings'
import { mixBenchmark } from './stats'
import { hiresText, textOf } from './wording'

export interface QualityModel extends AnalysisModel {
  s: QualitySettings
  /** The hire window, and how it reads: "1 Oct 2023 to 30 Sep 2025". */
  window: { start: string; end: string }
  windowText: string
  coverage: Coverage
  /** The scope's cohort, by hire date. */
  hires: readonly Hire[]
  /** The scope as one group, and the company (the benchmark every comparison uses). */
  scope: GroupScore
  company: GroupScore
  /** Each cut of the scope's hires, rows in the figures' default order. */
  cuts: Record<CutKey, GroupScore[]>
  /** Degree level by field of study over the scope's hires. */
  cells: DegreeFieldCell[]
  counts: {
    cohort: number
    scored: number
    rated: number
    retained: number
    leftBeforeReview: number
    notScored: number
    recorded: number
    /** Cohort hires linked to a hired application. */
    linked: number
  }
  drill: DrillScope
  /** The same, for the company's records (the Company rows and comparisons). */
  companyDrill: DrillScope
  /** The fields behind each figure and tile, resolved in this context. */
  uses: Record<
    | 'score'
    | 'retention'
    | 'performance'
    | 'education'
    | 'university'
    | 'universityParts'
    | 'parts'
    | 'degree'
    | 'field'
    | 'degreeField'
    | 'source',
    readonly FieldRef[]
  >
}

/** "1 Oct 2023 to 30 Sep 2025". */
export const windowWords = (w: { start: string; end: string }): string =>
  `${formatDate(w.start)} to ${formatDate(w.end)}`

export function qualityModel(ctx: AnalyticsContext): QualityModel {
  const s = qualitySettings(ctx.metrics)
  const x = cohortInputs(ctx, s)
  const hires = cohortOf(ctx.data.employees, x)
  const companyHires = ctx.isCompany ? hires : cohortOf(ctx.all.employees, x)
  const mix = mixBenchmark(companyHires, (h) => h.Q, cellsOf, s.minCell)
  // The company first (its mean is the line every group is judged against), then the scope.
  const sized: 'scored' | 'retained' = x.coverage.reviews ? 'scored' : 'retained'
  const base = { s, mix, sized, companyQ: null as number | null }
  const company = scoreGroup('company', 'Company', 'value', companyHires, base)
  const c = { ...base, companyQ: company.q }
  const scope = ctx.isCompany
    ? scoreGroup('company', 'Company', 'value', hires, c)
    : scoreGroup('scope', ctx.scopeLabel, 'value', hires, c)
  const cuts: Record<CutKey, GroupScore[]> = {
    university: CUTS.university(hires, c),
    degree: CUTS.degree(hires, c),
    field: CUTS.field(hires, c),
    source: CUTS.source(hires, c),
    businessUnit: CUTS.businessUnit(hires, c),
    location: CUTS.location(hires, c),
  }
  const cells = degreeFieldCells(cuts.field, c, cuts.degree)
  const regretted = x.isRegretted
  const drill: DrillScope = {
    scopeLabel: ctx.scopeLabel,
    isCompany: ctx.isCompany,
    window: x.window,
    asOf: ctx.asOf,
    isRegretted: (h) => regretted(h.e),
  }
  const companyDrill: DrillScope = { ...drill, scopeLabel: 'Whole company', isCompany: true }
  const has = x.coverage
  const edu = (on: boolean, l: typeof UNIVERSITY) => (on ? l : ifPresent(l))
  const uses = {
    score: usesIn(ctx, SCORE),
    retention: usesIn(ctx, RETENTION),
    performance: usesIn(ctx, PERFORMANCE),
    education: usesIn(ctx, EDUCATION),
    university: usesIn(ctx, SCORE, MIX, edu(has.university, UNIVERSITY)),
    universityParts: usesIn(ctx, SCORE, edu(has.university, UNIVERSITY)),
    parts: usesIn(ctx, PARTS),
    degree: usesIn(ctx, SCORE, MIX, edu(has.degree, DEGREE)),
    field: usesIn(ctx, SCORE, MIX, edu(has.field, FIELD)),
    degreeField: usesIn(ctx, SCORE, edu(has.degree, DEGREE), edu(has.field, FIELD)),
    source: usesIn(ctx, SCORE, MIX, has.candidates ? SOURCE : ifPresent(SOURCE)),
  }
  const window = x.window
  const windowText = windowWords(window)
  const counts = {
    cohort: hires.length,
    scored: scope.n,
    rated: scope.rated.length,
    retained: scope.retained.length,
    leftBeforeReview: hires.filter((h) => h.leftBeforeReview).length,
    notScored: hires.filter((h) => h.Q == null).length,
    recorded: hires.filter((h) => h.recorded).length,
    linked: hires.filter((h) => h.app).length,
  }

  const subjects: Subject[] = [
    ...cuts.university.map((g) => ({ kind: 'university' as const, g })),
    ...cuts.degree.map((g) => ({ kind: 'degree' as const, g })),
    ...cuts.field.map((g) => ({ kind: 'field' as const, g })),
    ...cuts.source.map((g) => ({ kind: 'source' as const, g })),
  ]
  const findings: Finding[] = tagFindings(
    qualityFindings({
      s,
      d: drill,
      isCompany: ctx.isCompany,
      scope,
      company,
      subjects,
      cells,
      hires,
      educationLoaded: has.university || has.degree,
      uses: {
        groups: {
          university: uses.university,
          degree: uses.degree,
          field: uses.field,
          source: uses.source,
        },
        cells: uses.degreeField,
        education: usesIn(ctx, EDUCATION, BUSINESS_UNIT),
      },
    }),
  )

  return {
    kpis: tagKpis(
      qualityKpis(ctx, { s, scope, company, counts, drill, companyDrill, uses, windowText, has, hires }),
    ),
    findings,
    s,
    window,
    windowText,
    coverage: has,
    hires,
    scope,
    company,
    cuts,
    cells,
    counts,
    drill,
    companyDrill,
    uses,
  }
}

interface KpiInputs {
  s: QualitySettings
  scope: GroupScore
  company: GroupScore
  counts: QualityModel['counts']
  drill: DrillScope
  companyDrill: DrillScope
  uses: QualityModel['uses']
  windowText: string
  has: Coverage
  hires: readonly Hire[]
}

const NO_REVIEWS = 'Upload Reviews to score the first full review'
const NO_LEAVERS = 'Add leavers (Termination date) to Employees'

function qualityKpis(ctx: AnalyticsContext, k: KpiInputs): Kpi[] {
  const { s, scope, company, counts, drill } = k
  const min = s.minGroup
  const vsCompany = !ctx.isCompany
  const delta = (a: number | null, b: number | null) => (vsCompany && a != null && b != null ? a - b : null)
  const small = (n: number, v: number | null) => n > 0 && n < min && v == null
  const weights = `${Math.round((s.wP / (s.wP + s.wR)) * 100)}% first review score and ${Math.round((s.wR / (s.wP + s.wR)) * 100)}% retention score${s.weightsDefaulted ? ' (both weights are 0, so each counts half)' : ''}`
  const qDelta = delta(scope.q, company.q)
  const rDelta = delta(scope.r, company.r)
  const pDelta = delta(scope.p, company.p)
  const notStayed = scope.retained.filter((h) => h.R === 0).length
  const missing = k.hires.filter((h) => !h.recorded)
  const tiles: Kpi[] = [
    {
      id: 'quality-score',
      metricId: QID.score,
      label: 'Quality of hire',
      value: scope.q,
      format: 'num1',
      ...(vsCompany
        ? {
            delta: qDelta,
            deltaLabel: 'vs company',
            // Colored only when the interval clears the company line.
            deltaMaterial: scope.status !== 'unclear',
            deltaDrill:
              company.q != null
                ? () => hiresSpec(k.companyDrill, 'Scored hires, company', company.scored)
                : undefined,
          }
        : {}),
      goodDirection: 'up',
      note: !k.has.reviews ? NO_REVIEWS : !k.has.exitData ? NO_LEAVERS : `Hires ${k.windowText}`,
      suppressed: small(scope.n, scope.q),
      definition: textOf(ctx.metrics, QID.score),
      formula:
        scope.q != null
          ? `Mean over ${hiresText(scope.n)} scored, ${weights}. Interval ${(scope.low as number).toFixed(1)} to ${(scope.high as number).toFixed(1)} at ${Math.round(s.interval * 100)}%.`
          : undefined,
      drill: scope.q != null ? () => hiresSpec(drill, 'Scored hires', scope.scored) : undefined,
      uses: k.uses.score,
    },
    {
      id: 'quality-retention',
      metricId: QID.retention,
      label: 'Stayed a year',
      value: scope.r,
      format: 'pct',
      ...(vsCompany
        ? {
            delta: rDelta,
            deltaLabel: 'vs company',
            deltaMaterial: rDelta != null && Math.abs(rDelta) >= 0.05,
            deltaDrill:
              company.r != null
                ? () =>
                    hiresSpec(k.companyDrill, 'Hires with a retention score, company', company.retained, {
                      order: 'notStayedFirst',
                    })
                : undefined,
          }
        : {}),
      goodDirection: 'up',
      note: !k.has.exitData
        ? NO_LEAVERS
        : scope.r != null
          ? `${(scope.retained.length - notStayed).toLocaleString('en-US')} of ${hiresText(scope.retained.length)}`
          : undefined,
      suppressed: small(scope.retained.length, scope.r),
      definition: textOf(ctx.metrics, QID.retention),
      formula:
        scope.r != null
          ? `${(scope.retained.length - notStayed).toLocaleString('en-US')} of ${hiresText(scope.retained.length)} with a retention score stayed a year; ${notStayed.toLocaleString('en-US')} did not.`
          : undefined,
      drill:
        scope.r != null
          ? () =>
              hiresSpec(drill, 'Hires with a retention score', scope.retained, { order: 'notStayedFirst' })
          : undefined,
      uses: k.uses.retention,
    },
    {
      id: 'quality-performance',
      metricId: QID.performance,
      label: 'First review score',
      value: scope.p,
      format: 'num1',
      ...(vsCompany
        ? {
            delta: pDelta,
            deltaLabel: 'vs company',
            deltaMaterial: pDelta != null && Math.abs(pDelta) >= s.minGap,
            deltaDrill:
              company.p != null
                ? () => hiresSpec(k.companyDrill, 'Rated hires, company', company.rated)
                : undefined,
          }
        : {}),
      goodDirection: 'up',
      note: !k.has.reviews
        ? NO_REVIEWS
        : scope.p != null
          ? `${hiresText(scope.rated.length)} rated`
          : undefined,
      suppressed: small(scope.rated.length, scope.p),
      definition: textOf(ctx.metrics, QID.performance),
      formula:
        scope.p != null
          ? `Mean first review score of ${hiresText(scope.rated.length)}, ${s.scoring === 'scale' ? 'on the 1 to 5 scale (Meets is 50)' : 'as a percentile within each review cycle'}.`
          : undefined,
      drill: scope.p != null ? () => hiresSpec(drill, 'Rated hires', scope.rated) : undefined,
      uses: k.uses.performance,
    },
    {
      id: 'quality-cohort',
      metricId: QID.cohort,
      label: 'Hires scored',
      value: k.has.reviews && k.has.exitData ? counts.scored : null,
      format: 'int',
      goodDirection: null,
      note: `${counts.leftBeforeReview.toLocaleString('en-US')} left before a first review; ${counts.notScored.toLocaleString('en-US')} not scored`,
      definition: textOf(ctx.metrics, QID.cohort),
      formula: `${hiresText(counts.cohort)} in the cohort: ${counts.scored.toLocaleString('en-US')} scored, ${counts.notScored.toLocaleString('en-US')} not scored.`,
      drill: counts.cohort
        ? () =>
            hiresSpec(drill, 'Cohort hires', k.hires, {
              order: 'notScoredFirst',
              note: 'Every hire in the cohort, those not scored first. Each row shows what quality of hire is built from; no row has a score of its own.',
            })
        : undefined,
      noteDrill: counts.leftBeforeReview
        ? () =>
            hiresSpec(
              drill,
              'Hires who left before a first review',
              k.hires.filter((h) => h.leftBeforeReview),
            )
        : undefined,
      uses: k.uses.score,
    },
    {
      id: 'quality-education',
      metricId: QID.education,
      label: 'Education recorded',
      value: counts.cohort >= min ? counts.recorded / counts.cohort : null,
      format: 'pct',
      goodDirection: 'up',
      note: counts.cohort ? `${hiresText(missing.length)} with neither` : undefined,
      suppressed: counts.cohort > 0 && counts.cohort < min,
      definition: textOf(ctx.metrics, QID.education),
      formula: counts.cohort
        ? `${counts.recorded.toLocaleString('en-US')} of ${hiresText(counts.cohort)} have a university or a degree level.`
        : undefined,
      drill:
        missing.length && counts.cohort >= min
          ? () => hiresSpec(drill, 'Hires with no education recorded', missing)
          : undefined,
      uses: k.uses.education,
    },
  ]
  return tiles
}
