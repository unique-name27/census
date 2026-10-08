/**
 * What every onboarding measure reads, built once per analytics context: the settings in force,
 * the upcoming starts, the people who started in the window and their tasks.
 */
import type { RegionIndex } from '@/access/scopes/regions'
import type { AnalyticsContext } from '@/data/context'
import type { Employee, ISODate, Requisition } from '@/data/schema'
import { PERIOD_LABELS, type Window } from '@/data/scope'
import type { MetricsApi } from '@/metrics/types'
import { regionsOf } from '../../hrbp/engine/places'
import { type OnboardingSettings, onboardingSettings } from './settings'
import {
  type Start,
  type StartSources,
  startersIn,
  type TaskIndex,
  taskIndex,
  type UpcomingPeople,
  upcomingPeople,
} from './starts'

export interface OnboardingBase {
  asOf: ISODate
  window: Window
  prior: Window
  /** "last 12 months", or the exact range of a custom window. */
  windowWords: string
  scopeLabel: string
  isCompany: boolean
  metrics: MetricsApi
  settings: OnboardingSettings
  /** Every requisition by ID (unscoped, so a candidate always finds its req). */
  reqs: ReadonlyMap<string, Requisition>
  /** Employees by ID (unscoped). */
  byId: ReadonlyMap<string, Employee>
  tasks: TaskIndex
  /** Scoped sources for starts. */
  src: StartSources
  upcoming: UpcomingPeople
  /** Employees who started in the window. */
  starters: Start[]
  /** Any onboarding task is loaded (company-wide): without them readiness is "—", never 0%. */
  hasTasks: boolean
  hasCandidates: boolean
  hasPlan: boolean
  hasSurveys: boolean
  /**
   * Manager and Finance mode (docs/ROLES-V2.md 4.2): a background check or export-control
   * screening reads as the team holding it ("With People ops"), never where it stands, in every
   * table and record of the page.
   */
  masked: boolean
  /**
   * Manager and Recruiter mode: I-9 tasks (an HR ops and Compliance measure) are left out of
   * readiness by task.
   */
  hideI9: boolean
  /** The one region index (`ctx.regions`). */
  regions: RegionIndex
}

const reqIndexes = new WeakMap<readonly Requisition[], Map<string, Requisition>>()
function reqIndex(reqs: readonly Requisition[]): Map<string, Requisition> {
  let m = reqIndexes.get(reqs)
  if (!m) {
    m = new Map(reqs.map((r) => [r.reqId, r]))
    reqIndexes.set(reqs, m)
  }
  return m
}

const cache = new WeakMap<AnalyticsContext, OnboardingBase>()

export function onboardingBase(ctx: AnalyticsContext): OnboardingBase {
  const hit = cache.get(ctx)
  if (hit) return hit
  const settings = onboardingSettings(ctx.metrics)
  const reqs = reqIndex(ctx.all.requisitions)
  const tasks = taskIndex(ctx.data.onboardingTasks)
  const regions = regionsOf(ctx)
  const mode = ctx.access.mode
  const src: StartSources = {
    regions,
    employees: ctx.data.employees,
    candidates: ctx.data.candidates,
    reqs,
    byId: ctx.org.byId,
    tasks,
    asOf: ctx.asOf,
    settings,
  }
  const p = ctx.filters.period
  const base: OnboardingBase = {
    asOf: ctx.asOf,
    window: ctx.window,
    prior: ctx.prior,
    windowWords: p === 'custom' ? ctx.window.label : PERIOD_LABELS[p].toLowerCase(),
    scopeLabel: ctx.scopeLabel,
    isCompany: ctx.isCompany,
    metrics: ctx.metrics,
    settings,
    reqs,
    byId: ctx.org.byId,
    tasks,
    src,
    upcoming: upcomingPeople(src, settings.unknownLookbackDays),
    starters: startersIn(src, ctx.window),
    hasTasks: ctx.all.onboardingTasks.length > 0,
    hasCandidates: ctx.all.candidates.length > 0,
    hasPlan: ctx.all.hiringPlan.length > 0,
    hasSurveys: ctx.all.surveyResponses.length > 0,
    masked: mode === 'manager' || mode === 'finance',
    hideI9: mode === 'manager' || mode === 'recruiter',
    regions,
  }
  cache.set(ctx, base)
  return base
}
