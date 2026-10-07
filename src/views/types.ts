import type { ComponentType } from 'react'
import type { Finding, Kpi, Severity } from '@/components/types'
import type { AnalyticsContext, Features } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { DatasetKey, ISODate, ViewKey } from '@/data/schema'
import type { DrillSource } from '@/drill/Drill'
import type { DrillKind } from '@/drill/types'

export interface ViewTab {
  key: string
  label: string
  /**
   * Shown only while this Settings switch is on (Listening's Engagement tab). The shell drops the
   * tab, its link and its share of the whole-view export while the switch is off.
   */
  feature?: keyof Features
}

/** The view with only the tabs whose feature switch is on (the same object when none is gated). */
export function withFeatureTabs(view: ViewDef, features: Features): ViewDef {
  if (!view.tabs.some((t) => t.feature)) return view
  return { ...view, tabs: view.tabs.filter((t) => !t.feature || features[t.feature]) }
}

/**
 * The view with only the tabs the mode shows (docs/ROLES.md, 6.5), beside `withFeatureTabs`; the
 * shell applies both. The same object when every tab is shown.
 */
export function withAccessTabs(view: ViewDef, access: Pick<AnalyticsContext['access'], 'can'>): ViewDef {
  const tabs = view.tabs.filter((t) => access.can(`tab:${view.key}.${t.key}`))
  return tabs.length === view.tabs.length ? view : { ...view, tabs }
}

/** The live number printed on a view's folder tab. Must be cheap to compute. */
export interface Headline {
  value: string
  label: string
  /** The metric dictionary entry the number comes from. */
  metricId?: string
  spark?: (number | null)[]
  /**
   * The fields the number (and its spark) is computed from. The folder tab gates it on the data
   * standard like any KPI; without it, the tier of the view's datasets is used.
   */
  uses?: readonly FieldRef[]
}

/**
 * What the People scorecard reads from a view without rendering it: its key numbers and its
 * readout. Each KPI and finding carries `metricId` and `uses` like on the view itself, so the
 * scorecard gates and labels them the same way.
 */
export interface ViewSummary {
  kpis: Kpi[]
  findings: Finding[]
}

/* ───────────── Action center ───────────── */

/** Who an open item waits on. */
export type ActionOwnerRole =
  | 'manager'
  | 'hrbp'
  | 'recruiter'
  | 'coordinator'
  | 'hr-ops'
  | 'payroll'
  | 'it'
  | 'facilities'
  | 'trade-compliance'
  | 'immigration'
  | 'talent'
  | 'total-rewards'

/** Owner groups in the Action center's order. */
export const ACTION_OWNER_ROLES: readonly ActionOwnerRole[] = [
  'manager',
  'hrbp',
  'recruiter',
  'coordinator',
  'hr-ops',
  'payroll',
  'it',
  'facilities',
  'trade-compliance',
  'immigration',
  'talent',
  'total-rewards',
]

/** Plain names for owner groups (sentence case). */
export const ACTION_OWNER_LABEL: Record<ActionOwnerRole, string> = {
  manager: 'Managers',
  hrbp: 'HR business partners',
  recruiter: 'Recruiters',
  coordinator: 'Recruiting coordinators',
  'hr-ops': 'People operations',
  payroll: 'Payroll',
  it: 'IT',
  facilities: 'Facilities',
  'trade-compliance': 'Trade compliance',
  immigration: 'Global mobility',
  talent: 'Talent management',
  'total-rewards': 'Total rewards',
}

/** What an item is about: a person, candidate, case, req or task, by drill kind and id. */
export interface ActionSubject {
  /** The kind of record (drill kind), or 'none' for an item about a group. */
  kind: DrillKind | 'none'
  /** The record's id: employee ID, application ID, case ID, req ID. Never set for an employee relations case. */
  id?: string
  /** What the reader sees: a name, "Req R-2041 Senior verification engineer", "Payroll case HR-10001". */
  label: string
}

/**
 * One open item a view hands the Action center. Wording follows the recruiting tone rules: a
 * plain description of the state ("Scorecards for the onsite on 12 Sep are not in"), never a
 * nagging verb, and polite asks in notes. An employee relations case never names a person.
 */
export interface ActionItem {
  /** Stable across recomputes, so "Mark handled" and "Snooze" stick: '<view>:<kind>:<record id>'. */
  id: string
  ownerRole: ActionOwnerRole
  /** Employee ID of the owner when known (the hiring manager, the person's manager, the HRBP). */
  ownerId?: string | null
  /** The owner as shown: a person's name, or the team ("IT", "People operations"). */
  ownerName: string
  /** When it is due; past dates are overdue. */
  due?: ISODate | null
  severity: Severity
  /** What is open, in plain words without imperatives: "I-9 Section 2 is not complete, due 2 Oct". */
  what: string
  subject: ActionSubject
  /** The view the item comes from, and the tab that explains it. */
  view: ViewKey
  tab?: string
  /** The records behind the item. */
  drill?: DrillSource
  /** One or two plain sentences of context, or a polite ask for the copied note. */
  note?: string
  /** The fields the item is computed from, so the Action center gates it on the data standard. */
  uses?: readonly FieldRef[]
  /**
   * What kind of work it is, in a plain category-level label ("Interview decision", "Case past
   * target"; never a subcategory or a person). The Action center groups by it ("What is waiting,
   * by kind"); without it the kind comes from the id, else the view label.
   */
  kind?: string
}

export interface ViewDef {
  key: ViewKey
  /** Tab label, e.g. "Recruiting". */
  label: string
  /** Sub-tabs; the first one is the default. */
  tabs: ViewTab[]
  View: ComponentType<{ tab: string }>
  headline: (ctx: AnalyticsContext) => Headline
  /** Datasets the view reads, for the "sample / uploaded" badges and empty states. */
  datasets: DatasetKey[]
  /** Optional controls rendered at the right of the view header (e.g. the pay-amounts switch). */
  HeaderActions?: ComponentType
  /**
   * The view's key numbers and readout for the People scorecard, computed with the view's own
   * engine (no React). Keep it cheap: the scorecard calls every view's summary.
   */
  summary?: (ctx: AnalyticsContext) => ViewSummary
  /** The view's open items for the Action center, from its engine (no React). */
  actions?: (ctx: AnalyticsContext) => ActionItem[]
}
