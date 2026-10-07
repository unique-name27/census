/**
 * One agent as a sheet: name and status, who it is for, what it does, when to use it and when
 * not to, example prompts to copy, then the data it draws on, its owner and the Glean link.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { IconCheck, IconCopy, IconExternal, IconPencil } from '@/components/icons'
import type { Severity } from '@/components/types'
import { Button, cx, IconButton, Menu, StatusPill, Tag } from '@/components/ui'
import { writeClipboard } from '@/lib/export/clipboard'
import { type Agent, type AgentStatus, audiencePhrase, isSampleUrl, safeAgentUrl } from '../catalog'
import { removeAgent } from './actions'
import { LINK } from './styles'
import { useAiUi } from './uiState'

const STATUS_SEVERITY: Record<AgentStatus, Severity> = { Sample: 'info', Pilot: 'warning', Live: 'good' }

export function AgentStatusPill({ status }: { status: AgentStatus }) {
  return <StatusPill severity={STATUS_SEVERITY[status]} label={status} />
}

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s)

function CopyPrompt({ prompt, agent }: { prompt: string; agent: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = async () => {
    try {
      await writeClipboard(prompt)
      setState('copied')
    } catch {
      setState('failed')
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), 2000)
  }
  return (
    <li className="flex items-start gap-2 rounded-control bg-sheet-2 py-1.5 pr-1 pl-2.5">
      <p className="min-w-0 flex-1 py-0.5 text-small leading-snug text-ink">{prompt}</p>
      <Button
        size="sm"
        variant="ghost"
        icon={state === 'copied' ? <IconCheck className="text-good" /> : <IconCopy />}
        onClick={() => void copy()}
        aria-label={`Copy prompt for ${agent}: ${short(prompt)}`}
        className="shrink-0"
      >
        <span aria-hidden="true">
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Not copied' : 'Copy'}
        </span>
      </Button>
      <span role="status" className="sr-only">
        {state === 'copied'
          ? 'Prompt copied'
          : state === 'failed'
            ? 'The browser blocked copying. Select the text to copy it.'
            : ''}
      </span>
    </li>
  )
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-small leading-snug text-ink marker:text-muted">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  )
}

export function AgentCard({ agent, className }: { agent: Agent; className?: string }) {
  const titleId = useId()
  const openEdit = useAiUi((s) => s.openEdit)
  const href = safeAgentUrl(agent.url)
  // Labeled by the link itself: a Pilot or Live agent that still has its sample link says so too.
  const sampleLink = !!href && isSampleUrl(href)
  return (
    <article
      aria-labelledby={titleId}
      data-tour="ai-agent-card"
      className={cx('flex flex-col rounded-sheet bg-sheet', className)}
    >
      <header className="flex items-start gap-2 px-4 pt-3.5">
        <div className="min-w-0 flex-1">
          <h4 id={titleId} className="cut-head text-title leading-snug font-semibold text-ink">
            {agent.name}
          </h4>
          <p className="mt-0.5 text-meta text-muted">For {audiencePhrase(agent.audience)}</p>
        </div>
        <div className="-mr-1.5 flex shrink-0 items-center gap-1">
          <AgentStatusPill status={agent.status} />
          <Menu
            width={200}
            trigger={
              <IconButton label={`Edit or remove ${agent.name}`} size="sm">
                <IconPencil />
              </IconButton>
            }
            items={[
              { label: 'Edit agent', icon: <IconPencil />, onSelect: () => openEdit(agent.id) },
              { label: 'Remove from catalog', onSelect: () => removeAgent(agent) },
            ]}
          />
        </div>
      </header>

      <p className="mt-2 px-4 text-small leading-snug text-ink-2">{agent.description}</p>

      <div className="mt-3 flex flex-col gap-3 px-4">
        <section>
          <h5 className="eyebrow">Use it for</h5>
          <Bullets items={agent.useFor} />
        </section>
        <section>
          <h5 className="eyebrow">Don't use it for</h5>
          <Bullets items={agent.dontUseFor} />
        </section>
        {agent.examplePrompts.length > 0 && (
          <section>
            <h5 className="eyebrow">Example prompts</h5>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {agent.examplePrompts.map((p, i) => (
                <CopyPrompt key={i} prompt={p} agent={agent.name} />
              ))}
            </ul>
          </section>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-4 text-meta leading-snug">
        {agent.dataSources.length > 0 && (
          <>
            <dt className="text-muted">Data</dt>
            <dd className="text-ink-2">{agent.dataSources.join(', ')}</dd>
          </>
        )}
        {agent.ownerTeam && (
          <>
            <dt className="text-muted">Owner</dt>
            <dd className="text-ink-2">{agent.ownerTeam}</dd>
          </>
        )}
      </dl>

      <div className="mt-auto px-4 pt-3 pb-3.5">
        <footer className="flex flex-wrap items-center gap-2 border-t border-rule pt-3">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
              aria-label={`Open ${agent.name} in Glean${sampleLink ? ' (sample link)' : ''}, opens in a new tab`}
            >
              Open in Glean
              <IconExternal className="size-3.5" />
            </a>
          ) : (
            <span className="text-small text-muted">No Glean link yet</span>
          )}
          {sampleLink && <Tag tone="outline">Sample link</Tag>}
        </footer>
      </div>
    </article>
  )
}
