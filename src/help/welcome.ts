/**
 * The welcome line each home carries on a first visit (docs/ROLES.md 3.1; docs/ROLES-V2.md 4.3):
 * which page has one in which mode, its words and the tour it starts. Pure, so a test checks every
 * mode; `ui/WelcomeCard.tsx` draws it.
 */
import { HOME_OF, MODE_NAME, type Mode } from '@/access/modes'
import type { WelcomeLine } from './store'

export const GETTING_STARTED = 'getting-started'
export const MANAGER_START = 'manager-start'
export const HOME_START = 'home-start'

/** Where a welcome line sits: HR mode's Scorecard, Manager mode's My team, or a role's Home. */
export type WelcomeVariant = 'hr' | 'manager' | 'home'

/** The line's words and tour for a mode, or null where that page has no welcome line. */
export function welcomeCopy(
  variant: WelcomeVariant,
  mode: Mode | undefined,
): { line: WelcomeLine; title: string; take: string; tour: string } | null {
  if (variant === 'hr')
    return !mode || mode === 'hr'
      ? { line: 'hr', title: 'New to Census?', take: 'Take the 2-minute tour', tour: GETTING_STARTED }
      : null
  if (variant === 'manager')
    return !mode || mode === 'manager'
      ? { line: 'manager', title: 'New to My team?', take: 'Take the 1-minute tour', tour: MANAGER_START }
      : null
  if (!mode || HOME_OF[mode] !== 'home') return null
  return {
    line: { home: mode },
    title: `New to ${MODE_NAME[mode]} mode?`,
    take: 'Take the 1-minute tour',
    tour: HOME_START,
  }
}
