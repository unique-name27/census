/**
 * A view's readout: the findings a specialist would raise with a leader, most severe first. Each
 * finding carries its tier and can name the people behind it, rescope the app to where it
 * concentrates, or open the tab with the detail. Findings below the data standard are hidden and
 * counted, with an option to show them on screen. Registers as a "Readout" table (the findings
 * the standard shows) so view exports include it.
 */
import { useState } from 'react'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { drill } from '@/drill/Drill'
import { openPerson } from '@/drill/store'
import { plural } from '@/lib/format'
import { type Span, spanClass } from '@/lib/spans'
import { tabLabel, useCurrentView } from './currentView'
import { describeFocus } from './filterLabels'
import { IconChevronDown, IconChevronRight, IconGood } from './icons'
import { goTo } from './navigation'
import {
  labelInSentence,
  peopleChipLabel,
  peoplePreview,
  READOUT_COLUMNS,
  READOUT_COLUMNS_WITH_TIER,
  readoutRows,
  SEVERITY_WORD,
  sortFindings,
} from './readoutModel'
import { TierBadge } from './tier/TierBadge'
import { hiddenFindingsText, splitByStandard, type TierGate } from './tier/tierModel'
import { useGateFn } from './tier/useTierGate'
import { toast } from './toast'
import type { Finding, FindingPerson } from './types'
import { cx, SeverityIcon } from './ui'
import { useTableFigure } from './useTableFigure'

/** A name that opens the person's card: quiet until hovered. */
const PERSON =
  'rounded-[2px] text-left underline decoration-rule-strong decoration-dotted underline-offset-[3px] hover:decoration-ink hover:decoration-solid'

const LINK =
  'inline-flex items-center gap-0.5 rounded-[2px] text-[12px] font-medium text-link hover:underline underline-offset-2'

function People({ people, total }: { people: FindingPerson[]; total?: number }) {
  const ctx = useAnalytics()
  const known = (id: string) => ctx.org.byId.has(id)
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
        {peopleChipLabel(people.length, total)}
      </button>
      {open && (
        <ul className="mt-1 ml-1 border-l border-rule pl-3">
          {list.map((p) => (
            <li key={p.id} className="py-0.5 text-[13px] leading-snug">
              {known(p.id) ? (
                <button type="button" className={PERSON} onClick={() => openPerson(p.id)}>
                  {p.name}
                </button>
              ) : (
                <span>{p.name}</span>
              )}
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

function FindingItem({ finding, gate }: { finding: Finding; gate: TierGate | null }) {
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
        {/* The badge follows the title's last word, so a narrow column never squeezes the title. */}
        <div className="text-[14px] leading-snug">
          <h3 className="inline font-semibold [font-stretch:100%]">
            <span className="sr-only">{SEVERITY_WORD[finding.severity]}: </span>
            {finding.title}
          </h3>
          {gate && (
            <>
              {' '}
              <TierBadge
                compact
                tier={gate.tier}
                explain={gate.explain}
                dataset={gate.limiting.dataset}
                className="ml-0.5 align-[-4px]"
              />
            </>
          )}
        </div>
        {gate && !gate.shown && <p className="mt-0.5 text-[12px] leading-snug text-muted">{gate.reason}</p>}
        {finding.detail && <p className="mt-1 text-[13px] leading-snug text-ink-2">{finding.detail}</p>}
        {finding.action && (
          <p className="mt-1.5 text-[13px] leading-snug">
            <span className="text-muted">Next step: </span>
            {finding.action}
          </p>
        )}
        {!!finding.people?.length && <People people={finding.people} total={finding.peopleTotal} />}
        {(finding.filter || finding.drill || (finding.tab && view)) && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {finding.drill && (
              <button type="button" className={LINK} onClick={() => drill(finding.drill)}>
                Show the records
              </button>
            )}
            {finding.filter && (
              <button type="button" className={LINK} onClick={onFocus}>
                {focus ? `Focus on ${focus}` : 'Focus'}
              </button>
            )}
            {finding.tab && view && (
              <button type="button" className={LINK} onClick={() => goTo(view.key, finding.tab)}>
                Open {labelInSentence(tabLabel(view, finding.tab))}
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
  const [showHidden, setShowHidden] = useState(false)
  const ctx = useAnalytics()
  const gateOf = useGateFn()
  const gates = new Map(findings.map((f) => [f, gateOf(f.uses)]))
  const gateOfFinding = (f: Finding) => gates.get(f) ?? null
  const tiered = findings.some((f) => gates.get(f))
  const { shown, hidden } = splitByStandard(findings, gateOfFinding)
  const hiddenText = hidden.length ? hiddenFindingsText(hidden.length, ctx.standard) : undefined
  // Exports carry exactly what the standard shows, and say how many were held back.
  useTableFigure({
    id,
    title,
    note: hiddenText,
    columns: tiered ? READOUT_COLUMNS_WITH_TIER : READOUT_COLUMNS,
    rows: readoutRows(shown, tiered ? gateOfFinding : undefined),
  })
  const sorted = sortFindings(shown)
  const visible = expanded ? sorted : sorted.slice(0, FIRST)
  const hiddenSorted = sortFindings(hidden)
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
        hidden.length === 0 && (
          <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-ink-2">
            <IconGood className="size-3.5 shrink-0 text-muted" />
            {emptyText}
          </p>
        )
      ) : (
        <ol>
          {visible.map((f) => (
            <FindingItem key={f.id} finding={f} gate={gates.get(f) ?? null} />
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
      {hidden.length > 0 && (
        <div
          className={cx(
            'px-4 py-2.5 text-[12px] leading-snug text-muted',
            sorted.length > 0 && 'border-t border-rule',
          )}
        >
          {hiddenText}.{' '}
          <button
            type="button"
            className={LINK}
            aria-expanded={showHidden}
            onClick={() => setShowHidden(!showHidden)}
          >
            {showHidden ? 'Hide them' : 'Show them'}
          </button>
        </div>
      )}
      {showHidden && hidden.length > 0 && (
        <ol aria-label="Findings below the data standard" className="border-t border-rule bg-sheet-2">
          {hiddenSorted.map((f) => (
            <FindingItem key={f.id} finding={f} gate={gates.get(f) ?? null} />
          ))}
        </ol>
      )}
    </section>
  )
}
