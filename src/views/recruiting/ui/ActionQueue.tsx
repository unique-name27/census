/**
 * The action queue: active candidates lacking a timely next step, grouped by who owns the next
 * action. The owners panel lists each owner with a "Copy note" button (a polite, ready-to-send
 * ask composed per needed action); the table beside it is the exportable queue itself. Every
 * count and every row opens the candidates behind it in the drill panel.
 */
import type { ReactNode } from 'react'
import { type Column, Figure } from '@/charts'
import { Button, cx, IconClose, IconCopy, SeverityIcon, spanClass, toast } from '@/components'
import { Drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { writeClipboard } from '@/lib/export/clipboard'
import { fmt, plural } from '@/lib/format'
import type { RecruitingBase } from '../engine/base'
import { activeDrill, candidateDrill, queueOwnerDrill } from '../engine/drills'
import { FIGURE_USES } from '../engine/lineage'
import { ownerNote } from '../engine/messages'
import { FIGURE_METRICS } from '../engine/metricLinks'
import { type QueueGroup, type QueueRow, queueRows } from '../engine/pipeline'
import { RM } from '../metrics'
import { useRecruitingUi } from '../state'
import { defOf, TABLET_FULL } from './common'

/**
 * The queue table: owner, candidate, req, stage, days and the next step. The state label
 * ("Needs scheduling") is left out of the on-screen table because the next step says the same
 * thing in action words ("Schedule the onsite"); with it, an 8-column-wide table wrapped every
 * owner and next step onto two lines. The full rows (state, aging, job title, department, owner
 * role) export as the detail rows.
 */
function queueColumns(b: RecruitingBase): Column<QueueRow>[] {
  const one = (r: QueueRow) => () => candidateDrill(b, r.item)
  return [
    { key: 'owner', label: 'Owner', width: 24 },
    { key: 'candidate', label: 'Candidate', width: 26, drill: one },
    { key: 'reqId', label: 'Req', width: 10 },
    { key: 'stage', label: 'Stage' },
    { key: 'days', label: 'Waiting', format: 'days', drill: one },
    { key: 'nextStep', label: 'Next step', width: 41 },
  ]
}

const QUEUE_DETAIL_COLUMNS: Column<QueueRow>[] = [
  { key: 'owner', label: 'Owner' },
  { key: 'ownerRole', label: 'Owner role' },
  { key: 'candidate', label: 'Candidate' },
  { key: 'applicationId', label: 'Application' },
  { key: 'reqId', label: 'Req' },
  { key: 'title', label: 'Job title' },
  { key: 'department', label: 'Department' },
  { key: 'stage', label: 'Stage' },
  { key: 'stateLabel', label: 'State' },
  { key: 'tier', label: 'Aging' },
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

function OwnersPanel({
  base: b,
  groups,
  total,
}: {
  base: RecruitingBase
  groups: QueueGroup[]
  total: number
}) {
  const owner = useRecruitingUi((s) => s.owner)
  const filterOwner = useRecruitingUi((s) => s.filterOwner)
  const all = groups.flatMap((g) => g.items)
  return (
    <section
      aria-label="Owners"
      // Span 4 beside the span-8 table; on tablets both take the full row (TABLET_FULL), so the
      // panel doesn't sit at half width over an empty half.
      className={cx(spanClass(4), TABLET_FULL, 'flex flex-col self-start rounded-sheet bg-sheet')}
    >
      <header className="border-b border-rule px-4 pt-3.5 pb-2.5">
        <h3 className="cut-head text-title leading-snug font-semibold">Who owns the next step</h3>
        <p className="mt-0.5 text-small leading-snug text-ink-2">
          {total > 0 ? (
            <Drill
              spec={() => activeDrill(b, all, { title: 'Action queue: candidates lacking a next step' })}
              label={`Show the ${plural(total, 'candidate')} in the action queue`}
            >
              {plural(total, 'candidate')}
            </Drill>
          ) : (
            plural(total, 'candidate')
          )}{' '}
          across {plural(groups.length, 'owner')}. Copy a note to send an owner their list.
        </p>
      </header>
      {groups.length === 0 ? (
        <p className="px-4 py-4 text-small text-ink-2">No active candidate lacks a next step.</p>
      ) : (
        <ul className="max-h-[560px] overflow-y-auto py-1">
          {groups.map((g) => {
            const active = owner === g.owner
            return (
              <li key={`${g.role}-${g.owner}`} className="flex items-center gap-1 px-2">
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`Filter the queue to ${g.owner}`}
                  onClick={() => filterOwner(active ? null : g.owner)}
                  className={cx(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-hover',
                    active && 'bg-hover',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-semibold text-ink">{g.owner}</span>
                    <span className="block truncate text-meta text-muted">
                      {g.role} · oldest {fmt(g.oldest, 'days')}
                    </span>
                  </span>
                </button>
                {g.red > 0 && (
                  <span className="inline-flex items-center gap-1 text-meta text-ink-2">
                    <SeverityIcon severity="critical" className="size-3" />
                    <Drill
                      spec={() => queueOwnerDrill(b, g, true)}
                      className="tnum"
                      label={`Show the ${plural(g.red, 'overdue item')} owned by ${g.owner}`}
                    >
                      {g.red}
                    </Drill>
                    <span className="sr-only">overdue</span>
                  </span>
                )}
                <Drill
                  spec={() => queueOwnerDrill(b, g)}
                  className="tnum min-w-7 text-right text-small font-semibold text-ink"
                  label={`Show the ${plural(g.items.length, 'candidate')} owned by ${g.owner}`}
                >
                  {g.items.length}
                </Drill>
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
    <span className="inline-flex h-6 items-center gap-0.5 rounded-chip bg-sheet-3 pr-0.5 pl-2 text-meta font-medium text-ink-2">
      {label}
      <button
        type="button"
        aria-label={`Remove filter ${label}`}
        onClick={onClear}
        className="inline-flex size-5 items-center justify-center rounded-chip text-muted hover:bg-hover hover:text-ink"
      >
        <IconClose className="size-3" />
      </button>
    </span>
  )
}

export function ActionQueue({
  base: b,
  groups,
  aside,
}: {
  base: RecruitingBase
  groups: QueueGroup[]
  /** A figure under the owners panel, in the same span-4 column beside the queue. */
  aside?: ReactNode
}) {
  const owner = useRecruitingUi((s) => s.owner)
  const filterOwner = useRecruitingUi((s) => s.filterOwner)
  const asOf = b.asOf
  const rows = queueRows(groups)
  const shown = rows.filter((r) => owner == null || r.owner === owner)
  const filtered = owner != null
  const chips = owner != null && <Chip label={`Owner: ${owner}`} onClear={() => filterOwner(null)} />
  return (
    <>
      {aside ? (
        <div className={cx(spanClass(4), TABLET_FULL, 'flex min-w-0 flex-col gap-4 self-start')}>
          <OwnersPanel base={b} groups={groups} total={rows.length} />
          {aside}
        </div>
      ) : (
        <OwnersPanel base={b} groups={groups} total={rows.length} />
      )}
      <Figure
        id="recruiting-action-queue"
        uses={FIGURE_USES['recruiting-action-queue']}
        metric={FIGURE_METRICS['recruiting-action-queue']}
        title="Action queue"
        subtitle={`Active candidates who lack a next step (past the usual time) on ${formatDate(asOf)}, by owner of the next action`}
        data={shown}
        columns={queueColumns(b)}
        detail={{ label: 'Queue with states', columns: QUEUE_DETAIL_COLUMNS, rows: () => shown }}
        tableOnly
        span={8}
        actions={chips || undefined}
        table={{
          rowTone: (r) => r.severity,
          search: 'Search candidates, reqs or owners',
          maxRows: 15,
        }}
        empty={
          rows.length === 0
            ? 'No active candidate lacks a next step.'
            : shown.length === 0
              ? 'No candidates match these filters.'
              : null
        }
        definitions={[
          defOf(b, RM.lackingNextStep, { term: 'Lacks a next step' }),
          {
            term: 'Owner',
            text: 'Interview decisions go to the hiring manager, scheduling to the coordinator, new applications and offers to the recruiter. The recruiter is the fallback.',
          },
          {
            term: 'Waiting',
            text: 'Days since the interview for decisions, since the offer for offers out, otherwise days in the current stage.',
          },
          { term: 'Not listed', text: 'Scheduled candidates are in motion and stay out of the queue.' },
        ]}
        note={`${plural(shown.length, 'candidate')}${filtered ? ` of ${fmt(rows.length, 'int')}` : ''} · as of ${formatDate(asOf)}`}
      />
    </>
  )
}
