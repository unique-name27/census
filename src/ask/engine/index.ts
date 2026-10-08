/**
 * Ask Census engine: the public API (docs/ASK.md). The UI imports from this file only. Pure: no
 * React; the Claude SDK is loaded on first use by `createAnthropicClient`.
 *
 * A session, in order:
 *
 *  1. Key. `readKey()` gives the key in force (sessionStorage by default, localStorage when kept);
 *     `saveKey(key, keep)` and `forgetKey()` change it. No key: show `NO_KEY` and send nothing.
 *     Team relay (docs/ASK-RELAY.md): `relayInForce()` is the relay `ask-relay.json` names (loaded
 *     at startup by `loadRelay`; `setRelayInForce`), `askVia()` says how Ask connects (the relay
 *     unless "Use my own key instead", `readOwnKeyChoice()`), and `readCredential(via)` gives the
 *     key or the team passcode in force (`readPasscode`, `savePasscode`, `forgetPasscode`,
 *     `looksLikePasscode`). No passcode: show `NO_PASSCODE`. `clientForCredential(cred)` makes the
 *     client; `checkPasscode(passcode, relayUrl, model)` is Check passcode.
 *     Workspace ID (optional, for a key that belongs to no workspace): `readWorkspaceId()`,
 *     `saveWorkspaceId(id)`, `clearWorkspaceId()`, `looksLikeWorkspaceId(id)`.
 *     Settings > Check key: `checkKey(key, model, { workspaceId })`, then
 *     `classifyError(error, { connection, workspaceSent })`.
 *     Model: `MODELS`, `DEFAULT_MODEL`, `readModelChoice()`, `saveModelChoice(id)`.
 *  2. Conversation. `createConversation()` once per chat (in memory only; New chat makes a new
 *     one). It holds the person tokens, the record refs and the history sent to Claude.
 *  3. Client. `await createAnthropicClient(key, { workspaceId })`: the SDK, imported lazily,
 *     browser-direct; a workspace ID goes as the `anthropic-workspace-id` header.
 *  4. Question. `ask({ client, conversation, question, env: { ctx, views, marks, app }, model,
 *     signal, onEvent })` streams: `question` (what was sent), `request`, `text` deltas, `tool_start` (a
 *     plain progress line), `tool_end` (a `ToolCallRecord` for "What was sent"), `round_limit`,
 *     `usage`. It resolves to an `AskResult` (status done, stopped or error; never throws). Abort
 *     the signal for Stop. `env.ctx` is `useAnalytics()`, `env.views` is `VIEWS` from
 *     '@/views/registry', `env.marks` the Action center marks.
 *  5. Rendering. `parseAnswer(text, { isRef, isView, isMetric })` gives typed blocks (no HTML);
 *     person nodes resolve with `conversation.person(token)` (null: show "someone"; an
 *     `employeeId` opens the person card); ref nodes open `conversation.records(ref)` in the drill
 *     panel; `tableData` turns a table into DataTable/CSV/Excel rows; `answerText` is Copy answer
 *     (names included). Errors: `AskError` has a title, a detail and where the fix is.
 *
 * Text from the engine (`ASK_INTRO`, `PRIVACY_LINE`, `WHAT_IS_SENT`, `suggestionsFor(view)`) is in
 * the house style.
 *
 * Ask on the screen (docs/ASK-ACTIONS.md): pass `env.app = liveAskApp` and Ask reads and drives
 * the screen; without `app` it is the chat it was.
 *
 *  6. The screen. `liveAskApp` (an `AskApp`) is the app as Ask drives it: the store's filters
 *     through the mode's clamp, `goTo` through the route guard, the records panel, the saved
 *     views. It needs `<AskScreenBridge />` inside each figure registry (it calls `connectScreen`
 *     with the registry, the analytics context and the route rendered). Each question then starts
 *     with a screen line ("On screen: People stats, Attrition; Bengaluru; last 12 months.") built
 *     by `screenLine`; it is in `sent` and on its own in the `question` event's `screen` and
 *     `AskResult.screen`.
 *  7. Actions. `set_filters`, `reset_filters`, `open_view`, `show_figure`, `open_records`,
 *     `apply_saved_view` run straight away. Each that changed something puts an `AskAction` on its
 *     call (`tool_end`'s `call.action`, and `AskResult.actions`): the action line (`line`, with
 *     person tokens: render it with `parseInline`) and `undo`; Undo is
 *     `undoAction(liveAskApp, action)` (Back while its history entry is on screen, else only what
 *     it changed); `undoWaits` holds back an Undo until a later action that changed the same
 *     filter, period or route is undone, and `steppedBack` says the person went Back past it. show_figure
 *     carries `figure` ({ id, table }) and emits a screen event: subscribe with `onScreenEvent` to
 *     scroll to `figureElement(id)`, highlight it and switch it to its table.
 *     "Let Ask change the screen": `readScreenActions()`, `saveScreenActions(on)` (on by default).
 *     Off: no action tools, and Claude is told to give view links instead.
 *  8. Charts. `make_chart` puts an `AskChart` on its call (`call.chart`, `AskResult.charts`): rows,
 *     columns (formats), the encoded fields (x, y, series, value, target, label, xType), refs per
 *     row (open with `conversation.records(ref)`), notes (what is hidden and why), source, scope,
 *     period, tier and metric. Draw it in a `Figure` with `chartWithNames(chart, name)` so person
 *     tokens show as names; `AskChart` says which kit component each form uses.
 */

