/**
 * Publish and import (docs/SECURITY-CENTER.md, "Publish and load"). Publish checks the draft the
 * way Census will when it loads the file, then downloads `access-policy.json` and says how to put
 * it in force. Import reads a policy file into the draft (to edit the one in force, or review
 * someone else's), with the changes it would make shown before anything is applied.
 */
import { useId, useMemo, useRef, useState } from 'react'
import { MODE_LABEL } from '@/access/modes'
import {
  buildPolicyFile,
  type Change,
  draftChanges,
  importIntoDraft,
  isPolicyRole,
  POLICY_FILE_NAME,
  policyFileText,
  type ReadPolicy,
  readPolicyFile,
  screenLines,
} from '@/access/overrides'
import { INPUT } from '@/app/settings/ui'
import { Dialog } from '@/components/Dialog'
import { IconDownload, IconUpload } from '@/components/icons'
import { Grid } from '@/components/Section'
import { toast } from '@/components/toast'
import { Button, cx, SeverityIcon } from '@/components/ui'
import { downloadBlob } from '@/lib/export/download'
import { plural } from '@/lib/format'
import { useDev } from '../../store'
import { surfaceCatalog, surfaceLabel } from '../inventory'
import { useDraft, usePolicy } from '../store'
import { when } from './Changes'

const label = (s: string) => surfaceLabel(s)

