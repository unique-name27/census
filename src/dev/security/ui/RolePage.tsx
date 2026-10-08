/**
 * The role page (docs/SECURITY-CENTER.md, "The editor"): one role at a time, as a checklist by
 * area: the role itself (offered in the Mode menu, the view it opens on), views and sub-tabs,
 * figures and metrics (found by id, title or metric), data (datasets, record kinds, the person
 * card), pay, Ask, exports, and pages and menus. "Reset this role to defaults" takes every override
 * of the role out of the draft; "Preview" opens the app as the role with the draft laid over it.
 */
import { useId, useMemo, useState } from 'react'
import { HOME_OF, MODE_HINT, MODE_LABEL, PICK_OF } from '@/access/modes'
import {
  overridesOf,
  POLICY_ROLES,
  type PolicyRole,
  ROLE_HOME,
  ROLE_OFFERED,
  resetRoleInDraft,
} from '@/access/overrides'
import { decideUnder } from '@/access/policy'
import { INPUT } from '@/app/settings/ui'
import { Dialog } from '@/components/Dialog'
import { IconEye, IconPencil, IconReset, IconSearch } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button, cx } from '@/components/ui'
import { plural } from '@/lib/format'
import { ListPicker } from '../../ui/shared'
import { type EditRow, type GroupKey, surfaceLabel } from '../inventory'
import { ACCESS_WORD, CARD_LEVELS, cardLevelOf, cellOf, indexLines, PAY_LEVELS, payLevelOf } from '../model'
import { previewAs } from '../preview'
import { useDraft, usePolicy } from '../store'
import { ChangeDialog, type ChangeSpec } from './ChangeDialog'
import { cardSpec, homeSpec, offeredSpec, paySpec, surfaceSpec } from './specs'

/** The areas of the checklist, and the groups of rows each lists. */
const AREAS: readonly { key: string; label: string; groups: readonly GroupKey[]; search?: boolean }[] = [
  { key: 'views', label: 'Views and sub-tabs', groups: ['views', 'tabs'] },
  { key: 'figures', label: 'Figures and metrics', groups: ['figures', 'metrics'], search: true },
  { key: 'data', label: 'Data', groups: ['data'] },
  { key: 'ask', label: 'Ask', groups: ['ask'] },
  { key: 'exports', label: 'Exports', groups: ['exports'] },
  { key: 'pages', label: 'Pages and menus', groups: ['pages'] },
  { key: 'frame', label: 'Other parts', groups: ['frame'] },
]

const VIEWS_FOR_HOME = (rows: readonly EditRow[]) =>
  rows.filter((r) => r.surface.startsWith('view:')).map((r) => ({ key: r.surface.slice(5), label: r.label }))

