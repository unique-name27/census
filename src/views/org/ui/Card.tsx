/**
 * One person card: a small sheet with a thin color key on its top edge, name in the condensed cut,
 * title, department and location, counts in tabular figures, and flag icons. Real DOM so text
 * stays crisp and accessible at every zoom.
 */
import { IconCritical, SeverityIcon } from '@/components'
import { cx } from '@/components/ui'
import type { Employee } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { type Flag, type PlacedCard, type ReqStub, STRUCTURAL } from '../engine'

export type DropState = 'ok' | 'blocked' | null

export interface CardProps {
  card: PlacedCard
  person: Employee | undefined
  req: ReqStub | undefined
  companySize: number
  directs: number
  total: number
  flags: readonly Flag[] | undefined
  showFlags: boolean
  color: string
  selected: boolean
  /** The tree's single tab stop. */
  tabbable: boolean
  dimmed: boolean
  expandable: boolean
  expanded: boolean
  changed: boolean
  dragging: boolean
  drop: DropState
  setSize: number
  posInSet: number
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}

const pos = (c: PlacedCard) => ({ left: c.x, top: c.y, width: c.w, height: c.h })

export function Card(p: CardProps) {
  const { card } = p
  if (card.kind === 'req') return <ReqCard card={card} req={p.req} />

  const e = p.person
  const name = e?.name ?? 'Whole company'
  const flags = p.showFlags
    ? (p.flags ?? []).filter((f) => STRUCTURAL.has(f.kind) || f.kind === 'placement')
    : []
  const newHire = p.showFlags && (p.flags ?? []).some((f) => f.kind === 'new-hire')
  const counts = e
    ? p.directs > 0
      ? `${p.directs} direct · ${p.total} org`
      : ''
    : `${p.companySize.toLocaleString('en-US')} people`
  const contingent = e?.employmentType && e.employmentType !== 'Employee' ? e.employmentType : null
  const label = [
    name,
    e?.jobTitle,
    counts,
    contingent,
    ...flags.map((f) => f.label),
    newHire ? 'New hire' : '',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div
      data-card={card.id}
      data-person={e ? '1' : undefined}
      role="treeitem"
      aria-level={card.depth + 1}
      aria-setsize={p.setSize}
      aria-posinset={p.posInSet}
      aria-selected={p.selected}
      aria-expanded={p.expandable ? p.expanded : undefined}
      aria-label={label}
      tabIndex={p.tabbable ? 0 : -1}
      onClick={() => p.onSelect(card.id)}
      className={cx(
        'group absolute flex cursor-pointer flex-col rounded-sheet bg-sheet text-left transition-[opacity,box-shadow] duration-150 select-none',
        p.selected
          ? 'shadow-[0_0_0_2px_var(--ink)]'
          : p.drop === 'ok'
            ? 'shadow-[0_0_0_2px_var(--link)]'
            : p.drop === 'blocked'
              ? 'shadow-[0_0_0_2px_var(--critical)]'
              : p.changed
                ? 'shadow-[inset_0_0_0_1px_var(--ink-2)]'
                : 'shadow-[inset_0_0_0_1px_var(--rule)] hover:shadow-[inset_0_0_0_1px_var(--rule-strong)]',
        p.dimmed && !p.selected && 'opacity-35',
        p.dragging && 'opacity-40',
      )}
      style={pos(card)}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px] rounded-t-sheet"
        style={{ background: p.color }}
      />
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-2.5 pb-2">
        <div className="flex items-baseline gap-2">
          <span className="cut-head min-w-0 flex-1 truncate text-[13.5px] leading-[18px] font-semibold text-ink">
            {name}
          </span>
          {e?.level && <span className="shrink-0 font-mono text-[11px] text-muted">{e.level}</span>}
        </div>
        <div className="truncate text-[12px] leading-4 text-ink-2">
          {e ? e.jobTitle : 'Everyone active on the as-of date'}
        </div>
        {e && (
          <div className="truncate text-[11px] leading-4 text-muted">
            {e.department} · {e.location}
          </div>
        )}
        <div className="mt-auto flex items-center gap-1.5 text-[11px] leading-4 text-ink-2">
          {counts && <span className="tnum whitespace-nowrap">{counts}</span>}
          {contingent && <span className="text-muted">{contingent}</span>}
          {newHire && <span className="text-muted">New hire</span>}
          {flags.length > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-0.5" aria-hidden="true">
              {flags.slice(0, 3).map((f) => (
                <span key={f.kind} title={f.label} className="inline-flex">
                  <SeverityIcon severity={f.severity} className="size-3.5" />
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
      {p.drop === 'blocked' && (
        <span className="absolute -top-2.5 right-2 inline-flex h-5 items-center gap-1 rounded-[3px] bg-sheet px-1.5 text-[11px] font-semibold text-ink shadow-[0_0_0_1px_var(--critical)]">
          <IconCritical className="size-3 text-critical" />
          Blocked
        </span>
      )}
      {p.expandable && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={p.expanded ? `Hide reports of ${name}` : `Show reports of ${name}`}
          onClick={(ev) => {
            ev.stopPropagation()
            p.onToggle(card.id)
          }}
          className="tnum absolute -bottom-2.5 left-1/2 inline-flex h-5 min-w-7 -translate-x-1/2 items-center justify-center gap-0.5 rounded-control bg-sheet px-1.5 text-[11px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--rule-strong)] hover:bg-sheet-2 hover:text-ink"
        >
          {p.expanded ? <Minus /> : <>+{e ? p.directs : ''}</>}
        </button>
      )}
    </div>
  )
}

function Minus() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ReqCard({ card, req }: { card: PlacedCard; req: ReqStub | undefined }) {
  return (
    <div
      data-card={card.id}
      role="treeitem"
      aria-level={card.depth + 1}
      aria-selected={false}
      aria-label={`Open role: ${req?.jobTitle ?? ''}`}
      tabIndex={-1}
      className="absolute flex flex-col rounded-sheet border border-dashed border-rule-strong px-3 pt-2 pb-2 text-left"
      style={pos(card)}
    >
      <span className="eyebrow">Open role</span>
      <span className="cut-head truncate text-[13px] leading-[18px] font-semibold text-ink-2">
        {req?.jobTitle ?? 'Requisition'}
      </span>
      <span className="truncate text-[11px] leading-4 text-muted">
        {[req?.level, req?.location].filter(Boolean).join(' · ')}
      </span>
      <span className="mt-auto truncate text-[11px] leading-4 text-muted">
        <span className="font-mono">{req?.reqId}</span>
        {req ? ` · opened ${formatDate(req.openedDate)}` : ''}
        {req && req.openings > 1 ? ` · ${req.openings} openings` : ''}
      </span>
    </div>
  )
}