export { groupableFields, QUERY_DATASETS, type QueryDataset, type QueryField } from './allowlist'
export {
  type ActionPart,
  type ActionTool,
  type AppSnapshot,
  type AskAction,
  type AskApp,
  type FigureData,
  pickOfMode,
  type SavedViewInfo,
  type ScreenFigure,
  type ScreenRecords,
  type ScreenRoute,
  type ScreenState,
  steppedBack,
  stillShown,
  undoAction,
  undoWaits,
} from './app'
export {
  type AskChart,
  CHART_FORMS,
  type ChartColumn,
  type ChartFieldKind,
  type ChartForm,
  chartWithNames,
  FORM_WORDS,
} from './chart'
export {
  type AnthropicAskClient,
  type CheckResult,
  type ClientOptions,
  checkKey,
  checkPasscode,
  clientForCredential,
  createAnthropicClient,
  loadSdk,
} from './client'
export { Conversation, createConversation } from './conversation'
export {
  ASK_INTRO,
  noKeyQuestions,
  PRIVACY_LINE,
  PRIVACY_LINE_TEAM,
  privacyLine,
  suggestionsFor,
  WHAT_IS_SENT,
  WHAT_IS_SENT_TEAM,
  whatIsSent,
} from './copy'
export {
  type AskError,
  type AskErrorKind,
  CUT_OFF,
  classifyError,
  DECLINED,
  EMPTY_QUESTION,
  NO_KEY,
  NO_PASSCODE,
  STOPPED,
  WORKSPACE_NEEDED,
  WORKSPACE_REJECTED,
} from './errors'
export {
  clearWorkspaceId,
  forgetKey,
  forgetPasscode,
  KEY_STORAGE_KEY,
  type KeyStores,
  looksLikeKey,
  looksLikePasscode,
  looksLikeWorkspaceId,
  maskKey,
  PASSCODE_STORAGE_KEY,
  pageHost,
  readKey,
  readOwnKeyChoice,
  readPasscode,
  readWorkspaceId,
  SOURCE_STORAGE_KEY,
  type StoredKey,
  type StoredPasscode,
  saveKey,
  saveOwnKeyChoice,
  savePasscode,
  saveWorkspaceId,
  sharedHost,
  WORKSPACE_STORAGE_KEY,
} from './keys'
export {
  connectScreen,
  figureElement,
  liveAskApp,
  onScreenEvent,
  type RenderedScreen,
  type ScreenEvent,
  type ScreenRegistry,
} from './liveApp'
export {
  type AskClient,
  type AskEvent,
  type AskOptions,
  type AskRequest,
  type AskResult,
  type AskStream,
  ask,
  buildRequest,
  FALLBACK_BETA,
  MAX_TOKENS,
  MAX_TOOL_ROUNDS,
} from './loop'
export {
  type Align,
  type AnswerTable,
  answerText,
  type Block,
  cellNumber,
  codeText,
  type Inline,
  inlineText,
  type MarkerCheck,
  type PersonLookup,
  parseAnswer,
  parseInline,
  SOMEONE,
  tableData,
} from './markers'
export {
  DEFAULT_MODEL,
  isModelId,
  MODEL_STORAGE_KEY,
  MODELS,
  type ModelId,
  type ModelInfo,
  modelById,
  readModelChoice,
  saveModelChoice,
} from './models'
export { AMOUNT_WITHHELD, TOKEN_RE, TokenMap, tokenText } from './privacy'
export {
  managerPromptLine,
  ROUND_LIMIT_NOTE,
  rolePromptLine,
  SYSTEM_PROMPT,
  screenPrompt,
  systemBlocksFor,
} from './prompt'
export { type RefEntry, RefRegistry } from './refs'
export {
  type AskCredential,
  type AskVia,
  askVia,
  loadRelay,
  NO_RELAY,
  PASSCODE_HEADER,
  RELAY_FILE_NAME,
  RELAY_PLACEHOLDER_KEY,
  type RelayFetch,
  type RelayInForce,
  type RelayLoadEnv,
  readCredential,
  readRelayFile,
  relayInForce,
  relayUrlOf,
  setRelayInForce,
} from './relay'
export { askNeedsPick, askOff, scopeText } from './roles'
export {
  askOffReason,
  chatContext,
  contextFor,
  type FilterInput,
  resolveFilters,
  scopeWords,
  withScope,
} from './scope'
export { periodWords, placeOf, placeWords, scopeInWords, screenLine } from './screen'
export { readScreenActions, SCREEN_ACTIONS_STORAGE_KEY, saveScreenActions } from './screenSetting'
export {
  isScreenTool,
  type PriorResult,
  runScreenTool,
  SCREEN_TOOL_NAMES,
  type ScreenRun,
  screenToolDefinitions,
} from './screenTools'
export {
  ALL_TOOL_NAMES,
  isToolName,
  runTool,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  type ToolRun,
  toolDefinitionsFor,
  toolLabel,
} from './tools'
export { ACTIONS_OFF } from './tools/screenActions'
export {
  type AnyToolName,
  NO_USAGE,
  type PersonInfo,
  type ScreenToolName,
  type ToolCallRecord,
  type ToolEnv,
  type ToolName,
  type Usage,
} from './types'
