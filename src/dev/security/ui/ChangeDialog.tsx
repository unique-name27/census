/**
 * The one dialog every change in the Security center goes through: pick a value, say why (a short
 * reason is required) and who you are, then Apply to the draft. A change a guard rail forbids is
 * refused here with the rule, and Apply stays off. What the change takes along is said before it
 * is made.
 */
import { useId, useState } from 'react'
import type { PolicyRole } from '@/access/overrides'
import { setManyInDraft } from '@/access/overrides'
import { INPUT } from '@/app/settings/ui'
import { Dialog } from '@/components/Dialog'
import { toast } from '@/components/toast'
import { Button, cx, SeverityIcon } from '@/components/ui'
import { surfaceLabel } from '../inventory'
import { useDraft } from '../store'

export interface ChangeOption {
  value: string
  label: string
  hint?: string
}

export interface ChangeSpec {
  role: PolicyRole
  title: string
  description?: string
  options: readonly ChangeOption[]
  /** The value now, in the draft. */
  current: string
  /** The built-in value, marked in the list. */
  builtIn: string
  /** The value in force, when it differs from the built-in. */
  inForce?: string
  /** For a surface that takes limited: the sentence for the limit, as the draft has it. */
  how?: string
  /** Whether "Limited" asks for its sentence. */
  asksHow?: boolean
  /** The surfaces a value writes. */
  changes: (value: string, how: string) => { surface: string; decision: string; how?: string }[]
  /** Why a value is refused, or null. */
  refuse: (value: string) => string | null
  /** One sentence on what else a value moves, or null. */
  knockOn?: (value: string) => string | null
}

const now = () => new Date().toISOString()

export function ChangeDialog({ spec, onClose }: { spec: ChangeSpec | null; onClose: () => void }) {
  return (
    <Dialog
      open={!!spec}
      onOpenChange={(o) => !o && onClose()}
      title={spec?.title ?? ''}
      description={spec?.description}
      width={560}
    >
      {spec && <ChangeForm key={`${spec.role}|${spec.title}`} spec={spec} onClose={onClose} />}
    </Dialog>
  )
}

function ChangeForm({ spec, onClose }: { spec: ChangeSpec; onClose: () => void }) {
  const draft = useDraft((s) => s.draft)
  const setDraft = useDraft((s) => s.set)
  const [value, setValue] = useState(spec.current)
  const [how, setHow] = useState(spec.how ?? '')
  const [reason, setReason] = useState('')
  const [by, setBy] = useState(draft?.author ?? '')
  const ids = { group: useId(), how: useId(), reason: useId(), by: useId(), refused: useId() }
  const refused = spec.refuse(value)
  const knock = spec.knockOn?.(value) ?? null
  const unchanged = value === spec.current && (value !== 'limited' || how.trim() === (spec.how ?? '').trim())
  const ready = !refused && !unchanged && reason.trim().length > 0 && by.trim().length > 0
  const apply = () => {
    if (!draft || !ready) return
    const changes = spec.changes(value, how).map((c) => ({ ...c, role: spec.role }))
    setDraft(setManyInDraft(draft, changes, { reason, by, at: now() }, (s) => surfaceLabel(s)))
    toast('Changed in the draft', {
      tone: 'good',
      description: 'Nothing is in force until the draft is published and the file is put on the site.',
    })
    onClose()
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
    >
      <fieldset
        className="m-0 flex flex-col gap-1 border-0 p-0"
        aria-describedby={refused ? ids.refused : undefined}
      >
        <legend className="mb-1 text-small font-semibold text-ink">Decision</legend>
        {spec.options.map((o) => (
          <label
            key={o.value}
            className={cx(
              'flex cursor-pointer items-start gap-2.5 rounded-control px-2 py-1.5 hover:bg-hover',
              value === o.value && 'bg-sheet-2',
            )}
          >
            <input
              type="radio"
              name={ids.group}
              value={o.value}
              checked={value === o.value}
              onChange={() => setValue(o.value)}
              className="mt-[3px] size-3.5 shrink-0 accent-(--ink)"
            />
            <span className="min-w-0">
              <span className="block text-small font-medium text-ink">
                {o.label}
                {o.value === spec.builtIn && <span className="ml-1.5 font-normal text-muted">built in</span>}
                {spec.inForce && o.value === spec.inForce && o.value !== spec.builtIn && (
                  <span className="ml-1.5 font-normal text-muted">in force</span>
                )}
              </span>
              {o.hint && <span className="block text-meta leading-snug text-ink-2">{o.hint}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      {spec.asksHow && value === 'limited' && (
        <label htmlFor={ids.how} className="flex flex-col gap-1 text-small font-semibold text-ink">
          What the limit is
          <span className="text-meta font-normal text-muted">
            One sentence the Developer page shows, such as "Requisitions only, no candidates."
          </span>
          <input id={ids.how} className={INPUT} value={how} onChange={(e) => setHow(e.target.value)} />
        </label>
      )}
      {refused ? (
        <p id={ids.refused} role="alert" className="flex items-start gap-2 text-small text-ink">
          <SeverityIcon severity="critical" className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">Census will not make this change.</span> {refused}
          </span>
        </p>
      ) : (
        knock && <p className="text-small text-ink-2">{knock}</p>
      )}
      <label htmlFor={ids.reason} className="flex flex-col gap-1 text-small font-semibold text-ink">
        Reason
        <span className="text-meta font-normal text-muted">
          Required. For example "Finance asked for the hiring plan".
        </span>
        <textarea
          id={ids.reason}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={cx(INPUT, 'h-auto py-1.5 leading-snug')}
        />
      </label>
      <label htmlFor={ids.by} className="flex flex-col gap-1 text-small font-semibold text-ink">
        Your name
        <span className="text-meta font-normal text-muted">Kept with the change in the change log.</span>
        <input
          id={ids.by}
          className={INPUT}
          value={by}
          onChange={(e) => setBy(e.target.value)}
          autoComplete="name"
        />
      </label>
      <div className="-mx-5 flex flex-wrap justify-end gap-2 border-t border-rule px-5 pt-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={!ready}>
          Apply to the draft
        </Button>
      </div>
    </form>
  )
}
