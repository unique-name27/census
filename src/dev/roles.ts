/**
 * The roles on the Developer page (docs/ROLES-V2.md 5.13): the eight roles with a Home that
 * "Preview a role" lays out, the modes "Scan as role" lays out, and the pick each one uses. A role
 * that needs a pick (a manager, a business unit, a region or a recruiter) reads the one Census
 * remembers in this browser (`census:mode`), unless one was made on this page, which lasts until
 * reload and never changes the mode or the remembered pick. A role with neither asks for one. Pure.
 */
import {
  EVERY_RECRUITER,
  HOME_OF,
  hasPick,
  MODE_LABEL,
  MODE_NAME,
  MODES,
  type Mode,
  type ModePicks,
  PICK_OF,
  type PickKind,
} from '@/access/modes'
import type { ModePick } from '@/access/store'

/** The eight roles whose home is the Home view, in Mode menu order. */
export const HOME_ROLES: readonly Mode[] = MODES.filter((m) => HOME_OF[m] === 'home')

export const isHomeRole = (v: string | null | undefined): v is Mode =>
  !!v && (HOME_ROLES as readonly string[]).includes(v)

/** The modes a scan can lay out: Developer first, then every other mode in Mode menu order. */
export const SCAN_MODES: readonly Mode[] = ['developer', ...MODES.filter((m) => m !== 'developer')]

/** What each pick is called beside its select. */
export const PICK_NOUN: Readonly<Record<PickKind, string>> = {
  manager: 'Manager',
  unit: 'Business unit',
  region: 'Region',
  recruiter: 'Recruiter',
}

/** The picks a role is laid out with: one made on this page wins over the one Census remembers. */
export function picksFor(remembered: ModePicks, page: Partial<ModePicks>): ModePicks {
  return {
    managerId: page.managerId ?? remembered.managerId ?? null,
    unit: page.unit ?? remembered.unit ?? null,
    region: page.region ?? remembered.region ?? null,
    recruiter: page.recruiter ?? remembered.recruiter ?? null,
  }
}

/** One pick as the picks it sets. */
export function picksOfPick(p: ModePick): Partial<ModePicks> {
  switch (p.kind) {
    case 'manager':
      return { managerId: p.id }
    case 'unit':
      return { unit: p.unit }
    case 'region':
      return { region: p.region }
    case 'recruiter':
      return { recruiter: { name: p.name, id: p.id } }
  }
}

/** Whether a role can be laid out with these picks (a role that needs none always can). */
export const canLayOut = (mode: Mode, picks: Partial<ModePicks>): boolean => hasPick(mode, picks)

/**
 * The picks with each missing one filled from `defaults` (the largest business unit and region,
 * every recruiter, the preview leader), so a Developer scan lays out every role's home.
 */
export function withDefaults(picks: ModePicks, defaults: Partial<ModePicks>): ModePicks {
  return {
    managerId: picks.managerId ?? defaults.managerId ?? null,
    unit: picks.unit ?? defaults.unit ?? null,
    region: picks.region ?? defaults.region ?? null,
    recruiter: picks.recruiter ?? defaults.recruiter ?? null,
  }
}

/**
 * The pick a role is laid out for, in words: "Silicon Engineering", "APAC", "Maya Chen", "every
 * recruiter", "Priya Raman's org". Null for a role with no pick, or a pick not made.
 */
export function pickLabel(
  mode: Mode,
  picks: Partial<ModePicks>,
  managerName: (id: string) => string | null = () => null,
): string | null {
  switch (PICK_OF[mode]) {
    case 'manager': {
      const id = picks.managerId
      if (!id) return null
      const name = managerName(id)
      return name ? `${name}'s org` : id
    }
    case 'unit':
      return picks.unit ?? null
    case 'region':
      return picks.region ?? null
    case 'recruiter': {
      const name = picks.recruiter?.name
      if (!name) return null
      return name === EVERY_RECRUITER ? 'every recruiter' : name
    }
    default:
      return null
  }
}

/** The pick each kind keeps, as the picks of only that kind (what a scan of one role records). */
export function picksOfMode(mode: Mode, picks: Partial<ModePicks>): Partial<ModePicks> {
  switch (PICK_OF[mode]) {
    case 'manager':
      return { managerId: picks.managerId ?? null }
    case 'unit':
      return { unit: picks.unit ?? null }
    case 'region':
      return { region: picks.region ?? null }
    case 'recruiter':
      return { recruiter: picks.recruiter ?? null }
    default:
      return {}
  }
}

/** What a role preview says while the role waits for its pick; '' for a role that needs none. */
export function pickPrompt(mode: Mode): string {
  const kind = PICK_OF[mode]
  if (!kind) return ''
  return `Pick a ${PICK_NOUN[kind].toLowerCase()} to preview the ${MODE_NAME[mode]} home. Nothing is remembered for ${MODE_LABEL[mode]} mode in this browser yet.`
}
