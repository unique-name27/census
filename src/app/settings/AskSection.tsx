/**
 * Settings > Ask Census (docs/ASK.md): the Claude API key (kept for this tab unless "Keep on this
 * device" is on; never in the settings file, Report a problem, exports, logs or the address),
 * Check key, the optional workspace ID (for a key that belongs to no workspace; kept on this
 * device, kept out of the same places), the model, "Let Ask change the screen" (on by default;
 * docs/ASK-ACTIONS.md, part 3), and what is sent and what never is.
 *
 * When the team runs a relay (`ask-relay.json`, docs/ASK-RELAY.md), the key gives way to the Team
 * passcode, kept and kept out of the same places as the key, with Check passcode (one tiny request
 * through the relay); "Use my own key instead" brings back the key and the workspace ID.
 */
import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  type AskError,
  askVia,
  clearWorkspaceId,
  forgetKey,
  forgetPasscode,
  isModelId,
  looksLikeKey,
  looksLikePasscode,
  looksLikeWorkspaceId,
  MODELS,
  type ModelId,
  maskKey,
  pageHost,
  readKey,
  readModelChoice,
  readOwnKeyChoice,
  readPasscode,
  readScreenActions,
  readWorkspaceId,
  relayInForce,
  saveKey,
  saveModelChoice,
  saveOwnKeyChoice,
  savePasscode,
  saveScreenActions,
  saveWorkspaceId,
  sharedHost,
  whatIsSent,
} from '@/ask/engine'
import {
  errorFacts,
  keyLine,
  PASSCODE_FIELD,
  passcodeLine,
  settingsErrorDetail,
  sharedKeepNote,
  WORKSPACE_FIELD,
} from '@/ask/ui/model'
import { checkAskKey, checkAskPasscode } from '@/ask/ui/session'
import { openAsk, useAsk } from '@/ask/ui/store'
import { IconEye } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button, cx, SeverityIcon, Switch } from '@/components/ui'
import { closeSettings } from '@/data/store'
import { Field, INPUT, SettingsBlock } from './ui'

/** The browser can mask a text field (`-webkit-text-security`), so the key needs no password field. */
const MASKS_TEXT = typeof CSS !== 'undefined' && CSS.supports?.('-webkit-text-security', 'disc') === true

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; model: string }
  | { state: 'failed'; error: AskError }

/**
 * The model, workspace ID, switches and team relay as stored; `version` changes when they are
 * saved (or the relay file lands), so they are read again.
 */
const storedNow = (_version: number) => ({
  model: readModelChoice(),
  workspace: readWorkspaceId(),
  actions: readScreenActions(),
  relayUrl: relayInForce().relayUrl,
  ownKey: readOwnKeyChoice(),
})

/** What Ask sends with, and every word its field uses: the person's own key, or the team passcode. */
interface Credential {
  kind: 'own' | 'team'
  label: string
  hint: string
  stored: { value: string; kept: boolean } | null
  line: string
  placeholder: string
  /** Why a typed value cannot be saved, or null. */
  problem: (value: string) => string | null
  save: (value: string, keep: boolean) => boolean
  forget: () => void
  check: (value: string, model: ModelId) => Promise<AskError | null>
  /** The field's `data-settings-focus` name, when an error's Settings button lands on it. */
  focus?: string
  words: {
    check: string
    checking: string
    forget: string
    save: string
    replace: string
    works: (model: string) => string
    saved: string
    savedFor: (kept: boolean) => string
    notStored: string
    forgotten: string
    forgottenDetail: string
    keepHint: string
    keepLabel: string
  }
}

