/**
 * One question and its answer. The question is a quiet heading as it was typed; the answer is a
 * document under it. While it is answered, plain progress lines say what Census is calculating.
 * Afterwards: Copy answer (names included, since the copy stays on this computer), What was sent,
 * and any error in plain words with where to fix it.
 */
import { useState } from 'react'
import {
  answerText,
  type Conversation,
  MAX_TOOL_ROUNDS,
  parseAnswer,
  type ToolCallRecord,
  type ToolEnv,
} from '@/ask/engine'
import { IconCheck, IconChevronDown, IconCopy } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button, cx, SeverityIcon } from '@/components/ui'
import { openSettings } from '@/data/store'
import { Answer } from './Answer'
import { IconWorking } from './icons'
import { errorFacts, exportScope, statusLine, type Turn, withNames, withoutPartial } from './model'
import { askQuestion } from './session'
import { closeAsk } from './store'

/**
 * Ask the question again. Focus moves to the question box first: the button is disabled (or
 * gone) once the new answer starts, and focus must not be left on it.
 */
function askAgain(turn: Turn, env: () => ToolEnv) {
  document.querySelector<HTMLElement>('[data-ask-start]')?.focus({ preventScroll: true })
  void askQuestion(turn.question, env())
}

import { WhatWasSent } from './WhatWasSent'

function Progress({ turn, conversation }: { turn: Turn; conversation: Conversation }) {
  const person = (t: string) => conversation.person(t)
  const line = statusLine(turn, person)
  const done = turn.steps.filter((s) => s.done)
  return (
    <ul className="flex flex-col gap-1 text-[13px]">
      {done.map((s) => (
        <li key={s.id} className="flex items-start gap-2 text-muted">
          <IconCheck className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">{withNames(s.label, person)}</span>
        </li>
      ))}
      {line && (
        <li className="flex items-start gap-2 text-ink-2">
          <IconWorking className="mt-0.5 size-3.5 shrink-0 motion-safe:animate-spin [:root[data-motion=reduce]_&]:animate-none" />
          <span className="min-w-0">{line}</span>
        </li>
      )}
    </ul>
  )
}

function ErrorNote({ turn, env, busy }: { turn: Turn; env: () => ToolEnv; busy: boolean }) {
  const e = turn.error
  if (!e) return null
  if (e.kind === 'stopped')
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
        <span>
          {turn.text ? 'Stopped. The answer above is incomplete.' : 'Stopped before Claude answered.'}
        </span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => askAgain(turn, env)}>
          Ask again
        </Button>
      </div>
    )
  return (
    <div className="flex items-start gap-2.5 rounded-sheet bg-sheet px-3.5 py-3">
      <SeverityIcon
        severity={e.kind === 'declined' || e.kind === 'too_long' ? 'warning' : 'critical'}
        className="mt-0.5 size-4 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">{e.title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{e.detail}</p>
        {errorFacts(e) && (
          <p className="mt-1.5 text-[12px] leading-snug break-words text-muted select-text">
            {errorFacts(e)}
          </p>
        )}
        {e.action && (
          <div className="mt-2">
            {e.action === 'settings' ? (
              <Button
                size="sm"
                onClick={() => {
                  closeAsk()
                  openSettings('ask')
                }}
              >
                Open Settings, Ask Census
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => askAgain(turn, env)}>
                Ask again
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function TurnView({
  turn,
  turnNo,
  earlier,
  conversation,
  env,
  busy,
}: {
  turn: Turn
  /** Its place in the chat (1-based). */
  turnNo: number
  /** The tool calls of the answers before it in this chat. */
  earlier: () => readonly ToolCallRecord[]
  conversation: Conversation
  /** The tool context for asking again. */
  env: () => ToolEnv
  busy: boolean
}) {
  const [sentOpen, setSentOpen] = useState(false)
  const answering = turn.status === 'answering'
  // An answer still arriving, stopped or cut off may end in half a link: leave that out.
  const shown = turn.status === 'done' && !turn.truncated ? turn.text : withoutPartial(turn.text)
  const person = (t: string) => conversation.person(t)
  const copy = async () => {
    const text = answerText(parseAnswer(shown), person)
    try {
      const m = await import('@/lib/export')
      await m.writeClipboard(text)
      toast('Answer copied', { tone: 'good', description: 'Names are included. Paste it where you need it.' })
    } catch {
      toast('The browser blocked copying.', { tone: 'critical' })
    }
  }
  const sentId = `ask-sent-${turn.id}`
  return (
    <article
      data-turn={turn.id}
      aria-labelledby={`ask-q-${turn.id}`}
      aria-busy={answering || undefined}
      // The newest turn is at least as tall as the sheet's body, so a new question can scroll up
      // to the top and its answer grows in view below it (the body is a size container).
      className="flex flex-col gap-3 border-t border-rule px-5 pt-5 pb-6 first:border-t-0 last:min-h-[calc(100cqh+8px)]"
    >
      <h3
        id={`ask-q-${turn.id}`}
        className="cut-head text-[17px] leading-snug font-semibold whitespace-pre-wrap break-words text-ink"
      >
        {turn.question}
      </h3>
      {answering && <Progress turn={turn} conversation={conversation} />}
      {shown.trim() && (
        <Answer
          text={shown}
          conversation={conversation}
          question={turn.question}
          turnNo={turnNo}
          exportScope={() =>
            turn.asked ? exportScope(turn.asked, turn.calls, earlier(), (t) => conversation.person(t)) : null
          }
        />
      )}
      {turn.truncated && turn.status === 'done' && (
        <p className="text-[12px] text-muted">
          The answer stopped at its length limit. Ask for a shorter answer, or split the question in two.
        </p>
      )}
      {turn.roundLimited && turn.status === 'done' && (
        <p className="text-[12px] text-muted">
          Census allows {MAX_TOOL_ROUNDS} rounds of calculations per question, so this answer uses what Claude
          had by then.
        </p>
      )}
      <ErrorNote turn={turn} env={env} busy={busy} />
      {!answering && turn.sent != null && (
        <div className="flex flex-col gap-2">
          <div className="-ml-2 flex flex-wrap items-center gap-1">
            {shown.trim() && (
              <Button size="sm" variant="ghost" icon={<IconCopy />} onClick={() => void copy()}>
                Copy answer
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={sentOpen}
              aria-controls={sentId}
              onClick={() => setSentOpen(!sentOpen)}
            >
              What was sent
              <IconChevronDown className={cx('text-muted transition-transform', sentOpen && 'rotate-180')} />
            </Button>
          </div>
          <div id={sentId} hidden={!sentOpen}>
            {sentOpen && <WhatWasSent turn={turn} conversation={conversation} />}
          </div>
        </div>
      )}
    </article>
  )
}
