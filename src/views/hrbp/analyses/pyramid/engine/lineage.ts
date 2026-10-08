/**
 * The fields behind each number of the Level pyramid (docs/ANALYSES.md, 5.3), built from People
 * stats' lineage so a headcount here reads exactly what a headcount there reads. Resolve with
 * `prep.uses(...)` (which adds the fields the active org filters read).
 */
import {
  all,
  BUSINESS_UNIT,
  HEADCOUNT,
  ifPresent,
  LEVEL,
  LEVEL_AT,
  type Lineage,
  MOVES,
  need,
  ORG,
  optional,
  PAST_HEADCOUNT,
  TENURE,
} from '../../../engine/lineage'

/** Headcount at each level today. */
export const LEVELS_TODAY: Lineage = all(HEADCOUNT, LEVEL)

/** Levels a year ago: past headcount at the level held then (rebuilt from Job changes). */
export const LEVELS_YEAR_AGO: Lineage = all(PAST_HEADCOUNT, LEVEL_AT)

/** The pyramid: today, the outline a year ago, the splits and the span beside each level. */
export const PYRAMID: Lineage = all(
  LEVELS_TODAY,
  ifPresent(LEVELS_YEAR_AGO),
  ifPresent(BUSINESS_UNIT),
  TENURE,
  need('employees.employmentType'),
  ifPresent(ORG),
)

/** Size against the level below: two headcounts at the as-of date. */
export const RATIO_BELOW: Lineage = LEVELS_TODAY

/** Spans at each management level: reporting lines and the manager's level. */
export const SPANS: Lineage = all(ORG, LEVEL)

/** How each level changed: the year-ago level, hires, exits and promotions. */
export const FLOW: Lineage = all(
  LEVELS_YEAR_AGO,
  need('jobChanges.changeType', 'jobChanges.fromLevel', 'jobChanges.toLevel'),
  MOVES,
)

/** Level mix by business unit. */
export const MIX: Lineage = all(LEVELS_TODAY, BUSINESS_UNIT)

/** A level mix tile: the band today and a year ago. */
export const MIX_TILE: Lineage = all(LEVELS_TODAY, ifPresent(LEVELS_YEAR_AGO))

/** The readout: growth by level, the shape, spans and the business units' mix. */
export const FINDINGS: Lineage = all(
  LEVELS_TODAY,
  ifPresent(FLOW),
  ifPresent(ORG),
  ifPresent(BUSINESS_UNIT),
  optional('employees.jobFunction'),
)
