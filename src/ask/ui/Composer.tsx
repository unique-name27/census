/**
 * The question box at the foot of the Ask sheet: several lines, Enter asks, Shift+Enter starts a
 * new line. While an answer comes the next question can be drafted but not sent, and the button
 * becomes Stop. Stop hands focus to the box before the button turns back into Ask (disabled while
 * the box is empty), so focus is never left on a disabled control.
 */
import { type FormEvent, type RefObject, useLayoutEffect } from 'react'
import { modelById, readModelChoice } from '@/ask/engine'
import { IconArrowUp } from '@/components/icons'
import { Button } from '@/components/ui'
import { IconStop } from './icons'
import { composerKey } from './model'
import { stopAnswer } from './session'
import { useAsk } from './store'

/** The model picked in Settings; `version` changes when it is saved, so it is read again. */
const modelNow = (_version: number) => modelById(readModelChoice())

/** Tallest the box grows before it scrolls, in px. */
const MAX_HEIGHT = 168

export function Composer({
  onAsk,
  inputRef: box,
}: {
  onAsk: (q: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
}) {
  const draft = useAsk((s) => s.draft)
  const setDraft = useAsk((s) => s.setDraft)
  const busy = useAsk((s) => s.busy)
  // Read again when the model is changed in Settings.
  const version = useAsk((s) => s.keyVersion)
  const model = modelNow(version)

  // Grow with the text, up to MAX_HEIGHT.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the draft
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [draft])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (busy || !draft.trim()) return
    onAsk(draft)
  }
  const stop = () => {
    box.current?.focus({ preventScroll: true })
    stopAnswer()
  }
  const hintId = 'ask-composer-hint'
  return (
    <form onSubmit={submit} className="border-t border-rule bg-page px-5 pt-3 pb-3">
      <div className="flex items-end gap-2 rounded-control bg-sheet p-1.5 pl-3 shadow-[inset_0_0_0_1px_var(--rule-strong)] focus-within:shadow-[inset_0_0_0_2px_var(--focus)]">
        <label htmlFor="ask-composer" className="sr-only">
          Ask a question
        </label>
        <textarea
          id="ask-composer"
          data-ask-start
          ref={box}
          rows={1}
          value={draft}
          aria-describedby={hintId}
          enterKeyHint="send"
          placeholder={busy ? 'Answering…' : 'Ask about your people data'}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (composerKey(e.nativeEvent) !== 'send') return
            e.preventDefault()
            submit()
          }}
          className="min-h-7 flex-1 resize-none bg-transparent py-1 text-[14px] leading-snug text-ink outline-none placeholder:text-muted"
          style={{ maxHeight: MAX_HEIGHT }}
        />
        {/* Separate keys: Stop and Ask are different buttons, never one reused element. */}
        {busy ? (
          <Button key="stop" type="button" size="sm" icon={<IconStop />} onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button
            key="ask"
            type="submit"
            size="sm"
            variant="primary"
            icon={<IconArrowUp />}
            disabled={!draft.trim()}
          >
            Ask
          </Button>
        )}
      </div>
      <p id={hintId} className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
        {/* Touch keyboards have no Shift+Enter: their Enter key reads Send. */}
        <span className="hidden [@media(pointer:fine)]:inline">Enter to ask, Shift+Enter for a new line</span>
        <span>{model.label}</span>
      </p>
    </form>
  )
}
