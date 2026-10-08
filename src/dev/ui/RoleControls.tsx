/**
 * The two selects "Preview a role" and "Scan as role" share (docs/ROLES-V2.md 5.13): a role, and
 * for a role that needs one, its pick (a business unit, a region, a recruiter or a manager), listed
 * as the pick dialogs list them. A pick made here is kept on this page until reload; it never
 * changes the mode or the pick `census:mode` remembers.
 */
import { useId } from 'react'
import { PICKER_COPY } from '@/access/copy'
import { MODE_LABEL, type Mode, type ModePicks, PICK_OF } from '@/access/modes'
import { picksOfState, useMode } from '@/access/store'
import { currentRowKey } from '@/access/ui/pickModel'
import { usePickRows } from '@/access/ui/usePickRows'
import { PICK_NOUN, picksFor } from '../roles'
import { useDev } from '../store'
import { SELECT } from './shared'

/** The picks roles are laid out with on this page: the page's own, else the remembered ones. */
export function usePagePicks(): ModePicks {
  const picks = useMode((s) => s.picks)
  const managerId = useMode((s) => s.managerId)
  const page = useDev((s) => s.pagePicks)
  return picksFor(picksOfState({ picks, managerId }), page)
}

export function RoleSelect({
  label,
  value,
  modes,
  onChange,
  placeholder,
}: {
  label: string
  value: Mode | null
  modes: readonly Mode[]
  onChange: (mode: Mode) => void
  /** The first option while nothing is picked ("Choose a role"). */
  placeholder?: string
}) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-meta text-ink-2">
      <span className="whitespace-nowrap">{label}</span>
      <select
        id={id}
        className={`${SELECT} min-w-0 max-w-[16rem]`}
        value={value ?? ''}
        onChange={(e) => {
          const m = modes.find((x) => x === e.target.value)
          if (m) onChange(m)
        }}
      >
        {!value && <option value="">{placeholder ?? 'Choose a role'}</option>}
        {modes.map((m) => (
          <option key={m} value={m}>
            {MODE_LABEL[m]}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The pick a role is laid out for; nothing for a role that needs none. */
export function PickSelect({ mode, picks }: { mode: Mode; picks: ModePicks }) {
  const id = useId()
  const kind = PICK_OF[mode]
  const { rows } = usePickRows(kind)
  if (!kind) return null
  const current = currentRowKey(kind, picks, rows)
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-meta text-ink-2">
      <span className="whitespace-nowrap">{PICK_NOUN[kind]}</span>
      <select
        id={id}
        className={`${SELECT} min-w-0 max-w-[16rem]`}
        value={current ?? ''}
        onChange={(e) => {
          const row = rows.find((r) => r.key === e.target.value && r.pickable)
          if (row) useDev.getState().setPagePick(row.pick)
        }}
      >
        {!current && <option value="">{PICKER_COPY[kind].title}</option>}
        {rows.map((r) => (
          <option key={r.key} value={r.key} disabled={!r.pickable}>
            {r.aside ? `${r.name} · ${r.aside}` : r.name}
          </option>
        ))}
      </select>
    </label>
  )
}
