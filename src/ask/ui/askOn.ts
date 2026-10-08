/**
 * Ask on or off in the mode on screen (docs/SECURITY-CENTER.md, "Ask: on or off"). Hidden means
 * not rendered and nothing sent: the masthead leaves out its Ask button (and Alt+A with it) and
 * the phone menu's item, the shell leaves out the panel (`AskGate`), the screen bridge connects
 * nothing, and the store refuses to open the panel or ask (`setAskAllowed`).
 */
import { S } from '@/access/surfaces'
import { useAnalytics } from '@/data/context'

export function useAskOn(): boolean {
  return useAnalytics().access.can(S.ask())
}
