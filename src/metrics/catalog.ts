/**
 * The assembled metric dictionary: every view's entries (from `src/views/<key>/metrics.ts`), in
 * folder-tab order, then the Data room's own (`src/views/data/roomMetrics.ts`), the Action
 * center's, the privacy rules and the data quality rules. The cycle settings of the Compensation
 * metrics are guaranteed to exist even when the comp view leaves them out.
 */
import { metrics as actions } from '@/views/actions/metrics'
import { metrics as ai } from '@/views/ai/metrics'
import { metrics as comp } from '@/views/comp/metrics'
import { metrics as compliance } from '@/views/compliance/metrics'
import { metrics as dataRoom } from '@/views/data/roomMetrics'
import { metrics as hrbp } from '@/views/hrbp/metrics'
import { metrics as listening } from '@/views/listening/metrics'
import { metrics as onboarding } from '@/views/onboarding/metrics'
import { metrics as org } from '@/views/org/metrics'
import { metrics as recruiting } from '@/views/recruiting/metrics'
import { metrics as scorecard } from '@/views/scorecard/metrics'
import { metrics as services } from '@/views/services/metrics'
import { metrics as talent } from '@/views/talent/metrics'
import { COMP_CYCLE_METRICS } from './compCycle'
import { PRIVACY_METRICS } from './privacy'
import { QUALITY_METRICS } from './quality'
import { catalogOf, type MetricCatalog, withRequired } from './registry'
import type { MetricDef, MetricView } from './types'

/** Each view's own entries, as registered. */
export const VIEW_METRICS: Readonly<Partial<Record<MetricView, readonly MetricDef[]>>> = {
  scorecard,
  recruiting,
  onboarding,
  hrbp,
  org,
  services,
  talent,
  comp,
  compliance,
  listening,
  ai,
  data: dataRoom,
  actions,
}

/** Every metric Census shows, plus the privacy and data quality rules. */
export const METRICS: readonly MetricDef[] = withRequired(
  [
    ...scorecard,
    ...recruiting,
    ...onboarding,
    ...hrbp,
    ...org,
    ...services,
    ...talent,
    ...comp,
    ...compliance,
    ...listening,
    ...ai,
    ...dataRoom,
    ...actions,
    ...PRIVACY_METRICS,
    ...QUALITY_METRICS,
  ],
  COMP_CYCLE_METRICS,
)

export const CATALOG: MetricCatalog = catalogOf(METRICS)

/** The metrics that appear in a view (home view or not), in catalog order. */
export const metricsOfView = (view: MetricView, catalog: MetricCatalog = CATALOG): MetricDef[] =>
  catalog.list.filter((d) => d.views.includes(view))
