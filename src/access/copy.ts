/**
 * Every sentence the modes add to Census (docs/ROLES.md, 1.6 and the toasts in 1.4, 1.5 and
 * 3.15). The two "not security" lines are used verbatim wherever modes are explained. A test keeps
 * them free of em dashes and of the words that would make a mode sound like security. Pure.
 */
import { HOME_LABEL, MODE_LABEL, type Mode } from './modes'

export const NOT_SECURITY_SHORT = 'Modes change what Census shows, not who can see the data.'

export const NOT_SECURITY_LONG =
  'Modes shape Census for how you use it. They are not security: anyone using Census can switch modes, and every mode reads the same data in this browser. Share Census and its files only with people who may see all of it.'

/** Words no copy may use about modes (docs/ROLES.md, 1.6). */
export const BANNED_MODE_WORDS: readonly string[] = [
  'access',
  'permission',
  'restricted',
  'secure',
  'locked down',
  'authorized',
  'role-based access',
]

/** "Priya Raman's org". */
export const orgOf = (name: string): string => `${name}'s org`

/* ───────── switching (1.5) ───────── */

export const toManagerTitle = (name: string): string => `Manager mode for ${orgOf(name)}`
export const leftManagerDescription = (name: string): string =>
  `The leader filter still shows ${orgOf(name)}.`
export const WHOLE_COMPANY = 'Whole company'
export const modeToastTitle = (mode: Mode): string => `${MODE_LABEL[mode]} mode`

/* ───────── links (1.4) and hidden routes (3.15) ───────── */

/** A link's (or a saved view's) leader outside the org: "…so the link's leader was replaced." */
export const linkLeaderReplaced = (name: string, from: 'link' | 'view' = 'link'): string =>
  `Manager mode shows ${orgOf(name)}, so the ${from}'s leader was replaced.`

/** "Compensation is not shown in Manager mode". */
export const hiddenPageTitle = (page: string, mode: Mode): string =>
  `${page} is not shown in ${MODE_LABEL[mode]} mode`
/** "Talent, Retention risk is not shown in Manager mode". */
export const hiddenTabTitle = (view: string, tab: string, mode: Mode): string =>
  `${view}, ${tab} is not shown in ${MODE_LABEL[mode]} mode`
export const openedInstead = (mode: Mode): string => `Census opened ${HOME_LABEL[mode]} instead.`
export const openedTabInstead = (tab: string): string => `Census opened ${tab} instead.`
export const CHANGE_MODE = 'Change mode'

/* ───────── the lock (3.10, 4.5) ───────── */

export const lockTip = (name: string): string =>
  `Manager mode keeps Census on ${orgOf(name)}. Change it with Mode.`
export const WHOLE_ORG = 'Whole org'
export const YOU = 'You'
export const peopleInOrg = (inScope: string, total: string, name: string): string =>
  `${inScope} of ${total} in ${orgOf(name)} in scope`
export const notInOrg = (name: string): string => `Not in ${orgOf(name)}`
export const outsideOrg = (name: string): string => `Outside ${orgOf(name)}.`
export const OUTSIDE_YOUR_ORG = 'outside your org'
export const STANDARD_FIXED = 'Manager mode uses the saved data standard. Change it in HR mode.'

/* ───────── records (3.12) ───────── */

export const recordsLeftOut = (n: number, name: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? 'record' : 'records'} outside ${orgOf(name)} ${n === 1 ? 'is' : 'are'} not listed.`
export const KIND_NOT_SHOWN = 'These records are not shown in Manager mode.'

/* ───────── choosing a manager (1.3) ───────── */

/** Manager mode before a manager is picked: the scope line, the leader button and the scope count. */
export const NO_MANAGER_PICKED = 'No manager picked'
export const PICKER_TITLE = 'Choose a manager'
export const PICKER_DEK = "Manager mode shows Census for one manager's org. Pick yourself."
export const PICKER_FOOT =
  'Census lists people who lead 3 or more employees, the same list as the leader filter.'
export const PICKER_CONFIRM = 'Show their org'
export const pickAgain = (name: string): string =>
  `${name} is not in the loaded data as a manager. Pick again.`
export const NO_MANAGERS_HINT = 'Needs reporting lines (manager IDs) in the Employees data.'
export const smallOrgNote = (min: number): string =>
  `This org has fewer than ${min} employees, so rates are hidden to protect anonymity. Counts and lists still show.`
export const showingFor = (name: string): string => `Showing Census for ${orgOf(name)}`
export const CHANGE_MANAGER = 'Change manager…'
export const ABOUT_MODES = 'About modes'

/* ───────── Ask (3.9, 4.7) ───────── */

export const askOrgTooSmall = (min: number): string =>
  `Ask needs an org of ${min} or more employees in Manager mode, so that no answer is about one person.`
export const ASK_NEW_CHAT = 'Mode changed, so Ask started a new chat.'

/* ───────── exports (3.11) and help (3.8) ───────── */

export const managerExportLine = (name: string): string => `Made in Manager mode for ${orgOf(name)}.`
export const ARTICLE_NOT_SHOWN = 'That article is not shown in this mode.'
export const TOUR_NOT_SHOWN = 'That tour is not shown in this mode.'

/** The line Report a problem adds: the mode, never the manager. */
export function reportModeLine(mode: Mode, managerSet: boolean): string {
  if (mode !== 'manager') return `Mode: ${MODE_LABEL[mode]}`
  return `Mode: Manager (${managerSet ? 'manager set, name left out' : 'no manager set'})`
}
