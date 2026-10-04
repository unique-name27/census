/**
 * Settings → Formulas: a read-only index of every calculation Census runs, built from the metric
 * dictionary in force (`ctx.metrics`), so it follows every edit. Views in folder-tab order open to
 * their groups and metrics; each metric opens to its unit, target, settings, the fields it reads
 * and what changed from the default. Search and filters show matches across every view. One
 * formula copies as text, and the whole index downloads as an Excel workbook or a CSV. Editing
 * stays in one place, Metric definitions in the Data room; every metric links there.
 */
import { type MouseEvent, useId, useMemo, useState } from 'react'
import { IconChevronRight, IconCopy, IconDownload, IconSearch } from '@/components/icons'
import { MedalGlyph } from '@/components/tier/TierBadge'
import { toast } from '@/components/toast'
import { Button, cx, Menu } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { writeClipboard } from '@/lib/export/clipboard'
import { METRIC_VIEW_LABEL } from '@/metrics/registry'
import { metricHref, openMetricDefinition } from '@/views/data/metrics/open'
import { Select } from '@/views/data/ui/Select'
import {
  countText,
  type FormulaFilters,
  type FormulaRow,
  type FormulaSection,
  type FormulaSectionRows,
  filterRows,
  formulaIndexMeta,
  formulaIndexTable,
  formulaRows,
  formulaText,
  groupFormulaRows,
  isFiltered,
  NO_FORMULA_FILTERS,
  viewOptions,
} from './formulaIndex'
import { INPUT, LINK, SettingsBlock } from './ui'

