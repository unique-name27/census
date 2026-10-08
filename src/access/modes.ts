/**
 * The eleven modes (docs/ROLES-V2.md, part 1): ids, groups, names, one-line hints, each mode's
 * home, its scope kind, the pick it needs, its pay view and whether it has the immigration switch.
 * Pure: plain data and two small functions.
 */
import type { Route, RouteView } from '@/data/store'
import type { ScopeKind } from './scopes/types'

export type Mode =
  | 'hr'
  | 'chro'
  | 'hrbp-unit'
  | 'hrbp-region'
  | 'compensation'
  | 'talent-management'
  | 'recruiter'
  | 'hr-ops'
  | 'finance'
  | 'manager'
  | 'developer'

/** In the order the Mode menu and Settings list them (the groups' order). */
export const MODES: readonly Mode[] = [
  'hr',
  'chro',
  'hrbp-unit',
  'hrbp-region',
  'compensation',
  'talent-management',
  'recruiter',
  'hr-ops',
  'finance',
  'manager',
  'developer',
]

const MODE_SET: ReadonlySet<string> = new Set(MODES)

export const isMode = (v: unknown): v is Mode => typeof v === 'string' && MODE_SET.has(v)

export type ModeGroupKey = 'hr-team' | 'partners' | 'practices' | 'outside' | 'building'

export interface ModeGroup {
  key: ModeGroupKey
  /** The muted heading in the Mode menu: "HR business partners". */
  label: string
  modes: readonly Mode[]
}

/** The Mode menu's five groups (1.2), in order. Every mode is in exactly one. */
export const MODE_GROUPS: readonly ModeGroup[] = [
  { key: 'hr-team', label: 'HR team', modes: ['hr', 'chro'] },
  { key: 'partners', label: 'HR business partners', modes: ['hrbp-unit', 'hrbp-region'] },
  {
    key: 'practices',
    label: 'HR practices',
    modes: ['compensation', 'talent-management', 'recruiter', 'hr-ops'],
  },
  { key: 'outside', label: 'Outside HR', modes: ['finance', 'manager'] },
  { key: 'building', label: 'Building Census', modes: ['developer'] },
]

/** The name each choice has in the Mode menu and Settings > Mode. */
export const MODE_LABEL: Record<Mode, string> = {
  hr: 'HR',
  chro: 'CHRO',
  'hrbp-unit': 'HRBP for a business unit',
  'hrbp-region': 'HRBP for a region',
  compensation: 'Compensation',
  'talent-management': 'Talent management',
  recruiter: 'Recruiter',
  'hr-ops': 'HR ops',
  finance: 'Finance',
  manager: 'Manager',
  developer: 'Developer',
}

/**
 * The name inside a sentence, before "mode": "Recruiting is not shown in HRBP mode", "Made in
 * Finance mode." Both HRBP modes read "HRBP".
 */
export const MODE_NAME: Record<Mode, string> = {
  ...MODE_LABEL,
  'hrbp-unit': 'HRBP',
  'hrbp-region': 'HRBP',
}

/** The Mode button's short name under 640px. */
export const MODE_SHORT: Record<Mode, string> = {
  hr: 'HR',
  chro: 'CHRO',
  'hrbp-unit': 'HRBP',
  'hrbp-region': 'HRBP',
  compensation: 'Comp',
  'talent-management': 'Talent',
  recruiter: 'Recruiter',
  'hr-ops': 'HR ops',
  finance: 'Finance',
  manager: 'Manager',
  developer: 'Developer',
}

