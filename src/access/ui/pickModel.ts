/**
 * The pick dialogs' rows, the Mode button's name for the pick, and the lines the Mode menu and
 * Settings > Mode show for it (docs/ROLES-V2.md 1.2 and 1.3). Plain data for `ScopePicker`,
 * `ModeMenu`, `ModeButton` and `ModeSection`; the counts come from `scopes/pickers.ts` and the
 * leader filter's own manager list. Pure.
 */
import type { LeaderOption } from '@/app/filterOptions'
import { plural } from '@/lib/format'
import {
  EVERY_RECRUITER_CONFIRM,
  EVERY_RECRUITER_ROW,
  PICKER_COPY,
  recruiterRowLine,
  regionRowLine,
  SHOWING_EVERY_RECRUITER,
  showingForScope,
  unitRowLine,
} from '../copy'
import { EVERY_RECRUITER, MODE_LABEL, type Mode, type ModePicks, PICK_OF, type PickKind } from '../modes'
import type { RecruiterOption, RegionOptions, UnitOption } from '../scopes/pickers'
import { recruiterKey } from '../scopes/reqs'
import type { ScopeLock } from '../scopes/types'
import type { ModePick } from '../store'

/** One row of a pick dialog. */
export interface PickRow {
  /** The manager's ID, the unit, the region, or the recruiter's name ("*" for every recruiter). */
  key: string
  name: string
  /** The muted line under the name: "412 employees · 7 locations", a manager's title. */
  line: string
  /** Muted at the right of the row: a manager's org size. */
  aside?: string
  /** A business unit on the official list with nobody in the data cannot be picked. */
  pickable: boolean
  pick: ModePick
  /** What the search reads besides the name: a manager's title, a region's sites. */
  terms: string
}

export function managerRows(managers: readonly LeaderOption[]): PickRow[] {
  return managers.map((m) => ({
    key: m.id,
    name: m.name,
    line: m.title,
    aside: plural(m.size, 'employee'),
    pickable: true,
    pick: { kind: 'manager', id: m.id },
    terms: m.title,
  }))
}

/** A listed unit with nobody in the loaded data: shown muted. */
export const NOBODY_IN_UNIT = 'Nobody in the loaded data'

export function unitRows(options: readonly UnitOption[]): PickRow[] {
  return options.map((u) => ({
    key: u.unit,
    name: u.unit,
    line: u.pickable ? unitRowLine(u.employees, u.locations) : NOBODY_IN_UNIT,
    pickable: u.pickable,
    pick: { kind: 'unit', unit: u.unit },
    terms: '',
  }))
}

export function regionRows(options: RegionOptions): PickRow[] {
  return options.rows.map((r) => ({
    key: r.region,
    name: r.region,
    line: regionRowLine(r.employees, r.sites),
    pickable: true,
    pick: { kind: 'region', region: r.region },
    terms: r.sites.join(' '),
  }))
}

/** "Every recruiter" first (a talent acquisition lead's view of every req), then each recruiter. */
export function recruiterRows(options: readonly RecruiterOption[]): PickRow[] {
  const every: PickRow = {
    key: EVERY_RECRUITER,
    name: EVERY_RECRUITER_ROW.name,
    line: EVERY_RECRUITER_ROW.line,
    pickable: true,
    pick: { kind: 'recruiter', name: EVERY_RECRUITER, id: null },
    terms: '',
  }
  return [
    every,
    ...options.map(
      (r): PickRow => ({
        key: r.name,
        name: r.name,
        line: recruiterRowLine(r.openReqs, r.activeCandidates),
        pickable: true,
        pick: { kind: 'recruiter', name: r.name, id: r.id },
        terms: '',
      }),
    ),
  ]
}

/** Whether a row matches the search: its name or its other terms, ignoring case. */
export function rowMatches(row: PickRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || row.name.toLowerCase().includes(q) || row.terms.toLowerCase().includes(q)
}

