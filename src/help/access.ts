/**
 * Help in each mode (docs/ROLES.md, 3.8): which articles and tours a mode shows, the steps a tour
 * keeps (a step whose page, tab, control or figure the mode hides is skipped), which links in an
 * article stay links (a link to a hidden target reads as plain text), and the glossary of shown
 * metrics. Pure: the help UI asks it with `ctx.access`.
 */
import type { AccessContext } from '@/access/context'
import { HOME_OF, type Mode } from '@/access/modes'
import { routeShown } from '@/access/policy'
import type { RouteView } from '@/data/store'
import type { GlossaryEntry } from './glossary'
import { articleForMetric } from './learnMore'
import { parseRouteTarget } from './links'
import type { HelpLink } from './markup'
import type { Block, Condition, HelpArticle, Tour, TourStep, Without } from './types'

type Access = Pick<AccessContext, 'mode' | 'can'>

export const articleShown = (access: Access, id: string): boolean => access.can(`help:article:${id}`)
export const tourShown = (access: Access, id: string): boolean => access.can(`help:tour:${id}`)

/**
 * The tour "Take the tour" and the welcome line start (docs/ROLES-V2.md 4.8): each mode's first
 * tour of its own home. HR and Developer take "Getting started", Manager "Getting started as a
 * manager", and every mode that opens on Home "Getting started with your home".
 */
export function homeTourOf(mode: Mode): string {
  if (mode === 'manager') return 'manager-start'
  return HOME_OF[mode] === 'home' ? 'home-start' : 'getting-started'
}

const listOf = (s: string | readonly string[] | undefined): readonly string[] =>
  s === undefined ? [] : typeof s === 'string' ? [s] : s

/**
 * Whether a block, step or wording applies in a mode: every `surface` shown, and not every `unless`
 * shown (so `{ surface: x }` and `{ unless: x }` split the modes in two, whatever x lists).
 */
export function holds(access: Access, c: Condition): boolean {
  const unless = listOf(c.unless)
  return (
    listOf(c.surface).every((s) => access.can(s)) && !(unless.length && unless.every((s) => access.can(s)))
  )
}

/** The figure a step points at (`[data-tour="figure-<id>"]`), or null. */
const stepFigure = (step: TourStep): string | null =>
  step.target?.match(/^\[data-tour="figure-([^"]+)"\]$/)?.[1] ?? null

/** Whether a mode keeps a tour step: its condition holds, and its page, tab and figure are shown. */
export function stepShown(access: Access, step: TourStep): boolean {
  if (step.view && !routeShown(access.mode, step.view, step.tab ?? '')) return false
  if (!holds(access, step)) return false
  const figure = stepFigure(step)
  if (figure && step.view && !access.can(`figure:${figure}`, { view: step.view, tab: step.tab ?? '' }))
    return false
  return true
}

/**
 * A step as a mode reads it: the first `wording` whose condition holds replaces its title, body and
 * target, and the wordings are dropped. A step without any is returned as it is.
 */
export function stepWording(access: Access, step: TourStep): TourStep {
  if (!step.wording) return step
  const { wording, ...rest } = step
  const w = wording.find((x) => holds(access, x))
  if (!w) return rest
  return {
    ...rest,
    title: w.title ?? step.title,
    body: w.body,
    ...(w.target ? { target: w.target } : {}),
    ...(w.placement ? { placement: w.placement } : {}),
  }
}

/** The summary a mode reads: the first `without` that applies (its surface hidden, or its `when` holds). */
const summaryIn = (access: Access, summary: string, without: readonly Without[] | undefined): string =>
  without?.find(
    (w) => (w.surface !== undefined && !access.can(w.surface)) || (w.when && holds(access, w.when)),
  )?.summary ?? summary

/**
 * The tour as a mode runs it: each step in the mode's wording, steps on what the mode hides skipped;
 * null when the mode hides the tour or no step is left.
 */
export function tourInMode(access: Access, tour: Tour | null): Tour | null {
  if (!tour || !tourShown(access, tour.id)) return null
  const worded = tour.steps.map((s) => stepWording(access, s))
  const steps = worded.filter((s) => stepShown(access, s))
  if (!steps.length) return null
  const summary = summaryIn(access, tour.summary, tour.without)
  const same = steps.length === tour.steps.length && steps.every((s, i) => s === tour.steps[i])
  return same && summary === tour.summary ? tour : { ...tour, steps, summary }
}

/** Two lists in a row (one block per item that differs by mode) read as one list. */
function mergeLists(blocks: readonly Block[]): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    const last = out.at(-1)
    if (last && 'ul' in b && 'ul' in last) out[out.length - 1] = { ul: [...last.ul, ...b.ul] }
    else if (last && 'ol' in b && 'ol' in last) out[out.length - 1] = { ol: [...last.ol, ...b.ol] }
    else out.push(b)
  }
  return out
}

/**
 * An article's body as a mode shows it: a block whose condition the mode does not meet is skipped,
 * and such a heading takes its section (every block up to the next heading) with it. Lists left
 * next to each other read as one.
 */
export function blocksInMode(access: Access, body: readonly Block[]): Block[] {
  const out: Block[] = []
  let skipping = false
  for (const b of body) {
    if ('h' in b) skipping = false
    if (skipping) continue
    if (!holds(access, b)) {
      if ('h' in b) skipping = true
      continue
    }
    out.push(b)
  }
  return mergeLists(out)
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
