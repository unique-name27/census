import type { AnalyticsContext } from '@/data/context'
import { view as ai } from './ai'
import { view as comp } from './comp'
import { view as compliance } from './compliance'
import { view as hrbp } from './hrbp'
import { view as listening } from './listening'
import { view as onboarding } from './onboarding'
import { view as org } from './org'
import { view as recruiting } from './recruiting'
import { view as scorecard } from './scorecard'
import { view as services } from './services'
import { view as talent } from './talent'
import { view as team } from './team'
import { type ViewDef, withAccessTabs } from './types'

/**
 * Folder-tab order: My team (Manager mode's home) and the scorecard first, then the employee
 * lifecycle, then AI in HR. Each mode shows its own subset (`visibleViews`).
 */
export const VIEWS: ViewDef[] = [
  team,
  scorecard,
  recruiting,
  onboarding,
  hrbp,
  org,
  services,
  talent,
  comp,
  compliance,
  listening,
  ai,
]
export const viewByKey = new Map(VIEWS.map((v) => [v.key, v]))

type ViewAccess = Pick<AnalyticsContext['access'], 'can' | 'mode'>

/** The views a mode shows, each with only its shown tabs (docs/ROLES.md, 6.5). */
export function visibleViews(access: ViewAccess): ViewDef[] {
  return VIEWS.filter((v) => access.can(`view:${v.key}`)).map((v) => withAccessTabs(v, access))
}

/**
 * The folder tabs a mode shows: its visible views, except that Developer mode opens My team and
 * Home by address and from the Developer page only (they are other modes' homes, not folder tabs
 * there; docs/ROLES-V2.md 4.1).
 */
export function folderViews(access: ViewAccess): ViewDef[] {
  return visibleViews(access).filter(
    (v) =>
      (v.key !== 'team' || access.mode === 'manager') && (v.key !== 'home' || access.mode !== 'developer'),
  )
}
