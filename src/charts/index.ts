/**
 * Charts: `import { Figure, BarList, Lines, DataTable, useChartTheme, … } from '@/charts'`.
 * Every chart is rendered inside a <Figure>, which supplies the title, table view, definitions
 * and exports. The building blocks (PlotChart, housePlot, axis helpers, labelsMark, colors)
 * are exported for custom visuals that still sit inside a Figure.
 */

export { groupFilter, periodFilter } from '@/drill/filter'
export { type CellAction, cellAction, safeHref } from './cells'
export {
  divergingScale,
  inkOn,
  isStatusTone,
  luminance,
  seqStops,
  sequentialScale,
  toneColor,
} from './core/color'
export { focusBox, isStepKey, type KeyPoint, readingOrder, stepKey } from './core/keyboard'
export { LEGEND_ATTR, type LegendShape, type LegendSpec, type LegendSwatch, medalPath } from './core/legend'
export {
  glyphForTone,
  glyphPath,
  HOVER_CLASS,
  hoverBand,
  labelsMark,
  noteMark,
  type PixelLabel,
  refRule,
  scalePos,
  type TextPart,
} from './core/marks'
export { maxTextWidth, textWidth, truncateText, useFontsVersion } from './core/measure'
export {
  type Box,
  type ChartNote,
  lineBoxes,
  MAX_NOTES,
  type NoteAnchor,
  placeNotes,
  pointBoxes,
  shortNote,
} from './core/notes'
export { placeTip, renderTip, TIP_CLASS, type TipContent, type TipRow } from './core/tooltip'
export { DataTable, type DataTableProps, type SortState } from './DataTable'
export {
  Figure,
  type FigureDetail,
  type FigureProps,
  type FigureSpan,
  type FigureTableOptions,
} from './Figure'
export { FIGURE_VIEW_EVENT } from './figureView'
export { BAR_LIST_FOLD, BarList, type BarListProps } from './kit/BarList'
export { BulletList, type BulletListProps, type BulletStatus } from './kit/BulletList'
export { type BulletRow, bulletLayout, type SplitSegment, splitSegments } from './kit/bulletModel'
export { Columns, type ColumnsProps } from './kit/Columns'
export { DotStrip, type DotStripProps } from './kit/DotStrip'
export { byGroup, type GroupOf, selectGroup, withFilter } from './kit/groupDrill'
export { HBars, type HBarsProps } from './kit/HBars'
export { Heatmap, type HeatmapProps } from './kit/Heatmap'
export { Histogram, type HistogramProps } from './kit/Histogram'
export { clearOfRules, type GroupLayout, groupIndexAt, groupLayout, nearestBy, segmentAt } from './kit/hit'
export { Lines, type LinesProps } from './kit/Lines'
export { Meter, type MeterProps } from './kit/Meter'
export {
  Pyramid,
  type PyramidColumn,
  type PyramidGroupIn,
  type PyramidProps,
  type PyramidSegmentIn,
} from './kit/Pyramid'
export { type BarRow, type Category, type FoldRule, type HistogramBin, quarterLabel } from './kit/prepare'
export { RangeBars, type RangeBarsProps, type RangeMarker } from './kit/RangeBars'
export { Scatter, type ScatterProps } from './kit/Scatter'
export { SPLIT_ORDER, SPLIT_WORD, type SplitKey, StatusSplit, type StatusSplitProps } from './kit/StatusSplit'
export { type NumericAxis, numericAxis } from './kit/scale'
export {
  isOtherSeries,
  ordinalColors,
  otherLast,
  type SeriesColors,
  type SeriesScheme,
  seriesPalette,
} from './kit/series'
export type { ChartBaseProps, Key, RefLine, Tone } from './kit/shared'
export {
  TREND_GRID_COLUMNS,
  TrendGrid,
  type TrendGridProps,
  type TrendRow,
  type TrendSeries,
  trendGridRows,
} from './kit/TrendGrid'
export { periodLabel, trendGridLayout } from './kit/trendModel'
export { Legend } from './Legend'
export {
  axisX,
  axisY,
  baseline,
  gridX,
  gridY,
  housePlot,
  type PlotBuildContext,
  PlotChart,
  type PlotChartProps,
  type PlotElement,
  type PlotPointer,
  plotBand,
  plotPos,
  tickFormat,
} from './plot'
export { FigureRegistryProvider, FigureSection, nextFigureOrder, useFigureRegistry } from './registry'
export { Sparkline } from './Sparkline'
export { type ChartTheme, readChartTheme, seriesColor, useChartTheme } from './theme'
export type { Column, Definition, ExportMeta, ExportSection, RegisteredFigure, RowFormat } from './types'
export { useExportMeta } from './useExportMeta'
