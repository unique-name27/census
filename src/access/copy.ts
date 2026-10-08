/**
 * Every sentence the modes add to Census (docs/ROLES.md, 1.6 and the toasts in 1.4, 1.5 and 3.15;
 * docs/ROLES-V2.md 1.2 to 1.6, 2.3, 2.5, 4.11 and 7). The two "not security" lines are used
 * verbatim wherever modes are explained. A test keeps them free of em dashes and of the words that
 * would make a mode sound like security. Pure.
 */
import { VIEW_LABEL } from '@/data/schema'
import { HOME_LABEL, HOME_OF, homeViewOf, MODE_LABEL, MODE_NAME, type Mode, type PickKind } from './modes'

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

/** "1 open req", "14 open reqs". */
const count = (n: number, one: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : `${one}s`}`

/** "HRBP mode", "Finance mode": the mode inside a sentence. */
export const modeName = (mode: Mode): string => `${MODE_NAME[mode]} mode`

/* ───────── switching (1.5) ───────── */

export const toManagerTitle = (name: string): string => `Manager mode for ${orgOf(name)}`
export const leftManagerDescription = (name: string): string =>
  `The leader filter still shows ${orgOf(name)}.`
/** Leaving a scoped mode whose scope stays as ordinary filters: "The filters still show APAC." */
export const leftScopeDescription = (scope: string): string => `The filters still show ${scope}.`
export const WHOLE_COMPANY = 'Whole company'
export const modeToastTitle = (mode: Mode): string => modeName(mode)
/** Entering Finance mode strips every filter but the business unit and the period. */
export const FINANCE_FILTERS_NOTE =
  'Finance mode filters by business unit and period, so every cost total covers whole business units.'

/* ───────── links (1.4) and hidden routes (3.15, 4.13) ───────── */

/** A link's (or a saved view's) leader outside the org: "…so the link's leader was replaced." */
export const linkLeaderReplaced = (name: string, from: 'link' | 'view' = 'link'): string =>
  `Manager mode shows ${orgOf(name)}, so the ${from}'s leader was replaced.`

/** "Compensation is not shown in Finance mode". */
export const hiddenPageTitle = (page: string, mode: Mode): string =>
  `${page} is not shown in ${modeName(mode)}`
/** "Compensation, Range position is not shown in Finance mode". */
export const hiddenTabTitle = (view: string, tab: string, mode: Mode): string =>
  `${view}, ${tab} is not shown in ${modeName(mode)}`
/** The page a mode opens on, as the redirect toast names it (a policy file can set another view). */
export const homeLabelOf = (mode: Mode): string => {
  const view = homeViewOf(mode)
  return view === HOME_OF[mode] ? HOME_LABEL[mode] : ((VIEW_LABEL as Record<string, string>)[view] ?? view)
}
export const openedInstead = (mode: Mode): string => `Census opened ${homeLabelOf(mode)} instead.`
export const openedTabInstead = (tab: string): string => `Census opened ${tab} instead.`
export const CHANGE_MODE = 'Change mode'

/* ───────── the scope pin (2.5, 3.10, 4.5) ───────── */

export const lockTip = (name: string): string =>
  `Manager mode keeps Census on ${orgOf(name)}. Change it with Mode.`
/** The pin's tooltip in any scoped mode: "HRBP mode keeps Census on Silicon Engineering. Change it with Mode." */
export const scopeTip = (mode: Mode, scope: string): string =>
  `${modeName(mode)} keeps Census on ${scope}. Change it with Mode.`
export const WHOLE_ORG = 'Whole org'
export const WHOLE_UNIT = 'Whole business unit'
export const WHOLE_REGION = 'Whole region'
/** The action that clears what another scope left, in Recruiter mode: back to every req of the pick. */
export const WHOLE_REQS = 'All their reqs'
export const YOU = 'You'
export const peopleInOrg = (inScope: string, total: string, name: string): string =>
  `${inScope} of ${total} in ${orgOf(name)} in scope`
/** "380 of 412 people in Silicon Engineering in scope". */
export const peopleInScope = (inScope: string, total: string, scope: string): string =>
  `${inScope} of ${total} in ${scope} in scope`
/** "14 open reqs and 61 active candidates on Maya Chen's reqs". */
export const reqsInScope = (openReqs: number, active: number, scope: string): string =>
  `${count(openReqs, 'open req')} and ${count(active, 'active candidate')} on ${scope}`
