/**
 * One Ask conversation: its person tokens, its record refs and the messages sent to Claude so far.
 * It lives in memory for the browser session only (never written to storage); New chat makes a
 * new one.
 *
 * The history is append-only: a question's messages are added only when its answer completes, so
 * a stopped or failed answer leaves the history as it was and the next question still continues a
 * valid conversation (and keeps the prompt cache and Claude's earlier reasoning valid).
 */
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { DrillSource } from '@/drill/Drill'
import { ReleaseAudit } from './audit'
import { TokenMap, type TokenSource } from './privacy'
import { RefRegistry } from './refs'
import type { PriorResult } from './screenTools'
import { NO_USAGE, type PersonInfo, type Usage } from './types'

export class Conversation {
  readonly tokens = new TokenMap()
  readonly refs = new RefRegistry()
  /** What was released to Claude that a small group must not be read from by subtraction. */
  readonly audit = new ReleaseAudit()
  /** Exactly what was sent to Claude (tokenized), oldest first. */
  readonly history: BetaMessageParam[] = []
  /** Tokens used over the whole conversation. */
  usage: Usage = { ...NO_USAGE }
  /**
   * Earlier tool results by tool_use id (answers that completed), so make_chart can draw one:
   * the exact text Claude saw, with its refs.
   */
  readonly results = new Map<string, PriorResult>()
  private charts = 0

  /** A fresh chart id for this conversation ('ask-chart-3'), the drawn Figure's id. */
  chartId(): string {
    return `ask-chart-${++this.charts}`
  }

  /** Who a token stands for (`'P12'` or `'{{P12}}'`); null for one this conversation never handed out. */
  person(token: string): PersonInfo | null {
    return this.tokens.resolve(token)
  }

  /** The records behind a ref (`'r7'`); undefined for a ref this conversation never handed out. */
  records(ref: string): DrillSource | undefined {
    return this.refs.resolve(ref)
  }

  hasRef(ref: string): boolean {
    return this.refs.has(ref)
  }

  /** Text with known names, person IDs, emails and money amounts replaced, as it would be sent. */
  tokenize(text: string, ctx: TokenSource): string {
    this.tokens.index(ctx)
    return this.tokens.scan(text)
  }

  /** Questions answered so far. */
  get turns(): number {
    return this.history.filter((m) => m.role === 'user' && typeof m.content === 'string').length
  }
}

export const createConversation = (): Conversation => new Conversation()
