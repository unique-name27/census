/**
 * People scorecard (docs/VIEWS.md, Scorecard): the home page. One table of each practice's key
 * numbers against target, the most serious findings from every view, and the monthly people
 * report. It reads every view through `ViewDef.summary(ctx)`, in idle time after the first paint.
 */
import { DATASET_KEYS } from '@/data/schema'
import type { Headline, ViewDef } from '../types'
import { M } from './metrics'
import { ReportMenu } from './ui/ReportMenu'
import { ScorecardPage } from './ui/ScorecardPage'
import { scorecardIfReady } from './ui/useScorecard'

function View(_: { tab: string }) {
  return <ScorecardPage />
}

/**
 * Targets met ("9 of 14"), counting only measures with a target and a value shown under the data
 * standard. Until the idle computation is done the tab shows "—" and is filled in after.
 */
const headline: ViewDef['headline'] = (ctx): Headline => {
  const model = scorecardIfReady(ctx)
  if (!model) return { value: '', label: 'targets met', metricId: M.targetsMet }
  return {
    value: model.headline.value,
    label: 'targets met',
    metricId: M.targetsMet,
    uses: model.headline.uses,
  }
}

export const view: ViewDef = {
  key: 'scorecard',
  label: 'Scorecard',
  tabs: [{ key: 'overview', label: 'Overview' }],
  View,
  headline,
  datasets: [...DATASET_KEYS],
  HeaderActions: ReportMenu,
}
