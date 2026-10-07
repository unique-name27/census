/**
 * Fixtures for the Ask engine tests: the sample company's contexts, a conversation, and the
 * privacy checks every tool result must pass. Not imported by the app.
 */
import { expect } from 'vitest'
import type { AccessInput } from '@/access/context'
import { type AnalyticsContext, buildContext } from '@/data/context'
import type { DataStandard } from '@/data/quality/tier'
import type { DatasetVersion } from '@/data/quality/types'
import type { ReferenceMapping } from '@/data/reference/types'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { MetricsApi } from '@/metrics/types'
import { VIEWS } from '@/views/registry'
import { tieredSampleContext } from '@/views/scorecard/engine/testkit'
import { Conversation } from './conversation'
import { runTool } from './tools'
import type { ToolEnv } from './types'

let sample: Datasets | null = null
export const sampleData = (): Datasets => {
  sample ??= generateSample()
  return sample
}

const sources = (data: Datasets) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

/**
 * The clean sample under the given filters (pay and immigration switches as given), or other
 * data (an edited copy of the sample, with Data room versions and reference mappings) the same way.
 */
export function sampleCtx(
  o: {
    filters?: Partial<Filters>
    showPay?: boolean
    showImmigration?: boolean
    engagement?: boolean
    metrics?: MetricsApi
    data?: Datasets
    versions?: Partial<Record<DatasetKey, DatasetVersion | null>>
    mappings?: readonly ReferenceMapping[]
    /** A mode (Manager mode with its manager); HR when not given. */
    access?: AccessInput
  } = {},
): AnalyticsContext {
  const data = o.data ?? sampleData()
  return buildContext({
    data,
    sources: sources(data),
    filters: { ...DEFAULT_FILTERS, ...o.filters },
    asOfOverride: null,
    showPay: o.showPay ?? false,
    showImmigration: o.showImmigration ?? false,
    features: { engagementSurveys: o.engagement ?? false },
    ...(o.metrics ? { metrics: o.metrics } : {}),
    ...(o.versions ? { versions: o.versions } : {}),
    ...(o.mappings ? { mappings: o.mappings } : {}),
    ...(o.access ? { access: o.access } : {}),
  })
}

/** The sample as the app loads it (raw extracts, certified datasets) under a data standard. */
export const tieredCtx = (standard: DataStandard): AnalyticsContext => tieredSampleContext(standard)

export const envOf = (ctx: AnalyticsContext, extra: Partial<ToolEnv> = {}): ToolEnv => ({
  ctx,
  views: VIEWS,
  ...extra,
})

/** Run a tool and parse its result. */
export function call(conv: Conversation, env: ToolEnv, name: string, input: unknown = {}) {
  const run = runTool(name, input, env, conv)
  return { ...run, json: JSON.parse(run.content) as Record<string, unknown> }
}

/* ───────────── privacy checks ───────────── */

export interface Secrets {
  /** Full names of employees and candidates, and the person-name field values. */
  names: Set<string>
  /** Employee, application and candidate IDs. */
  ids: Set<string>
  /**
   * Pay amounts (salary, range, market, equity) as numbers, from 25,000 up: smaller round amounts
   * (an equity grant of 1,000) are indistinguishable from counts, and no count reaches 25,000.
   */
  pay: Set<number>
  /** Other text that must never go out (free text typed into an upload), matched ignoring case. */
  texts?: readonly string[]
}

let secrets: Secrets | null = null

/** Everything that must never reach Claude, from the sample data. */
export function sampleSecrets(): Secrets {
  secrets ??= secretsOf(sampleData())
  return secrets
}