/** One line under each choice in the Mode menu and Settings > Mode (`MODE_HINT`, 1.2). */
export const MODE_HINT: Record<Mode, string> = {
  hr: 'Every view, the Data room and Settings, for the HR team.',
  chro: 'Every HR view, opening on the scorecard, top risks and the monthly report.',
  'hrbp-unit': 'One business unit at every location: scorecard, people, hiring and talent.',
  'hrbp-region': 'Every employee in one region, across business units.',
  compensation: 'Pay position, merit cycle, market and workforce cost.',
  'talent-management': 'Performance, succession, retention risk and learning.',
  recruiter: "One recruiter's reqs: candidates, offers and upcoming starts.",
  'hr-ops': 'Cases, transactions, leave, day-one tasks and compliance work.',
  finance: 'Headcount, hiring against plan, open reqs and cost totals.',
  manager: "One manager's org: people stats, org chart, hiring, starts and talent.",
  developer: 'Everything in HR mode, plus the Developer page and debug overlays.',
}

/** The page each mode opens on (1.1): the Scorecard, Home, My team or the Developer page. */
export const HOME_OF: Record<Mode, RouteView> = {
  hr: 'scorecard',
  chro: 'home',
  'hrbp-unit': 'home',
  'hrbp-region': 'home',
  compensation: 'home',
  'talent-management': 'home',
  recruiter: 'home',
  'hr-ops': 'home',
  finance: 'home',
  manager: 'team',
  developer: 'dev',
}

/**
 * Role settings a policy file can change (docs/SECURITY-CENTER.md): a mode's home, and whether the
 * Mode menu offers it. Set with the policy overrides (`setPolicyOverrides`); the defaults otherwise.
 */
export interface RoleOverrides {
  home: ReadonlyMap<Mode, RouteView>
  offered: ReadonlyMap<Mode, boolean>
}

let roleOverrides: RoleOverrides | null = null

/** Called by `setPolicyOverrides`; null puts every mode back on its default home and in the menu. */
export function setRoleOverrides(next: RoleOverrides | null): void {
  roleOverrides = next
}

/** The view a mode opens on: the policy file's choice, else `HOME_OF`. */
export const homeViewOf = (mode: Mode): RouteView =>
  (mode === 'developer' ? undefined : roleOverrides?.home.get(mode)) ?? HOME_OF[mode]

export const homeOf = (mode: Mode): Route => ({ view: homeViewOf(mode), tab: '' })

/** Whether the Mode menu and Settings > Mode offer a mode. Developer always is. */
export const modeOffered = (mode: Mode): boolean =>
  mode === 'developer' || roleOverrides?.offered.get(mode) !== false

/**
 * The slug of each role home's figure ids (`home-<slug>-<thing>`, docs/ROLES-V2.md 5.1); both HRBP
 * modes share `hrbp`. Null for the modes whose home is not the Home view.
 */
export const HOME_SLUG: Record<Mode, string | null> = {
  hr: null,
  chro: 'chro',
  'hrbp-unit': 'hrbp',
  'hrbp-region': 'hrbp',
  compensation: 'comp',
  'talent-management': 'talent',
  recruiter: 'rec',
  'hr-ops': 'ops',
  finance: 'fin',
  manager: null,
  developer: null,
}

/** Figures every role home draws (5.1): Needs attention and My list. */
export const SHARED_HOME_FIGURES: readonly string[] = ['home-attention-wait', 'home-attention', 'home-list']

/** A home figure that belongs to another role's home (`home-fin-…` in CHRO mode). */
export function isOtherHomeFigure(mode: Mode, figureId: string): boolean {
  if (!figureId.startsWith('home-') || SHARED_HOME_FIGURES.includes(figureId)) return false
  const slug = HOME_SLUG[mode]
  return !slug || !figureId.startsWith(`home-${slug}-`)
}

/** The page names a redirect toast uses: "Census opened Home instead." */
export const HOME_LABEL: Record<Mode, string> = {
  hr: 'the Scorecard',
  chro: 'Home',
  'hrbp-unit': 'Home',
  'hrbp-region': 'Home',
  compensation: 'Home',
  'talent-management': 'Home',
  recruiter: 'Home',
  'hr-ops': 'Home',
  finance: 'Home',
  manager: 'My team',
  developer: 'the Developer page',
}

