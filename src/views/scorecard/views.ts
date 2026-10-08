/**
 * The views the People scorecard reads, in folder-tab order (`VIEW_KEYS`). They are imported one
 * by one rather than from '@/views/registry': the registry imports the scorecard, so reading it
 * back from here would be an import cycle (it breaks hot reload and any import that starts at the
 * scorecard). A test keeps this list equal to the registry's.
 */
import { VIEW_KEYS } from '@/data/schema'
import { view as ai } from '../ai'
import { view as comp } from '../comp'
import { view as compliance } from '../compliance'
import { view as hrbp } from '../hrbp'
import { view as listening } from '../listening'
import { view as onboarding } from '../onboarding'
import { view as org } from '../org'
import { view as recruiting } from '../recruiting'
import { view as services } from '../services'
import { view as talent } from '../talent'
import { view as team } from '../team'
import type { ViewDef } from '../types'

const BY_KEY = new Map(
  [team, recruiting, onboarding, hrbp, org, services, talent, comp, compliance, listening, ai].map((v) => [
    v.key,
    v,
  ]),
)

/**
 * Every view but the scorecard and Home, in folder-tab order. Home (the role homes) composes the
 * Scorecard and other views' numbers, with no summary and no open items of its own, so leaving it
 * out changes nothing the Scorecard or the Action center reads, and avoids an import cycle.
 */
export const OTHER_VIEWS: readonly ViewDef[] = VIEW_KEYS.flatMap((k) => {
  const v = BY_KEY.get(k)
  return v ? [v] : []
})
