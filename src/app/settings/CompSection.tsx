/**
 * Settings → Compensation cycle. The cycle's dates (open, calibration, close, effective and the
 * hire date that makes someone eligible) are set right here, in every mode that shows the section,
 * Compensation mode included, which has no Data room (docs/ROLES-V2.md 4.6 and "Decisions made"):
 * Compensation's open items are due on the close date. The merit budget, the healthy compa-ratio
 * band and the merit guideline by rating are settings of the Compensation metrics, edited in the
 * Data room's Metric definitions with every other calculation setting (docs/METRICS.md); this
 * section shows their values and opens the dictionary where the Data room shows. Every change goes
 * through the metric dictionary, so it is checked, logged and can be undone.
 */
import { useId, useState } from 'react'
import { IconChevronRight } from '@/components/icons'
import { Button, cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { useYourName } from '@/views/data/mapping/ui/hooks'
import { openMetricDefinition, openMetricDefinitions } from '@/views/data/metrics/open'
import { useMetricEdit } from '@/views/data/metrics/ui/useMetricEdit'
import { type CycleRow, compCycleIntro, compCycleRows, cycleDateEdit } from './compCycleModel'
import { INPUT, LINK, SettingsBlock } from './ui'

const ROW =
  'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-rule py-2 first:border-t-0 first:pt-0'

/** One cycle date: a date box, Apply once it holds a new date, Clear while one is set. */
function DateRow({ row }: { row: CycleRow }) {
  const id = useId()
  const [name] = useYourName()
  const apply = useMetricEdit(name)
  const saved = row.date ?? ''
  const [text, setText] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const dirty = text !== saved
  const run = (value: string) => {
    const e = cycleDateEdit(row, value)
    if (!e.ok) {
      setError(e.error)
      return
    }
    const refused = apply(e.edit, e.done)
    setError(refused)
    if (!refused) setText(value)
  }
  return (
    <div className={ROW}>
      <dt className="text-small text-ink-2">
        <label htmlFor={`${id}-date`}>{row.label}</label>
      </dt>
      <dd className="flex flex-wrap items-center gap-2 text-small text-ink">
        <input
          id={`${id}-date`}
          type="date"
          value={text}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty) {
              e.preventDefault()
              run(text)
            }
          }}
          className={cx(INPUT, 'tnum w-[150px]')}
        />
        {dirty ? (
          <>
            <Button size="sm" variant="primary" onClick={() => run(text)}>
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(saved)
                setError(null)
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          saved && (
            <button type="button" className={LINK} onClick={() => run('')}>
              Clear<span className="sr-only"> {row.label.toLowerCase()}</span>
            </button>
          )
        )}
        {!saved && !dirty && <span className="text-meta text-muted">Not set</span>}
        {error && (
          <span id={`${id}-error`} role="alert" className="basis-full text-meta text-bad-text">
            {error}
          </span>
        )}
      </dd>
    </div>
  )
}

export function CompSection() {
  const { metrics, access } = useAnalytics()
  // The other settings open the Data room, which only some modes show.
  const dataRoom = access.can('page:data')
  const rows = compCycleRows(metrics, dataRoom)
  return (
    <SettingsBlock section="compensation" intro={compCycleIntro(dataRoom)}>
      <dl className="flex flex-col">
        {rows.map((row) =>
          row.edit === 'inline' ? (
            // Keyed on the value in force, so an undo or a change elsewhere resets the box.
            <DateRow key={`${row.metricId}-${row.key}-${row.date ?? ''}`} row={row} />
          ) : (
            <div key={`${row.metricId}-${row.key}`} className={ROW}>
              <dt className="text-small text-ink-2">{row.label}</dt>
              <dd className="flex items-baseline gap-2 text-small text-ink">
                <span className="tnum">{row.text}</span>
                {row.changed && <span className="text-meta text-muted">changed from default</span>}
                {row.edit === 'link' && (
                  <button type="button" className={LINK} onClick={() => openMetricDefinition(row.metricId)}>
                    Edit
                    <span className="sr-only"> {row.label.toLowerCase()} in Metric definitions</span>
                  </button>
                )}
              </dd>
            </div>
          ),
        )}
      </dl>
      {dataRoom && (
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
