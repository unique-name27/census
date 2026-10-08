/**
 * The Mode button at the start of the masthead's button group (docs/ROLES-V2.md 1.2): "HR mode",
 * "HRBP: Silicon Engineering", "Recruiter: Maya Chen", "Manager: Priya Raman" with a caret; a mode
 * waiting for its pick reads "HRBP mode". Under 640px the icon and a short name ("HRBP", "Comp"),
 * so the phone masthead stays on one row. It opens the Mode menu (a redirect toast's "Change mode"
 * opens it too).
 */
import { IconPeople } from '@/components/icons'
import { Button, Popover } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { MODE_SHORT, modeButtonLabel } from '../modes'
import { useMode } from '../store'
import { ModeMenu } from './ModeMenu'
import { modeSpoken, pickNameOf } from './pickModel'

export function ModeButton() {
  // The mode and its scope as the page shows them (the context follows the store a moment later
  // while a new mode renders), so the name always belongs to the mode beside it.
  const { access } = useAnalytics()
  const mode = access.mode
  const recruiter = useMode((s) => s.picks.recruiter)
  const open = useMode((s) => s.menuOpen)
  const setOpen = useMode((s) => s.setMenuOpen)
  const name = pickNameOf(mode, access.scope, access.unset, { recruiter })
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width={380}
      trigger={
        // Spoken: "Mode: HRBP for a region, APAC", not "Mode: HRBP: APAC".
        <Button
          data-tour="masthead-mode"
          variant="ghost"
          icon={<IconPeople />}
          caret
          aria-label={modeSpoken(mode, name)}
          // Phones: the icon and the short name; the caret goes so the masthead keeps one row.
          className="max-sm:px-2 max-sm:[&>svg:last-child]:hidden"
        >
          <span className="max-w-[220px] truncate max-sm:hidden">{modeButtonLabel(mode, name)}</span>
          <span className="sm:hidden">{MODE_SHORT[mode]}</span>
        </Button>
      }
    >
      <ModeMenu onClose={() => setOpen(false)} />
    </Popover>
  )
}
