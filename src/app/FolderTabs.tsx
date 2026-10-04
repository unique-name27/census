/**
 * The practices as file-folder tabs. Idle tabs sit recessed in the band; the open tab takes the
 * desk color and flows into it. Each tab prints the view's live headline for the current scope,
 * gated on the data standard like any KPI: below it the tab reads "—" and says why on hover.
 *
 * Eleven tabs share the width: each grows to at most 184px and shrinks to 104px, so they all fit
 * from a 1,280px window without scrolling the page. A narrow tab drops its sparkline, steps its
 * number down a size and sets its caption at 11px (container queries on the tab itself), so the
 * longest caption ("critical roles covered") still reads in full. Below that the strip scrolls
 * sideways on its own; the page never does.
 */
import { type KeyboardEvent, useEffect, useMemo, useRef } from 'react'
import { Sparkline } from '@/charts/Sparkline'
import { goTo } from '@/components/navigation'
import { cx, Tip } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { DASH } from '@/lib/format'
import { useAiAgents } from '@/views/ai/state'
import { VIEWS } from '@/views/registry'
import type { Headline, ViewDef } from '@/views/types'
import { folderHeadlines, type GatedHeadline } from './headlineGate'
import { useHeadlineVersion } from './headlineRefresh'
import { revealInStrip, rovingIndex } from './keyboard'

export const VIEW_PANEL_ID = 'census-view'

/** Concave corners where the open tab meets the desk, so the tab reads as part of the page. */
function Flares() {
  return (
    <>
      <svg aria-hidden="true" viewBox="0 0 6 6" className="absolute bottom-0 -left-1.5 size-1.5 text-page">
        <path d="M6 0V6H0A6 6 0 0 0 6 0Z" fill="currentColor" />
      </svg>
      <svg aria-hidden="true" viewBox="0 0 6 6" className="absolute -right-1.5 bottom-0 size-1.5 text-page">
        <path d="M0 0V6H6A6 6 0 0 1 0 0Z" fill="currentColor" />
      </svg>
    </>
  )
}

function FolderTab({
  view,
  headline,
  active,
  focusable,
  onKeyDown,
  ref,
}: {
  view: ViewDef
  headline: GatedHeadline
  active: boolean
  focusable: boolean
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  ref: (el: HTMLButtonElement | null) => void
}) {
  const tab = (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={`tab-${view.key}`}
      aria-selected={active}
      aria-controls={active ? VIEW_PANEL_ID : undefined}
      tabIndex={focusable ? 0 : -1}
      onClick={() => goTo(view.key)}
      onKeyDown={onKeyDown}
      title={headline.hidden ? undefined : folderTitle(view.label, headline)}
      className={cx(
        '@container relative flex min-w-[104px] max-w-[184px] flex-1 basis-0 flex-col rounded-t-[6px] px-2 pt-2.5 pb-3 text-left transition-colors duration-100 focus-visible:-outline-offset-2 min-[1440px]:px-2.5 min-[1500px]:px-3.5',
        active
          ? 'on-desk z-10 bg-page text-ink'
          : 'mt-1 bg-tab-idle text-ink-2 hover:bg-tab-idle-hover hover:text-ink',
      )}
    >
      <span className="cut-tab truncate text-[13px] leading-tight font-semibold">{view.label}</span>
      <span className="mt-2 flex items-end justify-between gap-2">
        <span
          className={cx(
            'cut-head truncate text-[18px] leading-none font-semibold @min-[9.5rem]:text-[21px]',
            !active && 'text-ink-2',
          )}
        >
          {headline.value || DASH}
        </span>
        {headline.spark && headline.spark.length > 1 && (
          <span className={cx('shrink-0 @max-[9.5rem]:hidden', !active && 'opacity-70')}>
            <Sparkline values={headline.spark} width={52} height={18} />
          </span>
        )}
      </span>
      <span className="cut-head mt-1 truncate text-[12px] leading-tight text-muted @max-[6rem]:text-[11px]">
        {headline.label || ' '}
      </span>
      {headline.hidden && <span className="sr-only">{`. ${headline.hidden}`}</span>}
      {active && <Flares />}
    </button>
  )
  return headline.hidden ? <Tip content={`${capLabel(headline.label)}: ${headline.hidden}`}>{tab}</Tip> : tab
}

const capLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The whole headline on hover, for tabs too narrow to show it: "Recruiting: 114 open reqs". */
export function folderTitle(label: string, headline: Pick<Headline, 'value' | 'label'>): string {
  const value = headline.value || DASH
  return headline.label ? `${label}: ${value} ${headline.label}` : `${label}: ${value}`
}

export function FolderTabs() {
  const ctx = useAnalytics()
  const current = useCensus((s) => s.route.view)
  // The AI in HR tab counts the agent catalog kept in this browser, not part of ctx: subscribe to
  // it and pass it in, so an edit, removal or import updates the tab at once.
  const agents = useAiAgents((s) => s.agents)
  // A headline that needs heavier work (the scorecard's targets met) arrives after the first
  // paint; this changes when it does, so the tabs read their headlines again.
  // The version is read inside the memo (not only listed) so the React Compiler keeps it as a key.
  const late = useHeadlineVersion()
  const headlines = useMemo(() => (late >= 0 ? folderHeadlines(VIEWS, ctx, agents) : []), [ctx, agents, late])
  const strip = useRef<HTMLDivElement>(null)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const activeIndex = VIEWS.findIndex((v) => v.key === current)

  // Keep the open tab visible on narrow screens (horizontal only: the page itself never moves).
  useEffect(() => {
    if (activeIndex >= 0) revealInStrip(strip.current, tabs.current[activeIndex])
  }, [activeIndex])

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = rovingIndex(e.key, i, VIEWS.length)
    if (next == null) return
    e.preventDefault()
    tabs.current[next]?.focus()
    goTo(VIEWS[next].key)
  }

  return (
    <div
      ref={strip}
      role="tablist"
      aria-label="Practices"
      data-tour="folder-tabs"
      className="-mx-(--gutter) flex items-end gap-1 overflow-x-auto px-(--gutter) pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {VIEWS.map((v, i) => (
        <FolderTab
          key={v.key}
          view={v}
          headline={headlines[i]}
          active={i === activeIndex}
          focusable={i === (activeIndex < 0 ? 0 : activeIndex)}
          onKeyDown={onKeyDown(i)}
          ref={(el) => {
            tabs.current[i] = el
          }}
        />
      ))}
    </div>
  )
}
