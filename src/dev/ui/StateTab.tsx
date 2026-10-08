/**
 * Developer > State (docs/ROLES.md, 5.6): the state behind the screen as sheets of label and value
 * (route, scope, mode, switches, quality index, data, saved views, panels, storage), each with
 * "Copy as JSON", and the bytes each storage key takes. The Ask key and the workspace ID are never
 * copied, only whether they are set.
 */
import { useMemo } from 'react'
import { matrixCounts } from '@/access/matrix'
import { picksOfState, useMode } from '@/access/store'
import { readWorkspaceId } from '@/ask/engine/keys'
import { readModelChoice } from '@/ask/engine/models'
import { useAsk } from '@/ask/ui/store'
import { BarList, Figure } from '@/charts'
import { IconCopy } from '@/components/icons'
import { goTo } from '@/components/navigation'
import { Grid } from '@/components/Section'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { savedDataStandard, useCensus } from '@/data/store'
import { readScope, splitHash } from '@/data/urlScope'
import { useSavedViews } from '@/data/viewsStore'
import { useDrillStore } from '@/drill/store'
import { useHelp } from '@/help/store'
import { useQualityLens } from '@/views/data/quality-overview/lens'
import { VIEWS } from '@/views/registry'
import { accessRows } from '../accessInventory'
import { askKeyState } from '../live'
import { bytesText, type StorageBar, storageBars } from '../overview'
import { COPY_NOTE, stateSections } from '../state'
import { useDev } from '../store'
import { devTab } from '../tabs'
import { useStorageRows } from './OverviewTab'
import { ABOUT_APP, copyText } from './shared'

export function StateTab() {
  const ctx = useAnalytics()
  const route = useCensus((s) => s.route)
  const versions = useCensus((s) => s.versions)
  const asOfOverride = useCensus((s) => s.asOfOverride)
  const unavailable = useCensus((s) => s.storageUnavailable)
  const lens = useQualityLens((s) => s.on)
  const views = useSavedViews((s) => s.views)
  const appliedId = useSavedViews((s) => s.appliedId)
  const startupId = useSavedViews((s) => s.startupId)
  const stack = useDrillStore((s) => s.stack)
  const helpOpen = useHelp((s) => s.open)
  const tour = useHelp((s) => s.tour)
  const askOpen = useAsk((s) => s.open)
  const turns = useAsk((s) => s.turns)
  useAsk((s) => s.keyVersion)
  const storage = useStorageRows()
  const focusInventory = useDev((s) => s.focusInventory)
  const counts = useMemo(() => matrixCounts(accessRows(VIEWS)), [])
  const picks = picksOfState({ picks: useMode((s) => s.picks), managerId: useMode((s) => s.managerId) })
  const hash = typeof location === 'undefined' ? '' : location.hash
  const top = stack[stack.length - 1]
  const name = (id: string | null) => (id ? (views.find((v) => v.id === id)?.name ?? id) : null)

  const sections = stateSections({
    ctx,
    route,
    hash,
    addressScope: readScope(splitHash(hash).query),
    asOfOverride,
    savedStandard: savedDataStandard(),
    lens,
    versions,
    counts,
    picks,
    savedViews: { count: views.length, applied: name(appliedId), startup: name(startupId) },
    panels: {
      drillDepth: stack.length,
      drillTop: top ? (top.type === 'person' ? 'person card' : top.spec.kind) : null,
      helpOpen,
      tour: tour?.id ?? null,
      askOpen,
      askTurns: turns.length,
      askKey: askKeyState(),
      model: readModelChoice(),
      workspaceSet: !!readWorkspaceId(),
    },
    storage: { unavailable, rows: storage.rows },
  })
  const bars = storageBars(storage.rows ?? [])

  return (
    <>
      <p className="max-w-[80ch] text-small text-ink-2">{COPY_NOTE}</p>
      <div data-tour="dev-state" className="mt-4">
        <Grid>
          {sections.map((s) => (
            <section
              key={s.id}
              aria-labelledby={`dev-state-${s.id}`}
              className="col-span-full flex min-w-0 flex-col self-start rounded-sheet bg-sheet md:col-span-6 xl:col-span-4"
            >
              <header className="flex items-center gap-2 border-b border-rule px-4 pt-4 pb-3 lg:px-5">
                <h2 id={`dev-state-${s.id}`} className="cut-head min-w-0 flex-1 text-title font-semibold">
                  {s.title}
                </h2>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<IconCopy />}
                  onClick={() =>
                    void copyText(JSON.stringify(s.json, null, 2), `the ${s.title.toLowerCase()} state`)
                  }
                >
                  Copy as JSON
                </Button>
              </header>
              <dl className="flex flex-col px-4 py-2 lg:px-5">
                {s.rows.map((r) => (
                  <div
                    key={r.label}
                    className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 border-t border-rule py-1.5 first:border-t-0"
                  >
                    <dt className="text-meta text-ink-2">{r.label}</dt>
                    <dd className="min-w-0 text-meta break-words text-ink">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </Grid>
      </div>
      <Grid className="mt-4">
        <Figure
          id="dev-storage"
          title="Storage by key"
          subtitle="Bytes each census: key takes in this browser, the 12 largest and the rest together"
          data={bars.map((b) => ({ key: b.key, where: b.where, bytes: b.bytes, size: bytesText(b.bytes) }))}
          columns={[
            { key: 'key', label: 'Key' },
            { key: 'where', label: 'Where' },
            { key: 'bytes', label: 'Bytes', format: 'int' },
            { key: 'size', label: 'Size' },
          ]}
          definitions={[ABOUT_APP]}
          note={storage.rows ? `${storage.rows.length} keys` : 'Reading the stores.'}
          gate={false}
          span={12}
          actions={
            <Button size="sm" variant="ghost" onClick={storage.refresh}>
              Read again
            </Button>
          }
          empty={
            storage.rows
              ? bars.length
                ? null
                : 'Census keeps nothing in this browser yet.'
              : 'Reading the browser’s stores.'
          }
        >
          <BarList<StorageBar>
            data={bars}
            label="key"
            value="bytes"
            format="int"
            sort="none"
            valueText={(b) => bytesText(b.bytes)}
            secondary={(b) => b.where}
            onSelect={(b) => {
              focusInventory('storage', b.folded.length ? '' : b.key)
              goTo('dev', devTab('inventory', 'storage'))
            }}
            ariaLabel="Bytes per storage key"
          />
        </Figure>
      </Grid>
    </>
  )
}
