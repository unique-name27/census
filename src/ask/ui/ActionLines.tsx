/**
 * What Ask changed on the screen while answering (docs/ASK-ACTIONS.md, part 3), one line per
 * action, in the order they ran: "Filtered to Bengaluru, last 6 months", "Opened People stats,
 * Attrition". Each line offers Undo, which puts back only what that action changed (Back while its
 * history entry is still the one on screen); a line that pointed at a chart offers Show again, and
 * one that opened records offers Open again (closing the records panel is its undo).
 * Undone lines say so, and so do lines the person stepped Back past. An action whose change a later
 * action changed again offers Undo once that later one is undone, so Undo never brings back a
 * change already undone.
 */
import { useRef, useSyncExternalStore } from 'react'
import { type Conversation, liveAskApp, type ToolCallRecord, undoAction } from '@/ask/engine'
import { toast } from '@/components/toast'
import { Button } from '@/components/ui'
import { currentEntry, lensOn } from '@/data/address'
import { useCensus } from '@/data/store'
import { useSavedViews } from '@/data/viewsStore'
import { actionLines, actionsOf } from './answerParts'
import { IconAction, IconUndo } from './icons'
import { withNames } from './model'
import { pointAt } from './pointer'
import { useAsk } from './store'
import { useDock } from './useDock'

/** Back, Forward, or a change the address writer has just written (it writes after the store). */
function subscribeEntry(onChange: () => void): () => void {
  let live = true
  const later = () => queueMicrotask(() => live && onChange())
  window.addEventListener('popstate', later)
  const off = useCensus.subscribe(later)
  return () => {
    live = false
    window.removeEventListener('popstate', later)
    off()
  }
}

/** The history entry on screen, kept current. */
const useHistoryEntry = (): number | null => useSyncExternalStore(subscribeEntry, currentEntry, () => null)

export function ActionLines({
  calls,
  conversation,
}: {
  calls: readonly ToolCallRecord[]
  conversation: Conversation
}) {
  const undone = useAsk((s) => s.undone)
  const turns = useAsk((s) => s.turns)
  const markUndone = useAsk((s) => s.markUndone)
  const entry = useHistoryEntry()
  // The screen now, so a line whose changes were all changed again since says so.
  const filters = useCensus((s) => s.filters)
  const route = useCensus((s) => s.route)
  const standard = useCensus((s) => s.dataStandard)
  const savedViewId = useSavedViews((s) => s.appliedId)
  const now = { filters, route, standard, savedViewId, lens: lensOn() }
  const dock = useDock()
  const doneRefs = useRef(new Map<string, HTMLElement | null>())
  const lines = actionLines(calls, undone, { all: actionsOf(turns), entry, now })
  if (!lines.length) return null
  const person = (t: string) => conversation.person(t)
  return (
    <ul aria-label="What Ask changed on the screen" className="flex flex-col border-y border-rule">
      {lines.map(({ action, undone: isUndone, canUndo, changedSince }) => {
        const text = withNames(action.line, person)
        return (
          <li
            key={action.id}
            className="flex min-h-9 items-center gap-2 border-t border-rule py-1 text-small first:border-t-0"
          >
            <IconAction className="size-3.5 shrink-0 text-muted" />
            <span
              className={isUndone ? 'min-w-0 flex-1 text-muted line-through' : 'min-w-0 flex-1 text-ink-2'}
            >
              {text}
            </span>
            {isUndone ? (
              <span
                ref={(el) => {
                  doneRefs.current.set(action.id, el)
                }}
                tabIndex={-1}
                className="shrink-0 rounded-mark text-meta text-muted"
              >
                Undone
              </span>
            ) : changedSince ? (
              <span
                className="shrink-0 text-meta text-muted"
                title="Changed since, so there is nothing to undo"
              >
                Changed since<span className="sr-only">, so there is nothing to undo</span>
              </span>
            ) : canUndo ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconUndo />}
                aria-label={`Undo: ${text}`}
                className="-my-1 shrink-0"
                onClick={() => {
                  if (!undoAction(liveAskApp, action)) return
                  markUndone(action.id)
                  // The button goes: focus moves to the word that replaces it.
                  window.setTimeout(() => doneRefs.current.get(action.id)?.focus({ preventScroll: true }), 0)
                }}
              >
                Undo
              </Button>
            ) : action.figure ? (
              <Button
                size="sm"
                variant="ghost"
                className="-my-1 shrink-0"
                aria-label={`Show again: ${text}`}
                onClick={() => {
                  const f = action.figure
                  if (!f) return
                  const reserve = dock.kind === 'sheet' ? dock.bottom : 0
                  if (!pointAt(f.id, f.table, reserve))
                    toast('That chart is not on this page now', {
                      description: 'Open the tab it is on, or ask again.',
                    })
                }}
              >
                Show again
              </Button>
            ) : action.records ? (
              <Button
                size="sm"
                variant="ghost"
                className="-my-1 shrink-0"
                aria-label={`Open again: ${text}`}
                onClick={() => {
                  if (action.records) liveAskApp.openRecords(action.records)
                }}
              >
                Open again
              </Button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
