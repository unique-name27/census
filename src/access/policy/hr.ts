/**
 * HR mode (docs/ROLES.md 3; docs/ROLES-V2.md 4): everything but the developer surfaces, My team and
 * the role homes (HR opens on the Scorecard). Pure.
 */
import { DEV_PAGES, isDeveloperOnly } from './developer'
import { type At, type Decision, hidden, SHOWN } from './types'

export const NOT_IN_HR = 'HR mode leaves out the developer surfaces and My team.'
export const HOME_NOT_IN_HR = 'HR mode opens on the Scorecard. Home is the first page of the other HR roles.'

/** The role homes (`#home`): its view, header actions, tab, figures, article and tour. */
export const HOME_SURFACES: readonly string[] = [
  'view:home',
  'header:home',
  'help:article:view-home',
  'help:tour:view-home',
  'help:tour:home-start',
]
export const HOME_PREFIXES: readonly string[] = ['tab:home.', 'figure:home-']

export const isHomeSurface = (s: string): boolean =>
  HOME_SURFACES.includes(s) || HOME_PREFIXES.some((p) => s.startsWith(p))

/**
 * Surfaces of the role modes that HR (and CHRO) leave out: the Action center's "Needs attention"
 * and "Waiting on others" lists (docs/ROLES-V2.md 4.4). HR lists every item in the owner sheets.
 */
export const ROLE_LIST_SURFACES: readonly string[] = ['ui:attention-lists']
export const LISTS_NOT_IN_HR =
  'HR lists every open item, grouped by who it waits on; the two lists are for the role modes.'

export function decideHr(s: string, at?: At): Decision {
  if (isDeveloperOnly(s)) return hidden(NOT_IN_HR)
  if (at && DEV_PAGES.has(at.view)) return hidden(NOT_IN_HR)
  if (isHomeSurface(s) || at?.view === 'home') return hidden(HOME_NOT_IN_HR)
  if (ROLE_LIST_SURFACES.includes(s)) return hidden(LISTS_NOT_IN_HR)
  return SHOWN
}
