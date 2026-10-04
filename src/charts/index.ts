/**
 * Charts: `import { Figure, BarList, Lines, DataTable, useChartTheme, … } from '@/charts'`.
 * Every chart is rendered inside a <Figure>, which supplies the title, table view, definitions
 * and exports. The building blocks (PlotChart, housePlot, axis helpers, labelsMark, colors)
 * are exported for custom visuals that still sit inside a Figure.
 */
export {
  divergingScale,
  inkOn,
  isStatusTone,
  luminance,
  seqStops,
  sequentialScale,
  toneColor,
} from './core/color'
export { LEGEND_ATTR, type LegendShape, type LegendSpec, type LegendSwatch } from './core/legend'
export {
  glyphForTone,
  glyphPath,
  HOVER_CLASS,
  hoverBand,
  labelsMark,
  type PixelLabel,
  refRule,
  scalePos,
  type TextPart,
} from './core/marks'
export { maxTextWidth, textWidth, truncateText, useFontsVersion } from './core/measure'
export { placeTip, renderTip, TIP_CLASS, type TipContent, type TipRow } from './core/tooltip'
export { DataTable, type DataTableProps, type SortState } from './DataTable'
export {
  Figure,
  type FigureDetail,
  type FigureProps,
  type FigureSpan,
  type FigureTableOptions,
} from './Figure'
export { BarList, type BarListProps } from './kit/BarList'
export { Columns, type ColumnsProps } from './kit/Columns'
export { DotStrip, type DotStripProps } from './kit/DotStrip'
export { HBars, type HBarsProps } from './kit/HBars'
export { Heatmap, type HeatmapProps } from './kit/Heatmap'
export { Histogram, type HistogramProps } from './kit/Histogram'
export { Lines, type LinesProps } from './kit/Lines'
export { Meter, type MeterProps } from './kit/Meter'
export { type BarRow, type Category, type FoldRule, type HistogramBin, quarterLabel } from './kit/prepare'
export { RangeBars, type RangeBarsProps, type RangeMarker } from './kit/RangeBars'
export { Scatter, type ScatterProps } from './kit/Scatter'
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
  tickFormat,
} from './plot'
export { FigureRegistryProvider, nextFigureOrder, useFigureRegistry } from './registry'
export { Sparkline } from './Sparkline'
export { type ChartTheme, readChartTheme, seriesColor, useChartTheme } from './theme'
export type { Column, Definition, ExportMeta, RegisteredFigure, RowFormat } from './types'
export { useExportMeta } from './useExportMeta'
