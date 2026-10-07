/**
 * Gallery: the data tier pieces. The badge in each tier (full and compact), the note that stands
 * in for a figure below the data standard, and a preview under its bronze band.
 */
import { useState } from 'react'
import { MedalGlyph, TierBadge } from '@/components/tier/TierBadge'
import type { HeldBack } from '@/components/tier/tierModel'
import { TIER_LABEL, TIERS, type Tier } from '@/data/quality/tier'
import { Figure } from '../Figure'
import { HeldBackState, PreviewBar, PreviewFrame } from '../FigureGate'
import { BarList } from '../kit/BarList'
import * as D from './data'

const EXPLAIN: Record<Tier, string> = {
  gold: 'Gold: Employees certified 30 Sep by HRIS team. Termination type is 100% filled for leavers.',
  silver: 'Silver: Candidates mapping confirmed 2 Oct by you; not certified. Current stage is 97% filled.',
  bronze:
    'Bronze: Employees certified 30 Sep by HRIS team. Termination reason is 72% filled for leavers; silver needs 95%.',
  none: 'No data: Employees had no column for job function.',
}

const HELD: HeldBack = {
  title: 'Not yet confirmed for production',
  body: 'Held back by Candidates, which is Bronze. Candidates mapping not yet confirmed.',
  raise:
    'To raise it, review and confirm the Candidates mapping and have the data owner certify this Candidates version in the Data room.',
  dataset: null,
  canPreview: true,
}

export function TierGallery({ onOpen }: { onOpen: (what: string) => void }) {
  const [preview, setPreview] = useState(true)
  return (
    <div className="col-span-12 grid grid-cols-12 gap-4">
      <section
        aria-label="Tier badges"
        className="col-span-12 rounded-sheet bg-sheet px-4 py-3.5 lg:col-span-6"
      >
        <h3 className="cut-head text-title font-semibold">Tier badges</h3>
        <p className="mt-0.5 text-small text-ink-2">
          Medal and word, so the tier never relies on color. Hover or focus to read why; click opens the
          dataset in the Data room.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[...TIERS].reverse().map((t) => (
            <TierBadge key={t} tier={t} explain={EXPLAIN[t]} onOpen={() => onOpen(TIER_LABEL[t])} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
          {[...TIERS].reverse().map((t) => (
            <TierBadge key={t} compact tier={t} explain={EXPLAIN[t]} onOpen={() => onOpen(TIER_LABEL[t])} />
          ))}
          <span className="ml-2 flex items-center gap-1.5 text-muted">
            {[...TIERS].reverse().map((t) => (
              <MedalGlyph key={t} tier={t} className="size-4" />
            ))}
          </span>
        </div>
      </section>
      <section
        aria-label="Held back"
        className="col-span-12 rounded-sheet bg-sheet px-4 py-3.5 lg:col-span-6"
      >
        <h3 className="cut-head mb-3 text-title font-semibold">Below the data standard</h3>
        <HeldBackState held={HELD} tier="bronze" onPreview={() => setPreview(true)} />
      </section>
      <Figure
        id="gal-preview"
        title="Preview below the standard"
        subtitle="Shown on screen only, under a bronze band; exports carry the reason instead"
        data={D.attritionByDept}
        columns={[
          { key: 'department', label: 'Department' },
          { key: 'rate', label: 'Attrition', format: 'pct' },
        ]}
        span={6}
        gate={false}
      >
        {preview ? (
          <>
            <PreviewBar tier="bronze" standard="gold" onHide={() => setPreview(false)} />
            <PreviewFrame active>
              <BarList data={D.attritionByDept} label="department" value="rate" format="pct" top={6} />
            </PreviewFrame>
          </>
        ) : (
          <HeldBackState held={HELD} tier="bronze" onPreview={() => setPreview(true)} />
        )}
      </Figure>
    </div>
  )
}
