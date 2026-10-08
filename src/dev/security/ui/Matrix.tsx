/**
 * The matrix (docs/SECURITY-CENTER.md, "The editor"): roles as columns, surfaces as rows, one
 * group at a time (a search looks through every group), with "Changed only". Each cell shows the
 * decision under the draft and whether it is built in, set by the policy in force or changed in
 * the draft; clicking it opens the change dialog. The grid is one tab stop: arrow keys move
 * between cells, Enter or Space opens one.
 */
import { type KeyboardEvent, useId, useMemo, useRef, useState } from 'react'
import { MODE_COLUMN } from '@/access/matrix'
import { MODE_LABEL } from '@/access/modes'
import { overridesOf, POLICY_ROLES, type PolicyRole } from '@/access/overrides'
import { INPUT } from '@/app/settings/ui'
import { IconSearch } from '@/components/icons'
import { Button, cx, Switch } from '@/components/ui'
import { plural } from '@/lib/format'
import { ListPicker } from '../../ui/shared'
import { type EditRow, GROUPS, type GroupKey } from '../inventory'
import {
  ACCESS_WORD,
  type Cell,
  cellOf,
  filterRows,
  indexLines,
  NO_ROW_FILTER,
  type RowFilter,
} from '../model'
import { useDraft, usePolicy } from '../store'
import { ChangeDialog, type ChangeSpec } from './ChangeDialog'
import { surfaceSpec } from './specs'

const PAGE = 120

const STATE_WORD: Record<Cell['state'], string> = {
  default: 'built in',
  'in-force': 'set by the policy in force',
  draft: 'changed in this draft',
}

/** A cell's look: plain when built in, outlined when set by the policy in force, filled when changed in the draft. */
function cellClass(c: Cell): string {
  const base =
    'inline-flex h-6 w-full items-center justify-center rounded-chip px-1 text-label font-medium transition-colors'
  if (c.state === 'draft') return cx(base, 'bg-ink text-on-ink hover:bg-ink-2')
  if (c.state === 'in-force') return cx(base, 'text-ink shadow-[inset_0_0_0_1px_var(--ink)] hover:bg-hover')
  return cx(base, c.decision.access === 'shown' ? 'text-ink-2 hover:bg-hover' : 'text-muted hover:bg-hover')
}

export function Legend() {
  return (
    <ul
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-meta text-ink-2"
      aria-label="How cells read"
    >
      <li className="flex items-center gap-1.5">
        <span className="inline-flex h-5 items-center rounded-chip px-1.5 text-label text-ink-2">Shown</span>
        Built in
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-flex h-5 items-center rounded-chip px-1.5 text-label text-ink shadow-[inset_0_0_0_1px_var(--ink)]">
          Hidden
        </span>
        Set by the policy in force
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-flex h-5 items-center rounded-chip bg-ink px-1.5 text-label text-on-ink">
          Limited
        </span>
        Changed in this draft
      </li>
      <li className="text-muted">Developer always sees everything and is not a column.</li>
    </ul>
  )
}

