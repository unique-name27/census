/**
 * "What was sent" under an answer: the question as it went to Claude (people as tokens), each
 * tool call with the exact result that went back, and the tokens used. This is how anyone can
 * check that no name, ID or pay amount left the browser.
 */
import type { Conversation } from '@/ask/engine'
import { plural } from '@/lib/format'
import { sentCalls, type Turn, usageLine } from './model'

const PRE =
  'mt-1 max-h-72 overflow-auto rounded-control bg-sheet-2 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-ink'

export function WhatWasSent({ turn, conversation }: { turn: Turn; conversation: Conversation }) {
  const calls = sentCalls(turn.calls, (t) => conversation.person(t))
  return (
    <div className="flex flex-col gap-4 rounded-sheet bg-sheet px-4 py-3.5 text-[13px] text-ink-2">
      <section>
        <h4 className="eyebrow">Your question, as sent</h4>
        {turn.sent ? <pre className={PRE}>{turn.sent}</pre> : <p className="mt-1">Nothing was sent.</p>}
      </section>
      <section>
        <h4 className="eyebrow">
          {calls.length ? `${plural(calls.length, 'tool result')} sent` : 'Tool results sent'}
        </h4>
        {calls.length ? (
          <ol className="mt-1 flex flex-col divide-y divide-rule">
            {calls.map((c, i) => (
              <li key={c.id} className="py-1.5">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-baseline gap-2 rounded-control px-1 py-1 hover:bg-hover [&::-webkit-details-marker]:hidden">
                    <span className="tnum w-5 shrink-0 text-[12px] text-muted">{i + 1}.</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-ink">{c.label}</span>
                      <span className="block text-[12px] text-muted">
                        <code className="font-mono text-[11px]">{c.name}</code> · {c.size} · {c.ms}
                        {c.isError ? ' · returned an error' : ''}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-[12px] font-medium text-link group-open:hidden"
                    >
                      Show
                    </span>
                    <span
                      aria-hidden="true"
                      className="hidden shrink-0 text-[12px] font-medium text-link group-open:inline"
                    >
                      Hide
                    </span>
                  </summary>
                  <div className="mt-1 pl-7">
                    <p className="text-[12px] text-muted">What Claude asked for</p>
                    <pre className={PRE}>{c.input}</pre>
                    <p className="mt-2 text-[12px] text-muted">What Census sent back</p>
                    <pre className={PRE}>{c.result}</pre>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1">No tool ran for this answer.</p>
        )}
      </section>
      <section>
        <h4 className="eyebrow">Tokens</h4>
        <p className="mt-1">{usageLine(turn.usage, turn.model, turn.error)}</p>
      </section>
      <p className="text-[12px] leading-snug text-muted">
        Every request also carries Census's instructions for Claude and the tool definitions, which hold no
        data, and the earlier questions, answers and results of this chat, as listed under each one. People go
        as tokens such as {'{{P12}}'}; only this browser knows who they are.
      </p>
    </div>
  )
}
