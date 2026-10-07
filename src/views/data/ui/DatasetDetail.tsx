/**
 * The open state of a manifest row: four panels on the dataset's current version, in the order
 * data comes in. Raw (the sheet as uploaded), Mapping (where each field came from; confirm or
 * re-map), Quality (fill rates, checks and tiers) and Certify (the checklist, control totals and
 * the version history).
 */
import { type KeyboardEvent, useEffect, useMemo, useRef } from 'react'
import { rovingIndex } from '@/app/keyboard'
import { cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { computeQuality, isCertified, type QualityIndex } from '@/data/quality'
import type { Datasets } from '@/data/schema'
import { useCensus } from '@/data/store'
import type { ManifestRow } from '../engine/manifest'
import { DATASET_PANELS, type DatasetPanel, DEFAULT_PANEL, PANEL_LABEL } from '../links'
import { useRoom } from '../state/room'
import { CertifyPanel } from './detail/CertifyPanel'
import { MappingPanel } from './detail/MappingPanel'
import { QualityPanel } from './detail/QualityPanel'
import { RawPanel } from './detail/RawPanel'
import { useRawRecord } from './detail/useRawRecord'

/** A short status after each panel's name, so the strip reads as a checklist. */
function panelStatus(
  panel: DatasetPanel,
  args: { confirmed: boolean; certified: boolean; hasRaw: boolean; below: number },
) {
  switch (panel) {
    case 'raw':
      return args.hasRaw ? null : 'none kept'
    case 'mapping':
      return args.confirmed ? 'confirmed' : 'not confirmed'
    case 'quality':
      return args.below ? `${args.below} ${args.below === 1 ? 'field' : 'fields'} at bronze` : null
    case 'certify':
      return args.certified ? 'certified' : null
  }
}

export function DatasetDetail({ row, data, id }: { row: ManifestRow; data: Datasets; id: string }) {
  const ctx = useAnalytics()
  const versions = useCensus((s) => s.versions)
  const version = versions[row.key]
  const panel = useRoom((s) => s.panel[row.key] ?? DEFAULT_PANEL)
  const setPanel = useRoom((s) => s.setPanel)
  const reveal = useRoom((s) => (s.reveal?.key === row.key ? s.reveal.nonce : null))
  const { raw, loading } = useRawRecord(row.key, version)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const issues = useMemo(() => (raw ? { [row.key]: raw.issues } : undefined), [raw, row.key])
  // The same index as everywhere, plus this version's import log so import problems open their rows.
  const index: QualityIndex = useMemo(
    () =>
      issues
        ? computeQuality(ctx.all, versions, issues, { asOf: ctx.asOf, vocab: ctx.quality.vocab })
        : ctx.quality,
    [issues, ctx.all, versions, ctx.asOf, ctx.quality],
  )
  // A request to show this dataset (a tier badge, a link) moves focus to its open panel tab.
  useEffect(() => {
    if (reveal == null) return
    tabs.current[DATASET_PANELS.indexOf(panel)]?.focus({ preventScroll: true })
  }, [reveal, panel])

  if (!version) return null
  // Fields a silver or gold dataset holds at bronze (thin or unrecognized values).
  const below = ctx.quality.fields(row.key).filter((f) => f.capReason != null).length
  const status = {
    confirmed: !!version.mappingConfirmedAt,
    certified: isCertified(version),
    hasRaw: version.hasRaw,
    below,
  }
  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = rovingIndex(e.key, i, DATASET_PANELS.length)
    if (next == null) return
    e.preventDefault()
    tabs.current[next]?.focus()
    setPanel(row.key, DATASET_PANELS[next])
  }
  const tabId = (p: DatasetPanel) => `${id}-tab-${p}`
  return (
    <div id={id} data-tour="dataset-detail" className="border-t border-rule bg-sheet">
      <div className="px-4 pt-3">
        <p className="max-w-[80ch] text-small text-ink-2">{row.description}</p>
        <div
          role="tablist"
          aria-label={`${row.label} panels`}
          data-tour="dataset-panels"
          className="mt-2 flex gap-4 overflow-x-auto border-b border-rule sm:gap-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {DATASET_PANELS.map((p, i) => {
            const selected = p === panel
            const s = panelStatus(p, status)
            return (
              <button
                key={p}
                ref={(el) => {
                  tabs.current[i] = el
                }}
                type="button"
                role="tab"
                id={tabId(p)}
                aria-selected={selected}
                aria-controls={`${id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setPanel(row.key, p)}
                onKeyDown={onKeyDown(i)}
                className={cx(
                  'relative flex h-9 shrink-0 items-center gap-1.5 text-small whitespace-nowrap transition-colors focus-visible:-outline-offset-2',
                  selected
                    ? 'font-semibold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink'
                    : 'font-medium text-ink-2 hover:text-ink',
                )}
              >
                <span className="tnum text-muted">{i + 1}</span>
                {PANEL_LABEL[p]}
                {s && <span className="hidden text-meta font-normal text-muted sm:inline">· {s}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={tabId(panel)} className="px-4 pt-4 pb-5">
        {panel === 'raw' && <RawPanel row={row} version={version} raw={raw} loading={loading} data={data} />}
        {panel === 'mapping' && <MappingPanel row={row} version={version} raw={raw} rawLoading={loading} />}
        {panel === 'quality' && <QualityPanel row={row} data={data} index={index} />}
        {panel === 'certify' && <CertifyPanel row={row} version={version} data={data} index={index} />}
      </div>
    </div>
  )
}
