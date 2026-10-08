/**
 * Settings > Mode, the first section (docs/ROLES-V2.md 1.2): the Mode menu's grouped radio list
 * (eleven modes do not fit a segmented control), the long wording that modes are not security as
 * the intro, the pick line of a mode that has one ("Showing Census for APAC") with its "Change…"
 * button, and in Developer mode the debug overlay switches.
 */
import { SettingsBlock } from '@/app/settings/ui'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { OverlaySwitches } from '@/dev/ui/OverlaySwitches'
import { NOT_SECURITY_LONG, PICKER_COPY } from '../copy'
import { PICK_OF } from '../modes'
import { openPicker, useMode } from '../store'
import { ModeChoices } from './ModeMenu'
import { showingLine } from './pickModel'

export function ModeSection() {
  const { access } = useAnalytics()
  const recruiter = useMode((s) => s.picks.recruiter)
  // The mode as the page shows it, so the line names the scope on screen.
  const kind = PICK_OF[access.mode]
  const line = showingLine(access.mode, access.scope, access.unset, { recruiter })
  return (
    <SettingsBlock section="mode" intro={NOT_SECURITY_LONG}>
      <ModeChoices />
      {kind && line && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-small text-ink">{line}</span>
          <Button size="sm" onClick={() => openPicker(kind)}>
            {PICKER_COPY[kind].change}
          </Button>
        </div>
      )}
      {/* Developer mode: the debug overlay switches (docs/ROLES.md, 5.8). */}
      {access.can('overlay:figures') && (
        <div className="flex flex-col gap-2">
          <p className="text-small font-medium text-ink">Debug overlays</p>
          <OverlaySwitches hints />
          <p className="text-meta leading-snug text-muted">Alt+Shift+D (Option+Shift+D) switches them all.</p>
        </div>
      )}
    </SettingsBlock>
  )
}
