/**
 * Chip development stages for job functions (docs/ANALYSES.md, 4.2 and 4.3): reading the stage
 * saved on the Job functions list, and proposing one from keywords when it is blank. A proposed
 * stage is used and marked "Proposed" until someone saves it. Pure.
 */
import { CHIP_STAGES, type ChipStageKey, chipStageByKey } from '../schema'

/** Keyword rules in the order they are tried; the first that matches wins. */
const RULES: readonly (readonly [ChipStageKey, readonly string[]])[] = [
  [
    'architecture',
    ['architect', 'architecture', 'performance model', 'performance modeling', 'specification'],
  ],
  // Before any layout or design rule, so analog layout stays analog.
  ['ams', ['analog', 'mixed-signal', 'mixed signal', 'serdes', 'rf']],
  // Before verification, so physical verification is signoff.
  [
    'signoff',
    [
      'timing',
      'sta',
      'signoff',
      'sign-off',
      'sign off',
      'physical verification',
      'drc',
      'lvs',
      'tape-out',
      'tapeout',
      'package',
      'packaging',
      'signal integrity',
      'power integrity',
    ],
  ],
  ['verification', ['verification', 'formal', 'emulation', 'prototyping', 'uvm']],
  ['dft', ['dft', 'bist', 'scan', 'atpg']],
  ['physical', ['physical design', 'place and route', 'back end', 'backend']],
  ['rtl', ['rtl', 'asic', 'logic design', 'digital design', 'front end', 'ip design']],
  [
    'postSilicon',
    [
      'post-silicon',
      'post silicon',
      'bring-up',
      'bring up',
      'silicon validation',
      'systems validation',
      'system validation',
      'characterization',
      'board',
      'hardware',
    ],
  ],
  [
    'productTest',
    [
      'product engineering',
      'test engineering',
      'test engineer',
      'yield',
      'ate',
      'reliability',
      'quality',
      'failure analysis',
    ],
  ],
  ['software', ['firmware', 'software', 'driver', 'drivers', 'compiler', 'compilers', 'sdk', 'embedded']],
  ['shared', ['cad', 'eda', 'methodology', 'program management', 'engineering leadership']],
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A phrase as whole words: "sta" never matches inside "staff"; hyphens and spaces are alike. */
const phrase = (p: string) => escapeRe(p.toLowerCase()).replace(/\\-|\s+/g, '[\\s-]+')

const MATCHERS: readonly (readonly [ChipStageKey, RegExp])[] = RULES.map(([key, words]) => [
  key,
  new RegExp(`(?:^|[^a-z0-9])(?:${words.map(phrase).join('|')})(?![a-z0-9])`, 'i'),
])

/** The stage the keywords give one piece of text, or null. */
export function stageFromText(text: string | null | undefined): ChipStageKey | null {
  const t = (text ?? '').trim()
  if (!t) return null
  for (const [key, re] of MATCHERS) if (re.test(t)) return key
  return null
}

/**
 * The stage Census proposes for a job function: the keywords on its name, then on its commonest
 * job title; null when neither matches (the function shows as Not mapped).
 */
export function proposeStage(jobFunction: string, commonestTitle?: string | null): ChipStageKey | null {
  return stageFromText(jobFunction) ?? stageFromText(commonestTitle)
}

/**
 * A saved stage as the list holds it: the stage's label (the Job functions list's choice), its
 * key, or a stage order number saved before the stage became a choice (1 is Architecture and spec,
 * 11 Shared engineering). Null for blank or anything else.
 */
export function savedStageKey(v: unknown): ChipStageKey | null {
  if (typeof v === 'number') return Number.isInteger(v) ? (CHIP_STAGES[v - 1]?.key ?? null) : null
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  if (!t) return null
  if (/^\d+$/.test(t)) return CHIP_STAGES[Number(t) - 1]?.key ?? null
  return CHIP_STAGES.find((s) => s.key.toLowerCase() === t || s.label.toLowerCase() === t)?.key ?? null
}

/** The stage's position in the flow (1 to 11). */
export const stageOrder = (key: ChipStageKey): number => chipStageByKey.get(key)?.order ?? 0

/**
 * Family names Census proposes as engineering when the Job families list does not say: the same
 * disciplines People stats calls engineering (`isEngineering` in src/views/hrbp/engine/workforce.ts).
 */
const ENGINEERING_FAMILY =
  /engineer|design|verification|validation|firmware|software|silicon|analog|mixed-signal|architecture|\bdft\b|hardware|physical|test & product/i

/** Whether a family name reads as engineering. */
export const proposeEngineering = (family: string): boolean => ENGINEERING_FAMILY.test(family)

/** A saved Engineering attribute: true for Yes, false for No, null for blank or anything else. */
export function savedEngineering(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  if (t === 'yes' || t === 'y' || t === 'true') return true
  if (t === 'no' || t === 'n' || t === 'false') return false
  return null
}