export function RolePage({
  rows,
  role,
  onRole,
}: {
  rows: readonly EditRow[]
  role: PolicyRole
  onRole: (role: PolicyRole) => void
}) {
  const draft = useDraft((s) => s.draft)
  const setDraft = useDraft((s) => s.set)
  const inForce = usePolicy((s) => s.inForce.lines)
  const [spec, setSpec] = useState<ChangeSpec | null>(null)
  const [area, setArea] = useState(AREAS[0].key)
  const [query, setQuery] = useState('')
  const [resetting, setResetting] = useState(false)
  const lines = draft?.lines ?? []
  const ov = useMemo(() => overridesOf(lines), [lines])
  const draftIx = useMemo(() => indexLines(lines), [lines])
  const forceIx = useMemo(() => indexLines(inForce), [inForce])
  const searchId = useId()
  const own = lines.filter((l) => l.role === role)
  const views = VIEWS_FOR_HOME(rows)
  const home =
    [...lines].reverse().find((l) => l.role === role && l.surface === ROLE_HOME)?.decision ?? HOME_OF[role]
  const offered =
    [...lines].reverse().find((l) => l.role === role && l.surface === ROLE_OFFERED)?.decision !== 'hidden'
  const pay = payLevelOf(role, ov)
  const card = cardLevelOf(role, ov)
  const a = AREAS.find((x) => x.key === area) ?? AREAS[0]
  const q = query.trim().toLowerCase()
  const areaRows = rows
    .filter((r) => a.groups.includes(r.group))
    .filter((r) => !q || `${r.label} ${r.detail}`.toLowerCase().includes(q))
  // Figures and metrics are many: the ones the role hides or that changed first, the rest on a search.
  const listed =
    a.search && !q
      ? areaRows.filter(
          (r) =>
            draftIx.has(`${role}|${r.surface}`) ||
            decideUnder(ov, role, r.surface, r.at, r.info).access !== 'shown',
        )
      : areaRows
  const capped = listed.slice(0, 200)

  const settings: { label: string; value: string; open: () => void }[] = [
    {
      label: 'Offered in the Mode menu',
      value: offered ? 'Offered' : 'Left out',
      open: () => setSpec(offeredSpec(role, lines, inForce)),
    },
    {
      label: 'Opens on',
      value: surfaceLabel(`view:${home}`),
      open: () => setSpec(homeSpec(role, lines, inForce, views)),
    },
    {
      label: 'Pay',
      value: PAY_LEVELS.find((p) => p.value === pay)?.label ?? pay,
      open: () => setSpec(paySpec(role, lines, inForce)),
    },
    {
      label: 'Person card',
      value: CARD_LEVELS.find((c) => c.value === card)?.label ?? card,
      open: () => setSpec(cardSpec(role, lines, inForce)),
    },
  ]

  return (
    <section aria-labelledby="sec-role-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-sheet bg-sheet px-4 pt-4 pb-5 lg:px-5">
        <ListPicker
          label="Role"
          value={role}
          options={POLICY_ROLES.map((m) => ({
            value: m,
            label: MODE_LABEL[m],
            count: lines.filter((l) => l.role === m).length || null,
          }))}
          onChange={onRole}
        />
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-80">
            <h2 id="sec-role-title" className="cut-head text-section font-semibold">
              {MODE_LABEL[role]}
            </h2>
            <p className="mt-0.5 text-small text-ink-2">{MODE_HINT[role]}</p>
            <p className="mt-1 text-meta text-muted">
              {own.length
                ? `${plural(own.length, 'override')} in the draft.`
                : 'On the built-in defaults in the draft.'}
              {PICK_OF[role]
                ? ' The scope kind is fixed by the role; only what shows inside it can change.'
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<IconEye />} onClick={() => previewAs(role, lines, `role:${role}`)}>
              Preview as {MODE_LABEL[role]}
            </Button>
            <Button
              variant="ghost"
              icon={<IconReset />}
              disabled={!own.length}
              onClick={() => setResetting(true)}
            >
              Reset this role to defaults
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-rule pt-3 sm:grid-cols-2">
          {settings.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3">
              <dt className="text-small text-ink-2">{s.label}</dt>
              <dd className="m-0">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<IconPencil className="size-3.5 text-muted" />}
                  onClick={s.open}
                  aria-label={`${s.label}: ${s.value}. Change`}
                >
                  {s.value}
                </Button>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-sheet bg-sheet">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-3 lg:px-5">
          <h3 className="cut-head text-title font-semibold">Checklist</h3>
          <ListPicker
            label="Area"
            value={area}
            options={AREAS.map((x) => ({ value: x.key, label: x.label }))}
            onChange={(k) => {
              setArea(k)
              setQuery('')
            }}
          />
          <label htmlFor={searchId} className="relative flex items-center">
            <span className="sr-only">Find in {a.label}</span>
            <IconSearch className="pointer-events-none absolute left-2.5 size-4 text-muted" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={a.search ? 'Find a figure or metric by id, title or metric' : `Find in ${a.label}`}
              className={cx(INPUT, 'w-full pl-8')}
            />
          </label>
          {a.search && !q && (
            <p className="text-meta text-muted">
              Listing what {MODE_LABEL[role]} hides or limits, and anything changed. Search to find any other.
            </p>
          )}
        </div>
        <ul className="border-t border-rule">
          {capped.map((row) => {
            const cell = cellOf(row, role, ov, draftIx, forceIx)
            return (
              <li
                key={row.surface}
                className="flex items-center gap-3 border-b border-rule px-4 py-1.5 last:border-b-0 lg:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small text-ink">{row.label}</span>
                  <span className="block truncate font-mono text-label text-muted">{row.detail}</span>
                </span>
                {cell.state !== 'default' && (
                  <span className="shrink-0 text-label text-muted">
                    {cell.state === 'draft' ? 'Changed in the draft' : 'Set in force'}
                  </span>
                )}
                <Button
                  size="sm"
                  variant={cell.state === 'draft' ? 'primary' : 'secondary'}
                  className="w-[88px] shrink-0"
                  onClick={() => setSpec(surfaceSpec(row, role, lines, inForce))}
                  aria-label={`${row.label}: ${ACCESS_WORD[cell.decision.access]}. Change`}
                >
                  {ACCESS_WORD[cell.decision.access]}
                </Button>
              </li>
            )
          })}
        </ul>
        {!capped.length && <p className="px-4 py-5 text-small text-muted lg:px-5">Nothing to list here.</p>}
        {listed.length > capped.length && (
          <p className="border-t border-rule px-4 py-3 text-meta text-muted lg:px-5">
            {plural(listed.length - capped.length, 'more surface')} match. Narrow the search to see them.
          </p>
        )}
      </div>
      <ChangeDialog spec={spec} onClose={() => setSpec(null)} />
      <ResetDialog
        open={resetting}
        role={role}
        onClose={() => setResetting(false)}
        onReset={(reason, by) => {
          if (!draft) return
          setDraft(resetRoleInDraft(draft, role, { reason, by, at: new Date().toISOString() }))
          toast(`${MODE_LABEL[role]} is back on its defaults in the draft`, { tone: 'good' })
          setResetting(false)
        }}
      />
    </section>
  )
}

function ResetDialog({
  open,
  role,
  onClose,
  onReset,
}: {
  open: boolean
  role: PolicyRole
  onClose: () => void
  onReset: (reason: string, by: string) => void
}) {
  const author = useDraft((s) => s.draft?.author ?? '')
  const [reason, setReason] = useState('')
  const [by, setBy] = useState(author)
  const ids = { reason: useId(), by: useId() }
  const ready = reason.trim() && by.trim()
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Reset ${MODE_LABEL[role]} to defaults`}
      description="Every override of this role comes out of the draft. What is in force does not change until the draft is published."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} onClick={() => onReset(reason, by)}>
            Reset in the draft
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
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
    </Dialog>
  )
}
