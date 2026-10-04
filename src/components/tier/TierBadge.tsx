/**
 * The tier of a number: a medal glyph and the word ("Gold", "Silver", "Bronze", "No data"), so
 * the tier never relies on color. Hover or focus explains it; a click opens the dataset's
 * Quality panel in the Data room.
 */
import type { ReactNode } from 'react'
import { openDatasetQuality } from '@/app/datasetFocus'
import { TIER_LABEL, type Tier } from '@/data/quality/tier'
import { type DatasetKey, datasetDef } from '@/data/schema'
import { cx, Tip } from '../ui'
import { withoutTierPrefix } from './tierModel'

const GLYPH_COLOR: Record<Tier, string> = {
  gold: 'text-tier-gold',
  silver: 'text-tier-silver',
  bronze: 'text-tier-bronze',
  none: 'text-muted',
}

const WASH: Record<Tier, string> = {
  gold: 'bg-tier-gold-wash',
  silver: 'bg-tier-silver-wash',
  bronze: 'bg-tier-bronze-wash',
  none: 'bg-sheet-3',
}

/** A five-point star centered in the medal, cut out in the sheet color. */
const STAR = 'M8 7.4 8.65 9.11 10.47 9.2 9.05 10.34 9.53 12.1 8 11.1 6.47 12.1 6.95 10.34 5.53 9.2 7.35 9.11Z'

/**
 * A medal on a ribbon. Gold carries a star, silver a ring, bronze is plain; "no data" is an empty
 * dashed disc. Colors come from the --tier-* tokens (>= 3:1 on every surface).
 */
export function MedalGlyph({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cx('size-3.5 shrink-0', GLYPH_COLOR[tier], className)}
    >
      {tier === 'none' ? (
        <circle cx="8" cy="9.25" r="4.75" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 2" />
      ) : (
        <>
          <path
            d="M5.25 1.75 7.25 5.6M10.75 1.75 8.75 5.6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="8" cy="10" r="5" fill="currentColor" />
          {tier === 'gold' && <path d={STAR} fill="var(--sheet)" />}
          {tier === 'silver' && <circle cx="8" cy="10" r="2.1" stroke="var(--sheet)" strokeWidth="1.4" />}
        </>
      )}
    </svg>
  )
}

export interface TierBadgeProps {
  tier: Tier
  /** What the tier means for this number, e.g. `quality.explainOf(uses, fallback)`. */
  explain?: string
  /** The dataset to open on click; without it (and without `onOpen`) the badge is not a button. */
  dataset?: DatasetKey | null
  /** Replaces the default click (open the dataset's Quality panel). */
  onOpen?: () => void
  /** Small and quiet, for tile and figure headers. */
  compact?: boolean
  className?: string
}

export function TierBadge({ tier, explain, dataset, onOpen, compact, className }: TierBadgeProps) {
  const word = TIER_LABEL[tier]
  const open = onOpen ?? (dataset ? () => openDatasetQuality(dataset) : null)
  const body = (
    <>
      <MedalGlyph tier={tier} className={compact ? 'size-3' : 'size-3.5'} />
      <span>{word}</span>
    </>
  )
  const look = cx(
    'inline-flex shrink-0 items-center whitespace-nowrap rounded-[3px] leading-none select-none',
    compact
      ? 'h-5 gap-1 px-1 text-[11px] font-medium text-ink-2'
      : cx('h-6 gap-1.5 px-1.5 text-[12px] font-semibold text-ink', WASH[tier]),
    className,
  )
  const detail = explain ? withoutTierPrefix(explain) : null
  const where = dataset ? `Opens ${datasetDef(dataset).label} in the Data room.` : null
  const tip: ReactNode = (
    <span className="block">
      <span className="font-semibold">{word}.</span> {detail}
      {open && where && <span className="mt-1 block text-muted">{where}</span>}
    </span>
  )
  const sr = [detail, open ? where : null].filter(Boolean).join(' ')
  if (!open)
    return (
      <Tip content={tip}>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: focus shows the explanation, as hover does */}
        <span tabIndex={0} className={cx(look, 'cursor-default')}>
          {body}
          {sr && <span className="sr-only"> tier. {sr}</span>}
        </span>
      </Tip>
    )
  return (
    <Tip content={tip}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          open()
        }}
        className={cx(look, 'relative z-10 hover:bg-hover hover:text-ink active:bg-press')}
      >
        {body}
        {sr && <span className="sr-only"> tier. {sr}</span>}
      </button>
    </Tip>
  )
}
