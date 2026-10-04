/**
 * The Help sheet (docs/HELP.md): slides in from the right like Settings. Search across the help
 * articles and the metric glossary; "Take the tour", "What's on this page", "Keyboard shortcuts",
 * "Report a problem" and "What's new"; every tour; and the articles by group. Escape or Close
 * closes it and focus returns to what opened it, unless a tour starts.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import { type ReactNode, type Ref, useEffect, useMemo, useRef, useState } from 'react'
import { IconCheck, IconChevronRight, IconClose, IconCopy, IconSearch } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button, cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { plural } from '@/lib/format'
import { METRICS } from '@/metrics/catalog'
import { metricHref, openMetricDefinition } from '@/views/data/metrics/open'
import { ARTICLES, articleById, articleForRoute, articlesIn } from '../articles'
import { buildGlossary } from '../glossary'
import { buildIndex, RESULT_LIMIT, search } from '../search'
import { closeHelp, startTour, useHelp } from '../store'
import { TOURS, tourById, tourForRoute } from '../tours'
import { HELP_GROUPS } from '../types'
import { ArticleView, LINK_CLASS } from './ArticleView'
import { helpTrigger } from './refs'
import { useDiagnostic } from './useDiagnostic'

/** What had focus when the sheet was asked to open (captured before React re-renders). */
let opener: HTMLElement | null = null
if (typeof document !== 'undefined')
  useHelp.subscribe((s, prev) => {
    if (s.open && !prev.open)
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  })

/** Focus goes back to the opener, or the Help button; nowhere while a tour takes over. */
function returnFocus(): HTMLElement | false | null {
  if (useHelp.getState().tour) return false
  const back = opener?.isConnected && opener !== document.body ? opener : helpTrigger.current
  opener = null
  return back
}

const ROW =
  'group flex w-full items-start gap-3 rounded-control px-2.5 py-2 text-left outline-none hover:bg-hover focus-visible:bg-hover'

function Row({
  title,
  detail,
  onClick,
  done,
}: {
  title: string
  detail?: string
  onClick: () => void
  done?: boolean
}) {
  return (
    <li>
      <button type="button" className={ROW} onClick={onClick}>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">{title}</span>
          {detail && <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">{detail}</span>}
        </span>
        {done && (
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[12px] text-muted">
            <IconCheck className="size-3.5" />
            Done
          </span>
        )}
        <IconChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted group-hover:text-ink-2" />
      </button>
    </li>
  )
}

function Group({
  title,
  children,
  more,
  listRef,
}: {
  title: string
  children: ReactNode
  /** A line after the list, such as "Showing 8 of 23 definitions". */
  more?: ReactNode
  listRef?: Ref<HTMLUListElement>
}) {
  return (
    <section className="border-t border-rule px-3 pt-3 pb-2 first:border-t-0">
      <h3 className="eyebrow px-2.5 pb-1">{title}</h3>
      <ul ref={listRef} className="flex flex-col">
        {children}
      </ul>
      {more}
    </section>
  )
}

/** "Showing 8 of 23 definitions" with a way to see the rest. */
function ShowAll({
  shown,
  total,
  noun,
  onClick,
}: {
  shown: number
  total: number
  noun: string
  onClick: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 pt-1">
      <span className="text-[12px] text-muted">
        Showing {shown} of {total} {noun}
      </span>
      <Button size="sm" variant="ghost" onClick={onClick}>
        Show all
      </Button>
    </div>
  )
}

/** "Report a problem": copy the summary; if the browser refuses, show it to copy by hand. */
function ReportProblem() {
  const text = useDiagnostic()
  const [manual, setManual] = useState<string | null>(null)
  const copy = async () => {
    const summary = text()
    try {
      await navigator.clipboard.writeText(summary)
      setManual(null)
      toast('Problem report copied', {
        tone: 'good',
        description:
          'Paste it into a message or ticket and add what you expected to see. It holds no people data.',
      })
    } catch {
      setManual(summary)
    }
  }
  return (
    <div>
      <Button size="sm" icon={<IconCopy />} onClick={() => void copy()}>
        Report a problem
      </Button>
      {manual && (
        <div className="mt-2">
          <p className="text-[12px] text-ink-2">
            The browser did not allow copying. Select the text below and copy it.
          </p>
          <textarea
            readOnly
            value={manual}
            rows={8}
            aria-label="Problem report"
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full rounded-control bg-sheet p-2 font-mono text-[11px] text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)]"
          />
        </div>
      )}
    </div>
  )
}

