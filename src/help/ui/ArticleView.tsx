/**
 * One help article in the Help sheet: its blocks with inline links, the definitions it explains
 * (from the metric dictionary, with your wording), its tour, and for the generated articles the
 * glossary or the release notes.
 */
import type { ReactNode, Ref } from 'react'
import { routeShown } from '@/access/policy'
import { Button, cx } from '@/components/ui'
import { useAnalytics, useAnalyticsIfAny } from '@/data/context'
import { DEV_TABS, parseDevTab } from '@/dev/tabs'
import { formatDate } from '@/lib/dates'
import { METRICS } from '@/metrics/catalog'
import { DATA_TABS } from '@/views/data/links'
import { metricHref, openMetricDefinition } from '@/views/data/metrics/open'
import { glossaryInMode, linkShown, tourInMode } from '../access'
import { buildGlossary, PAGE_LABEL } from '../glossary'
import { followLink, linkHref } from '../links'
import { type HelpLink, parseInline } from '../markup'
import { closeHelp, startTour, useHelp } from '../store'
import { tourById } from '../tours'
import type { Block, HelpArticle } from '../types'
import { RELEASE_NOTES } from '../whatsNew'

export const LINK_CLASS =
  'rounded-mark font-medium text-link underline decoration-1 underline-offset-2 hover:decoration-2'

function HelpLinkView({ link }: { link: HelpLink }) {
  const access = useAnalyticsIfAny()?.access
  // A link to something the mode hides reads as plain text (docs/ROLES.md, 3.8).
  if (access && !linkShown(access, link)) return <span>{link.label}</span>
  const href = linkHref(link)
  if (href)
    return (
      <a
        href={href}
        className={LINK_CLASS}
        onClick={(e) => {
          // A modified click opens the page in a new tab as usual.
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
          e.preventDefault()
          followLink(link)
        }}
      >
        {link.label}
      </a>
    )
  return (
    <button type="button" className={cx(LINK_CLASS, 'text-left')} onClick={() => followLink(link)}>
      {link.label}
    </button>
  )
}

/** Text with its inline links. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((p, i) =>
        'text' in p ? <span key={i}>{p.text}</span> : <HelpLinkView key={i} link={p.link} />,
      )}
    </>
  )
}

function BlockView({ block }: { block: Block }) {
  if ('h' in block)
    return <h3 className="cut-head mt-5 text-title leading-snug font-semibold text-ink">{block.h}</h3>
  if ('p' in block)
    return (
      <p className="mt-2 text-small leading-[1.55] text-ink-2">
        <RichText text={block.p} />
      </p>
    )
  if ('note' in block)
    return (
      <p className="mt-3 rounded-control bg-sheet-2 px-3 py-2 text-meta leading-snug text-ink-2">
        <RichText text={block.note} />
      </p>
    )
  const List = 'ul' in block ? 'ul' : 'ol'
  const items = 'ul' in block ? block.ul : block.ol
  return (
    <List
      className={cx(
        'mt-2 flex flex-col gap-1.5 pl-5 text-small leading-[1.5] text-ink-2 marker:text-muted',
        List === 'ul' ? 'list-disc' : 'list-decimal',
      )}
    >
      {items.map((t, i) => (
        <li key={i}>
          <RichText text={t} />
        </li>
      ))}
    </List>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 border-t border-rule pt-4">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  )
}

/** A metric's name and definition as they are in force, with a link to its entry. */
function DefinitionItem({ id }: { id: string }) {
  const { metrics, access } = useAnalytics()
  const def = metrics.def(id)
  if (!def || !access.can(`metric:${id}`)) return null
  // The entry opens in Metric definitions, in the Data room; where that is hidden, the name is text.
  if (!access.can('page:data'))
    return (
      <li className="py-2">
        <span className="text-small font-medium text-ink">{def.name}</span>
        <p className="mt-0.5 text-meta leading-snug text-ink-2">{def.definition}</p>
      </li>
    )
  return (
    <li className="py-2">
      <a
        href={metricHref(id)}
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
          e.preventDefault()
          closeHelp()
          openMetricDefinition(id)
        }}
        className={cx(LINK_CLASS, 'text-small')}
      >
        {def.name}
      </a>
      <p className="mt-0.5 text-meta leading-snug text-ink-2">{def.definition}</p>
    </li>
  )
}

