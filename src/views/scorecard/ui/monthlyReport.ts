/**
 * The monthly people report: one click builds a PowerPoint deck (title, the scorecard, the top
 * findings and each practice's lead chart) or an Excel workbook (the scorecard, every finding and
 * each practice's key figures and lead chart).
 *
 * Each practice's first tab is laid out off screen with the whole-view export machinery
 * (`renderWholeView`), one practice at a time; its key figures and lead chart are copied and the
 * chart captured as an image while it is mounted. The export library loads on first use.
 */
import { buildExportMeta } from '@/app/exportMeta'
import { renderWholeView } from '@/app/wholeView'
import type { RegisteredFigure } from '@/charts/types'
import { gateFor } from '@/components/tier/tierModel'
import type { AnalyticsContext, Features } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { SAMPLE_COMPANY } from '@/data/sample'
import { DATASET_KEYS } from '@/data/schema'
import type { RasterImage } from '@/lib/export/image'
import { type ViewDef, withFeatureTabs } from '../../types'
import { PRACTICE_STANDING_COLUMNS, practiceStanding } from '../engine/band'
import type { ScorecardModel, SourcedFinding } from '../engine/model'
import {
  detached,
  FINDING_COLUMNS,
  findingRows,
  keyFiguresOf,
  pickLead,
  reportFileName,
  reportMonth,
  SLIDE_COLUMNS,
  scorecardSlides,
  scorecardTable,
  standingLine,
} from '../engine/report'
import { practiceViews } from '../engine/schedule'
import { M } from '../metrics'

export type ReportKind = 'deck' | 'workbook'

export interface ReportProgress {
  title: string
  description: string
}

export interface ReportResult {
  /** Practices whose first tab gave a lead chart. */
  charts: number
  /** Practices whose first tab could not be laid out. */
  failed: string[]
  /** A figure had pay amount columns, left out because pay amounts are off. */
  payDropped: boolean
}

interface PracticeFigures {
  view: ViewDef
  lead: RegisteredFigure | null
  key: RegisteredFigure | null
  image?: RasterImage
}

const union = (lists: readonly (readonly FieldRef[] | undefined)[]): FieldRef[] => [
  ...new Set(lists.flatMap((l) => l ?? [])),
]

/** A table-only figure the report writes itself (the scorecard and the findings). */
function tableFigure(
  ctx: AnalyticsContext,
  f: Omit<RegisteredFigure, 'getSvg' | 'order' | 'tier'> & { uses: readonly FieldRef[] },
  order: number,
): RegisteredFigure {
  const gate = f.uses.length ? gateFor(ctx.quality, ctx.standard, f.uses, DATASET_KEYS) : null
  const { uses: _uses, ...rest } = f
  return { ...rest, getSvg: () => null, order, tier: gate?.tier ?? null }
}

/** Each practice's measures by status: the slide after the title (docs/ROLES.md 2.1). */
function targetsByPractice(ctx: AnalyticsContext, model: ScorecardModel): RegisteredFigure {
  return tableFigure(
    ctx,
    {
      id: 'report:targets-by-practice',
      title: 'Targets met by practice',
      subtitle: standingLine(model.counts),
      note: 'Measures with a target and a value shown count toward targets met.',
      columns: PRACTICE_STANDING_COLUMNS,
      rows: practiceStanding(model) as unknown as Record<string, unknown>[],
      metric: M.targetsMet,
      uses: model.headline.uses,
    },
    0,
  )
}

/** Targets met by practice, the scorecard on slide-sized parts, then the top findings, for the deck. */
function scorecardForDeck(ctx: AnalyticsContext, model: ScorecardModel): RegisteredFigure[] {
  const parts = scorecardSlides(model)
  const out = parts.map((rows, i) =>
    tableFigure(
      ctx,
      {
        id: `report:scorecard:${i + 1}`,
        title: parts.length > 1 ? `People scorecard (${i + 1} of ${parts.length})` : 'People scorecard',
        subtitle: standingLine(model.counts),
        note: 'Targets are set in Metric definitions. Watch: within the watch margin of target.',
        columns: SLIDE_COLUMNS,
        rows,
        metric: M.status,
        uses: model.uses,
      },
      i + 1,
    ),
  )
  out.unshift(targetsByPractice(ctx, model))
  out.push(
    findingsFigure(ctx, model.findings.top, 'Top findings across Census', 'report:findings', out.length),
  )
  return out
}

function findingsFigure(
  ctx: AnalyticsContext,
  list: readonly SourcedFinding[],
  title: string,
  id: string,
  order: number,
): RegisteredFigure {
  const tierOf = (s: SourcedFinding) =>
    gateFor(ctx.quality, ctx.standard, s.finding.uses, DATASET_KEYS)?.tier ?? null
  return tableFigure(
    ctx,
    {
      id,
      title,
      subtitle: "Critical first, then watch; every practice's most serious finding before any second one",
      columns: FINDING_COLUMNS,
      rows: findingRows(list, tierOf),
      uses: union(list.map((s) => s.finding.uses)),
    },
    order,
  )
}

