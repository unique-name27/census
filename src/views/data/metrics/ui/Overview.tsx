/**
 * The right-hand side when no metric is open: what the dictionary holds, what can be changed,
 * the metrics changed from their defaults, and the change log across every metric.
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import { CATALOG } from '@/metrics/catalog'
import type { MetricsApi } from '@/metrics/types'
import { changeRows, dictionarySummary, type MetricRow, summaryText } from '../model'
import { ChangeLog } from './ChangeLog'
import { ChangedMark } from './fields'

export function Overview({
  api,
  rows,
  by,
  onOpen,
}: {
  api: MetricsApi
  rows: readonly MetricRow[]
  by: string
  onOpen: (id: string) => void
}) {
  const summary = dictionarySummary(api)
  const changed = rows.filter((r) => r.changed)
  const log = changeRows(api.state, CATALOG)
  const uses: FieldRef[] = [...new Set(changed.flatMap((r) => r.uses))]
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="data-metrics-about" className="rounded-sheet bg-sheet px-4 py-3.5">
        <h2 id="data-metrics-about" className="cut-head text-title leading-tight font-semibold">
          Every metric Census shows, in one place
        </h2>
        <p className="mt-1 text-small text-ink-2">{summaryText(summary)}</p>
        <ul className="mt-3 flex list-disc flex-col gap-1 pl-4 text-small text-ink-2 marker:text-muted">
          <li>
            <span className="text-ink">Wording:</span> the definition, formula, population and owner. Your
            text replaces the default wherever the metric appears.
          </li>
          <li>
            <span className="text-ink">Targets:</span> any metric can take one. Its key figure tiles then show
            whether the value meets it. HR ops service levels and required training also calculate their
            status marks and readout with their targets.
          </li>
          <li>
            <span className="text-ink">Settings:</span> the values a calculation reads, such as the merit
            budget or the first-year window. Each is checked against its allowed range.
          </li>
          <li>
            <span className="text-ink">Locked:</span> the anonymity minimum can be raised, never lowered. Pay
            amounts stay opt-in and protected fields stay out.
          </li>
        </ul>
        <p className="mt-3 text-meta text-muted">
          Changes apply to every view at once, are kept in this browser, travel with the settings file and are
          stamped on exports. Pick a metric to see its data and edit it.
        </p>
        {changed.length > 0 && (
          <div className="mt-4 border-t border-rule pt-3">
            <p className="eyebrow">Changed from defaults</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {changed.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-small">
                  <button
                    type="button"
                    onClick={() => onOpen(r.id)}
                    className="rounded-mark text-left font-medium text-link underline-offset-2 hover:underline"
                  >
                    {r.name}
                  </button>
                  <span className="text-meta text-muted">{r.changedText}</span>
                  <ChangedMark />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <ChangeLog
        id="data-metrics-log"
        title="Change log, every metric"
        rows={log}
        by={by}
        uses={uses}
        showMetric
        onOpenMetric={onOpen}
      />
    </div>
  )
}
