/**
 * The five practices as file-folder tabs. Idle tabs sit recessed in the band; the open tab takes
 * the desk color and flows into it. Each tab prints the view's live headline for the current scope.
 */
import { type KeyboardEvent, useEffect, useMemo, useRef } from 'react'
import { Sparkline } from '@/charts/Sparkline'
import { goTo } from '@/components/navigation'
import { cx } from '@/components/ui'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { DASH } from '@/lib/format'
import { VIEWS } from '@/views/registry'
import type { Headline, ViewDef } from '@/views/types'
import { revealInStrip, rovingIndex } from './keyboard'

export const VIEW_PANEL_ID = 'census-view'

function safeHeadline(view: ViewDef, ctx: AnalyticsContext): Headline {
  try {
    return view.headline(ctx)
  } catch (err) {
    console.error(`Headline for ${view.key} failed`, err)
    return { value: DASH, label: '' }
  }
}

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
  headline: Headline
  active: boolean
  focusable: boolean
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  ref: (el: HTMLButtonElement | null) => void
}) {
  return (
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
      className={cx(
        'relative flex w-[184px] shrink-0 flex-col rounded-t-[6px] px-3.5 pt-2.5 pb-3 text-left transition-colors duration-100 focus-visible:-outline-offset-2',
        active
          ? 'on-desk z-10 bg-page text-ink'
          : 'mt-1 bg-tab-idle text-ink-2 hover:bg-tab-idle-hover hover:text-ink',
      )}
    >
      <span className="cut-tab truncate text-[13px] leading-tight font-semibold">{view.label}</span>
      <span className="mt-2 flex items-end justify-between gap-2">
        <span
          className={cx('cut-head truncate text-[21px] leading-none font-semibold', !active && 'text-ink-2')}
        >
          {headline.value || DASH}
        </span>
        {headline.spark && headline.spark.length > 1 && (
          <span className={cx('shrink-0', !active && 'opacity-70')}>
            <Sparkline values={headline.spark} width={52} height={18} />
          </span>
        )}
      </span>
      <span className="mt-1 truncate text-[12px] leading-tight text-muted">{headline.label || ' '}</span>
      {active && <Flares />}
    </button>
  )
}

export function FolderTabs() {
  const ctx = useAnalytics()
  const current = useCensus((s) => s.route.view)
  const headlines = useMemo(() => VIEWS.map((v) => safeHeadline(v, ctx)), [ctx])
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
      className="-mx-(--gutter) flex items-end gap-1.5 overflow-x-auto px-(--gutter) pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
