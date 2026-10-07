/**
 * Shapes shared across Ask Census's engine (docs/ASK.md). Pure types; the UI imports them from
 * `./index.ts` only.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Marks } from '@/views/actions/engine/marks'
import type { ViewDef } from '@/views/types'
import type { AskAction, AskApp } from './app'
import type { AskChart } from './chart'

/** The tools that compute numbers. Names and JSON schemas are in `tools.ts`. */
export type ToolName =
  | 'get_context'
  | 'find_metrics'
  | 'view_summary'
  | 'compare_groups'
  | 'query_records'
  | 'explain_quality'
  | 'open_items'

/** The tools that read and drive the screen and draw charts (docs/ASK-ACTIONS.md); in `screenTools.ts`. */
export type ScreenToolName =
  | 'get_screen'
  | 'set_filters'
  | 'reset_filters'
  | 'open_view'
  | 'show_figure'
  | 'open_records'
  | 'apply_saved_view'
  | 'make_chart'

/** Every tool Claude can call. */
export type AnyToolName = ToolName | ScreenToolName

/** What the tools read: the app's live state when the question was asked. */
export interface ToolEnv {
  /**
   * The app's live analytics context (`useAnalytics()`): the user's filters, period, data
   * standard and metric dictionary. Tools use a copy with pay amounts and immigration details
   * switched off, whatever the session switches say.
   */
  ctx: AnalyticsContext
  /** The view registry (`VIEWS` from '@/views/registry'); injected so the engine never imports React views. */
  views: readonly ViewDef[]
  /** Action center marks (handled and snoozed items), so `open_items` counts what the Action center lists. */
  marks?: Marks
  /** Now, in ms since the epoch (for snoozes that end). Defaults to `Date.now()`. */
  now?: number
  /**
   * The screen (docs/ASK-ACTIONS.md): what is on it and how to change it, `createLiveApp()` in the
   * app. Without it Ask sends only the data tools and no screen line (tests, the Developer console).
   */
  app?: AskApp
}

/** One tool call as it went to Claude, for "What was sent". */
export interface ToolCallRecord {
  /** The tool_use id. */
  id: string
  name: string
  /** The input as Claude wrote it (it only ever holds person tokens, never names). */
  input: unknown
  /** The exact JSON text sent back to Claude, after the privacy pass. */
  result: string
  isError: boolean
  /** How long the tool took to run here, in ms. */
  ms: number
  /** The plain progress line, e.g. "Calculating People stats key figures for Bengaluru". May hold person tokens. */
  label: string
  /** Which request to Claude asked for it (1-based). */
  round: number
  /** An action tool that changed the screen: the action line and its Undo. */
  action?: AskAction
  /** make_chart: the chart to draw in the answer. */
  chart?: AskChart
}

/** Tokens used by one answer (summed over its requests). */
export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  /** Requests sent to Claude for the answer. */
  requests: number
  /**
   * A request was stopped or failed while streaming: its tokens are counted as far as the stream
   * got (the input, and the output reported so far), so the figure may be short of what is billed.
   */
  partial?: boolean
}

export const NO_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 }

/** A person behind a token, rehydrated locally. */
export interface PersonInfo {
  /** 'P12' (without braces). */
  token: string
  name: string
  /** Set when the person is on the roster, so a name opens the person card. */
  employeeId: string | null
  kind: 'employee' | 'candidate' | 'name'
}
