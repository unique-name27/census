/**
 * Settings: one home for every preference (docs/DATA-TIERS.md, Settings). Pure types, defaults,
 * validation, persistence and the settings file format. The store (`useCensus`) holds the live
 * values and the actions; this module never imports it.
 *
 * Everything persists in this browser under `census:settings`, except showing pay amounts,
 * which lasts for the session only and is never written anywhere. Older keys (`census:theme`,
 * `census:tools`, `census:comp-cycle-settings`, `census:asOf`) are read when no settings are
 * saved yet, and removed the first time settings are saved.
 */
import { normalizeUrl } from '@/app/tools'
import { todayISO } from '@/lib/dates'
import { type DataStandard, DEFAULT_STANDARD, isDataStandard } from './quality/tier'
import type { ISODate } from './schema'

export type ThemePref = 'system' | 'light' | 'dark'
export type TextSize = 'sm' | 'md' | 'lg' | 'xl'
export type MotionPref = 'system' | 'reduce'

export const TEXT_SIZES: readonly TextSize[] = ['sm', 'md', 'lg', 'xl']
export const TEXT_SIZE_LABEL: Record<TextSize, string> = {
  sm: 'Small',
  md: 'Standard',
  lg: 'Large',
  xl: 'Extra large',
}
/** Root font scale for each text size (the whole app is sized in rem from 14 px body). */
export const TEXT_SIZE_SCALE: Record<TextSize, number> = { sm: 0.9286, md: 1, lg: 1.1429, xl: 1.2857 }
export const THEME_LABEL: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' }
export const MOTION_LABEL: Record<MotionPref, string> = { system: 'Follow system', reduce: 'Reduce motion' }

/* ───────────── compensation cycle ───────────── */

export type RatingKey = 1 | 2 | 3 | 4 | 5
export const RATING_KEYS: readonly RatingKey[] = [5, 4, 3, 2, 1]

export interface CompCycleSettings {
  /** Merit budget as a fraction of eligible base (0.035 = 3.5%). */
  meritBudgetPct: number
  /** Healthy compa-ratio band, inclusive [low, high]. */
  healthyBand: [number, number]
  /** Merit guideline by rating, as fractions. */
  guideline: Record<RatingKey, number>
}

/** The Compensation view's defaults (src/views/comp/engine/settings.ts). */
export const DEFAULT_COMP_CYCLE: CompCycleSettings = {
  meritBudgetPct: 0.035,
  healthyBand: [0.9, 1.1],
  guideline: { 5: 0.06, 4: 0.045, 3: 0.03, 2: 0.01, 1: 0 },
}

export const COMP_CYCLE_LIMITS = {
  meritBudgetPct: { min: 0, max: 0.2 },
  band: { min: 0.5, max: 1.5 },
  guideline: { min: 0, max: 0.3 },
} as const

/** The comp engine's own shape (`CycleSettings` in src/views/comp/engine/settings.ts). */
export interface LegacyCycleSettings {
  meritBudget: number
  bandLow: number
  bandHigh: number
  guideline: Record<RatingKey, number>
}

export const toCycleSettings = (c: CompCycleSettings): LegacyCycleSettings => ({
  meritBudget: c.meritBudgetPct,
  bandLow: c.healthyBand[0],
  bandHigh: c.healthyBand[1],
  guideline: { ...c.guideline },
})

export const fromCycleSettings = (c: LegacyCycleSettings): CompCycleSettings => ({
  meritBudgetPct: c.meritBudget,
  healthyBand: [c.bandLow, c.bandHigh],
  guideline: { ...c.guideline },
})

const finiteIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

/** The valid parts of cycle settings from untrusted input, in either shape. */
interface CompCycleParts {
  meritBudgetPct?: number
  healthyBand?: [number, number]
  guideline: Partial<Record<RatingKey, number>>
}

function compCycleParts(raw: unknown): CompCycleParts {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const L = COMP_CYCLE_LIMITS
  const out: CompCycleParts = { guideline: {} }
  const budget = r.meritBudgetPct ?? r.meritBudget
  if (finiteIn(budget, L.meritBudgetPct.min, L.meritBudgetPct.max)) out.meritBudgetPct = budget
  const band = Array.isArray(r.healthyBand) ? r.healthyBand : [r.bandLow, r.bandHigh]
  const [lo, hi] = band as unknown[]
  if (finiteIn(lo, L.band.min, L.band.max) && finiteIn(hi, L.band.min, L.band.max) && lo < hi)
    out.healthyBand = [lo, hi]
  const g = (r.guideline && typeof r.guideline === 'object' ? r.guideline : {}) as Record<string, unknown>
  for (const k of RATING_KEYS) {
    const v = g[k]
    if (finiteIn(v, L.guideline.min, L.guideline.max)) out.guideline[k] = v
  }
  return out
}