function Glossary() {
  const { metrics, access } = useAnalytics()
  // The metrics the mode shows; their names link to Metric definitions where the Data room shows.
  const entries = glossaryInMode(access, buildGlossary(METRICS.map((m) => metrics.def(m.id) ?? m)))
  const linked = access.can('page:data')
  return (
    <Section title={`${entries.length} terms`}>
      <dl className="mt-1 divide-y divide-rule">
        {entries.map((e) => (
          <div key={e.id} className="py-2.5">
            <dt className="flex flex-wrap items-baseline gap-x-2">
              {!linked ? (
                <span className="text-small font-medium text-ink">{e.term}</span>
              ) : (
                <a
                  href={metricHref(e.id)}
                  onClick={(ev) => {
                    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
                    ev.preventDefault()
                    closeHelp()
                    openMetricDefinition(e.id)
                  }}
                  className={cx(LINK_CLASS, 'text-small')}
                >
                  {e.term}
                </a>
              )}
              <span className="text-meta text-muted">{e.where}</span>
            </dt>
            <dd className="mt-0.5 text-meta leading-snug text-ink-2">{e.definition}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

function WhatsNew() {
  return (
    <div className="mt-2 flex flex-col gap-5">
      {RELEASE_NOTES.map((r, i) => (
        <section key={`${r.date}-${i}`}>
          <p className="text-meta text-muted">{formatDate(r.date)}</p>
          <h3 className="cut-head text-title leading-snug font-semibold text-ink">{r.title}</h3>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-small leading-[1.5] text-ink-2 marker:text-muted">
            {r.items.map((t, j) => (
              <li key={j}>{t}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** "Recruiting", or a Data room or Developer page tab by its own name ("Data quality", "Security center"). */
function pageName(view: string, tab?: string): string {
  if (view === 'data' && tab) return DATA_TABS.find((t) => t.route === tab)?.label ?? PAGE_LABEL.data
  if (view === 'dev' && tab) {
    const dev = parseDevTab(tab).tab
    if (dev !== 'overview') return DEV_TABS.find((t) => t.key === dev)?.label ?? 'Developer'
  }
  return (PAGE_LABEL as Readonly<Record<string, string>>)[view] ?? (view === 'dev' ? 'Developer' : view)
}

export function ArticleView({
  article,
  titleRef,
}: {
  article: HelpArticle
  titleRef: Ref<HTMLHeadingElement>
}) {
  // The tour and page the mode shows (docs/ROLES.md, 3.8).
  const { access } = useAnalytics()
  const tour = tourInMode(access, tourById(article.tour))
  const route =
    article.route && routeShown(access.mode, article.route.view, article.route.tab ?? '')
      ? article.route
      : undefined
  const completed = useHelp((s) => s.prefs.completed)
  return (
    <article className="px-5 pt-2 pb-8">
      <h2
        ref={titleRef}
        tabIndex={-1}
        className="cut-head rounded-mark text-section leading-tight font-semibold outline-none focus-visible:outline-2 focus-visible:outline-focus"
      >
        {article.title}
      </h2>
      <p className="mt-1 text-small leading-snug text-muted">{article.summary}</p>
      {(tour || route) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tour && (
            <Button size="sm" variant="primary" onClick={() => startTour(tour.id)}>
              {completed.includes(tour.id) ? 'Take the tour again' : 'Take the tour'}
              <span className="font-normal opacity-80">· {tour.length}</span>
            </Button>
          )}
          {route && (
            <Button
              size="sm"
              onClick={() =>
                followLink({
                  kind: 'route',
                  target: route.tab ? `${route.view}.${route.tab}` : route.view,
                  label: '',
                })
              }
            >
              Open {pageName(route.view, route.tab)}
            </Button>
          )}
        </div>
      )}
      <div className="mt-2">
        {article.body.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
      </div>
      {article.generated === 'whats-new' && <WhatsNew />}
      {article.metrics && article.metrics.length > 0 && (
        <Section title="Definitions">
          <ul className="divide-y divide-rule">
            {article.metrics.map((id) => (
              <DefinitionItem key={id} id={id} />
            ))}
          </ul>
        </Section>
      )}
      {article.generated === 'glossary' && <Glossary />}
    </article>
  )
}