function ownKey(): Credential {
  const k = readKey()
  return {
    kind: 'own',
    label: 'Claude API key',
    hint: 'Create a key in the Claude Console. It is never part of the settings file, Report a problem, exports or the page address.',
    stored: k ? { value: k.key, kept: k.kept } : null,
    line: keyLine(k, maskKey),
    placeholder: k ? 'Paste a new key to replace it' : 'sk-ant-…',
    problem: (v) =>
      looksLikeKey(v)
        ? null
        : 'This does not look like a Claude API key. Keys start with sk-ant- and have no spaces.',
    save: (v, keep) => saveKey(v, keep),
    forget: () => forgetKey(),
    check: checkAskKey,
    words: {
      check: 'Check key',
      checking: 'Checking the key',
      forget: 'Forget key',
      save: 'Save key',
      replace: 'Replace key',
      works: (m) => `The key works with ${m}.`,
      saved: 'Key saved',
      savedFor: (kept) =>
        kept
          ? 'It is kept in this browser until you choose Forget key.'
          : 'It is kept for this tab and is gone when you close it.',
      notStored: 'Key in use for now',
      forgotten: 'Key forgotten',
      forgottenDetail: 'Ask sends nothing until you add a key again.',
      keepHint:
        'Off: the key is kept for this tab and is gone when you close it. On: it stays in this browser until you choose Forget key or clear Census from this device.',
      keepLabel: 'Keep the key on this device',
    },
  }
}

function teamPasscode(relayUrl: string): Credential {
  const p = readPasscode()
  return {
    kind: 'team',
    label: 'Team passcode',
    hint: 'Ask whoever set up Ask Census for your team. It goes only to the team relay, and is never part of the settings file, Report a problem, exports or the page address.',
    stored: p ? { value: p.passcode, kept: p.kept } : null,
    line: passcodeLine(p),
    placeholder: p ? 'Type a new passcode to replace it' : 'The passcode your team shared',
    problem: (v) =>
      looksLikePasscode(v)
        ? null
        : 'A team passcode has 4 to 256 characters: letters, numbers, spaces and common symbols.',
    save: (v, keep) => savePasscode(v, keep),
    forget: () => forgetPasscode(),
    check: (v, m) => checkAskPasscode(v, relayUrl, m),
    focus: PASSCODE_FIELD,
    words: {
      check: 'Check passcode',
      checking: 'Checking the passcode',
      forget: 'Forget passcode',
      save: 'Save passcode',
      replace: 'Replace passcode',
      works: (m) => `The passcode works with ${m}.`,
      saved: 'Passcode saved',
      savedFor: (kept) =>
        kept
          ? 'It is kept in this browser until you choose Forget passcode.'
          : 'It is kept for this tab and is gone when you close it.',
      notStored: 'Passcode in use for now',
      forgotten: 'Passcode forgotten',
      forgottenDetail: 'Ask sends nothing until you add the passcode again.',
      keepHint:
        'Off: the passcode is kept for this tab and is gone when you close it. On: it stays in this browser until you choose Forget passcode or clear Census from this device.',
      keepLabel: 'Keep the passcode on this device',
    },
  }
}

const modelLabel = (m: string) => MODELS.find((x) => x.id === m)?.label ?? m

