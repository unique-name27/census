/**
 * Developer > Security center (`#dev.security`, docs/SECURITY-CENTER.md): edits overrides on the
 * role tables as a draft kept in this browser, and publishes them as `access-policy.json`, which
 * Census loads for everyone. Under the fixed banner: the matrix, one role at a time, the changes
 * with the change log, what is in force, and publish and import. Sub-addresses:
 *
 *   #dev.security               the matrix
 *   #dev.security:role:finance  the role page, on Finance
 *   #dev.security:changes  #dev.security:in-force  #dev.security:publish
 *
 * Developer mode only (the `tab:dev.` surfaces), and no override can show it anywhere else.
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { MODE_LABEL } from '@/access/modes'
import {
  draftChanges,
  isPolicyRole,
  POLICY_ROLES,
  type PolicyRole,
  type SkippedLine,
} from '@/access/overrides'
import { IconEye, IconWarning } from '@/components/icons'
import { goTo } from '@/components/navigation'
import { Button } from '@/components/ui'
import { plural } from '@/lib/format'
import { useDev } from '../store'
import { devTab } from '../tabs'
import { ListPicker } from '../ui/shared'
import { SECURITY_BANNER } from './copy'
import { editRows, surfaceCatalog, surfaceLabel } from './inventory'
import { previewAs } from './preview'
import { useDraft, usePolicy } from './store'
import { Changes } from './ui/Changes'
import { InForce } from './ui/InForce'
import { Matrix } from './ui/Matrix'
import { Publish } from './ui/Publish'
import { RolePage } from './ui/RolePage'

type Section = 'matrix' | 'role' | 'changes' | 'in-force' | 'publish'

const SECTIONS: readonly { value: Section; label: string }[] = [
  { value: 'matrix', label: 'Matrix' },
  { value: 'role', label: 'Role' },
  { value: 'changes', label: 'Changes' },
  { value: 'in-force', label: 'In force' },
  { value: 'publish', label: 'Publish and import' },
]

/**
 * Read the sub-address: "role:finance" is the role page on Finance. A "/" or "." before the role
 * reads the same ("role/finance", "role.finance"), so a link written either way keeps its role.
 */
export function parseSecuritySub(sub: string): { section: Section; role: PolicyRole } {
  const [head, rest] = sub.split(/[:/.]/)
  const section = (SECTIONS.some((s) => s.value === head) ? head : 'matrix') as Section
  return { section, role: isPolicyRole(rest) ? rest : 'finance' }
}

export const securitySub = (section: Section, role?: PolicyRole): string =>
  section === 'matrix' ? '' : section === 'role' && role ? `role:${role}` : section

export function Banner() {
  return (
    <div role="note" className="flex items-start gap-2.5 rounded-sheet bg-sheet px-4 py-3 lg:px-5">
      <IconWarning className="mt-0.5 size-4 shrink-0 text-warning" />
      <p className="max-w-[100ch] text-small text-ink">{SECURITY_BANNER}</p>
    </div>
  )
}

function PreviewControl({ lines }: { lines: Parameters<typeof previewAs>[1] }) {
  const [role, setRole] = useState<PolicyRole>('finance')
  const id = useId()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-small text-ink-2">
        Preview as
      </label>
      <select
        id={id}
        value={role}
        onChange={(e) => setRole(e.target.value as PolicyRole)}
        className="h-8 rounded-control bg-sheet px-2 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]"
      >
        {POLICY_ROLES.map((m) => (
          <option key={m} value={m}>
            {MODE_LABEL[m]}
          </option>
        ))}
      </select>
      <Button icon={<IconEye />} onClick={() => previewAs(role, lines, '')}>
        Preview
      </Button>
    </div>
  )
}

/** Lines the draft lost when it was read from this browser or a settings file, and why. */
function SkippedDraftLines({ skipped }: { skipped: readonly SkippedLine[] }) {
  return (
    <div role="status" className="text-small text-ink">
      <p className="flex items-start gap-2">
        <IconWarning className="mt-0.5 size-4 shrink-0 text-warning" />
        {skipped.length === 1
          ? 'One line of the draft was left out when it was read, as the loader would leave it out:'
          : `${skipped.length} lines of the draft were left out when it was read, as the loader would leave them out:`}
      </p>
      <ul className="mt-1 ml-6 list-disc text-meta text-ink-2">
        {skipped.map((s) => (
          <li key={`${s.index}-${s.role}-${s.surface}`}>
            {isPolicyRole(s.role) ? MODE_LABEL[s.role] : s.role}: {surfaceLabel(s.surface)} {s.decision}.{' '}
            {s.why}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SecurityTab({ sub }: { sub: string }) {
  const { section, role } = parseSecuritySub(sub)
  const draft = useDraft((s) => s.draft)
  const open = useDraft((s) => s.open)
  const restart = useDraft((s) => s.restart)
  const kept = useDraft((s) => s.kept)
  const skipped = useDraft((s) => s.skipped)
  const inForce = usePolicy((s) => s.inForce)
  const scan = useDev((s) => s.scans.developer)
  const rows = useMemo(() => editRows(scan?.figures ?? []), [scan])
  useEffect(() => {
    // The draft kept in this browser goes through the loader's screening first.
    open(surfaceCatalog(scan?.figures ?? []))
  }, [open, scan])
  if (!draft) return <Banner />
  const pending = draftChanges(draft.lines, inForce.lines, (s) => surfaceLabel(s))
  const stale = draft.base !== (inForce.file?.checksum ?? '') && draft.lines.length > 0
  const go = (s: Section, r?: PolicyRole) => goTo('dev', devTab('security', securitySub(s, r ?? role)))
  return (
    <div className="flex flex-col gap-4">
      <Banner />
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <ListPicker
          label="Security center sections"
          value={section}
          options={SECTIONS}
          onChange={(s) => go(s)}
        />
        <PreviewControl lines={draft.lines} />
      </div>
      <p className="text-meta text-muted">
        {pending.length ? (
          <>
            The draft changes {plural(pending.length, 'surface')} from what is in force.{' '}
            <button
              type="button"
              className="font-medium text-link underline-offset-2 hover:underline"
              onClick={() => go('changes')}
            >
              See the changes
            </button>
            .
          </>
        ) : (
          'The draft is the same as what is in force.'
        )}{' '}
        {kept
          ? 'It is kept in this browser and in the settings file; nothing is in force until it is published.'
          : 'This browser would not keep it: it lasts until the page is closed.'}
      </p>
      {skipped.length > 0 && <SkippedDraftLines skipped={skipped} />}
      {stale && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink">
          The policy in force changed after this draft started.
          <Button size="sm" variant="ghost" onClick={restart}>
            Start again from what is in force
          </Button>
        </p>
      )}
      {section === 'matrix' ? (
        <Matrix rows={rows} />
      ) : section === 'role' ? (
        <RolePage rows={rows} role={role} onRole={(r) => go('role', r)} />
      ) : section === 'changes' ? (
        <Changes />
      ) : section === 'in-force' ? (
        <InForce />
      ) : (
        <Publish />
      )}
    </div>
  )
}

export default SecurityTab
