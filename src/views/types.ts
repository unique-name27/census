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
  /**
   * The tab has parts named in the address after a colon ("analyses:quality"), and the view gets
   * the whole address to pick one. Any other tab gets its own key only (`viewTabOf`).
   */
  parts?: true
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
  | 'finance'
  | 'benefits'

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
  'finance',
  'benefits',
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
  finance: 'Finance',
  benefits: 'Benefits',
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
  /**
   * The same matter across views ("license:E12069", "i9:E12069"): one item survives, the others
   * fold into it (docs/ACTION-CENTER-AUDIT.md 4.1). Built from IDs, never labels.
   */
  matter?: string
  /** Changes when the item's content changes (a count, the latest date): a handled mark with another fingerprint reopens. Roll-ups set it. */
  fingerprint?: string
  /**
   * How many people or records the item is about (a roll-up's count, a plan line's full-year gap),
   * so undated items of one severity list the larger first.
   */
  size?: number
  /**
   * A money amount for this item, shown only where the mode and the "Show pay amounts" switch allow
   * (an `Amount (USD)` pay column); never in `what` or `note`, in any mode (docs/ROLES-V2.md 3.2).
   * `rounded`: a total rounded down to a whole $100,000 (Finance, `src/lib/costRounding.ts`), read
   * in millions ('moneyM').
   */
  amount?: { usd: number; label: string; rounded?: boolean }
  /** Legal or regulatory exposure (I-9, export license, work authorization, final pay). Ranks first. */
  exposure?: boolean
  /** The record that would close it, for "why is this still open": "No completed date on the course". */
  closesWhen?: string
  /** Business unit, region and location of the person or req it is about, for the HRBP lenses. */
  place?: { businessUnit?: string | null; region?: string | null; location?: string | null }
  /**
   * Items a role's list may fold into one line (docs/ACTION-CENTER-AUDIT.md 4.3), keyed alike:
   * the req a candidate step is on ('req:REQ-4515'), the start date of day-one tasks not started
   * yet ('start:2026-10-05'). `label` names the batch in a sentence ("REQ-4515 Formal
   * Verification Engineer II", "the starts on 5 Oct"). Never set on an employee relations case.
   */
  batch?: { key: string; label: string }
  /**
   * The item worded for the person it waits on, for Copy note: "6 exits from your team" where
   * `what` says "4 regretted exits from Aishwarya Krishnan's team" for HR. Without it the note
   * uses `what` and the subject's label. `due`, when given, is the due date the note states
   * (null: none), so a manager's note never dates HR's call about named leavers.
   */
  forOwner?: { what: string; subject?: string; due?: ISODate | null }
}

export interface ViewDef {
  key: ViewKey
  /** Tab label, e.g. "Recruiting". */
  label: string
  /**
   * The page title (h1) when it is not the label: the Home view names the role's home ("Executive
   * home", "Silicon Engineering", "Maya Chen's reqs"; docs/ROLES-V2.md 5.1). Default: `label`.
   */
  title?: (ctx: AnalyticsContext) => string
  /**
   * The view draws no figures in this context (Home in Developer mode: links to the role previews).
   * The header then leaves out the quality switch and the figure exports, and keeps Copy link.
   */
  figureless?: (ctx: AnalyticsContext) => boolean
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