/** The key or passcode field, its Check and Forget, and "Keep on this device". */
function CredentialFields({
  cred,
  model,
  check,
  setCheck,
  changed,
}: {
  cred: Credential
  model: ModelId
  check: Check
  setCheck: (c: Check) => void
  changed: () => void
}) {
  const { stored, words } = cred
  const [draft, setDraft] = useState('')
  const [show, setShow] = useState(false)
  const [keep, setKeep] = useState(() => stored?.kept ?? false)
  const [problem, setProblem] = useState<string | null>(null)
  const id = useId()
  const fieldId = `${id}-${cred.kind}`
  // On an address other sites share (<account>.github.io), "Keep on this device" is offered with
  // a warning that every site at that address can read what is kept.
  const host = pageHost()
  const onSharedHost = sharedHost(host)
  const kept = stored ? stored.kept : keep
  const inputRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const checkRef = useRef<HTMLButtonElement>(null)
  const lineRef = useRef<HTMLParagraphElement>(null)
  const noteRef = useRef<HTMLParagraphElement>(null)
  const shared = sharedKeepNote(host, onSharedHost, cred.kind === 'own' ? 'key' : 'passcode', kept)

  const save = () => {
    const v = draft.trim()
    if (!v) return
    const why = cred.problem(v)
    if (why) {
      setProblem(why)
      return
    }
    setProblem(null)
    const ok = cred.save(v, kept)
    // The save button is disabled once the field empties: focus moves on to Check (or the line
    // above), never left on a disabled control. Typing Enter in the field keeps focus there.
    const fromButton = document.activeElement === submitRef.current
    flushSync(() => {
      setDraft('')
      setShow(false)
      setCheck({ state: 'idle' })
      changed()
    })
    if (fromButton) (checkRef.current ?? lineRef.current)?.focus({ preventScroll: true })
    toast(ok ? words.saved : words.notStored, {
      tone: ok ? 'good' : 'neutral',
      description: ok
        ? words.savedFor(kept)
        : 'This browser would not store it, so it lasts until the page reloads.',
    })
  }

  const forget = () => {
    // The row with this button goes with the key: focus moves to the field first.
    inputRef.current?.focus({ preventScroll: true })
    cred.forget()
    setCheck({ state: 'idle' })
    changed()
    toast(words.forgotten, { description: words.forgottenDetail })
  }

  const setKeepOn = (on: boolean) => {
    flushSync(() => {
      setKeep(on)
      if (stored) {
        cred.save(stored.value, on)
        changed()
      }
    })
    // On a shared address the switch goes once it is off: focus moves to the note in its place.
    if (!on && shared) noteRef.current?.focus({ preventScroll: true })
  }

  const runCheck = async () => {
    const v = stored?.value
    if (!v) return
    setCheck({ state: 'checking' })
    const error = await cred.check(v, model)
    setCheck(error ? { state: 'failed', error } : { state: 'ok', model })
  }

  return (
    <>
      <Field label={cred.label} htmlFor={fieldId} hint={cred.hint}>
        <div className="flex w-full flex-col gap-2">
          <p ref={lineRef} tabIndex={-1} className="rounded-mark text-small text-ink-2 outline-none">
            {cred.line}
          </p>
          {stored && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                ref={checkRef}
                size="sm"
                onClick={() => void runCheck()}
                disabled={check.state === 'checking'}
              >
                {check.state === 'checking' ? words.checking : words.check}
              </Button>
              <Button size="sm" variant="ghost" onClick={forget}>
                {words.forget}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  closeSettings()
                  openAsk()
                }}
              >
                Open Ask Census
              </Button>
            </div>
          )}
          <p role="status" className="text-meta leading-snug empty:hidden">
            {check.state === 'ok' && (
              <span className="inline-flex items-start gap-1.5 text-ink-2">
                <SeverityIcon severity="good" className="mt-px size-3.5 shrink-0" />
                {words.works(modelLabel(check.model))}
              </span>
            )}
            {check.state === 'failed' && (
              <span className="inline-flex items-start gap-1.5 text-ink-2">
                <SeverityIcon severity="critical" className="mt-px size-3.5 shrink-0" />
                <span>
                  <span className="font-semibold text-ink">{check.error.title}</span>{' '}
                  {settingsErrorDetail(check.error)}
                  {errorFacts(check.error) && (
                    <span className="mt-1 block break-words text-muted select-text">
                      {errorFacts(check.error)}
                    </span>
                  )}
                </span>
              </span>
            )}
          </p>
          {/* No form and, where the browser can mask text, no password field: a browser's password
              manager would offer to save the key or passcode and may sync it to the user's account. */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              id={fieldId}
              type={show || MASKS_TEXT ? 'text' : 'password'}
              value={draft}
              onChange={(e) => {
                setDraft(e.currentTarget.value)
                setProblem(null)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
                e.preventDefault()
                if (draft.trim()) save()
              }}
              placeholder={cred.placeholder}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
              data-settings-focus={cred.focus}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `${fieldId}-problem` : undefined}
              className={cx(
                INPUT,
                'w-full font-mono text-meta sm:w-auto sm:min-w-0 sm:flex-1',
                !show && MASKS_TEXT && '[-webkit-text-security:disc]',
              )}
            />
            {/* The label says what a press does; no pressed state on top of it ("Hide, pressed"). */}
            <Button
              size="sm"
              variant="ghost"
              icon={<IconEye />}
              aria-controls={fieldId}
              onClick={() => setShow(!show)}
            >
              {show ? 'Hide' : 'Show'}
            </Button>
            <Button ref={submitRef} size="sm" variant="primary" onClick={save} disabled={!draft.trim()}>
              {stored ? words.replace : words.save}
            </Button>
          </div>
          {problem && (
            <p id={`${fieldId}-problem`} role="alert" className="text-meta text-bad-text">
              {problem}
            </p>
          )}
        </div>
      </Field>
      {shared && !shared.offer ? (
        <Field label="Keep on this device">
          <p
            ref={noteRef}
            tabIndex={-1}
            className="rounded-mark text-meta leading-snug text-ink-2 outline-none"
          >
            {shared.note}
          </p>
        </Field>
      ) : (
        <Field label="Keep on this device" hint={shared ? shared.note : words.keepHint}>
          <Switch checked={kept} onChange={setKeepOn} label={words.keepLabel} />
        </Field>
      )}
    </>
  )
}

