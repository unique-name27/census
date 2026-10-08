/**
 * The Security center's policy layer (docs/SECURITY-CENTER.md): override lines on the role tables,
 * the guard rails, the policy file (`access-policy.json`) and its loader, the draft and the
 * preview. The Developer page's Security center tab (`src/dev/security`) is the editor; the policy
 * (`src/access/policy`) lays what is in force over every decision through `setPolicyOverrides`.
 *
 *   PolicyLine   { role, surface, decision, reason, by, at, how? }; `role:offered` and `role:home`
 *                are role settings (offered in the Mode menu; the view the role opens on)
 *   overridesOf(lines)            the policy's overrides for a list of lines
 *   screenLines(raw, catalog)     lines that apply, and each one left out with why
 *   guardRailFor(line, env)       the guard rail a line crosses, or null (`GUARD_RAILS` sentences)
 *   buildPolicyFile, policyFileText, readPolicyFile, checksumOf   the file
 *   loadInForce(env)              what the site's (or the one-file build's embedded) file puts in force
 *   policyStore, setInForce, startPreview, endPreview, resumePreview   what this tab lays over Census
 *   Draft, setInDraft, resetRoleInDraft, undoInDraft, draftChanges, inForceChanges, loadDraft,
 *   saveDraft (`census:access-draft`)
 *
 * Pure but for the store and the storage helpers, which take their storage. No React.
 */
export * from './draft'
export * from './file'
export * from './guards'
export * from './lines'
export * from './load'
export * from './overlay'
export * from './state'
export * from './types'
