/**
 * A view's readout: the findings a specialist would raise with a leader, most severe first. Each
 * finding can name the people behind it, rescope the app to where it concentrates, or open the
 * tab with the detail. Registers as a "Readout" table so view exports include it.
 */
import { useState } from 'react'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { plural } from '@/lib/format'
import { tabLabel, useCurrentView } from './currentView'
import { describeFocus } from './filterLabels'
import { IconChevronDown, IconChevronRight, IconGood } from './icons'
import { goTo } from './navigation'
import { peoplePreview, READOUT_COLUMNS, readoutRows, SEVERITY_WORD, sortFindings } from './readoutModel'
import { type Span, spanClass } from './Section'
import { toast } from './toast'
import type { Finding, FindingPerson } from './types'
import { cx, SeverityIcon } from './ui'
import { useTableFigure } from './useTableFigure'

const LINK =
  'inline-flex items-center gap-0.5 rounded-[2px] text-[12px] font-medium text-link hover:underline underline-offset-2'

function People({ people }: { people: FindingPerson[] }) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const { shown, more } = peoplePreview(people)
  const list = all ? people : shown
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="-ml-1 inline-flex items-center gap-1 rounded-control px-1 py-0.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
      >
        {open ? <IconChevronDown className="size-3.5" /> : <IconChevronRight className="size-3.5" />}
        {plural(people.length, 'person', 'people')}
      </button>
      {open && (
        <ul className="mt-1 ml-1 border-l border-rule pl-3">
          {list.map((p) => (
            <li key={p.id} className="py-0.5 text-[13px] leading-snug">
              <span>{p.name}</span>
              {p.note && <span className="text-[12px] text-muted"> · {p.note}</span>}
            </li>
          ))}
          {!all && more > 0 && (
            <li className="py-0.5">
              <button type="button" className={LINK} onClick={() => setAll(true)}>
                and {more} more
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function FindingItem({ finding }: { finding: Finding }) {
  const ctx = useAnalytics()
  const view = useCurrentView()
  const setFilters = useCensus((s) => s.setFilters)
  const nameOf = (id: string) => ctx.org.byId.get(id)?.name
  const focus = finding.filter ? describeFocus(finding.filter, nameOf) : ''
  const onFocus = () => {
    if (!finding.filter) return
    const before = ctx.filters
    setFilters(finding.filter)
    toast(focus ? `Showing ${focus}` : 'Filters applied', {
      action: { label: 'Undo', onClick: () => setFilters(before) },
    })
  }
  return (
    <li className="flex gap-2.5 border-t border-rule px-4 py-3.5 first:border-t-0">
      <SeverityIcon severity={finding.severity} className="mt-[3px] size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] leading-snug font-semibold [font-stretch:100%]">
          <span className="sr-only">{SEVERITY_WORD[finding.severity]}: </span>
          {finding.title}
        </h3>
        {finding.detail && <p className="mt-1 text-[13px] leading-snug text-ink-2">{finding.detail}</p>}
        {finding.action && (
          <p className="mt-1.5 text-[13px] leading-snug">
            <span className="text-muted">Next step: </span>
            {finding.action}
          </p>
        )}
        {!!finding.people?.length && <People people={finding.people} />}
        {(finding.filter || (finding.tab && view)) && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {finding.filter && (
              <button type="button" className={LINK} onClick={onFocus}>
                {focus ? `Focus on ${focus}` : 'Focus'}
              </button>
            )}
            {finding.tab && view && (
              <button type="button" className={LINK} onClick={() => goTo(view.key, finding.tab)}>
                Open {tabLabel(view, finding.tab).toLowerCase()}
                <IconChevronRight className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

/** How many findings show before "Show all". */
const FIRST = 6

export function Readout({
  findings,
  span = 4,
  title = 'Readout',
  id = 'readout',
  emptyText = 'Nothing unusual in this period.',
  className,
}: {
  findings: Finding[]
  span?: Span
  title?: string
  /** Registry id; give a second readout on the same tab its own id. */
  id?: string
  emptyText?: string
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  useTableFigure({ id, title, columns: READOUT_COLUMNS, rows: readoutRows(findings) })
  const sorted = sortFindings(findings)
  const visible = expanded ? sorted : sorted.slice(0, FIRST)
  return (
    <section
      aria-label={title}
      className={cx(spanClass(span), 'flex flex-col self-start rounded-sheet bg-sheet', className)}
    >
      <header className="flex items-baseline gap-2 border-b border-rule px-4 pt-3 pb-2.5">
        <h2 className="cut-head text-[16px] leading-tight font-semibold">{title}</h2>
        {sorted.length > 0 && (
          <span className="text-[12px] text-muted">{plural(sorted.length, 'finding')}</span>
        )}
      </header>
      {sorted.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-ink-2">
          <IconGood className="size-3.5 shrink-0 text-muted" />
          {emptyText}
        </p>
      ) : (
        <ol>
          {visible.map((f) => (
            <FindingItem key={f.id} finding={f} />
          ))}
        </ol>
      )}
      {sorted.length > FIRST && (
        <div className="border-t border-rule px-4 py-2">
          <button type="button" className={LINK} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show fewer' : `Show all ${sorted.length} findings`}
          </button>
        </div>
      )}
    </section>
  )
}
