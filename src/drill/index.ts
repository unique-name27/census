/** Drill-down to the records and people behind every number: `import { Drill, drill, drillSpec } from '@/drill'`. */
export { DRILL_CLASS, Drill, type DrillSource, drill, resolveDrill } from './Drill'
export { DrillPanel } from './DrillPanel'
export { PersonCard } from './PersonCard'
export { type PersonSummary, personSummary } from './person'
export {
  buildDrillTable,
  type DrillContext,
  type DrillTable,
  drillNoun,
  PERSON_KEY,
  ROW_KEY,
} from './records'
export { type DrillEntry, openDrill, openPerson, useDrillStore } from './store'
export { type DrillExtra, type DrillKind, type DrillRecordMap, type DrillSpec, drillSpec } from './types'