/** The row the remembered pick names, if it is still listed and can be picked. */
export function currentRowKey(kind: PickKind, picks: ModePicks, rows: readonly PickRow[]): string | null {
  const find = (same: (r: PickRow) => boolean) => rows.find((r) => r.pickable && same(r))?.key ?? null
  switch (kind) {
    case 'manager':
      return picks.managerId ? find((r) => r.key === picks.managerId) : null
    case 'unit':
      return picks.unit ? find((r) => r.key === picks.unit) : null
    case 'region':
      return picks.region ? find((r) => r.key === picks.region) : null
    case 'recruiter': {
      const name = picks.recruiter?.name
      if (!name) return null
      if (name === EVERY_RECRUITER) return find((r) => r.key === EVERY_RECRUITER)
      const k = recruiterKey(name)
      return find((r) => r.key !== EVERY_RECRUITER && recruiterKey(r.key) === k)
    }
  }
}

/** The dialog's primary button for the row picked: "Show every req" for every recruiter. */
export const confirmLabel = (kind: PickKind, key: string | null): string =>
  kind === 'recruiter' && key === EVERY_RECRUITER ? EVERY_RECRUITER_CONFIRM : PICKER_COPY[kind].confirm

/** The search field's placeholder and accessible name, and the list's name, per kind. */
export const SEARCH_LABEL: Readonly<Record<PickKind, string>> = {
  manager: 'Search by name or title',
  unit: 'Search business units',
  region: 'Search regions or sites',
  recruiter: 'Search by name',
}
export const LIST_LABEL: Readonly<Record<PickKind, string>> = {
  manager: 'Managers',
  unit: 'Business units',
  region: 'Regions',
  recruiter: 'Recruiters',
}

/**
 * What the pick is called on the Mode button and under the checked choice: the manager's or the
 * recruiter's name, the business unit or the region (`EVERY_RECRUITER` for every recruiter). Null
 * while the mode waits for its pick, and in modes without one.
 */
export function pickNameOf(
  mode: Mode,
  scope: ScopeLock | null,
  unset: boolean,
  picks: Pick<ModePicks, 'recruiter'>,
): string | null {
  if (!PICK_OF[mode]) return null
  if (mode === 'recruiter' && picks.recruiter?.name === EVERY_RECRUITER) return EVERY_RECRUITER
  if (unset || !scope) return null
  switch (scope.kind) {
    case 'org':
      return scope.managerName || null
    case 'unit':
      return scope.unit || null
    case 'region':
      return scope.region || null
    case 'reqs':
      return scope.recruiter || null
  }
}

/** The pick as the Mode menu shows it under the checked choice: "Every recruiter" for "*". */
export const pickText = (name: string): string => (name === EVERY_RECRUITER ? EVERY_RECRUITER_ROW.name : name)

/** The Mode button's spoken name: "Mode: HRBP for a region, APAC", "Mode: Finance". */
export function modeSpoken(mode: Mode, name: string | null): string {
  if (!name) return `Mode: ${MODE_LABEL[mode]}`
  return `Mode: ${MODE_LABEL[mode]}, ${name === EVERY_RECRUITER ? 'every recruiter' : name}`
}

/**
 * Settings > Mode's pick line: "Showing Census for Silicon Engineering", "for APAC", "for Maya
 * Chen's reqs", "for Priya Raman's org", "for every recruiter's reqs"; "No region picked yet."
 * while the mode waits for its pick. Null in modes without a pick.
 */
export function showingLine(
  mode: Mode,
  scope: ScopeLock | null,
  unset: boolean,
  picks: Pick<ModePicks, 'recruiter'>,
): string | null {
  const kind = PICK_OF[mode]
  if (!kind) return null
  if (mode === 'recruiter' && picks.recruiter?.name === EVERY_RECRUITER) return SHOWING_EVERY_RECRUITER
  if (unset || !scope?.label) return `${PICKER_COPY[kind].none} yet.`
  return showingForScope(scope.label)
}

/** Which pick kinds have anything to pick in the loaded data (a mode with none is disabled). */
export type PickAvailability = Readonly<Record<PickKind, boolean>>

/** The modes the Mode menu greys out, with the line that says why. */
export function disabledHint(mode: Mode, available: PickAvailability): string | null {
  const kind = PICK_OF[mode]
  return kind && !available[kind] ? PICKER_COPY[kind].disabled : null
}