const hasParts = (p: CompCycleParts) =>
  p.meritBudgetPct !== undefined || p.healthyBand !== undefined || Object.keys(p.guideline).length > 0

/**
 * Cycle settings from untrusted input, in either shape. Anything missing or out of range keeps
 * its value in `base` (the defaults unless given); a band whose low end is not below its high
 * end keeps the base band whole.
 */
export function sanitizeCompCycle(
  raw: unknown,
  base: CompCycleSettings = DEFAULT_COMP_CYCLE,
): CompCycleSettings {
  const p = compCycleParts(raw)
  return {
    meritBudgetPct: p.meritBudgetPct ?? base.meritBudgetPct,
    healthyBand: p.healthyBand ?? [...base.healthyBand],
    guideline: { ...base.guideline, ...p.guideline },
  }
}

/* ───────────── all settings ───────────── */

/** Saved overrides of the Related tools links, by tool id (null clears a default link). */
export type ToolLinks = Record<string, string | null>

export interface Settings {
  theme: ThemePref
  textSize: TextSize
  motion: MotionPref
  dataStandard: DataStandard
  /** Reporting date override; null uses the latest date in the data. */
  asOfOverride: ISODate | null
  compCycle: CompCycleSettings
  tools: ToolLinks
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  textSize: 'md',
  motion: 'system',
  dataStandard: DEFAULT_STANDARD,
  asOfOverride: null,
  compCycle: DEFAULT_COMP_CYCLE,
  tools: {},
}

export type SettingsSection = 'display' | 'data' | 'privacy' | 'compensation' | 'tools' | 'device'
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  'display',
  'data',
  'privacy',
  'compensation',
  'tools',
  'device',
]
export const SECTION_LABEL: Record<SettingsSection, string> = {
  display: 'Display',
  data: 'Data',
  privacy: 'Privacy',
  compensation: 'Compensation cycle',
  tools: 'Related tools',
  device: 'This device',
}

const THEMES: readonly ThemePref[] = ['system', 'light', 'dark']
const MOTIONS: readonly MotionPref[] = ['system', 'reduce']

/** Earliest reporting date accepted, so a year typed digit by digit (0002, 0020 …) is never applied. */
export const EARLIEST_REPORTING_DATE: ISODate = '1990-01-01'

/** A real calendar date in `YYYY-MM-DD` form (30 Feb is refused). */
function isIsoDate(v: unknown): v is ISODate {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v
}

/** A reporting date the Settings sheet would accept: a real date from 1 Jan 1990 to today. */
export function isReportingDate(v: unknown, today: ISODate = todayISO()): v is ISODate {
  return isIsoDate(v) && v >= EARLIEST_REPORTING_DATE && v <= today
}

/** Saved tool links: known shapes only, web links only. */
export function sanitizeTools(raw: unknown): ToolLinks {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: ToolLinks = {}
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-z0-9-]{1,40}$/i.test(id)) continue
    if (v === null || v === '') out[id] = null
    else if (typeof v === 'string') {
      const url = normalizeUrl(v)
      if (url) out[id] = url
    }
  }
  return out
}

/** Settings from untrusted input; every invalid field falls back to its default. */
export function sanitizeSettings(raw: unknown, today: ISODate = todayISO()): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    theme: THEMES.includes(r.theme as ThemePref) ? (r.theme as ThemePref) : DEFAULT_SETTINGS.theme,
    textSize: TEXT_SIZES.includes(r.textSize as TextSize)
      ? (r.textSize as TextSize)
      : DEFAULT_SETTINGS.textSize,
    motion: MOTIONS.includes(r.motion as MotionPref) ? (r.motion as MotionPref) : DEFAULT_SETTINGS.motion,
    dataStandard: isDataStandard(r.dataStandard) ? r.dataStandard : DEFAULT_SETTINGS.dataStandard,
    asOfOverride: isReportingDate(r.asOfOverride, today) ? r.asOfOverride : null,
    compCycle: sanitizeCompCycle(r.compCycle),
    tools: sanitizeTools(r.tools),
  }
}

/* ───────────── persistence ───────────── */

export const SETTINGS_KEY = 'census:settings'
/** Keys earlier versions used; read once when no settings are saved. */
export const LEGACY_KEYS = {
  theme: 'census:theme',
  tools: 'census:tools',
  compCycle: 'census:comp-cycle-settings',
  asOf: 'census:asOf',
} as const

type StorageLike = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>

