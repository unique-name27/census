/**
 * The head of a view: name, the scope / window / as-of line with where the data came from (left
 * out for a view that reads no datasets), the view's own controls, the "Show data quality" switch,
 * Export, and underline sub-tabs. With the switch on, a strip under the tabs names the datasets
 * the view reads with their tiers. Under the scope line, "About this view" opens the view's help
 * article.
 */
import { type KeyboardEvent, useEffect, useRef } from 'react'
import { goTo } from '@/components/navigation'
import { cx, Tag, Tip } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { AboutViewLink } from '@/help/ui/AboutViewLink'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { agentsHash, openAgents, useAgentLink } from '@/views/ai/link'
import { QualityDatasetStrip, QualityLensSwitch } from '@/views/data/quality-overview/DatasetStrip'
import type { ViewDef } from '@/views/types'
import { ExportMenu } from './ExportMenu'
import { datasetNote } from './exportMeta'
import { rovingIndex } from './keyboard'

export const VIEW_BODY_ID = 'census-view-body'

function Provenance({ view }: { view: ViewDef }) {
  const ctx = useAnalytics()
  const note = datasetNote(view.datasets, ctx.sources)
  return (
    <Tip
      side="bottom"
      content={
        <ul className="space-y-0.5">
          {note.datasets.map((d) => (
            <li key={d.key} className="flex gap-3">
              <span className="flex-1">{d.label}</span>
              <span className="text-muted">
                {d.kind === 'upload' ? (d.fileName ?? 'Uploaded') : 'Sample'} · {fmt(d.rowCount, 'int')} rows
              </span>
            </li>
          ))}
        </ul>
      }
    >
      <button type="button" aria-label={`${note.text}. Data sources for this view`} className="rounded-[3px]">
        <Tag tone={note.allSample ? 'neutral' : 'outline'}>{note.text}</Tag>
      </button>
    </Tip>
  )
}

/** One quiet line, "AI agents for Recruiting (4)", opening AI in HR filtered to the view's areas. */
function AgentsLink({ view }: { view: ViewDef }) {
  const link = useAgentLink(view.key)
  if (!link) return null
  return (
    <span className="text-[12px] leading-snug">
      <a
        href={agentsHash(link.areas)}
        aria-label={link.label}
        onClick={(e) => {
          // A modified click opens the filtered catalog in a new tab as usual.
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
          e.preventDefault()
          openAgents(link.areas)
        }}
        className="rounded-[2px] text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink hover:decoration-ink"
      >
        {link.text}
      </a>
    </span>
  )
}

function SubTabs({ view, active }: { view: ViewDef; active: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const at = view.tabs.findIndex((t) => t.key === active)
  // On a narrow screen the strip scrolls sideways: arriving at a later tab (a link, a KPI tile, an
  // address) brings the selected tab into view. Only the strip scrolls, never the page.
  useEffect(() => {
    const el = refs.current[at]
    const strip = el?.parentElement
    if (!el || !strip || strip.scrollWidth <= strip.clientWidth) return
    const box = strip.getBoundingClientRect()
    const tab = el.getBoundingClientRect()
    const pad = 16
    if (tab.left < box.left + pad) strip.scrollLeft -= box.left + pad - tab.left
    else if (tab.right > box.right - pad) strip.scrollLeft += tab.right - (box.right - pad)
  }, [at])
  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = rovingIndex(e.key, i, view.tabs.length)
    if (next == null) return
    e.preventDefault()
    refs.current[next]?.focus()
    goTo(view.key, view.tabs[next].key)
  }
  return (
    <div
      role="tablist"
      aria-label={`${view.label} sections`}
      data-tour="view-tabs"
      className="-mx-(--gutter) flex gap-6 overflow-x-auto px-(--gutter) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {view.tabs.map((t, i) => {
        const selected = t.key === active
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`subtab-${view.key}-${t.key}`}
            aria-selected={selected}
            aria-controls={VIEW_BODY_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => goTo(view.key, t.key)}
            onKeyDown={onKeyDown(i)}
            className={cx(
              'relative h-10 shrink-0 text-[13px] whitespace-nowrap transition-colors focus-visible:-outline-offset-2',
              selected
                ? 'font-semibold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink'
                : 'font-medium text-ink-2 hover:text-ink',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function ViewHeader({ view, tab }: { view: ViewDef; tab: string }) {
  const ctx = useAnalytics()
  const Actions = view.HeaderActions
  return (
    <div className="pt-5">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[420px]">
          <h1 className="cut-head text-[28px] leading-[1.1] font-[650] tracking-[-0.01em]">{view.label}</h1>
          {/* A view that reads no datasets (AI in HR) has no scope, window, as-of date or data source. */}
          {view.datasets.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-2">
              <span>{ctx.scopeLabel}</span>
              <span aria-hidden="true" className="text-muted">
                ·
              </span>
              <span>{ctx.window.label}</span>
              <span aria-hidden="true" className="text-muted">
                ·
              </span>
              <span>as of {formatDate(ctx.asOf)}</span>
              <span className="ml-1.5">
                <Provenance view={view} />
              </span>
            </div>
          )}
          {/* Quiet links: this view's help article, and the AI agents for its area. */}
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5">
            <AboutViewLink view={view.key} tab={tab} />
            <AgentsLink view={view} />
          </p>
        </div>
        <div data-tour="view-controls" className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
          {Actions && <Actions />}
          {/* The quality lens: tier, limiting field and rows left out on every number. */}
          {view.datasets.length > 0 && (
            <span data-tour="quality-lens" className="inline-flex">
              <QualityLensSwitch />
            </span>
          )}
          <ExportMenu view={view} tab={tab} />
        </div>
      </div>
      <div className={cx('mt-4 border-b border-rule', view.tabs.length < 2 && 'mt-5')}>
        {view.tabs.length > 1 && <SubTabs view={view} active={tab} />}
      </div>
      {/* While the lens is on: the datasets this view reads, with their tiers. */}
      <QualityDatasetStrip datasets={view.datasets} />
    </div>
  )
}
