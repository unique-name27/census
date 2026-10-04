/** Every help article, in Help sheet order, and lookups by id and by page. */
import type { RouteView } from '@/data/store'
import type { HelpArticle, HelpGroup } from '../types'
import { DATA_ARTICLES } from './data'
import { DEFINITION_ARTICLES } from './definitions'
import { PRIVACY_ARTICLES } from './privacy'
import { START_ARTICLES } from './start'
import { SUPPORT_ARTICLES } from './support'
import { VIEW_ARTICLES } from './views'

export const ARTICLES: readonly HelpArticle[] = [
  ...START_ARTICLES,
  ...VIEW_ARTICLES,
  ...DATA_ARTICLES,
  ...DEFINITION_ARTICLES,
  ...PRIVACY_ARTICLES,
  ...SUPPORT_ARTICLES,
]

const BY_ID = new Map(ARTICLES.map((a) => [a.id, a]))

export const articleById = (id: string | null | undefined): HelpArticle | null =>
  id ? (BY_ID.get(id) ?? null) : null

export const articlesIn = (group: HelpGroup): HelpArticle[] => ARTICLES.filter((a) => a.group === group)

/**
 * The article for a page and tab ("What's on this page", "About this view"): a tab-specific
 * article first (the Data room's Data quality tab), then the page's own.
 */
export function articleForRoute(view: RouteView, tab = ''): HelpArticle | null {
  const t = tab.split(/[-:/]/)[0]
  const onPage = ARTICLES.filter((a) => a.route?.view === view)
  return onPage.find((a) => t && a.route?.tab === t) ?? onPage.find((a) => !a.route?.tab) ?? onPage[0] ?? null
}
