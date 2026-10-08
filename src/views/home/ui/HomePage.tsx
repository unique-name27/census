/**
 * The Home view's body (docs/ROLES-V2.md 5.1): the home of the mode on screen. A scoped mode
 * waiting for its pick shows only the empty state with its picker (4.13); a scope under the
 * anonymity minimum says that rates are hidden and lists still show (1.3). In Developer mode the
 * page says how to see a role's home (the Developer page previews each one in its own mode).
 */
import { PICKER_COPY, smallScopeNote } from '@/access/copy'
import { PICK_OF } from '@/access/modes'
import { openPicker, useMode } from '@/access/store'
import { Button, EmptyState, Grid, Pending } from '@/components'
import { useAnalytics, useAnalyticsPending } from '@/data/context'
import { WelcomeCard } from '@/help/ui/WelcomeCard'
import { minGroupOf } from '@/metrics/privacy'
import { SLUG_OF } from '../engine/figures'
import { ChroHome } from './ChroHome'
import { CompHome } from './CompHome'
import { FinHome } from './FinHome'
import { HrbpHome } from './HrbpHome'
import { OpsHome } from './OpsHome'
import { RecHome } from './RecHome'
import { TalentHome } from './TalentHome'

export function HomePage() {
  const ctx = useAnalytics()
  const { access } = ctx
  // The context follows a mode change a moment later: hold the frame rather than flash the
  // previous mode's home. An off-screen tree in a mode of its own is never behind.
  const liveMode = useMode((s) => s.mode)
  const catchingUp = useAnalyticsPending()
  if (catchingUp && liveMode !== access.mode)
    return (
      <Grid>
        <Pending title="Home" height={200} message="Switching mode." />
      </Grid>
    )
  const slug = SLUG_OF[access.mode]
  if (!slug)
    return (
      <EmptyState
        title="Home is each role's first page"
        body="The CHRO, the HR business partners, Compensation, Talent management, HR ops, Recruiter and Finance modes open here, each on its own home. Switch to one with Mode to see it."
      />
    )
  const kind = PICK_OF[access.mode]
  if (kind && kind !== 'manager' && access.unset) {
    const copy = PICKER_COPY[kind]
    return (
      <EmptyState
        title={copy.title}
        body={copy.dek}
        action={
          <Button variant="primary" size="sm" onClick={() => openPicker(kind)}>
            {copy.title}
          </Button>
        }
      />
    )
  }
  const min = minGroupOf(ctx.metrics)
  const s = access.scope
  const small = !!s && !!kind && kind !== 'manager' && s.size < min
  return (
    <>
      <WelcomeCard variant="home" className="mb-4" />
      {small && s && kind && (
        <p role="note" className="mb-4 max-w-[70ch] text-small text-ink-2">
          {smallScopeNote(kind, s.label, min)}
        </p>
      )}
      {slug === 'chro' && <ChroHome />}
      {slug === 'hrbp' && <HrbpHome />}
      {slug === 'comp' && <CompHome />}
      {slug === 'talent' && <TalentHome />}
      {slug === 'ops' && <OpsHome />}
      {slug === 'rec' && <RecHome />}
      {slug === 'fin' && <FinHome />}
    </>
  )
}
