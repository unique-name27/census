/**
 * Add or edit an agent. Lists are typed one item per line. Problems show under each field after
 * the first try to save; nothing is saved until the agent is complete.
 */
import { type ReactNode, useId, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { IconChevronDown } from '@/components/icons'
import { Button, cx } from '@/components/ui'
import {
  AGENT_AREAS,
  AGENT_AUDIENCES,
  AGENT_STATUSES,
  type Agent,
  type AgentArea,
  type AgentAudience,
  type AgentDraft,
  type AgentStatus,
  AREA_LABEL,
  AUDIENCE_LABEL,
  blankDraft,
  type DraftErrors,
  draftErrors,
  isSampleUrl,
  lineItems,
  toDraft,
} from '../catalog'
import { useAiAgents } from '../state'
import { saveAgent } from './actions'
import { INPUT, TEXTAREA } from './styles'
import { useAiUi } from './uiState'

type ListKey = 'useFor' | 'dontUseFor' | 'examplePrompts' | 'dataSources'
type Form = Omit<AgentDraft, ListKey> & Record<ListKey, string>

const LIST_KEYS: ListKey[] = ['useFor', 'dontUseFor', 'examplePrompts', 'dataSources']

const toForm = (d: AgentDraft): Form => ({
  ...d,
  useFor: d.useFor.join('\n'),
  dontUseFor: d.dontUseFor.join('\n'),
  examplePrompts: d.examplePrompts.join('\n'),
  dataSources: d.dataSources.join('\n'),
})

const fromForm = (f: Form): AgentDraft => ({
  ...f,
  ...(Object.fromEntries(LIST_KEYS.map((k) => [k, lineItems(f[k])])) as Record<ListKey, string[]>),
})

function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {hint && (
        <span id={`${id}-hint`} className="-mt-0.5 text-[12px] text-ink-2">
          {hint}
        </span>
      )}
      {children}
      {error && (
        <span id={`${id}-error`} className="text-[12px] text-bad-text">
          {error}
        </span>
      )}
    </div>
  )
}

function NativeSelect<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string
  value: T
  onChange: (v: T) => void
  options: readonly { value: T; label: string }[]
}) {
  return (
    <span className="relative inline-flex min-w-0">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cx(INPUT, 'w-full cursor-pointer appearance-none pr-7')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <IconChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted"
      />
    </span>
  )
}

