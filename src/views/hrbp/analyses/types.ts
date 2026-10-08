/**
 * People stats > Special analyses: how an analysis plugs into the tab (docs/ANALYSES.md, part 1).
 *
 * The tab is a shell. It owns the address (`#hrbp.analyses:<key>`, `./tab`), the picker, the
 * layout every analysis shares, the empty state of an analysis that is not ready, Manager mode's
 * choices and the whole-view export. Each analysis owns one folder:
 *
 *   src/views/hrbp/analyses/<key>/
 *     engine/index.ts   `<KEY>: AnalysisDef<YourModel>`: the pure definition and the model (below)
 *     engine/ids.ts     every figure id it draws (unique across the four; the registry test checks)
 *     engine/*.ts       the engine itself: pure functions of `AnalyticsContext`, Vitest beside each
 *     ui/Panel.tsx      `export function Panel(props: AnalysisPanelProps<YourModel>)`: its figures
 *
 * and is listed once in `../registry.ts` (the definitions, pure) and `../panels.tsx` (the panels).
 *
 * The definition (pure, `engine/index.ts`):
 *
 * ```ts
 * export const QUALITY: AnalysisDef<QualityModel> = {
 *   key: 'quality',
 *   label: 'Quality of hire',                       // the picker option
 *   title: 'Education and quality of hire',         // the Section heading
 *   dek: (ctx) => `Do hires from some universities … perform better and stay longer? Hires from ${…}.`,
 *   leadMetric: AID.qualityScore,
 *   leadFigure: QUALITY_FIGURES.university,
 *   figures: Object.values(QUALITY_FIGURES),
 *   ready: qualityReady,                            // the data it cannot do without
 *   missing: qualityMissing,                        // what is absent that unlocks parts of it
 *   model: qualityModel,                            // (ctx) => QualityModel; kpis and findings included
 * }
 * ```
 *
 * The shell calls `model(ctx)` only when the tab (or an export) shows the analysis, through
 * `analysisModel(ctx, key)` (cached per context), never from `computeHrbp`: the Scorecard,
 * `summary()`, the Action center and Copy talking points read none of it. A model's `kpis` (4 to 6,
 * each with `metricId`, `uses` and `drill`) and `findings` (up to 4 shown, ranked, each with
 * `metricId` and `uses`) are what the shell lays out and what Ask's `view_summary` will read.
 *
 * The panel (`ui/Panel.tsx`) gets the model and returns the lead figure and the sections; the shell
 * wraps them in the shared layout (`../shell/AnalysisFrame.tsx`):
 *
 *   Section(title, dek, actions)
 *     KpiStrip(model.kpis)
 *     Readout(model.findings, span 4, limit 4, phones 2) | lead (span 8, `useChartHeight('lead')`)
 *   then the panel's own `children`: `Section`s of figures, two per row where they pair.
 *
 * ```tsx
 * export function Panel({ def, model, ctx, offscreen }: AnalysisPanelProps<QualityModel>) {
 *   return (
 *     <AnalysisFrame def={def} model={model} actions={…optional control…} lead={<Figure id={…} … />}>
 *       <Section title="By degree and field">…figures…</Section>
 *     </AnalysisFrame>
 *   )
 * }
 * ```
 *
 * Rules every panel follows: every chart in a `Figure` with `metric`, `uses`, `definitions` from the
 * dictionary and drills on every mark and cell; ids from `engine/ids.ts`; figures whose cut control
 * changes the grouping export every cut in `data` (long form, a "Grouped by" column); a figure that
 * needs a field `missing(ctx)` names shows its `message` as the Figure's `empty` (with
 * `emptyAction` "Open the Data room" through `useRouteShown('data')`). `offscreen` is true while the
 * tab is laid out for a whole-view export: render every figure, with session controls at their
 * defaults (the stages job family picker at All engineering). Ask the mode through `ctx.access`
 * (`ctx.access.can(S.metric(AID.stagePlanned))`), never the mode store.
 */
import type { ComponentType, ReactNode } from 'react'
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { AnalysisKey } from './tab'

