/**
 * The metric dictionary: one entry per metric Census shows (docs/METRICS.md). An entry is the
 * single source of truth for the metric's wording on screen, the settings its engine calculates
 * with, its target and the fields it reads.
 *
 * Pure types; no runtime code, so any module (including the views' `metrics.ts`) can import it.
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import type { ViewKey } from '@/data/schema'
import type { Format } from '@/lib/format'

/** Where a metric appears: a view, the Data room (data quality rules) or the Action center. */
export type MetricView = ViewKey | 'data' | 'actions'

/** A rating from 1 to 5, the key of a rating map. */
export type RatingKey = 1 | 2 | 3 | 4 | 5

/** One number per rating, e.g. the merit guideline: { 5: 0.06, 4: 0.045, 3: 0.03, 2: 0.01, 1: 0 }. */
export type RatingMap = Record<RatingKey, number>

/** An inclusive [low, high] pair, e.g. the healthy compa-ratio band [0.9, 1.1]. */
export type NumberRange = readonly [number, number]

export type ParamType =
  | 'number'
  | 'percent' // a fraction: 0.95 is 95%
  | 'days'
  | 'months'
  | 'boolean'
  | 'choice'
  | 'ratingMap'
  | 'range'
  /** A calendar date 'YYYY-MM-DD', or '' for not set (the comp cycle's dates). */
  | 'date'

export type ParamValue = number | boolean | string | RatingMap | NumberRange

export interface ParamChoice {
  value: string
  label: string
}

/**
 * A calculation setting an engine reads through `ctx.metrics.param(id, key)` instead of a
 * constant. Values by type: number, percent (fraction), days and months are numbers; boolean is
 * a boolean; choice is one of `choices[].value`; ratingMap is a `RatingMap`; range is a
 * `[low, high]` pair with low < high; date is 'YYYY-MM-DD' or '' (not set). `min`, `max` and
 * `step` bound numbers and every element of a rating map or range.
 */
export interface ParamDef {
  /** Unique within the metric, camelCase: 'firstYearDays'. */
  key: string
  /** Sentence case: "First-year window". */
  label: string
  /** One or two plain sentences: what it changes. */
  description: string
  type: ParamType
  default: ParamValue
  min?: number
  max?: number
  /** Input step; days and months are whole numbers whatever the step. */
  step?: number
  /** For 'choice'. */
  choices?: readonly ParamChoice[]
  /**
   * 'raiseOnly': the value may go up from the default, never below it (the anonymity minimum).
   * true: it cannot be changed at all (privacy rules).
   */
  locked?: 'raiseOnly' | true
  /**
   * How numbers show (and the unit of rating-map and range elements): 'pct' for shares, 'ratio'
   * for compa-ratios, 'times' for multipliers. Defaults by type: percent 'pct', days 'days',
   * months 'int', number 'num2'.
   */
  format?: Format
}

/**
 * At least, at most, or under. "Under" (strictly below) is kept for registered targets that are
 * written that way (the DS-01 retro share "under 2%"); a person picks at least or at most.
 */
export type TargetComparator = '>=' | '<=' | '<'

export interface MetricTarget {
  value: number
  comparator: TargetComparator
}

/** A setting of a metric, by the metric that holds it and its key. */
export interface SettingRef {
  readonly metricId: string
  readonly key: string
}

/**
 * Fields a number reads only while a setting has a value: time to fill that stops at the start
 * date also reads the candidate and employee fields that find the start date.
 */
export interface UsesWhen {
  /** The setting; `metricId` defaults to the metric that declares this. */
  setting: { readonly metricId?: string; readonly key: string }
  value: ParamValue
  uses: readonly FieldRef[]
}