const storageOrNull = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function readJson(s: StorageLike, key: string): unknown {
  try {
    const v = s.getItem(key)
    return v == null ? undefined : JSON.parse(v)
  } catch {
    return undefined
  }
}

/** The saved settings, or the older keys migrated, or the defaults. */
export function loadSettings(storage: StorageLike | null = storageOrNull()): Settings {
  if (!storage) return { ...DEFAULT_SETTINGS }
  const saved = readJson(storage, SETTINGS_KEY)
  if (saved && typeof saved === 'object') return sanitizeSettings(saved)
  return sanitizeSettings({
    theme: readJson(storage, LEGACY_KEYS.theme),
    tools: readJson(storage, LEGACY_KEYS.tools),
    compCycle: readJson(storage, LEGACY_KEYS.compCycle),
    asOfOverride: readJson(storage, LEGACY_KEYS.asOf),
  })
}

/** Save every setting; once they are saved, the older keys are no longer needed and go. */
export function saveSettings(s: Settings, storage: StorageLike | null = storageOrNull()): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: settings apply for this session only */
    return
  }
  for (const key of Object.values(LEGACY_KEYS)) {
    try {
      storage?.removeItem?.(key)
    } catch {
      /* left in place; census:settings wins when both exist */
    }
  }
}

/** The settings a store holds, picked out of its state. */
export const pickSettings = (s: Settings): Settings => ({
  theme: s.theme,
  textSize: s.textSize,
  motion: s.motion,
  dataStandard: s.dataStandard,
  asOfOverride: s.asOfOverride,
  compCycle: s.compCycle,
  tools: s.tools,
})

/* ───────────── settings file ───────────── */

export const SETTINGS_FILE_KIND = 'census-settings'
export const SETTINGS_FILE_VERSION = 1

export interface SettingsFile {
  kind: typeof SETTINGS_FILE_KIND
  version: number
  exportedAt: string
  settings: Settings
}

export const settingsFileName = (today: ISODate): string => `Census settings ${today}.json`

/** The settings as a downloadable JSON file. Pay amounts are never in it. */
export function settingsBlob(s: Settings, now = new Date()): Blob {
  const file: SettingsFile = {
    kind: SETTINGS_FILE_KIND,
    version: SETTINGS_FILE_VERSION,
    exportedAt: now.toISOString(),
    settings: pickSettings(s),
  }
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
}

export type ImportSettingsResult =
  | {
      ok: true
      settings: Settings /** Settings the file held that were valid. */
      applied: (keyof Settings)[]
    }
  | { ok: false; error: string }

/**
 * Read a settings file (its text or parsed JSON). Fields that are missing or invalid keep their
 * current values: the comp cycle merges field by field and tool links link by link. A file that
 * is not a Census settings file is refused.
 */
export function parseSettingsFile(
  input: unknown,
  current: Settings,
  today: ISODate = todayISO(),
): ImportSettingsResult {
  let data = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch {
      return { ok: false, error: 'The file is not valid JSON.' }
    }
  }
  if (!data || typeof data !== 'object')
    return { ok: false, error: 'The file is not a Census settings file.' }
  const d = data as Partial<SettingsFile>
  if (d.kind !== SETTINGS_FILE_KIND || !d.settings || typeof d.settings !== 'object')
    return { ok: false, error: 'The file is not a Census settings file.' }
  if (typeof d.version !== 'number' || d.version > SETTINGS_FILE_VERSION)
    return { ok: false, error: 'The file comes from a newer version of Census.' }
  const raw = d.settings as unknown as Record<string, unknown>
  const clean = sanitizeSettings(raw, today)
  const next: Settings = { ...current }
  const applied: (keyof Settings)[] = []
  const take = <K extends keyof Settings>(k: K, valid: boolean) => {
    if (!(k in raw) || !valid) return
    next[k] = clean[k]
    applied.push(k)
  }
  take('theme', clean.theme === raw.theme)
  take('textSize', clean.textSize === raw.textSize)
  take('motion', clean.motion === raw.motion)
  take('dataStandard', clean.dataStandard === raw.dataStandard)
  take('asOfOverride', raw.asOfOverride === null || clean.asOfOverride === raw.asOfOverride)
  const cycle = compCycleParts(raw.compCycle)
  if (hasParts(cycle)) {
    next.compCycle = sanitizeCompCycle(raw.compCycle, current.compCycle)
    applied.push('compCycle')
  }
  const tools = sanitizeTools(raw.tools)
  if (Object.keys(tools).length) {
    next.tools = { ...current.tools, ...tools }
    applied.push('tools')
  }
  if (!applied.length) return { ok: false, error: 'The file holds no settings Census can use.' }
  return { ok: true, settings: next, applied }
}
