/**
 * Controls shared by the chart and the sandbox: how many levels to open, the color key with its
 * legend, and the breadcrumb from the top of the company down to the chart's root.
 */
import { Legend } from '@/charts'
import { Button, IconChevronRight, Menu, type MenuItem, Segmented } from '@/components'
import { cx } from '@/components/ui'
import {
  COLOR_BY_LABELS,
  COLOR_BY_OPTIONS,
  COMPANY_ROOT,
  type ColorBy,
  type ColorScheme,
  chainTo,
  type LayerGate,
  type LevelsPreset,
  type OrgTree,
  swatchCss,
} from '../engine'

export function LevelsControl({
  value,
  onChange,
}: {
  value: LevelsPreset
  onChange: (v: LevelsPreset) => void
}) {
  return (
    <Segmented<LevelsPreset>
      label="Levels shown"
      value={value}
      onChange={onChange}
      options={[
        { value: '2', label: '2 levels' },
        { value: '3', label: '3' },
        { value: '4', label: '4' },
        { value: 'all', label: 'All' },
      ]}
    />
  )
}

/**
 * The color key menu. Keys whose field has no data, or is below the data standard, are listed but
 * cannot be picked; the hint says why.
 */
export function ColorControl({
  value,
  onChange,
  gates,
}: {
  value: ColorBy
  onChange: (v: ColorBy) => void
  gates?: Record<ColorBy, LayerGate>
}) {
  const items: MenuItem[] = [
    { heading: 'Color the top edge by' },
    ...COLOR_BY_OPTIONS.map((c) => {
      const off = gates && !gates[c].ok
      return {
        label: COLOR_BY_LABELS[c],
        onSelect: () => onChange(c),
        icon: c === value ? <span className="size-1.5 rounded-full bg-ink" /> : undefined,
        disabled: off,
        hint: off ? (gates[c].noData ? 'No data' : 'Below standard') : undefined,
      }
    }),
  ]
  return (
    <Menu
      align="start"
      width={220}
      items={items}
      trigger={
        <Button size="sm" caret aria-label={`Color by: ${COLOR_BY_LABELS[value]}`}>
          <span className="font-normal text-muted">Color</span>
          <span className="text-ink">{COLOR_BY_LABELS[value]}</span>
        </Button>
      }
    />
  )
}

export function ColorLegend({ scheme, className }: { scheme: ColorScheme; className?: string }) {
  if (!scheme.legend.length) return null
  return (
    <Legend
      className={cx('min-w-0', className)}
      spec={{
        kind: 'swatch',
        items: scheme.legend.map((k) => ({ label: k.label, color: swatchCss(k.swatch) })),
      }}
    />
  )
}

/**
 * The chain from the top of the company to the chart's root. Names above the global leader filter
 * widen that filter; names between it and a local focus move the focus.
 */
export function RootTrail({
  tree,
  rootId,
  globalRootId,
  onFocus,
  onWiden,
}: {
  tree: OrgTree
  rootId: string
  globalRootId: string
  onFocus: (id: string | null) => void
  onWiden: (id: string | null) => void
}) {
  if (rootId === tree.rootId) return null
  const chain = chainTo(tree, rootId)
  const aboveGlobal = new Set(chainTo(tree, globalRootId).slice(0, -1))
  const top = tree.rootId === COMPANY_ROOT ? [{ id: COMPANY_ROOT, name: 'Whole company' }] : []
  const steps = [...top, ...chain.map((id) => ({ id, name: tree.people.get(id)?.name ?? id }))]
  return (
    <nav aria-label="Chart root" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[12px]">
        {steps.map((s, i) => {
          const last = i === steps.length - 1
          const widen = s.id === COMPANY_ROOT || aboveGlobal.has(s.id)
          return (
            <li key={s.id} className="flex items-center gap-1">
              {last ? (
                <span aria-current="location" className="font-semibold text-ink">
                  {s.name}
                </span>
              ) : (
                <button
                  type="button"
                  className="text-link hover:underline"
                  title={widen ? 'Widens the leader filter for every view' : undefined}
                  onClick={() =>
                    widen
                      ? onWiden(s.id === COMPANY_ROOT || s.id === tree.rootId ? null : s.id)
                      : onFocus(s.id === globalRootId ? null : s.id)
                  }
                >
                  {s.name}
                </button>
              )}
              {!last && <IconChevronRight className="size-3 text-muted" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
