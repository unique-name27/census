/**
 * Help in each mode (docs/ROLES.md, 3.8): which articles and tours a mode shows, the steps a tour
 * keeps (a step whose page, tab, control or figure the mode hides is skipped), which links in an
 * article stay links (a link to a hidden target reads as plain text), and the glossary of shown
 * metrics. Pure: the help UI asks it with `ctx.access`.
 */
import type { AccessContext } from '@/access/context'
import type { Mode } from '@/access/modes'
import { routeShown } from '@/access/policy'
import type { RouteView } from '@/data/store'
import type { GlossaryEntry } from './glossary'
import { articleForMetric } from './learnMore'
import { parseRouteTarget } from './links'
import type { HelpLink } from './markup'
import type { Block, HelpArticle, Tour, TourStep, Without } from './types'

type Access = Pick<AccessContext, 'mode' | 'can'>

export const articleShown = (access: Access, id: string): boolean => access.can(`help:article:${id}`)
export const tourShown = (access: Access, id: string): boolean => access.can(`help:tour:${id}`)

/** The tour "Take the tour" starts: Manager mode has its own. */
export const homeTourOf = (mode: Mode): string => (mode === 'manager' ? 'manager-start' : 'getting-started')

/** The figure a step points at (`[data-tour="figure-<id>"]`), or null. */
const stepFigure = (step: TourStep): string | null =>
  step.target?.match(/^\[data-tour="figure-([^"]+)"\]$/)?.[1] ?? null

/** Whether a mode keeps a tour step: its page and tab, its control and its figure are shown. */
export function stepShown(access: Access, step: TourStep): boolean {
  if (step.view && !routeShown(access.mode, step.view, step.tab ?? '')) return false
  if (step.surface && !access.can(step.surface)) return false
  const figure = stepFigure(step)
  if (figure && step.view && !access.can(`figure:${figure}`, { view: step.view, tab: step.tab ?? '' }))
    return false
  return true
}

/** The summary a mode reads: the first `without` whose surface it hides, else the usual one. */
const summaryIn = (access: Access, summary: string, without: readonly Without[] | undefined): string =>
  without?.find((w) => !access.can(w.surface))?.summary ?? summary

/** The tour as a mode runs it (hidden steps skipped), or null when the mode hides it or no step is left. */
export function tourInMode(access: Access, tour: Tour | null): Tour | null {
  if (!tour || !tourShown(access, tour.id)) return null
  const steps = tour.steps.filter((s) => stepShown(access, s))
  if (!steps.length) return null
  const summary = summaryIn(access, tour.summary, tour.without)
  return steps.length === tour.steps.length && summary === tour.summary ? tour : { ...tour, steps, summary }
}

/**
 * An article's body as a mode shows it: a block whose surface the mode hides is skipped, and a
 * heading with a hidden surface takes its section (every block up to the next heading) with it. A
 * block with `unless` shows only where that surface is hidden.
 */
export function blocksInMode(access: Access, body: readonly Block[]): Block[] {
  const out: Block[] = []
  let skipping = false
  for (const b of body) {
    if ('h' in b) skipping = false
    if (skipping) continue
    if (b.surface && !access.can(b.surface)) {
      if ('h' in b) skipping = true
      continue
    }
    if (b.unless && access.can(b.unless)) continue
    out.push(b)
  }
  return out
}

/**
 * An article as a mode shows and searches it: hidden sections left out, the summary for what the
 * mode shows, and the search words about shown things only. The same object when nothing changes.
 */
export function articleInMode(access: Access, a: HelpArticle): HelpArticle {
  const body = blocksInMode(access, a.body)
  const summary = summaryIn(access, a.summary, a.without)
  const extra = (a.keywordsWhere ?? []).filter((k) => access.can(k.surface)).flatMap((k) => k.words)
  if (body.length === a.body.length && summary === a.summary && !a.keywordsWhere) return a
  return { ...a, body, summary, keywords: [...(a.keywords ?? []), ...extra] }
}

/** Whether a link in an article stays a link in this mode (else it reads as plain text). */
export function linkShown(access: Access, link: HelpLink): boolean {
  switch (link.kind) {
    case 'route': {
      const { view, tab } = parseRouteTarget(link.target)
      return routeShown(access.mode, view as RouteView, tab)
    }
    case 'metric':
      // A metric link opens its entry in Metric definitions, in the Data room.
      return access.can('page:data') && access.can(`metric:${link.target}`)
    case 'article':
      return articleShown(access, link.target)
    case 'tour':
      return tourShown(access, link.target)
    case 'settings':
      return access.can(`settings:${link.target}`)
  }
}

/** The articles a mode shows, in Help sheet order, as it shows them (`articleInMode`). */
export const articlesInMode = (access: Access, articles: readonly HelpArticle[]): HelpArticle[] =>
  articles.filter((a) => articleShown(access, a.id)).map((a) => articleInMode(access, a))

/**
 * The glossary of the metrics a mode shows. A privacy rule goes with its article: Manager mode
 * hides the pay, immigration and survey rules, which apply to views it does not show.
 */
export const glossaryInMode = (access: Access, entries: readonly GlossaryEntry[]): GlossaryEntry[] =>
  entries.filter((e) => {
    if (!access.can(`metric:${e.id}`)) return false
    const article = e.id.startsWith('privacy.') ? articleForMetric(e.id) : null
    return !article || articleShown(access, article)
  })
