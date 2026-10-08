/**
 * A view's readout: the findings a specialist would raise with a leader, most severe first. Each
 * finding carries its tier and can name the people behind it, rescope the app to where it
 * concentrates, or open the tab with the detail. Findings below the data standard are hidden and
 * counted, with an option to show them on screen. Registers as a "Readout" table (the findings
 * the standard shows) so view exports include it.
 *
 * Anatomy (docs/DESIGN-REFRESH.md 2.9): a meta line (practice tag, tier medal and word) above the
 * headline, so the badge never wraps mid-sentence; the headline (text-body 600); the detail
 * (text-small, ink-2); "Next step:"; then the links in one row.
 *
 *   <Readout findings={m.findings} span={4} />                 // first 4, "Show n more"
 *   <Readout findings={top} span={4} limit={5} variant="compact" title="Top findings" />
 *
 * `limit` (default 4) is how many show before "Show n more"; on phones at most 2 show. The compact
 * variant (role home pages) keeps the meta line, the headline, the next step and the first link.
 */
import { type ReactNode, useState } from 'react'
import { clampFilters } from '@/access/lock'
import { findingsInMode } from '@/access/numbers'
import { routeShown } from '@/access/policy'
import { personInScope } from '@/access/records'
import type { Column } from '@/charts/types'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { mergeFilter } from '@/drill/filter'
import { focusScope } from '@/drill/focus'
import { drillTarget } from '@/drill/kinds'
import { openPerson } from '@/drill/store'
import { plural } from '@/lib/format'
import { type Span, spanClass } from '@/lib/spans'
import { DefinitionChangedMark } from '@/views/data/metrics/ui/EditDefinition'
import { QualityLensLine } from '@/views/data/quality-overview/LensLine'
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
import type { Finding, FindingPerson } from './types'
import { cx, SeverityIcon, Tag } from './ui'
import { useTableFigure } from './useTableFigure'

/** A name that opens the person's card: quiet until hovered. */
const PERSON =
  'rounded-mark text-left underline decoration-rule-strong decoration-dotted underline-offset-[3px] hover:decoration-ink hover:decoration-solid'

const LINK =
  'inline-flex items-center gap-0.5 rounded-mark text-meta font-medium text-link hover:underline underline-offset-2'