function Home() {
  const route = useCensus((s) => s.route)
  const completed = useHelp((s) => s.prefs.completed)
  const show = useHelp((s) => s.showArticle)
  const here = articleForRoute(route.view, route.tab)
  const pageTour = tourForRoute(route.view)
  return (
    <div className="pb-6">
      <div className="px-5 pt-1 pb-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => startTour('getting-started')}>
            Take the tour
          </Button>
          {here && (
            <Button size="sm" onClick={() => show(here.id)}>
              What's on this page
            </Button>
          )}
          <Button size="sm" onClick={() => show('shortcuts')}>
            Keyboard shortcuts
          </Button>
          <Button size="sm" onClick={() => show('whats-new')}>
            What's new
          </Button>
        </div>
        <div className="mt-2">
          <ReportProblem />
        </div>
      </div>
      <div className="mx-3 rounded-sheet bg-sheet">
        {(here || pageTour) && (
          <Group title="This page">
            {here && <Row title={here.title} detail={here.summary} onClick={() => show(here.id)} />}
            {pageTour && (
              <Row
                title={`Tour this page: ${pageTour.title}`}
                detail={`${pageTour.steps.length} steps · ${pageTour.length}`}
                done={completed.includes(pageTour.id)}
                onClick={() => startTour(pageTour.id)}
              />
            )}
          </Group>
        )}
        <Group title="Guided tours">
          {TOURS.filter((t) => t.id !== pageTour?.id).map((t) => (
            <Row
              key={t.id}
              title={t.title}
              detail={`${t.summary} ${t.steps.length} steps.`}
              done={completed.includes(t.id)}
              onClick={() => startTour(t.id)}
            />
          ))}
        </Group>
        {HELP_GROUPS.map((g) => (
          <Group key={g.key} title={g.label}>
            {articlesIn(g.key).map((a) => (
              <Row key={a.id} title={a.title} detail={a.summary} onClick={() => show(a.id)} />
            ))}
          </Group>
        ))}
      </div>
    </div>
  )
}

