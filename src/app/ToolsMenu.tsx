/**
 * Masthead "Tools" menu: links to the team's companion tools (pipeline dashboard, career lattice,
 * manager toolkit, HR process catalog). Links open in a new tab. Missing links can be added in
 * place; edits stay in this browser.
 */
import { useId, useState, useSyncExternalStore } from 'react'
import { Dialog } from '@/components/Dialog'
import { IconApps, IconExternal, IconPencil } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button, Popover } from '@/components/ui'
import { clearTools, DEFAULT_TOOLS, hostOf, loadTools, normalizeUrl, saveTools, type Tool } from './tools'

/* Shared, reactive tool list (other views read it for deep links such as Atlas process IDs). */
let current: Tool[] | null = null
const listeners = new Set<() => void>()
const read = () => {
  current ??= loadTools()
  return current
}
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
function publish(next: Tool[]) {
  current = next
  for (const l of listeners) l()
}

export function useTools(): Tool[] {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_TOOLS)
}

const ROW =
  'group flex items-start gap-3 rounded-control px-2.5 py-2 text-left outline-none hover:bg-hover focus-visible:bg-hover'

export function ToolsMenu() {
  const tools = useTools()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  return (
    <>
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
                <button
                  type="button"
                  className={ROW}
                  onClick={() => {
                    setOpen(false)
                    setEditing(true)
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink-2">{t.label}</span>
                    <span className="block text-[12px] text-muted">No link yet. Add one.</span>
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-1 border-t border-rule pt-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<IconPencil />}
            onClick={() => {
              setOpen(false)
              setEditing(true)
            }}
          >
            Edit links
          </Button>
        </div>
      </Popover>
      {editing && <EditLinks tools={tools} onClose={() => setEditing(false)} />}
    </>
  )
}

function EditLinks({ tools, onClose }: { tools: Tool[]; onClose: () => void }) {
  const base = useId()
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(tools.map((t) => [t.id, t.url ?? ''])),
  )
  const errors = Object.fromEntries(
    tools.map((t) => [
      t.id,
      draft[t.id].trim() && !normalizeUrl(draft[t.id]) ? 'Enter a web address (https://…)' : null,
    ]),
  )
  const invalid = Object.values(errors).some(Boolean)

  const save = () => {
    const urls = Object.fromEntries(tools.map((t) => [t.id, normalizeUrl(draft[t.id])]))
    saveTools(urls)
    publish(tools.map((t) => ({ ...t, url: urls[t.id] })))
    toast('Links saved', { tone: 'good', description: 'They are kept in this browser.' })
    onClose()
  }
  const reset = () => {
    clearTools()
    publish(DEFAULT_TOOLS)
    toast('Links reset to the defaults')
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Related tools"
      description="Links open in a new tab. Changes are saved in this browser only."
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={reset}>
            Reset to defaults
          </Button>
          <span className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={invalid}>
            Save links
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!invalid) save()
        }}
      >
        {tools.map((t) => {
          const id = `${base}-${t.id}`
          return (
            <div key={t.id} className="flex flex-col gap-1">
              <label htmlFor={id} className="text-[13px] font-semibold">
                {t.label}
              </label>
              <span className="text-[12px] text-ink-2">{t.description}</span>
              <input
                id={id}
                type="url"
                inputMode="url"
                placeholder="https://"
                value={draft[t.id]}
                onChange={(e) => setDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                aria-invalid={errors[t.id] ? true : undefined}
                className="h-8 rounded-control bg-sheet px-2.5 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)] aria-[invalid]:shadow-[inset_0_0_0_1px_var(--critical)]"
              />
              {errors[t.id] && <span className="text-[12px] text-bad-text">{errors[t.id]}</span>}
            </div>
          )
        })}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
