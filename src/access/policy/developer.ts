/**
 * Developer-only surfaces (docs/ROLES.md, 5; docs/ROLES-V2.md 8.1): Developer mode shows them,
 * every other mode hides them, and no policy override can show them elsewhere (docs/SECURITY-CENTER.md,
 * guard rails). Pure data.
 */

export const DEV_ONLY = 'Developer mode only.'

/** Surfaces every mode but Developer hides. */
export const DEVELOPER_ONLY: readonly string[] = [
  'page:dev',
  'masthead:dev',
  'shortcut:dev-overlays',
  'ask:console',
  'export:drill-spec',
  'ui:error-details',
  'view:team',
  'header:team',
  'help:article:view-team',
  'help:article:developer-tools',
  'help:tour:view-team',
  'help:tour:manager-start',
  'help:tour:developer-tools',
]

/**
 * Whole kinds of developer surfaces: every debug overlay, the team view's tabs and figures (My team
 * is Manager mode's home; HR mode does not show it), the Developer page's tabs and figures.
 */
export const DEVELOPER_ONLY_PREFIXES: readonly string[] = [
  'overlay:',
  'tab:team.',
  'figure:team-',
  'tab:dev.',
  'figure:dev-',
]

const DEV_SET = new Set(DEVELOPER_ONLY)

export const isDeveloperOnly = (s: string): boolean =>
  DEV_SET.has(s) || DEVELOPER_ONLY_PREFIXES.some((p) => s.startsWith(p))

/** Pages only Developer mode shows; a surface placed on one is hidden in HR. */
export const DEV_PAGES: ReadonlySet<string> = new Set(['team', 'dev'])

/**
 * Surfaces that stay Developer-only whatever an override says (docs/SECURITY-CENTER.md): the
 * Developer page and its tabs, the debug overlays and the Ask tools console. My team is not one:
 * Manager mode shows it.
 */
export const isGuardedDeveloperSurface = (s: string): boolean =>
  s === 'page:dev' ||
  s === 'masthead:dev' ||
  s === 'shortcut:dev-overlays' ||
  s === 'ask:console' ||
  s === 'ui:error-details' ||
  s === 'export:drill-spec' ||
  s.startsWith('overlay:') ||
  s.startsWith('tab:dev.') ||
  s.startsWith('figure:dev-')