/** Lay out each practice's first tab off screen and keep its key figures, lead chart and image. */
async function practiceFigures(
  views: readonly ViewDef[],
  features: Features,
  onProgress: (p: ReportProgress) => void,
): Promise<{ list: PracticeFigures[]; failed: string[] }> {
  const lib = await import('@/lib/export')
  const list: PracticeFigures[] = []
  const failed: string[] = []
  const practices = practiceViews(views)
  for (const [i, registered] of practices.entries()) {
    const view = withFeatureTabs(registered, features)
    const first = view.tabs[0]
    onProgress({
      title: 'Building the monthly people report',
      description: `Laying out ${view.label}, ${first?.label ?? 'first tab'} (${i + 1} of ${practices.length}).`,
    })
    if (!first) continue
    try {
      const { value, failed: broken } = await renderWholeView(
        { ...view, tabs: [first] },
        {
          whileMounted: async (groups) => {
            const figures = groups[0]?.figures ?? []
            const lead = pickLead(figures)
            const key = keyFiguresOf(figures)
            const images = lead && !lead.withheld ? await lib.captureFigureImages([lead]) : new Map()
            return {
              lead: lead ? detached(lead, `report:${view.key}:lead`) : null,
              key: key ? detached(key, `report:${view.key}:key-figures`) : null,
              image: lead ? images.get(lead.id) : undefined,
            }
          },
        },
      )
      if (broken.length) failed.push(view.label)
      list.push({ view, ...value })
    } catch (err) {
      console.error(`Monthly people report: ${view.label} could not be laid out`, err)
      failed.push(view.label)
    }
  }
  return { list, failed }
}

/**
 * Build and download the monthly people report for the current context. The scorecard and its
 * findings come from `model` (the one on screen); each practice's charts are laid out fresh.
 */
export async function downloadMonthlyReport(
  kind: ReportKind,
  args: {
    ctx: AnalyticsContext
    model: ScorecardModel
    views: readonly ViewDef[]
    features: Features
    onProgress: (p: ReportProgress) => void
  },
): Promise<ReportResult> {
  const { ctx, model } = args
  const { list, failed } = await practiceFigures(args.views, args.features, args.onProgress)
  args.onProgress({
    title: kind === 'deck' ? 'Writing the slides' : 'Writing the workbook',
    description: `The scorecard, the findings and ${list.filter((p) => p.lead).length} practice charts.`,
  })
  const lib = await import('@/lib/export')
  const meta = {
    ...buildExportMeta({
      viewLabel: 'Monthly people report',
      tabLabel: reportMonth(ctx.asOf),
      scopeLabel: ctx.scopeLabel,
      window: ctx.window,
      asOf: ctx.asOf,
      isSample: ctx.isSample,
      sampleCompany: SAMPLE_COMPANY,
      standard: ctx.standard,
    }),
    viewKey: 'scorecard',
  }
  const captured = new Map<string, RasterImage>()
  for (const p of list) if (p.lead && p.image) captured.set(p.lead.id, p.image)
  const opts = { showPay: ctx.showPay, captured, fileName: reportFileName(ctx.asOf) }

  if (kind === 'deck') {
    // On a slide the practice names the chart; in the workbook its group does.
    const leads = list.flatMap((p) =>
      p.lead ? [detached(p.lead, p.lead.id, `${p.view.label}: ${p.lead.title}`)] : [],
    )
    await lib.exportViewDeck([...scorecardForDeck(ctx, model), ...leads], meta, opts)
  } else {
    const table = scorecardTable(model)
    const scorecard = tableFigure(
      ctx,
      {
        id: 'report:scorecard',
        title: 'People scorecard',
        subtitle: standingLine(model.counts),
        note: 'Targets are set in Metric definitions. Watch: within the watch margin of target.',
        columns: table.columns,
        rows: table.rows,
        metric: M.status,
        uses: model.uses,
      },
      0,
    )
    const findings = findingsFigure(
      ctx,
      model.findings.all,
      'Every finding across Census',
      'report:findings',
      1,
    )
    await lib.exportViewWorkbook(
      [
        { key: 'scorecard', label: 'Scorecard', figures: [scorecard, findings] },
        ...list.map((p) => ({
          key: p.view.key,
          label: p.view.label,
          figures: [p.key, p.lead].filter((f): f is RegisteredFigure => f != null),
        })),
      ],
      meta,
      opts,
    )
  }
  const payDropped =
    !ctx.showPay && list.some((p) => [p.lead, p.key].some((f) => f?.columns.some((c) => c.pay)))
  return { charts: list.filter((p) => p.lead).length, failed, payDropped }
}
