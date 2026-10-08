/**
 * Changes (docs/SECURITY-CENTER.md, "The editor"): the draft against what is in force, with Undo
 * per change; what is in force against the built-in defaults; and the change log (who typed their
 * name, when, why), exportable like any table.
 */
import { useState } from 'react'
import { type Change, draftChanges, inForceChanges, type PolicyRole, undoInDraft } from '@/access/overrides'
import { Figure } from '@/charts'
import { Dialog } from '@/components/Dialog'
import { Grid } from '@/components/Section'
import { toast } from '@/components/toast'
import { Button } from '@/components/ui'
import { plural } from '@/lib/format'
import { ABOUT_APP } from '../../ui/shared'
import { surfaceLabel } from '../inventory'
import { useDraft, usePolicy } from '../store'

const label = (s: string) => surfaceLabel(s)

/** "8 Oct 2026, 09:14". */
export function when(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // Both in this browser's time zone, so a change made late in the evening keeps its own date.
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${date}, ${time}`
}

function ChangeList({
  title,
  dek,
  changes,
  empty,
  onUndo,
}: {
  title: string
  dek: string
  changes: readonly Change[]
  empty: string
  onUndo?: (c: Change) => void
}) {
  return (
    <section className="col-span-full rounded-sheet bg-sheet">
      <div className="px-4 pt-4 pb-3 lg:px-5">
        <h2 className="cut-head text-title font-semibold">{title}</h2>
        <p className="mt-0.5 text-small text-ink-2">{dek}</p>
      </div>
      {changes.length ? (
        <ul className="border-t border-rule">
          {changes.map((c) => (
            <li
              key={`${c.role}|${c.surface}`}
              className="flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5 last:border-b-0 lg:px-5"
            >
              <span className="min-w-0 flex-1 basis-72">
                <span className="block text-small text-ink">{c.text}</span>
                <span className="block text-meta text-muted">
                  {c.reason ? `Reason: ${c.reason}` : 'No reason given'}
                  {c.by ? `. ${c.by}` : ''}
                  {c.at ? `, ${when(c.at)}` : ''}
                </span>
              </span>
              {onUndo && (
                <Button size="sm" variant="ghost" onClick={() => onUndo(c)}>
                  Undo
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-rule px-4 py-4 text-small text-muted lg:px-5">{empty}</p>
      )}
    </section>
  )
}

export function Changes() {
  const draft = useDraft((s) => s.draft)
  const setDraft = useDraft((s) => s.set)
  const restart = useDraft((s) => s.restart)
  const inForce = usePolicy((s) => s.inForce.lines)
  const [undoing, setUndoing] = useState<Change | null>(null)
  const [restarting, setRestarting] = useState(false)
  if (!draft) return null
  const pending = draftChanges(draft.lines, inForce, label)
  const live = inForceChanges(inForce, label)
  const log = [...draft.log]
    .reverse()
    .map((e) => ({ when: when(e.at), at: e.at, by: e.by || '—', what: e.what, why: e.why || '—' }))
  const undo = (c: Change) => {
    setDraft(
      undoInDraft(
        draft,
        inForce,
        c.role as PolicyRole,
        c.surface,
        { reason: 'Undone in Changes', by: draft.author, at: new Date().toISOString() },
        label,
      ),
    )
    toast('Undone in the draft', { tone: 'good', description: c.text })
    setUndoing(null)
  }
  return (
    <Grid>
      <ChangeList
        title="Draft against what is in force"
        dek="What publishing the draft would change. Undo puts one surface back as it is in force."
        changes={pending}
        empty="The draft is the same as what is in force."
        onUndo={setUndoing}
      />
      <ChangeList
        title="In force against the defaults"
        dek="What the policy file in force changes from the built-in defaults, line by line."
        changes={live}
        empty="Nothing: the built-in defaults are in force."
      />
      <Figure
        id="dev-security-log"
        title="Change log"
        subtitle="Every change made to this draft: when, who typed their name, what and why"
        data={log}
        columns={[
          { key: 'when', label: 'When', width: 18 },
          { key: 'by', label: 'Who', width: 16 },
          { key: 'what', label: 'What', width: 50 },
          { key: 'why', label: 'Why', width: 40 },
        ]}
        definitions={[ABOUT_APP]}
        note={`${plural(log.length, 'change')} · kept in this browser and in the settings file`}
        gate={false}
        span={12}
        tableOnly
        table={{ maxRows: 15 }}
        empty={log.length ? null : 'No changes yet.'}
        actions={
          <Button size="sm" variant="ghost" onClick={() => setRestarting(true)}>
            Start again from what is in force
          </Button>
        }
      />
      <Dialog
        open={!!undoing}
        onOpenChange={(o) => !o && setUndoing(null)}
        title="Undo this change"
        description={undoing?.text}
        footer={
          <>
            <Button variant="ghost" onClick={() => setUndoing(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => undoing && undo(undoing)}>
              Undo in the draft
            </Button>
          </>
        }
      />
      <Dialog
        open={restarting}
        onOpenChange={setRestarting}
        title="Start again from what is in force"
        description="The draft's lines are replaced by the policy in force. The change log is kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestarting(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                restart()
                setRestarting(false)
                toast('The draft starts from what is in force', { tone: 'good' })
              }}
            >
              Start again
            </Button>
          </>
        }
      />
    </Grid>
  )
}
