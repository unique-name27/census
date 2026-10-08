/**
 * The drill panel: a sheet that slides in from the right with the records behind a number
 * (sortable, searchable, exportable) and, one click further, a person's card. Counts inside it
 * (a manager's org, a req's applications, a person's open cases) open their records on top, and
 * Back walks out again. Only rows that lead somewhere are clickable. The header shows the tier of
 * the drilled number when the spec names its fields, otherwise the tier of the records' dataset,
 * labeled as such. Mounted once by the app shell; opened with openDrill(spec) / openPerson(id)
 * from anywhere.
 *
 * One surface (docs/DESIGN-REFRESH.md 2.4): the sheet tone throughout, parts divided by
 * hairlines. A list of ten or more people opens with a collapsible Summary: two compact figures,
 * the people by department and by level (top five and Other), each bar opening just those
 * records on top. The table sets 32px rows whose text never wraps past two lines.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { KIND_NOT_SHOWN, recordsLeftOut } from '@/access/copy'
import { rowsInLock } from '@/access/records'
import { DataTable } from '@/charts/DataTable'
import { Figure } from '@/charts/Figure'
import { BarList } from '@/charts/kit/BarList'
import { useExportMeta } from '@/charts/useExportMeta'
import {
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconCopy,
  IconDownload,
  IconFile,
  IconFilter,
} from '@/components/icons'
import { TierBadge } from '@/components/tier/TierBadge'
import { toast } from '@/components/toast'
import { Button, Menu } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { datasetDef } from '@/data/schema'
import { vocabularyOf } from '@/data/urlScope'
import { fmt } from '@/lib/format'
import { DrillNesting } from './Drill'
import { filterActionLabels, filterInData, groupName, groupScopes, isFilterable } from './filter'
import { focusScope } from './focus'
import { PersonCard } from './PersonCard'
import { buildDrillTable, DRILLS_KEY, drillNoun, drillTableHint, ROW_KEY, rowPerson } from './records'
import { pushDrill, useDrillStore } from './store'
import { type SummaryGroup, showsSummary, summaryCut } from './summary'
import { drillTier } from './tier'
import { type DrillFilter, type DrillSpec, drillDataset } from './types'

/**
 * The tier of the drilled number (from the spec's `uses`), or of the dataset the records come
 * from, said so; a click opens the Quality panel of the dataset that sets it.
 */
function RecordsTier({ spec }: { spec: DrillSpec }) {
  const { quality } = useAnalytics()
  const t = drillTier(quality, spec)
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {t.ofDataset && (
        <span className="text-meta text-muted">{datasetDef(drillDataset(spec.kind)).label} data</span>
      )}
      <TierBadge tier={t.tier} explain={t.explain} dataset={t.dataset} />
    </span>
  )
}

export function DrillPanel() {
  const stack = useDrillStore((s) => s.stack)
  const close = useDrillStore((s) => s.close)
  const back = useDrillStore((s) => s.back)
  const top = stack[stack.length - 1]
  const below = stack.at(-2)
  // When a list or card opens on top (or Back is used), focus its title so keyboard and screen
  // reader users land on what just opened instead of losing focus with the control they used.
  const depth = useRef(0)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const was = depth.current
    depth.current = stack.length
    if (was && stack.length) body.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  }, [stack.length])
  // Closing returns focus to the control that opened the panel. Base UI's own choice skips a
  // control inside another open dialog (a count in Settings), which left focus behind that dialog.
  // "Filter to" and "Leave out" redraw the figure, so the control is gone: then focus goes to the
  // same figure's title, else to the main region, never to the page body.
  const open = stack.length > 0
  const opener = useRef<HTMLElement | null>(null)
  const openerFigure = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    openerFigure.current = opener.current?.closest('figure[data-tour]')?.getAttribute('data-tour') ?? null
  }, [open])
  const returnFocus = (): HTMLElement | true => returnTarget(opener.current, openerFigure.current)
  // Base UI picks that control as the popup unmounts. When the unmount lands in the same render
  // that redraws the figure, the control it picked is removed right after and focus falls to the
  // page body; so once the panel has closed, check, and put focus where `returnTarget` says.
  useEffect(() => {
    if (open || (!opener.current && !openerFigure.current)) return
    let tries = 0
    let timer = 0
    const check = () => {
      const a = document.activeElement
      if (a && a !== document.body && a.isConnected) {
        // Still inside the closing panel: Base UI has not moved focus back yet.
        if (a.closest('[data-drill-panel]') && tries++ < 6) timer = window.setTimeout(check, 250)
        return
      }
      const target = returnTarget(opener.current, openerFigure.current)
      if (target !== true) target.focus({ preventScroll: true })
    }
    timer = window.setTimeout(check, 250)
    return () => window.clearTimeout(timer)
  }, [open])
  return (
    <BDialog.Root open={stack.length > 0} onOpenChange={(o) => !o && close()}>
      <BDialog.Portal>
        <BDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BDialog.Popup
          data-drill-panel=""
          finalFocus={returnFocus}
          className="fixed top-0 right-0 bottom-0 z-50 flex w-[min(820px,100vw)] flex-col bg-sheet text-ink shadow-(--shadow-pop) outline-none transition-transform duration-200 ease-out data-[ending-style]:translate-x-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-x-6 data-[starting-style]:opacity-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
        >
          <div className="flex items-center gap-2 border-b border-rule px-5 pt-3 pb-2.5">
            {stack.length > 1 && (
              <Button variant="ghost" size="sm" onClick={back} className="-ml-2">
                <span className="rotate-180">
                  <IconChevronRight />
                </span>
                Back
              </Button>
            )}
            <span className="eyebrow min-w-0 flex-1 truncate">
              {top?.type === 'person' ? 'Person' : 'Records behind the number'}
            </span>
            {top?.type === 'records' && <RecordsTier spec={top.spec} />}
            <BDialog.Close
              aria-label="Close"
              className="inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink"
            >
              <IconClose />
            </BDialog.Close>
          </div>
          {/* Keyed by depth: what opens on top starts at the top, with its own sort and search. */}
          <div ref={body} key={stack.length} className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6">
            <DrillNesting>
              {top?.type === 'records' && (
                <RecordsView spec={top.spec} from={below?.type === 'person' ? below.employeeId : null} />
              )}
              {top?.type === 'person' && <PersonCard employeeId={top.employeeId} />}
            </DrillNesting>
          </div>
        </BDialog.Popup>
      </BDialog.Portal>
    </BDialog.Root>
  )
}

