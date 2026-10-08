/**
 * The policy file, `access-policy.json` (docs/SECURITY-CENTER.md): writing it on Publish and
 * reading it at startup or on Import. The checksum is SHA-256 over the file's fields in a fixed
 * order, so spacing does not matter and any edited value does. A file that is not JSON, not this
 * format, a format version this Census does not read, or whose checksum does not match is ignored
 * as a whole; within a good file, lines are screened one by one (`screenLines`). Pure.
 */
import { type SurfaceCatalog, screenLines } from './lines'
import { sha256 } from './sha256'
import {
  POLICY_FORMAT,
  POLICY_FORMAT_VERSION,
  type PolicyFile,
  type PolicyLine,
  type SkippedLine,
} from './types'

type Unchecked = Omit<PolicyFile, 'checksum' | 'overrides'> & { overrides: readonly unknown[] }

const pick = (v: unknown): unknown[] => {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  return [
    o.role ?? null,
    o.surface ?? null,
    o.decision ?? null,
    o.reason ?? null,
    o.by ?? null,
    o.at ?? null,
    o.how ?? null,
  ]
}

/** The text the checksum is taken over: every field, in a fixed order. */
export function canonicalText(f: Unchecked): string {
  return JSON.stringify([f.format, f.version, f.publishedAt, f.publishedBy, f.notes, f.overrides.map(pick)])
}

export const checksumOf = (f: Unchecked): string => `sha256-${sha256(canonicalText(f))}`

/** A policy file for a draft's lines, published by someone at a time. */
export function buildPolicyFile(args: {
  lines: readonly PolicyLine[]
  publishedBy: string
  notes: string
  now?: Date
}): PolicyFile {
  const overrides = args.lines.map((l) => ({
    role: l.role,
    surface: l.surface,
    decision: l.decision,
    reason: l.reason,
    by: l.by,
    at: l.at,
    ...(l.how ? { how: l.how } : {}),
  }))
  const body: Unchecked = {
    format: POLICY_FORMAT,
    version: POLICY_FORMAT_VERSION,
    publishedAt: (args.now ?? new Date()).toISOString(),
    publishedBy: args.publishedBy.trim(),
    notes: args.notes.trim(),
    overrides,
  }
  return { ...body, overrides, checksum: checksumOf(body) }
}

/** The file as it is downloaded: two-space JSON with a final newline. */
export const policyFileText = (f: PolicyFile): string => `${JSON.stringify(f, null, 2)}\n`

export type ReadPolicy =
  | { ok: false; why: string }
  | {
      ok: true
      file: Omit<PolicyFile, 'overrides'>
      lines: PolicyLine[]
      skipped: SkippedLine[]
      /** How many lines the file holds. */
      total: number
    }

/** Read a policy file's text: ignored as a whole with why, or its lines screened one by one. */
export function readPolicyFile(text: string, cat: SurfaceCatalog): ReadPolicy {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, why: 'The file is not valid JSON.' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return { ok: false, why: 'The file is not a Census policy file.' }
  const d = data as Record<string, unknown>
  if (d.format !== POLICY_FORMAT) return { ok: false, why: 'The file is not a Census policy file.' }
  if (d.version !== POLICY_FORMAT_VERSION)
    return {
      ok: false,
      why: `The file is format version ${String(d.version)}, and this Census reads version ${POLICY_FORMAT_VERSION}.`,
    }
  if (!Array.isArray(d.overrides)) return { ok: false, why: 'The file has no list of overrides.' }
  const body: Unchecked = {
    format: POLICY_FORMAT,
    version: POLICY_FORMAT_VERSION,
    publishedAt: typeof d.publishedAt === 'string' ? d.publishedAt : '',
    publishedBy: typeof d.publishedBy === 'string' ? d.publishedBy : '',
    notes: typeof d.notes === 'string' ? d.notes : '',
    overrides: d.overrides,
  }
  // Checked over the fields as the file holds them, before anything is trimmed or dropped.
  const raw: Unchecked = {
    ...body,
    publishedAt: d.publishedAt as string,
    publishedBy: d.publishedBy as string,
    notes: d.notes as string,
  }
  if (typeof d.checksum !== 'string' || d.checksum !== checksumOf(raw))
    return {
      ok: false,
      why: 'Its checksum does not match its contents, so it may have been edited by hand or damaged.',
    }
  const { lines, skipped } = screenLines(d.overrides, cat)
  return {
    ok: true,
    file: {
      format: POLICY_FORMAT,
      version: POLICY_FORMAT_VERSION,
      publishedAt: body.publishedAt,
      publishedBy: body.publishedBy,
      notes: body.notes,
      checksum: d.checksum,
    },
    lines,
    skipped,
    total: d.overrides.length,
  }
}
