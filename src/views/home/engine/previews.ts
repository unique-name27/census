/**
 * Home in Developer mode (docs/ROLES-V2.md 5.13): Developer mode has no home of its own, so the
 * page links to the Developer page's preview of each role's Home (`#dev.inventory:homes/finance`),
 * in Mode menu order. Pure.
 */
import { MODE_LABEL, MODES, type Mode } from '@/access/modes'
import { homePreviewTab } from '@/dev/tabs'
import { SLUG_OF } from './figures'

export interface HomePreviewLink {
  mode: Mode
  /** "HRBP for a region". */
  label: string
  /** The Developer page's route tab: "inventory:homes/hrbp-region". */
  tab: string
}

/** One link per role whose first page is Home. */
export const homePreviewLinks = (): HomePreviewLink[] =>
  MODES.filter((m) => SLUG_OF[m] !== null).map((mode) => ({
    mode,
    label: MODE_LABEL[mode],
    tab: homePreviewTab(mode),
  }))

/** The Role homes list itself. */
export const ROLE_HOMES_TAB = homePreviewTab()
