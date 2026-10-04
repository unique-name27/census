/**
 * What a figure shows when the data standard holds it back: a calm note naming the field or
 * dataset that holds it back and how to raise it, with "Preview anyway". A preview carries a
 * strong bronze watermark band and a bar that says it is on screen only; it is never exported.
 */
import { type ReactNode, useEffect, useRef } from 'react'
import { openDatasetQuality } from '@/app/datasetFocus'
import { MedalGlyph } from '@/components/tier/TierBadge'
import type { HeldBack } from '@/components/tier/tierModel'
import { cx } from '@/components/ui'
import { type DataStandard, STANDARD_LABEL, TIER_LABEL, type Tier } from '@/data/quality/tier'
import { datasetDef } from '@/data/schema'

const LINK =
  'inline-flex items-center rounded-[2px] text-[12px] font-medium text-link underline-offset-2 hover:underline'

/** Focus the element on mount when asked (after the reader toggled the preview). */
function useFocusOnMount<E extends HTMLElement>(focus: boolean | undefined) {
  const ref = useRef<E>(null)
  useEffect(() => {
    if (focus) ref.current?.focus()
  }, [focus])
  return ref
}

export function HeldBackState({
  held,
  tier,
  onPreview,
  focusPreview,
}: {
  held: HeldBack
  tier: Tier
  /** Shown only when there is data to preview. */
  onPreview?: () => void
  /** Move focus to "Preview anyway" (the reader just hid the preview). */
  focusPreview?: boolean
}) {
  const previewRef = useFocusOnMount<HTMLButtonElement>(focusPreview)
  return (
    <div className="flex min-h-28 flex-col justify-center gap-1 rounded-control bg-sheet-2 px-4 py-4 text-[13px]">
      <p className="flex items-center gap-1.5 font-semibold text-ink">
        <MedalGlyph tier={tier} />
        {held.title}
      </p>
      <p className="max-w-[72ch] leading-snug text-ink-2">{held.body}</p>
      {held.raise && <p className="max-w-[72ch] leading-snug text-ink-2">{held.raise}</p>}
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {held.dataset && (
          <button type="button" className={LINK} onClick={() => openDatasetQuality(held.dataset!)}>
            Open {datasetDef(held.dataset).label} in the Data room
          </button>
        )}
        {held.canPreview && onPreview && (
          <button ref={previewRef} type="button" className={LINK} onClick={onPreview}>
            Preview anyway
          </button>
        )}
      </div>
    </div>
  )
}

/** The bar above a preview: what it is, that it stays on screen, and how to hide it. */
export function PreviewBar({
  tier,
  standard,
  onHide,
  focusHide,
}: {
  tier: Tier
  standard: DataStandard
  onHide: () => void
  /** Move focus to "Hide preview" (the reader just asked for the preview). */
  focusHide?: boolean
}) {
  const hideRef = useFocusOnMount<HTMLButtonElement>(focusHide)
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control bg-tier-bronze-wash px-3 py-1.5 text-[12px] leading-snug">
      <MedalGlyph tier="bronze" />
      <span className="font-semibold text-ink">Preview</span>
      <span className="min-w-0 flex-1 text-ink-2">
        {TIER_LABEL[tier]} data, below the {STANDARD_LABEL[standard]} standard. On this screen only, never
        exported.
      </span>
      <button ref={hideRef} type="button" className={LINK} onClick={onHide}>
        Hide preview
      </button>
    </div>
  )
}

/** While `active`, the body sits under a strong bronze band across its middle; the band never takes a click. */
export function PreviewFrame({
  active,
  children,
  className,
}: {
  active: boolean
  children: ReactNode
  className?: string
}) {
  if (!active) return children
  return (
    <div className={cx('relative', className)}>
      {children}
      <div
        aria-hidden="true"
        data-preview-band
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-y-2 border-tier-bronze bg-[color-mix(in_srgb,var(--tier-bronze)_16%,var(--sheet))]/90 py-1 text-center text-[11px] font-semibold tracking-[0.08em] text-tier-bronze uppercase"
      >
        Preview · below the data standard
      </div>
    </div>
  )
}
