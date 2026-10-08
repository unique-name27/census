/**
 * The Developer page (`#dev`, docs/ROLES.md part 5, docs/DESIGN-REFRESH.md 4.3, docs/ROLES-V2.md
 * 5.13): every view, figure, metric, tool and setting in Census, and the state behind the screen.
 * Lazy-loaded by the shell, so the other modes load none of it. Its tabs sit under its own header,
 * like the Data room's: Overview (the Developer home), Inventory (with Role homes and "Preview a
 * role"), Access (every surface in the eleven modes), the Security center when this build has it
 * (docs/SECURITY-CENTER.md, built in `./security/`), Ask tools, State and Timings. Sub-addresses
 * use the colon form: `#dev.inventory:figures`, `#dev.ask:query_records`.
 *
 * Its figures describe the app, not people: `gate={false}`, no metric dictionary entry, and their
 * numbers open the matching inventory rows, Data room entries or data records.
 */
import type { ComponentType } from 'react'
import { type CurrentView, CurrentViewProvider } from '@/components/currentView'
import { DEV_TABS, parseDevTab } from './tabs'
import { AccessTab } from './ui/AccessTab'
import { AskConsoleTab } from './ui/AskConsoleTab'
import { DEV_BODY_ID, DevHeader } from './ui/Header'
import { InventoryTab } from './ui/InventoryTab'
import { OverviewTab } from './ui/OverviewTab'
import { StateTab } from './ui/StateTab'
import { TimingsTab } from './ui/TimingsTab'

export { DEV_TABS }

type TabBody = ComponentType<{ sub: string }>

/** The Security center's tab, when `./security/index.tsx` is in this build (`DEV_TABS` lists it then). */
const SECURITY = Object.values(
  import.meta.glob<{ SecurityTab?: TabBody; default?: TabBody }>('./security/index.tsx', { eager: true }),
)[0]
const SecurityTab: TabBody | null = SECURITY?.SecurityTab ?? SECURITY?.default ?? null

export default function DevPage({ tab: routeTab }: { tab: string }) {
  const { tab, sub } = parseDevTab(routeTab)
  const current: CurrentView = {
    key: 'dev',
    label: 'Developer',
    tabs: DEV_TABS.map((t) => ({ key: t.key, label: t.label })),
    tab,
    datasets: [],
  }
  return (
    <CurrentViewProvider value={current}>
      <DevHeader tab={tab} />
      <div id={DEV_BODY_ID} role="tabpanel" aria-labelledby={`subtab-dev-${tab}`} className="pt-5">
        {tab === 'overview' ? (
          <OverviewTab sub={sub} />
        ) : tab === 'inventory' ? (
          <InventoryTab sub={sub} />
        ) : tab === 'access' ? (
          <AccessTab />
        ) : tab === 'security' && SecurityTab ? (
          <SecurityTab sub={sub} />
        ) : tab === 'ask' ? (
          <AskConsoleTab sub={sub} />
        ) : tab === 'state' ? (
          <StateTab />
        ) : (
          <TimingsTab />
        )}
      </div>
    </CurrentViewProvider>
  )
}
