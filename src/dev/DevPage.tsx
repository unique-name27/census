/**
 * The Developer page (`#dev`, docs/ROLES.md part 5, docs/DESIGN-REFRESH.md 4.3): every view, figure,
 * metric, tool and setting in Census, and the state behind the screen. Lazy-loaded by the shell,
 * so HR and Manager mode load none of it. Six tabs under its own header, like the Data room's:
 * Overview (the Developer home), Inventory, Access, Ask tools, State and Timings. Sub-addresses use
 * the colon form: `#dev.inventory:figures`, `#dev.ask:query_records`.
 *
 * Its figures describe the app, not people: `gate={false}`, no metric dictionary entry, and their
 * numbers open the matching inventory rows, Data room entries or data records.
 */
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
