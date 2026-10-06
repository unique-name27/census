/**
 * Settings > Ask Census (docs/ASK.md): the Claude API key (kept for this tab unless "Keep on this
 * device" is on; never in the settings file, Report a problem, exports, logs or the address),
 * Check key, the model, and what is sent and what never is.
 */
import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  type AskError,
  forgetKey,
  isModelId,
  looksLikeKey,
  MODELS,
  type ModelId,
  maskKey,
  readKey,
  readModelChoice,
  saveKey,
  saveModelChoice,
  WHAT_IS_SENT,
} from '@/ask/engine'
import { errorFacts, keyLine, settingsErrorDetail } from '@/ask/ui/model'
import { checkAskKey } from '@/ask/ui/session'
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

/** The key and model as stored; `version` changes when they are saved, so they are read again. */
const storedNow = (_version: number) => ({ key: readKey(), model: readModelChoice() })

export function AskSection() {
  const version = useAsk((s) => s.keyVersion)
  const changed = useAsk((s) => s.keyChanged)
  const { key: stored, model } = storedNow(version)
  const [draft, setDraft] = useState('')
  const [show, setShow] = useState(false)
  const [keep, setKeep] = useState(() => readKey()?.kept ?? false)
  const [problem, setProblem] = useState<string | null>(null)
  const [check, setCheck] = useState<Check>({ state: 'idle' })
  const id = useId()
  const keyId = `${id}-key`
  const kept = stored ? stored.kept : keep
  const inputRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const checkRef = useRef<HTMLButtonElement>(null)
  const lineRef = useRef<HTMLParagraphElement>(null)

  const save = () => {
    const k = draft.trim()
    if (!k) return
    if (!looksLikeKey(k)) {
      setProblem('This does not look like a Claude API key. Keys start with sk-ant- and have no spaces.')
      return
    }
    setProblem(null)
    const ok = saveKey(k, kept)
    // The save button is disabled once the field empties: focus moves on to Check key (or the
    // key line), never left on a disabled control. Typing Enter in the field keeps focus there.
    const fromButton = document.activeElement === submitRef.current
    flushSync(() => {
      setDraft('')
      setShow(false)
      setCheck({ state: 'idle' })
      changed()
    })
    if (fromButton) (checkRef.current ?? lineRef.current)?.focus({ preventScroll: true })
    toast(ok ? 'Key saved' : 'Key in use for now', {
      tone: ok ? 'good' : 'neutral',
      description: ok
        ? kept
          ? 'It is kept in this browser until you choose Forget key.'
          : 'It is kept for this tab and is gone when you close it.'
        : 'This browser would not store it, so it lasts until the page reloads.',
    })
  }

  const forget = () => {
    // The row with this button goes with the key: focus moves to the key field first.
    inputRef.current?.focus({ preventScroll: true })
    forgetKey()
    setCheck({ state: 'idle' })
    changed()
    toast('Key forgotten', { description: 'Ask sends nothing until you add a key again.' })
  }

  const setKeepOn = (on: boolean) => {
    setKeep(on)
    if (stored) {
      saveKey(stored.key, on)
      changed()
    }
  }

  const runCheck = async () => {
    const k = stored?.key
    if (!k) return
    setCheck({ state: 'checking' })
    const error = await checkAskKey(k, model)
    setCheck(error ? { state: 'failed', error } : { state: 'ok', model })
  }

  const pickModel = (m: ModelId) => {
    saveModelChoice(m)
    setCheck({ state: 'idle' })
    changed()
  }

  const modelLabel = (m: string) => MODELS.find((x) => x.id === m)?.label ?? m

  return (
    <SettingsBlock
      section="ask"
      intro="Ask questions about your people data in plain words. Ask uses your own Claude API key, and requests go from this browser straight to Anthropic."
    >
      <Field
        label="Claude API key"
        htmlFor={keyId}
        hint="Create a key in the Claude Console. It is never part of the settings file, Report a problem, exports or the page address."
      >
        <div className="flex w-full flex-col gap-2">
          <p ref={lineRef} tabIndex={-1} className="rounded-[2px] text-[13px] text-ink-2 outline-none">
            {keyLine(stored, maskKey)}
          </p>
          {stored && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                ref={checkRef}
                size="sm"
                onClick={() => void runCheck()}
                disabled={check.state === 'checking'}
              >
                {check.state === 'checking' ? 'Checking the key' : 'Check key'}
              </Button>
              <Button size="sm" variant="ghost" onClick={forget}>
                Forget key
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
          <p role="status" className="text-[12px] leading-snug empty:hidden">
            {check.state === 'ok' && (
              <span className="inline-flex items-start gap-1.5 text-ink-2">
                <SeverityIcon severity="good" className="mt-px size-3.5 shrink-0" />
                The key works with {modelLabel(check.model)}.
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
              manager would offer to save the key and may sync it to the user's account. */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              id={keyId}
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
              placeholder={stored ? 'Paste a new key to replace it' : 'sk-ant-…'}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `${keyId}-problem` : undefined}
              className={cx(
                INPUT,
                'w-full font-mono text-[12px] sm:w-auto sm:min-w-0 sm:flex-1',
                !show && MASKS_TEXT && '[-webkit-text-security:disc]',
              )}
            />
            {/* The label says what a press does; no pressed state on top of it ("Hide, pressed"). */}
            <Button
              size="sm"
              variant="ghost"
              icon={<IconEye />}
              aria-controls={keyId}
              onClick={() => setShow(!show)}
            >
              {show ? 'Hide' : 'Show'}
            </Button>
            <Button ref={submitRef} size="sm" variant="primary" onClick={save} disabled={!draft.trim()}>
              {stored ? 'Replace key' : 'Save key'}
            </Button>
          </div>
          {problem && (
            <p id={`${keyId}-problem`} role="alert" className="text-[12px] text-bad-text">
              {problem}
            </p>
          )}
        </div>
      </Field>
      <Field
        label="Keep on this device"
        hint="Off: the key is kept for this tab and is gone when you close it. On: it stays in this browser until you choose Forget key or clear Census from this device."
      >
        <Switch checked={kept} onChange={setKeepOn} label="Keep the key on this device" />
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[13px] font-semibold text-ink">Model</legend>
        <p className="text-[12px] leading-snug text-muted">
          Opus gives the most careful answers; Sonnet and Haiku answer faster.
        </p>
        <div className="mt-1 flex flex-col gap-1">
          {MODELS.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-2 rounded-control px-1 py-1 text-[13px] text-ink hover:bg-hover"
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
              <span className="text-[12px] text-muted">{m.note}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[13px] font-semibold text-ink">What is sent</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-snug text-ink-2 marker:text-muted">
          {WHAT_IS_SENT.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
      {import.meta.env.DEV && (
        <p className="rounded-control bg-sheet-2 px-3 py-2 text-[12px] leading-snug text-ink-2">
          Development build: the test key <code className="font-mono">sk-ant-test-fake-0000</code> answers
          from a scripted Claude that runs real Census tools, with no network.
        </p>
      )}
    </SettingsBlock>
  )
}
