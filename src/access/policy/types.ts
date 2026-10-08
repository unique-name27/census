/**
 * The policy's shapes (docs/ROLES-V2.md, 8.3). A role's policy is a plain data table (`RolePolicy`):
 * no functions, so the Security center (docs/SECURITY-CENTER.md) can lay overrides on top of it
 * and a policy file can be checked against it. Pure types and two tiny constructors.
 */
import type { DatasetKey, ViewKey } from '@/data/schema'
import type { DrillKind } from '@/drill/types'
import type { Mode } from '../modes'

export type Access = 'shown' | 'limited' | 'hidden'

export interface Decision {
  access: Access
  /** For limited and hidden: one plain sentence, shown in Developer > Access and the snapshot. */
  how?: string
}

/** Where a surface sits: the view (or page) and tab on screen. */
export interface At {
  view: string
  tab?: string
}

/** What `decide` needs beyond the surface for a few kinds. */
export interface DecideInfo {
  /** The views a metric is listed on (`MetricDef.views`); without it only the hide lists apply. */
  metricViews?: (id: string) => readonly string[] | undefined
  /** For `kpi:<id>`: the tile's metric id. */
  metric?: string
}

export const SHOWN: Decision = Object.freeze({ access: 'shown' })
export const limited = (how: string): Decision => ({ access: 'limited', how })
export const hidden = (how: string): Decision => ({ access: 'hidden', how })

/** One tab of a shown view: its key, its label (for the redirect toast) and the mode's decision. */
export interface RoleTab {
  key: string
  label: string
  decision: Decision
}

/** Folder-tab views and the pages reached from the masthead. `home` is the role homes' view. */
export type PolicyPlace = ViewKey | 'home' | 'actions' | 'data' | 'dev'

/** A part of a shown tab, picked in its address with the colon form, hidden with where it goes instead. */
export interface HiddenPart {
  label: string
  /** The tab and part to open instead ("analyses:stages"). */
  instead: string
  insteadLabel: string
}

/**
 * One allowlist mode's table (docs/ROLES-V2.md 8.3). What the table does not name is hidden.
 * `decideTable` reads it; the Policies agent fills the six role tables from part 4.
 */
export interface RolePolicy {
  mode: Mode
  /** Every view and page; a missing one is hidden (the matrix test fails while one is missing). */
  views: Readonly<Record<PolicyPlace, Decision>>
  /** Every tab of every view this mode shows, in tab order. A tab missing here is hidden. */
  tabs: Readonly<Partial<Record<PolicyPlace, readonly RoleTab[]>>>
  /** Parts of shown tabs hidden by address (`'hrbp.analyses:quality'`); their decisions are `surfaces` entries. */
  hiddenParts: Readonly<Record<string, HiddenPart>>
  metrics: {
    /** When set, only metrics under these prefixes show (Recruiter, Finance). */
    allow?: readonly string[]
    hidePrefixes: readonly string[]
    hide: readonly string[]
  }
  hiddenFigures: readonly string[]
  /** Figure id prefixes hidden wherever they are drawn (an analysis the mode hides). */
  hiddenFigurePrefixes: readonly string[]
  /** Drill kinds whose records the mode lists. */
  drillKinds: readonly DrillKind[]
  /**
   * Standard columns of a listed drill kind the mode leaves out of every list of those records, its
   * exports and the person card (`'employees.regrettable'`); each column's how is
   * `surfaces['column:<kind>.<key>']`. Absent: none. A column of a listed kind not named here shows.
   */
  hiddenColumns?: readonly string[]
  /** The decision for a listed drill kind (scoped modes: limited, rows outside the scope left out). */
  drillListed: Decision
  datasets: readonly DatasetKey[]
  /** Action center items left out by id prefix; each prefix's how is `surfaces['item:<prefix>']`. */
  hiddenItemPrefixes: readonly string[]
  articles: Readonly<Record<string, Decision>>
  tours: Readonly<Record<string, Decision>>
  /**
   * Every other named surface (masthead, header, settings, tools, help, ask, filter, export,
   * person, focus, shortcut, ui, org, pay, page, item, tab parts). An exact surface here wins.
   */
  surfaces: Readonly<Record<string, Decision>>
}