function People({ people, total }: { people: FindingPerson[]; total?: number }) {
  const ctx = useAnalytics()
  // A name opens the person's card when they are on the roster and inside the mode's scope.
  const known = (id: string) => ctx.org.byId.has(id) && personInScope(id, ctx.access)
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
        className="-ml-1 inline-flex items-center gap-1 rounded-control px-1 py-0.5 text-meta font-medium text-ink-2 hover:bg-hover hover:text-ink"
      >
        {open ? <IconChevronDown className="size-3.5" /> : <IconChevronRight className="size-3.5" />}
        {peopleChipLabel(people.length, total)}
      </button>
      {open && (
        <ul className="mt-1 ml-1 border-l border-rule pl-3">
          {list.map((p) => (
            <li key={p.id} className="py-0.5 text-small leading-snug">
              {known(p.id) ? (
                <button type="button" className={PERSON} onClick={() => openPerson(p.id)}>
                  {p.name}
                </button>
              ) : (
                <span>{p.name}</span>
              )}
              {p.note && <span className="text-meta text-muted"> · {p.note}</span>}
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

/**
 * Where a finding comes from, for a readout that gathers several views' findings (the People
 * scorecard): the practice is shown as a tag and exported as a column, and "Open in {view}"
 * replaces the link to a tab of the current view.
 */
export interface FindingSource {
  /** The practice it comes from: "Recruiting". */
  label: string
  /** "Open in Recruiting"; with `open`, the link that opens the finding's own view and tab. */
  openLabel?: string
  open?: () => void
}

function FindingItem({
  finding,
  gate,
  source,
  compact,
  className,
}: {
  finding: Finding
  gate: TierGate | null
  source?: FindingSource | null
  compact?: boolean
  className?: string
}) {
  const ctx = useAnalytics()
  const view = useCurrentView()
  // The tab with the detail, unless it is the tab already on screen (the link would do nothing)
  // or one the mode hides.
  const openTab =
    finding.tab && view && finding.tab !== view.tab && routeShown(ctx.access.mode, view.key, finding.tab)
      ? finding.tab
      : null
  const nameOf = (id: string) => ctx.org.byId.get(id)?.name
  // A scoped mode offers "Focus on" only when the scope stays inside it, and Finance only for a
  // business unit group (docs/ROLES.md 3.13; docs/ROLES-V2.md 2.3): the mode's clamp leaves it as is.
  const { scope, mode } = ctx.access
  const clamps = !!scope || mode === 'finance'
  const merged = finding.filter && clamps ? mergeFilter(ctx.filters, finding.filter) : null
  const canFocus =
    !!finding.filter &&
    ctx.access.can('focus:finding') &&
    (!merged || clampFilters(merged, scope, mode) === merged)
  // "Show the records" only for records the mode lists (a hidden kind is no link, ROLES-V2 4.12).
  const records = drillTarget(ctx.access, finding.drill)
  const focus = finding.filter ? finding.filterLabel || describeFocus(finding.filter, nameOf) : ''
  // The same merge, history entry and Undo as "Filter to" in the records panel.
  const onFocus = () => {
    if (finding.filter) focusScope(finding.filter, { org: ctx.org, label: finding.filterLabel })
  }
  const links: ReactNode[] = []
  if (records)
    links.push(
      <button key="drill" type="button" className={LINK} onClick={() => drill(records)}>
        Show the records
      </button>,
    )
  if (finding.filter && canFocus)
    links.push(
      <button key="focus" type="button" className={LINK} onClick={onFocus}>
        {focus ? `Focus on ${focus}` : 'Focus'}
      </button>,
    )
  if (source?.open)
    links.push(
      <button key="open" type="button" className={LINK} onClick={source.open}>
        {source.openLabel ?? `Open in ${source.label}`}
        <IconChevronRight className="size-3" />
      </button>,
    )
  if (!source && openTab && view)
    links.push(
      <button key="tab" type="button" className={LINK} onClick={() => goTo(view.key, openTab)}>
        Open {labelInSentence(tabLabel(view, openTab))}
        <IconChevronRight className="size-3" />
      </button>,
    )
  const shownLinks = compact ? links.slice(0, 1) : links
  const meta = !!source || !!gate || !!finding.metricId
  return (
    <li
      data-metric={finding.metricId}
      className={cx('flex gap-2.5 border-t border-rule px-4 py-3.5 first:border-t-0', className)}
    >
      <SeverityIcon severity={finding.severity} className="mt-[3px] size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {/* Meta line: where it comes from and how good its data is, above the headline, so the
            badge never wraps mid-sentence. Empty marks render nothing and the line collapses. */}
        {meta && (
          <div className="-mt-0.5 mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label empty:hidden">
            {source && <Tag>{source.label}</Tag>}
            {gate && (
              <TierBadge
                compact
                tier={gate.tier}
                explain={gate.explain}
                dataset={gate.limiting.dataset}
                className="-ml-1"
              />
            )}
            {/* As on KPI tiles and figures, a changed definition is marked whether or not the lens is on. */}
            {finding.metricId && <DefinitionChangedMark metricId={finding.metricId} />}
          </div>
        )}
        <h3 className="text-body leading-snug font-semibold [font-stretch:100%]">
          <span className="sr-only">{SEVERITY_WORD[finding.severity]}: </span>
          {finding.title}
        </h3>
        {gate && !gate.shown && <p className="mt-0.5 text-meta leading-snug text-muted">{gate.reason}</p>}
        {!compact && finding.detail && (
          <p className="mt-1 text-small leading-snug text-ink-2">{finding.detail}</p>
        )}
        {/* The quality lens (view header switch): field limiting it, rows used and left out. */}
        {!compact && (
          <QualityLensLine
            uses={finding.uses}
            metricId={finding.metricId}
            label="This finding"
            variant="finding"
            showChanged={false}
            className="mt-1.5"
          />
        )}
        {finding.action && (
          <p className="mt-1.5 text-small leading-snug">
            <span className="text-muted">Next step: </span>
            {finding.action}
          </p>
        )}
        {!compact && !!finding.people?.length && (
          <People people={finding.people} total={finding.peopleTotal} />
        )}
        {shownLinks.length > 0 && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{shownLinks}</div>}
      </div>
    </li>
  )
}

/** How many findings show before "Show n more" (overviews); phones show at most PHONE_FIRST. */
const FIRST = 4
const PHONE_FIRST = 2

/** The readout columns with "Practice" after "Severity", for findings gathered from several views. */
const withPractice = (columns: readonly Column[], on: boolean): Column[] =>
  on
    ? [columns[0], { key: 'practice', label: 'Practice', format: 'text' }, ...columns.slice(1)]
    : [...columns]

export function Readout({
  findings: listed,
  span = 4,
  title = 'Readout',
  exportTitle,
  id = 'readout',
  emptyText = 'Nothing unusual in this period.',
  className,
  sourceOf,
  limit = FIRST,
  variant = 'full',
}: {
  findings: Finding[]
  span?: Span
  title?: string
  /** The title its export sheet and slide carry, when the page around it names it ("Quality of hire readout"). */
  exportTitle?: string
  /** Registry id; give a second readout on the same tab its own id. */
  id?: string
  emptyText?: string
  className?: string
  /** For findings gathered from several views: where each comes from (tag, link and export column). */
  sourceOf?: (f: Finding) => FindingSource | null
  /** How many findings show before "Show n more" (default 4; phones show at most 2). */
  limit?: number
  /** "compact" (role home pages): meta line, headline, next step and the first link only. */
  variant?: 'full' | 'compact'
}) {
  const [expanded, setExpanded] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const ctx = useAnalytics()
  const gateOf = useGateFn()
  // Findings whose metric the mode hides are dropped; in Manager mode `people` lists only the org.
  const findings = findingsInMode(ctx.access, listed)
  const gates = new Map(findings.map((f) => [f, gateOf(f.uses)]))
  const gateOfFinding = (f: Finding) => gates.get(f) ?? null
  const tiered = findings.some((f) => gates.get(f))
  const { shown, hidden } = splitByStandard(findings, gateOfFinding)
  const hiddenText = hidden.length ? hiddenFindingsText(hidden.length, ctx.standard) : undefined
  const sorted = sortFindings(shown)
  // Exports carry exactly what the standard shows, and say how many were held back.
  useTableFigure({
    id,
    title: exportTitle ?? title,
    note: hiddenText,
    columns: withPractice(tiered ? READOUT_COLUMNS_WITH_TIER : READOUT_COLUMNS, !!sourceOf),
    rows: readoutRows(sorted, tiered ? gateOfFinding : undefined).map((row, i) =>
      sourceOf ? { practice: sourceOf(sorted[i])?.label ?? '', ...row } : row,
    ),
    // For the Developer page's contract checks only (never exported).
    items: {
      kind: 'finding',
      list: findings.map((f) => ({
        id: f.id,
        metricId: f.metricId,
        uses: !!f.uses?.length,
        drill: !!f.drill,
      })),
    },
  })
  const first = Math.max(1, limit)
  const phoneFirst = Math.min(first, PHONE_FIRST)
  const visible = expanded ? sorted : sorted.slice(0, first)
  const hiddenSorted = sortFindings(hidden)
  const compact = variant === 'compact'
  // Phones show fewer before "Show more": the extra ones stay in the DOM, hidden under 768px.
  const phoneOnly = (i: number) => !expanded && i >= phoneFirst
  const more = sorted.length - first
  const phoneMore = sorted.length - phoneFirst
  return (
    <section
      aria-label={title}
      data-tour="readout"
      className={cx(spanClass(span), 'flex flex-col self-start rounded-sheet bg-sheet', className)}
    >
      <header className="flex items-baseline gap-2 border-b border-rule px-4 pt-4 pb-3">
        <h2 className="cut-head text-title font-semibold">{title}</h2>
        {sorted.length > 0 && (
          <span className="text-meta text-muted">{plural(sorted.length, 'finding')}</span>
        )}
      </header>
      {sorted.length === 0 ? (
        hidden.length === 0 && (
          <p className="flex items-center gap-2 px-4 py-4 text-small text-ink-2">
            <IconGood className="size-3.5 shrink-0 text-muted" />
            {emptyText}
          </p>
        )
      ) : (
        <ol>
          {visible.map((f, i) => (
            <FindingItem
              key={f.id}
              finding={f}
              gate={gates.get(f) ?? null}
              source={sourceOf?.(f)}
              compact={compact}
              className={phoneOnly(i) ? 'max-md:hidden' : undefined}
            />
          ))}
        </ol>
      )}
      {(expanded ? sorted.length > phoneFirst : phoneMore > 0) && (
        <div className={cx('border-t border-rule px-4 py-2', !expanded && more <= 0 && 'md:hidden')}>
          <button
            type="button"
            className={LINK}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              'Show fewer'
            ) : (
              <>
                <span className="md:hidden">Show {phoneMore} more</span>
                {more > 0 && <span className="max-md:hidden">Show {more} more</span>}
              </>
            )}
          </button>
        </div>
      )}
      {hidden.length > 0 && (
        <div
          className={cx(
            'px-4 py-2.5 text-meta leading-snug text-muted',
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
            <FindingItem key={f.id} finding={f} gate={gates.get(f) ?? null} source={sourceOf?.(f)} />
          ))}
        </ol>
      )}
    </section>
  )
}