/** Everything that must never reach Claude in some data, plus names and text known to be in it. */
export function secretsOf(
  d: Datasets,
  extra: { names?: readonly string[]; texts?: readonly string[] } = {},
): Secrets {
  const names = new Set<string>()
  const ids = new Set<string>()
  const add = (s: string | null | undefined, set: Set<string>) => {
    if (s?.trim()) set.add(s.trim())
  }
  for (const e of d.employees) {
    add(e.name, names)
    add(e.employeeId, ids)
    add(e.hrbp, names)
  }
  for (const c of d.candidates) {
    add(c.candidateName, names)
    add(c.applicationId, ids)
    add(c.candidateId, ids)
    add(c.recruiter, names)
    add(c.coordinator, names)
  }
  for (const r of d.requisitions) {
    add(r.hiringManager, names)
    add(r.recruiter, names)
  }
  for (const c of d.cases) add(c.assignee, names)
  for (const n of extra.names ?? []) add(n, names)
  const pay = new Set<number>()
  for (const c of d.comp)
    for (const v of [c.baseSalary, c.rangeMin, c.rangeMid, c.rangeMax, c.marketP50, c.annualEquityUsd])
      if (typeof v === 'number' && v >= PAY_FLOOR) pay.add(v)
  return { names, ids, pay, ...(extra.texts ? { texts: extra.texts } : {}) }
}

const NUMBER_RE = /-?\d+(?:\.\d+)?/g
const PAY_FLOOR = 25_000

/** Words of a text with possessives and edge punctuation trimmed, so "Lena Ortiz's" yields "Lena", "Ortiz". */
function wordsOf(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}'’.-]+/u)
    .map((w) => w.replace(/^['’.-]+|['’.-]+$/g, '').replace(/['’]s$/, ''))
    .filter(Boolean)
}

/**
 * Text as a reader would still recognize a name in it: lowercase, accents dropped (composed or
 * decomposed), any apostrophe as ', hyphens and dashes as spaces. Written apart from the engine's
 * own folding, so a mistake there is not repeated here.
 */
const loose = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[‘’‛ʼʹ`´′]/g, "'")
    .replace(/[-‐-—−]/g, ' ')

const looseNames = new WeakMap<Secrets, Set<string>>()

/** Every name folded, and in "Last First" order too (a comma is not a word, so "Last, First" matches it). */
function looseNamesOf(s: Secrets): Set<string> {
  let out = looseNames.get(s)
  if (!out) {
    out = new Set()
    for (const n of s.names) {
      const words = wordsOf(loose(n))
      if (!words.length) continue
      out.add(words.join(' '))
      if (words.length > 1) out.add([words[words.length - 1], ...words.slice(0, -1)].join(' '))
    }
    looseNames.set(s, out)
  }
  return out
}

/** What in a serialized result breaks the privacy promise; empty when it is clean. */
export function leaks(text: string, s: Secrets = sampleSecrets()): string[] {
  const out: string[] = []
  const grams = (words: readonly string[], check: (gram: string) => void) => {
    const seen = new Set<string>()
    for (let i = 0; i < words.length; i++) {
      let gram = ''
      for (let n = 0; n < 5 && i + n < words.length; n++) {
        gram = n ? `${gram} ${words[i + n]}` : (words[i] as string)
        if (seen.has(gram)) continue
        seen.add(gram)
        check(gram)
      }
    }
  }
  grams(wordsOf(text), (gram) => {
    if (s.ids.has(gram)) out.push(`id ${gram}`)
    if (s.names.has(gram)) out.push(`name ${gram}`)
  })
  // The same names typed another way: case, accents, apostrophes, hyphens, "Last, First".
  const folded = looseNamesOf(s)
  grams(wordsOf(loose(text)), (gram) => {
    if (folded.has(gram) && !out.some((o) => loose(o) === `name ${gram}`)) out.push(`name (as typed) ${gram}`)
  })
  const lower = text.toLowerCase()
  for (const t of s.texts ?? []) if (lower.includes(t.toLowerCase())) out.push(`text ${t}`)
  if (/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+\.\p{L}{2,}/u.test(text)) out.push('email')
  if (/[$€£₹₪]\s?\d/.test(text)) out.push('money')
  for (const m of text.match(NUMBER_RE) ?? []) {
    const v = Number(m)
    if (Math.abs(v) >= PAY_FLOOR && s.pay.has(v)) out.push(`pay ${m}`)
  }
  return out
}

/** Fail with what leaked. */
export function expectClean(text: string, what: string): void {
  const l = leaks(text)
  expect(l.slice(0, 5), `${what} leaks ${l.length}: ${l.slice(0, 5).join(', ')}`).toEqual([])
}

export { Conversation }
