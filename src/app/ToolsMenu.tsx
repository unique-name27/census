/**
 * Masthead "Tools" menu: links to the team's companion tools (pipeline dashboard, career lattice,
 * manager toolkit, HR process catalog). Links open in a new tab. The links live in Settings →
 * Related tools; "Edit links" and a missing link open that section.
 */
import { useState } from 'react'
import { IconApps, IconExternal, IconPencil } from '@/components/icons'
import { Button, Popover } from '@/components/ui'
import { openSettings, useCensus } from '@/data/store'
import { hostOf, mergeTools, type Tool } from './tools'

/** The tool list with this browser's links (other views read it for deep links such as Atlas IDs). */
export function useTools(): Tool[] {
  return mergeTools(useCensus((s) => s.tools))
}

const ROW =
  'group flex items-start gap-3 rounded-control px-2.5 py-2 text-left outline-none hover:bg-hover focus-visible:bg-hover'

export function ToolsMenu() {
  const tools = useTools()
  const [open, setOpen] = useState(false)
  const edit = () => {
    setOpen(false)
    openSettings('tools')
  }
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width={340}
      trigger={
        <Button variant="ghost" icon={<IconApps />} caret>
          Tools
        </Button>
      }
    >
      <div className="eyebrow px-2.5 pb-1">Related tools</div>
      <ul className="-mx-1 flex flex-col">
        {tools.map((t) => (
          <li key={t.id}>
            {t.url ? (
              <a
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className={ROW}
                onClick={() => setOpen(false)}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    {t.label}
                    <IconExternal className="size-3.5 text-muted group-hover:text-ink-2" />
                  </span>
                  <span className="block text-[12px] text-ink-2">{t.description}</span>
                  <span className="block truncate text-[11px] text-muted">{hostOf(t.url)}</span>
                </span>
              </a>
            ) : (
              <button type="button" className={ROW} onClick={edit}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink-2">{t.label}</span>
                  <span className="block text-[12px] text-muted">No link yet. Add one in Settings.</span>
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-1 border-t border-rule pt-2">
        <Button variant="ghost" size="sm" icon={<IconPencil />} onClick={edit}>
          Edit links
        </Button>
      </div>
    </Popover>
  )
}
