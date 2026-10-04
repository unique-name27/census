/**
 * Keyboard and menu path for the sandbox: "Move to…" picks a new manager by search instead of
 * dragging, shows the same ripple preview, and confirms.
 */
import { useState } from 'react'
import { Button, Dialog, Segmented } from '@/components'
import { type DrillScope, isWithin, type MoveMode, type OrgTree, rippleOf } from '../engine'
import { PersonSearch } from './PersonSearch'
import { RipplePreview } from './Ripple'
import { useOrgRules } from './useOrgModel'

export function MoveDialog({
  tree,
  scope,
  personId,
  mode: initialMode,
  onClose,
  onConfirm,
}: {
  tree: OrgTree
  /** Where the preview's numbers come from, for the drill subtitles. */
  scope: DrillScope
  personId: string | null
  mode: MoveMode
  onClose: () => void
  onConfirm: (personId: string, toManagerId: string, mode: MoveMode) => void
}) {
  const [target, setTarget] = useState<string | null>(null)
  const [mode, setMode] = useState<MoveMode>(initialMode)
  // The dialog stays mounted between moves: each time it opens for a person, start from the
  // toolbar's "What moves when you drag" setting and no picked manager.
  const [openedFor, setOpenedFor] = useState<string | null>(personId)
  if (openedFor !== personId) {
    setOpenedFor(personId)
    if (personId) {
      setMode(initialMode)
      setTarget(null)
    }
  }
  const rules = useOrgRules()
  const e = personId ? tree.people.get(personId) : undefined
  const ripple =
    personId && target ? rippleOf(tree, { kind: 'move', personId, toManagerId: target, mode }, rules) : null
  const close = () => {
    setTarget(null)
    onClose()
  }
  return (
    <Dialog
      open={!!e}
      onOpenChange={(o) => {
        if (!o) close()
      }}
      title={e ? `Move ${e.name}` : 'Move'}
      description="Pick the new manager. The move goes into this browser's scenario; the data does not change."
      width={560}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ripple?.ok}
            onClick={() => {
              if (personId && target && ripple?.ok) {
                onConfirm(personId, target, mode)
                setTarget(null)
              }
            }}
          >
            Move
          </Button>
        </>
      }
    >
      {e && personId && (
        <div className="space-y-4">
          <Segmented<MoveMode>
            label="What moves"
            value={mode}
            onChange={setMode}
            size="md"
            options={[
              { value: 'person', label: 'Just this person' },
              { value: 'team', label: 'With their org' },
            ]}
          />
          <p className="-mt-2 text-[12px] text-muted">
            {mode === 'person'
              ? `${e.name}'s direct reports stay behind and roll up to their current manager.`
              : `Everyone in ${e.name}'s org moves with them.`}
          </p>
          <PersonSearch
            people={tree.people}
            orgSize={(id) => tree.total.get(id) ?? 0}
            onPick={setTarget}
            inline
            autoFocus
            label="New manager"
            placeholder="Search for the new manager"
            hint={(id) =>
              id === personId
                ? 'This person'
                : isWithin(tree, id, personId)
                  ? 'In their org'
                  : tree.parent.get(personId) === id
                    ? 'Current manager'
                    : null
            }
          />
          {target && (
            <div className="rounded-control bg-sheet-2 px-3 py-3">
              <div className="eyebrow mb-2">New manager: {tree.people.get(target)?.name}</div>
              {ripple && <RipplePreview tree={tree} ripple={ripple} scope={scope} />}
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
