import { view as ai } from './ai'
import { view as comp } from './comp'
import { view as hrbp } from './hrbp'
import { view as org } from './org'
import { view as recruiting } from './recruiting'
import { view as services } from './services'
import { view as talent } from './talent'
import type { ViewDef } from './types'

/** Folder-tab order. */
export const VIEWS: ViewDef[] = [recruiting, hrbp, org, services, talent, comp, ai]
export const viewByKey = new Map(VIEWS.map((v) => [v.key, v]))
