/**
 * CHRO mode (docs/ROLES-V2.md 1.1 and 8.3): HR plus the executive home. Nothing HR shows is taken
 * away; `view:home`, its tab, the CHRO home figures and the shared home figures (Needs attention,
 * My list), the Home article and the home tour are shown. Other roles' home figures stay hidden.
 * Pure.
 */
import { isOtherHomeFigure } from '../modes'
import { DEV_PAGES, isDeveloperOnly } from './developer'
import { LISTS_NOT_IN_HR, ROLE_LIST_SURFACES } from './hr'
import { type At, type Decision, hidden, SHOWN } from './types'

export const NOT_IN_CHRO = 'CHRO mode leaves out the developer surfaces and My team.'
export const OTHER_HOME = "Another role's home."

export function decideChro(s: string, at?: At): Decision {
  if (isDeveloperOnly(s)) return hidden(NOT_IN_CHRO)
  if (at && DEV_PAGES.has(at.view)) return hidden(NOT_IN_CHRO)
  if (s.startsWith('figure:') && isOtherHomeFigure('chro', s.slice(7))) return hidden(OTHER_HOME)
  if (ROLE_LIST_SURFACES.includes(s)) return hidden(LISTS_NOT_IN_HR)
  return SHOWN
}
