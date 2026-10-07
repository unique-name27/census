/**
 * The answer being written, so Stop, New chat and a change of mode can stop it. One at a time: a
 * question waits while another answer is coming. A mode change must stop it (docs/ROLES.md, 1.5):
 * the answer was asked with the old mode's context, so it would go on sending numbers the new mode
 * hides and changing the screen with no action line or Undo once the chat is cleared.
 */
let controller: AbortController | null = null

/** Start tracking a new answer; returns its controller. */
export function beginAnswer(): AbortController {
  controller?.abort()
  controller = new AbortController()
  return controller
}

/** The answer finished (or failed): stop tracking it, if it is still the one in flight. */
export function endAnswer(c: AbortController): void {
  if (controller === c) controller = null
}

/** Stop: abort the answer in flight; it finishes as stopped and is cleaned up as usual. */
export function stopAnswer(): void {
  controller?.abort()
}

/** New chat or a mode change: abort the answer in flight and forget it. */
export function abortAnswer(): void {
  controller?.abort()
  controller = null
}

/** For tests: the answer in flight. */
export const answerInFlight = (): AbortController | null => controller
