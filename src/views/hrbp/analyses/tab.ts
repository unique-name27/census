/**
 * Addresses inside People stats > Special analyses (docs/ANALYSES.md, 1.1), carried in the route's
 * tab with the colon form the Data room and the Developer page use:
 *
 *   #hrbp.analyses            the first analysis that is ready (the address then names it)
 *   #hrbp.analyses:quality    Quality of hire
 *   #hrbp.analyses:declines   Offer declines
 *   #hrbp.analyses:stages     Engineering by stage
 *   #hrbp.analyses:pyramid    Level pyramid
 *
 * Tiny and pure, so Help's link checks, Ask and the shell can read it without loading the tab.
 */

export const ANALYSES_TAB = 'analyses'

/** The four analyses in picker order. */
export const ANALYSIS_KEYS = ['quality', 'declines', 'stages', 'pyramid'] as const
export type AnalysisKey = (typeof ANALYSIS_KEYS)[number]

/** Each analysis's picker label (the definitions' `label`; the registry test keeps them equal). */
export const ANALYSIS_LABEL: Readonly<Record<AnalysisKey, string>> = {
  quality: 'Quality of hire',
  declines: 'Offer declines',
  stages: 'Engineering by stage',
  pyramid: 'Level pyramid',
}

export const isAnalysisKey = (s: unknown): s is AnalysisKey =>
  typeof s === 'string' && (ANALYSIS_KEYS as readonly string[]).includes(s)

export interface AnalysesRoute {
  /** True when the route is the Special analyses tab at all. */
  onTab: boolean
  /** The analysis the address names; null for the bare address or an unknown key. */
  key: AnalysisKey | null
}

/** Read a People stats route tab. An unknown key reads as the bare address. */
export function parseAnalysesTab(tab: string | null | undefined): AnalysesRoute {
  const t = (tab ?? '').trim()
  const colon = t.indexOf(':')
  const head = colon < 0 ? t : t.slice(0, colon)
  if (head !== ANALYSES_TAB) return { onTab: false, key: null }
  const sub = colon < 0 ? '' : t.slice(colon + 1)
  return { onTab: true, key: isAnalysisKey(sub) ? sub : null }
}

/** The route tab for an analysis: "analyses:quality"; "analyses" for none. */
export const analysesTab = (key?: AnalysisKey | null): string =>
  key ? `${ANALYSES_TAB}:${key}` : ANALYSES_TAB

/** The access surface of one analysis (docs/ROLES.md): `tab:hrbp.analyses:quality`. */
export const analysisSurface = (key: AnalysisKey): string => `tab:hrbp.${analysesTab(key)}`

/**
 * The analysis a bare (or unknown) address opens: the first shown one that is ready, else the
 * first shown one; null when the mode shows none.
 */
export function defaultAnalysis(
  shown: readonly AnalysisKey[],
  ready: (key: AnalysisKey) => boolean,
): AnalysisKey | null {
  return shown.find(ready) ?? shown[0] ?? null
}