function Results({ query }: { query: string }) {
  const { metrics } = useAnalytics()
  const show = useHelp((s) => s.showArticle)
  // Built from the definitions in force, so your wording is searchable too.
  const index = useMemo(
    () => buildIndex(ARTICLES, buildGlossary(METRICS.map((m) => metrics.def(m.id) ?? m))),
    [metrics],
  )
  // "Show all" holds for the query it was chosen on; a new query starts capped again.
  const [all, setAll] = useState<{ articles: string | null; terms: string | null }>({
    articles: null,
    terms: null,
  })
  const found = search(index, query, {
    articles: all.articles === query ? Infinity : RESULT_LIMIT,
    terms: all.terms === query ? Infinity : RESULT_LIMIT,
  })
  const { totals } = found
  const none = !totals.articles && !totals.terms
  // After "Show all" the button goes away: focus moves to the first result it added.
  const articleList = useRef<HTMLUListElement>(null)
  const termList = useRef<HTMLUListElement>(null)
  const focusFrom = useRef<{ list: 'articles' | 'terms'; index: number } | null>(null)
  useEffect(() => {
    const f = focusFrom.current
    if (!f) return
    focusFrom.current = null
    const list = f.list === 'articles' ? articleList.current : termList.current
    list?.children[f.index]?.querySelector<HTMLElement>('a, button')?.focus()
  })
  const showAll = (list: 'articles' | 'terms', shown: number) => {
    focusFrom.current = { list, index: shown }
    setAll({ ...all, [list]: query })
  }
  return (
    <div className="px-3 pb-6">
      <p className="sr-only" aria-live="polite">
        {none
          ? 'No results'
          : `${plural(totals.articles, 'article')} and ${plural(totals.terms, 'definition')} found`}
      </p>
      {none ? (
        <p className="px-2.5 py-3 text-[13px] text-ink-2">
          Nothing matches "{query.trim()}". Try fewer or shorter words, or clear the search to browse every
          article.
        </p>
      ) : (
        <div className="rounded-sheet bg-sheet">
          {found.articles.length > 0 && (
            <Group
              title="Articles"
              listRef={articleList}
              more={
                found.articles.length < totals.articles && (
                  <ShowAll
                    shown={found.articles.length}
                    total={totals.articles}
                    noun="articles"
                    onClick={() => showAll('articles', found.articles.length)}
                  />
                )
              }
            >
              {found.articles.map((h) => (
                <Row
                  key={h.article.id}
                  title={h.article.title}
                  detail={h.snippet}
                  onClick={() => show(h.article.id)}
                />
              ))}
            </Group>
          )}
          {found.terms.length > 0 && (
            <Group
              title="Definitions"
              listRef={termList}
              more={
                found.terms.length < totals.terms && (
                  <ShowAll
                    shown={found.terms.length}
                    total={totals.terms}
                    noun="definitions"
                    onClick={() => showAll('terms', found.terms.length)}
                  />
                )
              }
            >
              {found.terms.map(({ entry: e }) => (
                <li key={e.id} className="px-2.5 py-2">
                  <a
                    href={metricHref(e.id)}
                    onClick={(ev) => {
                      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
                      ev.preventDefault()
                      closeHelp()
                      openMetricDefinition(e.id)
                    }}
                    className={cx(LINK_CLASS, 'text-[13px]')}
                  >
                    {e.term}
                  </a>
                  <span className="ml-2 text-[12px] text-muted">{e.where}</span>
                  <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{e.definition}</p>
                </li>
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  )
}

export function HelpSheet() {
  const open = useHelp((s) => s.open)
  const nonce = useHelp((s) => s.nonce)
  const articleId = useHelp((s) => s.articleId)
  const query = useHelp((s) => s.query)
  const setQuery = useHelp((s) => s.setQuery)
  const show = useHelp((s) => s.showArticle)
  const article = articleById(articleId)
  const searchRef = useRef<HTMLInputElement>(null)
  const articleTitleRef = useRef<HTMLHeadingElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Opening at an article focuses its title; the home focuses the search box. Every change of
  // article starts at the top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` changes on every open request
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      bodyRef.current?.scrollTo({ top: 0 })
      if (articleId) articleTitleRef.current?.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, nonce, articleId])

  const tourOfArticle = tourById(article?.tour)
  return (
    <BDialog.Root open={open} onOpenChange={(o) => !o && closeHelp()}>
      <BDialog.Portal>
        <BDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BDialog.Popup
          initialFocus={() => (useHelp.getState().articleId ? articleTitleRef.current : searchRef.current)}
          finalFocus={returnFocus}
          className="fixed top-0 right-0 bottom-0 z-50 flex w-[min(560px,100vw)] flex-col bg-page pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] text-ink shadow-(--shadow-pop) outline-none transition-transform duration-200 ease-out data-[ending-style]:translate-x-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-x-6 data-[starting-style]:opacity-0"
        >
          <div className="flex items-center gap-2 px-5 pt-3.5 pb-2">
            <BDialog.Title className="cut-head flex-1 text-[22px] leading-tight font-semibold">
              Help
            </BDialog.Title>
            <BDialog.Close
              aria-label="Close help"
              className="-mr-1.5 inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink"
            >
              <IconClose />
            </BDialog.Close>
          </div>
          <BDialog.Description className="sr-only">
            Search help articles and metric definitions, take a guided tour, see keyboard shortcuts or report
            a problem.
          </BDialog.Description>
          <div className="px-5 pb-3">
            <label className="relative flex h-9 items-center">
              <span className="sr-only">Search help and definitions</span>
              <IconSearch className="pointer-events-none absolute left-2.5 size-4 text-muted" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder="Search help and definitions"
                className="h-9 w-full rounded-control bg-sheet pr-2 pl-8.5 text-[14px] text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]"
              />
            </label>
          </div>
          {article && (
            <div className="flex items-center gap-2 border-b border-rule px-3 pb-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  show(null)
                  window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 0)
                }}
              >
                <span className="rotate-180">
                  <IconChevronRight />
                </span>
                {query.trim() ? 'Back to results' : 'All help'}
              </Button>
              {tourOfArticle && (
                <span className="ml-auto truncate pr-2 text-[12px] text-muted">
                  Tour: {tourOfArticle.title}
                </span>
              )}
            </div>
          )}
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
            {article ? (
              <ArticleView key={article.id} article={article} titleRef={articleTitleRef} />
            ) : query.trim() ? (
              <Results query={query} />
            ) : (
              <Home />
            )}
          </div>
        </BDialog.Popup>
      </BDialog.Portal>
    </BDialog.Root>
  )
}
