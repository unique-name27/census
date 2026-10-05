/**
 * The Claude models Ask Census offers (Settings > Ask Census), and how each one is called.
 *
 * Claude Opus 5.5 is the default. Its thinking is always on (adaptive) and cannot be switched off,
 * so the request sets an effort level instead; Claude Sonnet 5.5 takes the same. Claude Haiku 4.5
 * takes neither. Opus 5.5 and Sonnet 5.5 also opt into Anthropic's server-side fallback, so a
 * request a safety classifier declines is answered by the recommended fallback model instead of
 * stopping (beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`).
 */

export type ModelId = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-4-5-20251001'

export interface ModelInfo {
  id: ModelId
  /** As the Settings list shows it: "Claude Opus 5.5". */
  label: string
  /** One word or two: "Default", "Faster", "Fastest". */
  note: string
  /** `output_config.effort` to send, or null for a model that takes none. */
  effort: 'low' | 'medium' | 'high' | null
  /** Opt into server-side fallback on a declined request. */
  fallback: boolean
}

export const MODELS: readonly ModelInfo[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Default', effort: 'medium', fallback: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Faster', effort: 'medium', fallback: true },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    note: 'Fastest',
    effort: null,
    fallback: false,
  },
]

export const DEFAULT_MODEL: ModelId = 'claude-opus-5-5'

export const isModelId = (v: unknown): v is ModelId => MODELS.some((m) => m.id === v)

/** The model's details; the default model's for an unknown id. */
export const modelById = (id: string | null | undefined): ModelInfo =>
  MODELS.find((m) => m.id === id) ?? (MODELS[0] as ModelInfo)

/** Where the model choice is kept in this browser (not a secret; the API key is kept apart, see keys.ts). */
export const MODEL_STORAGE_KEY = 'census:ask-model'

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The model picked in Settings, or the default. Never throws. */
export function readModelChoice(store: Storage | null = local()): ModelId {
  try {
    const v = store?.getItem(MODEL_STORAGE_KEY)
    return isModelId(v) ? v : DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
}

/** Keep the model choice; false when the browser would not store it. */
export function saveModelChoice(id: ModelId, store: Storage | null = local()): boolean {
  try {
    if (!store) return false
    if (id === DEFAULT_MODEL) store.removeItem(MODEL_STORAGE_KEY)
    else store.setItem(MODEL_STORAGE_KEY, id)
    return true
  } catch {
    return false
  }
}