export function Matrix({ rows }: { rows: readonly EditRow[] }) {
  const draft = useDraft((s) => s.draft)
  const inForce = usePolicy((s) => s.inForce.lines)
  const [f, setF] = useState<RowFilter>(NO_ROW_FILTER)
  const [limit, setLimit] = useState(PAGE)
  const [spec, setSpec] = useState<ChangeSpec | null>(null)
  const [focus, setFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const gridRef = useRef<HTMLTableElement>(null)
  const searchId = useId()
  const lines = draft?.lines ?? []
  const ov = useMemo(() => overridesOf(lines), [lines])
  const draftIx = useMemo(() => indexLines(lines), [lines])
  const forceIx = useMemo(() => indexLines(inForce), [inForce])
  const kept = useMemo(() => filterRows(rows, f, lines, inForce), [rows, f, lines, inForce])
  const shown = kept.slice(0, limit)
  const counts = useMemo(() => {
    const out = new Map<string, number>()
    for (const r of filterRows(rows, { ...f, group: 'all', query: '' }, lines, inForce))
      out.set(r.group, (out.get(r.group) ?? 0) + 1)
    return out
  }, [rows, f, lines, inForce])

  const open = (row: EditRow, role: PolicyRole) => setSpec(surfaceSpec(row, role, lines, inForce))
  const move = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(shown.length - 1, r))
    const cc = Math.max(0, Math.min(POLICY_ROLES.length - 1, c))
    setFocus({ r: rr, c: cc })
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${rr}-${cc}"]`)?.focus()
  }
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, r: number, c: number) => {
    const to =
      e.key === 'ArrowRight'
        ? [r, c + 1]
        : e.key === 'ArrowLeft'
          ? [r, c - 1]
          : e.key === 'ArrowDown'
            ? [r + 1, c]
            : e.key === 'ArrowUp'
              ? [r - 1, c]
              : e.key === 'Home'
                ? [r, 0]
                : e.key === 'End'
                  ? [r, POLICY_ROLES.length - 1]
                  : null
    if (!to) return
    e.preventDefault()
    move(to[0], to[1])
  }
  const fr = Math.min(focus.r, Math.max(0, shown.length - 1))

  return (
    <section aria-labelledby="sec-matrix-title" className="rounded-sheet bg-sheet">
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3 lg:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="sec-matrix-title" className="cut-head text-title font-semibold">
            Matrix
          </h2>
          <p className="text-meta text-muted">
            {plural(kept.length, 'surface')}
            {f.query.trim() ? ' in every group' : ''}. Click a cell to change it.
          </p>
        </div>
        <ListPicker
          label="Group"
          value={f.query.trim() ? ('all' as GroupKey | 'all') : f.group}
          options={GROUPS.map((g) => ({ value: g.key, label: g.label, count: counts.get(g.key) ?? 0 }))}
          onChange={(group) => {
            setF({ ...f, group, query: '' })
            setLimit(PAGE)
          }}
        />
        <p className="text-meta text-muted">{GROUPS.find((g) => g.key === f.group)?.hint}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label htmlFor={searchId} className="relative flex min-w-0 flex-1 basis-60 items-center">
            <span className="sr-only">Search every group</span>
            <IconSearch className="pointer-events-none absolute left-2.5 size-4 text-muted" />
            <input
              id={searchId}
              type="search"
              value={f.query}
              onChange={(e) => {
                setF({ ...f, query: e.target.value })
                setLimit(PAGE)
              }}
              placeholder="Search by id, title or metric"
              className={cx(INPUT, 'w-full pl-8')}
            />
          </label>
          <Switch
            checked={f.changedOnly}
            onChange={(on) => {
              setF({ ...f, changedOnly: on })
              setLimit(PAGE)
            }}
            label="Changed only"
          />
        </div>
        <Legend />
      </div>
      <div className="max-h-[70vh] overflow-auto border-t border-rule">
        <table
          ref={gridRef}
          className="w-full min-w-[860px] border-collapse text-small"
          aria-labelledby="sec-matrix-title"
        >
          <thead className="sticky top-0 z-[1] bg-sheet">
            <tr className="border-b border-rule">
              <th
                scope="col"
                className="sticky left-0 z-[2] bg-sheet px-4 py-2 text-left text-meta font-medium text-ink-2 lg:px-5"
              >
                Surface
              </th>
              {POLICY_ROLES.map((m) => (
                <th
                  key={m}
                  scope="col"
                  className="w-[68px] px-1 py-2 text-center text-meta font-medium text-ink-2"
                >
                  <abbr title={MODE_LABEL[m]} className="no-underline">
                    {MODE_COLUMN[m]}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={row.surface} className="border-b border-rule last:border-b-0">
                <th
                  scope="row"
                  className="sticky left-0 z-[1] max-w-[132px] sm:max-w-[320px] bg-sheet px-4 py-1.5 text-left font-normal lg:px-5"
                >
                  <span className="block truncate text-small text-ink">{row.label}</span>
                  <span className="block truncate font-mono text-label text-muted">{row.detail}</span>
                </th>
                {POLICY_ROLES.map((role, c) => {
                  const cell = cellOf(row, role, ov, draftIx, forceIx)
                  return (
                    <td key={role} className="px-1 py-1">
                      <button
                        type="button"
                        data-cell={`${r}-${c}`}
                        tabIndex={r === fr && c === focus.c ? 0 : -1}
                        onFocus={() => setFocus({ r, c })}
                        onKeyDown={(e) => onKey(e, r, c)}
                        onClick={() => open(row, role)}
                        title={cell.decision.how}
                        aria-label={`${MODE_LABEL[role]}, ${row.label}: ${ACCESS_WORD[cell.decision.access]}, ${STATE_WORD[cell.state]}`}
                        className={cellClass(cell)}
                      >
                        {ACCESS_WORD[cell.decision.access]}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!kept.length && (
          <p className="px-4 py-6 text-small text-muted lg:px-5">
            {f.changedOnly ? 'Nothing changed in this group yet.' : 'No surface matches this search.'}
          </p>
        )}
      </div>
      {kept.length > shown.length && (
        <div className="border-t border-rule px-4 py-3 lg:px-5">
          <Button size="sm" onClick={() => setLimit(limit + PAGE)}>
            Show {Math.min(PAGE, kept.length - shown.length)} more of {kept.length - shown.length}
          </Button>
        </div>
      )}
      <ChangeDialog spec={spec} onClose={() => setSpec(null)} />
    </section>
  )
}