/** Where focus goes when the panel closes: the control that opened it, else `focusFallback`. */
function returnTarget(opener: HTMLElement | null, figure: string | null): HTMLElement | true {
  if (opener?.isConnected) return opener
  return focusFallback(figure) ?? true
}

/**
 * Where focus goes when the control that opened the panel is gone: the title of the figure it was
 * in (found again by the figure's stable id), else the main region. The title is made focusable
 * from script only (`tabindex="-1"`), so it never joins the tab order.
 */
function focusFallback(figure: string | null): HTMLElement | null {
  const title = figure
    ? document.querySelector<HTMLElement>(`figure[data-tour="${CSS.escape(figure)}"] figcaption h3`)
    : null
  if (title) {
    if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1')
    return title
  }
  return document.getElementById('census-main')
}

/**
 * "Filter to Bengaluru" and "Leave out Bengaluru" for records whose drill names the group they
 * count (`DrillSpec.filter`). Each one closes the panel, narrows the scope you are in as one
 * history entry and offers Undo. An action is shown only when the filters can say it, it changes
 * something, and it keeps the anonymity minimum (`groupScopes`); both are hidden when a value is
 * not in the loaded data.
 */
function FilterActions({ filter, filterLabel }: { filter: DrillFilter; filterLabel?: string }) {
  const ctx = useAnalytics()
  const scopes = useMemo(
    () => (isFilterable(filter) && filterInData(filter, vocabularyOf(ctx)) ? groupScopes(ctx, filter) : null),
    [ctx, filter],
  )
  if (!scopes || (!scopes.filterTo && !scopes.leaveOut)) return null
  const nameOf = (id: string) => ctx.org.byId.get(id)?.name
  const labels = filterActionLabels(filter, nameOf, filterLabel)
  const name = groupName(filter, nameOf, filterLabel)
  const { filterTo, leaveOut } = scopes
  return (
    <div className="flex flex-wrap items-center gap-2" data-drill-filter="">
      {filterTo && (
        <Button
          icon={<IconFilter />}
          title={`Narrow every view to ${name}`}
          onClick={() =>
            focusScope(filter, { mode: 'include', org: ctx.org, next: filterTo, label: filterLabel })
          }
          className="max-w-full"
        >
          <span className="truncate">{labels.filterTo}</span>
        </Button>
      )}
      {leaveOut && labels.leaveOut && (
        <Button
          title={`Show every view without ${name}`}
          onClick={() =>
            focusScope(filter, { mode: 'exclude', org: ctx.org, next: leaveOut, label: filterLabel })
          }
          className="max-w-full"
        >
          <span className="truncate">{labels.leaveOut}</span>
        </Button>
      )}
    </div>
  )
}

/**
 * One list of records. `from` is the person whose card opened it: their own rows don't reopen
 * them.
 */
