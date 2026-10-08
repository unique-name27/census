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
 *
 * The open tab changes instantly: only hover fades (docs/DESIGN-REFRESH.md 2.12), so a tab never
 * passes through a mid gray on its way to the desk. On a masthead page (Action center, Data room)
 * no practice is open, so the strip ends in one open tab for that page: the desk always hangs
 * from a tab.
 */
import { type KeyboardEvent, type Ref, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkline } from '@/charts/Sparkline'
import { IconChevronRight } from '@/components/icons'
import { goTo } from '@/components/navigation'
import { cx, Tip } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { DASH } from '@/lib/format'
import { useAiAgents } from '@/views/ai/state'
import { folderViews } from '@/views/registry'
import type { Headline, ViewDef } from '@/views/types'
import { folderHeadlines, type GatedHeadline } from './headlineGate'
import { useHeadlineVersion } from './headlineRefresh'
import { revealInStrip, rovingIndex, stripEdges } from './keyboard'

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
        '@container relative flex min-w-[104px] max-w-[184px] flex-1 basis-0 flex-col rounded-t-sheet px-2 pt-2.5 pb-3 text-left focus-visible:-outline-offset-2 min-[1440px]:px-2.5 min-[1500px]:px-3.5',
        active
          ? 'on-desk z-10 bg-page text-ink'
          : 'mt-1 bg-tab-idle text-ink-2 hover:bg-tab-idle-hover hover:text-ink hover:transition-colors hover:duration-100',
      )}
    >
      <span className="cut-tab truncate text-small leading-tight font-semibold">{view.label}</span>
      <span className="mt-2 flex items-end justify-between gap-2">
        <span
          className={cx(
            'cut-head truncate text-title leading-none font-semibold @min-[9.5rem]:text-section',
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
      <span className="cut-head mt-1 truncate text-meta leading-tight text-muted @max-[6rem]:text-label">
        {headline.label || ' '}
      </span>
      {headline.hidden && <span className="sr-only">{`. ${headline.hidden}`}</span>}
      {active && <Flares />}
    </button>
  )
  return headline.hidden ? <Tip content={`${capLabel(headline.label)}: ${headline.hidden}`}>{tab}</Tip> : tab
}

const capLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Pages opened from the masthead rather than a folder tab, by route view. */
const MASTHEAD_PAGES: Record<string, string> = {
  actions: 'Action center',
  data: 'Data room',
  dev: 'Developer',
}

/** The open tab for a masthead page, at the right end of the strip, so the desk hangs from a tab. */
function PageTab({ label, ref }: { label: string; ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      role="tab"
      aria-selected="true"
      aria-controls={VIEW_PANEL_ID}
      tabIndex={-1}
      className="on-desk relative z-10 ml-auto flex min-w-[104px] max-w-[184px] shrink-0 flex-col rounded-t-sheet bg-page px-3 pt-2.5 pb-3 text-ink"
    >
      <span className="cut-tab truncate text-small leading-tight font-semibold">{label}</span>
      {/* The same height as a practice tab: number row and caption row. */}
      <span aria-hidden="true" className="mt-2 block h-5" />
      <span aria-hidden="true" className="mt-1 block h-4" />
      <Flares />
    </div>
  )
}

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
  // The folder tabs this mode shows (docs/ROLES.md, 3.2); arrow keys move over these only.
  const VIEWS = useMemo(() => folderViews(ctx.access), [ctx.access])
  const headlines = useMemo(
    () => (late >= 0 ? folderHeadlines(VIEWS, ctx, agents) : []),
    [VIEWS, ctx, agents, late],
  )
  const strip = useRef<HTMLDivElement>(null)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const activeIndex = VIEWS.findIndex((v) => v.key === current)

  const pageTab = useRef<HTMLDivElement>(null)
  // Whether tabs sit past either edge of the strip: a button at that edge says so and scrolls.
  const [edges, setEdges] = useState({ left: false, right: false })
  const measure = () => {
    const el = strip.current
    if (!el) return
    const next = stripEdges(el.scrollLeft, el.clientWidth, el.scrollWidth)
    setEdges((e) => (e.left === next.left && e.right === next.right ? e : next))
  }
  // Keep the open tab visible whenever the strip is too narrow for every tab (horizontal only: the
  // page itself never moves), the open masthead page's tab at the strip's right end too. Tabs
  // widen when their headlines arrive and the strip narrows when Ask docks, so it runs again then.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new masthead page (current) renders a new page tab to reveal; new headlines change the tabs' widths
  useEffect(() => {
    const el = strip.current
    if (!el) return
    const reveal = () => {
      // Clear of the gutter, where the edge buttons sit, and 8px more.
      const gutter = Number.parseFloat(getComputedStyle(el).paddingRight) || 16
      revealInStrip(el, activeIndex >= 0 ? tabs.current[activeIndex] : pageTab.current, gutter + 8)
      measure()
    }
    reveal()
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(reveal)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => ro.disconnect()
  }, [activeIndex, current, headlines])
  const scrollBy = (dir: -1 | 1) => {
    const el = strip.current
    el?.scrollBy({ left: dir * Math.round(el.clientWidth * 0.6), behavior: 'smooth' })
  }

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = rovingIndex(e.key, i, VIEWS.length)
    if (next == null) return
    e.preventDefault()
    tabs.current[next]?.focus()
    goTo(VIEWS[next].key)
  }

  return (
    <div className="relative -mx-(--gutter)">
      <div
        ref={strip}
        role="tablist"
        aria-label="Practices"
        data-tour="folder-tabs"
        onScroll={measure}
        className="flex items-end gap-1 overflow-x-auto px-(--gutter) pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
        {activeIndex < 0 && MASTHEAD_PAGES[current] && (
          <PageTab ref={pageTab} label={MASTHEAD_PAGES[current]} />
        )}
      </div>
      {edges.left && <EdgeButton side="left" onClick={() => scrollBy(-1)} />}
      {edges.right && <EdgeButton side="right" onClick={() => scrollBy(1)} />}
    </div>
  )
}

/**
 * The cue at an edge of the strip with tabs past it, in the gutter: a chevron that scrolls the
 * strip. Pointer only; the keyboard moves through every tab with the arrow keys.
 */
function EdgeButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onClick={onClick}
      title={side === 'left' ? 'Earlier tabs' : 'More tabs'}
      className={cx(
        'absolute top-1 bottom-0 z-20 flex w-(--gutter) min-w-4 cursor-pointer items-center justify-center bg-band text-ink-2 hover:text-ink',
        side === 'left' ? 'left-0 border-r border-rule' : 'right-0 border-l border-rule',
      )}
    >
      <IconChevronRight className={cx('size-3.5', side === 'left' && 'rotate-180')} />
    </button>
  )
}