/** What the shell lays out for every analysis. Each analysis's model extends it with its own parts. */
export interface AnalysisModel {
  /** 4 to 6 tiles, each with `metricId`, `uses` and `drill`. */
  kpis: Kpi[]
  /** Ranked by severity, then impact; the readout shows 4 (2 on phones), Ask and exports read all. */
  findings: Finding[]
  /**
   * Small aggregate tables Ask's `view_summary` also returns for the analysis (the pyramid's
   * 12-month flow by level), so it can answer what the tiles do not. Counts and rates only, never
   * a person; rates under the anonymity minimum are null already.
   */
  tables?: AnalysisTable[]
}

/** An aggregate table for Ask: one row per group, cells are numbers, text or null. */
export interface AnalysisTable {
  id: string
  /** What the rows are: "How each level changed in 12 months". */
  title: string
  /** What each column holds, by key: "growth": "today ÷ a year ago − 1 (a fraction)". */
  columns: Readonly<Record<string, string>>
  rows: readonly Readonly<Record<string, number | string | null>>[]
  /** The fields it is computed from: Ask holds it back when they fall below the data standard. */
  uses: readonly FieldRef[]
}

/** Whether an analysis has the data it cannot do without. */
export type Readiness =
  | { ready: true }
  | {
      ready: false
      /** The empty state, naming the column or dataset to add (docs/ANALYSES.md, part 6). */
      message: string
      /** Offer "Open the Data room" under it (plain text where the Data room is hidden). */
      dataRoom: boolean
    }

/** Something absent that unlocks part of an analysis. */
export interface Missing {
  /** Stable id within the analysis, e.g. 'education', 'reviews', 'competingOffer'. */
  id: string
  /** What to add, in the reader's words: "University, Degree level or Field of study". */
  what: string
  /** The sentence the figures it unlocks show: "Add University … to Employees to compare by education." */
  message: string
  /** The fields or datasets it checks. */
  refs: readonly FieldRef[]
  /** The figures that need it; empty when it only changes notes or tiles. */
  figures: readonly string[]
}

/** The window an analysis's numbers cover, which is not always the period picked. */
export interface AnalysisWindow {
  /** Inclusive ISO bounds; `start` is null for a point in time ("as of"). */
  start: string | null
  end: string
  /** For exports and Ask: "Hires 1 Oct 2023 to 30 Sep 2025", "As of 30 Sep 2026". */
  label: string
  /** True when the period picker does not change it (every analysis but Offer declines). */
  ignoresPeriod: boolean
}

export interface AnalysisDef<M extends AnalysisModel = AnalysisModel> {
  key: AnalysisKey
  /** The picker option, sentence case: "Quality of hire". */
  label: string
  /** One word before its export sheet names, where Excel allows 31 characters: "Quality". */
  short: string
  /** The Section heading: "Education and quality of hire". */
  title: string
  /** One or two sentences: the question it answers and its window. */
  dek: (ctx: AnalyticsContext) => string
  /** The window its numbers cover: exports state it, and Ask's `view_summary` returns it. */
  window: (ctx: AnalyticsContext) => AnalysisWindow
  /** The metric the analysis leads with (its lead figure's). */
  leadMetric: string
  /** The lead figure's id: the tab's lead figure while this analysis is on screen. */
  leadFigure: string
  /** Every figure id it draws, the lead first. */
  figures: readonly string[]
  ready: (ctx: AnalyticsContext) => Readiness
  missing: (ctx: AnalyticsContext) => Missing[]
  /** Pure; the shell caches it per context (`analysisModel`). */
  model: (ctx: AnalyticsContext) => M
}

export interface AnalysisPanelProps<M extends AnalysisModel = AnalysisModel> {
  def: AnalysisDef<M>
  model: M
  ctx: AnalyticsContext
  /** Laid out off screen for a whole-view export: every figure, controls at their defaults. */
  offscreen: boolean
}

export type AnalysisPanel<M extends AnalysisModel = AnalysisModel> = ComponentType<AnalysisPanelProps<M>>

/** What a panel hands the shared layout. */
export interface AnalysisFrameParts {
  /** The Section's own control, when the analysis has one (the stages job family picker). */
  actions?: ReactNode
  /** The lead figure (span 8). */
  lead: ReactNode
  /** Sections of figures below the readout row. */
  children?: ReactNode
}
