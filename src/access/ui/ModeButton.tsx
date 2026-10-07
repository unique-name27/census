/**
 * The Mode button at the start of the masthead's button group (docs/ROLES.md, 1.2): "HR mode",
 * "Manager: Priya Raman" or "Developer mode" with a caret; under 640px the icon and caret only
 * (the menu says which mode is in force), so the phone masthead stays on one row. It opens the
 * Mode menu (a redirect toast's "Change mode" opens it too).
 */
import { IconPeople } from '@/components/icons'
import { Button, Popover } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { MODE_LABEL, modeButtonLabel } from '../modes'
import { useMode } from '../store'
import { ModeMenu } from './ModeMenu'

export function ModeButton() {
  const ctx = useAnalytics()
  const mode = useMode((s) => s.mode)
  const open = useMode((s) => s.menuOpen)
  const setOpen = useMode((s) => s.setMenuOpen)
  const name = ctx.access.lock?.managerName || null
  const full = modeButtonLabel(mode, name)
  // Spoken: "Mode: Manager, Priya Raman" or "Mode: HR", not "Mode: Manager: Priya Raman".
  const spoken = mode === 'manager' && name ? `Mode: Manager, ${name}` : `Mode: ${MODE_LABEL[mode]}`
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width={340}
      trigger={
        <Button data-tour="masthead-mode" variant="ghost" icon={<IconPeople />} caret aria-label={spoken}>
          {/* Phones show the icon and caret only; the menu names the mode in force. */}
          <span className="hidden max-w-[220px] truncate sm:inline">{full}</span>
        </Button>
      }
    >
      <ModeMenu onClose={() => setOpen(false)} />
    </Popover>
  )
}