export const notInOrg = (name: string): string => `Not in ${orgOf(name)}`
export const outsideOrg = (name: string): string => `Outside ${orgOf(name)}.`
/** The limited person card's line: "Outside APAC.", "Outside Maya Chen's reqs." */
export const outsideScope = (scope: string): string => `Outside ${scope}.`
export const OUTSIDE_YOUR_ORG = 'outside your org'
export const STANDARD_FIXED = 'Manager mode uses the saved data standard. Change it in HR mode.'
/** Finance and Manager mode keep the saved data standard (4.10). */
export const standardFixed = (mode: Mode): string =>
  `${modeName(mode)} uses the saved data standard. Change it in HR mode.`

/* ───────── records (3.12, 4.12) ───────── */

export const recordsLeftOut = (n: number, name: string): string => recordsOutside(n, orgOf(name))
/** "12 records outside APAC are not listed." */
export const recordsOutside = (n: number, scope: string): string =>
  `${count(n, 'record')} outside ${scope} ${n === 1 ? 'is' : 'are'} not listed.`
export const KIND_NOT_SHOWN = 'These records are not shown in Manager mode.'
/** "These records are not shown in Finance mode." */
export const kindNotShown = (mode: Mode): string => `These records are not shown in ${modeName(mode)}.`

/* ───────── choosing a manager, a business unit, a region or a recruiter (1.3) ───────── */

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

/** One pick dialog's wording (the `ScopePicker` config per kind). */
export interface PickerCopy {
  title: string
  dek: string
  foot: string
  confirm: string
  /** The Mode menu's and Settings' "Change…" button. */
  change: string
  /** The scope line, the pinned control and the scope count before anything is picked. */
  none: string
  /** The Mode menu's line in place of the hint when nothing can be picked. */
  disabled: string
  /** The note at the top of the dialog when the remembered pick is gone. */
  gone: (name: string) => string
}

export const PICKER_COPY: Readonly<Record<PickKind, PickerCopy>> = {
  manager: {
    title: PICKER_TITLE,
    dek: PICKER_DEK,
    foot: PICKER_FOOT,
    confirm: PICKER_CONFIRM,
    change: CHANGE_MANAGER,
    none: NO_MANAGER_PICKED,
    disabled: NO_MANAGERS_HINT,
    gone: pickAgain,
  },
  unit: {
    title: 'Choose a business unit',
    dek: 'HRBP mode shows Census for one business unit, at every location. Pick the one you support.',
    foot: 'Census lists the business units in the Employees data.',
    confirm: 'Show this business unit',
    change: 'Change business unit…',
    none: 'No business unit picked',
    disabled: 'Needs business units in the Employees data.',
    gone: (unit) => `${unit} is not in the loaded data. Pick again.`,
  },
  region: {
    title: 'Choose a region',
    dek: 'HRBP mode shows Census for every employee in one region, across business units.',
    foot: "Each location's region comes from the Locations list in Settings, Official lists; the Regions list names each region's HR business partner.",
    confirm: 'Show this region',
    change: 'Change region…',
    none: 'No region picked',
    disabled: 'Needs a region for each location in Settings, Official lists, Locations.',
    gone: (region) => `No location in the loaded data is in ${region}. Pick again.`,
  },
  recruiter: {
    title: 'Choose a recruiter',
    dek: "Recruiter mode shows Census for one recruiter's reqs. Pick yourself.",
    foot: 'Census lists everyone named as the recruiter on a req that is open or was opened in the last 12 months.',
    confirm: 'Show their reqs',
    change: 'Change recruiter…',
    none: 'No recruiter picked',
    disabled: 'Needs a recruiter on each req in the Requisitions data.',
    gone: (name) => `${name} is not the recruiter on any req in the loaded data. Pick again.`,
  },
}

