/**
 * Help content types (docs/HELP.md). Articles and tours are plain data kept in TypeScript, so they
 * ship in the one-file build, are searchable and are checked by tests.
 *
 * Inline links in article text use a small markup: `[label](kind:target)`, where kind is
 *   route    `route:hrbp.attrition`, `route:data.quality`, `route:actions` (a view or page and tab)
 *   metric   `metric:hrbp.attrition.voluntary` (the entry in Metric definitions)
 *   article  `article:data-tiers` (another help article)
 *   tour     `tour:getting-started` (start a guided tour)
 *   settings `settings:privacy` (open Settings at a section)
 */
import type { RouteView } from '@/data/store'

/** The groups of the Help sheet, in order (docs/HELP.md, Help articles). */
export type HelpGroup = 'start' | 'views' | 'data' | 'definitions' | 'privacy' | 'support'

export const HELP_GROUPS: readonly { key: HelpGroup; label: string }[] = [
  { key: 'start', label: 'Start here' },
  { key: 'views', label: 'Each view' },
  { key: 'data', label: 'Your data' },
  { key: 'definitions', label: 'Definitions' },
  { key: 'privacy', label: 'Privacy and trust' },
  { key: 'support', label: 'Help and support' },
]

/** One block of an article body. Text may carry inline links (see the module comment). */
export type Block =
  | { p: string }
  | { h: string }
  | { ul: readonly string[] }
  | { ol: readonly string[] }
  | { note: string }

export interface HelpArticle {
  /** Stable kebab-case id: "view-recruiting", "data-tiers". */
  id: string
  group: HelpGroup
  /** Sentence case, no end punctuation. */
  title: string
  /** One plain sentence shown under the title in lists and search results. */
  summary: string
  body: readonly Block[]
  /** Extra words people may search for that the text does not use. */
  keywords?: readonly string[]
  /** The page the article is about: "About this view" there opens it. */
  route?: { view: RouteView; tab?: string }
  /** Metric dictionary entries the article explains, listed under "Definitions". */
  metrics?: readonly string[]
  /** The tour that walks through what the article describes. */
  tour?: string
  /** Content generated at runtime after the body: the metric glossary or the release notes. */
  generated?: 'glossary' | 'whats-new'
}

export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'auto'

export interface TourStep {
  /** A CSS selector, always `[data-tour="..."]`. Without one the step is a centered card. */
  target?: string
  /** Sentence case. */
  title: string
  body: string
  placement?: Placement
  /** The view or page the step needs; the tour opens it first. */
  view?: RouteView
  /** The tab within that view ('' is its first tab). */
  tab?: string
}

export interface Tour {
  id: string
  /** Sentence case: "Getting started". */
  title: string
  /** One sentence for the list in the Help sheet. */
  summary: string
  /** Rough length shown in the list: "2 minutes". */
  length: string
  /** The view or page the tour belongs to; "Tour this page" picks it. */
  route?: RouteView
  steps: readonly TourStep[]
}
