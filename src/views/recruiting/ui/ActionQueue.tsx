/**
 * The action queue: active candidates lacking a timely next step, grouped by who owns the next
 * action. The owners panel lists each owner with a "Copy note" button (a polite, ready-to-send
 * ask composed per needed action); the table beside it is the exportable queue itself.
 */
import { type Column, Figure } from '@/charts'
import { Button, cx, IconClose, IconCopy, SeverityIcon, toast } from '@/components'
import { STAGES } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { writeClipboard } from '@/lib/export/clipboard'
import { fmt, plural } from '@/lib/format'
import { ownerNote } from '../engine/messages'
import { STATE_NAME } from '../engine/nextStep'
import { type QueueGroup, type QueueRow, queueRows } from '../engine/pipeline'
import type { NextState } from '../engine/types'
import { useRecruitingUi } from '../state'

const QUEUE_COLUMNS: Column<QueueRow>[] = [
  { key: 'owner', label: 'Owner' },
  { key: 'candidate', label: 'Candidate' },
  { key: 'reqId', label: 'Req', width: 12 },
  { key: 'title', label: 'Job title' },
  { key: 'stage', label: 'Stage' },
  { key: 'stateLabel', label: 'State' },
  { key: 'days', label: 'Days waiting', format: 'int' },
  { key: 'nextStep', label: 'Next step' },
]

async function copyNote(g: QueueGroup) {
  const text = ownerNote(g.owner, g.items)
  if (!text) return
  try {
    await writeClipboard(text)
    toast(`Note for ${g.owner} copied`, {
      tone: 'good',
      description: `${plural(g.items.length, 'candidate')}, ready to paste into email or chat.`,
    })
  } catch {
    toast('The browser blocked copying', {
      tone: 'critical',
      description: 'Try again from a click on the button.',
    })
  }
}

function OwnersPanel({ groups, total }: { groups: QueueGroup[]; total: number }) {
  const owner = useRecruitingUi((s) => s.owner)
  const filterQueue = useRecruitingUi((s) => s.filterQueue)
  return (
    <section
      aria-label="Owners"
      // Same base span as Figure (col-span-12) so the panel and the table share one track layout on phones.
      className="col-span-12 flex min-w-0 flex-col self-start rounded-sheet bg-sheet lg:col-span-4"
    >
      <header className="border-b border-rule px-4 pt-3.5 pb-2.5">
        <h3 className="cut-head text-[15px] leading-snug font-semibold">Who owns the next step</h3>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
          {plural(total, 'candidate')} across {plural(groups.length, 'owner')}. Copy a note to send an owner
          their list.
        </p>
      </header>
      {groups.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ink-2">Every active candidate has a timely next step.</p>
      ) : (
        <ul className="max-h-[560px] overflow-y-auto py-1">
          {groups.map((g) => {
            const active = owner === g.owner
            return (
              <li key={`${g.role}-${g.owner}`} className="flex items-center gap-1 px-2">
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => filterQueue({ owner: active ? null : g.owner })}
                  className={cx(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-hover',
                    active && 'bg-hover',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{g.owner}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {g.role} · oldest {fmt(g.oldest, 'days')}
                    </span>
                  </span>
                  {g.red > 0 && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-ink-2">
                      <SeverityIcon severity="critical" className="size-3" />
                      <span className="tnum">{g.red}</span>
                      <span className="sr-only">overdue</span>
                    </span>
                  )}
                  <span className="tnum w-7 text-right text-[13px] font-semibold text-ink">
                    {g.items.length}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<IconCopy className="size-3.5" />}
                  aria-label={`Copy note for ${g.owner}`}
                  disabled={g.role === 'Unassigned'}
                  onClick={() => void copyNote(g)}
                >
                  Copy note
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-0.5 rounded-[3px] bg-sheet-3 pr-0.5 pl-2 text-[12px] font-medium text-ink-2">
      {label}
      <button
        type="button"
        aria-label={`Remove filter ${label}`}
        onClick={onClear}
        className="inline-flex size-5 items-center justify-center rounded-[3px] text-muted hover:bg-hover hover:text-ink"
      >
        <IconClose className="size-3" />
      </button>
    </span>
  )
}

export function ActionQueue({ groups, asOf }: { groups: QueueGroup[]; asOf: string }) {
  const { queueStage, queueState, owner, filterQueue, clearQueue } = useRecruitingUi()
  const rows = queueRows(groups)
  const shown = rows.filter(
    (r) =>
      (queueStage == null || r.stageIndex === queueStage) &&
      (queueState == null || r.state === queueState) &&
      (owner == null || r.owner === owner),
  )
  const filtered = queueStage != null || queueState != null || owner != null
  const chips = (
    <div className="flex flex-wrap items-center gap-1.5">
      {queueStage != null && (
        <Chip label={`Stage: ${STAGES[queueStage]}`} onClear={() => filterQueue({ stage: null })} />
      )}
      {queueState != null && (
        <Chip label={STATE_NAME[queueState as NextState]} onClear={() => filterQueue({ state: null })} />
      )}
      {owner != null && <Chip label={`Owner: ${owner}`} onClear={() => filterQueue({ owner: null })} />}
      {filtered && (
        <Button variant="ghost" size="sm" onClick={clearQueue}>
          Show all
        </Button>
      )}
    </div>
  )
  return (
    <>
      <OwnersPanel groups={groups} total={rows.length} />
      <Figure
        id="recruiting-action-queue"
        title="Action queue"
        subtitle={`Active candidates lacking a timely next step on ${formatDate(asOf)}, by owner of the next action`}
        data={shown}
        columns={QUEUE_COLUMNS}
        tableOnly
        span={8}
        actions={filtered ? chips : undefined}
        table={{
          rowTone: (r) => r.severity,
          search: 'Search candidates, reqs or owners',
          maxRows: 15,
        }}
        empty={
          rows.length === 0
            ? 'Every active candidate has a timely next step.'
            : shown.length === 0
              ? 'No candidates match these filters.'
              : null
        }
        definitions={[
          {
            term: 'Lacks a next step',
            text: 'Nothing scheduled and past 1.5× the usual days for the stage (red past 2.5×), interview feedback pending more than 2 days (red past 5), or an offer out more than 5 days (red past 10).',
          },
          {
            term: 'Owner',
            text: 'Interview decisions go to the hiring manager, scheduling to the coordinator, new applications and offers to the recruiter. The recruiter is the fallback.',
          },
          {
            term: 'Days waiting',
            text: 'Days since the interview for decisions, since the offer for offers out, otherwise days in the current stage.',
          },
          { term: 'Not listed', text: 'Scheduled candidates are in motion and stay out of the queue.' },
        ]}
        note={`${plural(shown.length, 'candidate')}${filtered ? ` of ${fmt(rows.length, 'int')}` : ''} · as of ${formatDate(asOf)}`}
      />
    </>
  )
}