function RecordsView({ spec: asked, from }: { spec: DrillSpec; from: string | null }) {
  const ctx = useAnalytics()
  const meta = useExportMeta()
  const openPerson = useDrillStore((s) => s.openPerson)
  // Manager mode (docs/ROLES.md, 3.12): a kind it does not list shows a sentence instead of a
  // table, and rows about people outside the org are left out, said in one muted line.
  const lock = ctx.access.lock
  const shownKind = ctx.access.can(`drill:${asked.kind}`)
  const guarded = useMemo(() => {
    const r = rowsInLock(asked, ctx)
    return { spec: r.leftOut ? { ...asked, rows: r.rows } : asked, leftOut: r.leftOut }
  }, [asked, ctx])
  const spec = guarded.spec
  const table = useMemo(() => buildDrillTable(spec, ctx), [spec, ctx])
  const target = (r: Record<string, unknown>) => {
    const id = rowPerson(ctx, r)
    return id && id !== from ? id : null
  }
  const rowsOpen = table.rows.some((r) => target(r))
  const hint = drillTableHint(spec.kind, {
    rowsOpen,
    cellsOpen: table.rows.some((r) => r[DRILLS_KEY]) || table.columns.some((c) => c.drill),
  })
  const exportTable = {
    name: spec.title,
    title: spec.title,
    subtitle: spec.subtitle,
    note: spec.note,
    columns: table.columns,
    rows: table.rows,
    tier: drillTier(ctx.quality, spec).tier,
  }
  const opts = { showPay: ctx.showPay }

  const onCsv = async () => {
    const m = await import('@/lib/export')
    m.downloadCsv(exportTable, meta, { ...opts, fileName: m.fileStem(meta, spec.title), preamble: true })
  }
  const onXlsx = async () => {
    try {
      const m = await import('@/lib/export')
      await m.downloadXlsx([exportTable], meta, { ...opts, fileName: m.fileStem(meta, spec.title) })
    } catch {
      toast('The workbook could not be created', { tone: 'critical' })
    }
  }
  const onCopy = async () => {
    try {
      const m = await import('@/lib/export')
      const n = await m.copyTable(exportTable, opts)
      toast(`Copied ${fmt(n, 'int')} rows`, { tone: 'good', description: 'Paste into Excel or Sheets.' })
    } catch {
      toast('The browser blocked copying. Download a CSV instead.', { tone: 'critical' })
    }
  }
  // Developer mode: the spec behind the panel, for a bug report or a test (docs/ROLES.md, 5.9).
  const onCopySpec = async () => {
    try {
      const m = await import('@/lib/export/clipboard')
      const { kind, title, filter, uses } = spec
      await m.writeClipboard(JSON.stringify({ kind, title, filter, uses, rows: spec.rows.length }, null, 2))
      toast('Drill spec copied', { tone: 'good' })
    } catch {
      toast('The browser blocked copying', { tone: 'critical' })
    }
  }

  if (!shownKind)
    return (
      <div className="flex flex-col gap-2">
        <BDialog.Title tabIndex={-1} className="cut-head text-section leading-tight font-semibold">
          {spec.title}
        </BDialog.Title>
        <BDialog.Description className="text-small text-ink-2">{KIND_NOT_SHOWN}</BDialog.Description>
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <BDialog.Title tabIndex={-1} className="cut-head text-section leading-tight font-semibold">
            {spec.title}
          </BDialog.Title>
          <BDialog.Description className="mt-1 text-small text-ink-2">
            {spec.noun
              ? `${fmt(table.rows.length, 'int')} ${table.rows.length === 1 ? spec.noun[0] : spec.noun[1]}`
              : drillNoun(spec.kind, table.rows.length)}
            {spec.subtitle ? ` · ${spec.subtitle}` : ''}
          </BDialog.Description>
          {spec.note && <p className="mt-1 max-w-[70ch] text-meta text-muted">{spec.note}</p>}
        </div>
        <Menu
          width={220}
          trigger={
            <Button icon={<IconDownload />} caret disabled={!table.rows.length}>
              Export
            </Button>
          }
          items={[
            { label: 'Download CSV', icon: <IconFile />, onSelect: () => void onCsv() },
            { label: 'Download Excel', icon: <IconFile />, onSelect: () => void onXlsx() },
            { label: 'Copy table', icon: <IconCopy />, onSelect: () => void onCopy() },
            ...(ctx.access.can('export:drill-spec')
              ? [{ label: 'Copy drill spec (JSON)', icon: <IconCopy />, onSelect: () => void onCopySpec() }]
              : []),
          ]}
        />
      </div>
      {lock && guarded.leftOut > 0 && (
        <p className="text-meta text-muted">{recordsLeftOut(guarded.leftOut, lock.managerName)}</p>
      )}
      {spec.filter && <FilterActions filter={spec.filter} filterLabel={spec.filterLabel} />}
      {spec.action && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              const run = spec.action?.run
              useDrillStore.getState().close()
              run?.()
            }}
          >
            {spec.action.label}
          </Button>
        </div>
      )}
      <RecordsSummary spec={spec} table={table} />
      {!ctx.showPay && spec.kind === 'comp' && (
        <p className="text-meta text-muted">
          Pay amounts are hidden. Switch on "Show pay amounts" in Settings or in Compensation to include them.
        </p>
      )}
      {!ctx.showImmigration && spec.kind === 'rightToWork' && (
        <p className="text-meta text-muted">
          Authorization types are hidden. Switch on "Show immigration details" in Settings, Privacy to include
          them for this session.
        </p>
      )}
      {(spec.kind === 'surveyGroups' || spec.kind === 'surveyResponses') && (
        <p className="text-meta text-muted">
          Survey results open as groups, never as one person's answers. Groups under the anonymity minimum
          show counts only.
        </p>
      )}
      {spec.kind === 'leaveGroups' && (
        <p className="text-meta text-muted">
          Leave numbers by reason open as groups, never as named people, so a leave reason is never shown
          beside a name. Groups under the anonymity minimum show no counts.
        </p>
      )}
      <DataTable
        columns={table.columns}
        rows={table.rows}
        search={table.rows.length > 8 ? 'Search these records' : false}
        maxRows={200}
        maxHeight={9999}
        rowKey={(r, i) => String(r[ROW_KEY] ?? i)}
        onRowClick={
          rowsOpen
            ? (r) => {
                const id = target(r)
                if (id) openPerson(id)
              }
            : undefined
        }
        rowClickable={(r) => !!target(r)}
        emptyText="No records behind this number."
        caption={spec.title}
        density="compact"
      />
      {hint && <p className="text-meta text-muted">{hint}</p>}
    </div>
  )
}