/** The scope kind each mode holds (2.1); null for the modes that see the whole company. */
export const SCOPE_OF: Record<Mode, ScopeKind | null> = {
  hr: null,
  chro: null,
  'hrbp-unit': 'unit',
  'hrbp-region': 'region',
  compensation: null,
  'talent-management': null,
  recruiter: 'reqs',
  'hr-ops': null,
  finance: null,
  manager: 'org',
  developer: null,
}

/** What a mode needs picked before it shows anything (1.3). */
export type PickKind = 'manager' | 'unit' | 'region' | 'recruiter'

export const PICK_KINDS: readonly PickKind[] = ['manager', 'unit', 'region', 'recruiter']

/** The pick each mode needs; null for the modes that need none. */
export const PICK_OF: Record<Mode, PickKind | null> = {
  hr: null,
  chro: null,
  'hrbp-unit': 'unit',
  'hrbp-region': 'region',
  compensation: null,
  'talent-management': null,
  recruiter: 'recruiter',
  'hr-ops': null,
  finance: null,
  manager: 'manager',
  developer: null,
}

/** The mode a pick enters. */
export const MODE_OF_PICK: Record<PickKind, Mode> = {
  manager: 'manager',
  unit: 'hrbp-unit',
  region: 'hrbp-region',
  recruiter: 'recruiter',
}

/** Every pick this browser remembers (1.4). Each is kept when the mode changes. */
export interface ModePicks {
  managerId: string | null
  unit: string | null
  region: string | null
  /** `{ name: '*', id: null }` is "Every recruiter" (no reqs scope). */
  recruiter: { name: string; id: string | null } | null
}

export const NO_PICKS: ModePicks = Object.freeze({
  managerId: null,
  unit: null,
  region: null,
  recruiter: null,
})

/** The stored name of "Every recruiter" (1.3). */
export const EVERY_RECRUITER = '*'

/** Whether a mode has its pick (a mode without a pick kind always has). */
export function hasPick(mode: Mode, picks: Partial<ModePicks>): boolean {
  switch (PICK_OF[mode]) {
    case 'manager':
      return !!picks.managerId
    case 'unit':
      return !!picks.unit
    case 'region':
      return !!picks.region
    case 'recruiter':
      return !!picks.recruiter?.name
    default:
      return true
  }
}

/**
 * Pay views (3.1): `switch` shows individual amounts and cost totals while "Show pay amounts" is
 * on; `totals` shows cost totals over 5 or more people and never one person's pay; `none` shows
 * ratios only.
 */
export type PayView = 'switch' | 'totals' | 'none'

export const PAY_OF: Record<Mode, PayView> = {
  hr: 'switch',
  chro: 'switch',
  'hrbp-unit': 'none',
  'hrbp-region': 'none',
  compensation: 'switch',
  'talent-management': 'none',
  recruiter: 'none',
  'hr-ops': 'none',
  finance: 'totals',
  manager: 'none',
  developer: 'switch',
}

/** Modes with the "Show immigration details" switch (3.1); it is off and hidden in every other. */
export const IMMIGRATION_OF: Record<Mode, boolean> = {
  hr: true,
  chro: true,
  'hrbp-unit': false,
  'hrbp-region': false,
  compensation: false,
  'talent-management': false,
  recruiter: false,
  'hr-ops': true,
  finance: false,
  manager: false,
  developer: true,
}

/**
 * The Mode button's text (1.2): "HR mode", "HRBP: Silicon Engineering", "Recruiter: Maya Chen",
 * "Recruiter: every recruiter", "Manager: Priya Raman", "Developer mode". A mode waiting for its
 * pick reads "HRBP mode", "Recruiter mode", "Manager mode". `pick` is what the scope is named by:
 * the manager's or recruiter's name, the business unit or the region (`EVERY_RECRUITER` for every
 * recruiter).
 */
export function modeButtonLabel(mode: Mode, pick?: string | null): string {
  if (!PICK_OF[mode] || !pick) return `${MODE_NAME[mode]} mode`
  if (mode === 'recruiter' && pick === EVERY_RECRUITER) return 'Recruiter: every recruiter'
  return `${MODE_NAME[mode]}: ${pick}`
}
