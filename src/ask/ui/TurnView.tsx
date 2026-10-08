/**
 * One question and its answer. The question is a quiet heading as it was typed; the answer is a
 * document under it. While it is answered, plain progress lines say what Census is calculating.
 * What Ask changed on the screen shows as action lines with Undo (docs/ASK-ACTIONS.md, part 3),
 * and a chart Ask drew sits in the answer where it was drawn (part 4). Afterwards: Copy answer
 * (names included, since the copy stays on this computer), What was sent, and any error in plain
 * words with where to fix it.
 */
import { Fragment, useState } from 'react'
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
import { ActionLines } from './ActionLines'
import { Answer } from './Answer'
import { AskChartFigure } from './AskChartFigure'
import { actionCallIds, answerParts, chartsOf } from './answerParts'
import { IconWorking } from './icons'
import {
  errorFacts,
  exportScope,
  settingsFieldFor,
  statusLine,
  type Turn,
  withNames,
  withoutPartial,
} from './model'
import { askQuestion } from './session'
import { useAsk } from './store'

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
  // An action's own line says what it changed, with Undo: its progress line would repeat it.
  const acted = actionCallIds(turn.calls)
  const done = turn.steps.filter((s) => s.done && !acted.has(s.id))
  return (
    <ul className="flex flex-col gap-1 text-small">
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">
        <span>
          {turn.text ? 'Stopped. The answer above is incomplete.' : 'Stopped before Claude answered.'}
        </span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => askAgain(turn, env)}>
          Ask again
        </Button>
      </div>
    )
  return (
    <div className="flex items-start gap-2.5 border-y border-rule py-3">
      <SeverityIcon
        severity={e.kind === 'declined' || e.kind === 'too_long' ? 'warning' : 'critical'}
        className="mt-0.5 size-4 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-small font-semibold text-ink">{e.title}</p>
        <p className="mt-0.5 text-small leading-snug text-ink-2">{e.detail}</p>
        {errorFacts(e) && (
          <p className="mt-1.5 text-meta leading-snug break-words text-muted select-text">{errorFacts(e)}</p>
        )}
        {e.action && (
          <div className="mt-2">
            {e.action === 'settings' ? (
              <Button
                size="sm"
                onClick={() => {
                  // Settings opens above the panel. A workspace error lands on the Workspace ID
                  // field, a passcode error on the Team passcode field, where the fix is.
                  openSettings('ask', settingsFieldFor(e))
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
  const chat = useAsk((s) => s.chat)
  const answering = turn.status === 'answering'
  // An answer still arriving, stopped or cut off may end in half a link: leave that out.
  const shown = turn.status === 'done' && !turn.truncated ? turn.text : withoutPartial(turn.text)
  const person = (t: string) => conversation.person(t)
  // The answer in pieces: text, and the charts Ask drew where they were drawn.
  const parts = answerParts(
    shown,
    chartsOf(turn.calls, turn.steps),
    (t) => parseAnswer(t).filter((b) => b.type === 'table').length,
  )
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
        className="cut-head text-title leading-snug font-semibold whitespace-pre-wrap break-words text-ink"
      >
        {turn.question}
      </h3>
      <ActionLines calls={turn.calls} conversation={conversation} />
      {answering && <Progress turn={turn} conversation={conversation} />}
      {parts.map((p, i) =>
        p.kind === 'text' ? (
          <Answer
            key={`t${i}`}
            text={p.text}
            conversation={conversation}
            question={turn.question}
            turnNo={turnNo}
            tablesBefore={p.tablesBefore}
            exportScope={() =>
              turn.asked
                ? exportScope(turn.asked, turn.calls, earlier(), (t) => conversation.person(t))
                : null
            }
          />
        ) : (
          <Fragment key={`c${i}`}>
            {p.charts.map((c) => (
              <AskChartFigure
                key={c.id}
                chart={c}
                conversation={conversation}
                question={turn.question}
                pinKey={`${chat}:${c.id}`}
              />
            ))}
          </Fragment>
        ),
      )}
      {turn.truncated && turn.status === 'done' && (
        <p className="text-meta text-muted">
          The answer stopped at its length limit. Ask for a shorter answer, or split the question in two.
        </p>
      )}
      {turn.roundLimited && turn.status === 'done' && (
        <p className="text-meta text-muted">
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
