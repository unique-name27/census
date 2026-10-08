/**
 * The Security center's fixed wording (docs/SECURITY-CENTER.md). The banner is word for word the
 * user's; a test keeps it so. The name "Security center" is the user's too: the modes copy rule
 * (docs/ROLES.md 1.6, modes are a view, not security) holds everywhere else, and the banned-words
 * test exempts this page and its help article (`BANNED_WORDS_EXEMPT`).
 */

export const SECURITY_CENTER = 'Security center'

export const SECURITY_BANNER =
  "Census runs in the browser with no sign-in. These rules decide what each role sees and can do in Census. Anyone can still switch roles, and data already on a computer can be read with the browser's own tools. Keep sensitive data off computers that should not have it."

/** Where the banned mode words may appear: this page's files and its help article. */
export const BANNED_WORDS_EXEMPT = {
  /** Source folders, relative to src/. */
  folders: ['dev/security/', 'access/overrides/'],
  /** Help article ids. */
  articles: ['security-center'],
} as const

/** The preview bar, in the role's mode: "Previewing Finance." */
export const previewingText = (role: string): string => `Previewing ${role}.`
export const BACK_TO_SECURITY = 'Back to the Security center'
export const PREVIEW_DETAIL = 'The draft is laid over this tab only. Nothing is in force for anyone else.'

/** The Developer-mode warning when the site's policy file was ignored. */
export const IGNORED_TITLE = 'Census ignored the policy file on this site'
