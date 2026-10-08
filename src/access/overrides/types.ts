/**
 * The Security center's shapes (docs/SECURITY-CENTER.md): one override line, the policy file
 * (`access-policy.json`), a line the loader or an import left out, and what is in force. Pure.
 */
import { MODES, type Mode } from '../modes'
import type { Access } from '../policy/types'

export const POLICY_FORMAT = 'census-access-policy'
/** The file format this Census reads and writes; a file with another is ignored as a whole. */
export const POLICY_FORMAT_VERSION = 1
export const POLICY_FILE_NAME = 'access-policy.json'

/** The roles the Security center edits: every mode but Developer, which always sees everything. */
export type PolicyRole = Exclude<Mode, 'developer'>

/** In the access matrix's column order: HR, CHRO, BU, Rgn, Comp, Tal, Ops, Rec, Fin, Mgr. */
export const POLICY_ROLES: readonly PolicyRole[] = [
  'hr',
  'chro',
  'hrbp-unit',
  'hrbp-region',
  'compensation',
  'talent-management',
  'hr-ops',
  'recruiter',
  'finance',
  'manager',
]

export const isPolicyRole = (v: unknown): v is PolicyRole =>
  typeof v === 'string' && v !== 'developer' && (MODES as readonly string[]).includes(v)

/** Role settings that are not a surface: offered in the Mode menu, and the view the role opens on. */
export const ROLE_OFFERED = 'role:offered'
export const ROLE_HOME = 'role:home'

export const ACCESS_VALUES: readonly Access[] = ['shown', 'limited', 'hidden']
export const isAccess = (v: unknown): v is Access => v === 'shown' || v === 'limited' || v === 'hidden'

/**
 * One override: a role, a surface, its decision, and why, who and when. `decision` is shown,
 * limited or hidden; for `role:offered` shown or hidden; for `role:home` a view key.
 */
export interface PolicyLine {
  role: PolicyRole
  surface: string
  decision: string
  reason: string
  by: string
  /** ISO date and time. */
  at: string
  /** For limited: what the limit is, in one sentence. */
  how?: string
}

/** The published file. */
export interface PolicyFile {
  format: typeof POLICY_FORMAT
  version: number
  publishedAt: string
  publishedBy: string
  notes: string
  overrides: PolicyLine[]
  checksum: string
}

/** Why a line was left out. */
export type SkipKind = 'unknown-role' | 'unknown-surface' | 'invalid' | 'guard' | 'replaced'

export interface SkippedLine {
  /** Its place in the file's list, from 0. */
  index: number
  role: string
  surface: string
  decision: string
  kind: SkipKind
  /** One sentence: "Not a role Census has.", or the guard rail it breaks. */
  why: string
}

/** Where the policy in force came from. */
export type PolicySource =
  /** No file: the built-in defaults. */
  | 'defaults'
  /** `access-policy.json` fetched from Census's own site. */
  | 'site'
  /** The one-file build's copy, embedded when it was built. */
  | 'embedded'

/** What is in force in this browser, and what the loader made of the file. */
export interface InForce {
  source: PolicySource
  /** The one-file build: true when it reads its embedded copy instead of fetching. */
  oneFile: boolean
  /** The file's facts, when one was applied. */
  file: Omit<PolicyFile, 'overrides'> | null
  /** The lines in force. */
  lines: readonly PolicyLine[]
  /** Lines left out one by one. */
  skipped: readonly SkippedLine[]
  /** A file that was found but ignored as a whole, and why (a Developer-mode warning). */
  ignored: string | null
}

export const DEFAULTS_IN_FORCE: InForce = {
  source: 'defaults',
  oneFile: false,
  file: null,
  lines: [],
  skipped: [],
  ignored: null,
}