export interface MetricDef {
  /** `<view>.<group>.<name>`, e.g. 'hrbp.attrition.voluntary'. Stable: overrides are kept by id. */
  id: string
  /** What HR people call it: "Voluntary attrition". */
  name: string
  /** Where it appears; the first is its home view. */
  views: readonly MetricView[]
  /** One or two plain sentences, sentence case, no em dashes. */
  definition: string
  /** "voluntary exits ÷ average headcount × (12 ÷ window months)". */
  formula?: string
  /** Who counts: "Employees only; contractors and interns excluded." */
  population?: string
  /** "The period picker (default last 12 months)". */
  window?: string
  unit: Format
  goodDirection: 'up' | 'down' | null
  target?: MetricTarget
  /**
   * The engine calculates with the target (status marks, readout thresholds): it can be changed
   * but not removed, and keeps its registered direction (at least, at most or under).
   */
  targetRequired?: boolean
  /**
   * Another number is calculated with this metric's target (a readout rule that says "on target"):
   * metrics that depend on this one change with it. Implied by `targetRequired`.
   */
  targetUsed?: boolean
  /**
   * The fields the metric reads (its lineage), including those its readout findings show; its
   * tier is the lowest of theirs.
   */
  uses: readonly FieldRef[]
  /** Fields read only while a setting has a given value (added to `uses` then). */
  usesWhen?: readonly UsesWhen[]
  /**
   * Fields only its readout findings name, beyond what its tiles and figures read (who owns the
   * next action, where the items concentrate). Counted in its tier and its "Data used".
   */
  readoutUses?: readonly FieldRef[]
  /**
   * Other metrics whose settings change this number: the population setting registered on
   * headcount changes every rate. "Definition changed" marks and the "Changed setting" notes
   * follow them (transitively). The anonymity minimum and the data quality rules apply to every
   * number computed from data, so they are never listed.
   */
  dependsOn?: readonly string[]
  owner?: string
  params: readonly ParamDef[]
  /** A privacy rule: its wording and target cannot be changed (its params carry their own locks). */
  locked?: boolean
  /**
   * The fields a row must have for the metric to count it, a subset of `uses`. A gap in any other
   * field it reads (a breakdown, a reason shown beside a rate) never leaves a row out. Without it,
   * the quality lens reports the gaps under the metric, never rows "left out".
   */
  requires?: readonly FieldRef[]
  /**
   * What the entry is when it is not a number computed from data: 'rule' for the privacy and data
   * quality rules, 'setting' for a calculation setting that reads no data on its own (the
   * materiality floor). Such entries have no tier and are left out of the metric impact ranking.
   */
  kind?: 'rule' | 'setting'
}

/** The wording a person can change. */
export type TextField = 'definition' | 'formula' | 'population' | 'owner'
export const TEXT_FIELDS: readonly TextField[] = ['definition', 'formula', 'population', 'owner']

/** A changeable part of a metric: its wording, its target or one of its settings ('params.minGroup'). */
export type MetricField = TextField | 'target' | `params.${string}`

/**
 * What a person changed from the default for one metric. Only differences are kept: a value set
 * back to its default is removed.
 */
export interface MetricOverride {
  /** Your wording; '' clears an optional field (formula, population, owner). */
  text: Partial<Record<TextField, string>>
  /** Your target; null removes the default target. Absent: the default. */
  target?: MetricTarget | null
  params: Record<string, ParamValue>
}

export type MetricOverrides = Readonly<Record<string, MetricOverride>>

/** A logged value: text, a target, a setting value, or null for "none" (no target, empty text). */
export type LoggedValue = string | ParamValue | MetricTarget | null

export type ChangeKind = 'edit' | 'undo' | 'reset' | 'import' | 'migration'

/** One entry in the change log: what changed, from what to what, when and by whom. */
export interface MetricChange {
  id: string
  metricId: string
  field: MetricField
  /** The value in force before and after the change (defaults included, not just overrides). */
  from: LoggedValue
  to: LoggedValue
  /** ISO date-time. */
  at: string
  /** The name set when the change was made; absent means "you". */
  by?: string
  kind: ChangeKind
}

/** Overrides and the change log (newest first), as kept in the store and in `census:metrics`. */
export interface MetricsState {
  overrides: MetricOverrides
  log: readonly MetricChange[]
}