function FilterToggle({
  pressed,
  onChange,
  children,
}: {
  pressed: boolean
  onChange: (v: boolean) => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cx(
        'inline-flex h-7 items-center rounded-control px-2.5 text-[12px] font-medium transition-colors',
        pressed
          ? 'bg-ink text-on-ink hover:bg-ink-2'
          : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--rule-strong)] hover:bg-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

const Chevron = ({ open }: { open: boolean }) => (
  <IconChevronRight
    aria-hidden="true"
    className={cx(
      'mt-0.5 size-3.5 shrink-0 text-muted transition-transform duration-100',
      open && 'rotate-90',
    )}
  />
)

async function copyFormula(row: FormulaRow) {
  try {
    await writeClipboard(formulaText(row))
    toast('Formula copied', { tone: 'good', description: row.name })
  } catch {
    toast('The formula could not be copied. Select the text and copy it instead.', { tone: 'critical' })
  }
}

function Details({ row, id }: { row: FormulaRow; id: string }) {
  const term = 'text-muted sm:pt-px'
  const desc = 'mb-1.5 min-w-0 text-ink sm:mb-0'
  return (
    <div id={id} className="pb-3 pl-7.5 pr-2">
      <dl className="grid grid-cols-1 gap-x-3 text-[12px] leading-snug sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-y-1.5">
        <dt className={term}>ID</dt>
        <dd className={cx(desc, 'font-mono break-all')}>{row.id}</dd>
        <dt className={term}>Unit</dt>
        <dd className={desc}>{row.unit}</dd>
        <dt className={term}>Target</dt>
        <dd className={desc}>{row.target ?? 'No target'}</dd>
        <dt className={term}>Shown in</dt>
        <dd className={desc}>{row.viewsText}</dd>
        <dt className={term}>Settings</dt>
        <dd className={desc}>
          {row.settings.length ? (
            <ul className="flex flex-col gap-0.5">
              {row.settings.map((s) => (
                <li key={`${s.metricId}.${s.key}`}>
                  {s.label}
                  {s.from && <span className="text-muted"> ({s.from})</span>}:{' '}
                  <span className="font-medium">{s.value}</span>
                  {s.changed && <span className="text-muted"> · default {s.defaultValue}</span>}
                </li>
              ))}
            </ul>
          ) : (
            'None'
          )}
        </dd>
        <dt className={term}>Data read</dt>
        <dd className={desc}>
          {row.readsNoData ? (
            'Reads no data'
          ) : row.fields.length ? (
            <ul className="flex flex-col gap-0.5">
              {row.fields.map((f) => (
                <li key={f.ref} className="flex items-start gap-1.5">
                  <MedalGlyph tier={f.tier} className="mt-px size-3" />
                  <span className="min-w-0">
                    {f.label} <span className="text-muted">{f.tierText}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            'The datasets of its view'
          )}
        </dd>
        <dt className={term}>Changed from default</dt>
        <dd className={desc}>{row.changedText ?? 'No'}</dd>
      </dl>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Button
          size="sm"
          variant="ghost"
          className="-ml-2.5"
          icon={<IconCopy />}
          disabled={!row.formula}
          onClick={() => void copyFormula(row)}
        >
          Copy formula
        </Button>
        <a
          href={metricHref(row.id)}
          className={LINK}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
            e.preventDefault()
            openMetricDefinition(row.id)
          }}
        >
          Open in Metric definitions
          <IconChevronRight aria-hidden="true" className="size-3.5" />
        </a>
      </div>
    </div>
  )
}

function Item({ row, open, onToggle }: { row: FormulaRow; open: boolean; onToggle: () => void }) {
  const id = useId()
  const line = cx('block text-[12px] leading-snug text-muted', !open && 'truncate')
  return (
    <li className="border-t border-rule first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={onToggle}
        className="flex w-full items-start gap-2 rounded-control px-2 py-2 text-left transition-colors hover:bg-hover"
      >
        <Chevron open={open} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[13px] leading-snug font-semibold text-ink">{row.name}</span>
            {row.changed && (
              <span className="inline-flex h-4 items-center rounded-[3px] bg-warning-wash px-1 text-[11px] font-semibold text-ink">
                Changed from default
              </span>
            )}
          </span>
          <span className={cx('block text-[13px] leading-snug', row.formula ? 'text-ink-2' : 'text-muted')}>
            {row.formula ?? 'No formula recorded'}
          </span>
          {row.population && (
            <span className={line}>
              <span className="text-ink-2">Population:</span> {row.population}
            </span>
          )}
          {row.window && (
            <span className={line}>
              <span className="text-ink-2">Window:</span> {row.window}
            </span>
          )}
        </span>
      </button>
      {open && <Details row={row} id={id} />}
    </li>
  )
}

function SectionList({
  section,
  filtered,
  open,
  onToggle,
  openRows,
  toggleRow,
}: {
  section: FormulaSectionRows
  /** While searching or filtering, every section with a match shows its matches. */
  filtered: boolean
  open: boolean
  onToggle: () => void
  openRows: ReadonlySet<string>
  toggleRow: (id: string) => void
}) {
  const id = useId()
  const shown = filtered || open
  const count = (
    <span className="tnum text-[12px] font-normal text-muted">
      {section.count}
      <span className="sr-only"> {section.count === 1 ? 'metric' : 'metrics'}</span>
    </span>
  )
  return (
    <section aria-label={section.label} className="border-t border-rule first:border-t-0">
      <h3>
        {filtered ? (
          <span className="flex items-baseline gap-2 px-2 pt-3 pb-1">
            <span className="cut-head text-[15px] font-semibold text-ink">{section.label}</span>
            {count}
          </span>
        ) : (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? id : undefined}
            onClick={onToggle}
            className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-left transition-colors hover:bg-hover"
          >
            <Chevron open={open} />
            <span className="cut-head flex-1 text-[15px] font-semibold text-ink">{section.label}</span>
            {count}
          </button>
        )}
      </h3>
      {shown && (
        <div id={id} className="pb-2">
          {section.groups.map((g) => (
            <div key={g.key}>
              <h4 className="eyebrow px-2 pt-2 pb-0.5">
                {g.label} <span className="font-normal text-muted">{g.rows.length}</span>
              </h4>
              <ul>
                {g.rows.map((r) => (
                  <Item key={r.id} row={r} open={openRows.has(r.id)} onToggle={() => toggleRow(r.id)} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const toggled = <T,>(set: ReadonlySet<T>, v: T): ReadonlySet<T> => {
  const next = new Set(set)
  if (!next.delete(v)) next.add(v)
  return next
}

export function FormulasSection() {
  const ctx = useAnalytics()
  const rows = useMemo(() => formulaRows(ctx.metrics, ctx.quality), [ctx.metrics, ctx.quality])
  const [filters, setFilters] = useState<FormulaFilters>(NO_FORMULA_FILTERS)
  const [openSections, setOpenSections] = useState<ReadonlySet<FormulaSection>>(() => new Set())
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const shown = filterRows(rows, filters)
  const sections = groupFormulaRows(shown)
  const filtered = isFiltered(filters)
  const views = viewOptions(rows)
  const count = countText(shown.length, rows.length)

  const meta = () =>
    formulaIndexMeta({
      asOf: ctx.asOf,
      isSample: ctx.isSample,
      company: ctx.isSample ? SAMPLE_COMPANY : 'Company data',
      standard: ctx.standard,
    })
  const done = (what: string) =>
    toast('Formula index downloaded', {
      tone: 'good',
      description: `${countText(rows.length, rows.length)}, ${what}`,
    })
  const failed = (err: unknown) => {
    console.error('The formula index could not be exported', err)
    toast('The formula index could not be exported. Try again.', { tone: 'critical' })
  }
  // The export library loads on demand, as everywhere else in the app.
  const download = async (kind: 'xlsx' | 'csv') => {
    setBusy(true)
    try {
      const lib = await import('@/lib/export')
      const table = formulaIndexTable(rows)
      if (kind === 'xlsx') await lib.downloadXlsx([table], meta(), { showPay: ctx.showPay })
      else lib.downloadCsv(table, meta(), { showPay: ctx.showPay })
      done(kind === 'xlsx' ? 'Excel workbook' : 'CSV')
    } catch (err) {
      failed(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsBlock
      section="formulas"
      intro="How Census calculates each number, from the metric definitions in force, so it follows every change. Change a formula, target or setting in Metric definitions in the Data room."
    >
      <div className="flex flex-col gap-2">
        <label className="relative flex items-center">
          <IconSearch
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 size-3.5 text-muted"
          />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            placeholder="Search names, formulas, fields and settings"
            aria-label="Search formulas"
            className={cx(INPUT, 'w-full pl-8')}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="View"
            value={filters.view}
            onChange={(v) => setFilters({ ...filters, view: v as FormulaFilters['view'] })}
            className="w-[150px]"
          >
            <option value="all">All views</option>
            {views.map((v) => (
              <option key={v} value={v}>
                {METRIC_VIEW_LABEL[v]}
              </option>
            ))}
          </Select>
          <FilterToggle pressed={filters.changed} onChange={(changed) => setFilters({ ...filters, changed })}>
            Changed only
          </FilterToggle>
          <FilterToggle pressed={filters.target} onChange={(target) => setFilters({ ...filters, target })}>
            Has a target
          </FilterToggle>
          {filtered && (
            <Button size="sm" variant="ghost" onClick={() => setFilters(NO_FORMULA_FILTERS)}>
              Clear
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-muted" aria-live="polite">
            {count}
          </p>
          <Menu
            align="end"
            width={220}
            trigger={
              <Button size="sm" icon={<IconDownload />} caret disabled={busy}>
                {busy ? 'Preparing…' : 'Export index'}
              </Button>
            }
            items={[
              { heading: 'Whole index' },
              { label: 'Excel workbook', hint: '.xlsx', onSelect: () => void download('xlsx') },
              { label: 'CSV', hint: '.csv', onSelect: () => void download('csv') },
            ]}
          />
        </div>
      </div>
      <div className="-mx-2 -mt-2">
        {sections.length === 0 ? (
          <p className="px-2 py-4 text-[13px] text-ink-2">
            No metric matches these filters.{' '}
            <button type="button" className={LINK} onClick={() => setFilters(NO_FORMULA_FILTERS)}>
              Clear the filters
            </button>
          </p>
        ) : (
          sections.map((s) => (
            <SectionList
              key={s.key}
              section={s}
              filtered={filtered}
              open={openSections.has(s.key)}
              onToggle={() => setOpenSections((prev) => toggled(prev, s.key))}
              openRows={openRows}
              toggleRow={(id) => setOpenRows((prev) => toggled(prev, id))}
            />
          ))
        )}
      </div>
    </SettingsBlock>
  )
}
