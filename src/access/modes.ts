/**
 * The three modes (docs/ROLES.md, part 1): names, one-line hints and each mode's home. Pure.
 */
import type { Route, RouteView } from '@/data/store'

export type Mode = 'hr' | 'manager' | 'developer'

/** In the order the Mode menu and Settings list them. */
export const MODES: readonly Mode[] = ['hr', 'manager', 'developer']

export const isMode = (v: unknown): v is Mode => v === 'hr' || v === 'manager' || v === 'developer'

/** The name the UI uses: "HR", "Manager", "Developer". */
export const MODE_LABEL: Record<Mode, string> = { hr: 'HR', manager: 'Manager', developer: 'Developer' }

/** One line under each choice in the Mode menu and Settings > Mode. */
export const MODE_HINT: Record<Mode, string> = {
  hr: 'Every view, the Data room and Settings, for the HR team.',
  manager: "One manager's org: people stats, org chart, hiring, starts and talent.",
  developer: 'Everything in HR mode, plus the Developer page and debug overlays.',
}

/** The page each mode opens on: the Scorecard, My team, or the Developer page. */
export const HOME_OF: Record<Mode, RouteView> = { hr: 'scorecard', manager: 'team', developer: 'dev' }

export const homeOf = (mode: Mode): Route => ({ view: HOME_OF[mode], tab: '' })

/** The page names a redirect toast uses: "Census opened My team instead." */
export const HOME_LABEL: Record<Mode, string> = {
  hr: 'the Scorecard',
  manager: 'My team',
  developer: 'the Developer page',
}

/**
 * The Mode button's text: "HR mode", "Manager: Priya Raman", "Developer mode". A manager mode
 * without a manager reads "Manager mode".
 */
export function modeButtonLabel(mode: Mode, managerName?: string | null): string {
  if (mode === 'manager') return managerName ? `Manager: ${managerName}` : 'Manager mode'
  return `${MODE_LABEL[mode]} mode`
}
