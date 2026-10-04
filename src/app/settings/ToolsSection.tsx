/** Settings → Related tools: the four links in the masthead's Tools menu. */
import { useId, useState } from 'react'
import { toast } from '@/components/toast'
import { Button, cx } from '@/components/ui'
import { useCensus } from '@/data/store'
import { useTools } from '../ToolsMenu'
import type { Tool } from '../tools'
import { toolChanges, toolErrors, toToolDraft } from './model'
import { INPUT, SettingsBlock } from './ui'

function LinksForm({ tools }: { tools: Tool[] }) {
  const setToolLink = useCensus((s) => s.setToolLink)
  const resetTools = useCensus((s) => s.resetTools)
  const saved = useCensus((s) => s.tools)
  const base = useId()
  const [draft, setDraft] = useState(() => toToolDraft(tools))
  const errors = toolErrors(tools, draft)
  const invalid = Object.values(errors).some(Boolean)
  const changes = toolChanges(tools, draft)
  const save = () => {
    if (invalid || !changes.length) return
    for (const c of changes) setToolLink(c.id, c.url)
    toast('Links saved', { tone: 'good', description: 'They are kept in this browser.' })
  }
  return (
    // The app's own check (toolErrors) accepts addresses without https://; the browser's URL
    // check would block those silently, so it is off.
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
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
              type="text"
              inputMode="url"
              spellCheck={false}
              autoCapitalize="off"
              placeholder="https://"
              value={draft[t.id] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [t.id]: e.target.value }))}
              aria-invalid={errors[t.id] ? true : undefined}
              aria-describedby={errors[t.id] ? `${id}-error` : undefined}
              className={cx(INPUT, 'w-full')}
            />
            {errors[t.id] && (
              <span id={`${id}-error`} className="text-[12px] text-bad-text">
                {errors[t.id]}
              </span>
            )}
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" type="submit" disabled={invalid || !changes.length}>
          Save links
        </Button>
        <Button
          variant="ghost"
          disabled={!Object.keys(saved).length}
          onClick={() => {
            resetTools()
            toast('Links reset to the defaults')
          }}
        >
          Reset to defaults
        </Button>
      </div>
    </form>
  )
}

export function ToolsSection() {
  const tools = useTools()
  return (
    <SettingsBlock
      section="tools"
      intro="Links in the Tools menu open in a new tab. Leave one blank to remove it. Changes are saved in this browser only."
    >
      {/* Saved links changing elsewhere (reset, a settings file) start the form over. */}
      <LinksForm key={tools.map((t) => t.url ?? '').join('|')} tools={tools} />
    </SettingsBlock>
  )
}
