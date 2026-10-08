/**
 * The Home view's body (docs/ROLES-V2.md 5.1): the home of the mode on screen. A scoped mode
 * waiting for its pick shows only the empty state with its picker (4.13); a scope under the
 * anonymity minimum says that rates are hidden and lists still show (1.3). In Developer mode the
 * page links to the Developer page's preview of each role's home, in that role's own mode, and the
 * welcome line shows only when the mode on screen is the live one (5.13).
 */
import { PICKER_COPY, smallScopeNote } from '@/access/copy'
import { PICK_OF } from '@/access/modes'
import { openPicker, useMode } from '@/access/store'
import { Button, EmptyState, Grid, Pending } from '@/components'
import { RouteLink } from '@/components/RouteLink'
import { useAnalytics, useAnalyticsPending } from '@/data/context'
import { WelcomeCard } from '@/help/ui/WelcomeCard'
import { minGroupOf } from '@/metrics/privacy'
import { SLUG_OF } from '../engine/figures'
import { homePreviewLinks, ROLE_HOMES_TAB } from '../engine/previews'
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
  if (!slug && access.mode === 'developer') return <DeveloperHome />
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

const LINK = 'rounded-mark font-medium text-link underline-offset-2 hover:underline'

/**
 * Developer mode has no home of its own: a link to the Developer page's preview of each role's
 * home, laid out there with that role's numbers and pick while Census stays in Developer mode.
 */
function DeveloperHome() {
  return (
    <EmptyState
      title="Home is each role's first page"
      body={
        <>
          <p>
            The CHRO, the HR business partners, Compensation, Talent management, HR ops, Recruiter and Finance
            modes open here, each on its own home. Preview one on the Developer page, with that role's numbers
            and pick, while Census stays in Developer mode.
          </p>
          <ul aria-label="Preview a role's home" className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {homePreviewLinks().map((l) => (
              <li key={l.mode}>
                <RouteLink view="dev" tab={l.tab} className={LINK}>
                  {l.label}
                </RouteLink>
              </li>
            ))}
          </ul>
        </>
      }
      action={
        <RouteLink view="dev" tab={ROLE_HOMES_TAB} className={LINK}>
          All role homes in Inventory
        </RouteLink>
      }
    />
  )
}