export function Publish() {
  const draft = useDraft((s) => s.draft)
  const setDraft = useDraft((s) => s.set)
  const inForce = usePolicy((s) => s.inForce.lines)
  const scan = useDev((s) => s.scans.developer)
  const catalog = useMemo(() => surfaceCatalog(scan?.figures ?? []), [scan])
  const [by, setBy] = useState(draft?.author ?? '')
  const [notes, setNotes] = useState(draft?.notes ?? '')
  const [incoming, setIncoming] = useState<(ReadPolicy & { ok: true; name: string }) | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const ids = { by: useId(), notes: useId() }
  if (!draft) return null
  const checked = screenLines(draft.lines, catalog)
  const pending = draftChanges(draft.lines, inForce, label)
  const ready = !checked.skipped.length && by.trim().length > 0

  const publish = () => {
    if (!ready) return
    const file = buildPolicyFile({ lines: checked.lines, publishedBy: by, notes })
    downloadBlob(new Blob([policyFileText(file)], { type: 'application/json' }), POLICY_FILE_NAME)
    const at = file.publishedAt
    setDraft({
      ...draft,
      author: by.trim(),
      notes,
      log: [
        ...draft.log,
        {
          at,
          by: by.trim(),
          what: `Published ${POLICY_FILE_NAME} with ${plural(file.overrides.length, 'line')}`,
          why: notes.trim(),
        },
      ],
    })
    toast(`${POLICY_FILE_NAME} downloaded`, {
      tone: 'good',
      description: 'Put it at public/access-policy.json in the Census repository and redeploy.',
    })
  }

  const onImport = async (file: File | undefined) => {
    if (!file) return
    let text: string
    try {
      text = await file.text()
    } catch {
      toast('The file could not be read', { tone: 'critical' })
      return
    }
    const r = readPolicyFile(text, catalog)
    if (!r.ok) {
      toast('Not imported', { tone: 'critical', description: r.why })
      return
    }
    setIncoming({ ...r, name: file.name })
  }

  return (
    <Grid>
      <section
        aria-labelledby="sec-publish-title"
        className="col-span-full rounded-sheet bg-sheet px-4 pt-4 pb-5 lg:col-span-7 lg:px-5"
      >
        <h2 id="sec-publish-title" className="cut-head text-title font-semibold">
          Publish
        </h2>
        <p className="mt-0.5 max-w-[70ch] text-small text-ink-2">
          Publishing downloads {POLICY_FILE_NAME} with every override in the draft. It is in force for
          everyone once it is on the site; until then nothing changes, here or anywhere.
        </p>
        <p className="mt-2 text-small text-ink">
          {pending.length
            ? `The draft changes ${plural(pending.length, 'surface')} from what is in force, and holds ${plural(draft.lines.length, 'override')} in all.`
            : `The draft is the same as what is in force (${plural(draft.lines.length, 'override')}).`}
        </p>
        {checked.skipped.length > 0 && (
          <div role="alert" className="mt-3 flex flex-col gap-1.5 text-small text-ink">
            <p className="flex items-start gap-2">
              <SeverityIcon severity="critical" className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-semibold">
                  {plural(checked.skipped.length, 'line')} of the draft would not apply,
                </span>{' '}
                so it cannot be published yet. Change them in the matrix, or take them out.
              </span>
            </p>
            <ul className="ml-6 list-disc text-ink-2">
              {checked.skipped.map((s) => (
                <li key={`${s.index}`}>
                  {isPolicyRole(s.role) ? MODE_LABEL[s.role] : s.role}: {label(s.surface)}. {s.why}
                </li>
              ))}
            </ul>
            <div>
              <Button
                size="sm"
                onClick={() =>
                  setDraft({
                    ...draft,
                    lines: checked.lines,
                    log: [
                      ...draft.log,
                      {
                        at: new Date().toISOString(),
                        by: draft.author,
                        what: `Took out ${plural(checked.skipped.length, 'line')} that would not apply`,
                        why: 'Publish check',
                      },
                    ],
                  })
                }
              >
                Take them out of the draft
              </Button>
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-3">
          <label htmlFor={ids.by} className="flex flex-col gap-1 text-small font-semibold text-ink">
            Published by
            <input
              id={ids.by}
              className={INPUT}
              value={by}
              onChange={(e) => setBy(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label htmlFor={ids.notes} className="flex flex-col gap-1 text-small font-semibold text-ink">
            Notes
            <span className="text-meta font-normal text-muted">
              What this version changes and why, for whoever reads it next.
            </span>
            <textarea
              id={ids.notes}
              rows={3}
              className={cx(INPUT, 'h-auto py-1.5 leading-snug')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div>
            <Button variant="primary" icon={<IconDownload />} disabled={!ready} onClick={publish}>
              Publish {POLICY_FILE_NAME}
            </Button>
          </div>
        </div>
        <ol className="mt-5 ml-5 flex list-decimal flex-col gap-1.5 border-t border-rule pt-4 text-small text-ink-2">
          <li>
            Put the file at <span className="font-mono text-meta text-ink">public/access-policy.json</span> in
            the Census repository.
          </li>
          <li>
            Redeploy: <span className="font-mono text-meta text-ink">npm run deploy</span>. The one-file build
            embeds the file when it is built, and the site gets a copy beside its page.
          </li>
          <li>
            Census loads it for everyone when it starts. In force on this page shows which file is loaded.
          </li>
        </ol>
      </section>
      <section
        aria-labelledby="sec-import-title"
        className="col-span-full self-start rounded-sheet bg-sheet px-4 pt-4 pb-5 lg:col-span-5 lg:px-5"
      >
        <h2 id="sec-import-title" className="cut-head text-title font-semibold">
          Import a policy file
        </h2>
        <p className="mt-0.5 text-small text-ink-2">
          Load a policy file into the draft, to edit the one in force or review someone else's. You see what
          it would change before it applies; the policy in force does not change.
        </p>
        <div className="mt-3">
          <Button icon={<IconUpload />} onClick={() => fileRef.current?.click()}>
            Import a policy file…
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void onImport(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </section>
      <ImportPreview
        incoming={incoming}
        onClose={() => setIncoming(null)}
        onApply={(reason, who) => {
          if (!incoming) return
          const what = `Imported ${incoming.name}${incoming.file.publishedBy ? `, published by ${incoming.file.publishedBy}` : ''}${incoming.file.publishedAt ? ` on ${when(incoming.file.publishedAt)}` : ''}`
          setDraft(
            importIntoDraft(draft, incoming.lines, { reason, by: who, at: new Date().toISOString() }, what),
          )
          toast('Imported into the draft', {
            tone: 'good',
            description: plural(incoming.lines.length, 'override'),
          })
          setIncoming(null)
        }}
      />
    </Grid>
  )
}

function ImportPreview({
  incoming,
  onClose,
  onApply,
}: {
  incoming: (ReadPolicy & { ok: true; name: string }) | null
  onClose: () => void
  onApply: (reason: string, by: string) => void
}) {
  const draft = useDraft((s) => s.draft)
  const [reason, setReason] = useState('')
  const [by, setBy] = useState(draft?.author ?? '')
  const ids = { reason: useId(), by: useId() }
  const changes: Change[] = incoming && draft ? draftChanges(incoming.lines, draft.lines, label) : []
  const ready = reason.trim() && by.trim()
  return (
    <Dialog
      open={!!incoming}
      onOpenChange={(o) => !o && onClose()}
      title="Import into the draft"
      description={
        incoming
          ? `${incoming.name}: ${plural(incoming.total, 'line')}${incoming.file.publishedBy ? `, published by ${incoming.file.publishedBy}` : ''}${incoming.file.publishedAt ? ` on ${when(incoming.file.publishedAt)}` : ''}. The draft's lines are replaced by the file's.`
          : undefined
      }
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} onClick={() => onApply(reason, by)}>
            Put in the draft
          </Button>
        </>
      }
    >
      {incoming && (
        <div className="flex flex-col gap-3">
          {incoming.file.notes && <p className="text-small text-ink-2">Notes: {incoming.file.notes}</p>}
          <div>
            <p className="text-small font-semibold text-ink">
              {changes.length
                ? `What it changes in the draft (${changes.length})`
                : 'It changes nothing in the draft.'}
            </p>
            {changes.length > 0 && (
              <ul className="mt-1 max-h-60 overflow-y-auto text-small text-ink-2">
                {changes.map((c) => (
                  <li key={`${c.role}|${c.surface}`} className="border-b border-rule py-1 last:border-b-0">
                    {c.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {incoming.skipped.length > 0 && (
            <div>
              <p className="text-small font-semibold text-ink">Left out ({incoming.skipped.length})</p>
              <ul className="mt-1 max-h-40 overflow-y-auto text-small text-ink-2">
                {incoming.skipped.map((s) => (
                  <li key={s.index} className="border-b border-rule py-1 last:border-b-0">
                    Line {s.index + 1}: {isPolicyRole(s.role) ? MODE_LABEL[s.role] : s.role || 'No role'},{' '}
                    {s.surface ? label(s.surface) : 'no surface'}. {s.why}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label htmlFor={ids.reason} className="flex flex-col gap-1 text-small font-semibold text-ink">
            Reason
            <input
              id={ids.reason}
              className={INPUT}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label htmlFor={ids.by} className="flex flex-col gap-1 text-small font-semibold text-ink">
            Your name
            <input id={ids.by} className={INPUT} value={by} onChange={(e) => setBy(e.target.value)} />
          </label>
        </div>
      )}
    </Dialog>
  )
}
