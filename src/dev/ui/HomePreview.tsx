/**
 * "Preview a role" (docs/ROLES-V2.md 5.13): one role's Home laid out on the Developer page through
 * an `AnalyticsProvider` with that role's access and pick (the off-screen override pattern, on
 * screen), with its own figure registry and current view, so its figures, numbers, lists and
 * exports are the role's. The rest of Census stays in Developer mode: the records panel, links and
 * the masthead are Developer's. A role that needs a pick uses the one made on this page or the one
 * `census:mode` remembers, and asks for one when there is neither, or when the remembered one is
 * no longer in the data.
 */
import { useEffect, useId, useRef } from 'react'
import { PICKER_COPY } from '@/access/copy'
import { MODE_LABEL, MODE_NAME, type Mode, type ModePicks, PICK_OF } from '@/access/modes'
import { ViewErrorBoundary } from '@/app/ErrorBoundary'
import { FigureRegistryProvider } from '@/charts/registry'
import { CurrentViewProvider } from '@/components/currentView'
import { IconPin } from '@/components/icons'
import { Button } from '@/components/ui'
import { AnalyticsProvider, useAnalytics } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { viewByKey } from '@/views/registry'
import type { ViewDef } from '@/views/types'
import { canLayOut, HOME_ROLES, pickLabel, pickPrompt } from '../roles'
import { PickSelect, RoleSelect, usePagePicks } from './RoleControls'

/** The home's header as the shell draws it: the page title, then the scope, window and as-of line. */
function PreviewHead({ home }: { home: ViewDef }) {
  const ctx = useAnalytics()
  const Actions = ctx.access.can('header:home') ? home.HeaderActions : undefined
  return (
    <div className="mt-6 mb-5 flex flex-wrap items-start gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-[320px]">
        <h3 className="cut-head text-page-title leading-[1.1] font-[650] tracking-[-0.01em]">
          {home.title?.(ctx) ?? home.label}
        </h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small text-ink-2">
          {ctx.access.scope && <IconPin className="size-3.5 shrink-0 text-muted" />}
          <span>{ctx.scopeLabel}</span>
          <span aria-hidden="true" className="text-muted">
            ·
          </span>
          <span>{ctx.window.label}</span>
          <span aria-hidden="true" className="text-muted">
            ·
          </span>
          <span>as of {formatDate(ctx.asOf)}</span>
        </p>
      </div>
      {Actions && (
        <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
          <Actions />
        </div>
      )}
    </div>
  )
}

/** The home itself, or, when the pick is no longer in the data, what the pick dialog would say. */
function PreviewPage({ home, mode, picks }: { home: ViewDef; mode: Mode; picks: ModePicks }) {
  const ctx = useAnalytics()
  const kind = PICK_OF[mode]
  if (kind && ctx.access.unset && ctx.access.mode === mode) {
    const was = pickLabel(mode, picks) ?? ''
    return <p className="mt-5 max-w-[70ch] text-small text-ink-2">{PICKER_COPY[kind].gone(was)}</p>
  }
  return (
    <>
      <PreviewHead home={home} />
      <home.View tab="overview" />
    </>
  )
}

export function HomePreview({
  mode,
  onRole,
  onClose,
}: {
  mode: Mode
  onRole: (mode: Mode) => void
  onClose: () => void
}) {
  const titleId = useId()
  const ref = useRef<HTMLElement>(null)
  const picks = usePagePicks()
  const home = viewByKey.get('home')
  const ready = canLayOut(mode, picks)
  // Bring the preview into view when a role is picked (from the list or by address).
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on a change of role only
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'start' })
  }, [mode])
  const resetKey = `${mode}|${pickLabel(mode, picks) ?? ''}`
  return (
    <section ref={ref} aria-labelledby={titleId} data-dev-preview={mode} className="mt-6 scroll-mt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-sheet bg-sheet px-4 py-3 lg:px-5">
        <div className="min-w-0 flex-1 basis-72">
          <h2 id={titleId} className="cut-head text-title font-semibold">
            {MODE_LABEL[mode]} home, previewed
          </h2>
          <p className="mt-0.5 text-meta text-muted">
            Laid out as {MODE_NAME[mode]} mode lays it out, on this page only. Census stays in Developer mode,
            so records and links open there.
          </p>
        </div>
        <RoleSelect label="Preview a role" value={mode} modes={HOME_ROLES} onChange={onRole} />
        <PickSelect mode={mode} picks={picks} />
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close preview
        </Button>
      </div>
      {!home ? (
        <p className="mt-5 text-small text-ink-2">The Home view is not registered in this build.</p>
      ) : !ready ? (
        <p className="mt-5 max-w-[70ch] text-small text-ink-2">{pickPrompt(mode)}</p>
      ) : (
        <ViewErrorBoundary resetKey={resetKey}>
          <AnalyticsProvider access={{ mode, picks }}>
            <FigureRegistryProvider>
              <CurrentViewProvider
                value={{
                  key: home.key,
                  label: home.label,
                  tabs: home.tabs,
                  tab: 'overview',
                  datasets: home.datasets,
                }}
              >
                <PreviewPage home={home} mode={mode} picks={picks} />
              </CurrentViewProvider>
            </FigureRegistryProvider>
          </AnalyticsProvider>
        </ViewErrorBoundary>
      )}
    </section>
  )
}