/** The optional workspace ID, for a key of the person's own that belongs to no workspace. */
function WorkspaceField({
  workspace,
  resetCheck,
  changed,
}: {
  workspace: string | null
  resetCheck: () => void
  changed: () => void
}) {
  const id = useId()
  const wsId = `${id}-workspace`
  const wsRef = useRef<HTMLInputElement>(null)
  const wsSaveRef = useRef<HTMLButtonElement>(null)
  const [wsDraft, setWsDraft] = useState(() => workspace ?? '')
  const [wsProblem, setWsProblem] = useState<string | null>(null)
  // The saved ID changed (here, or in another tab): the field shows it.
  const [wsShown, setWsShown] = useState(workspace)
  if (wsShown !== workspace) {
    setWsShown(workspace)
    setWsDraft(workspace ?? '')
    setWsProblem(null)
  }
  const wsNext = wsDraft.trim()
  const wsDirty = wsNext !== '' && wsNext !== workspace

  const saveWorkspace = () => {
    if (!wsDirty) return
    if (!looksLikeWorkspaceId(wsNext)) {
      setWsProblem(
        'This does not look like a workspace ID. It starts with wrkspc_, followed by letters and numbers.',
      )
      return
    }
    setWsProblem(null)
    const ok = saveWorkspaceId(wsNext)
    // Saving disables the button: focus moves to the field, never left on a disabled control.
    const fromButton = document.activeElement === wsSaveRef.current
    flushSync(() => {
      resetCheck()
      changed()
    })
    if (fromButton) wsRef.current?.focus({ preventScroll: true })
    if (ok)
      toast('Workspace ID saved', {
        tone: 'good',
        description: 'Ask sends it to Anthropic with every request.',
      })
    else
      toast('Workspace ID not saved', {
        tone: 'critical',
        description: 'This browser would not store it. Allow site data for Census and try again.',
      })
  }

  const clearWorkspace = () => {
    // The Clear button goes with the saved ID: focus moves to the field first.
    wsRef.current?.focus({ preventScroll: true })
    clearWorkspaceId()
    setWsDraft('')
    setWsProblem(null)
    resetCheck()
    changed()
    toast('Workspace ID cleared', { description: 'Ask sends no workspace ID from now on.' })
  }

  return (
    <Field
      label="Workspace ID"
      htmlFor={wsId}
      hintId={`${wsId}-hint`}
      hint="Only needed when your key is not tied to a workspace. Find it in the Claude Console under Settings, Workspaces. It goes to Anthropic with each request and nowhere else."
    >
      <div className="flex w-full flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={wsRef}
            id={wsId}
            type="text"
            value={wsDraft}
            onChange={(e) => {
              setWsDraft(e.currentTarget.value)
              setWsProblem(null)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
              e.preventDefault()
              saveWorkspace()
            }}
            placeholder="wrkspc_…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            data-settings-focus={WORKSPACE_FIELD}
            aria-invalid={wsProblem ? true : undefined}
            aria-describedby={wsProblem ? `${wsId}-hint ${wsId}-problem` : `${wsId}-hint`}
            className={cx(INPUT, 'w-full font-mono text-meta sm:w-auto sm:min-w-0 sm:flex-1')}
          />
          <Button ref={wsSaveRef} size="sm" variant="primary" onClick={saveWorkspace} disabled={!wsDirty}>
            Save workspace ID
          </Button>
          {workspace && (
            <Button size="sm" variant="ghost" onClick={clearWorkspace} aria-label="Clear workspace ID">
              Clear
            </Button>
          )}
        </div>
        {wsProblem && (
          <p id={`${wsId}-problem`} role="alert" className="text-meta text-bad-text">
            {wsProblem}
          </p>
        )}
      </div>
    </Field>
  )
}

