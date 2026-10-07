/**
 * The app as Ask drives it from the panel: the live app (`liveAskApp`), except for records Ask
 * opens while an answer is still coming and focus is in the panel. The records panel is a modal
 * that takes focus, and the person may be drafting the next question, so those records open once
 * the answer has finished instead of pulling focus out of the question box mid-answer. A new chat
 * (or a mode change, which starts one) before then drops them.
 */
import { type AskApp, liveAskApp } from '@/ask/engine'
import type { DrillSpec } from '@/drill/types'
import { focusInPanel } from './panelFocus'
import { useAsk } from './store'

let waiting: (() => void) | null = null

/** Open the records when the answer in progress has finished, in the same chat. */
function openWhenAnswered(spec: DrillSpec): void {
  waiting?.()
  const chat = useAsk.getState().chat
  const stop = useAsk.subscribe((s) => {
    if (s.busy && s.chat === chat) return
    stop()
    if (waiting === stop) waiting = null
    if (s.chat === chat) liveAskApp.openRecords(spec)
  })
  waiting = stop
}

export const panelAskApp: AskApp = {
  ...liveAskApp,
  openRecords(spec) {
    if (useAsk.getState().busy && focusInPanel()) openWhenAnswered(spec)
    else liveAskApp.openRecords(spec)
  },
}

/** For tests: forget records waiting for an answer to finish. */
export function resetPanelAppForTests(): void {
  waiting?.()
  waiting = null
}
