/**
 * The two ways any number reaches its dictionary entry: the "Edit definition" link at the foot
 * of a KPI's info popover or a figure's Definitions datasheet, and the quiet "Definition changed"
 * mark on a KPI tile, figure or finding whose metric differs from its defaults, shown whether or
 * not the quality lens is on. Both open #data.metrics at the metric. Rendered by KpiStrip, Figure
 * and Readout.
 */
import type { MouseEvent } from 'react'
import { IconPencil } from '@/components/icons'
import { cx, Tip } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { behindText } from '../behind'
import { metricHref, openMetricDefinition } from '../open'

const follow = (metricId: string) => (e: MouseEvent<HTMLAnchorElement>) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  openMetricDefinition(metricId)
}

/** "Edit definition" (or "Open in Metric definitions" for a locked privacy rule); null when the id is not registered. */
export function EditDefinitionLink({ metricId, className }: { metricId: string; className?: string }) {
  const { metrics } = useAnalytics()
  const def = metrics.def(metricId)
  if (!def) return null
  return (
    <a
      href={metricHref(metricId)}
      onClick={follow(metricId)}
      className={cx(
        'inline-flex items-center gap-1 rounded-[2px] text-[12px] font-medium text-link underline-offset-2 hover:underline',
        className,
      )}
    >
      <IconPencil className="size-3.5" />
      {def.locked ? 'Open in Metric definitions' : 'Edit definition'}
    </a>
  )
}

/**
 * "Definition changed" when the number is calculated or judged differently from the defaults: the
 * metric's own wording, target or settings, a setting of a metric it depends on (the anonymity
 * minimum included), or a data quality rule that sets its tier.
 */
export function DefinitionChangedMark({ metricId, className }: { metricId: string; className?: string }) {
  const { metrics } = useAnalytics()
  const text = behindText(metrics, metricId)
  if (!text) return null
  const what = text.short
  return (
    <Tip
      content={
        <span className="block">
          <span className="font-semibold">Definition changed.</span> {text.sentences.join(' ')} Opens it in
          Metric definitions.
        </span>
      }
    >
      <a
        href={metricHref(metricId)}
        onClick={follow(metricId)}
        className={cx(
          'relative z-10 inline-flex h-5 shrink-0 items-center gap-1 rounded-[3px] px-1 text-[11px] font-medium whitespace-nowrap text-ink-2 hover:bg-hover hover:text-ink',
          className,
        )}
      >
        <IconPencil className="size-3 text-warning" />
        Definition changed
        <span className="sr-only">: {what}. Open it in Metric definitions.</span>
      </a>
    </Tip>
  )
}
