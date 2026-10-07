/**
 * An answer as it reads with Ask on the screen (docs/ASK-ACTIONS.md, parts 3 and 4): the action
 * lines first ("Filtered to Bengaluru, last 6 months", each with Undo), then the answer text with
 * each chart Ask drew placed where the text stood when the chart's tool ran, so a line that leads
 * into a chart sits above it and the description of it below. Pure.
 */
import {
  type AppSnapshot,
  type AskAction,
  type AskChart,
  steppedBack,
  stillShown,
  type ToolCallRecord,
  undoWaits,
} from '@/ask/engine'
import type { Step } from './model'

export type AnswerPart =
  | {
      kind: 'text'
      text: string
      /** Tables in the parts before it, so the answer's tables keep one numbering. */
      tablesBefore: number
    }
  | { kind: 'charts'; charts: AskChart[] }

/** The charts an answer drew, in call order, each with where the text stood when its tool started. */
export function chartsOf(
  calls: readonly ToolCallRecord[],
  steps: readonly Pick<Step, 'id' | 'at'>[],
): { chart: AskChart; at: number }[] {
  const at = new Map(steps.map((s) => [s.id, s.at]))
  return calls.flatMap((c) =>
    c.chart ? [{ chart: c.chart, at: at.get(c.id) ?? Number.POSITIVE_INFINITY }] : [],
  )
}

/**
 * Split the text at the charts' places. Charts that ran in the same round share one place.
 * `countTables` counts the tables a piece of text renders (the parser's), for the numbering.
 */
export function answerParts(
  text: string,
  charts: readonly { chart: AskChart; at: number }[],
  countTables: (text: string) => number = () => 0,
): AnswerPart[] {
  const sorted = charts
    .map((c, i) => ({ ...c, at: Math.max(0, Math.min(text.length, c.at)), i }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
  const parts: AnswerPart[] = []
  let from = 0
  let tables = 0
  const pushText = (t: string) => {
    if (!t.trim()) return
    parts.push({ kind: 'text', text: t, tablesBefore: tables })
    tables += countTables(t)
  }
  for (const c of sorted) {
    if (c.at > from) pushText(text.slice(from, c.at))
    from = Math.max(from, c.at)
    const last = parts[parts.length - 1]
    if (last?.kind === 'charts') last.charts.push(c.chart)
    else parts.push({ kind: 'charts', charts: [c.chart] })
  }
  pushText(text.slice(from))
  return parts
}

/** One action line: what Ask changed, and whether Undo is still to offer. */
export interface ActionLine {
  action: AskAction
  /** Undo was used, or the person stepped Back past the action (Forward brings it back). */
  undone: boolean
  /**
   * Undo can put something back now: show_figure changes nothing (it offers Show again), and an
   * action whose change a later action changed again waits until that one is undone.
   */
  canUndo: boolean
  /**
   * Everything the action changed has been changed again since (by the person, or by an action
   * whose line is gone): Undo has nothing of its own to put back, and the line says so.
   */
  changedSince: boolean
}

/** The screen as Undo reads it. */
export type ScreenNow = Pick<AppSnapshot, 'route' | 'filters' | 'standard' | 'lens' | 'savedViewId'>

/**
 * The action lines of an answer, in the order the actions ran. `all` is every action of the
 * conversation in order (so a later answer's change holds an earlier Undo back); `entry` is the
 * history entry on screen (so an action the person stepped Back past reads as undone); `now` is
 * the screen now (so a line whose changes were all changed again since says so).
 */
export function actionLines(
  calls: readonly ToolCallRecord[],
  undone: Readonly<Record<string, true>>,
  opts: { all?: readonly AskAction[]; entry?: number | null; now?: ScreenNow } = {},
): ActionLine[] {
  const isUndone = (a: AskAction) => !!undone[a.id] || steppedBack(a, opts.entry ?? null)
  const own = calls.flatMap((c) => (c.action && !c.isError ? [c.action] : []))
  const waits = undoWaits(opts.all ?? own, isUndone)
  return own.map((action) => {
    const done = isUndone(action)
    const open = !!action.undo && !done && !waits.has(action.id)
    const changedSince = open && !!opts.now && !!action.undo && stillShown(opts.now, action.undo).length === 0
    return { action, undone: done, canUndo: open && !changedSince, changedSince }
  })
}

/** Every action of the conversation, in the order they ran. */
export function actionsOf(turns: readonly { calls: readonly ToolCallRecord[] }[]): AskAction[] {
  return turns.flatMap((t) => t.calls.flatMap((c) => (c.action && !c.isError ? [c.action] : [])))
}

/** The calls whose progress lines the action lines replace (they say the same thing, done). */
export function actionCallIds(calls: readonly ToolCallRecord[]): Set<string> {
  return new Set(calls.filter((c) => c.action && !c.isError).map((c) => c.id))
}
