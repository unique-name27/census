/**
 * The three debug overlay switches (docs/ROLES.md, 5.8), on the Developer page header and in
 * Settings > Mode in Developer mode. Small: Settings loads it without the Developer page.
 */
import { Switch } from '@/components/ui'
import { OVERLAY_HINT, OVERLAY_KEYS, OVERLAY_LABEL, useDev } from '../store'

export function OverlaySwitches({ hints = false }: { hints?: boolean }) {
  const overlays = useDev((s) => s.overlays)
  const setOverlay = useDev((s) => s.setOverlay)
  return (
    <fieldset
      data-tour="dev-overlays"
      className={hints ? 'flex flex-col gap-3' : 'flex flex-wrap items-center gap-x-5 gap-y-2'}
    >
      <legend className="sr-only">Debug overlays</legend>
      {OVERLAY_KEYS.map((k) =>
        hints ? (
          <div key={k} className="flex flex-col gap-1">
            <Switch checked={overlays[k]} onChange={(on) => setOverlay(k, on)} label={OVERLAY_LABEL[k]} />
            <p className="text-meta leading-snug text-muted">{OVERLAY_HINT[k]}</p>
          </div>
        ) : (
          <Switch
            key={k}
            checked={overlays[k]}
            onChange={(on) => setOverlay(k, on)}
            label={OVERLAY_LABEL[k]}
          />
        ),
      )}
    </fieldset>
  )
}
