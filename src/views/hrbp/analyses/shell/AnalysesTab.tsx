/**
 * People stats > Special analyses (docs/ANALYSES.md, part 1): the picker, the address and the
 * analysis on screen. A bare address opens the first shown analysis that is ready and then names
 * it (history replace, so Back does not bounce). Laid out off screen for a whole-view export, the
 * tab shows every analysis the mode shows, in order, each under its own heading.
 */
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FigureSection } from '@/charts'
import { Button, goTo, Menu, Segmented } from '@/components'
import { useNarrow } from '@/components/useNarrow'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { DECLINES, type DeclinesModel } from '../declines/engine'
import { Panel as DeclinesPanel } from '../declines/ui/Panel'
import { PYRAMID, type PyramidModel } from '../pyramid/engine'
import { Panel as PyramidPanel } from '../pyramid/ui/Panel'
import { QUALITY, type QualityModel } from '../quality/engine'
import { Panel as QualityPanel } from '../quality/ui/Panel'
import { analysisDef, analysisModel, isReady, openingAnalysis, shownAnalyses } from '../registry'
import { STAGES, type StagesModel } from '../stages/engine'
import { Panel as StagesPanel } from '../stages/ui/Panel'
import { type AnalysisKey, analysesTab, parseAnalysesTab } from '../tab'
import type { AnalysisDef } from '../types'
import { AnalysisNotReady } from './AnalysisFrame'

/**
 * Where the tab is rendered: `offscreen` is true while it is laid out off screen for a whole-view
 * export (null before it knows); `onScreen` is true only in the live page. The Developer page's
 * figure scan exports nothing, so the tab renders for it as on screen, but never moves the address.
 */
function usePlacement(): {
  ref: RefObject<HTMLDivElement | null>
  offscreen: boolean | null
  onScreen: boolean
} {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ offscreen: boolean | null; onScreen: boolean }>({
    offscreen: null,
    onScreen: false,
  })
  useLayoutEffect(() => {
    const host = ref.current?.closest<HTMLElement>('[data-census-offscreen]')
    setPlace({ offscreen: !!host && host.dataset.censusPurpose !== 'scan', onScreen: !host })
  }, [])
  return { ref, ...place }
}

const NEEDS_DATA = 'Needs data'

/**
 * One analysis, as a section of the tab's exports: its sheets carry its name ("Quality ·
 * By university") and the window its numbers cover when that is not the period picked.
 */
function Analysis({ k, ctx, offscreen }: { k: AnalysisKey; ctx: AnalyticsContext; offscreen: boolean }) {
  const def = analysisDef(k)
  const w = def.window(ctx)
  return (
    <FigureSection
      section={{
        key: def.key,
        label: def.label,
        short: def.short,
        ...(w.ignoresPeriod ? { window: w.label } : {}),
      }}
    >
      <AnalysisBody k={k} ctx={ctx} offscreen={offscreen} />
    </FigureSection>
  )
}

/** One analysis: its panel, or its heading over what to add when its data is missing. */
function AnalysisBody({ k, ctx, offscreen }: { k: AnalysisKey; ctx: AnalyticsContext; offscreen: boolean }) {
  const def = analysisDef(k)
  const readiness = def.ready(ctx)
  if (!readiness.ready) return <AnalysisNotReady def={def} ctx={ctx} readiness={readiness} />
  // Each panel gets its own definition and model type (`analysisModel` caches per context).
  switch (k) {
    case 'quality':
      return (
        <QualityPanel
          def={QUALITY}
          model={analysisModel<QualityModel>(ctx, k)}
          ctx={ctx}
          offscreen={offscreen}
        />
      )
    case 'declines':
      return (
        <DeclinesPanel
          def={DECLINES}
          model={analysisModel<DeclinesModel>(ctx, k)}
          ctx={ctx}
          offscreen={offscreen}
        />
      )
    case 'stages':
      return (
        <StagesPanel
          def={STAGES}
          model={analysisModel<StagesModel>(ctx, k)}
          ctx={ctx}
          offscreen={offscreen}
        />
      )
    case 'pyramid':
      return (
        <PyramidPanel
          def={PYRAMID}
          model={analysisModel<PyramidModel>(ctx, k)}
          ctx={ctx}
          offscreen={offscreen}
        />
      )
  }
}

/** The picker: a segmented control, or a menu button on phones so four long labels never wrap. */
function Picker({
  shown,
  current,
  ready,
}: {
  shown: readonly AnalysisDef[]
  current: AnalysisKey
  ready: (k: AnalysisKey) => boolean
}) {
  const narrow = useNarrow()
  const pick = (k: AnalysisKey) => {
    if (k !== current) goTo('hrbp', analysesTab(k))
  }
  const currentLabel = shown.find((d) => d.key === current)?.label ?? ''
  return (
    <div data-tour="hrbp-analyses-picker" className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
      {narrow ? (
        <Menu
          align="start"
          width={260}
          trigger={
            <Button size="sm" caret>
              Analysis: {currentLabel}
            </Button>
          }
          items={shown.map((d) => ({
            label: d.label,
            hint: ready(d.key) ? undefined : NEEDS_DATA,
            onSelect: () => pick(d.key),
          }))}
        />
      ) : (
        <>
          <span className="text-small text-ink-2" aria-hidden="true">
            Analysis
          </span>
          <Segmented
            label="Analysis"
            size="md"
            value={current}
            onChange={pick}
            options={shown.map((d) => ({
              value: d.key,
              label: d.label,
              hint: ready(d.key) ? undefined : NEEDS_DATA,
            }))}
          />
        </>
      )}
    </div>
  )
}

export function AnalysesTab({ tab }: { tab: string }) {
  const ctx = useAnalytics()
  const navigate = useCensus((s) => s.navigate)
  const { ref, offscreen, onScreen } = usePlacement()
  const shown = shownAnalyses(ctx)
  const asked = parseAnalysesTab(tab).key
  const current = asked && shown.includes(asked) ? asked : openingAnalysis(ctx)
  // A bare, unknown or hidden address names the analysis it opened (history replace).
  useEffect(() => {
    if (onScreen && current && asked !== current)
      navigate('hrbp', analysesTab(current), { history: 'replace', scroll: false })
  }, [onScreen, current, asked, navigate])

  if (!current)
    return (
      <div ref={ref} className="text-small text-ink-2">
        No special analysis is shown in this mode.
      </div>
    )
  if (offscreen)
    return (
      <div ref={ref}>
        {shown.map((k) => (
          <Analysis key={k} k={k} ctx={ctx} offscreen />
        ))}
      </div>
    )
  return (
    <div ref={ref}>
      <Picker shown={shown.map(analysisDef)} current={current} ready={(k) => isReady(ctx, k)} />
      <Analysis k={current} ctx={ctx} offscreen={false} />
    </div>
  )
}
