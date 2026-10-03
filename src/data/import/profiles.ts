/**
 * Remembered mappings. A profile stores the user's column choices and per-column date order for
 * one file layout (identified by a fingerprint of its headers), so the same export from the
 * same system maps itself next time. Learned synonyms remember single header picks across
 * layouts. Everything stays in this browser; storage failures are ignored.
 */
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval'
import { fnv } from '@/lib/stats'
import type { DatasetDef, DatasetKey } from '../schema'
import { normalizeHeader } from './text'
import type { ApplyOptions, DateOrder, HourlyConversion, Mapping } from './types'

export interface MappingProfile {
  version: 1
  dataset: DatasetKey
  fingerprint: string
  /** Field key → normalized header (null = the user left it unmapped on purpose). */
  fields: Record<string, string | null>
  /** Normalized header → date order. */
  dateOrders: Record<string, DateOrder>
  percentWhole: Record<string, boolean>
  hourlyToAnnual: HourlyConversion | null
  valueMaps: Record<string, Record<string, string | null>>
  savedAt: string
}

/** Order-independent FNV-1a fingerprint of the normalized headers (8 hex characters). */
export function headerFingerprint(headers: readonly string[]): string {
  const norm = headers.map(normalizeHeader).sort()
  return fnv(norm.join('|')).toString(16).padStart(8, '0')
}

const profileKey = (dataset: DatasetKey, fp: string) => `census:profile:${dataset}:${fp}`
const synonymsKey = (dataset: DatasetKey) => `census:synonyms:${dataset}`

/** Capture the current mapping and options as a profile for this header layout. */
export function makeProfile(
  dataset: DatasetKey,
  headers: readonly string[],
  mapping: Mapping,
  options: ApplyOptions = {},
): MappingProfile {
  const fields: Record<string, string | null> = {}
  for (const [k, m] of Object.entries(mapping)) fields[k] = m.header ? normalizeHeader(m.header) : null
  const dateOrders: Record<string, DateOrder> = {}
  for (const [h, o] of Object.entries(options.dateOrders ?? {})) dateOrders[normalizeHeader(h)] = o
  const hourly = options.hourlyToAnnual ?? null
  return {
    version: 1,
    dataset,
    fingerprint: headerFingerprint(headers),
    fields,
    dateOrders,
    percentWhole: { ...(options.percentWhole ?? {}) },
    hourlyToAnnual: hourly
      ? { hours: hourly.hours, basisHeader: hourly.basisHeader ? normalizeHeader(hourly.basisHeader) : null }
      : null,
    valueMaps: { ...(options.valueMaps ?? {}) },
    savedAt: new Date().toISOString(),
  }
}

/** Turn a stored profile back into a mapping and options for this file's actual headers. */
export function applyProfile(
  profile: MappingProfile,
  headers: readonly string[],
  def: DatasetDef,
): { mapping: Mapping; options: ApplyOptions } {
  const byNorm = new Map(headers.map((h) => [normalizeHeader(h), h]))
  const mapping: Mapping = {}
  for (const f of def.fields) {
    const norm = profile.fields[f.key]
    const header = norm ? (byNorm.get(norm) ?? null) : null
    mapping[f.key] = header
      ? { header, confidence: 'high', score: 1, reason: 'Saved from your last import of this layout' }
      : {
          header: null,
          confidence: 'low',
          score: 0,
          reason: norm === null ? 'Left unmapped last time' : 'No matching column',
        }
  }
  const dateOrders: Record<string, DateOrder> = {}
  for (const [norm, order] of Object.entries(profile.dateOrders)) {
    const h = byNorm.get(norm)
    if (h) dateOrders[h] = order
  }
  const hourly = profile.hourlyToAnnual
  return {
    mapping,
    options: {
      dateOrders,
      percentWhole: { ...profile.percentWhole },
      hourlyToAnnual: hourly
        ? {
            hours: hourly.hours,
            basisHeader: hourly.basisHeader ? (byNorm.get(hourly.basisHeader) ?? null) : null,
          }
        : null,
      valueMaps: { ...profile.valueMaps },
    },
  }
}

function isProfile(v: unknown): v is MappingProfile {
  if (!v || typeof v !== 'object') return false
  const p = v as Partial<MappingProfile>
  return (
    p.version === 1 &&
    typeof p.fingerprint === 'string' &&
    !!p.fields &&
    typeof p.fields === 'object' &&
    !!p.dateOrders
  )
}

/** The saved profile for this dataset and header layout, or null. */
export async function loadProfile(
  dataset: DatasetKey,
  headers: readonly string[],
): Promise<MappingProfile | null> {
  try {
    const v = await idbGet<unknown>(profileKey(dataset, headerFingerprint(headers)))
    return isProfile(v) && v.dataset === dataset ? v : null
  } catch {
    return null
  }
}

export async function saveProfile(profile: MappingProfile): Promise<void> {
  try {
    await idbSet(profileKey(profile.dataset, profile.fingerprint), profile)
  } catch {
    /* storage unavailable: the mapping just won't be remembered */
  }
}

export async function deleteProfile(dataset: DatasetKey, fingerprint: string): Promise<void> {
  try {
    await idbDel(profileKey(dataset, fingerprint))
  } catch {
    /* nothing stored */
  }
}

/** Normalized header → field key picks the user made for this dataset. */
export function loadLearnedSynonyms(dataset: DatasetKey): Record<string, string> {
  try {
    const raw = localStorage.getItem(synonymsKey(dataset))
    const v: unknown = raw ? JSON.parse(raw) : null
    if (!v || typeof v !== 'object') return {}
    return Object.fromEntries(
      Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'),
    )
  } catch {
    return {}
  }
}

/** Remember that `header` means `fieldKey` in this dataset (call when the user overrides a guess). */
export function learnSynonym(dataset: DatasetKey, header: string, fieldKey: string): void {
  try {
    const next = { ...loadLearnedSynonyms(dataset), [normalizeHeader(header)]: fieldKey }
    localStorage.setItem(synonymsKey(dataset), JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
}

export function forgetLearnedSynonyms(dataset: DatasetKey): void {
  try {
    localStorage.removeItem(synonymsKey(dataset))
  } catch {
    /* storage unavailable */
  }
}
