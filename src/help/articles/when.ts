/**
 * The conditions help text shares (docs/ROLES-V2.md 4.8): which modes a block, a list item or a tour
 * step is written for, named by what those modes show, so a policy override moves the text with the
 * page. `holds` in '../access' reads them; the comment on each says which modes it picks today.
 */
import type { Condition } from '../types'

/** HR mode, which opens on the Scorecard. */
export const HR: Condition = { surface: 'view:scorecard', unless: 'view:home' }

/** The modes that open on Home: CHRO, both HRBP modes, Compensation, Talent management, HR ops, Recruiter, Finance. */
export const ROLE_HOME: Condition = { surface: 'view:home', unless: 'page:dev' }

/** Manager mode, which opens on My team. */
export const MANAGER: Condition = { surface: 'view:team', unless: 'page:dev' }

/** Developer mode. */
export const DEVELOPER: Condition = { surface: 'page:dev' }

/** HR and CHRO: the Action center lists every item, grouped by who it waits on. */
export const EVERY_ITEM: Condition = { surface: 'ui:actions-team', unless: 'ui:attention-lists' }

/** The modes whose Action center has Needs attention and Waiting on others (Manager's included). */
export const ROLE_LISTS: Condition = { surface: 'ui:attention-lists', unless: 'page:dev' }

/** Finance mode: business unit and period only. */
export const FINANCE: Condition = { unless: 'filter:leader' }

/** Recruiter mode: Recruiting without People stats. */
export const RECRUITER: Condition = { surface: 'view:recruiting', unless: 'view:hrbp' }

/** Recruiter mode on one recruiter's reqs. */
export const ONE_RECRUITER: Condition = { ...RECRUITER, scoped: true }

/** Recruiter mode with "Every recruiter" picked: every req, nothing outside. */
export const ALL_RECRUITERS: Condition = { ...RECRUITER, scoped: false }

/**
 * The modes that keep to a scope: Manager, both HRBP modes, Recruiter (company comparisons open
 * nothing), while they hold one. Recruiter mode with "Every recruiter" picked holds none.
 */
export const SCOPED: Condition = { unless: 'ui:kpi-delta-company', scoped: true }

/** Both HRBP modes. */
export const HRBP: Condition = { surface: 'header:hrbp', unless: 'ui:kpi-delta-company' }

/** "Show pay amounts": Developer, HR, CHRO, Compensation. */
export const PAY_SWITCH: Condition = { surface: 'pay:switch' }

/** Cost totals without the switch: Finance. */
export const PAY_TOTALS: Condition = { surface: 'pay:totals', unless: 'pay:switch' }

/** Ratios only: both HRBP modes, Talent management, HR ops, Recruiter, Manager. */
export const NO_PAY: Condition = { unless: 'pay:totals' }

/** The Data room and Metric definitions: Developer, HR, CHRO, HR ops. */
export const DATA_ROOM: Condition = { surface: 'page:data' }

/** Every mode without the Data room. */
export const NO_DATA_ROOM: Condition = { unless: 'page:data' }

const PRACTICES = [
  'view:recruiting',
  'view:onboarding',
  'view:hrbp',
  'view:org',
  'view:services',
  'view:talent',
  'view:comp',
  'view:compliance',
  'view:listening',
]

/** Every practice view: Developer, HR, CHRO, both HRBP modes. */
export const ALL_PRACTICES: Condition = { surface: PRACTICES }

/** The modes that show some of the practice views. */
export const SOME_PRACTICES: Condition = { unless: PRACTICES }