function AgentForm({
  formId,
  agent,
  area,
  onDone,
}: {
  formId: string
  agent: Agent | null
  area?: AgentArea
  onDone: () => void
}) {
  const base = useId()
  const others = useAiAgents((s) => s.agents)
    .filter((a) => a.id !== agent?.id)
    .map((a) => a.name)
  const [form, setForm] = useState<Form>(() => toForm(agent ? toDraft(agent) : blankDraft(area)))
  const [tried, setTried] = useState(false)
  const errors: DraftErrors = draftErrors(fromForm(form), others)
  const shown = tried ? errors : {}
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const id = (k: keyof Form) => `${base}-${k}`
  const describedBy = (k: keyof Form, hint = false) =>
    [hint && `${id(k)}-hint`, shown[k] && `${id(k)}-error`].filter(Boolean).join(' ') || undefined
  const invalid = (k: keyof Form) => (shown[k] ? true : undefined)
  // A Pilot or Live agent that still points at its sample link: say so, without blocking the save.
  const stillSample = form.status !== 'Sample' && isSampleUrl(form.url)

  const submit = () => {
    setTried(true)
    if (Object.keys(errors).length) {
      const first = (Object.keys(errors) as (keyof Form)[])[0]
      document.getElementById(id(first === 'audience' ? 'audience' : first))?.focus()
      return
    }
    saveAgent(agent?.id ?? null, fromForm(form))
    onDone()
  }

  const toggleAudience = (a: AgentAudience, on: boolean) =>
    set('audience', on ? [...form.audience, a] : form.audience.filter((x) => x !== a))

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <Field id={id('name')} label="Name" error={shown.name} className="sm:col-span-2">
        <input
          id={id('name')}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Job description writer"
          autoComplete="off"
          aria-invalid={invalid('name')}
          aria-describedby={describedBy('name')}
          className={INPUT}
        />
      </Field>
      <Field id={id('area')} label="HR area">
        <NativeSelect
          id={id('area')}
          value={form.area}
          onChange={(v) => set('area', v)}
          options={AGENT_AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] }))}
        />
      </Field>
      <Field id={id('status')} label="Status">
        <NativeSelect<AgentStatus>
          id={id('status')}
          value={form.status}
          onChange={(v) => set('status', v)}
          options={AGENT_STATUSES.map((s) => ({ value: s, label: s }))}
        />
      </Field>
      <fieldset
        className="flex min-w-0 flex-col gap-1 sm:col-span-2"
        aria-describedby={shown.audience ? `${id('audience')}-error` : undefined}
      >
        <legend className="text-[13px] font-semibold text-ink">Audience</legend>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
          {AGENT_AUDIENCES.map((a, i) => (
            <label key={a} className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
              <input
                id={i === 0 ? id('audience') : undefined}
                type="checkbox"
                checked={form.audience.includes(a)}
                onChange={(e) => toggleAudience(a, e.target.checked)}
                className="size-4 accent-(--ink)"
              />
              {AUDIENCE_LABEL[a]}
            </label>
          ))}
        </div>
        {shown.audience && (
          <span id={`${id('audience')}-error`} className="text-[12px] text-bad-text">
            {shown.audience}
          </span>
        )}
      </fieldset>
      <Field
        id={id('description')}
        label="Description"
        hint="One sentence: what the agent does."
        error={shown.description}
        className="sm:col-span-2"
      >
        <textarea
          id={id('description')}
          rows={2}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          aria-invalid={invalid('description')}
          aria-describedby={describedBy('description', true)}
          className={TEXTAREA}
        />
      </Field>
      <Field id={id('useFor')} label="Use it for" hint="One per line, 2 to 4 is plenty." error={shown.useFor}>
        <textarea
          id={id('useFor')}
          rows={4}
          value={form.useFor}
          onChange={(e) => set('useFor', e.target.value)}
          aria-invalid={invalid('useFor')}
          aria-describedby={describedBy('useFor', true)}
          className={TEXTAREA}
        />
      </Field>
      <Field
        id={id('dontUseFor')}
        label="Don't use it for"
        hint="One per line. Say who decides."
        error={shown.dontUseFor}
      >
        <textarea
          id={id('dontUseFor')}
          rows={4}
          value={form.dontUseFor}
          onChange={(e) => set('dontUseFor', e.target.value)}
          aria-invalid={invalid('dontUseFor')}
          aria-describedby={describedBy('dontUseFor', true)}
          className={TEXTAREA}
        />
      </Field>
      <Field
        id={id('examplePrompts')}
        label="Example prompts"
        hint="One per line. Each gets a Copy button."
        error={shown.examplePrompts}
        className="sm:col-span-2"
      >
        <textarea
          id={id('examplePrompts')}
          rows={3}
          value={form.examplePrompts}
          onChange={(e) => set('examplePrompts', e.target.value)}
          aria-invalid={invalid('examplePrompts')}
          aria-describedby={describedBy('examplePrompts', true)}
          className={TEXTAREA}
        />
      </Field>
      <Field
        id={id('dataSources')}
        label="Data sources"
        hint="One per line, such as the HRIS or policy pages."
        error={shown.dataSources}
      >
        <textarea
          id={id('dataSources')}
          rows={3}
          value={form.dataSources}
          onChange={(e) => set('dataSources', e.target.value)}
          aria-invalid={invalid('dataSources')}
          aria-describedby={describedBy('dataSources', true)}
          className={TEXTAREA}
        />
      </Field>
      <Field id={id('ownerTeam')} label="Owner team" error={shown.ownerTeam}>
        <input
          id={id('ownerTeam')}
          value={form.ownerTeam}
          onChange={(e) => set('ownerTeam', e.target.value)}
          placeholder="People operations"
          autoComplete="off"
          aria-invalid={invalid('ownerTeam')}
          aria-describedby={describedBy('ownerTeam')}
          className={INPUT}
        />
      </Field>
      <Field
        id={id('url')}
        label="Glean link"
        hint="Opens in a new tab. Web links only (https://)."
        error={shown.url}
        className="sm:col-span-2"
      >
        <input
          id={id('url')}
          type="text"
          inputMode="url"
          spellCheck={false}
          autoCapitalize="off"
          value={form.url}
          onChange={(e) => set('url', e.target.value)}
          placeholder="https://app.glean.com/chat/agents/..."
          aria-invalid={invalid('url')}
          aria-describedby={
            [describedBy('url', true), stillSample && `${id('url')}-sample`].filter(Boolean).join(' ') ||
            undefined
          }
          className={INPUT}
        />
        {stillSample && (
          <span id={`${id('url')}-sample`} className="text-[12px] text-ink-2">
            This is still the sample link, so the card keeps its Sample link tag. Paste the agent's own Glean
            link.
          </span>
        )}
      </Field>
    </form>
  )
}

/** The add / edit dialog, open while `useAiUi().editing` is set. */
export function AgentDialog() {
  const editing = useAiUi((s) => s.editing)
  const close = useAiUi((s) => s.closeEdit)
  const agents = useAiAgents((s) => s.agents)
  const agent = editing?.mode === 'edit' ? (agents.find((a) => a.id === editing.id) ?? null) : null
  const open = !!editing && (editing.mode === 'add' || !!agent)
  const formKey = editing ? (editing.mode === 'edit' ? editing.id : `add-${editing.area ?? ''}`) : 'closed'
  const formId = `ai-agent-form-${formKey}`
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close()
      }}
      title={agent ? `Edit ${agent.name}` : 'Add an agent'}
      description="Changes are kept in this browser. Agents assist and people decide, so every agent needs at least one guardrail."
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            {agent ? 'Save changes' : 'Add agent'}
          </Button>
        </>
      }
    >
      {open && (
        <AgentForm
          key={formKey}
          formId={formId}
          agent={agent}
          area={editing?.mode === 'add' ? editing.area : undefined}
          onDone={close}
        />
      )}
    </Dialog>
  )
}
