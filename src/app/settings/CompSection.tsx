/**
 * Settings → Compensation cycle: a pointer. The merit budget, the healthy compa-ratio band and
 * the merit guideline by rating are settings of the Compensation metrics, edited in the Data
 * room's Metric definitions with every other calculation setting (docs/METRICS.md), so each one
 * has one home and every change is logged. This section shows the values in force and opens the
 * dictionary filtered to Compensation, or at one metric. In a mode without the Data room
 * (Compensation) it shows the values only, and says where they change.
 */
import { IconChevronRight } from '@/components/icons'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { COMP_CYCLE } from '@/metrics/compCycle'
import { formatParam } from '@/metrics/params'
import type { ParamValue } from '@/metrics/types'
import { openMetricDefinition, openMetricDefinitions } from '@/views/data/metrics/open'
import { LINK, SettingsBlock } from './ui'

/** Every cycle setting, in the order `COMP_CYCLE` names them (a new one shows here as it is added). */
const ROWS = Object.values(COMP_CYCLE)

const INTRO =
  'These settings now live in Metric definitions in the Data room, with every other calculation setting. Changes there apply to every view, are logged and can be undone.'
const INTRO_READ_ONLY =
  'These settings live in Metric definitions in the Data room, with every other calculation setting. Change them in HR mode; changes apply to every view and are logged.'

export function CompSection() {
  const { metrics, access } = useAnalytics()
  // The links open the Data room, which only some modes show.
  const canEdit = access.can('page:data')
  return (
    <SettingsBlock section="compensation" intro={canEdit ? INTRO : INTRO_READ_ONLY}>
      <dl className="flex flex-col">
        {ROWS.map(({ metricId, key }) => {
          const p = metrics.paramDef(metricId, key)
          if (!p) return null
          const changed = metrics.changedFields(metricId).includes(`params.${key}`)
          return (
            <div
              key={`${metricId}-${key}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-rule py-2 first:border-t-0 first:pt-0"
            >
              <dt className="text-small text-ink-2">{p.label}</dt>
              <dd className="flex items-baseline gap-2 text-small text-ink">
                <span className="tnum">{formatParam(p, metrics.param<ParamValue>(metricId, key))}</span>
                {changed && <span className="text-meta text-muted">changed from default</span>}
                {canEdit && (
                  <button type="button" className={LINK} onClick={() => openMetricDefinition(metricId)}>
                    Edit
                    <span className="sr-only"> {p.label.toLowerCase()} in Metric definitions</span>
                  </button>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
      {canEdit && (
        <div>
          <Button onClick={() => openMetricDefinitions({ view: 'comp' })}>
            Open Compensation in Metric definitions
            <IconChevronRight className="-mr-1 text-muted" />
          </Button>
        </div>
      )}
    </SettingsBlock>
  )
}
