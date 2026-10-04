/**
 * Pure helpers for the "whole view, all tabs" export: tab groups with collision-free figure ids,
 * a render fingerprint to know when an off-screen tab has finished drawing, and the toast copy.
 */
import type { RegisteredFigure } from '@/charts/types'
import type { FigureGroup } from '@/lib/export/view'
import { plural } from '@/lib/format'
import type { ViewTab } from '@/views/types'

export type ExportKind = 'workbook' | 'deck'

/** The "tab" a whole-view export names on its title slide, Summary sheet and file name. */
export const WHOLE_VIEW_LABEL = 'All tabs'

/** Every tab registers its own "key-figures" and "readout"; the tab key keeps ids unique across tabs. */
export const tabFigureId = (tabKey: string, id: string) => `${tabKey}:${id}`

/** A tab's registered figures as an export group, ids prefixed with the tab key. */
export function tabFigureGroup(tab: ViewTab, figures: readonly RegisteredFigure[]): FigureGroup {
  return {
    key: tab.key,
    label: tab.label,
    figures: figures.map((f) => ({ ...f, id: tabFigureId(tab.key, f.id) })),
  }
}

/**
 * What a tab has drawn so far: its figure ids and, per figure, whether the chart SVG exists and
 * how many marks it holds. Unchanged across two checks means the tab has settled.
 */
export function renderSignature(figures: readonly RegisteredFigure[]): string {
  return figures
    .map((f) => {
      const svg = f.getSvg()
      return `${f.id}:${f.rows.length}:${svg ? svg.getElementsByTagName('*').length : '-'}`
    })
    .join('|')
}

export interface ToastCopy {
  title: string
  description: string
}

const noun = (kind: ExportKind) => (kind === 'workbook' ? 'workbook' : 'slides')

/** Progress while each tab is laid out off screen. */
export function layoutProgress(viewLabel: string, tab: ViewTab, index: number, total: number): ToastCopy {
  return {
    title: `Exporting every tab of ${viewLabel}`,
    description: `Laying out ${tab.label} (${index + 1} of ${total}).`,
  }
}

/** Progress once the tabs are laid out: images, then the file. */
export function writeProgress(kind: ExportKind, step: 'images' | 'file', figures: number): ToastCopy {
  return {
    title: step === 'images' ? 'Drawing the charts' : `Writing the ${noun(kind)}`,
    description: `${plural(figures, 'figure')} so far.`,
  }
}

/** The closing toast: what went into the file and anything left out. */
export function wholeViewDone(args: {
  kind: ExportKind
  viewLabel: string
  groups: readonly FigureGroup[]
  failed: readonly ViewTab[]
  payDropped: boolean
}): ToastCopy {
  const figures = args.groups.reduce((n, g) => n + g.figures.length, 0)
  const tabs = args.groups.filter((g) => g.figures.length).length
  const parts = [`${plural(figures, 'figure')} from ${plural(tabs, 'tab')} of ${args.viewLabel}.`]
  if (args.failed.length)
    parts.push(
      `${args.failed.map((t) => t.label).join(', ')} could not be drawn and ${
        args.failed.length === 1 ? 'was' : 'were'
      } left out.`,
    )
  if (args.payDropped) parts.push('Pay amounts were left out.')
  return {
    title: args.kind === 'workbook' ? 'Workbook downloaded' : 'Slides downloaded',
    description: parts.join(' '),
  }
}

/** Whether any exported figure carries a pay column that was dropped. */
export function payDropped(groups: readonly FigureGroup[], showPay: boolean): boolean {
  return !showPay && groups.some((g) => g.figures.some((f) => f.columns.some((c) => c.pay)))
}
