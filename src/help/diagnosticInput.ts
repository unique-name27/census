/**
 * What goes into the "Report a problem" summary, gathered from the analytics context and the
 * settings. Only labels, counts and settings: never a name, an ID, a file name or a value from
 * the data. Pure, so a test can run it on the sample with a leader filter set.
 */
import type { AnalyticsContext } from '@/data/context'
import { STANDARD_LABEL } from '@/data/quality/tier'
import { DATASET_KEYS, datasetDef, type ViewKey } from '@/data/schema'
import { type Filters, PERIOD_LABELS } from '@/data/scope'
import type { CensusState } from '@/data/store'
import { headcountAt } from '@/lib/people'
import { DATA_TABS, parseDataTab } from '@/views/data/links'
import { viewByKey } from '@/views/registry'
import { type DiagnosticInput, safeAddress } from './diagnostics'
import { APP_VERSION } from './whatsNew'

/** The settings the summary reads. */
export type DiagnosticState = Pick<
  CensusState,
  | 'route'
  | 'dataStandard'
  | 'asOfOverride'
  | 'reference'
  | 'showPay'
  | 'showImmigration'
  | 'engagementSurveys'
  | 'theme'
  | 'textSize'
  | 'motion'
  | 'storageUnavailable'
> & { filters: Filters }

/** Facts about the browser, passed in so the builder stays pure. */
export interface DiagnosticEnv {
  hash: string
  browser: string
  windowSize: string
  at: string
  lensOn: boolean
}

const TIER_WORD: Readonly<Record<string, string>> = {
  none: 'no data',
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
}

/** The page and tab as the reader sees them: "People stats", "Attrition". */
export function pageLabels(view: string, tab: string): { view: string; tab: string | null } {
  if (view === 'data') {
    const t = parseDataTab(tab).tab
    return { view: 'Data room', tab: DATA_TABS.find((d) => d.key === t)?.label ?? null }
  }
  if (view === 'actions') return { view: 'Action center', tab: null }
  const v = viewByKey.get(view as ViewKey)
  if (!v) return { view, tab: null }
  const t = v.tabs.find((x) => x.key === tab) ?? v.tabs[0]
  return { view: v.label, tab: v.tabs.length > 1 ? (t?.label ?? null) : null }
}

export function diagnosticInput(
  ctx: AnalyticsContext,
  s: DiagnosticState,
  env: DiagnosticEnv,
): DiagnosticInput {
  const page = pageLabels(s.route.view, s.route.tab)
  const f = s.filters
  let inScope: number | null = null
  try {
    inScope = headcountAt(ctx.data.employees, ctx.asOf)
  } catch {
    inScope = null
  }
  return {
    viewLabel: page.view,
    tabLabel: page.tab,
    address: safeAddress(env.hash),
    period: { preset: f.period, label: f.period === 'custom' ? ctx.window.label : PERIOD_LABELS[f.period] },
    leaderSet: !!f.leaderId,
    orgFilters: [
      { label: 'Business unit', count: f.businessUnit.length },
      { label: 'Department', count: f.department.length },
      { label: 'Location', count: f.location.length },
      { label: 'Level', count: f.level.length },
    ],
    peopleInScope: inScope,
    standard: STANDARD_LABEL[s.dataStandard] ?? s.dataStandard,
    asOf: ctx.asOf,
    asOfSource: s.asOfOverride ? 'set by you' : ctx.isSample ? 'sample' : 'data',
    datasets: DATASET_KEYS.map((k) => {
      const tier = ctx.quality.datasetTier(k)
      return {
        label: datasetDef(k).label,
        source: ctx.sources[k]?.kind === 'upload' ? ('upload' as const) : ('sample' as const),
        rows: ctx.sources[k]?.rowCount ?? 0,
        tier: TIER_WORD[tier] ?? tier,
      }
    }),
    definitionsChanged: ctx.metrics.changedCount,
    mappingChanges: s.reference.mappings.length,
    switches: [
      { label: 'pay amounts', on: s.showPay },
      { label: 'immigration details', on: s.showImmigration },
      { label: 'engagement surveys', on: s.engagementSurveys },
      { label: 'show data quality', on: env.lensOn },
    ],
    display: `theme ${s.theme}, text size ${s.textSize}, motion ${s.motion}`,
    storage: s.storageUnavailable ? 'did not open at start-up (showing the sample)' : 'available',
    version: APP_VERSION,
    browser: env.browser,
    windowSize: env.windowSize,
    at: env.at,
  }
}
