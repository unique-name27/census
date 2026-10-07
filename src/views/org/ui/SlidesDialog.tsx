/**
 * "Org slides": pick leaders and how deep to go, then download a PowerPoint deck with one slide per
 * leader showing their direct org (the old tool's slide builder, as editable shapes).
 */
import { useState } from 'react'
import { useExportMeta } from '@/charts'
import { Button, Dialog, MultiSelect, Segmented, Switch, toast, useTierGate } from '@/components'
import { useAnalytics } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { fileStem } from '@/lib/export/names'
import { plural } from '@/lib/format'
import { type ColorScheme, colorScheme, type OrgTree, planSlides, type ReqStub, subtreeOf } from '../engine'

export function SlidesDialog({
  open,
  onOpenChange,
  tree,
  rootId,
  leaders,
  onLeadersChange,
  scheme,
  reqs,
  reqByCardId,
  uses,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tree: OrgTree
  rootId: string
  leaders: string[]
  onLeadersChange: (ids: string[]) => void
  scheme: ColorScheme
  reqs?: ReadonlyMap<string, readonly ReqStub[]>
  reqByCardId: ReadonlyMap<string, ReqStub>
  /** The org chart figure's fields, so the deck states the chart's tier as the figure does. */
  uses?: readonly FieldRef[]
}) {
  const ctx = useAnalytics()
  const meta = useExportMeta()
  const gate = useTierGate(uses)
  const [levels, setLevels] = useState<'1' | '2'>('1')
  const [useColor, setUseColor] = useState(scheme.by !== 'none')
  const [busy, setBusy] = useState(false)

  const options = subtreeOf(tree, rootId)
    .filter((id) => (tree.directs.get(id) ?? 0) > 0)
    .sort((a, b) => (tree.total.get(b) ?? 0) - (tree.total.get(a) ?? 0))
    .map((id) => {
      const e = tree.people.get(id)!
      return { value: id, label: `${e.name} · ${e.jobTitle}`, count: tree.total.get(id) ?? 0 }
    })
  const valid = leaders.filter((id) => tree.people.has(id) && (tree.directs.get(id) ?? 0) > 0)

  const download = async () => {
    setBusy(true)
    try {
      const sch = useColor ? scheme : colorScheme('none', [], ctx.asOf)
      const plans = planSlides(tree, valid, {
        levels: levels === '2' ? 2 : 1,
        scheme: sch,
        reqs,
        reqByCardId,
        asOf: ctx.asOf,
      })
      const { downloadOrgSlides } = await import('./exportSlides')
      await downloadOrgSlides(plans, meta, {
        fileName: fileStem(meta, 'org-slides'),
        legend: useColor ? sch.legend.map((k) => ({ label: k.label, swatch: k.swatch })) : [],
        data: { tier: gate?.tier, withheld: !!gate && !gate.shown },
      })
      const fell = plans.filter((p) => p.levels === 1 && levels === '2').length
      toast(`Downloaded ${plural(plans.length, 'slide')}`, {
        tone: 'good',
        description: fell
          ? `${plural(fell, 'slide shows', 'slides show')} direct reports only, to stay readable.`
          : undefined,
      })
      onOpenChange(false)
    } catch (err) {
      console.error('Org slides export failed', err)
      toast('The slides could not be created. Try again.', { tone: 'critical' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Org slides"
      description="One slide per leader with their direct org, as editable PowerPoint shapes. Open roles are included when they are shown on the chart."
      width={560}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!valid.length || busy} onClick={() => void download()}>
            {busy ? 'Building…' : `Download ${plural(valid.length, 'slide')}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-small">
        <div>
          <div className="eyebrow mb-1.5">Leaders</div>
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelect
              label="Leaders"
              options={options}
              value={valid}
              onChange={onLeadersChange}
              searchPlaceholder="Search people leaders"
              width={420}
            />
            <span className="text-ink-2">
              {valid.length ? `${plural(valid.length, 'leader')} selected` : 'Pick at least one leader'}
            </span>
          </div>
          {valid.length > 0 && (
            <p className="mt-2 text-meta leading-snug text-muted">
              {valid
                .slice(0, 6)
                .map((id) => tree.people.get(id)!.name)
                .join(', ')}
              {valid.length > 6 ? ` and ${valid.length - 6} more` : ''}
            </p>
          )}
        </div>
        <div>
          <div className="eyebrow mb-1.5">Levels on each slide</div>
          <Segmented<'1' | '2'>
            label="Levels on each slide"
            value={levels}
            onChange={setLevels}
            size="md"
            options={[
              { value: '1', label: 'Direct reports' },
              { value: '2', label: 'Two levels' },
            ]}
          />
          <p className="mt-1.5 text-meta text-muted">
            Two levels adds each direct report's team when it still reads at slide size.
          </p>
        </div>
        <Switch
          checked={useColor}
          onChange={setUseColor}
          label={scheme.by === 'none' ? 'Color key (off on the chart)' : "Use the chart's color key"}
        />
      </div>
    </Dialog>
  )
}
