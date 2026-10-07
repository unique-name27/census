/**
 * Settings > Mode, the first section (docs/ROLES.md, 1.2): the three modes as a segmented control
 * with the one-line hint under it, the long wording that modes are not security as the intro, and
 * in Manager mode whose org Census shows with "Change manager…".
 */
import { SettingsBlock } from '@/app/settings/ui'
import { Button, Segmented } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { OverlaySwitches } from '@/dev/ui/OverlaySwitches'
import { CHANGE_MANAGER, NO_MANAGERS_HINT, NOT_SECURITY_LONG, showingFor } from '../copy'
import { MODE_HINT, MODE_LABEL, MODES, type Mode } from '../modes'
import { openManagerPicker, useMode } from '../store'
import { useManagers } from './useManagers'

export function ModeSection() {
  const ctx = useAnalytics()
  const mode = useMode((s) => s.mode)
  const setMode = useMode((s) => s.setMode)
  const managers = useManagers()
  const noManagers = managers.length === 0
  const options = MODES.filter((m) => m !== 'manager' || !noManagers).map((m: Mode) => ({
    value: m,
    label: MODE_LABEL[m],
  }))
  const name = ctx.access.lock?.managerName
  return (
    <SettingsBlock section="mode" intro={NOT_SECURITY_LONG}>
      <div className="flex flex-col gap-1.5">
        <Segmented<Mode> label="Mode" value={mode} onChange={setMode} options={options} size="md" />
        <p className="text-meta leading-snug text-muted">{MODE_HINT[mode]}</p>
        {noManagers && <p className="text-meta leading-snug text-muted">Manager mode: {NO_MANAGERS_HINT}</p>}
      </div>
      {mode === 'manager' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-small text-ink">{name ? showingFor(name) : 'No manager is picked yet.'}</span>
          <Button size="sm" onClick={() => openManagerPicker()}>
            {CHANGE_MANAGER}
          </Button>
        </div>
      )}
      {/* Developer mode: the debug overlay switches (docs/ROLES.md, 5.8). */}
      {ctx.access.can('overlay:figures') && (
        <div className="flex flex-col gap-2">
          <p className="text-small font-medium text-ink">Debug overlays</p>
          <OverlaySwitches hints />
          <p className="text-meta leading-snug text-muted">Alt+Shift+D (Option+Shift+D) switches them all.</p>
        </div>
      )}
    </SettingsBlock>
  )
}