/**
 * Where a list of people concentrates: by department and by level, top five and Other, each bar
 * opening those records on top (Back returns). Shown for ten or more people; collapsible.
 */
function RecordsSummary({ spec, table }: { spec: DrillSpec; table: ReturnType<typeof buildDrillTable> }) {
  const ctx = useAnalytics()
  const [open, setOpen] = useState(true)
  const people = useMemo(
    () =>
      table.rows.map((r) => {
        const id = rowPerson(ctx, r)
        return id ? ctx.org.byId.get(id) : null
      }),
    [table, ctx],
  )
  const byDept = useMemo(() => summaryCut(people, 'department'), [people])
  const byLevel = useMemo(() => summaryCut(people, 'level'), [people])
  if (!showsSummary(byDept)) return null
  const subset = (label: string, rows: readonly number[]) =>
    pushDrill({ ...spec, title: `${spec.title}: ${label}`, rows: rows.map((i) => spec.rows[i]) } as DrillSpec)
  const cut = (id: string, title: string, column: string, groups: SummaryGroup[]) => (
    <Figure
      id={id}
      title={title}
      variant="compact"
      data={groups.map((g) => ({ group: g.label, records: g.count }))}
      columns={[
        { key: 'group', label: column },
        { key: 'records', label: 'Records', format: 'int' },
      ]}
      span={6}
      gate={false}
    >
      <BarList
        data={groups}
        label="label"
        value="count"
        top={5}
        rowHeight={24}
        onSelect={(g) => subset(g.label, g.rows)}
        onSelectOther={(rest) =>
          subset(
            'other groups',
            rest.flatMap((g) => g.rows),
          )
        }
        ariaLabel={`${spec.title}, ${title.toLowerCase()}`}
      />
    </Figure>
  )
  return (
    <section aria-label="Summary" className="border-y border-rule py-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="-ml-1 inline-flex items-center gap-1 rounded-control px-1 py-0.5 text-small font-medium text-ink-2 hover:bg-hover hover:text-ink"
      >
        {open ? <IconChevronDown className="size-3.5" /> : <IconChevronRight className="size-3.5" />}
        Summary
        <span className="font-normal text-muted">
          {fmt(byDept.people, 'int')} {byDept.people === 1 ? 'person' : 'people'}
          {byDept.unnamed ? `, ${fmt(byDept.unnamed, 'int')} rows name nobody` : ''}
        </span>
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-12">
          {cut('drill-summary-department', 'By department', 'Department', byDept.groups)}
          {cut('drill-summary-level', 'By level', 'Level', byLevel.groups)}
        </div>
      )}
    </section>
  )
}
