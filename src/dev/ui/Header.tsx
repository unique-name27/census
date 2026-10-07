/**
 * Head of the Developer page: the name, what the page is, the build line, the page's own actions
 * ("Run contract checks", "Copy diagnostics"), the debug overlay switches and the underline tabs.
 */
import { type KeyboardEvent, useRef } from 'react'
import { rovingIndex } from '@/app/keyboard'
import { IconCopy } from '@/components/icons'
import { goTo } from '@/components/navigation'
import { Button, cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { AboutViewLink } from '@/help/ui/AboutViewLink'
import { useDiagnostic } from '@/help/ui/useDiagnostic'
import { APP_VERSION } from '@/help/whatsNew'
import { useDev } from '../store'
import { DEV_TABS, type DevTab, devTab } from '../tabs'
import { useRunScan } from '../useScan'
import { OverlaySwitches } from './OverlaySwitches'
import { copyText, StatusLine } from './shared'

export const DEV_BODY_ID = 'dev-page-body'

/** "Census 0.1.0 · Development build · Sample data". */
export function buildLine(isSample: boolean): string {
  const build = import.meta.env?.DEV ? 'Development build' : 'Production build'
  return [`Census ${APP_VERSION}`, build, isSample ? 'Sample data' : 'Your data'].join(' · ')
}

function DevTabs({ active }: { active: DevTab }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = rovingIndex(e.key, i, DEV_TABS.length)
    if (next == null) return
    e.preventDefault()
    refs.current[next]?.focus()
    goTo('dev', devTab(DEV_TABS[next].key))
  }
  return (
    <div
      role="tablist"
      aria-label="Developer page sections"
      data-tour="dev-tabs"
      className="-mx-(--gutter) flex gap-6 overflow-x-auto px-(--gutter) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {DEV_TABS.map((t, i) => {
        const selected = t.key === active
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`subtab-dev-${t.key}`}
            aria-selected={selected}
            aria-controls={DEV_BODY_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => goTo('dev', devTab(t.key))}
            onKeyDown={onKeyDown(i)}
            className={cx(
              'relative h-10 shrink-0 text-small whitespace-nowrap transition-colors focus-visible:-outline-offset-2',
              selected
                ? 'font-semibold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink'
                : 'font-medium text-ink-2 hover:text-ink',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function DevHeader({ tab }: { tab: DevTab }) {
  const ctx = useAnalytics()
  const diagnostic = useDiagnostic()
  const { run, busy } = useRunScan()
  const scanning = useDev((s) => s.scanning)
  return (
    <div className="pt-5">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[420px]">
          <h1 className="cut-head text-page-title leading-[1.1] font-[650] tracking-[-0.01em]">Developer</h1>
          <p className="mt-1.5 max-w-[80ch] text-small text-ink-2">
            Every view, figure, metric, tool and setting in Census, and the state behind the screen. Nothing
            on this page is sent anywhere.
          </p>
          <p className="mt-1 text-meta text-muted">{buildLine(ctx.isSample)}</p>
          <p className="mt-1">
            <AboutViewLink view="dev" label="About this page" />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={busy}
            onClick={() => {
              if (tab !== 'overview') goTo('dev', devTab('overview', 'contracts'))
              void run('developer')
            }}
          >
            {busy && scanning?.mode === 'developer' ? 'Checking…' : 'Run contract checks'}
          </Button>
          <Button
            variant="ghost"
            icon={<IconCopy />}
            onClick={() => void copyText(diagnostic(), 'the diagnostics')}
          >
            Copy diagnostics
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span aria-hidden="true" className="text-meta font-medium text-ink-2">
          Debug overlays
        </span>
        <OverlaySwitches />
        <span className="text-meta text-muted">Alt+Shift+D switches them all.</span>
      </div>
      {scanning && (
        <div className="mt-3">
          <StatusLine>{scanning.text}</StatusLine>
        </div>
      )}
      <div className="mt-4 border-b border-rule">
        <DevTabs active={tab} />
      </div>
    </div>
  )
}