/** A requested change; the value is validated against the metric's definition before it applies. */
export interface MetricEdit {
  metricId: string
  field: MetricField
  /** Text for wording, `MetricTarget | null` for the target, a raw value for a setting. */
  value: unknown
}

/** A value an import could not apply. */
export interface RejectedValue {
  metricId: string
  /** The field ('definition', 'target', 'params.meritBudget'), or '' for the whole row. */
  field: string
  /** The value as it appeared in the file. */
  value?: string
  reason: string
  /** Where it was: the sheet and 1-based row of an Excel dictionary. */
  sheet?: string
  row?: number
}

/** What an import (Excel dictionary or settings file) changed in the dictionary, field by field. */
export interface MetricImportReport {
  /** The changes applied, as logged. */
  changed: readonly MetricChange[]
  /** Values not applied, with the reason. */
  rejected: readonly RejectedValue[]
  /** Metric ids in the file that Census doesn't know (ignored). */
  unknown: readonly string[]
  /** One or two plain sentences: "Changed 3 values in 2 metrics. 1 value was not applied." */
  summary: string
}

export type EditResult =
  | { ok: true; state: MetricsState; change: MetricChange | null }
  | { ok: false; error: string }

/** One metric's changes behind a number (see `MetricsApi.changesBehind`). */
export interface ChangeBehind {
  metricId: string
  /** Its own fields for the number's metric; for a source, its settings and a target it calculates with. */
  fields: readonly MetricField[]
  /** 'self' for the number's own metric, 'source' for one it depends on, 'rule' for a quality rule. */
  role: 'self' | 'source' | 'rule'
}

/**
 * The dictionary as the views read it: `useAnalytics().metrics`. Built once per overrides state,
 * so an unchanged state returns the same object and nothing downstream recomputes.
 */
export interface MetricsApi {
  /** Every registered metric with your wording and target, in catalog order. */
  readonly list: readonly MetricDef[]
  /** The metric with your wording and target merged over its default; undefined when not registered. */
  def(id: string): MetricDef | undefined
  /** The metric as registered, without your changes. */
  defaultDef(id: string): MetricDef | undefined
  /** The definition of one setting. */
  paramDef(id: string, key: string): ParamDef | undefined
  /** The value of one setting: yours, or the default. Throws for an unknown metric or key. */
  param<T extends ParamValue = ParamValue>(id: string, key: string): T
  /** Typed shorthands; each throws when the setting is of another type. */
  num(id: string, key: string): number
  flag(id: string, key: string): boolean
  choice(id: string, key: string): string
  ratings(id: string, key: string): RatingMap
  range(id: string, key: string): NumberRange
  /** The target in force (yours or the default), or null when there is none. */
  target(id: string): MetricTarget | null
  /** Any wording, target or setting differs from the default. */
  isChanged(id: string): boolean
  /** The fields that differ from the default. */
  changedFields(id: string): readonly MetricField[]
  /**
   * The metrics whose settings change this number, itself first: what it depends on
   * (`dependsOn`, followed through) and, for a number computed from data, the anonymity minimum.
   */
  sourcesOf(id: string): readonly string[]
  /**
   * What differs from the defaults behind a number: its own wording, target or settings, the
   * changed settings of its sources, and the changed data quality rules that set its tier. Empty
   * when the number is calculated and judged exactly as by default.
   */
  changesBehind(id: string): readonly ChangeBehind[]
  /**
   * The fields the metric reads with the settings in force: `uses`, the fields its readout
   * findings name (`readoutUses`) and any `usesWhen` that applies.
   */
  usesOf(id: string): readonly FieldRef[]
  /** How many metrics differ from their defaults (for "Definitions changed from defaults: 3"). */
  readonly changedCount: number
  /** The change log, newest first. */
  readonly changes: readonly MetricChange[]
  /** The state this was built from. */
  readonly state: MetricsState
}
