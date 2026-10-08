/**
 * Internal working model of the sample company. Modules build and enrich `Person` records, then
 * the emitters turn them into the schema's row types. People are referenced by array index until
 * employee IDs are assigned (in hire order) at the end of the people pipeline.
 */
import type { ChangeType, EmploymentType, Level, Potential, TerminationType } from '../schema'
import type { Day } from './calendar'

/** Markers for planted stories and fixed roles, so later modules can find them. */
export type Tag =
  | 'exec'
  | 'named'
  | 'span-wide'
  | 'span-single'
  | 'new-manager'
  | 'pd-austin-manager'
  | 'pd-austin-leaver'
  | 'hipo-leaver'
  | 'stagnant'
  | 'long-l4'
  | 'hm-awaiting'
  | 'first-year-leaver'
  /** First-year leaver from an earlier hire cohort; added late, so services rows draw from their own streams. */
  | 'prior-first-year-leaver'
  | 'leaver-manager'
  | 'demoted'
  | 'backfill'

export interface HistoryEvent {
  day: Day
  type: ChangeType
  fromLevel: Level
  toLevel: Level
  fromDept: string
  toDept: string
  fromMgr: number | null
  toMgr: number | null
}

export interface Rating {
  rating: number
  pre: number
  potential: Potential | null
}

export interface Person {
  idx: number
  /** Employee ID, assigned once hire dates are final. */
  id: string
  name: string
  bu: string
  dept: string
  /**
   * Seed of the comp market spread (`comp.ts`), not a job family: the department name, or a track's
   * own key such as FP&A. It keeps the strings the sample's job families had before families held job
   * functions, so every market median stays where it was (docs/TAXONOMY.md, section 4.3).
   */
  marketKey: string
  /** Role on the department's career track (e.g. "Design Verification Engineer"). */
  role: string
  title: string
  site: string
  level: Level
  /** Current manager, or the manager at exit for leavers. */
  mgr: number | null
  /** Hire day; -1 until assigned. */
  hire: number
  term: Day | null
  termType: TerminationType | null
  termReason: string | null
  regrettable: boolean | null
  type: EmploymentType
  /** Latent performance (standard normal). Drives ratings, promotions and regrettable exits. */
  perf: number
  tags: Set<Tag>
  /** Ratings by cycle name. */
  ratings: Map<string, Rating>
  /** Job history, ascending by day. */
  events: HistoryEvent[]
  hireLevel: Level
  hireDept: string
  /** Manager timeline, ascending: from `day` on, the manager is `mgr`. */
  mgrLine: { day: Day; mgr: number | null }[]
  /** Manager changes forced by a departing manager: on `day` the person stopped reporting to `from`. */
  forced: { day: Day; from: number }[]
}

export interface Agent {
  idx: number
  team: string
  apac: boolean
}

export interface RecruiterDesk {
  idx: number
  /** Returns true when the desk covers a role in this business unit, department and site. */
  covers: (bu: string, dept: string, site: string) => boolean
}

export interface World {
  people: Person[]
  /** Executive slot key (e.g. 'ceo', 'vp-verif') to person index. */
  execs: Map<string, number>
  /** Business unit to HRBP person index. */
  hrbp: Map<string, number>
  recruiters: RecruiterDesk[]
  coordinators: { idx: number; region: 'Americas' | 'India' | 'International' }[]
  agents: Agent[]
}

export function newPerson(
  idx: number,
  init: Partial<Person> & Pick<Person, 'name' | 'bu' | 'dept' | 'site' | 'level'>,
): Person {
  return {
    idx,
    id: '',
    marketKey: init.dept,
    role: '',
    title: '',
    mgr: null,
    hire: -1,
    term: null,
    termType: null,
    termReason: null,
    regrettable: null,
    type: 'Employee',
    perf: 0,
    tags: new Set(),
    ratings: new Map(),
    events: [],
    hireLevel: init.level,
    hireDept: init.dept,
    mgrLine: [],
    forced: [],
    ...init,
  }
}

/** Active on day d (hired on or before d and not yet terminated). */
export const activeOn = (p: Person, d: Day): boolean =>
  p.hire >= 0 && p.hire <= d && (p.term == null || p.term > d)