/** The recruiter dialog's first row: every req, for a talent acquisition lead. */
export const EVERY_RECRUITER_ROW = {
  name: 'Every recruiter',
  line: 'For a talent acquisition lead: every req',
}
export const EVERY_RECRUITER_CONFIRM = 'Show every req'
/** The region dialog's foot line when some people work at locations with no region. */
export const noRegionPeople = (n: number): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? 'person works' : 'people work'} at locations with no region.`
/** Pick rows: "412 employees · 7 locations", "506 employees · Bengaluru, Hsinchu", "14 open reqs · 61 active candidates". */
export const unitRowLine = (employees: number, locations: number): string =>
  `${count(employees, 'employee')} · ${count(locations, 'location')}`
export const regionRowLine = (employees: number, sites: readonly string[]): string =>
  sites.length ? `${count(employees, 'employee')} · ${sites.join(', ')}` : count(employees, 'employee')
export const recruiterRowLine = (openReqs: number, active: number): string =>
  `${count(openReqs, 'open req')} · ${count(active, 'active candidate')}`
/** Settings > Mode's pick line: "Showing Census for APAC", "for Maya Chen's reqs". */
export const showingForScope = (scope: string): string => `Showing Census for ${scope}`
export const SHOWING_EVERY_RECRUITER = "Showing Census for every recruiter's reqs"
/**
 * Settings > Mode in HRBP for a region: the regional HR business partner the Regions list names
 * (docs/ACTION-CENTER-AUDIT.md 5.8), and where it is set; `here` when this mode shows Official lists.
 */
export function regionOwnerLine(region: string, owner: string | null, here: boolean): string {
  const where = `Official lists, Regions${here ? '' : ', in HR mode'}`
  return owner
    ? `Regional HR business partner: ${owner}. Their own items and the region's site matters are in Needs attention. Change it in ${where}.`
    : `No regional HR business partner is named for ${region}, so the Action center lists its items by kind. Name one in ${where}.`
}

/** A scope under the anonymity minimum: the home's note (1.3). */
export function smallScopeNote(kind: PickKind, scope: string, min: number): string {
  const tail = 'so rates are hidden to protect anonymity. Counts and lists still show.'
  if (kind === 'manager') return smallOrgNote(min)
  if (kind === 'recruiter') return `Your reqs have fewer than ${min} candidates, ${tail}`
  return `${scope} has fewer than ${min} employees, ${tail}`
}

/* ───────── Ask (3.9, 4.7; ROLES-V2 7) ───────── */

export const askOrgTooSmall = (min: number): string =>
  `Ask needs an org of ${min} or more employees in Manager mode, so that no answer is about one person.`
/** Ask is off for a scope under the anonymity minimum (7). */
export function askScopeTooSmall(kind: PickKind, min: number): string {
  if (kind === 'manager') return askOrgTooSmall(min)
  if (kind === 'unit')
    return `Ask needs a business unit of ${min} or more employees in HRBP mode, so that no answer is about one person.`
  if (kind === 'region')
    return `Ask needs a region of ${min} or more employees in HRBP mode, so that no answer is about one person.`
  return `Ask needs ${min} or more candidates on your reqs in Recruiter mode, so that no answer is about one person.`
}
export const ASK_NEW_CHAT = 'Mode changed, so Ask started a new chat.'
/** "compare_groups is not available in Recruiter mode." */
export const toolNotInMode = (tool: string, mode: Mode): string =>
  `${tool} is not available in ${modeName(mode)}.`

/* ───────── exports (3.11, 4.11) and help (3.8, 4.8) ───────── */

export const managerExportLine = (name: string): string => `Made in Manager mode for ${orgOf(name)}.`
/**
 * The export meta line in every mode but HR and Developer: "Made in Finance mode.", "Made in HRBP
 * mode for APAC." Null in HR and Developer.
 */
export function modeExportLine(mode: Mode, scope?: string | null): string | null {
  if (mode === 'hr' || mode === 'developer') return null
  return scope ? `Made in ${modeName(mode)} for ${scope}.` : `Made in ${modeName(mode)}.`
}
/** Finance exports: in place of the "Pay amounts" line (3.2, rules 5 and 8). */
export const FINANCE_EXPORT_LINE =
  'Cost totals cover groups of 5 or more people and are rounded to $0.1M in each business unit. Individual pay is left out.'
export const ARTICLE_NOT_SHOWN = 'That article is not shown in this mode.'
export const TOUR_NOT_SHOWN = 'That tour is not shown in this mode.'

/**
 * The line Report a problem adds: the mode, never a person. Business units and regions are named
 * ("Mode: HRBP for a region (APAC)"); a manager or recruiter is only said to be set. `pick` is the
 * unit or region name, or whether a manager or recruiter is set.
 */
export function reportModeLine(mode: Mode, pick: boolean | string | null = false): string {
  if (mode === 'manager') return `Mode: Manager (${pick ? 'manager set, name left out' : 'no manager set'})`
  if (mode === 'recruiter')
    return `Mode: Recruiter (${pick ? 'recruiter set, name left out' : 'no recruiter set'})`
  if ((mode === 'hrbp-unit' || mode === 'hrbp-region') && typeof pick === 'string' && pick)
    return `Mode: ${MODE_LABEL[mode]} (${pick})`
  return `Mode: ${MODE_LABEL[mode]}`
}
