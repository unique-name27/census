/**
 * Ask Census engine: the public API (docs/ASK.md). The UI imports from this file only. Pure: no
 * React; the Claude SDK is loaded on first use by `createAnthropicClient`.
 *
 * A session, in order:
 *
 *  1. Key. `readKey()` gives the key in force (sessionStorage by default, localStorage when kept);
 *     `saveKey(key, keep)` and `forgetKey()` change it. No key: show `NO_KEY` and send nothing.
 *     Workspace ID (optional, for a key that belongs to no workspace): `readWorkspaceId()`,
 *     `saveWorkspaceId(id)`, `clearWorkspaceId()`, `looksLikeWorkspaceId(id)`.
 *     Settings > Check key: `checkKey(key, model, { workspaceId })`, then
 *     `classifyError(error, { connection, workspaceSent })`.
 *     Model: `MODELS`, `DEFAULT_MODEL`, `readModelChoice()`, `saveModelChoice(id)`.
 *  2. Conversation. `createConversation()` once per chat (in memory only; New chat makes a new
 *     one). It holds the person tokens, the record refs and the history sent to Claude.
 *  3. Client. `await createAnthropicClient(key, { workspaceId })`: the SDK, imported lazily,
 *     browser-direct; a workspace ID goes as the `anthropic-workspace-id` header.
 *  4. Question. `ask({ client, conversation, question, env: { ctx, views, marks }, model, signal,
 *     onEvent })` streams: `question` (what was sent), `request`, `text` deltas, `tool_start` (a
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
 */

export { groupableFields, QUERY_DATASETS, type QueryDataset, type QueryField } from './allowlist'
export {
  type AnthropicAskClient,
  type ClientOptions,
  checkKey,
  createAnthropicClient,
  loadSdk,
} from './client'
export { Conversation, createConversation } from './conversation'
export { ASK_INTRO, PRIVACY_LINE, suggestionsFor, WHAT_IS_SENT } from './copy'
export {
  type AskError,
  type AskErrorKind,
  CUT_OFF,
  classifyError,
  DECLINED,
  EMPTY_QUESTION,
  NO_KEY,
  STOPPED,
  WORKSPACE_NEEDED,
  WORKSPACE_REJECTED,
} from './errors'
export {
  clearWorkspaceId,
  forgetKey,
  KEY_STORAGE_KEY,
  type KeyStores,
  looksLikeKey,
  looksLikeWorkspaceId,
  maskKey,
  readKey,
  readWorkspaceId,
  type StoredKey,
  saveKey,
  saveWorkspaceId,
  WORKSPACE_STORAGE_KEY,
} from './keys'
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
export { managerPromptLine, ROUND_LIMIT_NOTE, SYSTEM_PROMPT, systemBlocksFor } from './prompt'
export { type RefEntry, RefRegistry } from './refs'
export { askOffReason, chatContext, contextFor, type FilterInput, resolveFilters, scopeWords } from './scope'
export {
  isToolName,
  runTool,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  type ToolRun,
  toolDefinitionsFor,
  toolLabel,
} from './tools'
export {
  NO_USAGE,
  type PersonInfo,
  type ToolCallRecord,
  type ToolEnv,
  type ToolName,
  type Usage,
} from './types'
