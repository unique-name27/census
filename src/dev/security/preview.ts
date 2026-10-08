/**
 * Preview as role (docs/SECURITY-CENTER.md): lay the draft over this tab, switch to the role (its
 * pick dialog opens where it needs one and has none), and come back to the Security center with
 * the draft as it was. The policy in force and the draft are never changed by a preview.
 */
import { homeOf } from '@/access/modes'
import { endPreview, type PolicyLine, type PolicyRole, policyStore, startPreview } from '@/access/overrides'
import { useMode } from '@/access/store'
import { useCensus } from '@/data/store'
import { devTab } from '../tabs'

/** Start previewing a role with the draft's lines. `returnTo` is the Security center's sub-address. */
export function previewAs(role: PolicyRole, lines: readonly PolicyLine[], returnTo: string): void {
  const from = useMode.getState().mode
  startPreview({ role, lines: [...lines], from, returnTo, startedAt: new Date().toISOString() })
  useMode.getState().setMode(role)
  // With its pick, the role is entered now: open its home. Without, its pick dialog is open and
  // the preview ends if it is dismissed (`PreviewBar`).
  if (useMode.getState().mode === role) {
    const home = homeOf(role)
    useCensus.getState().navigate(home.view, home.tab, { history: 'push' })
  }
}

/** End the preview: the policy in force again, Developer mode, and the Security center where it was. */
export function backToSecurityCenter(): void {
  const p = endPreview()
  useMode.getState().setMode('developer')
  useCensus.getState().navigate('dev', devTab('security', p?.returnTo ?? ''), { history: 'push' })
}

/**
 * A preview whose role was never entered (its pick dialog dismissed), or left for Developer mode
 * from the Mode menu, ends quietly.
 */
export function endIdlePreview(mode: string, picking: string | null): boolean {
  const p = policyStore.getState().preview
  if (!p || picking || mode !== 'developer') return false
  endPreview()
  return true
}
