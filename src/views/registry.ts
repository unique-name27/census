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
import type { ViewDef } from './types'

/** Folder-tab order: the scorecard first, then the employee lifecycle, then AI in HR. */
export const VIEWS: ViewDef[] = [
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