const INTRO = {
  own: 'Ask questions about your people data in plain words. Ask uses your own Claude API key, and requests go from this browser straight to Anthropic.',
  team: 'Ask questions about your people data in plain words. Your team runs a relay that holds a shared Claude API key, so all you need is the team passcode. Requests go from this browser to the relay and on to Anthropic.',
}

export function AskSection() {
  const version = useAsk((s) => s.keyVersion)
  const changed = useAsk((s) => s.keyChanged)
  const { model, workspace, actions, relayUrl, ownKey: ownChosen } = storedNow(version)
  const via = askVia(relayUrl, ownChosen)
  const cred = via.kind === 'team' ? teamPasscode(via.relayUrl) : ownKey()
  const [check, setCheck] = useState<Check>({ state: 'idle' })
  const id = useId()

  const setOwnKey = (on: boolean) => {
    const ok = saveOwnKeyChoice(on)
    setCheck({ state: 'idle' })
    changed()
    if (!ok)
      toast('Not saved', {
        tone: 'critical',
        description: 'This browser would not store the setting. Allow site data for Census and try again.',
      })
  }

  const pickModel = (m: ModelId) => {
    saveModelChoice(m)
    setCheck({ state: 'idle' })
    changed()
  }

  const setActions = (on: boolean) => {
    const ok = saveScreenActions(on)
    changed()
    if (!ok)
      toast('Not saved', {
        tone: 'critical',
        description: 'This browser would not store the setting. Allow site data for Census and try again.',
      })
  }

  return (
    <SettingsBlock section="ask" intro={INTRO[via.kind]}>
      {relayUrl && (
        <Field
          label="Use my own key instead"
          hint="Off: Ask goes through your team’s relay with the team passcode. On: Ask uses your own Claude API key, straight to Anthropic."
        >
          <Switch checked={via.kind === 'own'} onChange={setOwnKey} label="Use my own key instead" />
        </Field>
      )}
      {/* A fresh field for each way of connecting: nothing typed for one carries to the other. */}
      <CredentialFields
        key={cred.kind}
        cred={cred}
        model={model}
        check={check}
        setCheck={setCheck}
        changed={changed}
      />
      {via.kind === 'own' && (
        <WorkspaceField
          workspace={workspace}
          resetCheck={() => setCheck({ state: 'idle' })}
          changed={changed}
        />
      )}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-small font-semibold text-ink">Model</legend>
        <p className="text-meta leading-snug text-muted">
          Opus gives the most careful answers; Sonnet and Haiku answer faster.
        </p>
        <div className="mt-1 flex flex-col gap-1">
          {MODELS.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-2 rounded-control px-1 py-1 text-small text-ink hover:bg-hover"
            >
              <input
                type="radio"
                name={`${id}-model`}
                value={m.id}
                checked={model === m.id}
                onChange={(e) => {
                  if (isModelId(e.currentTarget.value)) pickModel(e.currentTarget.value)
                }}
                className="size-3.5 accent-(--ink)"
              />
              <span>{m.label}</span>
              <span className="text-meta text-muted">{m.note}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Let Ask change the screen"
        hint="On: as it answers, Ask can filter, open a view or tab, point to a chart, open the records behind a number or apply a saved view, and each change has Undo. Off: Ask answers with links to the views instead. Ask never changes your data, settings, the mode or metric definitions."
      >
        <Switch checked={actions} onChange={setActions} label="Let Ask change the screen" />
      </Field>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-small font-semibold text-ink">What is sent</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-small leading-snug text-ink-2 marker:text-muted">
          {whatIsSent(via.kind).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
      {import.meta.env.DEV && via.kind === 'own' && (
        <p className="rounded-control bg-sheet-2 px-3 py-2 text-meta leading-snug text-ink-2">
          Development build: the test key <code className="font-mono">sk-ant-test-fake-0000</code> answers
          from a scripted Claude that runs real Census tools, with no network.
        </p>
      )}
    </SettingsBlock>
  )
}
